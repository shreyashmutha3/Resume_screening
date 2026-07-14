import { cosineSimilarity } from "./embeddings";
import type { EvidenceChunk } from "./chunker";

export class BM25 {
  private k1 = 1.5;
  private b = 0.75;
  private docLengths: Map<string, number> = new Map();
  private avgDocLength = 0;
  private docFrequencies: Map<string, number> = new Map();
  private termFrequencies: Map<string, Map<string, number>> = new Map(); // chunkId -> (term -> freq)
  private totalDocs = 0;

  constructor(chunks: EvidenceChunk[]) {
    this.totalDocs = chunks.length;
    let totalLen = 0;

    for (const chunk of chunks) {
      const tokens = this.tokenize(chunk.text);
      this.docLengths.set(chunk.id, tokens.length);
      totalLen += tokens.length;

      const tf = new Map<string, number>();
      const uniqueTokens = new Set<string>();

      for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
        uniqueTokens.add(token);
      }

      this.termFrequencies.set(chunk.id, tf);

      for (const token of uniqueTokens) {
        this.docFrequencies.set(token, (this.docFrequencies.get(token) || 0) + 1);
      }
    }

    if (this.totalDocs > 0) {
      this.avgDocLength = totalLen / this.totalDocs;
    }
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().match(/\w+/g) || [];
  }

  public score(query: string, chunkId: string): number {
    const queryTokens = this.tokenize(query);
    let score = 0;

    const tfMap = this.termFrequencies.get(chunkId);
    if (!tfMap) return 0;

    const docLen = this.docLengths.get(chunkId) || 0;

    for (const token of queryTokens) {
      const tf = tfMap.get(token) || 0;
      if (tf === 0) continue;

      const df = this.docFrequencies.get(token) || 0;
      
      // IDF
      const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));
      
      // TF term
      const tfTerm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength)));

      score += idf * tfTerm;
    }

    return score;
  }
}

// Simple Jaccard similarity for KG
function kgOverlap(text: string, kgNodes: string[]): number {
  if (kgNodes.length === 0) return 0;
  const lowerText = text.toLowerCase();
  let matches = 0;
  for (const node of kgNodes) {
    if (lowerText.includes(node.toLowerCase())) matches++;
  }
  return matches / kgNodes.length;
}

export function computeHybridSearch(
  query: string, 
  queryEmbedding: number[],
  kgNodes: string[],
  chunks: EvidenceChunk[],
  chunkEmbeddings: Map<string, number[]>,
  topK: number = 5
): Array<{ chunk: EvidenceChunk; hybridScore: number; vectorScore: number; bm25Score: number }> {
  const bm25 = new BM25(chunks);

  // We need to normalize BM25 scores to [0,1] for hybrid fusion, or use rank fusion (RRF). 
  // For simplicity, we'll just min-max scale BM25 or just cap it.
  let maxBm25 = 0;
  const rawScores = chunks.map(chunk => {
    const bm25Score = bm25.score(query, chunk.id);
    if (bm25Score > maxBm25) maxBm25 = bm25Score;
    
    const vecScore = cosineSimilarity(queryEmbedding, chunkEmbeddings.get(chunk.id) || []);
    const kgScore = kgOverlap(chunk.text, kgNodes);

    return { chunk, bm25Score, vecScore, kgScore };
  });

  const results = rawScores.map(res => {
    const normalizedBm25 = maxBm25 > 0 ? res.bm25Score / maxBm25 : 0;
    // Weights: 40% Vector, 40% BM25, 20% KG
    const hybridScore = (0.4 * res.vecScore) + (0.4 * normalizedBm25) + (0.2 * res.kgScore);
    return {
      chunk: res.chunk,
      hybridScore,
      vectorScore: res.vecScore,
      bm25Score: normalizedBm25
    };
  });

  results.sort((a, b) => b.hybridScore - a.hybridScore);
  return results.slice(0, topK);
}
