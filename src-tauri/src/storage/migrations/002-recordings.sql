CREATE TABLE recorded_takes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    score_revision_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('ARMING','RECORDING','FINALIZING','READY','RECOVERABLE_ERROR','CANCELLED')),
    metadata_json TEXT NOT NULL,
    metadata_sha256 TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    FOREIGN KEY(project_id,score_revision_id) REFERENCES score_revisions(project_id,id)
);
CREATE INDEX idx_takes_project ON recorded_takes(project_id,created_at_ms);
PRAGMA user_version=2;
