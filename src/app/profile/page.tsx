'use client';

import { MapPin, Clock, Users, MessageCircle } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { selectHostCreation } from '@/store/host-creation-slice';
import Link from 'next/link';

import { useSession, signOut } from 'next-auth/react';

export default function ProfilePage() {
  const { data: session } = useSession();
  const { city, stops, title, shortDesc, duration } = useAppSelector(selectHostCreation);

  // Use session data or falls back to placeholder
  const host = {
    name: session?.user?.name || 'Guest User',
    photo: session?.user?.image || 'https://i.pravatar.cc/150?u=luc',
    joined: 'Jan 2026', // TODO: Get from DB
    rating: 5.0,
    reviews: 0,
  };

  if (!city && stops.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="mb-6 flex flex-col items-center">
             {session?.user?.image && (
                 <img src={session.user.image} alt="Profile" className="w-16 h-16 rounded-full mb-3" />
             )}
             <h2 className="text-xl font-bold">Welcome, {session?.user?.name || session?.user?.email || 'Traveler'}</h2>
             <p className="text-sm text-[var(--muted-foreground)]">{session?.user?.email}</p>
          </div>
          
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 mb-6">
              <h3 className="font-semibold mb-2">Want to host experiences?</h3>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">Create a host profile to start accepting bookings.</p>
              <Link 
                href="/become-host" 
                className="px-6 py-2 bg-[var(--princeton-orange)] text-white rounded-lg font-medium hover:bg-[var(--princeton-dark)] transition-colors inline-block w-full"
              >
                Create Host Profile
              </Link>
          </div>
          <div>
            <button 
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-red-500 hover:text-red-700 hover:underline"
            >
                Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] pb-20">
      
      {/* Cover Image / Map Context Placeholder */}
      <div className="h-64 bg-[var(--deep-space-blue)] relative overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[url('https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=1200&height=400&center=lonlat:2.17,41.38&zoom=12&apiKey=YOUR_API_KEY')] bg-cover bg-center grayscale" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] to-transparent" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 -mt-20 relative z-10">
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-xl overflow-hidden">
          
          {/* Host Header */}
          <div className="p-8 border-b border-[var(--border)] flex flex-col md:flex-row gap-6 items-start md:items-center">
            <img 
              src={host.photo} 
              alt={host.name} 
              className="w-24 h-24 rounded-full border-4 border-[var(--card)] shadow-md" 
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold">{host.name}</h1>
                <span className="px-2 py-0.5 bg-[var(--blue-green)] text-white text-xs font-bold rounded-full">
                  VERIFIED HOST
                </span>
              </div>
              <p className="text-[var(--muted-foreground)] flex items-center gap-2">
                <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {city}</span>
                <span>•</span>
                <span>Joined {host.joined}</span>
              </p>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-2xl font-bold">★ {host.rating}</div>
              <div className="text-sm text-[var(--muted-foreground)] underline mb-4">{host.reviews} reviews</div>
              <button 
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-4 py-2 text-sm font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
              >
                Sign Out
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
            
            {/* Main Content */}
            <div className="md:col-span-2 p-8 space-y-8">
              <section>
                <h2 className="text-sm uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-4">About the Experience</h2>
                <h3 className="text-2xl font-bold mb-2">{title || 'Authentic Local Experience'}</h3>
                <p className="text-[var(--foreground)]/80 leading-relaxed">
                  {shortDesc || "Join me for an unforgettable day exploring the hidden gems of the city. We'll visit my favorite local spots and dive deep into the culture."}
                </p>
                <div className="mt-4 flex gap-4 text-sm font-medium">
                  <div className="flex items-center gap-2 bg-[var(--muted)]/20 px-3 py-1.5 rounded-lg border border-[var(--border)]">
                    <Clock className="w-4 h-4" />
                    <span>{duration || 120} mins</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[var(--muted)]/20 px-3 py-1.5 rounded-lg border border-[var(--border)]">
                    <Users className="w-4 h-4" />
                    <span>Max 4 people</span>
                  </div>
                  <div className="flex items-center gap-2 bg-[var(--muted)]/20 px-3 py-1.5 rounded-lg border border-[var(--border)]">
                    <MessageCircle className="w-4 h-4" />
                    <span>English, Spanish</span>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-sm uppercase tracking-wide font-semibold text-[var(--muted-foreground)] mb-4">The Plan</h2>
                <div className="space-y-6 relative pl-4 border-l-2 border-[var(--border)] ml-2">
                  {stops.map((stop, idx) => (
                    <div key={stop.id} className="relative pl-6">
                      <div className="absolute -left-[21px] top-6 w-4 h-4 rounded-full bg-[var(--princeton-orange)] border-2 border-[var(--background)]" />
                      <div className="p-4 bg-[var(--background)] rounded-xl border border-[var(--border)] hover:border-[var(--princeton-orange)] transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold">{stop.name}</h4>
                          <span className="text-xs font-mono text-[var(--muted-foreground)]">Stop {idx + 1}</span>
                        </div>
                        {stop.description && (
                          <p className="text-sm text-[var(--muted-foreground)]">{stop.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Sidebar / Booking */}
            <div className="p-8 bg-[var(--muted)]/5">
              <div className="sticky top-8">
                <div className="mb-6">
                  <span className="text-3xl font-bold">$45</span>
                  <span className="text-[var(--muted-foreground)]"> / person</span>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="p-3 bg-[var(--background)] border border-[var(--border)] rounded-lg">
                    <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">DATES</label>
                    <div className="font-medium">select dates</div>
                  </div>
                  <div className="p-3 bg-[var(--background)] border border-[var(--border)] rounded-lg">
                     <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">GUESTS</label>
                     <div className="font-medium">1 guest</div>
                  </div>
                </div>

                <button className="w-full py-3 bg-[var(--princeton-orange)] text-white rounded-xl font-bold hover:bg-[var(--princeton-dark)] transition-transform active:scale-95 shadow-lg">
                  Book Experience
                </button>
                
                <p className="text-center text-xs text-[var(--muted-foreground)] mt-4">
                  You won't be charged yet
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
