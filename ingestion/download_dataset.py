import os
import json
import logging
from datasets import load_dataset
from tqdm import tqdm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_DOCS = 500 
OUTPUT_FILE = "../data/corpus.jsonl"

def main():
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    
    logger.info("Loading dataset ai4bharat/MSMARCO-XI...")
    ds = load_dataset('ai4bharat/MSMARCO-XI', split='validation', streaming=True)
    
    unique_passages = set()
    docs = []
    
    logger.info("Extracting unique passages...")
    try:
        for i, row in enumerate(ds):
            if len(docs) >= MAX_DOCS:
                break
                
            passages = row.get('passages', {})
            
            # The dataset has 'English_passages' and 'Translated_passages'
            texts_to_add = []
            
            if 'English_passages' in passages:
                for p in passages['English_passages']:
                    if isinstance(p, dict) and 'passage_text' in p:
                        texts_to_add.append(p['passage_text'])
                    elif isinstance(p, str):
                        texts_to_add.append(p)
                        
            if 'Translated_passages' in passages:
                for p in passages['Translated_passages']:
                    if isinstance(p, dict) and 'passage_text' in p:
                        texts_to_add.append(p['passage_text'])
                    elif isinstance(p, str):
                        texts_to_add.append(p)
            
            # If the structure is something else
            if not texts_to_add:
                logger.info(f"Row {i} passages keys: {passages.keys() if isinstance(passages, dict) else type(passages)}")
            
            for text in texts_to_add:
                if text and text not in unique_passages:
                    unique_passages.add(text)
                    docs.append({
                        "id": f"doc_{len(docs)}",
                        "text": text,
                        "metadata": {
                            "source": "msmarco-xi",
                            "language": row.get('target_lang', 'unknown')
                        }
                    })
                    if len(docs) >= MAX_DOCS:
                        break

    except Exception as e:
        logger.error(f"Error during extraction: {e}")
        
    logger.info(f"Extracted {len(docs)} unique passages.")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        for d in docs:
            f.write(json.dumps(d, ensure_ascii=False) + '\n')
            
    logger.info(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
