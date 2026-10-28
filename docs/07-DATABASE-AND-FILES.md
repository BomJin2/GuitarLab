# 07. 로컬 데이터 모델 및 저장 규칙

## 음원 조각 수신과 공유 staging — 2026-10-28

DB v9/기존 자산·revision 형식은 유지합니다. 악보 raw v1과 음원 분할 수신은 asset_staging의 안전한 basename/원본 종류·크기 검증과 incoming UUID 보관/동일 import_asset을 공유합니다. 새 파일은 create_new, 임시+최종 복사를 위한2배 용량과1MiB 여유를 사전 확인하며 쓰기 실패/취소·DB 실패 후 이번 파일/빈 폴더만 정리합니다. 이미 commit한 자산은 유지합니다.

음원은 한 StorageJob에서1MiB 이하 조각과 최대1개 대기 큐를 처리합니다. offset/총 bytes·ID를 검증하고 최종 수신 확인 뒤 원본 헤더·SHA/중복·DB commit을 해야 완료입니다. 조각 미수신30초/전송 단절·취소는 정리 후 상태를 끝내며 실제 완료까지 녹음/다른 파일 작업·창 닫기를 기존 guard로 막습니다. 진행 total은 원본 크기,수신/보관을 절반씩 표시합니다. 이 조각 경계가 전체 앱/기존 재생의 RAM 상한이라는 뜻은 아닙니다. 기존256MiB 원본 읽기/재생 정책과 강제 종료/전원 중단의 staging 잔여 제약은 그대로입니다.

## 관리용 악보 drop의 자체 임시 보관 — 2026-10-28

DB v9/기존 project_assets·revision 스키마는 유지합니다. 최대8MiB의 사용자가 놓은 악보 바이트를 `projects/<projectId>/incoming/<새 UUID>/<검증한 파일명>`에 create_new로 기록하고 기존 import_asset의 헤더/JSON·SHA/중복·관리용 복사와 DB 처리로 전달합니다. 파일명은 표시 이름을 유지하되 경로/제어 문자·Windows 예약 이름을 받지 않습니다. 단계별 바이트 진행은 임시 보관+최종 복사의 합계이며 소요 시간이나 실제 디스크 지연의 보장이 아닙니다.

성공/오류/취소 후 이 호출의 임시 파일과 비어 있는 자체 UUID 폴더만 정리합니다. 부모 incoming 폴더와 다른 파일은 보존합니다. 정리 실패는 저장 오류로 표시하며 이미 commit한 자산은 유지합니다. 전원 중단/강제 종료 뒤 남은 staging의 자동 회수는 별도 미구현이며 임의 일괄 삭제를 하지 않습니다. 외부 원본 경로나 새 외부 참조는 저장하지 않고 네트워크 전송도 하지 않습니다.

## 저장 악보 이력 읽기 — 2026-10-26

DB9의 score_revisions를 읽기 트랜잭션으로 조회합니다. 프로젝트 head와 같은 스냅샷의 목록을 revision 내림차순으로 최대101개 확인하고 100개/이전 페이지 커서로 반환합니다. timestamp를 정렬 키로 쓰지 않습니다. 저장 내용 조회는 기존 revision()의 프로젝트 소유권·고정 상대 경로·파일 크기/SHA·JSON 스키마 검증을 재사용합니다. 원본 자산이 없어도 저장 JSON은 별도로 조회할 수 있으며 원본 재연결·head 변경·새 revision 생성은 하지 않습니다. 녹음 중 거부와 저장 작업/취소·종료 보호는 기존 공통 경계를 사용합니다. 새 migration·Python·파일 출력은 없습니다.

## 프로젝트 정보 수정 — 2026-10-26

제목·선택 아티스트 수정은 DB9의 projects.title/artist/updated_at_ms만 변경합니다. 기존정보의 제목/아티스트를 정확히 비교해 오래된요청을 거부하고 writer/transaction·보관/연습/녹음 잠금·커밋직전 취소를 유지합니다. 수정시각은 JS 안전정수 내에서 기존보다 최소1ms 크게 갱신하며 동일값은 그대로 반환합니다. 프로젝트ID/mode·score revision/head·자산경로/외부원본·녹음/믹스/결과는 불변입니다. 파일쓰기/새migration·악보 내부제목 수정은 없으며 계약/실제검증은 docs/12·PHASE-04 최신 절을 따릅니다.

## 보관 프로젝트의 읽기 전용 용량 확인 — 2026-10-25

현재 휴지통 UUID/revision을 확인한 프로젝트의 관리 폴더에만 metadata 집계를 제공합니다. 파일 수/논리 바이트와 외부 참조 개수를 분리하고 외부 참조 파일은 열지 않습니다. 미분류 파일도 관리 폴더의 논리 크기에 포함하지만 삭제 대상으로 승인한 것은 아닙니다. Windows reparse/심볼릭 링크·특수 항목·10000항목/16단계/30초 경계와 취소/오래된 요청은 성공 합계를 반환하지 않습니다. DB9/원본·테이크·휴지통 상태는 유지하며 자동 정리/영구 삭제·회수 가능 공간 보장은 미구현입니다. 검사/실제 앱 적용 여부는 PHASE-08 최신 절을 따릅니다.

## 자동 저장 편의 선택의 별도 보존 — 2026-10-22

후속 후보는 `guitarlab.score-autosave.v1` 로컬 WebView Storage의 schema1·켠 프로젝트 UUID 배열로 자동 저장 선택만 보존합니다. 미선택 기본 꺼짐, 읽기 실패/미지원·손상은 꺼짐/원문 유지·오류 안내, 쓰기 실패는 현재 실행 선택만 적용하고 다음 실행 값이 다를 수 있음을 안내합니다. 최대128개/8KiB·키/UUID 중복과 자료형을 확인하며 다른 Storage 키는 수정하지 않습니다. SQLite/악보 파일·녹음·장치/모델 설정은 유지합니다. 이 편의 선택은 기존 프로젝트 ZIP 백업 범위에 추가하지 않고 앱/WebView 데이터 삭제 시 기본으로 돌아갑니다. 실제 수용 상태는 PHASE-05 최신 절을 따릅니다.

## 선택적 자동 저장 후속 — 2026-10-22

별도 임시 초안/DB 테이블을 만들지 않고 기존 불변 score_revisions와 원본 자산/expectedRevision을 재사용합니다. 이번 실행에서 사용자가 켠 프로젝트의 첫 수동 저장 이후 NORMALIZED 편집만30초 안정·정지 뒤 새 버전으로 저장합니다. 저장 버전과 디스크 사용량은 증가하며 이전 버전을 자동 삭제하지 않습니다. 실패/충돌/취소는 기존 원본/head를 보존하고 같은 편집을 자동 반복하지 않습니다. 미적용 폼/프로젝트 없는 악보·강제 종료의 전용 복구는 미구현이며 상세 계약/검증 상태는 docs/12·progress/PHASE-05 최신 절을 따릅니다. DB9/기존 백업 계약은 유지합니다.

## 2026-10-21 검증 후보 — 프로젝트 휴지통 보관 v9

009 마이그레이션은 기존 행/파일을 수정하지 않고 project_trash marker 테이블만 추가합니다. 보관은 목록에서 숨기는 되돌릴 수 있는 상태이며 원본·녹음 삭제나 디스크 회수가 아닙니다. 일반 프로젝트 명령은 보관된 ID를 거부하고 별도 목록/현재 trash UUID로만 복원합니다. 보관 시 revision과 현재 revision이 달라지면 조용히 복원하지 않습니다. 활성 녹음/연습·파일 작업을 완료하거나 취소한 뒤 실행합니다. 영구 삭제/자동 정리는 구현하지 않습니다. 후보 적용 전 v8 백업을 유지했고 실제 v9 적용에서 기존15개 테이블/모델 설정 보존을 확인했습니다. 백업 도구는 v8/v9·manifest와 실제 DB 버전의 일치를 검사합니다. 사용자 피드백 후 현재 프로젝트도 미저장 확인/실제 보관 성공 뒤 작업 공간을 닫는 방식으로 수정했고 새 프로젝트의 직접 보관·복원을 사용자 확인했습니다. 수정본 재실행 후 목록 유지의 추가 수동 검사는 아직 미실행입니다.

> 2026-10-18 추가 후보: DB v5/기존004 초안 테이블을 유지하면서 선택 stemId를 초안 문맥에 포함합니다. 원본은 필드를 생략해 기존 context/hash를 보존하고, 기타 stem은 부모 assetId·stem UUID/실제 파일 SHA로 식별합니다. 모델 없이 복원하지만 stem 파일의 해시/역할·길이를 재검증하므로 누락/손상 시 거부합니다. 원본 초안/이전 stem 초안은 덮어쓰지 않습니다. 과거 set 직접 선택 UI는 미구현입니다.

> 2026-10-17 최신: 추가005의 별도 AudioStem set/파일 보존·모델 재실행 없는 재열기와 실제 앱 재실행 복원을 사용자 확인했습니다. 기존004의 AI 초안과001~003 원본/악보/녹음/믹스는 유지합니다. 새 출력 믹스 후보는 기존 JSON의 kind=STEM에 불변 stem UUID만 저장하며 DB/Python 버전은 변경하지 않습니다. 같은 프로젝트의 정확한 set/WAV를 검증하며 최신 분리로 치환하지 않습니다. 현재 수용/검사 상태는 PHASE-06.md를 따르며 아래 버전3/미구현 설명은 당시 이력입니다.

> 2026-10-17: Phase 5 편집 저장·재열기와 JSON/MusicXML 실제 새 파일 저장 확인 완료. SQLite3과 원본/이전 리비전/테이크는 유지합니다. Phase 6 환경 확인은 메모리 작업이며 분석 결과 DB/파일 저장은 아직 연결하지 않았습니다. 아래 후보 대기 설명은 당시 이력입니다.

> 2026-10-15 최신 후보: 편집 리비전의 실제 저장/다시 열기를 확인했습니다. JSON/MusicXML 새 파일 출력은 구현/자동 검사 완료, Windows 실제 저장은 대기입니다. native 저장 창의 새 경로만 사용하고 기존 파일을 덮어쓰지 않으며 외부 절대 경로를 DB에 기록하지 않습니다. SQLite 버전3·원본 asset/기존 revision/take는 유지합니다. JSON 출력은 내부 ScoreDocument v1이며 JSON 파일 import UI는 미구현입니다. 아래 미구현 설명은 당시 이력입니다.

## 원칙

- 사용자 데이터는 로컬만 저장. DB는 **메타데이터 및 관계**, 미디어·원본 악보·AI 산출물은 파일로 분리합니다.
- SQLite에 대용량 오디오 바이너리를 통째로 넣지 않습니다.
- 원본 파일 불변, 파생 파일 재생성 가능하도록 provenance 및 알고리즘 버전 기록.
- 실제 스키마는 migrations로 버전 관리하고 앱 실행 시 안전하게 업그레이드합니다.

## 앱 데이터 위치 (예시, 사용자명 하드코딩 금지)

```text
{appDataDir}/GuitarLab/
  guitarlab.sqlite
  projects/
    {projectId}/
      project.json              # export/백업용 메타데이터 스냅샷
      audio/
        original.ext            # 관리용 복사 선택 시만
        guitar-stem.wav
        accompaniment.wav
      scores/
        imported.gp            # 가능하면 원본 형식 보존
        score.json             # canonical document
        score-draft.json       # optional AI draft
      analysis/
        {jobId}/notes.json
        {jobId}/provenance.json
      waveforms/
        overview.bin
  models/                        # 검증된 사용자 설치 모델
  cache/                         # 삭제 가능한 임시 파일
  logs/                          # 최소 수집, 경로/오디오 데이터 마스킹
```

- 원본은 외부 파일 **참조 또는 프로젝트 폴더로 복사** 옵션. 이동/삭제된 외부 파일은 재연결 UI.
- 삭제 작업 시 원본 파일 참조 경로는 지우지 않으며 앱이 직접 관리하는 파일만 사용자 확인 후 삭제.
- 경로 traversal(`../`) 및 심볼릭 링크 우회·해당 앱 폴더 밖 접근 방지.

## SQLite 테이블 (초안)

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  mode TEXT NOT NULL DEFAULT 'copy',
  score_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,        -- ORIGINAL / GUITAR_STEM / BACKING / SCORE_IMPORT
  relative_path TEXT,              -- app-managed file일 때만
  external_path TEXT,              -- 사용자 승인한 외부 file ref일 때만
  sha256 TEXT,
  bytes INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE score_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  relative_path TEXT NOT NULL,
  source TEXT NOT NULL,            -- manual / import / ai / merged
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, revision)
);

CREATE TABLE analysis_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,            -- queued / running / succeeded / failed / canceled
  progress REAL NOT NULL DEFAULT 0,
  model_id TEXT,
  model_version TEXT,
  result_rel_path TEXT,
  error_code TEXT,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE device_profiles (
  id TEXT PRIMARY KEY,
  device_key TEXT NOT NULL,
  display_name TEXT,
  sample_rate INTEGER,
  buffer_size INTEGER,
  calibration_bias_ms REAL NOT NULL DEFAULT 0,
  noise_gate REAL,
  pitch_tolerance_cents REAL,
  updated_at TEXT NOT NULL
);

CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  score_revision_id TEXT NOT NULL REFERENCES score_revisions(id),
  track_id TEXT NOT NULL,
  speed REAL NOT NULL,
  difficulty TEXT NOT NULL,
  config_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL
);

CREATE TABLE practice_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  start_audio_ms REAL NOT NULL,
  end_audio_ms REAL,
  loop_iteration INTEGER,
  score INTEGER NOT NULL DEFAULT 0,
  max_combo INTEGER NOT NULL DEFAULT 0,
  cool_count INTEGER NOT NULL DEFAULT 0,
  good_count INTEGER NOT NULL DEFAULT 0,
  miss_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE judgement_events (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES practice_attempts(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  judgement TEXT NOT NULL,
  delta_real_ms REAL,
  expected_midi INTEGER,
  detected_midi REAL,
  confidence REAL,
  score_awarded INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_assets_project ON project_assets(project_id);
CREATE INDEX idx_sessions_project ON practice_sessions(project_id);
CREATE INDEX idx_events_attempt ON judgement_events(attempt_id);
```

> SQL은 구현 출발점입니다. FOREIGN KEY 활성화, ON DELETE 의미, WAL/백업과 날짜/UUID 생성 규칙을 실제 라이브러리 및 운영체제 기준으로 검증하고 migration을 작성해야 합니다.

## 정규화/데이터 안정성

- `score.json`은 데이터 모델 계약 버전 `schemaVersion` 필수. Tauri 저장 command가 validation 및 버전 검사를 수행.
- 수정: 임시 파일에 쓰기 → flush → 필요한 경우 sync → 원자적 rename 전략(플랫폼 제약 확인) → DB revision 커밋. 실패 시 원본/이전 revision 보존.
- 자동 저장: 1~2초 디바운스하되 앱 종료시 pending write flush, 충돌 감지, 오류 토스트.
- 용량 제한: 파일 import 전 예상 크기/작업 공간을 확인하고 사용자에게 알림. 무제한 캐시 생성 금지.
- AI 모델·파생 파일은 앱에서 원본을 보존한 상태로만 지울 수 있어야 합니다.
- 라이브러리에는 `last_played`, `last_opened`를 후속 migration으로 추가할 수 있습니다.

## 점수 기록 조건

- 동일 곡이라도 악보 revision, 악보 track, 속도, 난이도, input config, 평가 알고리즘 버전이 다르면 결과 비교에 경고/필터 표시.
- 저장 시 `practice_session.config_json`에 판정 임계값, calibration, scoringVersion, pitch tolerance 등을 snapshot.
- 최고 점수는 **비교 가능한 설정의 유효 attempt** 중 계산. 단순한 합산 기록과 섞지 않습니다.

## 백업 및 복원

- ZIP 백업으로 `project.json`, `score.json`, 권리 보유 미디어(명시적으로 동의한 경우) 저장. OS별 경로 외부 유출 주의.
- 비정상 종료 후 recoverable `draft` 및 `last-good revision`을 제공.
- 사용자에게 프로젝트 삭제/미디어 원본 보관 여부를 구분하여 확인.

## v0.2 녹음·stem·반주 DB 확장 (후속 migration, 아직 미실행)

> 기존 v0.1 migration을 수정해 사용자 데이터를 파괴하지 말고, **추가 migration**으로 구현합니다. `project_assets`는 기존 원본/AI 파일 참조를 그대로 유지합니다.

```sql
CREATE TABLE project_backings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('LOCAL_ASSET','YOUTUBE_EMBED')),
  asset_id TEXT REFERENCES project_assets(id),
  youtube_video_id TEXT,
  user_selected INTEGER NOT NULL DEFAULT 0,
  sync_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE TABLE guitar_stem_bindings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  score_track_id TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES project_assets(id),
  role TEXT NOT NULL DEFAULT 'UNKNOWN',
  origin TEXT NOT NULL CHECK(origin IN ('USER_IMPORTED','AI_GUITAR_ONLY','AI_PART_SPLIT')),
  role_confirmed_by_user INTEGER NOT NULL DEFAULT 0,
  model_provenance_json TEXT,
  alignment_offset_ms REAL NOT NULL DEFAULT 0
);
CREATE TABLE recorded_takes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  score_revision_id TEXT NOT NULL REFERENCES score_revisions(id),
  target_score_track_id TEXT NOT NULL,
  backing_id TEXT REFERENCES project_backings(id),
  input_profile_id TEXT REFERENCES device_profiles(id),
  relative_path TEXT NOT NULL,
  state TEXT NOT NULL,
  channels INTEGER NOT NULL, sample_rate INTEGER NOT NULL,
  frames INTEGER NOT NULL DEFAULT 0,
  capture_start_monotonic_ns TEXT,
  calibration_snapshot_json TEXT NOT NULL DEFAULT '{}',
  alignment_offset_ms REAL NOT NULL DEFAULT 0,
  display_name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE recorded_take_segments (
  id TEXT PRIMARY KEY,
  take_id TEXT NOT NULL REFERENCES recorded_takes(id) ON DELETE CASCADE,
  frame_start INTEGER NOT NULL,
  frame_end INTEGER NOT NULL,
  playback_epoch INTEGER NOT NULL,
  song_start_ms REAL NOT NULL,
  playback_rate REAL NOT NULL
);
CREATE TABLE take_mix_layers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  take_id TEXT NOT NULL REFERENCES recorded_takes(id),
  gain_db REAL NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  solo INTEGER NOT NULL DEFAULT 0,
  pan REAL NOT NULL DEFAULT 0,
  alignment_offset_ms REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_takes_project ON recorded_takes(project_id);
CREATE INDEX idx_take_segments ON recorded_take_segments(take_id);
```

- 실제 구현 전 constraint 강화: local source면 assetId 필수, youtube면 videoId 필수(앱 validation + CHECK), 외부 오디오 절대 경로 임의 저장 금지.
- 파일 배치: `projects/{projectId}/recordings/{takeId}/dry.wav`, 녹음 진행 중 `dry.wav.part`; 사용자 확인 전 원본 덮어쓰기/자동 삭제 금지.
- 녹음 최종 완료: 임시 파일 flush→WAV 헤더 finalize→원자적 rename→SQLite commit. 실패 시 `RECOVERABLE_ERROR` take row 및 복구 경로 제공.
- 녹음 파일/녹음 메타데이터는 민감 데이터이며 무단 네트워크 업로드/자동 공유 금지.
- 프로젝트 ZIP export에서는 `recorded_takes` 포함 여부와 용량을 사용자에게 알려주고, YouTube에서는 videoId 링크 메타데이터 외 audiovisual content를 저장하지 않습니다.
# Phase 4A 실제 저장 구조 (2026-10-15)

위 SQL은 확장 설계 초안이며 실제 버전2 migration은 `src-tauri/src/storage/migrations/002-recordings.sql`입니다. 이미 사용한001은 재작성하지 않습니다. recorded_takes는 프로젝트/리비전 복합 FK, 상태 CHECK, metadata_json과 SHA-256, 생성 시각·프로젝트 인덱스를 사용합니다. 별도 device_profiles 테이블 도입 없이 검증한 현재 프로필 JSON의 revision과 전체 스냅샷을 테이크에 저장합니다.

WAV 경로는 검증한 UUID로만 조립하고 DB에 외부 경로를 저장하지 않습니다. 프론트에 절대 경로를 전달하지 않습니다. metadata_json에는 선택 트랙, 입력 채널/포맷, 단일 연속 구간의 native 시작 시각·sample index, epoch·rate·songStartMs, 경고/관측 누락 수, 파일 SHA-256과 비파괴 이름/메모/offset을 저장합니다. Count-in/seek/loop를 숨겨 이어 붙인 segment는 없습니다. 무반주/시각 미확인 데이터의 songStartMs는 null입니다.

REC 시 행+새 `.part` 생성, 최초 샘플 시 시작 메타데이터 저장, 정상 STOP 시 큐의 중지 경계까지 배출 → flush/헤더/fsync → rename → READY commit 순서입니다. 재시작 시 ARMING/RECORDING/FINALIZING을 RECOVERABLE_ERROR로 전환합니다. rename 직후 DB commit 전에 죽은 경우에도 파일은 보존되며 사용자 명시적 복구로 새 ID에 복사합니다. `.part`의 미완성 마지막1~3바이트는 완전한 프레임만 새 파일로 복구하고 원본 바이트는 바꾸지 않습니다. 복구 결과는 RECOVERED_PARTIAL 표기를 유지합니다. 삭제·trash·프로젝트 ZIP export는 아직 구현하지 않았습니다.

## Phase 4B 실제 설정 저장 후보 — 2026-10-15

추가 migration003은 `project_mixes(project_id PK/FK,document_json,document_sha256)`만 생성하고 SQLite user_version을3으로 올립니다. 이전1/2의 프로젝트·리비전·연습 기록·테이크를 유지합니다. JSON은16KiB 이하의 버전1 MixDocument이며 UUID 소스 목록·gain/mute/solo/offset/masterGain만 저장합니다. 저장 시 실제 프로젝트의 READY 테이크/로컬 ORIGINAL asset을 검사하고 읽을 때 해시·버전·범위를 검증합니다. 믹스 저장이 원본 PCM/테이크 메타데이터를 수정하지 않습니다.

RecordedTake 버전1의 선택적 referenceTakeIds는 REC 당시 가청 참조 테이크ID의 목록입니다. 이전 데이터는 빈 배열로 읽고 최대7개·중복/자기참조/프로젝트·리비전 불일치를 거부합니다. 독립 WAV/ID·InputOnly 정책을 유지하며 복구 시에도 관계를 보존합니다. 파일 export는 사용자가 native 저장 창에서 고른 새 WAV로 직접 출력하고 DB에 외부 절대 경로를 저장하지 않습니다. 자동 export 이력/ZIP/원본 삭제는 이번 범위가 아닙니다.

## Phase 5 편집 리비전 후보 — 2026-10-15

ScoreDocument v1 선택적 renderSource=NORMALIZED는 정규화 편집본을 뜻합니다. 기존 필드 누락은 원본 alphaTab 렌더를 유지합니다. 새 편집 저장도 같은 scoreAssetId와 기존 save_project_revision의 CAS/불변 파일/해시 정책을 사용하며 원본 asset/이전 리비전/테이크는 바꾸지 않습니다. SQLite는3 그대로이고 추가 migration은 없습니다. 기존 역순 tuningMidi는 파일을 재작성하지 않고 첫 편집의 원본 모델에서 올바른1번 줄부터의 사본을 준비합니다. JSON/MusicXML 파일 내보내기는 아직 미구현이며 내부 파생 XML과 구분합니다.

## Phase 6 AI 초안 보존 — 2026-10-17

추가 migration004는 ai_transcription_drafts 테이블과 문맥 조회 인덱스를 만들고 user_version을4로 올립니다. 기존001~003과 프로젝트/원본/악보 리비전/테이크/믹스는 수정하지 않습니다. sequence는 조회 순서, id는 실제 native 분석 작업 UUID입니다. project_id/asset_id는 프로젝트 자산 복합 FK이고 context_json/context_sha256에는 TranscribeRequest v1(원본 자산ID·튜닝·앵커/grid), result_json/result_sha256에는 native에서 검증한 실제 AiDraft v1을 저장합니다. 기존 행 덮어쓰기·자동 삭제는 없습니다. 문맥64KiB/결과2MiB/프로젝트100개를 제한하고 저장은 writer mutex/IMMEDIATE transaction/커밋 전 취소 검사를 사용합니다.

분석 성공을 반환하기 전에 원래 onset/offset/pitch·활성도/검토 사유·모델 버전/입력 SHA를 보존합니다. 저장 실패는 분석 성공으로 반환하지 않습니다. 동일 문맥의 최신 한 개만 복원 UI에서 조회하며, 결과 hash/구조/asset SHA를 다시 검사합니다. 손상 최신 결과를 정상인 과거 결과로 몰래 대체하지 않습니다. 모델을 실행하거나 외부 파일 경로를 조회하는 저장 명령은 없습니다.

사용자 확인 후 선택 트랙에 적용한 문서는 기존 NORMALIZED ScoreDocument/source=ai와 프로젝트 새 revision으로 저장합니다. 자동 정답/승인 완료 상태는 붙이지 않으며 원래 초안 행은 계속 AI_DRAFT입니다. 개별 적용 리비전과 초안 ID의 영구 연결/검토 이력·과거 초안 선택/삭제 UI·초안 ZIP export는 후속입니다.004 이후의 DB는 이전 버전3 앱에서 열 수 없으며, 구버전 실행을 복원 방법으로 사용하지 않습니다. 마이그레이션이 실패하면 기존 데이터에 덮어쓰지 않고 오류를 반환합니다.

## Phase 6 분리 stem 영구 보존 후보 — 2026-10-17

추가005는 `audio_stem_sets(sequence,id,project_id,asset_id,metadata_json,metadata_sha256)`와 `audio_stems(id,project_id,stem_set_id,role,sha256,bytes)`를 생성하고 user_version5로 올립니다. 프로젝트/원본 자산 및 프로젝트/set의 복합 FK, set별 두 역할의 UNIQUE,16KiB metadata/고정 WAV 크기 상한을 둡니다. ScoreTrack/RecordedTake와 ID·파일·행이 독립적이며 원본 asset 종류를 파생 stem으로 바꾸지 않습니다.

검증한 실제 분리 결과에 새 stemSetId/createdAtMs 및 두 stem UUID를 붙이고 `projects/{projectId}/stems/{stemSetId}/{stemId}.wav`에 새 파일로만 씁니다. 메타데이터는 전체 입력 SHA·모델 버전/revision/가중치 SHA·샘플레이트/채널·프레임·길이/offset·AI_ESTIMATE와 두 역할/파일 해시/peak/크기를 보존합니다. 파일 flush/fsync 뒤 IMMEDIATE transaction으로 set/두 행을 함께 커밋합니다. 커밋 전 취소/실패는 자신이 새로 만든 파일만 정리하고 이전 결과를 덮어쓰거나 삭제하지 않습니다.

같은 프로젝트/원본 asset의 최신 결과 한 개를 모델 없이 다시 읽고 JSON SHA/모델/문맥·stem 행·경로·실제 WAV 크기/헤더/프레임·모든 샘플 유한값/해시/peak를 검증합니다. 원본의 DB 메타데이터와 SHA만 비교하며 원본 오디오의 재읽기/추론은 없습니다. 손상 최신 결과를 이전 결과로 몰래 대체하지 않습니다. 조회 결과의 두 WAV는 기존 단발 binary로만 전달하고 저장 경로는 공개하지 않습니다.

최대20개 set/프로젝트이며 이전 결과 선택·삭제·복구 UI, 강제 종료 후 orphan 폴더 자동 정리와 ZIP export는 미구현입니다. 커밋 후 응답 전달 전 취소되면 저장 결과가 남을 수 있으며 다시 읽기로 확인합니다. 추가005 이후 DB는 이전 v4 앱에서 열 수 없으므로 구버전 실행을 복원 방법으로 사용하지 않습니다. 실제 앱 저장/재실행 수용 전 전체 완료로 표시하지 않습니다.

## Phase 6A 실제 저장 추가 계획 — SQLite v6(2026-10-19)

006-project-backings.sql을 추가해 프로젝트당 현재 YouTube 선택1개를 보존합니다. 선행 예시 project_backings의 미래 여러 source 모델 전체를 미리 만들지 않고, 현재 지원하는 YOUTUBE_EMBED·11자 video_id·명시적 user_selected=1·updated_at_ms만 검증합니다. 참조 키는 projects(id)이며 프로젝트 선택 해제는 해당 행만 제거합니다. 기존001~005/asset/score revision/recording/stem/mix는 수정하지 않습니다. 전체 공유 URL/접속 동의/원격 콘텐츠는 저장하지 않습니다. API와 취소 경계는 docs/12 최신 계약을 따릅니다. 구현·검증 완료는 progress/PHASE-06A.md에 후속 기록합니다.

### 2026-10-19 v6 적용 검증

프로젝트 YouTube 선택의 추가 migration006을 실제 v5 DB 백업 후 적용했습니다. 기존12개 테이블의 행 수/내용 SHA와 모델 활성 marker4개의 SHA가 동일하고 project_backings만 추가됐습니다. 자동 임시 DB의 저장/해제/실패/취소/재열기 검증도 통과했습니다. 실제 UI 저장 조작은 미실행이며 v5 전용 이전 실행 파일로 v6 DB를 열지 않습니다.
## 2026-10-20 YouTube 맞춤 별도 보존 계획 — SQLite v7

추가007은 project_youtube_syncs(project_id,revision_id,video_id,track_id,document_json,document_sha256,updated_at_ms)를 생성합니다. 네 문맥 복합 PK/프로젝트·revision 복합 FK·영상 ASCII11자·트랙 길이·JSON4KiB·SHA64자·안전 정수 시각 CHECK를 사용합니다. 프로젝트당100개를 네이티브 writer에서 제한합니다.001~006/원본 파일/불변 악보 revision/녹음/믹스/모델은 수정하지 않습니다. 같은 키 명시적 저장만 교체하며 영상 선택 해제에 맞춤을 자동 삭제하지 않습니다. 상세 검증/취소는 docs/12를 따릅니다. 실제 적용 전v6 DB를 백업하고 구버전v6 실행 파일로v7 DB를 열지 않습니다. 아직 계획 단계이며 구현/검사는 PHASE-06A의 후속 결과를 따릅니다.

### 2026-10-20 v7 적용 검증

007 구현 및 임시 DB/실제v6 백업 후 v7 적용을 확인했습니다. 실제 이전13개 테이블의 행 수/내용 SHA·모델 marker4개 SHA가 동일하며 project_youtube_syncs만 추가됐습니다. 저장/조회/삭제·두 유효 트랙/영상/악보 버전 분리·실패/취소/손상/100개 한도는 자체 임시 DB 자동 검사입니다. 실제 사용자 저장 UI·재실행 복원은 PHASE-06A의 수용 결과를 따르며 확인 전 성공으로 표시하지 않습니다.
## 2026-10-20 사용자 기타 파일 별도 보존 계획 — SQLite v8

008은 imported_guitar_stems(id PK,project_id FK,origin='USER_IMPORTED',metadata_json,metadata_sha256)를 추가합니다. 표시 이름/사용자 역할·실제WAV 샘플레이트/채널/프레임/길이/peak/SHA·생성 시각만 버전1 메타데이터에 보존합니다. 실제 파일은 UUID 기반 imported-stems 경로에 원본 바이트로 새로 복사하며 외부 절대 경로는 보존하지 않습니다. 기존001~007·AI audio_stem_sets/audio_stems·녹음/악보/프로젝트 자산은 수정하지 않습니다.20개/프로젝트·파일64MiB/디코드예산·실패/취소 정리는 docs/12를 따릅니다. 실제v8 적용 전v7 DB를 백업하고 구버전v7 앱을 복원 수단으로 실행하지 않습니다. 아직 구현 전 계획이며 검증 결과는 PHASE-06B에 후속 기록합니다.

### 2026-10-20 v8 실제 적용 검증

사용자 기타 파일의 별도008 구현/임시 DB 테스트와 실제v7 백업 후 v8 적용을 확인했습니다. imported_guitar_stems만 추가됐고 원래14개 테이블의 행 수/내용 SHA와 모델 marker4개 SHA가 동일합니다. 자체 mono/stereo WAV/불변 원본·역할/프로젝트 분리·손상/취소·DB 실패 정리·20개 한도는 자동 검사 성공입니다. 실제 사용자 파일 선택/단독 청취·재실행 복원 수용은 PHASE-06B를 따르며 현재 대기입니다.

## 2026-10-20 사용자 기타 파일의 출력 믹스 참조

project_mixes의 기존 버전1 JSON 레이어 종류에 IMPORTED_STEM을 추가합니다. id는 같은 프로젝트 imported_guitar_stems UUID이며 파일 경로나 메타데이터를 중복 저장하지 않습니다. gain/mute/solo/offsetMs·masterGain의 기존 저장/무결성 정책을 재사용합니다. 새 DB migration은 없으며 v8입니다. TAKE/LOCAL_ASSET/STEM 문서는 그대로 읽지만 새 종류가 들어간 설정은 구버전 앱에서 거부합니다. 기존 행은 명시적 믹스 설정 저장 전에 변경하지 않습니다. 상세 계약/지원 범위는 docs/12, 실행 결과는 PHASE-06B를 따릅니다.


## 로컬 ZIP 백업 첫 경로 — 2026-10-20

Phase7의 고급 점수 품질/정답 자료 미완료를 유지하고 자동 진행 규칙의 독립 작업 예외에 따라 Phase8 데이터 보호를 시작합니다. 추가 DB migration은 없습니다. native가 녹음 시작을 잠시 차단하고 프로젝트 writer를 보유한 동안, 검증된 Python3.12.15의 표준 SQLite backup API로 WAL을 포함한 일관된 v8 스냅샷을 만듭니다. `projects/` 아래 원본/불변 revision·녹음/불완전 take·stem과 input-calibrations.json을 ZIP_STORED로 보존합니다. 개별 SHA/크기 manifest를 포함하고 전체 ZIP을 다시 검증한 후 같은 디스크의 hard link로 새 목적지만 게시합니다. 기존 파일은 덮어쓰지 않으며 취소/오류 때 자신이 만든 staging만 정리합니다.

앱 경로는256MiB/10,000개 미만입니다. 표준 StorageJob/프론트 progress 한도를 유지합니다. 모델·환경·캐시·로그·외부 REFERENCE 음원은 복사하지 않습니다. 외부 참조 경로/개인 메모는 DB에 남으므로 명시적으로 개인 메타데이터와 로컬 미디어의 백업에 동의한 뒤 실행합니다. 백업 파일을 네트워크로 보내지 않습니다. 이 ZIP은 원본의 현재 바이트를 보존하며 손상된 미디어 자체를 복구하거나 모든 앱 의미 검증을 대체하지 않습니다.

별도 개발 CLI `scripts/backup_local_data.py`는 앱 프로세스 종료 확인 후2GiB 이하로 백업하고 전체 지문 확인 및 새 폴더 복원 미리보기만 제공합니다. 경로 이탈/링크·junction/Windows 장치 이름·대소문자 중복·압축/암호화/과대 ZIP을 거부합니다. 복원 미리보기는 새 폴더의 v8 DB quick_check/FK/비활성 녹음 상태를 확인하고 실제 AppData를 교체하지 않습니다. 앱 복원/삭제 UI·모델 재설치·외부 참조 재연결/다른 OS 수용은 미완료입니다. 실제 실행 검증은 progress/PHASE-08을 따릅니다.


## 2026-10-21 새 폴더 복원 미리보기

앱의 `preview_local_backup`은 사용자가 고른 ZIP을 검사해 별도 상위 폴더의 새 `GuitarLab-backup-preview`에만 추출합니다. 기존 이름·현재 AppData와 겹치는 목적지는 거부하며 동일256MiB/경로/해시 경계를 유지합니다. SQLite v8/quick_check/FK/비활성 REC를 검사한 뒤 새 폴더를 게시합니다. 취소/오류에는 신규 staging만 정리합니다. 메타데이터와 로컬 미디어의 새 복사본이며 자동 프로젝트 가져오기/실제 AppData 교체·모델 재설치·외부 참조 재연결은 미구현입니다. DB migration은 없습니다. 실제 검증 결과는 PHASE-08 후속 기록을 따릅니다.


## 2026-10-21 별도 로컬 진단 파일

`diagnostics/native-v1.json`은 DB와 분리된 schemaVersion1/events 문서입니다. 최대16KiB/최근64건의 writer 시각과 고정 네이티브 코드만 보존하며 새 임시 파일+sync/rename으로 게시합니다. 원본 경로·녹음·예외 원문은 기록하지 않고 로컬 백업 범위에도 넣지 않습니다. 손상/미지원 문서는 임의 초기화하지 않고 읽기/저장 실패로 표시합니다. SQLite v8과 프로젝트/모델 파일은 수정하지 않습니다. 상세 계약은 docs/12를 따릅니다.


## 2026-10-21 CP312 모델 다운로드 캐시 정리 계약

고정2모델의 ai/downloads/<CP312 plan.cache> 직접 자식만 조회/정리합니다. 설치 환경·marker·사용자 프로젝트/녹음·legacy cp310은 제외합니다. 모델/이름·크기/수정시각 revision으로 조회 뒤 변경을 거부하고, 전체 허용 목록·128개/2GiB·링크 경계를 먼저 확인합니다. 개별 파일 상태를 재확인해 unlink하고 빈 폴더만 비재귀 제거합니다. 취소 후 일부 삭제는 되돌리지 않으며 실제 디스크 회수량을 보장하지 않습니다. DB migration/모델 worker 변경은 없고 사용자 사용법은 docs/20, 구현 검증은 PHASE-08을 따릅니다.

## 2026-10-21 같은 앱 데이터의 중복 실행 보호

진단 writer·DB 연결/미완료 녹음 복구 전에 고정 빈 `.app-instance.lock`을 비차단 OS 배타 잠금으로 보유합니다. PID를 저장/판정하지 않고 새 버전끼리 같은 root의 동시 초기화를 막습니다. 잠금 파일은 종료 뒤 남지만 프로세스 핸들이 닫히면 잠금이 해제됩니다. 삭제/강제 초기화하거나 백업/복원 자료에 포함하지 않습니다. 다른 제품 root는 별도이며 잠금이 없는 구버전/외부 CLI는 기존 정상 종료 규칙을 계속 따릅니다. DB migration은 없고 실제 검증은 PHASE-08을 따릅니다.
