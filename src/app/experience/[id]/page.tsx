import { Navbar } from '@/components/features';
import {
  ImageGallery,
  BookingWidget,
  ReviewsSection,
} from '@/components/features';
import { formatDuration, formatGroupSize } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HOSTS, getHostById } from '@/lib/data/hosts';

// Category labels
const CATEGORY_DISPLAY: Record<string, { label: string; icon: string }> = {
  'food-drink': { label: 'Food & Drink', icon: '🍽️' },
  'arts-culture': { label: 'Arts & Culture', icon: '🎨' },
  'outdoor-adventure': { label: 'Outdoor & Adventure', icon: '🏔️' },
  'wellness': { label: 'Wellness', icon: '🧘' },
  'learning': { label: 'Learning', icon: '📚' },
  'nightlife-social': { label: 'Nightlife & Social', icon: '🌃' },
  'family': { label: 'Family', icon: '👨‍👩‍👧‍👦' },
};

// Extended experience data with long description
const EXPERIENCE_DETAILS: Record<string, { 
  longDescription: string;
  includedItems: string[];
  excludedItems: string[];
  neighborhood: string;
  photos: string[];
  reviews: { id: string; rating: number; content: string; createdAt: Date; reviewer: { name: string; image: string | null } }[];
}> = {
  '1': {
    longDescription: `Join me in my family home for an authentic Italian cooking experience. We'll prepare a traditional Roman dinner together—fresh pasta from scratch, classic cacio e pepe, and my grandmother's secret tiramisù recipe.

The evening starts at golden hour on my rooftop terrace with an aperitivo while I share stories of my family's culinary traditions. Then we'll head to my kitchen where you'll learn techniques passed down through four generations.

This isn't just a cooking class—it's an invitation into my family's home and heritage.`,
    includedItems: ['All ingredients', 'Wine pairing', 'Recipe cards', 'Apron to keep'],
    excludedItems: ['Transportation to venue'],
    neighborhood: 'Trastevere',
    photos: [
      'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&h=600&fit=crop',
    ],
    reviews: [
      {
        id: 'rev-1',
        rating: 5,
        content: "Absolutely magical evening! Maria welcomed us like family, and her pasta is the best I've ever had.",
        createdAt: new Date('2024-12-15'),
        reviewer: { name: 'Sarah M.', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop' },
      },
      {
        id: 'rev-2',
        rating: 5,
        content: "The highlight of our trip to Italy. Maria is such a wonderful host.",
        createdAt: new Date('2024-11-28'),
        reviewer: { name: 'James T.', image: null },
      },
    ],
  },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

// Find experience from HOSTS data
function findExperience(id: string) {
  for (const host of HOSTS) {
    const exp = host.experiences.find(e => e.id === id);
    if (exp) {
      return { experience: exp, host };
    }
  }
  return null;
}

export default async function ExperienceDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  const found = findExperience(id);
  if (!found) {
    notFound();
  }

  const { experience, host } = found;
  const details = EXPERIENCE_DETAILS[id] || {
    longDescription: experience.description,
    includedItems: [],
    excludedItems: [],
    neighborhood: '',
    photos: [experience.photo],
    reviews: [],
  };

  const categoryInfo = CATEGORY_DISPLAY[experience.category] || { label: experience.category, icon: '✨' };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <main className="pt-20">
        {/* Image Gallery */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <ImageGallery images={details.photos} title={experience.title} />
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Left Column - Details */}
            <div className="flex-1">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-4">
                <Link href="/hosts" className="hover:text-[var(--foreground)] transition-colors">
                  Locals
                </Link>
                <span>/</span>
                <Link 
                  href={`/hosts/${host.id}`}
                  className="hover:text-[var(--foreground)] transition-colors"
                >
                  {host.name}
                </Link>
              </nav>

              {/* HOST FIRST - This is the key change */}
              <div className="bg-[var(--sand-beige-light)] rounded-2xl p-6 mb-8">
                <div className="flex items-start gap-4">
                  <Link href={`/hosts/${host.id}`}>
                    <img
                      src={host.photo}
                      alt={host.name}
                      className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-md hover:scale-105 transition-transform"
                    />
                  </Link>
                  <div className="flex-1">
                    <Link href={`/hosts/${host.id}`} className="hover:text-[var(--sunset-orange)] transition-colors">
                      <h2 className="text-xl font-semibold text-[var(--foreground)]">
                        An experience with {host.name}
                      </h2>
                    </Link>
                    <p className="text-[var(--muted-foreground)] text-sm mt-1">
                      📍 {host.city}, {host.country} • Speaks {host.languages.join(', ')}
                    </p>
                    <p className="text-[var(--foreground)] mt-3 text-sm italic line-clamp-2">
                      "{host.quote}"
                    </p>
                  </div>
                </div>
                <Link 
                  href={`/hosts/${host.id}`}
                  className="inline-block mt-4 text-[var(--sunset-orange)] hover:underline text-sm font-medium"
                >
                  See all of {host.name.split(' ')[0]}'s experiences →
                </Link>
              </div>

              {/* Category Badge */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--sand-beige-light)] text-sm font-medium mb-3">
                {categoryInfo.icon} {categoryInfo.label}
              </span>

              {/* Title */}
              <h1 className="text-3xl sm:text-4xl font-bold text-[var(--foreground)] mb-4">
                {experience.title}
              </h1>

              {/* Quick Info */}
              <div className="flex flex-wrap items-center gap-4 text-[var(--muted-foreground)] mb-6">
                <div className="flex items-center gap-1">
                  <span className="text-[var(--sunset-orange)]">★</span>
                  <span className="font-medium text-[var(--foreground)]">{experience.rating}</span>
                  <span>({experience.reviewCount} reviews)</span>
                </div>
                {details.neighborhood && (
                  <>
                    <span>•</span>
                    <span>📍 {details.neighborhood}, {host.city}</span>
                  </>
                )}
                <span>•</span>
                <span>⏱️ {formatDuration(experience.duration)}</span>
              </div>

              {/* Description */}
              <div className="prose prose-lg max-w-none mb-8">
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                  About this experience
                </h2>
                <div className="text-[var(--foreground)] whitespace-pre-line">
                  {details.longDescription}
                </div>
              </div>

              {/* What's Included */}
              {details.includedItems.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                    What's included
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {details.includedItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-[var(--forest-green)]" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span className="text-[var(--foreground)]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* What's Not Included */}
              {details.excludedItems.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                    Not included
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {details.excludedItems.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <svg className="h-5 w-5 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <span className="text-[var(--muted-foreground)]">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* More from this host */}
              {host.experiences.length > 1 && (
                <div className="mb-8 border-t border-[var(--border)] pt-8">
                  <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                    More from {host.name.split(' ')[0]}
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {host.experiences
                      .filter(e => e.id !== id)
                      .map(exp => (
                        <Link
                          key={exp.id}
                          href={`/experience/${exp.id}`}
                          className="group bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-all"
                        >
                          <div className="aspect-video overflow-hidden">
                            <img
                              src={exp.photo}
                              alt={exp.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                          <div className="p-4">
                            <h3 className="font-medium text-[var(--foreground)] group-hover:text-[var(--sunset-orange)] transition-colors line-clamp-1">
                              {exp.title}
                            </h3>
                            <div className="flex items-center justify-between mt-2 text-sm">
                              <span className="text-[var(--sunset-orange)]">★ {exp.rating}</span>
                              <span className="font-semibold">${(exp.price / 100).toFixed(0)}</span>
                            </div>
                          </div>
                        </Link>
                      ))}
                  </div>
                </div>
              )}

              {/* Reviews */}
              {details.reviews.length > 0 && (
                <div className="border-t border-[var(--border)] pt-8">
                  <h2 className="text-xl font-semibold text-[var(--foreground)] mb-6">
                    Reviews
                  </h2>
                  <ReviewsSection
                    reviews={details.reviews}
                    averageRating={experience.rating}
                    totalCount={experience.reviewCount}
                  />
                </div>
              )}
            </div>

            {/* Right Column - Booking Widget */}
            <div className="lg:w-96">
              <BookingWidget
                experienceId={experience.id}
                price={experience.price}
                currency="USD"
                minGroupSize={1}
                maxGroupSize={6}
                rating={experience.rating}
                reviewCount={experience.reviewCount}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
