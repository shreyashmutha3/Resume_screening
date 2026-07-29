# Deployment Guide

This document outlines the steps and prerequisites for deploying the Resume Screener API to a production environment. The recommended deployment target is **Render** (via Docker), but the same principles apply to Railway or Fly.io.

> [!WARNING]
> **IN-MEMORY STORAGE LIMITATION**
> All job, resume, and score data in this application is stored strictly in memory. **Data will be completely wiped** on every server restart, redeployment, application crash, or auto-scaling event.
> 
> **Important Note for Free Tiers**: If you deploy this to a "sleep on inactivity" tier (such as Render's Free Web Service), your data will be permanently lost every time the server goes to sleep. Until a persistent database (e.g., PostgreSQL) is added, treat this deployed instance strictly as a volatile demo environment.

---

## Deploying to Render (Recommended)

This repository includes a `render.yaml` Blueprint which provides a true "one-click" deployment. Render will automatically build the highly optimized Docker container for this application.

### Step 1: Connect your Repository
1. Push this code to a GitHub repository.
2. Log into your [Render Dashboard](https://dashboard.render.com).
3. Click **New** -> **Blueprint**.
4. Connect your GitHub repository.

### Step 2: Configure Environment Variables (Secrets)
During the Blueprint setup, Render will prompt you to provide the values for the environment variables that we marked as `sync: false` for security.

Use the Render UI to securely set:
- **`GEMINI_API_KEY`**: Your Gemini API key used for text embedding and scoring.
- **`AUTH_TOKENS`**: A valid JSON string mapping valid API keys to RequestContexts. 
  *Example:*
  ```json
  {"your-secret-token-123":{"orgId":"demo-org","userId":"admin-user","userRole":"ADMIN"}}
  ```

*The Blueprint will automatically configure `PORT=3000` and `DEV_MODE=false`. Do NOT set `ALLOWED_ORIGINS` unless you are decoupling the frontend onto a separate domain.*

### Step 3: Deploy
Click **Apply**. Render will clone the repository, build the Docker container (omitting all `devDependencies`), and spin up the web service.

---

## Observability & Monitoring

Since this application does not use a third-party logging sink, all observability relies on standard output (`console.log` / `console.error`).

- **Health Checks**: Render will automatically poll `GET /health` to monitor container liveliness. If this endpoint fails, the container will be restarted (which triggers the in-memory data wipe).
- **Viewing Logs**: To view auth rejections (`401`), rate limit hits (`429`), or the embeddings model self-check failure, navigate to your Render Dashboard -> **resume-screener-api** Web Service -> **Logs** tab.

## Local Docker Testing (Alternative)

If you prefer to run the Docker container locally instead of on Render:

```bash
# Build the image
docker build -t resume-screener-api .

# Run the container
docker run -d \
  -p 3000:3000 \
  -e GEMINI_API_KEY="your_api_key" \
  -e AUTH_TOKENS='{"your-secret-token":{"orgId":"demo-org","userId":"demo-user","userRole":"ADMIN"}}' \
  resume-screener-api
```
