CREATE TABLE audio_stem_sets (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(id),
    asset_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL CHECK(length(metadata_json) <= 16384),
    metadata_sha256 TEXT NOT NULL CHECK(length(metadata_sha256) = 64),
    UNIQUE(project_id,id),
    FOREIGN KEY(project_id,asset_id) REFERENCES project_assets(project_id,id)
);
CREATE TABLE audio_stems (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    stem_set_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('GUITAR_FULL','ACCOMPANIMENT')),
    sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
    bytes INTEGER NOT NULL CHECK(bytes > 44 AND bytes <= 21168044),
    UNIQUE(stem_set_id,role),
    UNIQUE(project_id,id),
    FOREIGN KEY(project_id,stem_set_id) REFERENCES audio_stem_sets(project_id,id)
);
CREATE INDEX idx_stem_sets_source ON audio_stem_sets(project_id,asset_id,sequence DESC);
PRAGMA user_version=5;
