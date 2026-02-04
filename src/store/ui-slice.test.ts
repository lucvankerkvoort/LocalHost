import assert from 'node:assert/strict';
import test from 'node:test';

import reducer, {
  closeContactHost,
  openContactHost,
  selectUI,
  setP2PChatOpen,
  setItineraryCollapsed,
  setItineraryPanelTab,
  setListSurfaceOpen,
  setShowTimeline,
  toggleItineraryCollapsed,
  toggleItineraryPanelTab,
  toggleListSurface,
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

test('setListSurfaceOpen and toggleListSurface control list visibility', () => {
  const opened = reducer(getInitialState(), setListSurfaceOpen(true));
  const toggledClosed = reducer(opened, toggleListSurface());
  const toggledOpen = reducer(toggledClosed, toggleListSurface());

  assert.equal(opened.isListSurfaceOpen, true);
  assert.equal(toggledClosed.isListSurfaceOpen, false);
  assert.equal(toggledOpen.isListSurfaceOpen, true);
});

test('setItineraryCollapsed and toggleItineraryCollapsed control itinerary collapse state', () => {
  const collapsed = reducer(getInitialState(), setItineraryCollapsed(true));
  const toggledOpen = reducer(collapsed, toggleItineraryCollapsed());
  const toggledCollapsed = reducer(toggledOpen, toggleItineraryCollapsed());

  assert.equal(collapsed.isItineraryCollapsed, true);
  assert.equal(toggledOpen.isItineraryCollapsed, false);
  assert.equal(toggledCollapsed.isItineraryCollapsed, true);
});

test('itinerary panel tab defaults to ITINERARY and can be set/toggled', () => {
  const initial = getInitialState();
  const setExperiences = reducer(initial, setItineraryPanelTab('EXPERIENCES'));
  const toggled = reducer(setExperiences, toggleItineraryPanelTab());

  assert.equal(initial.itineraryPanelTab, 'ITINERARY');
  assert.equal(setExperiences.itineraryPanelTab, 'EXPERIENCES');
  assert.equal(toggled.itineraryPanelTab, 'ITINERARY');
});

test('selectUI returns ui slice from root state', () => {
  const uiState = reducer(getInitialState(), setP2PChatOpen(true));
  const rootState = {
    ui: uiState,
  } as Parameters<typeof selectUI>[0];

  assert.equal(selectUI(rootState).isP2PChatOpen, true);
});
