const { buildMetabloomResearchTemporalContext } = require('../../server/metabloomResearchBrief');
const { createMetabloomResearchStore } = require('../../server/metabloomResearchStore');

const identity = { owner: 'a'.repeat(64), subject: 'b'.repeat(64), scope: 'c'.repeat(64) };
const asOf = '2026-11-02T13:00:00.000Z';
const message = 'Research the fictional public programs and their evidence.';
const temporalContext = () => buildMetabloomResearchTemporalContext({ message, timeZone: 'UTC', now: Date.parse(asOf) });
const sources = Array.from({ length: 10 }, (_, index) => ({ id: index + 1,
  title: `Fictional bulletin ${index + 1}`, url: `https://example.org/bulletin-${index + 1}` }));
const report = () => ({ notes: sources.map(source => `Program ${source.id} has a documented local trial. The original evidence does not establish national coverage. [${source.id}]`).join('\n\n'),
  sources: structuredClone(sources) });
const item = (id = 9) => ({ headline: `Program ${id} local trial`, summary: `Program ${id} has a documented local trial.`,
  sourceIds: [id], background: [{ text: 'The original evidence does not establish national coverage.', sourceIds: [id] }],
  whyItMatters: 'The local service is being evaluated.', uncertainty: ['Expansion remains unknown.'],
  watchNext: ['The evaluation has not been published.'], developmentDate: null, scheduledDate: null,
  dateEvidence: null, evidenceStatus: 'reported' });
const brief = () => ({ version: 'metabloom-research-brief-v1', kind: 'research', title: 'Fictional local programs',
  scope: 'Two documented programs', asOf, timeZone: 'UTC', localDate: '2026-11-02', windowStart: null, windowEnd: null,
  coverage: { requestedCount: 3, returnedCount: 2, status: 'partial', limitations: ['Only two programs were established.'] },
  items: [item(9), item(10)], sourceDetails: [9, 10].map(sourceId => ({ sourceId, publisher: '', publishedDate: null,
    dateEvidence: '', sourceType: 'unknown' })) });
function memoryStore({ now = Date.parse(asOf) + 1000 } = {}) {
  const values = new Map(), commands = [];
  const clock = { value: now };
  const command = async args => {
    commands.push(structuredClone(args));
    const [operation, key] = args;
    if (operation === 'GET') {
      const item = values.get(key);
      return item && item.expiresAt > clock.value ? item.raw : null;
    }
    if (operation !== 'SET') throw new Error('Unexpected test command');
    if (values.has(key) && values.get(key).expiresAt > clock.value) return null;
    const expiresAt = args[3] === 'EX' ? clock.value + Number(args[4]) * 1000 : Number(args[4]);
    values.set(key, { raw: args[2], expiresAt });
    return 'OK';
  };
  const store = createMetabloomResearchStore({ command, now: () => clock.value });
  return { store, command, values, commands, clock };
}
module.exports = { identity, asOf, message, temporalContext, sources, report, item, brief, memoryStore };
