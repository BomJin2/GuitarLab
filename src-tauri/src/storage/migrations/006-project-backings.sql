CREATE TABLE project_backings (
    project_id TEXT PRIMARY KEY NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind = 'YOUTUBE_EMBED'),
    video_id TEXT NOT NULL CHECK(length(video_id) = 11 AND length(CAST(video_id AS BLOB)) = 11 AND video_id NOT GLOB '*[^a-zA-Z0-9_-]*'),
    user_selected INTEGER NOT NULL CHECK(user_selected = 1),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms BETWEEN 0 AND 9007199254740991)
);
PRAGMA user_version=6;
