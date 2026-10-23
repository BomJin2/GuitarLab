CREATE TABLE ai_transcription_drafts (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id),
  asset_id TEXT NOT NULL,
  context_json TEXT NOT NULL CHECK(length(context_json) <= 65536),
  context_sha256 TEXT NOT NULL CHECK(length(context_sha256) = 64),
  result_json TEXT NOT NULL CHECK(length(result_json) <= 2097152),
  result_sha256 TEXT NOT NULL CHECK(length(result_sha256) = 64),
  FOREIGN KEY(project_id,asset_id) REFERENCES project_assets(project_id,id)
);
CREATE INDEX idx_ai_drafts_context ON ai_transcription_drafts(project_id,asset_id,context_sha256,sequence DESC);
PRAGMA user_version=4;
