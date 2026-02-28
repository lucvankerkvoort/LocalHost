import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';

/**
 * Utility functions for generating embeddings using OpenAI's text-embedding-3-small model.
 * Currently configured to return 1536-dimensional vectors.
 */

const EMBEDDING_MODEL = openai.embedding('text-embedding-3-small');

/**
 * Generate a single embedding vector for a given text string.
 * @param text The text content to embed.
 * @returns An array of numbers representing the 1536-dimensional vector.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: EMBEDDING_MODEL,
    value: text,
  });
  return embedding;
}

/**
 * Generate multiple embedding vectors for an array of text strings.
 * This is more efficient than calling generateEmbedding in a loop.
 * @param texts Array of text documents to embed.
 * @returns An array where each item is a 1536-dimensional vector.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: EMBEDDING_MODEL,
    values: texts,
  });
  return embeddings;
}
