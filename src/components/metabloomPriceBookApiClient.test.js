import { TextEncoder, TextDecoder } from 'util';
import { requestMetabloomPriceBook } from './metabloomPriceBookApiClient';
import { emptyMetabloomPriceRules } from './metabloomPriceBookRules';

const book = () => ({ version: 1, currency: 'CAD', inputs: [{ id: 'hours', label: 'Hours', type: 'number', min: 2, max: 12, initial: 3 }],
  taxes: [{ id: 'gst', label: 'GST', rate: '5' }], lines: [{ id: 'labour', label: 'Labour', formula: ['hours', '95', 'multiply'], taxes: ['gst'], when: null }],
  examples: [{ label: 'Three hours', inputs: { hours: 3 } }] });
const publication = () => ({ draftId: 'd'.repeat(32), draftRevision: 1, compiler: 'service-rates-1', requestId: 'publish-draft', expectedVersion: 0, expectedBook: book() });
const originalDecoder = global.TextDecoder, originalEncoder = global.TextEncoder;
beforeEach(() => { global.TextDecoder = TextDecoder; global.TextEncoder = TextEncoder; });
afterEach(() => { global.TextDecoder = originalDecoder; global.TextEncoder = originalEncoder; });
const jsonResponse = value => {
  let sent = false;
  const reader = { read: jest.fn(async () => { if (sent) return { done: true }; sent = true;
    return { value: new TextEncoder().encode(JSON.stringify(value)), done: false }; }), cancel: jest.fn(async () => {}), releaseLock: jest.fn() };
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, body: { getReader: () => reader }, reader };
};

test('read remains a GET and only an explicit valid publication creates an authenticated POST', async () => {
  const empty = jsonResponse({ enabled: true, active: null }), read = jest.fn(async () => empty);
  expect(await requestMetabloomPriceBook({ fetchImpl: read })).toEqual({ enabled: true, active: null });
  expect(read).toHaveBeenCalledWith('/api/metabloom-price-book', expect.objectContaining({ method: 'GET', credentials: 'same-origin', cache: 'no-store' }));
  const active = { version: 1, publishedAt: 1000, book: book() }, published = jsonResponse({ enabled: true, active });
  const write = jest.fn(async () => published);
  expect(await requestMetabloomPriceBook({ ...publication(), fetchImpl: write })).toEqual({ enabled: true, active });
  expect(JSON.parse(write.mock.calls[0][1].body)).toEqual({ action: 'publish_draft', draftId: 'd'.repeat(32), draftRevision: 1, compiler: 'service-rates-1', requestId: 'publish-draft', expectedVersion: 0 });
  expect(write.mock.calls[0][1].method).toBe('POST');
  expect(published.reader.cancel).toHaveBeenCalled(); expect(published.reader.releaseLock).toHaveBeenCalled();
});

test('invalid publications and pre-cancelled requests never hit the network', async () => {
  const fetchImpl = jest.fn();
  for (const expectedVersion of [undefined, -1, '0', Number.MAX_SAFE_INTEGER])
    await expect(requestMetabloomPriceBook({ ...publication(), expectedVersion, fetchImpl })).rejects.toMatchObject({ code: 'price_book_invalid' });
  const controller = new AbortController(); controller.abort();
  await expect(requestMetabloomPriceBook({ signal: controller.signal, fetchImpl })).rejects.toMatchObject({ code: 'price_book_cancelled' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('draft reads and updates send no client formulas and reject malformed draft receipts', async () => {
  const draft = { id: 'd'.repeat(32), revision: 1, updatedAt: 1000, rules: { ...emptyMetabloomPriceRules(), currency: 'CAD' }, sources: {}, issues: [] };
  const read = jest.fn(async () => jsonResponse({ enabled: true, active: null, draft }));
  expect((await requestMetabloomPriceBook({ draft: true, fetchImpl: read })).draft).toEqual(draft);
  expect(read.mock.calls[0][0]).toBe('/api/metabloom-price-book?draft=1');
  const changes = [{ field: 'currency', value: 'CAD' }];
  const write = jest.fn(async () => jsonResponse({ enabled: true, active: null, draft }));
  await requestMetabloomPriceBook({ changes, expectedRevision: 0, requestId: 'save-draft', fetchImpl: write });
  expect(JSON.parse(write.mock.calls[0][1].body)).toEqual({ action: 'update_draft', changes, expectedRevision: 0, requestId: 'save-draft' });
  for (const bad of [null, { ...draft, revision: 2 }, { ...draft, issues: [null] }, { ...draft, rules: {} }])
    await expect(requestMetabloomPriceBook({ changes, expectedRevision: 0, requestId: 'save-draft',
      fetchImpl: async () => jsonResponse({ enabled: true, active: null, draft: bad }) })).rejects.toMatchObject({ code: 'price_book_invalid_response' });
  const fetchImpl = jest.fn();
  await expect(requestMetabloomPriceBook({ book: book(), expectedVersion: 0, fetchImpl })).rejects.toMatchObject({ code: 'price_book_legacy_draft' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('conflicts and ambiguous failures never retry publication or report it as successful', async () => {
  for (const [status, code] of [[409, 'price_book_conflict'], [503, 'price_book_unavailable'], [404, 'price_book_disabled'], [401, 'authentication_required']]) {
    const fetchImpl = jest.fn(async () => ({ ok: false, status, body: { cancel: jest.fn(async () => {}) } }));
    await expect(requestMetabloomPriceBook({ ...publication(), fetchImpl })).rejects.toMatchObject({ status, code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  }
});

test('malformed, oversized or mismatched successful receipts are rejected and their streams close', async () => {
  const active = { version: 1, publishedAt: 1000, book: book() };
  const changed = book(); changed.lines[0].formula[1] = '100';
  for (const value of [{ enabled: true, active: null }, { enabled: true, active: { ...active, version: 2 } },
    { enabled: true, active: { ...active, book: changed } }, { enabled: true, active, extra: true }, { text: 'x'.repeat(66049) }]) {
    const response = jsonResponse(value);
    await expect(requestMetabloomPriceBook({ ...publication(), fetchImpl: async () => response })).rejects.toBeInstanceOf(Error);
    expect(response.reader.cancel).toHaveBeenCalled(); expect(response.reader.releaseLock).toHaveBeenCalled();
  }
});
