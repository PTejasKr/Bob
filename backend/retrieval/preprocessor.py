import unicodedata
import re
from typing import List, Dict, Any

INDIC_PUNCTUATION = re.compile(r"([.!?।॥\n]+)")

def split_indic_sentences(text: str) -> List[str]:
    normalized = unicodedata.normalize("NFC", text)
    tokens = INDIC_PUNCTUATION.split(normalized)
    sentences = []
    for i in range(0, len(tokens) - 1, 2):
        sent = (tokens[i] + tokens[i+1]).strip()
        if sent:
            sentences.append(sent)
    if len(tokens) % 2 == 1 and tokens[-1].strip():
        sentences.append(tokens[-1].strip())
    return sentences

def create_hierarchical_chunks(doc_id: str, text: str, lang: str) -> Dict[str, Any]:
    sentences = split_indic_sentences(text)
    parents = []
    children = []
    
    parent_window = 3
    for p_idx in range(0, len(sentences), parent_window):
        p_slice = sentences[p_idx:p_idx + parent_window]
        parent_text = " ".join(p_slice)
        parent_id = f"{doc_id}_p{p_idx}"
        parents.append({"parent_id": parent_id, "doc_id": doc_id, "text": parent_text, "lang": lang})
        
        for c_idx in range(p_idx, min(p_idx + parent_window, len(sentences))):
            child_id = f"{parent_id}_c{c_idx}"
            children.append({
                "child_id": child_id,
                "parent_id": parent_id,
                "text": sentences[c_idx],
                "lang": lang
            })
            
    return {"parents": parents, "children": children}

