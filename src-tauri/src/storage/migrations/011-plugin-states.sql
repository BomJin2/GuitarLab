CREATE TABLE project_plugin_states (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL CHECK(length(class_id) = 32),
  plugin_version TEXT NOT NULL CHECK(length(plugin_version) BETWEEN 1 AND 64),
  state_format TEXT NOT NULL CHECK(state_format = 'VST3_HOST_SNAPSHOT'),
  state BLOB NOT NULL CHECK(length(state) BETWEEN 1 AND 8388608),
  state_sha256 TEXT NOT NULL CHECK(length(state_sha256) = 64)
);
PRAGMA user_version=11;
