import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { JobRequirement } from "../domain";
import type { EvidenceChunk } from "./chunker";

export interface EvidenceValidation {
  fitScore: number;
  confidence: number;
  reasoning: string;
  isMet: boolean;
  skillGap?: string;
}

export async function validateEvidence(
  requirement: JobRequirement,
  evidenceChunks: EvidenceChunk[]
): Promise<EvidenceValidation> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      fitScore: { type: SchemaType.NUMBER, description: "A score from 0.0 to 1.0 indicating how well the evidence meets the requirement." },
      confidence: { type: SchemaType.NUMBER, description: "A confidence score from 0.0 to 1.0 based on the clarity of the evidence." },
      reasoning: { type: SchemaType.STRING, description: "Brief explanation of why the evidence supports or fails to support the requirement." },
      isMet: { type: SchemaType.BOOLEAN, description: "True if the requirement is substantially met by the evidence." },
      skillGap: { type: SchemaType.STRING, description: "If not met, a short description of the missing skill or experience." }
    },
    required: ["fitScore", "confidence", "reasoning", "isMet"],
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema as any,
    },
  });

  const prompt = `
You are an expert technical cross-encoder validator.
Evaluate if the following candidate evidence chunks meet the specified Job Requirement.

JOB REQUIREMENT:
${requirement.rawText} (Importance: ${requirement.importance})

CANDIDATE EVIDENCE:
${evidenceChunks.map((c, i) => `[Evidence ${i + 1}] (${c.sourceSection}): ${c.text}`).join("\n")}

Determine if the evidence supports the requirement. Be strict.
If there is no direct or strong indirect evidence, set isMet to false and describe the skill gap.
  `;

  let result;
  try {
    result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
    ]);
  } catch (err) {
    console.warn("[crossEncoderAgent] Timeout or API Error. Using fallback.", err);
    return {
      fitScore: 0.5,
      confidence: 0.5,
      reasoning: "Validation failed due to API timeout. Using fallback.",
      isMet: false,
      skillGap: "Could not validate due to system timeout."
    };
  }

  const responseText = (result as any).response.text();
  try {
    return JSON.parse(responseText) as EvidenceValidation;
  } catch (err) {
    console.error("Failed to parse cross encoder response:", responseText);
    throw new Error("AI returned malformed JSON.");
  }
}
