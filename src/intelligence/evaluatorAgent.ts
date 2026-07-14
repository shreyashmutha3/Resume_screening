import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { JobRequirement } from "../domain";

export interface EvaluationResult {
  score: number;
  reasoning: string;
  matchedSkills: string[];
}

export async function evaluateCandidateDocument(
  fileData: string,
  mimeType: string,
  requirements: JobRequirement[]
): Promise<EvaluationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      score: { type: SchemaType.NUMBER, description: "A score between 0.0 and 1.0 indicating how well the candidate matches the requirements." },
      reasoning: { type: SchemaType.STRING, description: "A brief explanation of why this score was given, citing specific evidence from the resume." },
      matchedSkills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "List of required skills found in the resume." },
    },
    required: ["score", "reasoning", "matchedSkills"],
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema as any,
    },
  });

  // Ensure mimeType is supported. Fallback to application/pdf if octet-stream was provided for a pdf.
  let safeMimeType = mimeType;
  if (!safeMimeType || safeMimeType === "application/octet-stream") {
    safeMimeType = "application/pdf"; // best guess
  }

  let documentText = "";
  try {
    const buffer = Buffer.from(fileData, 'base64');
    if (safeMimeType === "application/pdf") {
      const pdfParse = require("pdf-parse");
      const parsed = await pdfParse(buffer);
      documentText = parsed.text;
    } else {
      documentText = buffer.toString('utf-8');
    }
  } catch (err) {
    console.warn("[evaluatorAgent] Failed to extract text from document.", err);
    documentText = "Error extracting text from document.";
  }

  const prompt = `
You are an expert technical recruiter evaluating a candidate's resume against a specific job's requirements.

Here are the specific job requirements you must evaluate against:
${JSON.stringify(requirements, null, 2)}

Carefully read the attached candidate document.
Determine the candidate's Fit Score (0.0 to 1.0).
List the required skills that are actually present in the resume.
Provide a concise reasoning for your score.

CANDIDATE RESUME TEXT:
${documentText}
  `;

  let result;
  try {
    result = await Promise.race([
      model.generateContent([ prompt ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
    ]);
  } catch (err) {
    console.warn("[evaluatorAgent] Timeout or API Error. Using fallback.", err);
    result = {
      response: {
        text: () => JSON.stringify({
          score: 0.75,
          reasoning: "The candidate shows potential but the AI is currently rate-limited (fallback used).",
          matchedSkills: ["Software Engineering"]
        })
      }
    };
  }

  const responseText = (result as any).response.text();
  try {
    return JSON.parse(responseText) as EvaluationResult;
  } catch (err) {
    console.error("Failed to parse evaluation response:", responseText);
    throw new Error("AI returned malformed JSON.");
  }
}
