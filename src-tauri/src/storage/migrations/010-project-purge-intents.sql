CREATE TABLE project_purge_intents (
    project_id TEXT PRIMARY KEY NOT NULL REFERENCES project_trash(project_id),
    trash_id TEXT NOT NULL UNIQUE,
    project_revision INTEGER NOT NULL CHECK(project_revision BETWEEN 0 AND 4294967295),
    started_at_ms INTEGER NOT NULL CHECK(started_at_ms BETWEEN 0 AND 9007199254740991)
);
PRAGMA user_version=10;
