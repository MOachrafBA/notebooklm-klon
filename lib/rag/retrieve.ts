import type { SourceChunk } from "./types";

export const MAX_CONTEXT_CHUNKS = 5;

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3),
  );
}

function scoreChunk(chunk: SourceChunk, questionTokens: Set<string>): number {
  const chunkTokens = tokenize(chunk.text);
  return [...questionTokens].reduce(
    (score, token) => score + (chunkTokens.has(token) ? 1 : 0),
    0,
  );
}

export function retrieveRelevantChunks(
  chunks: SourceChunk[],
  question: string,
  maxChunks: number = MAX_CONTEXT_CHUNKS,
): SourceChunk[] {
  if (maxChunks <= 0) {
    return [];
  }

  const questionTokens = tokenize(question);
  const rankedChunks = chunks
    .map((chunk, position) => ({
      chunk,
      position,
      score: scoreChunk(chunk, questionTokens),
    }))
    .sort((left, right) => right.score - left.score || left.position - right.position);

  const matchingChunks = rankedChunks
    .filter(({ score }) => score > 0)
    .slice(0, maxChunks)
    .map(({ chunk }) => chunk);

  if (matchingChunks.length > 0) {
    return matchingChunks;
  }

  return chunks.slice(0, maxChunks);
}
