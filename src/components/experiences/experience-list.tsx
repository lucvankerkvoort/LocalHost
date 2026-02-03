'use client';

import { useEffect, useState } from 'react';
import { getUserExperiences, deleteExperience, type MyExperience } from '@/actions/experiences';
import { ExperienceCard } from './experience-card';
import { Button } from '@/components/ui/button';
import { Add01Icon } from 'hugeicons-react';
import { useRouter } from 'next/navigation';

export function ExperienceList() {
  const [experiences, setExperiences] = useState<MyExperience[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      // ... same load logic
      try {
        const result = await getUserExperiences();
        if (result.success && result.data) {
          setExperiences(result.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRefine = (id: string) => {
    router.push(`/become-host/${id}`);
  };

  const handleDelete = async (id: string, type: 'DRAFT' | 'PUBLISHED') => {
    if (!confirm('Are you sure you want to delete this experience? This cannot be undone.')) return;

    // Optimistic update
    setExperiences(prev => prev.filter(e => e.id !== id));

    const result = await deleteExperience(id, type);
    if (!result.success) {
      // Revert if failed
      alert('Failed to delete experience');
      const loadResult = await getUserExperiences();
      if (loadResult.success && loadResult.data) {
        setExperiences(loadResult.data);
      }
    }
  };

  const handleView = (id: string) => {
    router.push(`/experiences/${id}/availability`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 rounded-2xl bg-[var(--muted)]/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (experiences.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-[var(--princeton-orange)]/10 flex items-center justify-center text-3xl">
          ✨
        </div>
        <div>
          <h3 className="text-xl font-bold text-[var(--foreground)]">No experiences yet</h3>
          <p className="text-[var(--muted-foreground)] max-w-xs mx-auto mt-2">
            Share your local world with travelers. Create your first experience today.
          </p>
        </div>
        <Button 
          className="mt-4 bg-[var(--princeton-orange)] hover:bg-[var(--princeton-dark)] text-white gap-2"
          onClick={() => router.push('/become-host')}
        >
          <Add01Icon className="w-4 h-4" />
          Create Experience
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {experiences.map((exp) => (
        <ExperienceCard
          key={exp.id}
          experience={exp}
          onRefine={handleRefine}
          onView={handleView}
          onDelete={handleDelete}
          onShare={(id) => {
            if (navigator.share) {
              navigator.share({ title: exp.title, url: window.location.origin + `/experiences/${id}` });
            } else {
              alert('Link copied to clipboard!');
            }
          }}
        />
      ))}
    </div>
  );
}
