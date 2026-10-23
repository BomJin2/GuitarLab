CREATE TABLE imported_guitar_stems (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id),
    origin TEXT NOT NULL CHECK(origin='USER_IMPORTED'),
    metadata_json TEXT NOT NULL CHECK(length(CAST(metadata_json AS BLOB)) BETWEEN 1 AND 4096),
    metadata_sha256 TEXT NOT NULL CHECK(length(metadata_sha256)=64 AND metadata_sha256 NOT GLOB '*[^a-f0-9]*')
);
CREATE INDEX idx_imported_guitar_stems_project ON imported_guitar_stems(project_id);
PRAGMA user_version=8;
