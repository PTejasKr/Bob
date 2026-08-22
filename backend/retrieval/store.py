import lancedb
import logging
import json
import os
import pyarrow as pa
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class LanceDBStore:
    def __init__(self, db_path: str = "./data/lancedb_optimized"):
        self.db_path = db_path
        logger.info(f"Connecting to LanceDB at {db_path}...")
        os.makedirs(db_path, exist_ok=True)
        self.db = lancedb.connect(db_path)
        self.table_name = "multilingual_chunks"
        self.table = None
        if self.table_name in self.db.table_names():
            self.table = self.db.open_table(self.table_name)
        
        self.parent_store = {}
        self.parent_path = os.path.join(db_path, "parents.json")
        if os.path.exists(self.parent_path):
            with open(self.parent_path, "r", encoding="utf-8") as f:
                self.parent_store = json.load(f)

    def save_parents(self):
        with open(self.parent_path, "w", encoding="utf-8") as f:
            json.dump(self.parent_store, f)

    def insert(self, children: List[Dict], parents: List[Dict], vectors: list):
        data = []
        for i, c in enumerate(children):
            data.append({
                "id": c["child_id"],
                "parent_id": c["parent_id"],
                "lang": c["lang"],
                "vector": vectors[i],
            })
            
        if self.table is None:
            schema = pa.schema([
                pa.field("id", pa.string()),
                pa.field("parent_id", pa.string()),
                pa.field("lang", pa.string()),
                pa.field("vector", pa.list_(pa.float32(), 384))
            ])
            self.table = self.db.create_table(self.table_name, data=data, schema=schema)
        else:
            self.table.add(data)
            
        for p in parents:
            self.parent_store[p["parent_id"]] = p
            
        self.save_parents()

    def search(self, query_vector: list, lang: str = "en", top_k: int = 3) -> List[Dict]:
        if self.table is None:
            return []
            
        # Ensure single quotes for the where clause
        results = (self.table.search(query_vector)
                   .where(f"lang = '{lang}'")
                   .limit(top_k)
                   .to_list())
                   
        contexts = []
        for r in results:
            parent_id = r["parent_id"]
            if parent_id in self.parent_store:
                p = self.parent_store[parent_id]
                contexts.append({
                    "chunk_id": p["parent_id"],
                    "doc_id": p["doc_id"],
                    "text": p["text"],
                    "metadata": {"lang": p["lang"]}
                })
        
        return contexts

