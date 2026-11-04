const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { createMetabloomVisualStore } = require('../../server/metabloomVisualStore');
const researchFixture = require('./metabloom-research-reuse.cjs');
const { savedWorkError } = require('../../server/metabloomSavedWorkErrors');

const accountIdentity = { accountKey: 'e'.repeat(64) };
const identity = researchFixture.identity;
const visualContent = () => ({ schemaVersion: 1, kind: 'visual', sources: [{
  id: 9, title: 'Fictional source', url: 'https://example.org/fictional-prices' }], spec: {
  version: '1', designVersion: 'aetheris-1', kind: 'calculator', title: 'Fictional project price',
  summary: 'Fictional values for an interaction test.', unit: 'CAD',
  provenance: { type: 'sources', label: 'Fictional recorded evidence.', sourceIds: [9] },
  controls: [{ id: 'hours', label: 'Hours', unit: 'h', min: 1, max: 80, step: 1, initial: 10 },
    { id: 'rate', label: 'Hourly rate', unit: 'CAD/h', min: 10, max: 200, step: 1, initial: 65 }],
  formula: ['hours', 'rate', 'multiply'], formulaDescription: 'Hours multiplied by hourly rate.',
} });
const response = () => Object.assign(new EventEmitter(), { statusCode: 0, headers: {}, body: '',
  writableEnded: false, destroyed: false, setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
  end(value = '') { this.body += value; this.writableEnded = true; } });
const request = body => ({ method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000',
  'content-type': 'application/json' }, body, aborted: false });
const authenticate = (account = accountIdentity, session = identity) => async (_request, options) => {
  options.onIdentity(session); options.onAccountIdentity(account); return null;
};
function temporaryStores() {
  const research = researchFixture.memoryStore();
  return { ...research, researchStore: research.store,
    visualStore: createMetabloomVisualStore({ command: research.command, now: () => research.clock.value }) };
}
const metadata = (content, title = 'Saved fixture') => ({ artifactId: randomUUID(), workspaceId: randomUUID(),
  title, kind: content.kind, version: 1, revision: 1, headRevision: 1,
  createdAt: '2026-11-03T13:00:00.000Z', updatedAt: '2026-11-03T13:00:00.000Z' });

// Adapter fixture only. Atomicity, constraints, idempotency and ownership are
// independently verified by the native Redis suite.
function durableFixture() {
  const values = new Map(), revisions = new Map(), calls = [];
  const owned = (account, artifactId) => {
    const value = values.get(artifactId);
    if (!value || value.accountKey !== account.accountKey) throw savedWorkError('saved_work_not_found');
    return value;
  };
  const store = {
    async create(account, input, options) {
      calls.push(['create', structuredClone(account), structuredClone(input), options.signal]);
      const value = { ...metadata(input.content, input.title.trim()), content: structuredClone(input.content) };
      values.set(value.artifactId, { ...value, accountKey: account.accountKey });
      revisions.set(value.artifactId, [{ revision: 1, createdAt: value.createdAt, content: structuredClone(value.content) }]);
      return value;
    },
    async get(account, input, options) {
      calls.push(['get', structuredClone(account), structuredClone(input), options.signal]);
      const value = owned(account, input.artifactId);
      const selected = revisions.get(value.artifactId).find(item => item.revision === (input.revision || value.headRevision));
      if (!selected) throw savedWorkError('saved_work_not_found');
      return structuredClone({ ...value, revision: selected.revision, content: selected.content });
    },
    async list(account, input, options) {
      calls.push(['list', structuredClone(account), structuredClone(input), options.signal]);
      return { items: [...values.values()].filter(value => value.accountKey === account.accountKey)
        .slice(0, input.limit || 20), nextCursor: null };
    },
    async rename(account, input, options) {
      calls.push(['rename', structuredClone(account), structuredClone(input), options.signal]);
      const value = owned(account, input.artifactId);
      if (value.version !== input.expectedVersion) throw savedWorkError('saved_work_conflict');
      value.title = input.title.trim(); value.version++;
      return structuredClone(value);
    },
    async appendRevision(account, input, options) {
      calls.push(['appendRevision', structuredClone(account), structuredClone(input), options.signal]);
      const value = owned(account, input.artifactId);
      if (value.version !== input.expectedVersion) throw savedWorkError('saved_work_conflict');
      if (value.kind !== input.content.kind) throw savedWorkError('saved_work_invalid');
      value.version++; value.headRevision++; value.revision = value.headRevision;
      value.content = structuredClone(input.content);
      revisions.get(value.artifactId).push({ revision: value.headRevision, createdAt: value.updatedAt,
        content: structuredClone(input.content) });
      return structuredClone(value);
    },
    async history(account, input, options) {
      calls.push(['history', structuredClone(account), structuredClone(input), options.signal]);
      const value = owned(account, input.artifactId), limit = input.limit || 20;
      const rows = revisions.get(value.artifactId).filter(item => !input.beforeRevision
        || item.revision < input.beforeRevision).slice().reverse();
      const items = rows.slice(0, limit).map(item => ({ revision: item.revision, createdAt: item.createdAt }));
      return { artifact: structuredClone(value), items,
        nextBeforeRevision: rows.length > limit ? items[items.length - 1].revision : null };
    },
    async delete(account, input, options) {
      calls.push(['delete', structuredClone(account), structuredClone(input), options.signal]);
      const value = owned(account, input.artifactId);
      if (value.version !== input.expectedVersion) throw savedWorkError('saved_work_conflict');
      values.delete(value.artifactId);
      revisions.delete(value.artifactId);
      return { artifactId: value.artifactId, version: value.version, deleted: true };
    },
  };
  return { store, values, revisions, calls };
}

module.exports = { accountIdentity, identity, visualContent, response, request, authenticate,
  temporaryStores, metadata, durableFixture, researchFixture };
