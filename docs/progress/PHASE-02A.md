# Phase 02A — 여러 기타 악보 트랙 선택

## 1. 작업 개요

- 시작일·완료일:2026-10-14. **완료**.
- 이전 Phase 4의 제품 전체 검사와 실제 종료/재실행 복원을 확인한 뒤 착수합니다.
- 목표: 기타 트랙 목록·사용자 역할, 안정적인 activePerformanceTrackId 저장/복원, 두 기타의 독립 악보·커서·단일 트랙 채점.

## 2. 구현 및 변경 사항

docs/12의 선택적 ScoreTrack/Workspace 확장부터 정의했습니다. 기존 원본/불변 revision/SQLite migration001과 단일 기타 기능을 유지합니다. 역할은 사용자 태그이며 오디오 stem/AI 분리와 독립입니다. 아직 기능 구현 완료가 아닙니다.

완료 시점에는 아래 구현·자동 검사와 실제 새 앱의 두 기타 TAB 전환/역할·선택 ID 저장 복원까지 확인했습니다. ‘아직 완료 아님’ 문장은 착수 당시 이력입니다. 마지막 사용자 답변은 요청한 전체 UI 확인에 대한 “정상적으로 작동함”입니다.

- `src/entities/score.ts`, `guitarRoles.ts`, `scoreValidation.ts`: 기타 역할/instrument 타입과 런타임 검증.
- `src/features/score/trackSelection.ts`, `ScoreTrackSelector.tsx`, `scoreSession.ts`, `ScoreWorkspace.tsx`, `alphaTabAdapter.ts`: MIDI 기타 분류·안정 ID 선택·사용자 역할·미저장 doc 변경·커서/지판 연결. 기존 ‘악보 트랙’ 접근성 이름을 유지합니다.
- `src/features/library/projects.ts`, `useProjects.ts`, `src/features/practice/usePractice.ts`: 구형 index에서 ID 복원·ID/index 검증·새 저장, 선택한 한 트랙의 목표만 전달.
- `src-tauri/src/storage/project_model.rs`, `projects_tests.rs`: 누락 필드 호환·명시적 null/잘못된 enum/ID 거부, 역할/ID 저장 재열기와 이전 revision 보존·타 트랙 목표 거부. migration001 변경 없음.
- `public/fixtures/dual-guitar.musicxml`, `src/test/dualGuitarFixture.ts`, `trackSelection.test.ts`, `ScoreTrackSelector.test.tsx`, 기존 projects/usePractice 테스트: 실제 import의 두 기타8음씩·서로 다른 커서/피치·목표 ID 독립, 역할 불변성·잘못된 ID·중지 대기 후 새 트랙/세션 검사.
- docs/00/02/12·fixtures README와 진행 문서: 저장 호환성·UI/계약·자체 제작 provenance/미실행 상태.

## 3. 테스트 결과

최초의 미실행 상태는 이력입니다. 구현 후 `pnpm typecheck` 성공, 관련 프론트22개 중20개 성공/2개 실패: alphaTab이 트랙 이름의 공백을 NBSP로 바꾸므로 공백을 동등하게 검사하도록 테스트를 수정했습니다. 제품 이름을 임의 변경하지 않았습니다. native `cargo test --locked --manifest-path src-tauri/Cargo.toml guitar_`는3개 성공(새 저장/계약2개와 기존 음역1개)입니다.

처음 `pnpm verify:app`은116개 프론트/타입/린트/빌드 성공 뒤 수정한 테스트1개 포맷에서 실패했습니다. 해당 파일에 Prettier를 적용한 뒤 최종 같은 명령은 **성공**:116개 프론트/32파일,82개 Rust 성공/장치 열거1개 제외, 타입·ESLint·build·Prettier·fmt·Clippy 통과. 큰 alphaTab chunk와 MSVC import library 생성 안내는 기존 Phase 4와 같으며 실패가 아닙니다. 실제 새 앱 UI·저장 복원은 아직 미실행이고 현재 제품 앱4012는 이전 Phase 4 실행 파일을 유지합니다.

## 4. 미구현 및 알려진 문제

완료 시점: 최신 제품 exe 빌드·실행 및 실제 두 기타 UI/역할/ID 저장·다시 열기 확인 성공. 아래 미실행 문장은 당시 상태를 보존한 기록이며 현재 미실행은 Python/음원 stem 분리/녹음/새 화면 DPI 스크린샷/여러 사용자 GP 파일 조합입니다. 원본 MIDI metadata가 잘못된 기타의 수동 악기 분류 보정은 후속 개선으로 남습니다. 기존 첫 음 SKIPPED 제약도 유지합니다.

선택 ID/역할 UI·기타 분류·두 기타 fixture 및 자동 독립성 검사는 구현됐습니다. 최신 Windows 실행 파일 빌드/실제 UI·선택 ID와 역할의 앱 저장 복원은 미실행이며 전체 완료로 표시하지 않습니다. 기존 첫 음 SKIPPED 제약을 유지합니다. 기타 분류는 원본 MIDI program/타악 metadata에 근거하며 알 수 없는 기타는 ‘그 외 악보’에 남을 수 있습니다. 역할은 사용자 태그이며 개별 오디오 stem/물리적 프렛 검출을 제공하지 않습니다. Python은 변경하지 않았고 이번 Phase에서 미실행입니다.

## 5. 다음 작업 계획

Phase 2A를 완료했으므로 다음은 **Phase 4A**입니다. 기존 선택 ID·저장 revision을 녹음 take에 고정하고 CPAL의 선택 입력만 bounded queue로 writer에 전달합니다. 사용자가 REC를 눌러야 기록하며 WAV4초·.part 복구·장치 분리/누락/디스크 오류·재생 동기화와 다시 듣기를 검증합니다. 이미 사용한 migration001은 변경하지 않고 추가 migration으로 처리합니다.

계약에 맞춰 타입/validator·저장 모델·트랙 UI를 연결하고 두 기타 import/커서/채점 전환·저장 재열기·잘못된 ID와 enum을 검사합니다. 실제 앱 확인 후 문서/로드맵을 갱신하며 다음 Phase는4A의 명시적 입력 녹음·다시 듣기입니다.

### 번들 검사 및 실제 앱 적용 준비 — 2026-10-14

제품 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`1개 성공. 사용자가 기존 창 종료를 알렸고 권한 있는 프로세스 조회에서 종료를 확인한 뒤 제품 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`을 시작했습니다. 직접 앱 종료 없음. 최신 exe 실행/두 기타 UI·역할/ID 저장 복원은 아직 미실행입니다. 확인 요청 이후에는 소스와 앱 실행 상태를 유지합니다.

최신 제품 Phase 2A exe 빌드 성공 및 실행 시작. 실제 `dual-guitar.musicxml` 선택·Guitar1/2 TAB 전환·사용자 리드/리듬 역할과 선택 Guitar2의 저장/재열기 확인을 요청합니다. 자동 검사와 실제 UI 확인은 구분하며 확인 전 전체 완료로 표시하지 않습니다.

### 최종 실제 확인 — 2026-10-14

제품 exe `src-tauri/target/debug/guitarlab.exe`21,860,864바이트/20:02:04 KST 빌드 성공,20:04:02 실행(PID30008). 사용자가 Guitar1/2 TAB 차이·Guitar1=리드/Guitar2=리듬 사용자 지정·Guitar2 선택 저장/다시 열기에 ‘정상적으로 작동함’이라고 답했습니다. 116개 프론트/82개 Rust·장치 열거1개 제외·번들1개와 실제 UI 수용 조건/문서화를 완료했습니다. 최초의 공백/포맷 실패 및 미실행 이력은 앞에 보존했습니다. 다음 Phase4A로 진행하며 사용자 앱을 직접 종료하지 않습니다.

### 작업 중단 및 다음 재개 — 2026-10-14

사용자가 ‘오늘은 여기까지, 내일 마저’라고 요청해 자동 개발을 일시중지했습니다. Phase 2A는 완료 상태를 유지합니다. Phase 4A는 기존 CPAL callback의 선택 채널→bounded ring→DSP worker 경로와 storage migration, docs/15~17 및 공식 WAV 자료를 읽은 준비 단계입니다. 녹음 파일·REC command·테이크 테이블·WAV writer·녹음 UI는 아직 구현하지 않았고 실제 오디오 기록도 시작하지 않았습니다. 사용자 재개 요청 전 추가 개발/앱 재실행은 하지 않습니다.

다음 재개 때 docs/progress/README.md의 현재 위치와 source/Git/프로세스를 먼저 확인합니다. 녹음 계약을 docs/12에 확정한 뒤 실제 선택 입력만 기록하는 queue/writer·migration002·복구·다시 듣기를 한 Phase로 구현합니다. 기존 사용자 프로젝트·기록·보정/역할·원본과 migration001을 보존합니다. 마지막 실제 실행 앱은 제품 guitarlab(PID30008/20:04:02), 이를 자동 종료하지 않았습니다.
