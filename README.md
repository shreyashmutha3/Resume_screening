# AI-Driven Resume Screener

A robust, AI-powered system that intelligently screens candidate resumes against Job Descriptions using the **Google Gemini API**, semantic vector embeddings, and cross-encoder validation.

## Features

- **JD Intelligence Agent:** Extracts structured Requirements (Must-Have vs Nice-to-Have) and builds a Knowledge Graph using `gemini-1.5-flash`.
- **Hybrid Matching Engine:** Generates candidate chunks and vectorizes them using `text-embedding-004` (384 dimensions) combined with lexical overlap calculations.
- **Cross-Encoder Validation:** Uses `gemini-1.5-flash` to evaluate the actual semantic fit and identify skill gaps automatically.
- **Frontend Dashboard:** A stunning, modern interface to view jobs, run scorings, and ingest resumes.

## Requirements
- Node.js (v18+)
- A valid Google Gemini API Key.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Copy the example environment file and add your actual API key:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to include your `GEMINI_API_KEY`.

3. **Build the Project:**
   ```bash
   npm run build
   ```

4. **Run the Server:**
   ```bash
   npm run start
   ```
   The API and Frontend Dashboard will be served at `http://localhost:3000`.

## API Endpoints

- `GET /` - Serves the frontend dashboard.
- `GET /jobs` - Lists all jobs.
- `POST /jobs` - Creates a new job (triggers the JD Intelligence Agent).
- `GET /jobs/:jobId` - Fetches a specific job snapshot.
- `GET /jobs/:jobId/resumes` - Fetches ingested resumes for a job.
- `POST /jobs/:jobId/resumes` - Ingests a raw resume, parses it, and scores it through the AI pipeline.