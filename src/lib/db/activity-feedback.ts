import { prisma } from '@/lib/prisma';

/**
 * Positive feedback: User explicitly saved, booked, or kept an AI-suggested activity
 * in their final itinerary. This increases the activity's engagementScore,
 * making it more likely to be retrieved by the RAG engine in future searches.
 */
export async function bumpActivityEngagement(activityId: string) {
  try {
    const updated = await prisma.activity.update({
      where: { id: activityId },
      data: {
        // Increment score by 10% on positive engagement
        engagementScore: { increment: 0.1 },
        updatedAt: new Date()
      }
    });
    console.log(`[RAG Moat] Increased engagement score for ${updated.name} to ${updated.engagementScore.toFixed(2)}`);
    return updated;
  } catch (e) {
    console.error(`Failed to bump engagement score for activity: ${activityId}`, e);
    return null;
  }
}

/**
 * Negative feedback: User explicitly removed an AI-suggested activity from their itinerary.
 * This slowly lowers its engagementScore, teaching the RAG engine not to suggest boring 
 * or irrelevant places.
 */
export async function lowerActivityEngagement(activityId: string) {
  try {
    const updated = await prisma.activity.update({
      where: { id: activityId },
      data: {
        // Decrease score by 5%, with a floor of 0.1
        engagementScore: { decrement: 0.05 },
        updatedAt: new Date()
      }
    });
    
    // Prevent negative scores or dropping completely to 0
    if (updated.engagementScore < 0.1) {
      await prisma.activity.update({
        where: { id: activityId },
        data: { engagementScore: 0.1 }
      });
    }

    console.log(`[RAG Moat] Lowered engagement score for ${updated.name} to ${Math.max(0.1, updated.engagementScore).toFixed(2)}`);
    return updated;
  } catch (e) {
    console.error(`Failed to lower engagement score for activity: ${activityId}`, e);
    return null;
  }
}
