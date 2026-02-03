import assert from 'node:assert/strict';
import test from 'node:test';

import reducer, {
  closeContactHost,
  openContactHost,
  selectUI,
  setP2PChatOpen,
  setShowTimeline,
  toggleTimeline,
} from './ui-slice';

function getInitialState() {
  return reducer(undefined, { type: '@@INIT' });
}

test('setP2PChatOpen sets chat open state', () => {
  const state = reducer(getInitialState(), setP2PChatOpen(true));
  assert.equal(state.isP2PChatOpen, true);
});

test('openContactHost sets host id and optional experience id', () => {
  const withExperience = reducer(
    getInitialState(),
    openContactHost({ hostId: 'host-1', experienceId: 'exp-1' })
  );
  const withoutExperience = reducer(
    getInitialState(),
    openContactHost({ hostId: 'host-2' })
  );

  assert.equal(withExperience.contactHostId, 'host-1');
  assert.equal(withExperience.contactExperienceId, 'exp-1');
  assert.equal(withoutExperience.contactHostId, 'host-2');
  assert.equal(withoutExperience.contactExperienceId, null);
});

test('closeContactHost clears contact host state', () => {
  const opened = reducer(
    getInitialState(),
    openContactHost({ hostId: 'host-1', experienceId: 'exp-1' })
  );
  const closed = reducer(opened, closeContactHost());

  assert.equal(closed.contactHostId, null);
  assert.equal(closed.contactExperienceId, null);
});

test('setShowTimeline sets explicit timeline visibility', () => {
  const hidden = reducer(getInitialState(), setShowTimeline(false));
  const shown = reducer(hidden, setShowTimeline(true));

  assert.equal(hidden.showTimeline, false);
  assert.equal(shown.showTimeline, true);
});

test('toggleTimeline flips timeline visibility', () => {
  const first = reducer(getInitialState(), toggleTimeline());
  const second = reducer(first, toggleTimeline());

  assert.equal(first.showTimeline, false);
  assert.equal(second.showTimeline, true);
});

test('selectUI returns ui slice from root state', () => {
  const uiState = reducer(getInitialState(), setP2PChatOpen(true));
  const rootState = {
    ui: uiState,
  } as Parameters<typeof selectUI>[0];

  assert.equal(selectUI(rootState).isP2PChatOpen, true);
});
