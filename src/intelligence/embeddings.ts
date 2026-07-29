import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";

let primaryModelId = "text-embedding-004";

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  let model = genAI.getGenerativeModel({ model: primaryModelId });
  let response;

  const batchRequest = {
    requests: texts.map(text => ({
      content: { role: "user", parts: [{ text }] },
      taskType: TaskType.RETRIEVAL_DOCUMENT,
      outputDimensionality: 384,
    }))
  };

  try {
    response = await model.batchEmbedContents(batchRequest as any);
  } catch (err: any) {
    if (err.status === 404) {
      console.warn(`[Embeddings] Warning: Primary model ${primaryModelId} failed with 404. Attempting to find a fallback embedding model...`);
    } else {
      console.error(`[Embeddings] Error: Primary model ${primaryModelId} failed with status ${err.status} / message: ${err.message}.`);
      throw err;
    }
    
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      const data = await res.json();
      const fallbackModel = data.models?.find((m: any) => m.name.includes("embedding"));
      
      if (!fallbackModel) {
         throw new Error("No fallback embedding model found in live list.");
      }
      
      const fallbackModelId = fallbackModel.name.replace('models/', '');
      console.warn(`[Embeddings] Found fallback model: ${fallbackModelId}`);
      
      model = genAI.getGenerativeModel({ model: fallbackModelId });
      
      try {
        // Try with outputDimensionality
        response = await model.batchEmbedContents(batchRequest as any);
        primaryModelId = fallbackModelId; // Cache the successful model
      } catch (err: any) {
         if (err.message && err.message.includes("outputDimensionality")) {
           // Fallback again without outputDimensionality
           const fallbackRequest = {
             requests: texts.map(text => ({
                content: { role: "user", parts: [{ text }] },
                taskType: TaskType.RETRIEVAL_DOCUMENT,
             }))
           };
           response = await model.batchEmbedContents(fallbackRequest as any);
           primaryModelId = fallbackModelId; // Cache the successful model
         } else {
           throw err;
         }
      }
    } catch (fallbackError) {
      console.error("[Embeddings] Fallback also failed:", fallbackError);
      throw err; // Throw original error
    }
  }

  const vectors = response.embeddings.map(e => e.values);
  
  // Verify outputDimensionality is actually 384
  if (vectors.length > 0 && vectors[0].length !== 384) {
     console.warn(`[Embeddings] Warning: Returned embeddings are not length 384 (length is ${vectors[0].length}). Vector search may fail!`);
  }

  return vectors;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

