import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";
import type { JobRequirement } from "../domain";

export interface ParsedJD {
  mustHave: JobRequirement[];
  niceToHave: JobRequirement[];
  knowledgeGraphNodes: string[];
}

export async function parseJobDescription(jobId: string, description: string): Promise<ParsedJD> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  const requirementSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      skillName: { type: SchemaType.STRING, description: "The core skill or technology" },
      importance: { type: SchemaType.STRING, enum: ["MANDATORY", "OPTIONAL"] } as Schema,
      rawText: { type: SchemaType.STRING, description: "The exact phrase or a clear summary of the requirement" },
      weight: { type: SchemaType.NUMBER, description: "Importance weight from 0.0 to 1.0" },
    },
    required: ["skillName", "importance", "rawText", "weight"],
  };

  const responseSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
      mustHave: { type: SchemaType.ARRAY, items: requirementSchema },
      niceToHave: { type: SchemaType.ARRAY, items: requirementSchema },
      knowledgeGraphNodes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    },
    required: ["mustHave", "niceToHave", "knowledgeGraphNodes"],
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema as any,
    },
  });

  const prompt = `
  You are an expert technical recruiter and AI knowledge graph builder.
  Analyze the following Job Description and extract the core requirements.
  Divide them into "mustHave" (MANDATORY) and "niceToHave" (OPTIONAL).
  Also, extract a list of "knowledgeGraphNodes" which are short, canonical names of the technologies, tools, and methodologies mentioned.
  
  Job Description:
  ${description}
  `;

  let result;
  try {
    result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
    ]);
  } catch (err) {
    console.warn("[jdAgent] Timeout or API Error. Using fallback.", err);
    result = {
      response: {
        text: () => JSON.stringify({
          mustHave: [{ skillName: "Software Engineering", importance: "MANDATORY", rawText: "Software Engineering", weight: 1.0 }],
          niceToHave: [],
          knowledgeGraphNodes: ["Software Engineering"]
        })
      }
    };
  }

  const responseText = (result as any).response.text();
  
  if (!responseText) {
    throw new Error("Empty response from Gemini.");
  }
  
  const parsed = JSON.parse(responseText);
  
  let reqIdCounter = 1;

  const mapRequirement = (req: any): JobRequirement => ({
    id: `jd-req-${jobId}-${reqIdCounter++}`,
    jobId,
    skillId: `skill-${req.skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    importance: req.importance,
    requirementType: "skill",
    rawText: req.rawText,
    weight: req.weight,
  });

  const mustHave = (parsed.mustHave || []).map(mapRequirement);
  const niceToHave = (parsed.niceToHave || []).map(mapRequirement);

  if (mustHave.length === 0) {
    mustHave.push({
      id: `jd-req-${jobId}-fallback`,
      jobId,
      importance: "MANDATORY",
      requirementType: "experience",
      rawText: "General software engineering experience",
      weight: 1.0,
    });
  }

  return {
    mustHave,
    niceToHave,
    knowledgeGraphNodes: parsed.knowledgeGraphNodes || [],
  };
}
