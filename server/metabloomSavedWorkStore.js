const { createHash, randomUUID } = require('node:crypto');
const { parseMetabloomSavedContent, MAX_METABLOOM_SAVED_CONTENT_BYTES,
  METABLOOM_SAVED_CONTENT_VERSION } = require('./metabloomSavedContent');
const { validateMetabloomSavedWorkScope, assertMetabloomSavedWorkEnvironment,
  savedWorkError, isSavedWorkError, isSavedWorkConnectionError } = require('./metabloomSavedWorkMigrations');

const MAX_SAVED_ARTIFACTS = 50;
const MAX_SAVED_ACCOUNT_BYTES = 100 * 1024 * 1024;
const MAX_SAVED_CREATE_REQUESTS = 10000;
const MAX_VERSION = 2147483647;
const MAX_STORED_JSON_BYTES = MAX_METABLOOM_SAVED_CONTENT_BYTES + 128;
const uuid = value => typeof value === 'string'
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const version = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_VERSION;
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, required, optional = []) => plain(value)
  && required.every(key => Object.hasOwn(value, key))
  && Reflect.ownKeys(value).every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && (required.includes(key) || optional.includes(key))
      && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  });
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');
const invalid = () => { throw savedWorkError('saved_work_invalid'); };

// Key order must not change a create request's identity. Array order, source
// identifiers, decimal text and all original evidence remain unchanged.
const canonicalJson = value => JSON.stringify(value, (key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);

function accountKey(identity) {
  if (!keys(identity, ['accountKey']) || typeof identity.accountKey !== 'string'
    || !/^[a-f0-9]{64}$/.test(identity.accountKey)) invalid();
  return identity.accountKey;
}

function titleText(title) {
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 160
    // eslint-disable-next-line no-control-regex -- Saved titles reject control characters at ingestion.
    || /[\u0000-\u001f\u007f]/.test(title)) invalid();
  return title.trim();
}

function splitContent(content) {
  let payload, evidence;
  if (content.kind === 'visual') {
    const { sources, ...rest } = content;
    payload = rest;
    evidence = { schemaVersion: 1, kind: 'visual', sources };
  } else {
    const { report, ...rest } = content;
    payload = rest;
    evidence = { schemaVersion: 1, kind: 'research', report };
  }
  const payloadJson = canonicalJson(payload), evidenceJson = canonicalJson(evidence);
  const payloadBytes = Buffer.byteLength(payloadJson, 'utf8'), evidenceBytes = Buffer.byteLength(evidenceJson, 'utf8');
  if (payloadBytes > MAX_STORED_JSON_BYTES || evidenceBytes > MAX_STORED_JSON_BYTES) invalid();
  return { content, payloadJson, evidenceJson, payloadBytes, evidenceBytes,
    payloadHash: sha256(payloadJson), evidenceHash: sha256(evidenceJson), totalBytes: payloadBytes + evidenceBytes };
}

function prepareContent(value) {
  const content = parseMetabloomSavedContent(value);
  if (!content) invalid();
  return splitContent(content);
}

function isoTime(value) {
  if (!(value instanceof Date) && (typeof value !== 'string' || !value || value.length > 64))
    throw savedWorkError('saved_work_corrupt');
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw savedWorkError('saved_work_corrupt');
  return date.toISOString();
}

function metadata(row, selectedRevision = row.current_revision) {
  if (!uuid(row.id) || !uuid(row.workspace_id) || !['visual', 'research'].includes(row.kind)
    || !version(row.version) || !version(row.current_revision) || !version(selectedRevision)
    || typeof row.title !== 'string' || !row.title.trim() || row.title !== row.title.trim()
    // eslint-disable-next-line no-control-regex -- Read validation must also reject corrupted control characters.
    || row.title.length > 160 || /[\u0000-\u001f\u007f]/.test(row.title))
    throw savedWorkError('saved_work_corrupt');
  return { artifactId: row.id, workspaceId: row.workspace_id, title: row.title, kind: row.kind,
    version: row.version, revision: selectedRevision, headRevision: row.current_revision,
    createdAt: isoTime(row.created_at), updatedAt: isoTime(row.updated_at) };
}

function verifyBlob(json, hash, bytes) {
  if (typeof json !== 'string' || !Number.isSafeInteger(bytes) || bytes < 2 || bytes > MAX_STORED_JSON_BYTES
    || Buffer.byteLength(json, 'utf8') !== bytes || typeof hash !== 'string'
    || !/^[a-f0-9]{64}$/.test(hash) || sha256(json) !== hash)
    throw savedWorkError('saved_work_corrupt');
}

function storedContent(row, kind) {
  if (row.payload_version !== METABLOOM_SAVED_CONTENT_VERSION || row.evidence_version !== 1)
    throw savedWorkError('saved_work_unsupported');
  verifyBlob(row.payload_json, row.payload_sha256, row.payload_bytes);
  verifyBlob(row.evidence_json, row.evidence_sha256, row.evidence_bytes);
  try {
    const payload = JSON.parse(row.payload_json), evidence = JSON.parse(row.evidence_json);
    if (!plain(payload) || !plain(evidence) || payload.schemaVersion !== row.payload_version
      || evidence.schemaVersion !== row.evidence_version || payload.kind !== kind || evidence.kind !== kind)
      throw savedWorkError('saved_work_corrupt');
    const content = parseMetabloomSavedContent(kind === 'visual'
      ? { ...payload, sources: evidence.sources } : { ...payload, report: evidence.report });
    if (!content) throw savedWorkError('saved_work_corrupt');
    const checked = splitContent(content);
    // This also rejects extra fields, duplicate source authorities, and data
    // which a newer parser would silently discard or normalize differently.
    if (checked.payloadJson !== row.payload_json || checked.evidenceJson !== row.evidence_json)
      throw savedWorkError('saved_work_corrupt');
    return content;
  } catch (error) {
    if (error?.code === 'saved_work_corrupt') throw error;
    throw savedWorkError('saved_work_corrupt');
  }
}

function pageCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: isoTime(row.created_at), artifactId: row.id }), 'utf8').toString('base64url');
}

function readCursor(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,180}$/.test(value)) invalid();
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!keys(parsed, ['createdAt', 'artifactId']) || !uuid(parsed.artifactId)
      || typeof parsed.createdAt !== 'string' || new Date(parsed.createdAt).toISOString() !== parsed.createdAt
      || pageCursor({ id: parsed.artifactId, created_at: parsed.createdAt }) !== value) invalid();
    return parsed;
  } catch { invalid(); }
}

function boundedLimit(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > fallback) invalid();
  return value;
}

function createMetabloomSavedWorkStore({ pool, config } = {}) {
  const scope = validateMetabloomSavedWorkScope(config);
  if (!pool || typeof pool.connect !== 'function') throw savedWorkError();
  // Smaller bounds are useful in integration tests. Configuration cannot raise
  // the product limits, and no request parameter controls these values.
  const limits = {
    artifacts: boundedLimit(config.maxArtifacts, MAX_SAVED_ARTIFACTS),
    bytes: boundedLimit(config.maxAccountBytes, MAX_SAVED_ACCOUNT_BYTES),
    requests: boundedLimit(config.maxCreateRequests, MAX_SAVED_CREATE_REQUESTS),
  };

  async function transaction(work, { signal } = {}) {
    signal?.throwIfAborted();
    let client, started = false, broken = false;
    try {
      client = await pool.connect();
      signal?.throwIfAborted();
      await client.query('BEGIN');
      started = true;
      const query = async (sql, values) => {
        signal?.throwIfAborted();
        const result = await client.query(sql, values);
        signal?.throwIfAborted();
        return result;
      };
      await query("SET LOCAL statement_timeout = '5000ms'");
      await query("SET LOCAL lock_timeout = '2000ms'");
      await query("SET LOCAL idle_in_transaction_session_timeout = '10000ms'");
      await assertMetabloomSavedWorkEnvironment({ query }, scope);
      const result = await work(query);
      signal?.throwIfAborted();
      // Do not check cancellation after COMMIT: the write has succeeded then.
      await client.query('COMMIT');
      started = false;
      return result;
    } catch (error) {
      broken = isSavedWorkConnectionError(error);
      if (started) {
        try { await client.query('ROLLBACK'); } catch { broken = true; }
      }
      signal?.throwIfAborted();
      if (isSavedWorkError(error)) throw error;
      throw savedWorkError();
    } finally {
      client?.release(broken);
    }
  }

  async function owner(query, key, { create = false, lock = false } = {}) {
    if (create) {
      await query(`INSERT INTO metabloom_saved_work.accounts (id, account_key)
        VALUES ($1, $2) ON CONFLICT (account_key) DO NOTHING`, [randomUUID(), key]);
      const account = await query('SELECT id FROM metabloom_saved_work.accounts WHERE account_key = $1', [key]);
      if (account.rows.length !== 1 || !uuid(account.rows[0].id)) throw savedWorkError('saved_work_corrupt');
      await query(`INSERT INTO metabloom_saved_work.workspaces (id, account_id)
        VALUES ($1, $2) ON CONFLICT (account_id) DO NOTHING`, [randomUUID(), account.rows[0].id]);
    }
    const result = await query(`SELECT a.id AS account_id, w.id AS workspace_id
      FROM metabloom_saved_work.accounts a LEFT JOIN metabloom_saved_work.workspaces w ON w.account_id = a.id
      WHERE a.account_key = $1`, [key]);
    if (!result.rows.length) return null;
    if (result.rows.length !== 1 || !uuid(result.rows[0].account_id) || !uuid(result.rows[0].workspace_id))
      throw savedWorkError('saved_work_corrupt');
    const row = result.rows[0];
    if (lock) {
      const locked = await query(`SELECT id FROM metabloom_saved_work.workspaces
        WHERE id = $1 AND account_id = $2 FOR UPDATE`, [row.workspace_id, row.account_id]);
      if (locked.rows.length !== 1) throw savedWorkError('saved_work_not_found');
    }
    return { accountId: row.account_id, workspaceId: row.workspace_id };
  }

  async function artifact(query, identity, artifactId) {
    if (!identity) throw savedWorkError('saved_work_not_found');
    const result = await query(`SELECT * FROM metabloom_saved_work.artifacts
      WHERE id = $1 AND account_id = $2 AND workspace_id = $3`,
    [artifactId, identity.accountId, identity.workspaceId]);
    if (result.rows.length !== 1) throw savedWorkError('saved_work_not_found');
    return result.rows[0];
  }

  async function read(query, identity, artifactId, revision) {
    if (!identity) throw savedWorkError('saved_work_not_found');
    // One statement snapshots both metadata and immutable content. A concurrent
    // delete cannot turn a previously selected head into a spurious corruption.
    const result = await query(`SELECT a.*, r.revision AS selected_revision, r.schema_version AS payload_version,
      r.payload_json, r.payload_sha256, r.payload_bytes,
      e.schema_version AS evidence_version, e.evidence_json, e.evidence_sha256, e.evidence_bytes
      FROM metabloom_saved_work.artifacts a LEFT JOIN metabloom_saved_work.revisions r
        ON r.artifact_id = a.id AND r.account_id = a.account_id AND r.workspace_id = a.workspace_id
          AND r.revision = coalesce($4::integer, a.current_revision)
      LEFT JOIN metabloom_saved_work.evidence e
        ON e.id = r.evidence_id AND e.artifact_id = r.artifact_id
          AND e.account_id = r.account_id AND e.workspace_id = r.workspace_id
      WHERE a.id = $1 AND a.account_id = $2 AND a.workspace_id = $3`,
    [artifactId, identity.accountId, identity.workspaceId, revision ?? null]);
    if (result.rows.length !== 1) throw savedWorkError('saved_work_not_found');
    const row = result.rows[0];
    if (row.selected_revision === null)
      throw savedWorkError((revision ?? row.current_revision) === row.current_revision ? 'saved_work_corrupt' : 'saved_work_not_found');
    if (row.evidence_version === null) throw savedWorkError('saved_work_corrupt');
    return { ...metadata(row, row.selected_revision), content: storedContent(row, row.kind) };
  }

  async function budget(query, identity, bytes, { creating = false } = {}) {
    const result = await query(`SELECT
      (SELECT count(*) FROM metabloom_saved_work.artifacts WHERE account_id = $1) AS artifact_count,
      (SELECT count(*) FROM metabloom_saved_work.create_requests WHERE account_id = $1) AS request_count,
      (SELECT coalesce(sum(payload_bytes), 0) FROM metabloom_saved_work.revisions WHERE account_id = $1)
        + (SELECT coalesce(sum(evidence_bytes), 0) FROM metabloom_saved_work.evidence WHERE account_id = $1) AS byte_count`,
    [identity.accountId]);
    const row = result.rows[0];
    const counts = row && [row.artifact_count, row.request_count, row.byte_count].map(Number);
    if (!counts || counts.some(value => !Number.isSafeInteger(value) || value < 0))
      throw savedWorkError('saved_work_corrupt');
    if (counts[2] + bytes > limits.bytes || (creating && (counts[0] >= limits.artifacts || counts[1] >= limits.requests)))
      throw savedWorkError('saved_work_limit');
  }

  async function insertRevision(query, identity, artifactId, revision, prepared) {
    const evidenceId = randomUUID();
    await query(`INSERT INTO metabloom_saved_work.evidence
      (id, artifact_id, account_id, workspace_id, schema_version, evidence_json, evidence_sha256, evidence_bytes)
      VALUES ($1, $2, $3, $4, 1, $5, $6, $7)`,
    [evidenceId, artifactId, identity.accountId, identity.workspaceId,
      prepared.evidenceJson, prepared.evidenceHash, prepared.evidenceBytes]);
    await query(`INSERT INTO metabloom_saved_work.revisions
      (id, artifact_id, account_id, workspace_id, revision, schema_version,
       payload_json, payload_sha256, payload_bytes, evidence_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [randomUUID(), artifactId, identity.accountId, identity.workspaceId, revision,
      METABLOOM_SAVED_CONTENT_VERSION, prepared.payloadJson, prepared.payloadHash, prepared.payloadBytes, evidenceId]);
  }

  function mutation(input, extra) {
    if (!keys(input, ['artifactId', 'expectedVersion', ...extra]) || !uuid(input.artifactId)
      || !version(input.expectedVersion)) invalid();
    return { artifactId: input.artifactId, expectedVersion: input.expectedVersion };
  }

  function checkVersion(row, expectedVersion) {
    if (row.version !== expectedVersion) throw savedWorkError('saved_work_conflict');
  }

  return Object.freeze({
    async ensureAccount(identity, options) {
      const key = accountKey(identity);
      return transaction(query => owner(query, key, { create: true }), options);
    },

    async create(identity, input, options) {
      const key = accountKey(identity);
      if (!keys(input, ['requestId', 'title', 'content']) || !uuid(input.requestId)) invalid();
      const requestId = input.requestId;
      const title = titleText(input.title), prepared = prepareContent(input.content);
      const fingerprint = sha256(canonicalJson({ title, content: prepared.content }));
      return transaction(async query => {
        const owned = await owner(query, key, { create: true, lock: true });
        const previous = await query(`SELECT artifact_id, request_sha256, retired
          FROM metabloom_saved_work.create_requests WHERE account_id = $1 AND request_id = $2`,
        [owned.accountId, requestId]);
        if (previous.rows.length) {
          const request = previous.rows[0];
          if (!uuid(request.artifact_id) || typeof request.request_sha256 !== 'string'
            || !/^[a-f0-9]{64}$/.test(request.request_sha256) || typeof request.retired !== 'boolean')
            throw savedWorkError('saved_work_corrupt');
          if (request.request_sha256 !== fingerprint) throw savedWorkError('saved_work_conflict');
          if (request.retired) throw savedWorkError('saved_work_deleted');
          try { return await read(query, owned, request.artifact_id); }
          catch (error) {
            if (error?.code === 'saved_work_not_found') throw savedWorkError('saved_work_corrupt');
            throw error;
          }
        }
        await budget(query, owned, prepared.totalBytes, { creating: true });
        const artifactId = randomUUID();
        await query(`INSERT INTO metabloom_saved_work.create_requests
          (account_id, request_id, artifact_id, request_sha256) VALUES ($1, $2, $3, $4)`,
        [owned.accountId, requestId, artifactId, fingerprint]);
        const result = await query(`INSERT INTO metabloom_saved_work.artifacts
          (id, account_id, workspace_id, request_id, title, kind) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [artifactId, owned.accountId, owned.workspaceId, requestId, title, prepared.content.kind]);
        await insertRevision(query, owned, artifactId, 1, prepared);
        return { ...metadata(result.rows[0]), content: prepared.content };
      }, options);
    },

    async get(identity, input, options) {
      const key = accountKey(identity);
      if (!keys(input, ['artifactId'], ['revision']) || !uuid(input.artifactId)
        || (Object.hasOwn(input, 'revision') && !version(input.revision))) invalid();
      const { artifactId, revision } = input;
      return transaction(async query => read(query, await owner(query, key), artifactId, revision), options);
    },

    async list(identity, input = {}, options) {
      const key = accountKey(identity);
      if (!keys(input, [], ['limit', 'after'])) invalid();
      const limit = Object.hasOwn(input, 'limit') ? boundedLimit(input.limit, 50) : 20;
      const after = readCursor(input.after);
      return transaction(async query => {
        const owned = await owner(query, key);
        if (!owned) return { items: [], nextCursor: null };
        const result = await query(`SELECT id, workspace_id, title, kind, version, current_revision, created_at, updated_at
          FROM metabloom_saved_work.artifacts WHERE account_id = $1 AND workspace_id = $2
            AND ($3::timestamptz IS NULL OR (created_at, id) < ($3::timestamptz, $4::uuid))
          ORDER BY created_at DESC, id DESC LIMIT $5`,
        [owned.accountId, owned.workspaceId, after?.createdAt || null, after?.artifactId || null, limit + 1]);
        const rows = result.rows.slice(0, limit);
        return { items: rows.map(row => metadata(row)),
          nextCursor: result.rows.length > limit ? pageCursor(rows[rows.length - 1]) : null };
      }, options);
    },

    async history(identity, input, options) {
      const key = accountKey(identity);
      if (!keys(input, ['artifactId'], ['limit', 'beforeRevision']) || !uuid(input.artifactId)
        || (Object.hasOwn(input, 'beforeRevision') && !version(input.beforeRevision))) invalid();
      const { artifactId, beforeRevision } = input;
      const limit = Object.hasOwn(input, 'limit') ? boundedLimit(input.limit, 50) : 20;
      return transaction(async query => {
        const owned = await owner(query, key);
        if (!owned) throw savedWorkError('saved_work_not_found');
        // One statement sees the head and history page in the same snapshot,
        // including an empty page. A concurrent append cannot split those views.
        const result = await query(`SELECT a.*, r.revision AS history_revision,
          r.created_at AS revision_created_at FROM metabloom_saved_work.artifacts a
          LEFT JOIN metabloom_saved_work.revisions r ON r.artifact_id = a.id
            AND r.account_id = a.account_id AND r.workspace_id = a.workspace_id
            AND ($4::integer IS NULL OR r.revision < $4)
          WHERE a.id = $1 AND a.account_id = $2 AND a.workspace_id = $3
          ORDER BY r.revision DESC LIMIT $5`,
        [artifactId, owned.accountId, owned.workspaceId, beforeRevision ?? null, limit + 1]);
        if (!result.rows.length) throw savedWorkError('saved_work_not_found');
        const selected = metadata(result.rows[0]);
        const rows = result.rows.filter(row => row.history_revision !== null);
        let previous = beforeRevision || MAX_VERSION + 1;
        const items = rows.slice(0, limit).map(row => {
          if (!version(row.history_revision) || row.history_revision > selected.headRevision
            || row.history_revision >= previous) throw savedWorkError('saved_work_corrupt');
          previous = row.history_revision;
          return { revision: row.history_revision, createdAt: isoTime(row.revision_created_at) };
        });
        return { artifact: selected, items,
          nextBeforeRevision: rows.length > limit ? items[items.length - 1].revision : null };
      }, options);
    },

    async appendRevision(identity, input, options) {
      const key = accountKey(identity);
      const { artifactId, expectedVersion } = mutation(input, ['content']);
      const prepared = prepareContent(input.content);
      return transaction(async query => {
        const owned = await owner(query, key, { lock: true });
        const row = await artifact(query, owned, artifactId);
        checkVersion(row, expectedVersion);
        if (row.kind !== prepared.content.kind) invalid();
        if (row.version >= MAX_VERSION || row.current_revision >= MAX_VERSION) throw savedWorkError('saved_work_limit');
        await budget(query, owned, prepared.totalBytes);
        await insertRevision(query, owned, row.id, row.current_revision + 1, prepared);
        const result = await query(`UPDATE metabloom_saved_work.artifacts
          SET version = version + 1, current_revision = current_revision + 1, updated_at = clock_timestamp()
          WHERE id = $1 AND account_id = $2 AND workspace_id = $3 AND version = $4 RETURNING *`,
        [row.id, owned.accountId, owned.workspaceId, expectedVersion]);
        if (result.rows.length !== 1) throw savedWorkError('saved_work_conflict');
        return { ...metadata(result.rows[0]), content: prepared.content };
      }, options);
    },

    async rename(identity, input, options) {
      const key = accountKey(identity);
      const { artifactId, expectedVersion } = mutation(input, ['title']);
      const title = titleText(input.title);
      return transaction(async query => {
        const owned = await owner(query, key, { lock: true });
        const row = await artifact(query, owned, artifactId);
        checkVersion(row, expectedVersion);
        if (row.version >= MAX_VERSION) throw savedWorkError('saved_work_limit');
        const result = await query(`UPDATE metabloom_saved_work.artifacts
          SET title = $1, version = version + 1, updated_at = clock_timestamp()
          WHERE id = $2 AND account_id = $3 AND workspace_id = $4 AND version = $5 RETURNING *`,
        [title, row.id, owned.accountId, owned.workspaceId, expectedVersion]);
        if (result.rows.length !== 1) throw savedWorkError('saved_work_conflict');
        return metadata(result.rows[0]);
      }, options);
    },

    async delete(identity, input, options) {
      const key = accountKey(identity);
      const { artifactId, expectedVersion } = mutation(input, []);
      return transaction(async query => {
        const owned = await owner(query, key, { lock: true });
        const row = await artifact(query, owned, artifactId);
        checkVersion(row, expectedVersion);
        const result = await query(`DELETE FROM metabloom_saved_work.artifacts
          WHERE id = $1 AND account_id = $2 AND workspace_id = $3 AND version = $4 RETURNING id`,
        [row.id, owned.accountId, owned.workspaceId, expectedVersion]);
        if (result.rows.length !== 1) throw savedWorkError('saved_work_conflict');
        return { artifactId: row.id, version: row.version, deleted: true };
      }, options);
    },
  });
}

module.exports = { createMetabloomSavedWorkStore, MAX_SAVED_ARTIFACTS,
  MAX_SAVED_ACCOUNT_BYTES, MAX_SAVED_CREATE_REQUESTS };
