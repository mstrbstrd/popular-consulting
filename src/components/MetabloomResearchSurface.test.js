import React from 'react';
import { TextEncoder } from 'util';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AppNavigationContext } from '../contexts/AppNavigationContext';
import MetabloomResearchSurface from './MetabloomResearchSurface';
import MetabloomWorkspaceContext from './MetabloomWorkspaceContext';
import OrbSection from './OrbSection';
import { METABLOOM_WORKSPACE_VIEW_REQUEST } from './metabloomVisualSession';

jest.mock('./MetabloomAvatar', () => () => null);
jest.mock('../contexts/ThemeContext', () => ({ useThemeMode: () => ({ isDark: false }) }));

const now = Date.parse('2026-11-02T10:00:00.000Z');
const metadata = {
  researchId: 'a'.repeat(48), briefId: 'b'.repeat(32), title: 'Fictional coastal research',
  asOf: '2026-11-02T09:45:00.000Z', timeZone: 'America/Toronto', localDate: '2026-11-02',
  expiresAt: '2026-11-02T10:45:00.000Z',
};
const report = {
  notes: 'The first fictional finding is documented in the original evidence [9].\n\nThe second finding remains qualified [12].',
  sources: Array.from({ length: 40 }, (_, index) => ({ id: index + 1,
    title: `Fictional source ${index + 1}`, url: `https://example.org/research-${index + 1}` })),
};
const brief = {
  version: 'metabloom-research-brief-v1', kind: 'research', title: 'Two fictional findings',
  scope: 'Compare the recorded evidence.', asOf: metadata.asOf, timeZone: metadata.timeZone,
  localDate: metadata.localDate, windowStart: null, windowEnd: null,
  coverage: { requestedCount: 3, returnedCount: 2, status: 'partial', limitations: ['Two findings have recorded evidence.'] },
  items: [9, 12].map(sourceId => ({ headline: `Finding from source ${sourceId}`,
    summary: `The fictional finding from source ${sourceId} remains qualified.`, sourceIds: [sourceId],
    background: [{ text: `Recorded background for source ${sourceId}.`, sourceIds: [sourceId] }],
    whyItMatters: 'This finding supports a comparison.', uncertainty: ['The future outcome is unknown.'],
    watchNext: ['Watch for the next evaluation.'], developmentDate: null, scheduledDate: null,
    dateEvidence: null, evidenceStatus: 'reported' })),
  sourceDetails: [9, 12].map(sourceId => ({ sourceId, publisher: '', publishedDate: null,
    dateEvidence: '', sourceType: 'unknown' })),
};
const base = { messageId: 'assistant-2', report, brief, reference: metadata, status: 'complete' };

// Exercise the surface against its placement contract. The real registry owns
// selection, account guards and competing visual items in its integration tests.
function controllerFor() {
  const records = new Map();
  const controller = {
    records,
    registerResearchSurface: jest.fn(descriptor => {
      records.set(descriptor.messageId, descriptor);
      descriptor.slot.hidden = true;
      return () => {
        if (records.get(descriptor.messageId) !== descriptor) return;
        records.delete(descriptor.messageId);
        descriptor.origin.appendChild(descriptor.slot);
        descriptor.slot.hidden = false;
      };
    }),
    updateResearchSurface: jest.fn((descriptor, next) => {
      if (records.get(descriptor.messageId) === descriptor) Object.assign(descriptor, next);
    }),
    activateResearchSurface: jest.fn(descriptor => {
      if (records.get(descriptor.messageId) !== descriptor) return false;
      const root = descriptor.origin.closest('.orb-page');
      for (const record of records.values()) {
        record.origin.appendChild(record.slot);
        record.slot.hidden = true;
      }
      root.querySelector('.metabloom-chat__workspace').appendChild(descriptor.slot);
      descriptor.slot.hidden = false;
      return true;
    }),
    park(descriptor) {
      descriptor.origin.appendChild(descriptor.slot);
      descriptor.slot.hidden = true;
    },
  };
  return controller;
}
function SurfaceHarness({ controller = null, props = base }) {
  return <MetabloomWorkspaceContext.Provider value={controller}>
    <div className="orb-page">
      <div className="metabloom-chat__workspace" role="region" aria-label="Research workspace" />
      <article aria-label="Research reply"><MetabloomResearchSurface {...props} /></article>
    </div>
  </MetabloomWorkspaceContext.Provider>;
}
const openResearch = title => fireEvent.click(screen.getByRole('button', { name: `Open research: ${title || brief.title}` }));
const openDetails = text => {
  const summary = screen.getByText(text, { selector: 'summary' });
  fireEvent.click(summary);
  fireEvent(summary.parentElement, new Event('toggle'));
  return summary.parentElement;
};
const originalTextEncoder = global.TextEncoder;
let originalMatchMedia, requests;
beforeAll(() => { global.TextEncoder = TextEncoder; });
afterAll(() => { global.TextEncoder = originalTextEncoder; });
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(now); requests = [];
  originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  window.__metabloomRequest = request => new Promise(() => { requests.push(request); });
});
afterEach(() => {
  cleanup(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks();
  window.matchMedia = originalMatchMedia;
  delete window.__metabloomRequest;
});

test('embedded research stays inline without a controller and retains the original evidence links', () => {
  render(<SurfaceHarness />);
  const reply = screen.getByRole('article', { name: 'Research reply' });
  expect(within(reply).getByRole('region', { name: brief.title })).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Open research:/ })).not.toBeInTheDocument();
  for (const citation of within(reply).getAllByRole('link', { name: 'Source 9: Fictional source 9' })) {
    expect(citation).toHaveAttribute('href', report.sources[8].url);
  }
  expect(within(reply).getByRole('group', { name: 'Research reuse' })).toHaveTextContent('Research date Nov 2, 2026 · America/Toronto');
  expect(openDetails('Full research')).toHaveAttribute('open');
  expect(screen.getByRole('group', { name: 'Completed research' })).toHaveTextContent('The second finding remains qualified');
  expect(requests).toHaveLength(0);
});

test.each(['news', 'research'])('an unavailable %s summary preserves the report without claiming zero stories or findings', kind => {
  const controller = controllerFor();
  const unavailable = { ...brief, kind, title: 'Research report', items: [], sourceDetails: [],
    windowStart: kind === 'news' ? brief.localDate : null, windowEnd: kind === 'news' ? brief.localDate : null,
    coverage: { requestedCount: 5, returnedCount: 0, status: 'unavailable', limitations: ['The summary could not be prepared reliably.'] } };
  render(<SurfaceHarness controller={controller} props={{ ...base, brief: unavailable }} />);
  expect(controller.records.get(base.messageId).summary).toBe('Summary unavailable · 40 sources · 2026-11-02');
  expect(screen.getByRole('article', { name: 'Research reply' })).toHaveTextContent('Summary unavailable');
  expect(screen.queryByText(/0 (?:stories|findings)/)).not.toBeInTheDocument();
  openResearch('Research report');
  expect(screen.getByText('Full research', { selector: 'summary' }).parentElement).toHaveAttribute('open');
  expect(screen.getByRole('group', { name: 'Completed research' })).toHaveTextContent('The second finding remains qualified');
  expect(requests).toHaveLength(0);
});

test('one portal preserves the selected finding, disclosures and source pagination through moves and metadata updates', () => {
  const controller = controllerFor(), onUseReference = jest.fn();
  const props = { ...base, onUseReference };
  const view = render(<SurfaceHarness controller={controller} props={props} />);
  const descriptor = controller.records.get(base.messageId);
  expect(descriptor).toMatchObject({ messageId: base.messageId, title: brief.title, source: metadata });
  expect(descriptor.messageId).not.toBe(metadata.researchId);
  expect(controller.activateResearchSurface).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: brief.title })).not.toBeInTheDocument();
  openResearch();
  expect(controller.activateResearchSurface).toHaveBeenLastCalledWith(descriptor, { explicit: true, focus: true, view: 'expanded' });
  expect(onUseReference).not.toHaveBeenCalled();
  const carousel = screen.getByRole('region', { name: brief.title });
  const selection = within(carousel).getByRole('combobox', { name: 'Choose a finding' });
  fireEvent.change(selection, { target: { value: '1' } });
  const finding = within(carousel).getByRole('article', { name: brief.items[1].headline });
  const analysis = within(finding).getByText('Analysis and context', { selector: 'summary' });
  fireEvent.click(analysis);
  const fullResearch = openDetails('Full research');
  const sources = openDetails('Research sources (40)');
  fireEvent.click(within(sources).getByRole('button', { name: 'Show 20 more sources' }));
  expect(within(sources).getAllByRole('link')).toHaveLength(40);

  act(() => controller.park(descriptor));
  const updated = { ...metadata, title: 'Updated reference label' };
  view.rerender(<SurfaceHarness controller={controller} props={{ ...props, reference: updated }} />);
  expect(controller.registerResearchSurface).toHaveBeenCalledTimes(1);
  expect(controller.records.get(base.messageId)).toBe(descriptor);
  expect(descriptor.source).toEqual(updated);
  openResearch();
  expect(screen.getByRole('region', { name: brief.title })).toBe(carousel);
  expect(within(carousel).getByRole('combobox', { name: 'Choose a finding' })).toBe(selection);
  expect(selection).toHaveDisplayValue('Finding 2 of 2');
  expect(analysis.parentElement).toHaveAttribute('open');
  expect(screen.getByText('Full research', { selector: 'summary' }).parentElement).toBe(fullResearch);
  expect(fullResearch).toHaveAttribute('open');
  expect(sources).toHaveAttribute('open');
  expect(within(sources).getAllByRole('link')).toHaveLength(40);
  for (const citation of within(finding).getAllByRole('link', { name: 'Source 12: Fictional source 12' })) {
    expect(citation).toHaveAttribute('href', report.sources[11].url);
  }
  fireEvent.click(within(finding).getByRole('button', { name: 'Use this finding' }));
  expect(onUseReference).toHaveBeenCalledWith(updated,
    { type: 'finding', briefId: metadata.briefId, index: 1 }, brief.items[1].headline);
  expect(requests).toHaveLength(0);
});

test('controller readiness and failure preserve inline content and the same carousel instance', () => {
  const view = render(<SurfaceHarness />);
  const carousel = screen.getByRole('region', { name: brief.title });
  fireEvent.change(within(carousel).getByRole('combobox', { name: 'Choose a finding' }), { target: { value: '1' } });
  const rejected = { registerResearchSurface: jest.fn(() => false) };
  view.rerender(<SurfaceHarness controller={rejected} />);
  expect(carousel).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Open research:/ })).not.toBeInTheDocument();
  const controller = controllerFor();
  view.rerender(<SurfaceHarness controller={controller} />);
  openResearch();
  expect(screen.getByRole('region', { name: brief.title })).toBe(carousel);
  expect(within(carousel).getByRole('combobox', { name: 'Choose a finding' })).toHaveDisplayValue('Finding 2 of 2');
  view.rerender(<SurfaceHarness />);
  expect(controller.records.size).toBe(0);
  expect(screen.getByRole('article', { name: 'Research reply' })).toContainElement(carousel);
  expect(carousel).toBeVisible();
});

test.each(['error', 'interrupted'])('a %s short answer keeps the empty-brief fallback report readable without reuse metadata', status => {
  const controller = controllerFor();
  const unavailable = { ...brief, items: [], sourceDetails: [], coverage: {
    requestedCount: 3, returnedCount: 0, status: 'unavailable', limitations: ['The date needs verification.'],
  } };
  render(<SurfaceHarness controller={controller} props={{ ...base, status, brief: unavailable, reference: null }} />);
  expect(controller.activateResearchSurface).not.toHaveBeenCalled();
  openResearch();
  expect(screen.getByText('Briefing notes', { selector: 'summary' }).parentElement).not.toHaveAttribute('open');
  expect(screen.getByText('Full research', { selector: 'summary' }).parentElement).toHaveAttribute('open');
  expect(screen.getByRole('group', { name: 'Completed research' })).toHaveTextContent('The second finding remains qualified');
  expect(screen.queryByRole('button', { name: 'Use this research' })).not.toBeInTheDocument();
  expect(controller.records.get(base.messageId).source).toBeUndefined();
});

test.each(['referenceExpired', 'referenceUnavailable'])('%s disables reuse while keeping the report and sources readable', flag => {
  const controller = controllerFor();
  render(<SurfaceHarness controller={controller} props={{ ...base, [flag]: true }} />);
  openResearch();
  expect(screen.getByRole('button', { name: 'Use this research' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Use this finding' })).toBeDisabled();
  openDetails('Full research');
  const sources = openDetails('Research sources (40)');
  expect(within(sources).getByRole('link', { name: 'Fictional source 12' })).toHaveAttribute('href', report.sources[11].url);
  expect(requests).toHaveLength(0);
});

test('only terminal messages register, and StrictMode cleanup leaves no orphaned slot', () => {
  const controller = controllerFor();
  const view = render(<React.StrictMode><SurfaceHarness controller={controller} props={{ ...base, status: 'streaming' }} /></React.StrictMode>);
  expect(controller.registerResearchSurface).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: brief.title })).not.toBeInTheDocument();
  view.rerender(<React.StrictMode><SurfaceHarness controller={controller} /></React.StrictMode>);
  expect(controller.records.size).toBe(1);
  openResearch();
  const descriptor = controller.records.get(base.messageId);
  expect(document.querySelectorAll('.metabloom-research-slot')).toHaveLength(1);
  view.unmount();
  expect(controller.records.size).toBe(0);
  expect(descriptor.slot.isConnected).toBe(false);
});

test('opening research leaves the staged calculator alone; using a finding alone replaces it and stages its original index', async () => {
  const controller = controllerFor(), views = [];
  const message = { id: base.messageId, role: 'assistant', status: 'complete', source: 'model',
    content: 'The short answer cites the original evidence [9].', segments: [],
    sources: [report.sources[8]], researchDetails: report, researchBrief: brief, researchReference: metadata };
  const artifactAttachment = { reference: { id: 'c'.repeat(48), version: 'd'.repeat(32),
    selector: { type: 'calculator' }, inputs: { hours: 17, rate: 85 } }, label: 'Project price · Scenario' };
  const initial = { messages: [message], counter: 2, draft: 'Compare the qualifications.', artifactAttachment };
  const navigation = { getToolState: key => key === 'orb' ? initial : undefined };
  const onViewRequest = event => views.push(event.detail);
  window.addEventListener(METABLOOM_WORKSPACE_VIEW_REQUEST, onViewRequest);
  try {
    render(<AppNavigationContext.Provider value={navigation}>
      <MetabloomWorkspaceContext.Provider value={controller}>
        <div className="orb-page"><OrbSection /></div>
      </MetabloomWorkspaceContext.Provider>
    </AppNavigationContext.Provider>);
    const originalReference = screen.getByRole('group', { name: 'Selected visual reference' });
    const composer = screen.getByRole('textbox');
    openResearch();
    expect(screen.getByRole('group', { name: 'Selected visual reference' })).toBe(originalReference);
    expect(composer).toHaveValue(initial.draft);
    expect(views).toHaveLength(0);
    expect(requests).toHaveLength(0);
    fireEvent.change(screen.getByRole('combobox', { name: 'Choose a finding' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use this finding' }));
    expect(screen.queryByRole('group', { name: 'Selected visual reference' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Selected research reference' })).toHaveTextContent(brief.items[1].headline);
    expect(composer).toHaveValue(initial.draft);
    expect(composer).toHaveFocus();
    expect(views).toHaveLength(1);
    expect(views[0]).toEqual({ root: document.querySelector('.orb-page'), view: 'compact' });
    expect(requests).toHaveLength(0);
    fireEvent.submit(screen.getByRole('form', { name: 'Message Metabloom' }));
    await act(async () => { jest.advanceTimersByTime(0); await Promise.resolve(); });
    expect(requests).toHaveLength(1);
    expect(requests[0].researchContext).toEqual({ researchId: metadata.researchId,
      selector: { type: 'finding', briefId: metadata.briefId, index: 1 } });
    expect(requests[0].artifactContext).toBeUndefined();
  } finally {
    window.removeEventListener(METABLOOM_WORKSPACE_VIEW_REQUEST, onViewRequest);
  }
});

test('a completed workspace report without a structured brief opens directly to its full content', () => {
  const controller = controllerFor();
  render(<SurfaceHarness controller={controller} props={{ ...base, brief: null }} />);
  openResearch(metadata.title);
  expect(screen.getByText('Full research', { selector: 'summary' }).parentElement).toHaveAttribute('open');
  expect(screen.getByRole('group', { name: 'Completed research' })).toHaveTextContent('The second finding remains qualified');
});
