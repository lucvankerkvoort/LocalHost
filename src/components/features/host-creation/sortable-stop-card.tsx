'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronUp, ChevronDown, Trash2, GripVertical } from 'lucide-react';
import { HostCreationStop } from '@/store/host-creation-slice';

interface SortableStopCardProps {
  stop: HostCreationStop;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdateName: (val: string) => void;
  onUpdateDesc: (val: string) => void;
  onRemove: () => void;
}

export function SortableStopCard({
  stop,
  index,
  isFirst,
  isLast,
  onUpdateName,
  onUpdateDesc,
  onRemove,
}: SortableStopCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stop.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className="flex gap-3 group relative"
    >
      {/* Drag Handle & Number */}
      <div 
        className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--princeton-orange)] text-white flex items-center justify-center text-sm font-bold shadow-sm z-10 cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
        {...attributes} 
        {...listeners}
      >
        {/* We can overlay a grip icon on hover, or just treat the number as handle. 
            Let's keep the number visible but add a grip hint or just assume user knows.
            Actually, let's put the handle NEXT to it or inside the card to be clearer.
            The user asked for DnD, so the number circle is a good handle.
         */}
        {index + 1}
      </div>

      {/* Editable Card */}
      <div className="flex-1 bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-sm overflow-hidden transition-all hover:shadow-md hover:border-[var(--princeton-orange)]/30">
        {/* Header: Name + Actions */}
        <div className="p-3 bg-[var(--muted)]/30 border-b border-[var(--border)] flex items-start gap-2">
            
          {/* Drag Handle Icon (Alternative) - Optional, but clarify */}
          <div {...attributes} {...listeners} className="cursor-grab text-[var(--muted-foreground)]/50 hover:text-[var(--foreground)] mt-1">
             <GripVertical className="w-4 h-4" />
          </div>

          <input 
            type="text"
            value={stop.name}
            onChange={(e) => onUpdateName(e.target.value)}
            className="flex-1 bg-transparent font-medium text-sm outline-none placeholder:text-[var(--muted-foreground)]"
            placeholder="Stop Name"
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag when clicking input
          />
          
          {/* Actions */}
          <div className="flex items-center gap-1">
             <button 
                onClick={onRemove}
                className="p-1 hover:bg-red-50 hover:text-red-500 rounded text-[var(--muted-foreground)] ml-1"
                title="Remove Stop"
             >
               <Trash2 className="w-3 h-3" />
             </button>
          </div>
        </div>

        {/* Body: Description */}
        <div className="p-3">
          <textarea 
            value={stop.description || ''}
            onChange={(e) => onUpdateDesc(e.target.value)}
            placeholder="Describe what happens here..."
            className="w-full bg-transparent text-xs text-[var(--muted-foreground)] outline-none resize-none min-h-[40px] placeholder:text-[var(--muted-foreground)]/50"
            onPointerDown={(e) => e.stopPropagation()} // Prevent drag when interacting with text
          />
        </div>
      </div>
    </div>
  );
}
