import requests
import json

if __name__ == "__main__":
    print("Testing...")
    resp = requests.post("http://localhost:8000/api/v1/text/query", json={"query": "What is machine learning?"})
    print(resp.status_code)
    print(json.dumps(resp.json(), indent=2))

