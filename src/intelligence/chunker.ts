export interface EvidenceChunk {
  id: string;
  sourceSection: string;
  text: string;
}

/**
 * Splits the candidate digital profile (parsed sections) into semantic chunks.
 * In a real pipeline, this would use a sliding window or sentence boundary detection.
 */
export function generateEvidenceChunks(
  candidateId: string, 
  sections: Record<string, string[]>
): EvidenceChunk[] {
  const chunks: EvidenceChunk[] = [];
  let chunkId = 1;

  for (const [sectionName, lines] of Object.entries(sections)) {
    // A simple chunking strategy: group every 2 lines into a chunk.
    for (let i = 0; i < lines.length; i += 2) {
      const chunkText = lines.slice(i, i + 2).join(" ");
      if (chunkText.trim()) {
        chunks.push({
          id: `chunk-${candidateId}-${sectionName}-${chunkId++}`,
          sourceSection: sectionName,
          text: chunkText.trim(),
        });
      }
    }
  }

  return chunks;
}
