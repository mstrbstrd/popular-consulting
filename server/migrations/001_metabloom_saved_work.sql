-- Saved work is private, durable data. Redis offers and session identifiers are
-- deliberately absent. Migrations run explicitly with a separate connection.
CREATE TABLE metabloom_saved_work.accounts (
  id uuid PRIMARY KEY,
  account_key text NOT NULL UNIQUE CHECK (account_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE metabloom_saved_work.workspaces (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES metabloom_saved_work.accounts(id) ON DELETE CASCADE,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, account_id)
);

-- This small ledger survives artifact deletion. Replaying an old create request
-- must not resurrect deleted work or reuse its identifier.
CREATE TABLE metabloom_saved_work.create_requests (
  account_id uuid NOT NULL REFERENCES metabloom_saved_work.accounts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  artifact_id uuid NOT NULL UNIQUE,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  retired boolean NOT NULL DEFAULT false,
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, request_id),
  UNIQUE (account_id, request_id, artifact_id)
);

CREATE TABLE metabloom_saved_work.artifacts (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  request_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  kind text NOT NULL CHECK (kind IN ('visual', 'research')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision > 0),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, account_id, workspace_id),
  FOREIGN KEY (workspace_id, account_id)
    REFERENCES metabloom_saved_work.workspaces(id, account_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, request_id, id)
    REFERENCES metabloom_saved_work.create_requests(account_id, request_id, artifact_id)
);

CREATE INDEX saved_work_artifacts_page
  ON metabloom_saved_work.artifacts(account_id, created_at DESC, id DESC);

CREATE TABLE metabloom_saved_work.evidence (
  id uuid PRIMARY KEY,
  artifact_id uuid NOT NULL,
  account_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  evidence_json text NOT NULL,
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_bytes integer NOT NULL
    CHECK (evidence_bytes = octet_length(evidence_json) AND evidence_bytes BETWEEN 2 AND 2097152),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, artifact_id, account_id, workspace_id),
  FOREIGN KEY (artifact_id, account_id, workspace_id)
    REFERENCES metabloom_saved_work.artifacts(id, account_id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE metabloom_saved_work.revisions (
  id uuid PRIMARY KEY,
  artifact_id uuid NOT NULL,
  account_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  payload_json text NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  payload_bytes integer NOT NULL
    CHECK (payload_bytes = octet_length(payload_json) AND payload_bytes BETWEEN 2 AND 2097152),
  evidence_id uuid NOT NULL UNIQUE,
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (artifact_id, account_id, workspace_id, revision),
  FOREIGN KEY (artifact_id, account_id, workspace_id)
    REFERENCES metabloom_saved_work.artifacts(id, account_id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id, artifact_id, account_id, workspace_id)
    REFERENCES metabloom_saved_work.evidence(id, artifact_id, account_id, workspace_id)
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE metabloom_saved_work.artifacts ADD CONSTRAINT saved_work_current_revision
  FOREIGN KEY (id, account_id, workspace_id, current_revision)
  REFERENCES metabloom_saved_work.revisions(artifact_id, account_id, workspace_id, revision)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX saved_work_revision_account ON metabloom_saved_work.revisions(account_id);
CREATE INDEX saved_work_evidence_account ON metabloom_saved_work.evidence(account_id);

CREATE FUNCTION metabloom_saved_work.protect_immutable_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, metabloom_saved_work AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'saved work immutable record' USING ERRCODE = '55000';
  END IF;
  -- Depth alone is insufficient: a caller's unrelated trigger must not be able
  -- to delete evidence. Its owning parent must already have been deleted by the
  -- same cascading statement, which PostgreSQL makes visible to this trigger.
  IF TG_TABLE_NAME IN ('revisions', 'evidence') THEN
    IF pg_trigger_depth() < 2 OR EXISTS (
      SELECT 1 FROM metabloom_saved_work.artifacts WHERE id = OLD.artifact_id
    ) THEN
      RAISE EXCEPTION 'saved work child deletion requires parent cascade' USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'workspaces' THEN
    IF pg_trigger_depth() < 2 OR EXISTS (
      SELECT 1 FROM metabloom_saved_work.accounts WHERE id = OLD.account_id
    ) THEN
      RAISE EXCEPTION 'saved work workspace deletion requires account cascade' USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION 'saved work immutable record' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION metabloom_saved_work.protect_create_request() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, metabloom_saved_work AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF pg_trigger_depth() < 2 OR OLD.retired OR NOT NEW.retired
      OR (to_jsonb(NEW) - 'retired') IS DISTINCT FROM (to_jsonb(OLD) - 'retired')
      OR EXISTS (SELECT 1 FROM metabloom_saved_work.artifacts WHERE id = OLD.artifact_id) THEN
      RAISE EXCEPTION 'saved work create request is immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() < 2 OR EXISTS (
    SELECT 1 FROM metabloom_saved_work.accounts WHERE id = OLD.account_id
  ) THEN
    RAISE EXCEPTION 'saved work request deletion requires account cascade' USING ERRCODE = '55000';
  END IF;
  RETURN OLD;
END;
$$;

CREATE FUNCTION metabloom_saved_work.protect_artifact_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, metabloom_saved_work AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM metabloom_saved_work.create_requests
      WHERE account_id = NEW.account_id AND request_id = NEW.request_id
        AND artifact_id = NEW.id AND NOT retired) THEN
      RAISE EXCEPTION 'saved work create request unavailable' USING ERRCODE = '55000';
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_id IS DISTINCT FROM OLD.account_id
    OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.version::bigint <> OLD.version::bigint + 1
    OR NEW.current_revision::bigint NOT IN (OLD.current_revision::bigint, OLD.current_revision::bigint + 1) THEN
    RAISE EXCEPTION 'saved work artifact identity or version is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION metabloom_saved_work.retire_create_request() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, metabloom_saved_work AS $$
BEGIN
  UPDATE metabloom_saved_work.create_requests SET retired = true
    WHERE account_id = OLD.account_id AND request_id = OLD.request_id AND NOT retired;
  RETURN OLD;
END;
$$;

CREATE FUNCTION metabloom_saved_work.prevent_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'saved work requires owned deletion' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER accounts_immutable BEFORE UPDATE ON metabloom_saved_work.accounts
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_immutable_row();
CREATE TRIGGER workspaces_immutable BEFORE UPDATE OR DELETE ON metabloom_saved_work.workspaces
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_immutable_row();
CREATE TRIGGER revisions_immutable BEFORE UPDATE OR DELETE ON metabloom_saved_work.revisions
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_immutable_row();
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON metabloom_saved_work.evidence
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_immutable_row();
CREATE TRIGGER create_requests_immutable BEFORE UPDATE OR DELETE ON metabloom_saved_work.create_requests
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_create_request();
CREATE TRIGGER artifacts_identity BEFORE INSERT OR UPDATE ON metabloom_saved_work.artifacts
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_artifact_identity();
CREATE TRIGGER artifacts_retire_request AFTER DELETE ON metabloom_saved_work.artifacts
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.retire_create_request();
CREATE TRIGGER environment_immutable BEFORE UPDATE OR DELETE ON metabloom_saved_work.environment
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_immutable_row();
CREATE TRIGGER migrations_immutable BEFORE UPDATE OR DELETE ON metabloom_saved_work.migrations
  FOR EACH ROW EXECUTE FUNCTION metabloom_saved_work.protect_immutable_row();

CREATE TRIGGER accounts_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.accounts
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
CREATE TRIGGER workspaces_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.workspaces
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
CREATE TRIGGER artifacts_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.artifacts
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
CREATE TRIGGER revisions_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.revisions
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
CREATE TRIGGER evidence_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.evidence
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
CREATE TRIGGER create_requests_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.create_requests
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
CREATE TRIGGER environment_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.environment
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
CREATE TRIGGER migrations_no_truncate BEFORE TRUNCATE ON metabloom_saved_work.migrations
  EXECUTE FUNCTION metabloom_saved_work.prevent_truncate();
