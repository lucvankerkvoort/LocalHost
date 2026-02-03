'use client';

import { formatRelativeTime } from '@/lib/utils';

interface Review {
  id: string;
  rating: number;
  content: string;
  createdAt: Date | string;
  reviewer: {
    name: string | null;
    image: string | null;
  };
}

interface ReviewsSectionProps {
  reviews: Review[];
  averageRating: number;
  totalCount: number;
}

export function ReviewsSection({ reviews, averageRating, totalCount }: ReviewsSectionProps) {
  // Calculate rating distribution
  const ratingCounts = [0, 0, 0, 0, 0]; // 1-5 stars
  reviews.forEach((review) => {
    if (review.rating >= 1 && review.rating <= 5) {
      ratingCounts[review.rating - 1]++;
    }
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold text-[var(--foreground)]">
            {averageRating.toFixed(1)}
          </span>
          <div className="flex">
            {[1, 2, 3, 4, 5].map((star) => (
              <svg
                key={star}
                className={`h-5 w-5 ${
                  star <= Math.round(averageRating)
                    ? 'text-[var(--accent)]'
                    : 'text-gray-200'
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
        </div>
        <span className="text-[var(--muted-foreground)]">
          {totalCount} {totalCount === 1 ? 'review' : 'reviews'}
        </span>
      </div>

      {/* Rating Distribution */}
      <div className="mb-8 space-y-2">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = ratingCounts[rating - 1];
          const percentage = totalCount > 0 ? (count / totalCount) * 100 : 0;
          return (
            <div key={rating} className="flex items-center gap-3">
              <span className="text-sm text-[var(--muted-foreground)] w-8">
                {rating} ★
              </span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-sm text-[var(--muted-foreground)] w-8 text-right">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* Reviews List */}
      {reviews.length > 0 ? (
        <div className="space-y-6">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="pb-6 border-b border-[var(--border)] last:border-0"
            >
              {/* Reviewer */}
              <div className="flex items-center gap-3 mb-3">
                {review.reviewer.image ? (
                  <img
                    src={review.reviewer.image}
                    alt={review.reviewer.name || 'Reviewer'}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[var(--muted)]/20 text-[var(--foreground)] flex items-center justify-center text-sm font-medium">
                    {review.reviewer.name?.[0] || '?'}
                  </div>
                )}
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {review.reviewer.name || 'Anonymous'}
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {formatRelativeTime(review.createdAt)}
                  </p>
                </div>
              </div>

              {/* Rating */}
              <div className="flex mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg
                    key={star}
                    className={`h-4 w-4 ${
                      star <= review.rating
                        ? 'text-[var(--accent)]'
                        : 'text-gray-200'
                    }`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              {/* Content */}
              <p className="text-[var(--foreground)]">{review.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-[var(--muted-foreground)]">No reviews yet</p>
        </div>
      )}
    </div>
  );
}
