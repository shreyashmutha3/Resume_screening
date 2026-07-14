import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";
import type { JobRequirement } from "../domain";
import type { RankedEvidence } from "./hybridEngine";

export interface ExplainableScore {
  fitScore: number;
  skillGaps: string[];
  confidence: number;
}

export async function validateEvidence(
  requirement: JobRequirement,
  evidenceChunks: RankedEvidence[]
): Promise<ExplainableScore> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const responseSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      fitScore: { type: SchemaType.NUMBER, description: "A score between 0.0 and 1.0 indicating how well the evidence meets the requirement" },
      skillGaps: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Specific missing aspects or gaps in the evidence regarding the requirement" },
      confidence: { type: SchemaType.NUMBER, description: "A confidence score between 0.0 and 1.0 based on evidence quality and explicitness" },
    },
    required: ["fitScore", "skillGaps", "confidence"],
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const evidenceText = evidenceChunks.map((c, i) => `[Evidence ${i + 1}] (Relevance: ${c.score.toFixed(2)}): ${c.text}`).join("\n");
  
  const prompt = `
  You are an expert technical evaluator. 
  Assess the candidate's evidence against the following Job Requirement.
  
  Requirement Type: ${requirement.requirementType}
  Requirement Description: ${requirement.rawText}
  Importance: ${requirement.importance}
  
  Candidate Evidence Chunks:
  ${evidenceText || "No evidence provided."}
  
  Output a JSON evaluation containing:
  - fitScore (0.0 to 1.0)
  - skillGaps (List of missing sub-skills or gaps)
  - confidence (0.0 to 1.0)
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  
  if (!responseText) {
    throw new Error("Empty response from Gemini.");
  }
  
  return JSON.parse(responseText) as ExplainableScore;
}

