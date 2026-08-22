import os
import datasets
import logging
from .preprocessor import create_hierarchical_chunks
from .embedder import ONNXEmbedder
from .store import LanceDBStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def ingest_msmarco(num_samples=100, lang="hi"):
    logger.info("Loading MSMARCO-XI dataset...")
    # Just grab a small portion for speed and test
    # Loading without streaming to avoid PyArrow chunked array bug
    ds = datasets.load_dataset("ai4bharat/MSMARCO-XI")
    dataset = ds["train"] if "train" in ds else ds["default"]
    
    all_parents = []
    all_children = []
    
    logger.info("Chunking dataset...")
    count = 0
    seen_passages = set()
    
    for row in dataset:
        # MSMARCO-XI has a 'passages' dict with 'Translated_passages'
        passages_dict = row.get("passages", {})
        translated = passages_dict.get("Translated_passages", [])
        english = passages_dict.get("English_passages", [])
        
        # Use translated if available for the requested language, else fallback to english
        target_passages = translated if translated else english
        
        for idx, passage in enumerate(target_passages):
            if not passage or passage in seen_passages:
                continue
            seen_passages.add(passage)
            
            doc_id = f"{row.get('query_id', count)}_{idx}"
            chunks = create_hierarchical_chunks(doc_id, passage, lang)
            all_parents.extend(chunks["parents"])
            all_children.extend(chunks["children"])
            
        count += 1
        if count >= num_samples:
            break
            
    logger.info(f"Created {len(all_parents)} parents and {len(all_children)} children.")
    
    logger.info("Embedding children...")
    embedder = ONNXEmbedder()
    child_texts = [c["text"] for c in all_children]
    # batch size can be simple here
    vectors = embedder.embed(child_texts)
    
    logger.info("Inserting into LanceDB...")
    store = LanceDBStore("./data/lancedb_optimized")
    store.insert(all_children, all_parents, vectors.tolist())
    
    logger.info("Ingestion complete.")

if __name__ == "__main__":
    ingest_msmarco(num_samples=100, lang="hi")

