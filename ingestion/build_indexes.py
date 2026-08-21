import os
import json
import pickle
import logging
import sqlite3
import numpy as np
from typing import List, Dict, Any
from sentence_transformers import SentenceTransformer
import faiss
from rank_bm25 import BM25Okapi
import nltk
from transformers import AutoTokenizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to download punkt for word tokenization, if needed
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt')
    nltk.download('punkt_tab')

# Configuration
CORPUS_FILE = "../data/corpus.jsonl"
DB_PATH = "../data/metadata.sqlite"
FAISS_PATH = "../data/faiss_index"
BM25_PATH = "../data/bm25_index.pkl"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
CHUNK_SIZE = 200
CHUNK_OVERLAP = 1

def semantic_chunker(text: str, metadata: dict, tokenizer, max_tokens: int, overlap_sentences: int = 1) -> List[str]:
    metadata_header = f"[Source: {metadata.get('source', 'unknown')} | Lang: {metadata.get('language', 'unknown')}]\n"
    header_tokens = len(tokenizer.encode(metadata_header, add_special_tokens=False))
    
    sentences = nltk.sent_tokenize(text)
    chunks = []
    
    current_chunk_sentences = []
    current_length = header_tokens
    
    for sentence in sentences:
        sentence_tokens = len(tokenizer.encode(sentence, add_special_tokens=False))
        
        if current_length + sentence_tokens > max_tokens and current_chunk_sentences:
            chunk_text = metadata_header + " ".join(current_chunk_sentences)
            chunks.append(chunk_text)
            
            overlap_slice = current_chunk_sentences[-overlap_sentences:] if overlap_sentences > 0 else []
            current_chunk_sentences = overlap_slice + [sentence]
            current_length = header_tokens + sum(len(tokenizer.encode(s, add_special_tokens=False)) for s in current_chunk_sentences)
        else:
            current_chunk_sentences.append(sentence)
            current_length += sentence_tokens
            
    if current_chunk_sentences:
        chunk_text = metadata_header + " ".join(current_chunk_sentences)
        chunks.append(chunk_text)
        
    return chunks

def setup_db(db_path: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS chunks (
            chunk_id TEXT PRIMARY KEY,
            doc_id TEXT,
            text TEXT,
            metadata TEXT
        )
    ''')
    conn.commit()
    return conn

def main():
    if not os.path.exists(CORPUS_FILE):
        logger.error(f"Corpus file {CORPUS_FILE} not found. Run download_dataset.py first.")
        return

    # 1. Load documents & Chunk
    logger.info("Loading and chunking documents...")
    tokenizer = AutoTokenizer.from_pretrained(f"sentence-transformers/{EMBEDDING_MODEL}")
    chunks_data = []
    with open(CORPUS_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            doc = json.loads(line)
            doc_chunks = semantic_chunker(doc["text"], doc.get("metadata", {}), tokenizer, CHUNK_SIZE, CHUNK_OVERLAP)
            for i, chunk_text in enumerate(doc_chunks):
                chunks_data.append({
                    "chunk_id": f"{doc['id']}_c{i}",
                    "doc_id": doc["id"],
                    "text": chunk_text,
                    "metadata": json.dumps(doc["metadata"])
                })

    logger.info(f"Generated {len(chunks_data)} chunks.")

    # 2. Save to SQLite
    logger.info("Saving chunks to SQLite...")
    conn = setup_db(DB_PATH)
    cursor = conn.cursor()
    # Clear existing
    cursor.execute("DELETE FROM chunks")
    
    cursor.executemany(
        "INSERT INTO chunks (chunk_id, doc_id, text, metadata) VALUES (?, ?, ?, ?)",
        [(c["chunk_id"], c["doc_id"], c["text"], c["metadata"]) for c in chunks_data]
    )
    conn.commit()

    # 3. Build Dense Index (FAISS)
    logger.info(f"Loading embedding model {EMBEDDING_MODEL}...")
    model = SentenceTransformer(EMBEDDING_MODEL)
    
    logger.info("Encoding chunks...")
    texts = [c["text"] for c in chunks_data]
    embeddings = model.encode(texts, batch_size=32, show_progress_bar=True, convert_to_numpy=True)
    
    dimension = embeddings.shape[1]
    # Use IndexFlatIP for cosine similarity (assuming normalized embeddings) or IndexFlatL2
    # MiniLM outputs are normalized if we use util, but L2 is safer if not
    index = faiss.IndexFlatL2(dimension)
    
    # We will use IndexIDMap to map faiss integer IDs to chunk string IDs... wait, IndexIDMap requires int64 IDs.
    # Instead, we will map faiss row index to chunk_id via SQLite or a simple pickle file.
    index = faiss.IndexIDMap(index)
    ids = np.arange(len(chunks_data), dtype=np.int64)
    index.add_with_ids(embeddings, ids)
    
    faiss.write_index(index, FAISS_PATH)
    
    # Save the id mapping separately so we can resolve Faiss ID -> Chunk ID
    mapping = {int(i): c["chunk_id"] for i, c in zip(ids, chunks_data)}
    with open(FAISS_PATH + "_mapping.pkl", 'wb') as f:
        pickle.dump(mapping, f)

    logger.info(f"Saved FAISS index to {FAISS_PATH}")

    # 4. Build Lexical Index (BM25)
    logger.info("Building BM25 index...")
    tokenized_corpus = [doc.lower().split() for doc in texts] # Simple tokenization
    bm25 = BM25Okapi(tokenized_corpus)
    
    # Save bm25 object and mapping
    bm25_data = {
        "bm25": bm25,
        "mapping": mapping
    }
    with open(BM25_PATH, 'wb') as f:
        pickle.dump(bm25_data, f)
        
    logger.info(f"Saved BM25 index to {BM25_PATH}")
    logger.info("Indexing complete!")

if __name__ == "__main__":
    main()
