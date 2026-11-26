"""
Bob Offline Pipeline (Wave 1) — everything expensive happens here, offline.

1. Download MSMARCO-XI (streaming, validation split) + validate
2. Deduplicate passages; keep language translation links via metadata
3. Hierarchical chunking: parent=512w semantic blocks, child=64w sliding window
4. LanceDB: vector index (children embedded) + native FTS/BM25 on child text
5. manifest.json with versions, counts, dims, corpus hash

Run: venv/Scripts/python.exe scripts/offline_pipeline.py [--max-docs 500] [--rebuild]
"""
import sys
import json
import hashlib
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

DATA = ROOT / "data"
CORPUS = DATA / "corpus.jsonl"
LANCEDB_DIR = DATA / "lancedb"
MANIFEST = DATA / "manifest.json"

PARENT_WORDS = 512
CHILD_WORDS = 64
CHILD_STRIDE = 48          # 16-word overlap
EMBED_MODEL = "all-MiniLM-L6-v2"   # must match backend config EMBEDDING_MODEL


def log(msg):
    print(f"[offline] {msg}", flush=True)


def download_corpus(max_docs: int) -> None:
    """Fetch MSMARCO-XI validation split streaming; dedupe by passage text."""
    if CORPUS.exists() and CORPUS.stat().st_size > 1000:
        log(f"corpus exists ({CORPUS.stat().st_size} bytes) — skipping download")
        return
    from datasets import load_dataset
    log("downloading ai4bharat/MSMARCO-XI ...")
    ds = load_dataset("ai4bharat/MSMARCO-XI", split="validation", streaming=True)
    docs, seen = [], set()
    for row in ds:
        passages = row.get("passages") or {}
        english = passages.get("English_passages") or []
        translated = passages.get("Translated_passages") or []
        lang = (passages.get("target_lang") or
                row.get("target_lang") or "unknown")
        base_id = row.get("id") or row.get("query_id") or str(len(docs))
        pid = row.get("passage_id") or base_id
        for t in english:
            key = hashlib.sha256(t.strip().lower().encode()).hexdigest()[:16]
            if t.strip() and key not in seen:
                seen.add(key)
                docs.append({"id": f"doc_{len(docs)}", "text": t,
                             "metadata": {"source": "msmarco-xi", "lang": "en",
                                          "passage_id": str(pid)}})
                if len(docs) >= max_docs:
                    break
        for i, t in enumerate(translated):
            key = hashlib.sha256(t.strip().lower().encode()).hexdigest()[:16]
            if t.strip() and key not in seen:
                seen.add(key)
                docs.append({"id": f"doc_{len(docs)}", "text": t,
                             "metadata": {"source": "msmarco-xi", "lang": str(lang),
                                          "passage_id": str(pid),
                                          "translation_id": f"{pid}_t{i}"}})
            if len(docs) >= max_docs:
                break
        if len(docs) >= max_docs:
            break
    with open(CORPUS, "w", encoding="utf-8") as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    log(f"wrote {len(docs)} deduped docs -> {CORPUS.name}")


def split_words(text: str, size: int, stride: int):
    words = text.split()
    out, i = [], 0
    while i < len(words):
        chunk = " ".join(words[i:i + size])
        if chunk:
            out.append(chunk)
        i += stride if len(words) > size else size
        if stride >= size or i >= len(words):
            break
    return out or ([text] if text else [])


def build_lancedb(rebuild=False):
    import lancedb
    import pyarrow as pa
    import numpy as np
    from sentence_transformers import SentenceTransformer

    rows = []
    with open(CORPUS, encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            raw = line.strip()
            if not raw:
                continue
            try:
                doc = json.loads(raw)
            except json.JSONDecodeError as exc:
                log(f"Skipping malformed JSON on line {line_no}: {exc}")
                continue
            parents = split_words(doc["text"], PARENT_WORDS, PARENT_WORDS)
            for pi, parent in enumerate(parents):
                children = split_words(parent, CHILD_WORDS, CHILD_STRIDE)
                for ci, child in enumerate(children):
                    rows.append({
                        "child_id": f"{doc['id']}_p{pi}_c{ci}",
                        "parent_id": f"{doc['id']}_p{pi}",
                        "doc_id": doc["id"],
                        "text": child,               # embedded (search unit)
                        "parent_text": parent[:4000], # returned to LLM
                        "metadata": json.dumps(doc["metadata"], ensure_ascii=False),
                    })
    log(f"{len(rows)} child chunks from corpus")

    model = SentenceTransformer(EMBED_MODEL)
    log("embedding children...")
    vecs = model.encode([r["text"] for r in rows], batch_size=64,
                        show_progress_bar=True, convert_to_numpy=True)

    db = lancedb.connect(str(LANCEDB_DIR))
    if rebuild and "chunks" in db.table_names():
        db.drop_table("chunks")
    schema = pa.schema([
        ("child_id", pa.string()), ("parent_id", pa.string()),
        ("doc_id", pa.string()), ("text", pa.string()),
        ("parent_text", pa.string()), ("metadata", pa.string()),
        ("vector", pa.list_(pa.float32(), vecs.shape[1])),
    ])
    if "chunks" in db.table_names():
        tbl = db.open_table("chunks")
        tbl.delete("true")  # full refresh
    else:
        tbl = db.create_table("chunks", schema=schema)
    tbl.add([{**r, "vector": v.tolist()} for r, v in zip(rows, vecs)])

    # Vector index: IVF_HNSW_SQ when supported, graceful fallback
    idx_note = "flat(default)"
    try:
        num_p = max(1, min(256, len(rows) // 64))
        tbl.create_index(metric="cosine",
                         vector_column_name="vector",
                         index_type="IVF_HNSW_SQ",
                         num_partitions=num_p)
        idx_note = "IVF_HNSW_SQ(cosine)"
    except Exception as e:
        log(f"IVF_HNSW_SQ unavailable ({type(e).__name__}) — using flat search")

    # Native FTS/BM25 on child text (new unified API first, legacy fallback)
    fts_note = "unavailable"
    try:
        from lancedb.index import FTS
        tbl.create_index("text", config=FTS())
        fts_note = "bm25(FTS)"
    except Exception as e1:
        for attempt in (
            lambda: tbl.create_index(metric="bm25", text_column="text"),
            lambda: tbl.create_index(num_sub_vectors=1, metric="bm25",
                                     vector_column_name="text"),
        ):
            try:
                attempt()
                fts_note = "bm25(legacy)"
                break
            except Exception:
                continue
        if fts_note == "unavailable":
            log(f"FTS unavailable: {type(e1).__name__}: {e1}")

    total = tbl.count_rows()
    log(f"LanceDB ready: {total} rows | vec:{idx_note} | fts:{fts_note}")

    corpus_hash = hashlib.sha256(CORPUS.read_bytes()).hexdigest()[:16]
    MANIFEST.write_text(json.dumps({
        "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "corpus_file": "data/corpus.jsonl",
        "corpus_sha16": corpus_hash,
        "docs": len({r["doc_id"] for r in rows}),
        "child_chunks": total,
        "embed_model": EMBED_MODEL,
        "vector_dim": int(vecs.shape[1]),
        "parent_words": PARENT_WORDS,
        "child_words": CHILD_WORDS,
        "child_stride": CHILD_STRIDE,
        "vector_index": idx_note,
        "fts_index": fts_note,
        "versions": {"python": sys.version.split()[0]},
    }, indent=2))
    log(f"manifest.json written")


if __name__ == "__main__":
    args = set(sys.argv[1:])
    max_docs = 800
    for a in list(args):
        if a.startswith("--max-docs"):
            max_docs = int(a.split("=")[1]) if "=" in a else 800
    DATA.mkdir(exist_ok=True)
    download_corpus(max_docs)
    build_lancedb(rebuild="--rebuild" in args)
