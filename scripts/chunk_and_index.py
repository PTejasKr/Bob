import os
import lancedb
import pyarrow as pa
from datasets import load_dataset
from sentence_transformers import SentenceTransformer
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def semantic_sliding_window_chunk(text, chunk_size=300, overlap=50):
    words = text.split()
    chunks = []
    if len(words) == 0:
        return chunks
    
    for i in range(0, len(words), chunk_size - overlap):
        chunk_words = words[i:i+chunk_size]
        chunks.append(" ".join(chunk_words))
        if i + chunk_size >= len(words):
            break
    return chunks

def build_vast_index():
    # 1. Vast Chunking Strategy: Hybrid semantic + sliding window
    logger.info("Loading MSMARCO-XI dataset...")
    # Load a small subset for demonstration/speed if needed, but we can do a reasonable size
    ds = load_dataset("ai4bharat/MSMARCO-XI", split="train[:1000]") # Only 1000 for fast build
    
    logger.info("Loading embedder...")
    # Fast embedding model for sub-50ms retrieval
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    
    db_path = os.path.join(os.path.dirname(__file__), "../data/lancedb_vast")
    os.makedirs(db_path, exist_ok=True)
    db = lancedb.connect(db_path)
    
    schema = pa.schema([
        pa.field("id", pa.string()),
        pa.field("text", pa.string()),
        pa.field("chunk_strategy", pa.string()),
        pa.field("vector", pa.list_(pa.float32(), 384))
    ])
    
    if "msmarco" in db.table_names():
        db.drop_table("msmarco")
        
    table = db.create_table("msmarco", schema=schema)
    
    logger.info("Chunking and Embedding...")
    records = []
    
    for i, row in enumerate(ds):
        doc_id = str(row.get("id", i))
        text = row.get("text", "")
        if not text:
            continue
            
        # Strategy A: Whole document (if short)
        if len(text.split()) < 200:
            records.append({
                "id": f"{doc_id}_whole",
                "text": text,
                "chunk_strategy": "whole_doc",
                "vector": embedder.encode(text).tolist()
            })
            
        # Strategy B: Sliding window with overlap
        chunks = semantic_sliding_window_chunk(text, chunk_size=150, overlap=30)
        for j, c in enumerate(chunks):
            records.append({
                "id": f"{doc_id}_sw_{j}",
                "text": c,
                "chunk_strategy": "sliding_window",
                "vector": embedder.encode(c).tolist()
            })
            
        # Strategy C: First 100 words (often contains the most dense semantic value in MSMARCO)
        first_100 = " ".join(text.split()[:100])
        records.append({
            "id": f"{doc_id}_head",
            "text": first_100,
            "chunk_strategy": "head_density",
            "vector": embedder.encode(first_100).tolist()
        })
        
        if len(records) >= 500:
            table.add(records)
            records = []
            logger.info(f"Inserted up to doc {i}...")

    if records:
        table.add(records)
        
    logger.info("Vast index creation complete!")

if __name__ == "__main__":
    build_vast_index()
