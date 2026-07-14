import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export interface CandidateDigitalProfile {
  skills: string[];
  experience: string[];
  projects: string[];
  education: string[];
  summary: string[];
}

export async function detectResumeSections(resumeText: string): Promise<CandidateDigitalProfile> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      skills: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "List of individual skills or skill categories." },
      experience: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Bullet points or sentences detailing work experience." },
      projects: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Bullet points detailing personal or professional projects." },
      education: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Details about degrees, universities, and education." },
      summary: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Any objective, summary, or bio information." }
    },
    required: ["skills", "experience", "projects", "education", "summary"],
  };

  const model = genAI.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema as any,
    },
  });

  const prompt = `
You are an expert resume parser. I will provide you with the raw text of a resume.
Your task is to extract and segment the information into the appropriate structural arrays.
Break down paragraphs into logical bullet points or individual sentences.
If a section is missing, provide an empty array.

RESUME TEXT:
${resumeText}
  `;

  let result;
  try {
    result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
    ]);
  } catch (err) {
    console.warn("[sectionDetectorAgent] Timeout or API Error. Using fallback.", err);
    return {
      skills: ["Failed to parse skills natively due to API error"],
      experience: ["Failed to parse experience natively"],
      projects: [],
      education: [],
      summary: []
    };
  }

  const responseText = (result as any).response.text();
  try {
    return JSON.parse(responseText) as CandidateDigitalProfile;
  } catch (err) {
    console.error("Failed to parse section detector response:", responseText);
    throw new Error("AI returned malformed JSON.");
  }
}
