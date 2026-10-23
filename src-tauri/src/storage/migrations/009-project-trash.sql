CREATE TABLE project_trash (
    project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id),
    trash_id TEXT NOT NULL UNIQUE,
    trashed_at_ms INTEGER NOT NULL CHECK(trashed_at_ms BETWEEN 0 AND 9007199254740991),
    project_revision INTEGER NOT NULL CHECK(project_revision BETWEEN 0 AND 4294967295)
);
CREATE INDEX idx_project_trash_time ON project_trash(trashed_at_ms DESC,project_id);
PRAGMA user_version=9;
