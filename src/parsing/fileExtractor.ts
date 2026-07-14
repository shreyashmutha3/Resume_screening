import { readFile } from "node:fs/promises";
import { extname } from "node:path";
const pdf = require("pdf-parse");
import mammoth from "mammoth";

export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  try {
    if (ext === ".pdf") {
      return await extractPdfText(filePath);
    } else if (ext === ".docx") {
      return await extractDocxText(filePath);
    } else {
      // Default to plain text
      const buffer = await readFile(filePath);
      return buffer.toString("utf8");
    }
  } catch (error) {
    throw new Error(`Failed to extract text from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function extractPdfText(filePath: string): Promise<string> {
  const dataBuffer = await readFile(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

async function extractDocxText(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}
