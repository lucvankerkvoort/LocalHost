import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __setImageBatchRerankExecutorForTests,
  rerankPlacePhotoBatchesWithLlm,
  type PlacePhotoBatchInput,
} from './image-llm-reranker';

function makeBatch(index: number, photoCount = 20): PlacePhotoBatchInput {
  return {
    placeKey: `place-${index}`,
    place: `Place ${index}`,
    city: 'Springdale',
    country: 'United States',
    category: 'landmark',
    photos: Array.from({ length: photoCount }, (_, photoIndex) => ({
      providerImageId: `p-${index}-${photoIndex}`,
      url: `https://images.example.com/${index}/${photoIndex}.jpg`,
      title: `Candidate ${photoIndex}`,
      tags: ['zion', 'narrows'],
    })),
  };
}

test('rerankPlacePhotoBatchesWithLlm chunks by place and caps photos per place', async () => {
  const seenChunkSizes: number[] = [];
  const seenPhotoCounts: number[] = [];

  __setImageBatchRerankExecutorForTests(async (input) => {
    seenChunkSizes.push(input.length);
    input.forEach((batch) => seenPhotoCounts.push(batch.photos.length));
    return [];
  });

  const batches = Array.from({ length: 7 }, (_, index) => makeBatch(index, 20));
  const result = await rerankPlacePhotoBatchesWithLlm(batches);

  assert.deepEqual(result, []);
  assert.deepEqual(seenChunkSizes, [6, 1]);
  assert.equal(seenPhotoCounts.every((count) => count === 15), true);

  __setImageBatchRerankExecutorForTests(null);
});

test('rerankPlacePhotoBatchesWithLlm returns combined results across chunks', async () => {
  let callIndex = 0;

  __setImageBatchRerankExecutorForTests(async (input) => {
    callIndex += 1;
    return input.map((batch) => ({
      placeKey: batch.placeKey,
      scores: [
        {
          providerImageId: batch.photos[0]?.providerImageId ?? `${batch.placeKey}-missing`,
          relevanceScore: callIndex === 1 ? 0.82 : 0.64,
          reasonCodes: ['semantic_match'],
        },
      ],
    }));
  });

  const result = await rerankPlacePhotoBatchesWithLlm([
    makeBatch(1, 1),
    makeBatch(2, 1),
    makeBatch(3, 1),
    makeBatch(4, 1),
    makeBatch(5, 1),
    makeBatch(6, 1),
    makeBatch(7, 1),
  ]);

  assert.equal(result.length, 7);
  assert.equal(result[0]?.scores[0]?.reasonCodes[0], 'semantic_match');

  __setImageBatchRerankExecutorForTests(null);
});

test('rerankPlacePhotoBatchesWithLlm auto-generates providerImageId when missing', async () => {
  let firstPhotoId = '';

  __setImageBatchRerankExecutorForTests(async (input) => {
    firstPhotoId = input[0]?.photos[0]?.providerImageId ?? '';
    return [];
  });

  await rerankPlacePhotoBatchesWithLlm([
    {
      place: 'Zion National Park The Narrows',
      photos: [
        {
          url: 'https://images.example.com/zion/narrows-1.jpg',
        },
      ],
    },
  ]);

  assert.equal(firstPhotoId.includes('photo-0'), true);
  __setImageBatchRerankExecutorForTests(null);
});
