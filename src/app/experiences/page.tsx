import { ExperienceList } from '@/components/experiences/experience-list';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

export default function MyExperiencesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF5F0] to-[#FFF0EB] dark:from-zinc-950 dark:to-zinc-900 pb-24">
      <div className="max-w-md mx-auto min-h-screen flex flex-col">
        
        {/* Header */}
        <div className="p-6 pt-12 pb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">My Experiences</h1>
          <Link href="/become-host?new=true">
            <Button size="sm" className="rounded-full bg-gradient-to-r from-[var(--princeton-orange)] to-red-500 hover:opacity-90 text-white shadow-lg shadow-orange-500/20 border-0 gap-1.5 pl-3 pr-4">
              <Plus className="w-4 h-4" />
              <span>Create</span>
            </Button>
          </Link>
        </div>

        {/* List Content */}
        <div className="flex-1 px-4">
          <ExperienceList />
        </div>

      </div>
    </div>
  );
}
