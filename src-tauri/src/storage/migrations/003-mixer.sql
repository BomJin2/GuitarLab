CREATE TABLE project_mixes (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  document_json TEXT NOT NULL CHECK(length(document_json) <= 16384),
  document_sha256 TEXT NOT NULL CHECK(length(document_sha256) = 64)
);
PRAGMA user_version=3;
