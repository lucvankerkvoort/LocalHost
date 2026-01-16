import { Button } from '@/components/ui';
import { Navbar } from '@/components/features';
import Link from 'next/link';
import { CATEGORY_LABELS, CATEGORY_ICONS, type ExperienceCategory } from '@/types';

// Featured categories for the landing page
const FEATURED_CATEGORIES: ExperienceCategory[] = [
  'food-drink',
  'arts-culture',
  'outdoor-adventure',
  'wellness',
  'learning',
  'nightlife-social',
];

// Mock featured experiences for demo
const FEATURED_EXPERIENCES = [
  {
    id: '1',
    title: 'Sunset Cooking Class with Nonna Maria',
    host: 'Maria',
    location: 'Rome, Italy',
    price: 7500,
    rating: 4.9,
    reviewCount: 127,
    image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&h=400&fit=crop',
    category: 'food-drink' as ExperienceCategory,
  },
  {
    id: '2',
    title: 'Hidden Murals Walking Tour',
    host: 'Carlos',
    location: 'Mexico City, Mexico',
    price: 3500,
    rating: 4.8,
    reviewCount: 89,
    image: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=600&h=400&fit=crop',
    category: 'arts-culture' as ExperienceCategory,
  },
  {
    id: '3',
    title: 'Mountain Sunrise Hike & Breakfast',
    host: 'Yuki',
    location: 'Kyoto, Japan',
    price: 5000,
    rating: 5.0,
    reviewCount: 64,
    image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=400&fit=crop',
    category: 'outdoor-adventure' as ExperienceCategory,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--sand-beige)] via-[var(--background)] to-[var(--sunset-orange-light)]/20 -z-10" />
        
        {/* Decorative Elements */}
        <div className="absolute top-20 right-10 w-64 h-64 bg-[var(--sunset-orange)]/10 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-[var(--ocean-blue)]/10 rounded-full blur-3xl -z-10" />

        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[var(--foreground)] leading-tight mb-6">
              Discover Authentic{' '}
              <span className="text-[var(--sunset-orange)]">Local Experiences</span>
            </h1>
            <p className="text-lg sm:text-xl text-[var(--muted-foreground)] mb-8 max-w-2xl mx-auto">
              Connect with verified local hosts for intimate cooking classes, cultural tours, 
              outdoor adventures, and unforgettable moments—all in small groups.
            </p>
            
            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto">
              <input
                type="text"
                placeholder="Where are you going?"
                className="flex-1 px-5 py-3 rounded-lg border border-[var(--border)] bg-white text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--sunset-orange)] shadow-sm"
              />
              <Button variant="primary" size="lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)] mb-8 text-center">
            Explore by Category
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {FEATURED_CATEGORIES.map((category) => (
              <Link
                key={category}
                href={`/explore?category=${category}`}
                className="group flex flex-col items-center p-6 rounded-xl bg-[var(--sand-beige-light)] hover:bg-[var(--sunset-orange)] transition-all duration-300"
              >
                <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">
                  {CATEGORY_ICONS[category]}
                </span>
                <span className="text-sm font-medium text-[var(--foreground)] group-hover:text-white text-center transition-colors">
                  {CATEGORY_LABELS[category]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Experiences */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">
              Featured Experiences
            </h2>
            <Link href="/explore" className="text-[var(--sunset-orange)] hover:underline font-medium">
              View all →
            </Link>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURED_EXPERIENCES.map((experience) => (
              <article
                key={experience.id}
                className="group rounded-xl bg-white shadow-md overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
              >
                {/* Image */}
                <div className="relative aspect-video overflow-hidden">
                  <img
                    src={experience.image}
                    alt={experience.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 text-xs font-medium">
                      {CATEGORY_ICONS[experience.category]} {CATEGORY_LABELS[experience.category]}
                    </span>
                  </div>
                </div>
                
                {/* Content */}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-[var(--muted-foreground)]">
                      📍 {experience.location}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg text-[var(--foreground)] mb-2 line-clamp-2">
                    {experience.title}
                  </h3>
                  <p className="text-sm text-[var(--muted-foreground)] mb-3">
                    Hosted by {experience.host}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--sunset-orange)]">★</span>
                      <span className="font-medium">{experience.rating}</span>
                      <span className="text-[var(--muted-foreground)] text-sm">
                        ({experience.reviewCount})
                      </span>
                    </div>
                    <div className="font-semibold text-[var(--foreground)]">
                      ${(experience.price / 100).toFixed(0)}<span className="text-sm font-normal text-[var(--muted-foreground)]">/person</span>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[var(--ocean-blue)]">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-12">
            How Localhost Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '🔍',
                title: 'Discover',
                description: 'Browse authentic local experiences in your destination, filtered by your interests.',
              },
              {
                icon: '📅',
                title: 'Book',
                description: 'Choose your date, confirm your spot, and connect with your verified host.',
              },
              {
                icon: '✨',
                title: 'Experience',
                description: 'Enjoy an intimate, memorable experience with a local who loves sharing their world.',
              },
            ].map((step, index) => (
              <div key={index} className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-4xl mb-4">
                  {step.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-white/80">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-[var(--sunset-orange)] to-[var(--sunset-orange-dark)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Share Your World with Travelers
          </h2>
          <p className="text-lg text-white/90 mb-8">
            Turn your passion into memorable experiences. Join our community of hosts 
            and connect with curious travelers from around the globe.
          </p>
          <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-[var(--sunset-orange)]">
            Become a Host
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-[var(--warm-brown)]">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-white mb-4">Explore</h4>
              <ul className="space-y-2">
                <li><Link href="/explore" className="text-white/70 hover:text-white transition-colors">All Experiences</Link></li>
                <li><Link href="/explore?category=food-drink" className="text-white/70 hover:text-white transition-colors">Food & Drink</Link></li>
                <li><Link href="/explore?category=outdoor-adventure" className="text-white/70 hover:text-white transition-colors">Adventure</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Host</h4>
              <ul className="space-y-2">
                <li><Link href="/host" className="text-white/70 hover:text-white transition-colors">Become a Host</Link></li>
                <li><Link href="/host/resources" className="text-white/70 hover:text-white transition-colors">Host Resources</Link></li>
                <li><Link href="/host/community" className="text-white/70 hover:text-white transition-colors">Community</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2">
                <li><Link href="/help" className="text-white/70 hover:text-white transition-colors">Help Center</Link></li>
                <li><Link href="/safety" className="text-white/70 hover:text-white transition-colors">Safety</Link></li>
                <li><Link href="/trust" className="text-white/70 hover:text-white transition-colors">Trust & Reviews</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-white/70 hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="/careers" className="text-white/70 hover:text-white transition-colors">Careers</Link></li>
                <li><Link href="/press" className="text-white/70 hover:text-white transition-colors">Press</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏠</span>
              <span className="font-bold text-white">Localhost</span>
            </div>
            <p className="text-white/60 text-sm">
              © 2024 Localhost. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
