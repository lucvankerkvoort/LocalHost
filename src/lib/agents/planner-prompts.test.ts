import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildProfileSystemContext } from './planner-prompts';
import type { TravelProfile } from '@/lib/travel-profile/types';

function profile(overrides: Partial<TravelProfile>): TravelProfile {
  return {
    id: 'test-profile',
    userId: 'test-user',
    travelStyle: 'FLEXIBLE',
    pace: 'BALANCED',
    budget: 'MID',
    groupType: 'SOLO',
    transportPreference: null,
    interests: [],
    completedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('buildProfileSystemContext — no profile', () => {
  it('null profile instructs agent to ask about travel style', () => {
    const result = buildProfileSystemContext(null);
    assert.ok(result.includes('Not set up yet'), `got: ${result}`);
  });

  it('null profile includes sample profile question phrasing', () => {
    const result = buildProfileSystemContext(null);
    assert.ok(result.includes('road-tripper') || result.includes('travel style'), `got: ${result}`);
  });

  it('undefined profile behaves identically to null', () => {
    const withNull = buildProfileSystemContext(null);
    const withUndefined = buildProfileSystemContext(undefined);
    assert.equal(withNull, withUndefined);
  });
});

describe('buildProfileSystemContext — travel style labels', () => {
  const cases: Array<[TravelProfile['travelStyle'], string]> = [
    ['ROAD_TRIP',        'Road Tripper'],
    ['REGION_EXPLORER',  'Region Explorer'],
    ['MULTI_COUNTRY',    'Multi-Country Traveler'],
    ['BACKPACKER',       'Backpacker'],
    ['LUXURY',           'Luxury Traveler'],
    ['CULTURAL',         'Culture Seeker'],
    ['ADVENTURE',        'Adventure Traveler'],
    ['FLEXIBLE',         'Flexible'],
  ];

  for (const [style, label] of cases) {
    it(`${style} → shows "${label}"`, () => {
      const result = buildProfileSystemContext(profile({ travelStyle: style }));
      assert.ok(result.includes(label), `Expected "${label}" in output for ${style}, got: ${result}`);
    });
  }
});

describe('buildProfileSystemContext — pace', () => {
  it('RELAXED pace appears as "relaxed" in output', () => {
    const result = buildProfileSystemContext(profile({ pace: 'RELAXED' }));
    assert.ok(result.includes('relaxed'), `got: ${result}`);
  });

  it('PACKED pace appears as "packed" in output', () => {
    const result = buildProfileSystemContext(profile({ pace: 'PACKED' }));
    assert.ok(result.includes('packed'), `got: ${result}`);
  });

  it('BALANCED pace appears as "balanced" in output', () => {
    const result = buildProfileSystemContext(profile({ pace: 'BALANCED' }));
    assert.ok(result.includes('balanced'), `got: ${result}`);
  });
});

describe('buildProfileSystemContext — budget', () => {
  it('BUDGET tier appears as "budget" in output', () => {
    const result = buildProfileSystemContext(profile({ budget: 'BUDGET' }));
    assert.ok(result.includes('budget'), `got: ${result}`);
  });

  it('PREMIUM tier appears as "premium" in output', () => {
    const result = buildProfileSystemContext(profile({ budget: 'PREMIUM' }));
    assert.ok(result.includes('premium'), `got: ${result}`);
  });
});

describe('buildProfileSystemContext — group type', () => {
  it('COUPLE shows "couple"', () => {
    const result = buildProfileSystemContext(profile({ groupType: 'COUPLE' }));
    assert.ok(result.includes('couple'), `got: ${result}`);
  });

  it('FAMILY shows "family"', () => {
    const result = buildProfileSystemContext(profile({ groupType: 'FAMILY' }));
    assert.ok(result.includes('family'), `got: ${result}`);
  });
});

describe('buildProfileSystemContext — transport preference', () => {
  it('transport preference is included when set', () => {
    const result = buildProfileSystemContext(profile({ transportPreference: 'drive' }));
    assert.ok(result.includes('drive'), `got: ${result}`);
  });

  it('transport preference line is omitted when null', () => {
    const result = buildProfileSystemContext(profile({ transportPreference: null }));
    assert.ok(!result.includes('Preferred transport'), `unexpected transport line in: ${result}`);
  });
});

describe('buildProfileSystemContext — interests', () => {
  it('interests are included in output', () => {
    const result = buildProfileSystemContext(profile({ interests: ['photography', 'local food'] }));
    assert.ok(result.includes('photography'), `got: ${result}`);
    assert.ok(result.includes('local food'), `got: ${result}`);
  });

  it('empty interests list omits the interests line', () => {
    const result = buildProfileSystemContext(profile({ interests: [] }));
    assert.ok(!result.includes('Interests:'), `unexpected interests line in: ${result}`);
  });
});

describe('buildProfileSystemContext — partial profile', () => {
  it('notes profile is partial when completedAt is null', () => {
    const result = buildProfileSystemContext(profile({ completedAt: null }));
    assert.ok(result.includes('partial'), `got: ${result}`);
  });

  it('does not show partial note for completed profile', () => {
    const result = buildProfileSystemContext(profile({ completedAt: new Date() }));
    assert.ok(!result.includes('partial'), `unexpected partial note in: ${result}`);
  });
});
