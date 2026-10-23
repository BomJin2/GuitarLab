CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT,
    mode TEXT NOT NULL CHECK(mode IN ('copy','practice','performance')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
    revision_id TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
CREATE TABLE project_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    kind TEXT NOT NULL CHECK(kind IN ('SCORE_IMPORT','ORIGINAL')),
    storage TEXT NOT NULL CHECK(storage IN ('MANAGED','REFERENCE')),
    name TEXT NOT NULL,
    extension TEXT NOT NULL,
    relative_path TEXT,
    external_path TEXT,
    sha256 TEXT NOT NULL,
    bytes INTEGER NOT NULL CHECK(bytes > 0),
    created_at_ms INTEGER NOT NULL,
    CHECK((storage='MANAGED' AND relative_path IS NOT NULL AND external_path IS NULL)
        OR (storage='REFERENCE' AND relative_path IS NULL AND external_path IS NOT NULL)),
    UNIQUE(project_id,kind,sha256),
    UNIQUE(project_id,id)
);
CREATE TABLE score_revisions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    revision INTEGER NOT NULL CHECK(revision > 0),
    relative_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    score_asset_id TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    UNIQUE(project_id,revision),
    UNIQUE(project_id,id),
    FOREIGN KEY(project_id,score_asset_id) REFERENCES project_assets(project_id,id)
);
CREATE TABLE practice_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    score_revision_id TEXT NOT NULL,
    track_id TEXT NOT NULL,
    config_json TEXT NOT NULL,
    config_fingerprint TEXT NOT NULL,
    scoring_version TEXT NOT NULL,
    started_at_ms INTEGER NOT NULL,
    ended_at_ms INTEGER,
    status TEXT NOT NULL CHECK(status IN ('RUNNING','FINISHED','STOPPED','INVALIDATED','INTERRUPTED')),
    FOREIGN KEY(project_id,score_revision_id) REFERENCES score_revisions(project_id,id)
);
CREATE TABLE practice_attempts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES practice_sessions(id),
    playback_epoch INTEGER NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('RUNNING','FINISHED','STOPPED','INVALIDATED','INTERRUPTED')),
    summary_json TEXT NOT NULL,
    summary_sha256 TEXT NOT NULL,
    last_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_event_sequence >= 0),
    started_at_ms INTEGER NOT NULL,
    ended_at_ms INTEGER,
    completed_order INTEGER UNIQUE
);
CREATE TABLE judgement_events (
    attempt_id TEXT NOT NULL REFERENCES practice_attempts(id),
    sequence INTEGER NOT NULL CHECK(sequence > 0),
    note_id TEXT NOT NULL,
    measure_index INTEGER NOT NULL CHECK(measure_index >= 0),
    event_json TEXT NOT NULL,
    event_sha256 TEXT NOT NULL,
    PRIMARY KEY(attempt_id,sequence)
);
CREATE INDEX idx_assets_project ON project_assets(project_id);
CREATE INDEX idx_sessions_project ON practice_sessions(project_id);
CREATE INDEX idx_events_note ON judgement_events(attempt_id,note_id);
PRAGMA user_version=1;
