import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import MetabloomResearchBrief from './MetabloomResearchBrief';
import { requestMetabloomSourcePreview } from './metabloomSourceMediaClient';
import { metabloomSourceMediaUrl } from './metabloomSourceMediaProtocol';

jest.mock('./metabloomSourceMediaClient', () => ({ requestMetabloomSourcePreview: jest.fn() }));

expect.extend(toHaveNoViolations);

// Fictional evidence exercises presentation without asserting any real news.
const sources = Array.from({ length: 9 }, (_, index) => ({
  id: index + 1,
  title: `Fictional source ${index + 1}`,
  url: `https://news-${index + 1}.example.test/report`,
}));
const fixture = () => {
  const usedIds = [1, 2, 3, 4, 9];
  return {
    version: 'metabloom-research-brief-v1', kind: 'news',
    title: 'Five fictional developments', scope: 'Fictional regional stories requested for this week.',
    asOf: '2026-10-24T00:30:00.000Z', timeZone: 'America/Toronto', localDate: '2026-10-23',
    windowStart: '2026-10-19', windowEnd: '2026-10-23',
    coverage: { requestedCount: 5, returnedCount: 5, status: 'complete', limitations: [] },
    items: usedIds.map((sourceId, index) => ({
      headline: `Fictional development ${index + 1}`,
      summary: `The complete overview of fictional development ${index + 1} explains the reported event and its immediate consequence.`,
      sourceIds: [sourceId],
      background: [{ text: `The documented background for development ${index + 1}.`, sourceIds: [sourceId] }],
      whyItMatters: `This analysis explains the possible implications of development ${index + 1}.`,
      uncertainty: [`The longer-term effect of development ${index + 1} is not yet established.`],
      watchNext: [`Watch for the next public update on development ${index + 1}.`],
      developmentDate: '2026-10-23', scheduledDate: index === 0 ? '2026-11-02' : null,
      dateEvidence: { sourceId, quote: `The fictional notice states that development ${index + 1} was announced on October 23, 2026.` },
      evidenceStatus: index === 0 ? 'announced' : 'reported',
    })),
    sourceDetails: usedIds.map((sourceId, index) => ({
      sourceId, publisher: sourceId === 9 ? '' : `Fictional publisher ${sourceId}`,
      publishedDate: sourceId === 9 ? null : '2026-10-23',
      dateEvidence: sourceId === 9 ? '' : 'Published October 23, 2026.',
      sourceType: ['official', 'reporting', 'syndicated', 'analysis', 'unknown'][index],
    })),
  };
};
const renderBrief = (brief = fixture(), canonicalSources = sources) => render(
  <div className="orb-page"><MetabloomResearchBrief brief={brief} sources={canonicalSources} /></div>
);
const expectPosition = text => {
  expect(screen.getByRole('combobox', { name: /Choose a (story|finding)/ })).toHaveDisplayValue(text);
  expect(screen.getByRole('status')).toHaveTextContent(text);
};
const openSourceEvidence = () => {
  const summary = screen.getByText('Sources and evidence');
  fireEvent.click(summary);
  return within(screen.getByRole('list', { name: 'Sources for this research brief' }));
};

beforeEach(() => requestMetabloomSourcePreview.mockReset());
afterEach(() => document.documentElement.removeAttribute('data-theme'));

test('news previews prefer the dated source and retain every original citation and complete overview', async () => {
  const brief = fixture();
  brief.items[0].sourceIds = [2, 1];
  brief.media = [{ sourceId: 1, token: 'signed.first.source' }, { sourceId: 2, token: 'signed.second.source' }];
  requestMetabloomSourcePreview.mockImplementation(token => Promise.resolve({ version: '1', isArticle: true,
    image: { src: metabloomSourceMediaUrl(token, 'image'), alt: 'The published article image.' }, icon: null }));
  const { container } = renderBrief(brief);
  await act(async () => {});
  const first = within(screen.getByRole('article', { name: brief.items[0].headline }));
  expect(first.getByRole('img', { name: 'The published article image.' })).toHaveAttribute('src', metabloomSourceMediaUrl('signed.first.source', 'image'));
  expect(first.getByRole('link', { name: /Read article: Fictional source 1/ })).toHaveAttribute('href', sources[0].url);
  expect(first.getByText('Fictional publisher 1')).toBeVisible();
  const overview = within(first.getByText(brief.items[0].summary));
  expect(overview.getByRole('link', { name: 'Source 1: Fictional source 1' })).toHaveAttribute('href', sources[0].url);
  expect(overview.getByRole('link', { name: 'Source 2: Fictional source 2' })).toHaveAttribute('href', sources[1].url);
  expect(screen.getByText(brief.items[0].summary)).toBeVisible();
  brief.items.slice(1).forEach(item => expect(screen.getByText(item.summary)).not.toBeVisible());
  expect(await axe(container)).toHaveNoViolations();
});

test('news previews use the first cited source with media when the dated source has none', async () => {
  const brief = fixture();
  brief.items[0].sourceIds = [1, 2];
  brief.media = [{ sourceId: 2, token: 'signed.second.source' }];
  requestMetabloomSourcePreview.mockResolvedValue({ version: '1', isArticle: false, image: null, icon: null });
  renderBrief(brief);
  await act(async () => {});
  const first = within(screen.getByRole('article', { name: brief.items[0].headline }));
  expect(first.getByRole('link', { name: /Open source: Fictional source 2/ })).toHaveAttribute('href', sources[1].url);
  expect(first.getByText('Fictional publisher 2')).toBeVisible();
  expect(first.queryByRole('img')).not.toBeInTheDocument();
});

test('unavailable optional media never removes the completed brief, its evidence or outbound source', async () => {
  const brief = fixture();
  brief.media = [{ sourceId: 1, token: 'signed.first.source' }];
  requestMetabloomSourcePreview.mockRejectedValue(new Error('Private transport detail'));
  renderBrief(brief);
  await act(async () => {});
  expect(screen.getByRole('region', { name: brief.title })).toBeVisible();
  expect(screen.getByText(brief.items[0].summary)).toBeVisible();
  expect(screen.getByRole('link', { name: /Open source: Fictional source 1/ })).toHaveAttribute('href', sources[0].url);
  fireEvent.click(screen.getAllByText('Analysis and context', { selector: 'summary' })[0]);
  expect(screen.getByText(brief.items[0].whyItMatters)).toBeVisible();
  expect(screen.getByText(brief.items[0].dateEvidence.quote)).toBeVisible();
  expect(openSourceEvidence().getByRole('link', { name: 'Fictional source 1' })).toHaveAttribute('href', sources[0].url);
  expect(screen.queryByText(/Private transport detail/)).not.toBeInTheDocument();
});

test('shows one complete overview at a time and native story selection preserves citations above source eight', () => {
  const brief = fixture();
  brief.items[4].summary = `${'The fifth fictional development remains fully readable alongside its immediate context. '.repeat(10)}The final sentence is preserved.`;
  const { container } = renderBrief(brief);
  expect(screen.getByRole('region', { name: brief.title })).toHaveAttribute('data-coverage-status', 'complete');
  expect(screen.getByText('5 of 5 stories')).toBeVisible();
  expect(screen.getByText('Complete')).toBeVisible();
  expectPosition('Story 1 of 5');
  expect(screen.getByRole('region', { name: brief.title })).toHaveAttribute('aria-roledescription', 'carousel');
  const stories = within(screen.getByRole('list', { name: 'Covered stories' }));
  expect(stories.getAllByRole('article')).toHaveLength(1);
  expect(container.querySelectorAll('.metabloom-research-brief__item[hidden]')).toHaveLength(4);
  brief.items.forEach((item, index) => {
    const selector = screen.getByRole('combobox', { name: 'Choose a story' });
    fireEvent.change(selector, { target: { value: String(index) } });
    expect(selector).toHaveValue(String(index));
    expectPosition(`Story ${index + 1} of 5`);
    expect(stories.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: item.headline, level: 4 })).toBeVisible();
    expect(screen.getByText(item.summary)).toBeVisible();
    expect(screen.getByText(item.whyItMatters)).not.toBeVisible();
  });
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  const lastOverview = screen.getByText(brief.items[4].summary);
  const citation = within(lastOverview).getByRole('link', { name: 'Source 9: Fictional source 9' });
  expect(citation).toHaveAttribute('href', sources[8].url);
  expect(citation).toHaveAttribute('target', '_blank');
  expect(citation).toHaveAttribute('rel', 'noopener noreferrer');
});

test('previous, next and keyboard controls stay bounded without moving focus or intercepting story keys', () => {
  const brief = fixture();
  renderBrief(brief);
  const previous = screen.getByRole('button', { name: 'Previous story' });
  const next = screen.getByRole('button', { name: 'Next story' });
  expect(previous).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(previous);
  expectPosition('Story 1 of 5');
  next.focus();
  fireEvent.click(next);
  expectPosition('Story 2 of 5');
  expect(next).toHaveFocus();
  fireEvent.keyDown(next, { key: 'ArrowRight' });
  expectPosition('Story 3 of 5');
  fireEvent.keyDown(next, { key: 'End' });
  expectPosition('Story 5 of 5');
  expect(next).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(next);
  fireEvent.keyDown(next, { key: 'ArrowRight' });
  expectPosition('Story 5 of 5');
  expect(next).toHaveFocus();
  fireEvent.keyDown(next, { key: 'ArrowLeft' });
  expectPosition('Story 4 of 5');
  fireEvent.keyDown(next, { key: 'Home' });
  fireEvent.keyDown(previous, { key: 'ArrowLeft' });
  expectPosition('Story 1 of 5');
  fireEvent.keyDown(next, { key: 'ArrowRight', altKey: true });
  fireEvent.keyDown(within(screen.getByText(brief.items[0].summary)).getByRole('link', { name: 'Source 1: Fictional source 1' }), { key: 'ArrowRight' });
  expectPosition('Story 1 of 5');
  const selector = screen.getByRole('combobox', { name: 'Choose a story' });
  selector.focus();
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
    const keyEvent = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    fireEvent(selector, keyEvent);
    expect(keyEvent.defaultPrevented).toBe(false);
  }
  fireEvent.change(selector, { target: { value: '4' } });
  expect(selector).toHaveFocus();
  expectPosition('Story 5 of 5');
});

test('a single story keeps its full overview and a one-option selector without navigation wrap', () => {
  const brief = fixture();
  brief.items = brief.items.slice(0, 1); brief.sourceDetails = brief.sourceDetails.slice(0, 1);
  brief.coverage = { requestedCount: 1, returnedCount: 1, status: 'complete', limitations: [] };
  renderBrief(brief);
  expectPosition('Story 1 of 1');
  expect(screen.getByRole('button', { name: 'Previous story' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByRole('button', { name: 'Next story' })).toHaveAttribute('aria-disabled', 'true');
  expect(within(screen.getByRole('combobox', { name: 'Choose a story' })).getAllByRole('option')).toHaveLength(1);
  expect(screen.getByText(brief.items[0].summary)).toBeVisible();
});

test('keeps background citations, labeled analysis, unknowns, next developments, and date excerpts in native disclosures', () => {
  const brief = fixture();
  renderBrief(brief);
  const summary = screen.getAllByText('Analysis and context', { selector: 'summary' })[0];
  expect(summary.tagName).toBe('SUMMARY');
  expect(summary.parentElement.tagName).toBe('DETAILS');
  fireEvent.click(summary);
  const item = within(screen.getByRole('article', { name: brief.items[0].headline }));
  expect(item.getByRole('heading', { name: 'Why it matters Analysis' })).toBeVisible();
  expect(item.getByText(brief.items[0].whyItMatters)).toBeVisible();
  const claim = item.getByText(brief.items[0].background[0].text);
  expect(within(claim).getByRole('link', { name: 'Source 1: Fictional source 1' })).toHaveAttribute('href', sources[0].url);
  expect(item.getByRole('heading', { name: 'What is uncertain' })).toBeVisible();
  expect(item.getByText(brief.items[0].uncertainty[0])).toBeVisible();
  expect(item.getByRole('heading', { name: 'Watch next' })).toBeVisible();
  expect(item.getByText(brief.items[0].watchNext[0])).toBeVisible();
  expect(item.getByText(brief.items[0].dateEvidence.quote)).toBeVisible();
  fireEvent.click(summary);
  expect(item.getByText(brief.items[0].whyItMatters)).not.toBeVisible();
  expect(item.getByText(brief.items[0].summary)).toBeVisible();
});

test('displays the supplied timezone and historical covered interval independently of the as-of time', () => {
  const brief = fixture();
  brief.scope = 'Fictional developments during the first week of September.';
  brief.windowStart = '2026-09-01'; brief.windowEnd = '2026-09-07';
  brief.items.forEach(item => { item.developmentDate = '2026-09-03'; });
  const { container } = renderBrief(brief);
  expect(screen.getByText(brief.scope)).not.toBeVisible();
  expect(screen.getByText('America/Toronto')).not.toBeVisible();
  fireEvent.click(screen.getByText('Briefing details', { selector: 'summary' }));
  expect(screen.getByText(brief.scope)).toBeVisible();
  expect(screen.getByText('America/Toronto')).toBeVisible();
  const asOf = container.querySelector('time[datetime="2026-10-24T00:30:00.000Z"]');
  expect(asOf).toHaveTextContent('Oct 23, 2026, 20:30');
  const interval = screen.getByText('Covered interval').parentElement;
  expect(interval).toHaveTextContent('Sep 1, 2026 to Sep 7, 2026');
  expect(interval).not.toHaveTextContent('Oct');
  expect(container.querySelector('time[datetime="2026-09-03"]')).toHaveTextContent('Sep 3, 2026');
  expect(container.querySelector('time[datetime="2026-11-02"]')).toHaveTextContent('Nov 2, 2026');
});

test('reports partial and unavailable coverage honestly without inventing missing stories', () => {
  const brief = fixture();
  brief.items = brief.items.slice(0, 3);
  brief.sourceDetails = brief.sourceDetails.slice(0, 3);
  brief.coverage = { requestedCount: 5, returnedCount: 3, status: 'partial', limitations: ['Only three dated developments were supported by the available evidence.'] };
  const view = renderBrief(brief);
  expect(screen.getByText('3 of 5 stories')).toBeVisible();
  expect(screen.getByText('Partial coverage')).toBeVisible();
  expect(screen.getByText(brief.coverage.limitations[0])).not.toBeVisible();
  fireEvent.click(screen.getByText('Briefing details', { selector: 'summary' }));
  expect(screen.getByRole('list', { name: 'Coverage limitations' })).toHaveTextContent(brief.coverage.limitations[0]);
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.queryByText('Fictional development 4')).not.toBeInTheDocument();

  const unavailable = { ...brief, items: [], sourceDetails: [], coverage: {
    requestedCount: 5, returnedCount: 0, status: 'unavailable', limitations: ['The available sources did not establish developments in the requested interval.'],
  } };
  view.rerender(<div className="orb-page"><MetabloomResearchBrief brief={unavailable} sources={sources} /></div>);
  const notes = screen.getByText('Briefing notes', { selector: 'summary' });
  expect(notes).toBeVisible();
  expect(notes.parentElement).not.toHaveAttribute('open');
  expect(screen.queryByText('0 of 5 stories')).not.toBeInTheDocument();
  expect(screen.queryByText('Coverage unavailable')).not.toBeInTheDocument();
  expect(screen.getByText(unavailable.coverage.limitations[0])).not.toBeVisible();
  fireEvent.click(notes);
  expect(screen.getByText(unavailable.coverage.limitations[0])).toBeVisible();
  expect(screen.getByText('Requested interval')).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(screen.queryByText('Sources and evidence')).not.toBeInTheDocument();
});

test('an empty briefing keeps its context and limitations in one accessible, collapsed disclosure', async () => {
  const brief = fixture();
  brief.items = []; brief.sourceDetails = [];
  brief.coverage = { requestedCount: 5, returnedCount: 0, status: 'unavailable', limitations: [
    'The dates could not be established from the available evidence.',
    'Original publication dates were not supplied.',
    'Developments can change as further reporting becomes available.',
  ] };
  const { container } = renderBrief(brief);
  expect(screen.queryByRole('heading', { name: brief.title })).not.toBeInTheDocument();
  expect(screen.getByText(brief.scope)).not.toBeVisible();
  for (const limitation of brief.coverage.limitations) expect(screen.getByText(limitation)).not.toBeVisible();
  expect(await axe(container)).toHaveNoViolations();
  fireEvent.click(screen.getByText('Briefing notes', { selector: 'summary' }));
  expect(screen.getByText('America/Toronto')).toBeVisible();
  for (const limitation of brief.coverage.limitations) expect(screen.getByText(limitation)).toBeVisible();
  expect(await axe(container)).toHaveNoViolations();
});

test('supports general research findings without applying news dates or story labels', () => {
  const brief = fixture();
  brief.kind = 'research'; brief.title = 'Five fictional research findings';
  brief.coverage.requestedCount = null; brief.windowStart = null; brief.windowEnd = null;
  renderBrief(brief);
  expect(screen.getByText('Research brief')).toBeVisible();
  expect(screen.getByText('5 findings')).toBeVisible();
  expectPosition('Finding 1 of 5');
  expect(screen.getByRole('group', { name: 'Finding navigation' })).toBeVisible();
  fireEvent.change(screen.getByRole('combobox', { name: 'Choose a finding' }), { target: { value: '4' } });
  expectPosition('Finding 5 of 5');
  expect(screen.getByRole('list', { name: 'Research findings' })).toBeVisible();
  expect(screen.queryByText('Covered interval')).not.toBeInTheDocument();
  expect(screen.queryByText(/^Development:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/^Scheduled:/)).not.toBeInTheDocument();
  expect(screen.queryByText('Story 1')).not.toBeInTheDocument();
});

test('source evidence preserves titles, publisher, dates, quoted provenance, and unknown metadata', () => {
  renderBrief();
  const evidence = openSourceEvidence();
  expect(evidence.getAllByRole('listitem')).toHaveLength(5);
  expect(evidence.getByRole('link', { name: 'Fictional source 1' })).toHaveAttribute('href', sources[0].url);
  expect(evidence.getByText('Fictional publisher 1')).toHaveTextContent('news-1.example.test');
  expect(evidence.getByText('Official source')).toBeVisible();
  expect(evidence.getByText('Syndicated reporting')).toBeVisible();
  expect(evidence.getAllByText('Published October 23, 2026.')).toHaveLength(4);
  expect(evidence.getByText('news-9.example.test')).toBeVisible();
  expect(evidence.getByText('Date not established')).toBeVisible();
  expect(evidence.getByText('Source type not established')).toBeVisible();
  expect(evidence.queryByText(/confidence|score/i)).not.toBeInTheDocument();
});

test('model-provided markup stays literal text and source links use canonical URLs', () => {
  const brief = fixture();
  brief.items[0].summary = '<img src=x onerror=alert(1)> is literal quoted text in this fictional overview.';
  brief.items[0].background[0].text = '<script>alert(1)</script> is literal background text.';
  const canonicalSources = sources.map(source => ({ ...source }));
  canonicalSources[0].url = 'HTTPS://NEWS-1.EXAMPLE.TEST:443/report';
  const { container } = renderBrief(brief, canonicalSources);
  expect(screen.getByText(brief.items[0].summary)).toBeVisible();
  expect(container.querySelector('img, script, iframe')).toBeNull();
  expect(within(screen.getByText(brief.items[0].summary)).getByRole('link', { name: 'Source 1: Fictional source 1' })).toHaveAttribute('href', 'https://news-1.example.test/report');
});

// Keep unsafe URL fixtures literal to exercise the source trust boundary.
// eslint-disable-next-line no-script-url
test.each(['javascript:alert(1)', 'https://name:secret@example.test/report', 'https://example.test\\@attacker.test/report'])('rejects a dangerous source URL: %s', url => {
  const invalidSources = sources.map(source => ({ ...source }));
  invalidSources[0].url = url;
  const { container } = renderBrief(fixture(), invalidSources);
  expect(container.querySelector('.metabloom-research-brief')).toBeNull();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test.each([
  ['unknown source ID', brief => { brief.items[0].sourceIds = [99]; }],
  ['dishonest count', brief => { brief.coverage.returnedCount = 3; }],
  ['invalid date', brief => { brief.items[0].developmentDate = '2026-02-30'; }],
  ['unsupported model field', brief => { brief.items[0].confidence = 0.99; }],
])('renders no brief for invalid presentation data: %s', (_, mutate) => {
  const brief = fixture(); mutate(brief);
  const { container } = renderBrief(brief);
  expect(container.querySelector('.metabloom-research-brief')).toBeNull();
});

test('slides retain their disclosures and selection across navigation, theme, visibility and resize changes', () => {
  const brief = fixture();
  const view = renderBrief(brief);
  const summary = screen.getAllByText('Analysis and context', { selector: 'summary' })[0];
  expect(summary.tagName).toBe('SUMMARY');
  expect(summary.parentElement.tagName).toBe('DETAILS');
  fireEvent.click(summary);
  expect(summary.parentElement).toHaveAttribute('open');
  const firstArticle = screen.getByRole('article', { name: brief.items[0].headline });
  fireEvent.click(screen.getByRole('button', { name: 'Next story' }));
  expect(firstArticle).not.toBeVisible();
  expect(screen.queryByRole('article', { name: brief.items[0].headline })).not.toBeInTheDocument();
  expectPosition('Story 2 of 5');
  document.documentElement.setAttribute('data-theme', 'dark');
  view.rerender(<div className="orb-page"><MetabloomResearchBrief brief={brief} sources={sources} /></div>);
  fireEvent(window, new Event('resize'));
  fireEvent(document, new Event('visibilitychange'));
  expectPosition('Story 2 of 5');
  fireEvent.click(screen.getByRole('button', { name: 'Previous story' }));
  expect(screen.getByRole('article', { name: brief.items[0].headline })).toBe(firstArticle);
  expect(summary.parentElement).toHaveAttribute('open');
  expect(screen.getByText(brief.items[0].whyItMatters)).toBeVisible();
});

test('the brief has accessible headings, links, and disclosures in both collapsed and expanded views', async () => {
  const { container } = renderBrief();
  expect(await axe(container)).toHaveNoViolations();
  screen.getAllByText('Analysis and context', { selector: 'summary' }).forEach(summary => fireEvent.click(summary));
  openSourceEvidence();
  expect(await axe(container)).toHaveNoViolations();
});
