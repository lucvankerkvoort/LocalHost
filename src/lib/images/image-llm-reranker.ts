import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

import { OPENAI_IMAGE_RERANK_MODEL } from '@/lib/ai/model-config';

type PhotoCandidate = {
  providerImageId?: string;
  url: string;
  title?: string;
  description?: string;
  city?: string;
  country?: string;
  tags?: string[];
};

export type PlacePhotoBatchInput = {
  placeKey?: string;
  place: string;
  city?: string;
  country?: string;
  category?: string;
  photos: PhotoCandidate[];
};

type SanitizedPhotoCandidate = Omit<PhotoCandidate, 'providerImageId'> & {
  providerImageId: string;
};

type SanitizedPlacePhotoBatchInput = Omit<PlacePhotoBatchInput, 'placeKey' | 'photos'> & {
  placeKey: string;
  photos: SanitizedPhotoCandidate[];
};

export type LlmPhotoScore = {
  providerImageId: string;
  relevanceScore: number;
  reasonCodes: string[];
};

export type PlacePhotoBatchScore = {
  placeKey: string;
  scores: LlmPhotoScore[];
};

const MAX_PLACES_PER_BATCH = 6;
const MAX_PHOTOS_PER_PLACE = 15;

const LlmPhotoScoreSchema = z.object({
  providerImageId: z.string().min(1),
  relevanceScore: z.number().min(0).max(1),
  reasonCodes: z.array(z.string().min(1)).max(8).default([]),
});

const LlmRerankResponseSchema = z.object({
  results: z
    .array(
      z.object({
        placeKey: z.string().min(1),
        scores: z.array(LlmPhotoScoreSchema).default([]),
      })
    )
    .default([]),
});

type LlmRerankResponse = z.infer<typeof LlmRerankResponseSchema>;

type BatchRerankExecutor = (
  input: SanitizedPlacePhotoBatchInput[]
) => Promise<PlacePhotoBatchScore[]>;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function chunkBatches(input: SanitizedPlacePhotoBatchInput[]): SanitizedPlacePhotoBatchInput[][] {
  const chunks: SanitizedPlacePhotoBatchInput[][] = [];
  for (let i = 0; i < input.length; i += MAX_PLACES_PER_BATCH) {
    chunks.push(input.slice(i, i + MAX_PLACES_PER_BATCH));
  }
  return chunks;
}

function sanitizeInput(input: PlacePhotoBatchInput[]): SanitizedPlacePhotoBatchInput[] {
  return input
    .map((batch, index) => {
      const normalizedPlace = batch.place.trim();
      const fallbackKey = `${index}:${normalizedPlace.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
      return {
      ...batch,
      placeKey: batch.placeKey?.trim() || fallbackKey,
      place: normalizedPlace,
      photos: batch.photos
        .filter((photo) => Boolean(photo.url))
        .slice(0, MAX_PHOTOS_PER_PLACE)
        .map((photo, photoIndex) => ({
          providerImageId: photo.providerImageId?.trim() || `${fallbackKey}:photo-${photoIndex}`,
          url: photo.url,
          title: photo.title,
          description: photo.description,
          city: photo.city,
          country: photo.country,
          tags: Array.isArray(photo.tags) ? photo.tags.slice(0, 8) : [],
        })),
      };
    })
    .filter((batch) => Boolean(batch.place) && batch.photos.length > 0);
}

function buildInstructionText(batchInput: SanitizedPlacePhotoBatchInput[]): string {
  return [
    'You are an image relevance scorer for a travel planner.',
    'Score each photo for how semantically relevant it is for the requested place context.',
    'Prioritize correctness of place identity over aesthetics or image quality.',
    'Return ONLY valid JSON for the provided schema.',
    'Scoring rules:',
    '- 0.90-1.00: Exact place/landmark match.',
    '- 0.70-0.89: Strongly likely match.',
    '- 0.40-0.69: Plausible but generic or ambiguous.',
    '- 0.00-0.39: Wrong place or wrong subject.',
    'Reason codes must be short snake_case tokens.',
    'Do not emit unknown placeKey values or unknown providerImageId values.',
    'The following entries map metadata to images:',
    ...batchInput.flatMap((batch) => [
      `PLACE|${batch.placeKey}|${batch.place}|city=${batch.city ?? ''}|country=${batch.country ?? ''}|category=${batch.category ?? ''}`,
      ...batch.photos.map((photo) =>
        `PHOTO|${batch.placeKey}|${photo.providerImageId}|title=${photo.title ?? ''}|description=${photo.description ?? ''}|city=${photo.city ?? ''}|country=${photo.country ?? ''}|tags=${(photo.tags ?? []).join(',')}`
      ),
    ]),
  ].join('\n');
}

function sanitizeLlmOutput(
  input: SanitizedPlacePhotoBatchInput[],
  output: LlmRerankResponse
): PlacePhotoBatchScore[] {
  const knownPlaceMap = new Map<string, Set<string>>();

  input.forEach((batch) => {
    knownPlaceMap.set(
      batch.placeKey,
      new Set(batch.photos.map((photo) => photo.providerImageId))
    );
  });

  return output.results
    .filter((result) => knownPlaceMap.has(result.placeKey))
    .map((result) => {
      const knownIds = knownPlaceMap.get(result.placeKey)!;
      const deduped = new Map<string, LlmPhotoScore>();

      result.scores.forEach((score) => {
        if (!knownIds.has(score.providerImageId)) return;
        if (deduped.has(score.providerImageId)) return;
        deduped.set(score.providerImageId, {
          providerImageId: score.providerImageId,
          relevanceScore: clamp01(score.relevanceScore),
          reasonCodes: score.reasonCodes.slice(0, 8),
        });
      });

      return {
        placeKey: result.placeKey,
        scores: Array.from(deduped.values()),
      };
    });
}

async function defaultBatchRerankExecutor(
  input: SanitizedPlacePhotoBatchInput[]
): Promise<PlacePhotoBatchScore[]> {
  if (input.length === 0) return [];

  try {
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; image: URL }
    > = [{ type: 'text', text: buildInstructionText(input) }];

    input.forEach((batch) => {
      batch.photos.forEach((photo) => {
        try {
          userContent.push({ type: 'image', image: new URL(photo.url) });
        } catch {
          // Ignore malformed URLs; metadata remains in text instruction.
        }
      });
    });

    const { object } = await generateObject({
      model: openai(OPENAI_IMAGE_RERANK_MODEL),
      schema: LlmRerankResponseSchema,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    return sanitizeLlmOutput(input, object);
  } catch (error) {
    console.warn('[image-llm-reranker] failed to rerank image batch', error);
    return [];
  }
}

let batchRerankExecutor: BatchRerankExecutor = defaultBatchRerankExecutor;

export function __setImageBatchRerankExecutorForTests(executor: BatchRerankExecutor | null): void {
  batchRerankExecutor = executor ?? defaultBatchRerankExecutor;
}

export async function rerankPlacePhotoBatchesWithLlm(
  input: PlacePhotoBatchInput[]
): Promise<PlacePhotoBatchScore[]> {
  const sanitized = sanitizeInput(input);
  if (sanitized.length === 0) return [];

  const chunks = chunkBatches(sanitized);
  const chunkResults = await Promise.all(chunks.map((chunk) => batchRerankExecutor(chunk)));
  return chunkResults.flat();
}
