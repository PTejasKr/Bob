package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

// Document structure
type Document struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

var (
	corpus     []Document
	bm25Index  map[string]map[int]float64
	idf        map[string]float64
	docLengths []int
	avgDocLen  float64
	mutex      sync.RWMutex
	groqApiKey string
)

func main() {
	groqApiKey = os.Getenv("GROQ_API_KEY")
	if groqApiKey == "" {
		// Use the user's provided API key from earlier context
		groqApiKey = os.Getenv("GROQ_API_KEY")
	}

	log.Println("Starting Go Backend...")
	err := loadCorpus("../data/corpus.jsonl")
	if err != nil {
		log.Fatalf("Failed to load corpus: %v", err)
	}

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
	}))

	app.Post("/api/v1/query", handleQuery)

	log.Println("Listening on :8080")
	log.Fatal(app.Listen(":8080"))
}

func loadCorpus(filepath string) error {
	file, err := os.Open(filepath)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var doc Document
		if err := json.Unmarshal(scanner.Bytes(), &doc); err != nil {
			continue
		}
		corpus = append(corpus, doc)
	}

	buildBM25()
	log.Printf("Loaded %d documents into BM25 Index", len(corpus))
	return nil
}

func tokenize(text string) []string {
	// Simple lowercase and split
	text = strings.ToLower(text)
	f := func(c rune) bool {
		return c < 'A' || c > 'z'
	}
	return strings.FieldsFunc(text, f)
}

func buildBM25() {
	bm25Index = make(map[string]map[int]float64)
	idf = make(map[string]float64)
	docLengths = make([]int, len(corpus))

	docFrequencies := make(map[string]int)
	totalLen := 0

	// Count TF
	for i, doc := range corpus {
		tokens := tokenize(doc.Text)
		docLengths[i] = len(tokens)
		totalLen += len(tokens)
		
		termCounts := make(map[string]int)
		for _, token := range tokens {
			termCounts[token]++
		}
		
		for term, count := range termCounts {
			if bm25Index[term] == nil {
				bm25Index[term] = make(map[int]float64)
			}
			bm25Index[term][i] = float64(count)
			docFrequencies[term]++
		}
	}

	avgDocLen = float64(totalLen) / float64(len(corpus))

	// Calc IDF
	N := float64(len(corpus))
	for term, df := range docFrequencies {
		// standard BM25 idf
		idf[term] = (N - float64(df) + 0.5) / (float64(df) + 0.5)
		if idf[term] < 0 {
			idf[term] = 0.01 // cap at small positive
		}
	}
}

func searchBM25(query string, topK int) []Document {
	tokens := tokenize(query)
	scores := make(map[int]float64)

	k1 := 1.5
	b := 0.75

	for _, token := range tokens {
		if postingList, ok := bm25Index[token]; ok {
			termIDF := idf[token]
			for docID, tf := range postingList {
				dl := float64(docLengths[docID])
				score := termIDF * (tf * (k1 + 1)) / (tf + k1*(1-b+b*(dl/avgDocLen)))
				scores[docID] += score
			}
		}
	}

	type docScore struct {
		id    int
		score float64
	}
	var sortedScores []docScore
	for docID, score := range scores {
		sortedScores = append(sortedScores, docScore{docID, score})
	}

	sort.Slice(sortedScores, func(i, j int) bool {
		return sortedScores[i].score > sortedScores[j].score
	})

	var results []Document
	for i := 0; i < topK && i < len(sortedScores); i++ {
		results = append(results, corpus[sortedScores[i].id])
	}
	
	// fallback if no results
	if len(results) == 0 && len(corpus) > 0 {
		results = append(results, corpus[0])
	}

	return results
}

type QueryRequest struct {
	Query string `json:"query"`
}

type QueryResponse struct {
	Answer       string `json:"answer"`
	RagLatencyMs int    `json:"rag_latency_ms"`
	LlmLatencyMs int    `json:"llm_latency_ms"`
}

type GroqRequest struct {
	Model    string `json:"model"`
	Messages []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"messages"`
	MaxTokens int `json:"max_tokens"`
}

type GroqResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func handleQuery(c *fiber.Ctx) error {
	var req QueryRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request"})
	}

	// 1. RAG Search
	startRag := time.Now()
	docs := searchBM25(req.Query, 3)
	
	contextStr := ""
	for i, doc := range docs {
		contextStr += fmt.Sprintf("[%d] %s\n", i+1, doc.Text)
	}
	ragLatency := time.Since(startRag).Milliseconds()

	// 2. Groq LLM
	startLlm := time.Now()
	
	prompt := fmt.Sprintf("You are Bob, a helpful AI assistant. Answer the user's query concisely using ONLY the context provided.\n\nContext:\n%s\n\nQuery: %s", contextStr, req.Query)
	
	groqReq := GroqRequest{
		Model: "llama3-8b-8192",
		MaxTokens: 150,
	}
	groqReq.Messages = append(groqReq.Messages, struct{Role string `json:"role"`; Content string `json:"content"`}{Role: "user", Content: prompt})
	
	reqBody, _ := json.Marshal(groqReq)
	
	httpReq, _ := http.NewRequest("POST", "https://api.groq.com/openai/v1/chat/completions", bytes.NewBuffer(reqBody))
	httpReq.Header.Set("Authorization", "Bearer "+groqApiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	
	client := &http.Client{Timeout: 10 * time.Second}
	httpResp, err := client.Do(httpReq)
	
	answer := "Error connecting to LLM"
	if err == nil {
		defer httpResp.Body.Close()
		body, _ := ioutil.ReadAll(httpResp.Body)
		var groqRes GroqResponse
		json.Unmarshal(body, &groqRes)
		if len(groqRes.Choices) > 0 {
			answer = groqRes.Choices[0].Message.Content
		}
	}
	llmLatency := time.Since(startLlm).Milliseconds()

	return c.JSON(QueryResponse{
		Answer:       answer,
		RagLatencyMs: int(ragLatency),
		LlmLatencyMs: int(llmLatency),
	})
}
