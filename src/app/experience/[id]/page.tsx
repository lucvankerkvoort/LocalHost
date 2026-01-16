import { Navbar } from '@/components/features';
import {
  ImageGallery,
  BookingWidget,
  HostProfileCard,
  ReviewsSection,
} from '@/components/features';
import { formatDuration, formatGroupSize } from '@/lib/utils';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// Mock experiences data (same as explore page for now)
const MOCK_EXPERIENCES = [
  {
    id: '1',
    title: 'Sunset Cooking Class with Nonna Maria',
    description: `Join me in my family home for an authentic Italian cooking experience. We'll prepare a traditional Roman dinner together—fresh pasta from scratch, classic cacio e pepe, and my grandmother's secret tiramisù recipe.

The evening starts at golden hour on my rooftop terrace with an aperitivo while I share stories of my family's culinary traditions. Then we'll head to my kitchen where you'll learn techniques passed down through four generations.

This isn't just a cooking class—it's an invitation into my family's home and heritage.

**What to expect:**
- Hands-on pasta making from scratch
- Traditional Roman recipes
- Stories and tips from a local
- A full meal with wine pairing
- Recipes to take home`,
    category: 'FOOD_DRINK',
    neighborhood: 'Trastevere',
    city: 'Rome',
    country: 'Italy',
    duration: 180,
    minGroupSize: 2,
    maxGroupSize: 6,
    price: 7500,
    currency: 'USD',
    includedItems: ['All ingredients', 'Wine pairing', 'Recipe cards', 'Apron to keep'],
    excludedItems: ['Transportation to venue'],
    photos: [
      'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1498579150354-977475b7ea0b?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop',
    ],
    rating: 4.9,
    reviewCount: 127,
    host: {
      id: 'host-1',
      name: 'Maria Rossi',
      image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop',
      bio: "Born and raised in Rome. I love sharing my family's traditional recipes with travelers from around the world. Cooking has been my passion since I was a little girl watching my nonna in the kitchen.",
      city: 'Rome',
      country: 'Italy',
      languages: ['Italian', 'English'],
      verificationTier: 'TRUSTED',
      trustScore: 95,
      memberSince: new Date('2021-03-15'),
    },
    reviews: [
      {
        id: 'rev-1',
        rating: 5,
        content: "Absolutely magical evening! Maria welcomed us like family, and her pasta is the best I've ever had. The stories about her grandmother brought tears to my eyes. A must-do experience in Rome!",
        createdAt: new Date('2024-12-15'),
        reviewer: { name: 'Sarah M.', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop' },
      },
      {
        id: 'rev-2',
        rating: 5,
        content: "The highlight of our trip to Italy. Maria is such a wonderful host - warm, funny, and an amazing cook. We learned so much and left with full bellies and happy hearts.",
        createdAt: new Date('2024-11-28'),
        reviewer: { name: 'James T.', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop' },
      },
      {
        id: 'rev-3',
        rating: 4,
        content: "Great experience overall! The food was delicious and Maria really knows her stuff. Only minor note - the apartment was a bit warm, but the rooftop terrace views made up for it.",
        createdAt: new Date('2024-10-10'),
        reviewer: { name: 'Emma L.', image: null },
      },
    ],
  },
  {
    id: '2',
    title: 'Hidden Murals Walking Tour',
    description: `Discover the stories painted on the walls of Mexico City's most vibrant neighborhoods. As a local street art historian, I'll take you beyond the tourist spots to see murals that tell the real story of our city.

We'll explore hidden alleys, meet local artists, and learn about the political and cultural movements that inspired these works. Each mural has a story, and I know them all.

**What we'll see:**
- Historic murals from the 1920s-present
- Hidden artist studios
- Underground galleries
- Local street food stops

This tour is perfect for photography lovers—I'll show you the best angles and times for capturing these incredible works.`,
    category: 'ARTS_CULTURE',
    neighborhood: 'Roma Norte',
    city: 'Mexico City',
    country: 'Mexico',
    duration: 150,
    minGroupSize: 1,
    maxGroupSize: 8,
    price: 3500,
    currency: 'USD',
    includedItems: ['Local snacks', 'Bottled water', 'Digital photo album'],
    excludedItems: ['Transportation', 'Lunch'],
    photos: [
      'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=800&h=600&fit=crop',
    ],
    rating: 4.8,
    reviewCount: 89,
    host: {
      id: 'host-2',
      name: 'Carlos Mendez',
      image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop',
      bio: 'Street art enthusiast and local historian. Let me show you the hidden murals that tell the story of our city.',
      city: 'Mexico City',
      country: 'Mexico',
      languages: ['Spanish', 'English'],
      verificationTier: 'VERIFIED',
      trustScore: 88,
      memberSince: new Date('2022-06-01'),
    },
    reviews: [],
  },
  {
    id: '3',
    title: 'Mountain Sunrise Hike & Breakfast',
    description: `Experience the magic of a Japanese mountain sunrise followed by a traditional breakfast in nature.

We'll start early (5am pickup) to hike up Mount Daimonji as the first light appears. The trail is moderate and suitable for most fitness levels. At the summit, we'll watch the sun rise over Kyoto's ancient temples.

After descending, we'll enjoy a traditional Japanese breakfast I've prepared—rice, miso soup, grilled fish, pickles, and freshly brewed green tea—all while overlooking the city.

**What makes this special:**
- Certified hiking guide (safety first!)
- Authentic Japanese breakfast
- Small groups only
- Sunrise meditation (optional)
- Photography tips for capturing the moment`,
    category: 'OUTDOOR_ADVENTURE',
    neighborhood: 'Higashiyama',
    city: 'Kyoto',
    country: 'Japan',
    duration: 240,
    minGroupSize: 2,
    maxGroupSize: 4,
    price: 5000,
    currency: 'USD',
    includedItems: ['Traditional breakfast', 'Green tea', 'Hiking poles', 'First aid kit'],
    excludedItems: ['Hotel pickup outside central Kyoto'],
    photos: [
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=600&fit=crop',
    ],
    rating: 5.0,
    reviewCount: 64,
    host: {
      id: 'host-3',
      name: 'Yuki Tanaka',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop',
      bio: 'Nature lover and certified hiking guide. Join me for sunrise hikes with traditional Japanese breakfast.',
      city: 'Kyoto',
      country: 'Japan',
      languages: ['Japanese', 'English'],
      verificationTier: 'TRUSTED',
      trustScore: 92,
      memberSince: new Date('2020-09-10'),
    },
    reviews: [],
  },
];

// Category labels
const CATEGORY_DISPLAY: Record<string, { label: string; icon: string }> = {
  FOOD_DRINK: { label: 'Food & Drink', icon: '🍽️' },
  ARTS_CULTURE: { label: 'Arts & Culture', icon: '🎨' },
  OUTDOOR_ADVENTURE: { label: 'Outdoor & Adventure', icon: '🏔️' },
  WELLNESS: { label: 'Wellness', icon: '🧘' },
  LEARNING: { label: 'Learning', icon: '📚' },
  NIGHTLIFE_SOCIAL: { label: 'Nightlife & Social', icon: '🌃' },
  FAMILY: { label: 'Family', icon: '👨‍👩‍👧‍👦' },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExperienceDetailPage({ params }: PageProps) {
  const { id } = await params;
  
  // Find experience by ID
  const experience = MOCK_EXPERIENCES.find((exp) => exp.id === id);

  if (!experience) {
    notFound();
  }

  const categoryInfo = CATEGORY_DISPLAY[experience.category] || { label: experience.category, icon: '✨' };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <main className="pt-20">
        {/* Image Gallery */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <ImageGallery images={experience.photos} title={experience.title} />
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row gap-12">
            {/* Left Column - Details */}
            <div className="flex-1">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] mb-4">
                <Link href="/explore" className="hover:text-[var(--foreground)] transition-colors">
                  Explore
                </Link>
                <span>/</span>
                <Link 
                  href={`/explore?category=${experience.category}`}
                  className="hover:text-[var(--foreground)] transition-colors"
                >
                  {categoryInfo.label}
                </Link>
              </nav>

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
                <span>•</span>
                <span>📍 {experience.neighborhood}, {experience.city}</span>
                <span>•</span>
                <span>⏱️ {formatDuration(experience.duration)}</span>
                <span>•</span>
                <span>👥 {formatGroupSize(experience.minGroupSize, experience.maxGroupSize)}</span>
              </div>

              {/* Description */}
              <div className="prose prose-lg max-w-none mb-8">
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                  About this experience
                </h2>
                <div className="text-[var(--foreground)] whitespace-pre-line">
                  {experience.description}
                </div>
              </div>

              {/* What's Included */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                  What's included
                </h2>
                <div className="grid sm:grid-cols-2 gap-3">
                  {experience.includedItems.map((item, index) => (
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

              {/* What's Not Included */}
              {experience.excludedItems.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                    Not included
                  </h2>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {experience.excludedItems.map((item, index) => (
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

              {/* Host Profile */}
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                  Meet your host
                </h2>
                <HostProfileCard
                  id={experience.host.id}
                  name={experience.host.name}
                  image={experience.host.image}
                  bio={experience.host.bio}
                  city={experience.host.city}
                  country={experience.host.country}
                  languages={experience.host.languages}
                  verificationTier={experience.host.verificationTier}
                  trustScore={experience.host.trustScore}
                  reviewCount={experience.reviewCount}
                  memberSince={experience.host.memberSince}
                />
              </div>

              {/* Reviews */}
              <div className="border-t border-[var(--border)] pt-8">
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-6">
                  Reviews
                </h2>
                <ReviewsSection
                  reviews={experience.reviews}
                  averageRating={experience.rating}
                  totalCount={experience.reviewCount}
                />
              </div>
            </div>

            {/* Right Column - Booking Widget */}
            <div className="lg:w-96">
              <BookingWidget
                experienceId={experience.id}
                price={experience.price}
                currency={experience.currency}
                minGroupSize={experience.minGroupSize}
                maxGroupSize={experience.maxGroupSize}
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
