const { parseMetabloomSavedContent } = require('./metabloomSavedContent');
const { buildMetabloomResearchTemporalContext } = require('./metabloomResearchBrief');
const { savedWorkError } = require('./metabloomSavedWorkMigrations');

const sourceExpired = () => Object.assign(new Error('saved_work_source_expired'),
  { code: 'saved_work_source_expired', status: 410 });

// Browser input supplies only a locator and optional numeric calculator inputs.
// Complete evidence and provenance come from the independently owned stores.
async function resolveMetabloomSavedWorkSource({ source, scenario, identity, visualStore, researchStore, signal }) {
  signal?.throwIfAborted();
  if (source.kind === 'visual') {
    const record = await visualStore.getArtifactRecord(identity, source.id, { signal });
    signal?.throwIfAborted();
    if (!record || record.artifactVersion !== source.artifactVersion) throw sourceExpired();
    const content = parseMetabloomSavedContent({ schemaVersion: 1, kind: 'visual',
      spec: record.spec, sources: record.sources });
    if (!content) throw savedWorkError();
    if (scenario === undefined) return content;
    const selected = parseMetabloomSavedContent({ ...content, scenario });
    if (!selected) throw savedWorkError('saved_work_invalid');
    return selected;
  }
  const record = await researchStore.getReport(identity, source.researchId, { signal });
  signal?.throwIfAborted();
  if (!record) throw sourceExpired();
  const brief = source.briefId
    ? await researchStore.getBrief(identity, source.researchId, source.briefId, { signal }) : null;
  signal?.throwIfAborted();
  if (source.briefId && !brief) throw sourceExpired();
  const content = parseMetabloomSavedContent({ schemaVersion: 1, kind: 'research', question: record.message,
    asOf: record.temporalContext.asOf, timeZone: record.temporalContext.timeZone,
    localDate: record.temporalContext.localDate, report: record.report, ...(brief ? { brief } : {}) });
  if (!content) throw savedWorkError();
  return content;
}

async function restoreMetabloomSavedWorkReference({ content, identity, visualStore, researchStore, signal }) {
  signal?.throwIfAborted();
  if (content.kind === 'visual') {
    const reference = await visualStore.restoreArtifact(identity, content, { signal });
    signal?.throwIfAborted();
    return { kind: 'visual', ...reference };
  }
  // Recompute the established original temporal context, never today's window.
  // Retention starts now; asOf/localDate and the complete evidence stay original.
  const temporalContext = buildMetabloomResearchTemporalContext({ message: content.question,
    timeZone: content.timeZone, now: Date.parse(content.asOf) });
  if (temporalContext.localDate !== content.localDate) throw savedWorkError('saved_work_unsupported');
  let research = await researchStore.saveReport(identity, { message: content.question,
    report: content.report, temporalContext }, { signal });
  signal?.throwIfAborted();
  if (content.brief) {
    research = await researchStore.saveBrief(identity, research.researchId, content.brief, { signal });
    signal?.throwIfAborted();
  }
  return { kind: 'research', research };
}

module.exports = { resolveMetabloomSavedWorkSource, restoreMetabloomSavedWorkReference };
