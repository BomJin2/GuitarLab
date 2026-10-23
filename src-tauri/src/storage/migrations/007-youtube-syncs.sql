CREATE TABLE project_youtube_syncs (
    project_id TEXT NOT NULL,
    revision_id TEXT NOT NULL,
    video_id TEXT NOT NULL CHECK(length(video_id) = 11 AND length(CAST(video_id AS BLOB)) = 11 AND video_id NOT GLOB '*[^a-zA-Z0-9_-]*'),
    track_id TEXT NOT NULL CHECK(length(track_id) BETWEEN 1 AND 128),
    document_json TEXT NOT NULL CHECK(length(CAST(document_json AS BLOB)) BETWEEN 1 AND 4096),
    document_sha256 TEXT NOT NULL CHECK(length(document_sha256) = 64 AND document_sha256 NOT GLOB '*[^a-f0-9]*'),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms BETWEEN 0 AND 9007199254740991),
    PRIMARY KEY(project_id,revision_id,video_id,track_id),
    FOREIGN KEY(project_id,revision_id) REFERENCES score_revisions(project_id,id)
);
PRAGMA user_version=7;
