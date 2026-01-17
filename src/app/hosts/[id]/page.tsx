import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Navbar } from '@/components/features';
import { getHostById, HOSTS } from '@/lib/data/hosts';
import { CATEGORY_LABELS, CATEGORY_ICONS, type ExperienceCategory } from '@/types';

interface HostPageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return HOSTS.map((host) => ({
    id: host.id,
  }));
}

export default async function HostPage({ params }: HostPageProps) {
  const { id } = await params;
  const host = getHostById(id);

  if (!host) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      {/* Hero with Host Photo */}
      <section className="pt-20 pb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative h-64 sm:h-80 rounded-2xl overflow-hidden">
            <img
              src={host.photo}
              alt={host.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 text-white">
              <p className="text-sm opacity-80 mb-1">📍 {host.city}, {host.country}</p>
              <h1 className="text-3xl sm:text-4xl font-bold">{host.name}</h1>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - About */}
          <div className="lg:col-span-2 space-y-8">
            {/* Quote */}
            <blockquote className="text-xl sm:text-2xl italic text-[var(--foreground)] border-l-4 border-[var(--sunset-orange)] pl-4">
              "{host.quote}"
            </blockquote>

            {/* Bio */}
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">About {host.name.split(' ')[0]}</h2>
              <p className="text-[var(--muted-foreground)] leading-relaxed">{host.bio}</p>
            </div>

            {/* Interests */}
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">Interests</h2>
              <div className="flex flex-wrap gap-2">
                {host.interests.map((interest) => (
                  <span
                    key={interest}
                    className="px-3 py-1.5 rounded-full bg-[var(--sand-beige)] text-[var(--foreground)] text-sm"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            </div>

            {/* Experiences */}
            <div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
                Things you can do with {host.name.split(' ')[0]}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {host.experiences.map((exp) => (
                  <Link
                    key={exp.id}
                    href={`/experience/${exp.id}`}
                    className="group bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-all"
                  >
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={exp.photo}
                        alt={exp.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">
                          {CATEGORY_ICONS[exp.category as ExperienceCategory]} {CATEGORY_LABELS[exp.category as ExperienceCategory]}
                        </span>
                      </div>
                      <h3 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--sunset-orange)] transition-colors line-clamp-2 mb-2">
                        {exp.title}
                      </h3>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1">
                          <span className="text-[var(--sunset-orange)]">★</span>
                          <span className="font-medium">{exp.rating}</span>
                          <span className="text-[var(--muted)]">({exp.reviewCount})</span>
                        </div>
                        <span className="font-semibold">${(exp.price / 100).toFixed(0)}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Contact Card */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 bg-white rounded-2xl shadow-lg p-6">
              <div className="text-center mb-6">
                <img
                  src={host.photo}
                  alt={host.name}
                  className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
                />
                <h3 className="font-semibold text-lg text-[var(--foreground)]">{host.name}</h3>
                <p className="text-[var(--muted-foreground)] text-sm">🌍 {host.city}, {host.country}</p>
              </div>

              <div className="space-y-3 mb-6 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted-foreground)]">Languages</span>
                  <span className="font-medium">{host.languages.join(', ')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted-foreground)]">Response time</span>
                  <span className="font-medium">{host.responseTime}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted-foreground)]">Member since</span>
                  <span className="font-medium">{host.memberSince}</span>
                </div>
              </div>

              <button className="w-full py-3 bg-gradient-to-r from-[var(--sunset-orange)] to-[var(--terracotta)] text-white rounded-xl font-semibold hover:shadow-lg transition-all">
                Message {host.name.split(' ')[0]}
              </button>

              <p className="text-center text-xs text-[var(--muted-foreground)] mt-3">
                Usually responds {host.responseTime}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
