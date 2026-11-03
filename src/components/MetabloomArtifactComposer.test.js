import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import OrbSection from './OrbSection';
import { METABLOOM_ARTIFACT_REFERENCE_EVENT } from './metabloomArtifactReference';

jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const reference = () => ({ id: 'a'.repeat(48), version: 'b'.repeat(32),
  selector: { type: 'calculator' }, inputs: { hours: 10, rate: 65 } });
const attachment = () => ({ reference: reference(), label: 'Project price · Scenario' });
const originalTextEncoder = global.TextEncoder;
let requests, originalMatchMedia;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });
beforeEach(() => {
  requests = [];
  window.__metabloomRequest = request => new Promise(() => requests.push(request));
  originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
  cleanup();
  delete window.__metabloomRequest;
  delete window.__metabloomVisualSnapshot;
  window.matchMedia = originalMatchMedia;
});

function workspace(initial = {}) {
  const cache = new Map(Object.entries(initial));
  const navigation = { getToolState: key => cache.get(key), saveToolState: jest.fn((key, value) => cache.set(key, value)) };
  const mount = (isActive = true) => render(<AppNavigationContext.Provider value={navigation}>
    <div className="orb-page"><OrbSection isActive={isActive} /></div>
  </AppNavigationContext.Provider>);
  return { cache, navigation, mount };
}
const stage = (view, value = attachment(), root = view.container.querySelector('.orb-page')) => {
  act(() => window.dispatchEvent(new CustomEvent(METABLOOM_ARTIFACT_REFERENCE_EVENT,
    { detail: { ...value, root } })));
};
const send = (message = 'Explain this scenario.') => {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: message } });
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
};

test('staging preserves the draft, focuses the composer, and starts no request', () => {
  const view = workspace().mount();
  const composer = screen.getByRole('textbox');
  fireEvent.change(composer, { target: { value: 'Why is this amount useful?' } });
  stage(view);
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent(attachment().label);
  expect(composer).toHaveValue('Why is this amount useful?');
  expect(composer).toHaveFocus();
  expect(composer).toHaveAccessibleDescription(expect.stringContaining(attachment().label));
  expect(requests).toHaveLength(0);
});

test('Send captures a cloned reference once and removes it from the draft', async () => {
  const view = workspace().mount(), selected = attachment();
  stage(view, selected);
  selected.reference.inputs.hours = 70;
  send();
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].artifactContext).toEqual(reference());
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  send('A separate question.');
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).not.toHaveProperty('artifactContext');
});

test('captured values survive navigation as display metadata without entering the request', async () => {
  const state = workspace(), view = state.mount();
  const summary = 'Hours: 10 · Hourly rate: 65 CAD · Result: 650 CAD';
  stage(view, { ...attachment(), summary });
  view.unmount();
  state.mount();
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent(summary);
  send();
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].artifactContext).toEqual(reference());
  expect(requests[0]).not.toHaveProperty('summary');
});

test('an unavailable original component leaves the selected snapshot intact on Update', () => {
  const view = workspace().mount();
  stage(view);
  fireEvent.click(screen.getByRole('button', { name: 'Update selection' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Your attached selection is unchanged.');
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent(attachment().label);
  expect(requests).toHaveLength(0);
});

test('removing a reference omits context even when the legacy calculator snapshot is available', async () => {
  const view = workspace().mount();
  const legacy = jest.fn(() => ({ id: 'c'.repeat(48), inputs: { hours: 80, rate: 200 } }));
  window.__metabloomVisualSnapshot = legacy;
  stage(view);
  const remove = screen.getByRole('button', { name: 'Remove visual reference' });
  act(() => remove.focus());
  fireEvent.click(remove);
  expect(screen.getByRole('textbox')).toHaveFocus();
  expect(requests).toHaveLength(0);
  send('An ordinary question without selected data.');
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).not.toHaveProperty('artifactContext');
  expect(legacy).not.toHaveBeenCalled();
});

test('the draft reference survives SPA navigation without a request and remains removable', async () => {
  const state = workspace(), view = state.mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain the selected values.' } });
  stage(view);
  view.unmount();
  expect(state.cache.get('orb').artifactAttachment).toEqual(attachment());
  state.mount();
  expect(screen.getByRole('group', { name: 'Selected visual reference' })).toHaveTextContent(attachment().label);
  expect(screen.getByRole('textbox')).toHaveValue('Explain the selected values.');
  expect(requests).toHaveLength(0);
  fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].artifactContext).toEqual(reference());
});

test('reset removes the selected reference and its saved draft state', async () => {
  const state = workspace(), view = state.mount();
  stage(view);
  act(() => window.__orbReset());
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  view.unmount();
  expect(state.cache.get('orb').artifactAttachment).toBeNull();
  state.mount(); send();
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).not.toHaveProperty('artifactContext');
});

test('foreign-root and inactive-surface events cannot stage a reference', () => {
  const state = workspace(), view = state.mount();
  stage(view, attachment(), document.createElement('div'));
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  view.unmount();
  const inactive = state.mount(false);
  stage(inactive);
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});

test.each([
  { ...attachment(), label: 'x'.repeat(181) },
  { ...attachment(), reference: { ...reference(), version: '1' } },
  { ...attachment(), reference: { ...reference(), total: 650 } },
  { ...attachment(), reference: { ...reference(), inputs: { hours: Infinity, rate: 65 } } },
])('malformed staged and restored references fail closed', value => {
  const state = workspace({ orb: { artifactAttachment: value } }), view = state.mount();
  stage(view, value);
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});

test('an expired owning cache callback cannot move a reference into a new account', () => {
  const cache = new Map(); let revision = 1;
  const oldRevision = revision;
  const oldNavigation = { getToolState: () => undefined, saveToolState: (key, value) => {
    if (revision === oldRevision) cache.set(key, value);
  } };
  const view = render(<AppNavigationContext.Provider value={oldNavigation}>
    <div className="orb-page"><OrbSection /></div>
  </AppNavigationContext.Provider>);
  stage(view);
  revision++; view.unmount();
  expect(cache.has('orb')).toBe(false);
  workspace().mount();
  expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
});
