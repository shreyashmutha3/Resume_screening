import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import "dotenv/config";
import { canManageJobs, canScoreCandidates, parseRequestContext, AuthorizationError } from "./auth";
import { loadMigrationManifest } from "./persistence";
import {
  defaultResumeScreenerStore,
  type CreateJobInput,
  type ResumeIngestInput,
  type ScoreCandidateInput,
} from "./persistence";

interface JsonResponse {
  status: number;
  body?: unknown;
  bodyRaw?: Buffer | string;
  headers?: Record<string, string>;
}

export interface ResumeScreenerServerOptions {
  port?: number;
  host?: string;
}

export function createResumeScreenerServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const method = request.method ?? "GET";

    try {
      const context = parseRequestContext(request.headers);
      const result = await handleRequest(method, url.pathname, request, context);
      if (result.bodyRaw) {
        response.statusCode = result.status;
        if (result.headers) {
          for (const [key, val] of Object.entries(result.headers)) {
            response.setHeader(key, val);
          }
        }
        response.end(result.bodyRaw);
      } else {
        writeJson(response, result.status, result.body);
      }
    } catch (error) {
      if (error instanceof AuthorizationError) {
        writeJson(response, 401, {
          error: error.message,
        });
        return;
      }

      writeJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected error",
      });
    }
  });
}

export async function main(options: ResumeScreenerServerOptions = {}): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    console.error("\n❌ ERROR: GEMINI_API_KEY environment variable is missing or invalid.");
    console.error("Please create a .env file and set GEMINI_API_KEY=your_key or pass it inline.\n");
    process.exit(1);
  }

  const port = options.port ?? Number(process.env.PORT ?? 3000);
  const host = options.host ?? "0.0.0.0";

  await defaultResumeScreenerStore.seedDemoData();

  const server = createResumeScreenerServer();

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });

  process.stdout.write(`Resume screener API listening on http://${host}:${port}\n`);
}

async function handleRequest(
  method: string,
  path: string,
  request: IncomingMessage,
  context: ReturnType<typeof parseRequestContext>,
): Promise<JsonResponse> {
  if (method === "GET" && path === "/health") {
    return {
      status: 200,
      body: { ok: true, phase: 4 },
    };
  }

  if (method === "GET" && path === "/migrations") {
    return {
      status: 200,
      body: loadMigrationManifest(),
    };
  }

  if (method === "GET" && path === "/jobs") {
    return {
      status: 200,
      body: { orgId: context.orgId, jobs: defaultResumeScreenerStore.listJobs(context.orgId) },
    };
  }

  const resumesListMatch = path.match(/^\/jobs\/([^/]+)\/resumes$/);
  if (method === "GET" && resumesListMatch) {
    const jobId = decodeURIComponent(resumesListMatch[1]);

    return {
      status: 200,
      body: {
        jobId,
        resumes: defaultResumeScreenerStore.getResumes(jobId, { orgId: context.orgId }),
      },
    };
  }

  if (method === "POST" && path === "/jobs") {
    if (!canManageJobs(context)) {
      throw new AuthorizationError("Creating jobs requires recruiter or admin access");
    }

    const body = (await readJson(request)) as CreateJobInput;
    const snapshot = await defaultResumeScreenerStore.createJob({
      ...body,
      orgId: context.orgId,
      createdBy: context.userId,
    });

    return {
      status: 201,
      body: snapshot,
    };
  }

  const scoreJobMatch = path.match(/^\/jobs\/([^/]+)\/score$/);
  if (method === "POST" && scoreJobMatch) {
    const jobId = decodeURIComponent(scoreJobMatch[1]);
    const body = (await readJson(request)) as Omit<ScoreCandidateInput, "jobId">;

    if (!canScoreCandidates(context)) {
      throw new AuthorizationError("Scoring candidates requires recruiter or admin access");
    }

    const result = defaultResumeScreenerStore.scoreCandidate({
      ...body,
      jobId,
    }, {
      orgId: context.orgId,
      userId: context.userId,
    });

    return {
      status: 200,
      body: {
        candidateScore: result.candidateScore,
        scoreComponents: result.scoreComponents,
        scoreEvidence: result.scoreEvidence,
        rankings: defaultResumeScreenerStore.getRankings(jobId, { orgId: context.orgId }),
      },
    };
  }

  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (method === "GET" && jobMatch) {
    const jobId = decodeURIComponent(jobMatch[1]);
    const snapshot = defaultResumeScreenerStore.getJobSnapshot(jobId, { orgId: context.orgId });

    if (!snapshot) {
      return {
        status: 404,
        body: { error: "Job not found" },
      };
    }

    return {
      status: 200,
      body: snapshot,
    };
  }

  if (method === "POST" && resumesListMatch) {
    if (!canScoreCandidates(context)) {
      throw new AuthorizationError("Ingesting resumes requires recruiter or admin access");
    }

    const jobId = decodeURIComponent(resumesListMatch[1]);
    const body = (await readJson(request)) as any;

    let filePath = body.filePath || "";
    if (body.fileData && body.fileName) {
      const { writeFile } = require("node:fs/promises");
      const { join } = require("node:path");
      
      const buffer = Buffer.from(body.fileData, "base64");
      const timestamp = Date.now();
      const safeFileName = body.fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      filePath = join(process.cwd(), "uploads", `${timestamp}_${safeFileName}`);
      await writeFile(filePath, buffer);
    }

    const ingestInput: Omit<ResumeIngestInput, "jobId"> = {
      candidateId: body.candidateId,
      filePath: filePath,
      fileType: body.fileType || "application/octet-stream",
      rawText: body.rawText,
    };

    const result = await defaultResumeScreenerStore.ingestResume(
      {
        ...ingestInput,
        jobId,
      },
      {
        orgId: context.orgId,
        userId: context.userId,
      },
    );

    return {
      status: 201,
      body: {
        resume: result.resume,
        parsed: result.parsed,
        candidateSkills: result.candidateSkills,
        candidateExperience: result.candidateExperience,
        candidateProjects: result.candidateProjects,
        candidateEducation: result.candidateEducation,
        score: result.score,
        rankings: defaultResumeScreenerStore.getRankings(jobId, { orgId: context.orgId }),
      },
    };
  }

  if (method === "GET" && path === "/me") {
    return {
      status: 200,
      body: {
        orgId: context.orgId,
        userId: context.userId,
        userRole: context.userRole,
      },
    };
  }

  // Try serving static files
  try {
    let filePath = path === "/" ? "/index.html" : path;
    const fullPath = join(process.cwd(), "public", filePath);
    
    if (!fullPath.startsWith(join(process.cwd(), "public"))) {
      throw new Error("Invalid path");
    }

    const content = await readFile(fullPath);
    const ext = extname(fullPath).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
    };

    return {
      status: 200,
      headers: { "Content-Type": mimeTypes[ext] || "application/octet-stream" },
      bodyRaw: content,
    };
  } catch (err) {
    return {
      status: 404,
      body: { error: "Route not found" },
    };
  }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody) as unknown;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body, null, 2));
}

if (require.main === module) {
  void main();
}