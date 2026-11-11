CREATE TABLE take_renders (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id),
    take_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('FREEZE','BOUNCE')),
    metadata_json TEXT NOT NULL CHECK(length(CAST(metadata_json AS BLOB)) BETWEEN 1 AND 4096),
    metadata_sha256 TEXT NOT NULL CHECK(length(metadata_sha256)=64 AND metadata_sha256 NOT GLOB '*[^a-f0-9]*'),
    state BLOB NOT NULL CHECK(length(state) BETWEEN 1 AND 8388608),
    state_sha256 TEXT NOT NULL CHECK(length(state_sha256)=64)
);
CREATE INDEX idx_take_renders_project ON take_renders(project_id);
CREATE UNIQUE INDEX idx_take_renders_freeze ON take_renders(take_id) WHERE kind='FREEZE';
PRAGMA user_version=12;
