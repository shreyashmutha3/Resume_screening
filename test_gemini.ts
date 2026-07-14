import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import "dotenv/config";

async function run() {
  console.log("Starting test...");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  
  const requirementSchema = {
    type: SchemaType.OBJECT,
    properties: {
      skillName: { type: SchemaType.STRING, description: "The core skill or technology" },
      importance: { type: SchemaType.STRING, enum: ["MANDATORY", "OPTIONAL"] },
      rawText: { type: SchemaType.STRING, description: "The exact phrase or a clear summary of the requirement" },
      weight: { type: SchemaType.NUMBER, description: "Importance weight from 0.0 to 1.0" },
    },
    required: ["skillName", "importance", "rawText", "weight"],
  };

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      mustHave: { type: SchemaType.ARRAY, items: requirementSchema },
      niceToHave: { type: SchemaType.ARRAY, items: requirementSchema },
      knowledgeGraphNodes: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    },
    required: ["mustHave", "niceToHave", "knowledgeGraphNodes"],
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-3.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
    },
  });

  console.log("Calling model...");
  try {
    const result = await model.generateContent("Analyze this: Need a React developer.");
    console.log(result.response.text());
  } catch (err) {
    console.error("Error:", err);
  }
  console.log("Done.");
}
run();
