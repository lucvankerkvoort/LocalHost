import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// Schema for AI-generated experience content
const experienceSchema = z.object({
  title: z.string().describe('A catchy, memorable title for the experience'),
  shortDesc: z.string().describe('1-2 sentence marketing description'),
  longDesc: z.string().describe('2-3 paragraph narrative description of the experience'),
  duration: z.number().describe('Estimated duration in minutes'),
  stops: z.array(z.object({
    name: z.string(),
    description: z.string().describe('Why this stop is special (1-2 sentences)'),
    address: z.string().optional().describe('Full address if known'),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })),
});

/**
 * POST /api/host/draft/generate
 * Generate AI content for the experience based on city and stops
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { draftId, city, country, stopNames } = body;

    if (!draftId) {
       return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
    }

    // Verify ownership first
    const existingDraft = await prisma.experienceDraft.findUnique({
      where: { id: draftId }
    });
    
    if (!existingDraft || existingDraft.userId !== session.user.id) {
       return NextResponse.json({ error: 'Draft not found or unauthorized' }, { status: 404 });
    }

    if (!city || !stopNames || !Array.isArray(stopNames) || stopNames.length === 0) {
      return NextResponse.json(
        { error: 'City and at least one stop are required' },
        { status: 400 }
      );
    }

    // Generate experience content using AI
    const { object: generatedContent } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: experienceSchema,
      prompt: `You are creating a local experience listing for a host in ${city}${country ? `, ${country}` : ''}.

The host wants to take visitors to these places:
${stopNames.map((name: string, i: number) => `${i + 1}. ${name}`).join('\n')}

Generate a compelling experience that:
- Has a catchy, memorable title that captures the vibe
- Has a short marketing description (2 sentences) that would make travelers want to book
- Has a longer narrative description (2-3 paragraphs) telling the story of the experience
- Estimates a realistic duration based on the stops (typically 2-4 hours)
- For each stop, provides a brief description of why it's special and what visitors will experience there
- If possible, include approximate addresses and coordinates for geocoding

The tone should be warm, personal, and authentic - like a local friend sharing their favorite spots.`,
    });

    // Update the draft with generated content
    const draft = await prisma.experienceDraft.update({
      where: { id: draftId },
      data: {
        city,
        country,
        title: generatedContent.title,
        shortDesc: generatedContent.shortDesc,
        longDesc: generatedContent.longDesc,
        duration: generatedContent.duration,
        status: 'AI_GENERATED',
      },
    });

    // Delete existing stops and create new ones
    await prisma.experienceStop.deleteMany({
      where: { draftId: draft.id },
    });

    await prisma.experienceStop.createMany({
      data: generatedContent.stops.map((stop, index) => ({
        draftId: draft.id,
        name: stop.name,
        description: stop.description,
        address: stop.address || null,
        lat: stop.lat || null,
        lng: stop.lng || null,
        order: index,
      })),
    });

    // Fetch complete draft with stops
    const completeDraft = await prisma.experienceDraft.findUnique({
      where: { id: draft.id },
      include: {
        stops: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return NextResponse.json({ 
      draft: completeDraft,
      generated: generatedContent,
    });
  } catch (error) {
    console.error('[host/draft/generate] error:', error);
    return NextResponse.json(
      { error: 'Failed to generate experience content' },
      { status: 500 }
    );
  }
}
