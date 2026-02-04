import { NextResponse } from 'next/server';

import { getSyntheticBotsConfig } from '@/lib/synthetic-bots/config';
import { processDueSyntheticReplyJobs } from '@/lib/synthetic-bots/jobs';

async function runProcessor() {
  const config = getSyntheticBotsConfig();
  if (!config.enabled) {
    return NextResponse.json(
      {
        ok: true,
        skipped: true,
        reason: 'SYNTHETIC_BOTS_DISABLED',
      },
      { status: 200 }
    );
  }

  const result = await processDueSyntheticReplyJobs({ limit: 25 });
  return NextResponse.json({
    ok: true,
    skipped: false,
    ...result,
  });
}

export async function GET() {
  try {
    return await runProcessor();
  } catch (error) {
    console.error('[SYNTHETIC_BOTS_PROCESS_GET]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await runProcessor();
  } catch (error) {
    console.error('[SYNTHETIC_BOTS_PROCESS_POST]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
