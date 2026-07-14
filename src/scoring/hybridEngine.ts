import { cosineSimilarity, generateEmbeddings } from "../intelligence/embeddings";
import type { EvidenceChunk } from "../intelligence/chunker";
import type { JobRequirement } from "../domain";

export interface RankedEvidence extends EvidenceChunk {
  score: number;
}

/**
 * Calculates a simple BM25-like lexical overlap score.
 */
function calculateLexicalScore(query: string, text: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const textWords = text.toLowerCase().split(/\s+/);
  
  let matches = 0;
  for (const qw of queryWords) {
    if (textWords.includes(qw)) {
      matches++;
    }
  }
  return matches / (queryWords.length || 1);
}

/**
 * Simulates ARMO Optimizer & Hybrid Matching Engine.
 * Combines BM25 and Semantic Embeddings to find Top-K Evidence.
 */
export async function retrieveTopEvidence(
  requirement: JobRequirement,
  chunks: EvidenceChunk[],
  k: number = 3,
  precomputedChunkEmbeddings?: number[][]
): Promise<RankedEvidence[]> {
  if (chunks.length === 0) return [];

  // Generate embedding for the requirement
  const [reqEmbedding] = await generateEmbeddings([requirement.rawText]);
  
  // Generate embeddings for all chunks (in a real system, these would be pre-computed and stored in pgvector)
  const chunkEmbeddings = precomputedChunkEmbeddings || await generateEmbeddings(chunks.map(c => c.text));

  const scoredChunks = chunks.map((chunk, index) => {
    const semanticScore = cosineSimilarity(reqEmbedding, chunkEmbeddings[index]);
    const lexicalScore = calculateLexicalScore(requirement.rawText, chunk.text);
    
    // Hybrid Score calculation (alpha = 0.7 semantic, 0.3 lexical)
    // ARMO Optimizer would dynamically tune these weights based on graph context
    const hybridScore = (0.7 * semanticScore) + (0.3 * lexicalScore);

    return {
      ...chunk,
      score: hybridScore
    };
  });

  // Sort descending by score and take Top K
  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
