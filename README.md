# AI-Powered Resume Screener & Hybrid RAG Evaluation Engine

This project is an advanced, AI-driven resume screening and candidate evaluation platform. It moves beyond traditional keyword matching and single-prompt LLM wrappers by implementing a highly robust **Hybrid Retrieval-Augmented Generation (RAG) and Cross-Encoder Architecture**.

The system is designed to deeply understand unstructured resumes, map them to specific job requirements, mathematically score them, and provide an **Explainable Evidence Dashboard** for recruiters, highlighting exact skill gaps and reasoning.

---

## 🌟 The Uniqueness of this Architecture

Most "AI Resume Screeners" blindly send the entire PDF to an LLM and ask for a score (which is slow, prone to hallucinations, and lacks explainability). This project utilizes a multi-stage data processing pipeline:

### 1. Lightning-Fast Local Text Extraction
Instead of relying on fragile and slow native API Document OCR (which often fails or hits rate limits), this project uses `pdf-parse` to instantly extract raw text locally on the server. Only clean, raw text is sent to the AI agents.

### 2. Section Detector Agent (Digital Profile Generation)
Unstructured resume text is routed to the **Section Detector Agent** (powered by `gemini-flash-lite-latest`). This agent semantically categorizes the text into a structured JSON `Candidate Digital Profile`, separating Skills, Experience, Education, and Projects.

### 3. Evidence Chunking & Embedding
The Digital Profile is sliced into smaller, semantic **Evidence Chunks**. Each chunk is then passed through `gemini-embedding-2` to calculate high-dimensional vector embeddings, allowing the system to understand the context and intent of the candidate's experience.

### 4. Hybrid Matching Engine
For *every single requirement* listed in a Job Description, the **Hybrid Engine** searches the candidate's chunks using a dual-scoring mechanism:
*   **BM25 Lexical Similarity:** Ensures exact keyword matches for specific tools, languages, or frameworks.
*   **Vector Cosine Similarity:** Ensures semantic understanding (e.g., matching "Frontend Engineering" with "React Developer").

The engine retrieves the **Top 3 most relevant evidence chunks** for that specific requirement.

### 5. Cross-Encoder Validation Agent
To prevent the system from hallucinating based on vector proximity alone, the Job Requirement and the Top 3 retrieved chunks are sent to a rigid **Cross-Encoder Agent**. This agent evaluates the exact evidence and returns:
*   An exact mathematically bounded `fitScore` (0.0 to 1.0).
*   A `confidence` score.
*   **Explicit Skill Gaps:** If the candidate lacks a specific mandatory component, the agent documents the gap explicitly.

### 6. Explainable Recruiter Dashboard
The backend aggregates these cross-encoded scores into a final ranking. The frontend UI allows recruiters to click on any candidate to expand an **Explainable Score Breakdown**. Instead of just seeing a "75% match", recruiters see exactly *which* mandatory requirements were met, the confidence level of the AI, and the specific **Skill Gaps** detected.

---

## 🛠️ Technology Stack

*   **Backend:** Node.js, TypeScript, Express.js
*   **AI & Embeddings:** Google Generative AI (`gemini-flash-lite-latest`, `gemini-embedding-2`)
*   **Parsing:** `pdf-parse` for local OCR text extraction
*   **Frontend:** Vanilla JS, HTML/CSS (Dynamic Glassmorphism UI)
*   **Data Store:** In-Memory Document Store (easily extensible to PostgreSQL/pgvector)

---

## 🚀 Getting Started

### Prerequisites
*   Node.js (v18+)
*   A Google Gemini API Key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/shreyashmutha3/Resume_screening.git
   cd Resume_screening
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set your API Key:
   Create a `.env` file in the root directory and add:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. Build and Run the server:
   ```bash
   npm run build
   npm run start
   ```

5. Open your browser and navigate to `http://localhost:3000` to access the Recruiter Dashboard.