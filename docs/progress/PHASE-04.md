# Phase 04 — 프로젝트 저장과 연습 기록

## 후속 — 프로젝트 제목·아티스트 수정 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. F-01의 프로젝트 정보에 명시적 수정 경로를 추가합니다. 기존 Phase4 기본수용을 재구현하지 않고 제목/아티스트만 악보·원본·녹음·연습기록과 독립적으로 갱신합니다. 구현/대상 검증은 완료했고 전체검사/빌드·패키지/원격은 아래 결과를 따릅니다.

### 2. 구현 및 변경 사항

- 먼저 docs/12에 기존정보 비교/200 Unicode 코드포인트·제어문자/취소/원본보존·로컬명령 계약을 기록했습니다. DB9와 기존 project/assets/revisions·Python 계약은 유지합니다.
- `storage/project_metadata.rs`: 단일writer/immediate transaction에서 현재 제목·아티스트를 expected와 대조하고 보관/연습/녹음 상태를 검사합니다. 변경값을 다듬어 제목·아티스트·기존보다 큰 수정시각만 저장하고 동일값은 원래 요약을 반환합니다. 충돌/취소/DB실패/안전정수 상한에서는 이전 행을 유지합니다.
- `commands/project_metadata_api.rs`/등록·remote 권한 회귀: 엄격한 v1 요청과 기존StorageJob·RecordingService.while_idle를 재사용합니다. 다른 native 작업/REC와 직렬화하며 임의경로/알 수 없는 필드는 받지 않습니다.
- `features/library/projectMetadata.ts`: 입력 정규화·요청/응답 검증과 실제 취소종료 대기. 다른ID/mode/revision·다른 변경값의 응답을 거부합니다. `useProjects.ts`는 기존 보관 mutation 수명을 일반화해 현재세션/재생/화면을 유지하고 요약/목록만 갱신합니다. 늦은 취소 뒤 실제 저장완료는 성공으로 반영합니다.
- `ProjectMetadataPanel.tsx`/`LibraryPage.tsx`: 열린 프로젝트의 제목·아티스트 폼과 명시적 저장만 추가합니다. 공통 panel/fieldset/기존상태를 사용하고 실패 시 폼 초안을 보존합니다. 원래 악보 제목/파일명·녹음/점수는 이름 수정 대상이 아닙니다.
- 자체 SQLite·프론트 서비스/hook/실제App 라이브러리 회귀와 controller 모의 두 곳을 갱신했습니다. `project_trash_tests.rows`의 기존 행 대조를 테스트끼리 재사용하며 정리 대상은 자체UUID 임시폴더뿐입니다.

### 3. 테스트 결과

- `cargo test … project_metadata -- --nocapture`: **4개 성공**,0.40초/컴파일37.41초. 전체 다른 테이블/다른 프로젝트 행·revision/자산/원본 바이트·재열기/아티스트 비우기/동일값/충돌/취소·DB실패/보관·활성연습/시각상한을 확인했습니다.
- 첫컴파일에서 존재하지 않는 Result.is_err_or와 rusqlite0.40.2의 u64 ToSql 미지원으로 실패했고 기존is_ok_and·검증한i64 변환으로 해결했습니다. 확장Clippy의 테스트모듈 배치 경고는 모듈을 파일 끝으로 이동해 해결했습니다. `cargo clippy … --all-targets --all-features -- -D warnings` **성공**,9.87초·`cargo +1.90.0 check … --all-targets --all-features` **성공**,17.55초.
- 프론트 대상 최초29개 성공/서비스suite1오류는 모의isTauri 누락이었고 모의를 보완했습니다. TypeScript의 배열분해 undefined 오류는 검사 입력을 리터럴tuple로 한정해 해결했습니다. 최종 `pnpm exec vitest run src/features/library/projectMetadata.test.ts src/features/library/useProjects.test.tsx src/features/library/LibraryPage.test.tsx src/features/library/projects.test.ts`: **39개/4파일 성공**,3.31초. 늦은취소/오류·세션/재생 보존·폼/실제목록을 포함합니다.
- 전체프론트/확장Rust·최종 타입/lint/포맷·Vite/Windows·독립ZIP/원격은 현재 검사 중입니다. 실제Windows 폼조작/개인프로젝트 변경·기타입력/새OS는 **미실행** — 자체 자료의 계약/연결 검사와 구분하고 사용자 앱/데이터를 유지합니다.
- 이후 `pnpm test` **506개/108파일 성공**,45.28초와 `cargo test … --all-features` **248개 성공/28개 환경 의존 기본 제외**,19.36초를 확인했습니다. 로그 `project-metadata-front-20261026.log`/`project-metadata-rust-20261026.log`를 보존합니다. 린트가 금지한 제어문자 범위정규식은 기존 공통패턴인 Unicode Cc로 바꿨고 관련32개/3파일을3.19초에 재확인했습니다. 최종타입은 성공이며 lint/포맷·Windows/패키지·원격은 별도 결과로 기록합니다.

### 4. 미구현 및 알려진 문제

자동 병합·프로젝트 내부 악보 제목/원본 파일명 수정은 제공하지 않습니다. 충돌 시 최신목록/프로젝트를 다시 읽은 뒤 수정해야 하며 기존 미저장 확인을 우회하지 않습니다. 별도Windows10/11·고급 주법/특화모델·전체출시 수용은 이 기능으로 대체하지 않습니다.

### 5. 다음 작업 계획

현재 전체검사/빌드 결과와 문서를 확정하고 다음 독립 F-01 기능인 라이브러리 검색을 이어갑니다. 검색은 로컬 요약만 사용하고 새 I/O/전송·목록/세션 변경을 만들지 않는 범위부터 진행합니다. 사용자 승인을 다시 요청하거나 이전 기능을 불필요하게 재작성하지 않습니다.

### 정보 수정 로컬 빌드 확정

`pnpm build` **성공**,Vite49.09초/기존큰chunk 경고. 최종내장 `cargo test … --all-features bundle_tests -- --nocapture` **4개 성공**,0.00초와 `cargo build … --features custom-protocol` **Windows 빌드 성공**,12.04초/기존MSVC 안내를 확인했습니다. 해당로그는 `project-metadata-build-20261026.log`/`project-metadata-bundle-20261026.log`/`project-metadata-native-build-20261026.log`입니다. 전체506프론트·248확장Rust/Clippy/MSRV와 최종타입/lint 성공을 포함합니다. 한 차례포맷 실패는 새서비스를Prettier로 정리해 재검사 중이며 기능을 완화하지 않았습니다. 실제Windows 폼/사용자프로젝트·새ZIP/원격은 후속으로 유지하고 바로 검색슬라이스를 진행합니다.

## 1. 작업 개요

- 시작일·완료일:2026-10-14. **완료(Phase 4 수용 조건)**.
- Phase 3의 실제 USB 오류·MISS 증가 중단·재연결 복구와 자동 검증을 확인한 뒤 착수합니다.
- 목표:SQLite migration·프로젝트/asset/악보 revision, 실제 session/attempt/event 영속 기록, 결과/마디 히트맵, 재실행·누락 원본 재연결·안전 저장과10회 기록 복구.

**현재 상태**: 제품 반영·통합 검사·문서화 및 실제 앱 재실행 복원까지 완료했습니다. 마지막 사용자 결과는 “잘 열리고 그대로 표시 댐”으로 프로젝트/악보·음원/0.5×/4,000점 시도·마디별 결과 유지 확인입니다. 제품 verify:app110개 프론트/30파일·Rust80개(장치 열거1개 제외), custom-protocol 번들 검사1개 및 Windows 제품 빌드 성공. 아래 후보/미실행 기록은 당시 이력이며 현재 제약과 최종 미실행 범위는 마지막 완료 절을 우선합니다.

## 2. 구현 및 변경 사항

제품은 프로젝트 생성/선택 원본의 복사·참조/안전 revision 저장/재연결과 실제 연습 기록·결과 조회를 지원합니다. 다음 후보 단계 이력은 기존 검증 중 앱을 방해하지 않기 위해 별도 폴더에서 구현·검사한 과정을 보존한 것입니다.

검토한 의존성은 rusqlite0.40.2(MIT, bundled SQLite)와 sha2 0.11.1(MIT OR Apache-2.0, Rust1.88)이며 후보 컴파일을 통과했습니다. native 승인 파일 선택에 tauri-plugin-dialog2.8.2(MIT OR Apache-2.0, Rust1.90)를 선정하고 현재 Rust1.98/Tauri2.12.3에서 후보 컴파일 성공. 기본 cargo info는3.0.0-alpha.3을 반환했으므로 알파를 설치하지 않고 `cargo info tauri-plugin-dialog@2`로 안정2.x를 확인했습니다. 후보 MSRV는1.90이며 제품 반영 때 함께 갱신합니다. npm dialog SDK/광범위 파일·shell 권한 추가 없음. 임의 모델/개인 오디오 전송 없음.

### 현재 후보 파일 및 구현 범위

아래 경로는 당시 `src-tauri/target/phase4-stage/src/` 기준입니다. 완료 시점에는 모두 제품 `src-tauri/src/`로 반영했습니다.

- `storage/project_model.rs`: 실제 normalized score·workspace·project/asset 모델, ID/수치/관계·파일 크기 검증. 기존10~600 BPM/비현악 트랙과250ms loop 한도를 유지합니다.
- `storage/database.rs`, `storage/migrations/001-projects.sql`: version1·외래키/WAL/FULL/busy timeout, 신규/미래/손상 DB 대응과 앱 폴더 내부 경로 검사.
- `storage/projects.rs`: 프로젝트 목록·managed copy/reference·SHA256 중복/손상 확인·동일 원본 재연결, 불변 revision 파일·낙관적 DB commit·마지막 정상 head 유지. 취소·바이트 진행 및 원본 비파괴.
- `storage/practice_records.rs`: 저장 악보/구간의 전체 목표를 native에서 검증, 불변 config fingerprint·native snapshot/event transaction, sequence 유실·중복·hash 손상 검사, 전체 이벤트 페이지 조회와 INTERRUPTED 기록 복구.
- `judgement/practice.rs`: 선택적 archive 요청과 native service 저장 연결. 저장 실패 시 새 판정을 중단하고 남은 목표 제외·동일 미저장 이벤트 재시도,128개 화면 이력과 별도 전체 dirty 이벤트 유지. 기존 archive 없는 메모리 동작 보존.
- `storage/jobs.rs`: 한 번에 한 파일 작업, 진행·취소 요청/실제 완료 구분, 오래된 작업 취소가 새 작업을 건드리지 않도록 ID 확인, binary 결과1회 소비. native picker/commands 연결은 이어서 구현합니다.
- `storage/projects_tests.rs`, `judgement/practice.rs` 테스트: 실제 임시 SQLite/files·native 합성 입력으로 검증하며 해당 입력을 사용자의 실제 연주 기록으로 표시하지 않습니다.

### 후보 UI/명령 연결 진행

- `commands/storage_api.rs`, `app.rs`: picker 승인 파일만 읽는 command/job·취소·raw binary 전달과 Tauri builder 등록을 후보에 구현하고 컴파일/Clippy를 통과했습니다. 앱 시작 시 DB 실패가 튜너/메모리 연습까지 종료시키지 않도록 오류를 분리합니다.
- 프론트 후보 `src-tauri/target/phase4-web/src/`: `entities/scoreValidation.ts`, `features/library/projects.ts/useProjects.ts/ProjectStatus.tsx/LibraryPage.tsx`의 strict 계약·취소·프로젝트 생성/복원/원본 선택/저장 UI, `features/practice/records.ts/ResultsPage.tsx`의 전체 이벤트/가중치 정확도·히트맵·타이밍·동일 조건 최고 기록을 연결했습니다. app/scoreSession/usePractice/ScorePanel에 저장 context를 연결하며 프로젝트 없는 기존 연습은 유지합니다.
- `completedOrder`로 동점의 첫 완료 순서를 보존하고 throughSequence로 조회 중 증가하는 이벤트의 상한을 고정했습니다. JSON/hash·연속 sequence·최종 note ID 중복·판정 수/총점을 검사합니다.
- 후보 Front TypeScript/ESLint 경고0·전체109개/30파일 검사 성공. production Vite build 성공(큰 alphaTab chunk 경고 유지).
- `src-tauri/target/phase4-app/`의 실제 Tauri context/builder와 프론트 번들을 포함한 Windows 실행 파일 빌드 성공(`cargo build --features tauri/custom-protocol --target-dir src-tauri/target/phase4-stage/target`). **실행은 아직 미실행**이며 기존 native19424/15:28:24를 유지했습니다. 이후 수정한 관리용 복구/UI는 최종 빌드에 다시 반영합니다.

Windows junction 실제 생성→앱 폴더 밖 경로 차단→원본 보존→junction 자체 정리 검사 성공. managed copy 누락/손상도 새 UUID 복구 파일과 asset 연결 갱신으로 처리하도록 보완합니다. 기존 파일과 원본을 덮어쓰지 않으며 복구 경로에도 고정 UUID/canonical 검사를 적용합니다.

### 최종 후보 자동 검증 및 실제 실행 준비

- managed 복구 회귀 성공: 손상된 기존 복사본·사용자 원본을 보존하고 새 UUID 파일로 복구, 같은 불변 악보 revision 재열기와 복구본 누락 후 재복구까지 확인했습니다. 재연결 작업도 재생을 일시정지한 뒤 수행합니다.
- 프론트110개/30파일 전체 검사 성공, TypeScript·ESLint 경고0·Prettier 성공. 추가로 직전 동일 조건 완료 시도 대비 실제 점수/정확도 차이 비교와 관련6개 회귀 성공. 누락된 음원을 열어도 audioAssetId와 저장 설정을 지우지 않도록 보완했습니다.
- Native80개 성공/실제 장치 열거1개 기본 제외. Windows junction·11개 저장소 검사,10회 native 합성 시도 복구·300개 이벤트·저장 실패·초기300개 SKIPPED·완료 순서/조회 상한 포함. 최종 fmt/clippy 및 후보 exe 최신 동기화·빌드 진행 중입니다.
- 테스트/빌드 결과는 **후보 폴더 기준**입니다. 제품 src/src-tauri source는 아직 Phase 3 버전이며 새 후보를 실행해 native IPC·file picker·저장/복원 동작을 확인한 뒤 반영합니다. 기존 앱 자동 종료 없음.

최신 최종 후보 exe 빌드 성공: `src-tauri/target/phase4-stage/target/debug/guitarlab-phase4-preview.exe`(custom-protocol로 검증한 최신 프론트 포함). 설치된 Tauri2.12.3/tauri-build2.7.2/tauri-macros2.7.2 source에서 custom-protocol이 DEV=false 및 번들 자산 사용을 결정함을 확인했습니다. 기존1420 개발 화면에 의존해 새 UI를 검증했다고 오인하지 않습니다. 실행과 실제 프로젝트 저장/복원은 아직 미실행입니다. 기존 앱19424/15:28:24 및 세션10876를 유지하고 사용자에게 기존 창 종료를 요청한 뒤 새 후보를 실행할 예정입니다.

## 3. 테스트 결과

| 명령/검사 | 결과 |
|---|---|
| `cargo info rusqlite@0.40.2`, `cargo info sha2` | 성공: 실제 배포 metadata 확인 |
| 초기 후보 `cargo check` | 실패: test용 lib에 기존 main 자동 검색. autobins=false로 검사용 구성 보완 |
| 최초 저장소 `cargo test` 컴파일 | 실패: SQLite u64 미지원·SHA2 0.11 출력 LowerHex 미지원·Read/Write by_ref 경합. checked i64 변환·명시적 hex·Read 호출로 해결 |
| 저장소9개 검사 최초 실행 | 실패1개: 손상 fixture가 기존과 같은'x' 바이트를 썼음. 실제 바이트 변경 후9개 성공 |
| 후보 저장소 전체 Rust 검사/Clippy | 성공:69개·실제 장치 열거1개 제외/경고0 |
| native 기록 추가 후 전체 Rust 검사/Clippy | 성공:73개·제외1개/경고0,10회 matcher 기록 재열기·중복 저장·300이벤트 보존·중단 복구 포함 |
| 저장 실패/초기300개 제외 전체 flush 회귀 | 성공: 관련5개 및 Clippy 경고0 |
| dialog2.8.2 추가 후보 `cargo check` | 성공: 현재 Tauri2.12.3/Rust1.98 컴파일 |
| 앱 재실행 복구·10회 실제 연습 기록 | 미실행: 저장 연결 구현 전 |
| TypeScript/린트/빌드·Python | 미실행: 해당 Phase 제품 코드 반영 전 |

### 제품 소스 반영 후 통합 검사 — 2026-10-14

- 실제 결과 화면: 사용자가 ‘마디별 정확도 표시 되고’라고 확인했습니다. ‘결과 표시 정상·닫았습니다’는 사용자 답변 예시였으며 제품 UI 문구가 아니라고 안내했습니다. 이어 프로세스 조회에서 GuitarLab 창 종료를 확인해 검증 중인 앱을 직접 종료하지 않았습니다.
- 후보/제품의 파일 hash를 비교해 변경된24개 프론트 파일과13개 Rust/SQL 파일만 반영했습니다. 원본 기능 소스 삭제 없음. 제품 Cargo MSRV1.90·3개 직접 의존성·표준 custom-protocol feature, Cargo.lock26개 전이 패키지 추가 및 Vite 후보 테스트 제외를 반영했습니다. 원래 제품 frontendDist=`../dist`를 유지합니다.
- `cargo check --offline --manifest-path src-tauri/Cargo.toml`: 성공. 기존 캐시에서 lockfile 및 제품 컴파일 확인.
- `pnpm verify:app`: **성공**. TypeScript/ESLint,110개 프론트/30파일, Vite production build, Prettier, Rust fmt/Clippy,80개 Rust 성공·장치 열거1개 제외. 테스트 대상에 후보 복제본을 포함하지 않았습니다.
- Vite 큰 alphaTab chunk 안내가 남습니다. Rust test의 MSVC linker는 DLL import library 생성 안내를 warning으로 출력했지만 검사는 성공했습니다. Clippy -D warnings는 성공했습니다. 이 안내를 입력/저장 오류로 해석하지 않습니다.
- Python은 변경하지 않았고 이번 Phase에서 **미실행**입니다. 앱의 제품 실행 파일 빌드·재실행 후 영속 복원은 다음 확인으로 남습니다.

- 제품 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`:1개 성공. 실제 제품 설정의 디렉터리와 내장 index.html/JavaScript를 검증했습니다.
- 제품 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`:성공. `src-tauri/target/debug/guitarlab.exe`(21,810,688바이트,2026-10-14 19:34:08 KST) 생성. 기존 창이 없는 상태에서 이 제품 파일을 재실행해 기존 프로젝트/0.5×/4,000점 기록 복원을 확인합니다. 실제 재실행 복원 결과는 아직 대기 중입니다.

공식 참고:[rusqlite0.40.2](https://docs.rs/rusqlite/0.40.2/rusqlite/struct.Connection.html), [SQLite PRAGMA](https://sqlite.org/pragma.html), [SQLite atomic commit](https://sqlite.org/atomiccommit.html).

## 4. 미구현 및 알려진 문제

완료 시점: 수동 저장을 제공하며 편집 자동 저장은 Phase 5에서, 프로젝트 JSON/ZIP 백업·정리와 배포 고지는 Phase 8에서 구현합니다. 녹음/AI/다중 기타 역할 UI는 후속 Phase 범위입니다. 첫 음의 판정 창이 준비 전에 시작되면 SKIPPED로 제외될 수 있으며 준비 시간의 입력/clock 사전 연결은 미구현입니다. 프로젝트 목록은 최대1,000개이며 시도 목록은 아직 페이지 구분이 없어 대규모 기록 최적화가 필요합니다. 저장 실패의 미참조 파일은 자동 삭제하지 않고 원본 보존을 우선합니다. 실제 Rust1.90 검사·강제 프로세스 종료/전원 차단·실제 사용자10회 연주·신규 화면의 DPI 스크린샷/Python은 미실행입니다. 정상 종료/재실행 복원, native10회 합성 기록, 저장 오류/중단 복구 회귀는 실행 성공했습니다.

다음 문단은 제품 반영 전 제약 이력입니다.

제품 source 반영·실제 Tauri IPC/file picker/저장·재실행은 미실행입니다. 후보에는 관련 UI/command·앱 시작 관리·히트맵을 구현했지만 현재 앱에서 동작한다고 표시하지 않습니다. 후보의10회 기록은 합성 입력/native matcher→SQLite→재열기 범위이며 실제 데스크톱10회 연주/종료·재실행은 미실행입니다. Windows junction 차단은 실제 검사 성공했습니다. 기존 보정 JSON과 메모리 기록을 새 영속 기록으로 오인하지 않습니다. 취소·DB 실패로 남은 미참조 파일은 원본을 자동 삭제하지 않고 후속 복구/정리 UI에서 다룰 예정입니다. 실제 Rust1.90 실행은 미실행이며 현재1.98만 검증했습니다.

## 5. 다음 작업 계획

다음 Phase는 로드맵 순서의 **Phase 2A**입니다. 기존 트랙 선택/커서/단일 트랙 matcher를 유지하면서 guitar track 역할/안정적인 activePerformanceTrackId 저장과 두 기타 독립 fixture를 검증합니다. 다음으로 Phase 4A의 명시적 입력 REC·WAV 저장/복구를 구현합니다. 이미 사용자 데이터로 사용한 migration001을 다시 수정하지 않고 후속 DB 변경은 추가 migration으로 처리합니다. 현재 실행 중인 앱의 사용자 검증은 소스 변경·자동 재시작으로 방해하지 않습니다.

다음1~4항목은 초기 계획 이력입니다.

1. 버전/취소/오류·사용자가 선택한 파일 접근 계약을 docs/12에 확정합니다.
2. migration·managed/reference assets·sha256 재연결·불변 악보 revision과 낙관적 충돌 검사를 후보에 구현합니다.
3. Native practice session/attempt/event 기록과 frontend 프로젝트·결과 UI를 연결합니다.
4.10회 기록·재열기·원본 누락/재연결·중단/실패·경로 우회·이전 revision 보존을 검증하고 실제 앱에서 확인합니다.

## 실제 후보 실행 중 확인한 번들 경로 오류 — 2026-10-14

- 사용자가 기존 창 종료를 확인한 뒤 후보 실행을 시도했습니다. 프로세스 실행만으로 UI 성공을 판단하지 않았습니다. 첫 버튼 미노출 보고 당시에는 기존 Phase 3 실행 파일이 다시 실행되어 있었고, 후보를 별도로 실행해 사용자가 보내준 화면으로 실제 문제를 확인했습니다.
- 후보 창에 앱 UI 대신 `phase4-web/dist` 폴더 목록이 표시되었습니다. 후보 설정의 Windows 절대 경로가 설치된 Tauri의 `FrontendDist::Url`로 해석되어 번들 자산이 비어 있던 구성 오류입니다. 기존 제품 설정의 `../dist`는 이 오류에 해당하지 않습니다.
- 후보 `tauri.conf.json`을 `../phase4-web/dist`로 수정했습니다. 후보 Cargo에 표준 `custom-protocol` feature와 별도 `guitarlab-phase4-preview-ui` 실행 타깃을 추가해 열린 기존 창을 자동 종료하거나 실행 파일을 덮어쓰지 않습니다.
- 실제 `generate_context!()`가 디렉터리 설정 및 내장 `index.html`/JavaScript를 포함하는 회귀 검사 추가. `cargo test --locked --manifest-path src-tauri/target/phase4-app/Cargo.toml --features custom-protocol --lib bundle_tests --target-dir src-tauri/target/phase4-stage/target`: **1개 성공**, 기존81개는 이번 필터 검사에서 미실행입니다.
- 초기 일반 권한 `cargo fmt`는 Windows 경로 접근 거부로 실패했고, 권한 있는 동일 명령으로 성공했습니다. 프론트 소스는 변경하지 않았습니다. 수정된 후보의 실제 UI·저장/복원 확인은 아직 대기 중이며 Phase 4 전체 완료로 기록하지 않습니다.

### 실제 프로젝트 저장·복원 확인 — 2026-10-14

이어 실제 단음 연주 결과를 사용자 제공했습니다: epoch31/0.5×/보정45.82ms,4,000점/COOL1/GOOD6/MISS0/제외1/최고 콤보7/대상8음/정확도57.1%. 로컬 SQLite를 Python 표준 sqlite3의 `mode=ro`·`query_only`로 조회해 같은 시도가 FINISHED로 저장된 사실과8개 전체 이벤트, 요약/이벤트 SHA-256 및 sequence1~8 무결성을 확인했습니다. 첫 이벤트는 SKIPPED입니다. 사용자 오디오를 읽거나 전송하지 않았으며 임의 기록을 생성하지 않았습니다. 결과 화면 육안 확인과 앱 재실행 후 복원은 아직 미실행입니다.

현재 시작 구간 제약: matcher가 시작 전 판정 창을 충분히 관측하지 못한 음을 SKIPPED로 처리하므로 첫 음이 제외될 수 있습니다. 해당 시도의 COOL1+GOOD6=7음과 제외1음이 대상8음에 대응하며 콤보7/가중 정확도4÷7=57.1%는 올바른 계산입니다. 첫 음까지 온전하게 채점하려면 준비 시간의 입력/clock 사전 연결을 별도로 개선해야 합니다. 안전한 제외 규칙을 제거하거나 과거 판정을 만들어 보완하지 않습니다.

수정 후보 `guitarlab-phase4-preview-ui.exe` 빌드·실행 성공. 사용자에게 native picker로 자체 fixture 악보/음원 선택,0.5× 변경, 프로젝트 저장·다시 열기를 요청했고 “잘 불러와짐 0.5배속한거도 적용되어서 불러와지고”, “잘 불러와집니다.”라는 결과를 받았습니다. 실제 앱의 악보·음원 불러오기와 저장 설정 복원을 확인했습니다. ‘악보 저장됨’ 행의 원문은 별도 제공되지 않았으며 앱 종료/재실행 후 복원 및 실제 연습 기록·결과 화면은 아직 미실행입니다. 다음 확인 동안 소스·앱 실행 상태를 유지합니다.

## 최종 완료 기록과 주요 제품 파일 — 2026-10-14

마지막 실제 확인에서 제품 앱을 새로 실행한 뒤 저장 프로젝트·악보·음원·0.5×·4,000점 시도·마디별 결과가 그대로 표시된다고 사용자 확인했습니다. Phase 4 수용 조건과 문서화를 완료했습니다. 개인 입력 오디오는 파일로 기록하지 않았으며 네트워크 전송도 하지 않았습니다. 다음 Phase는 2A입니다.

주요 제품 변경 파일과 이유:

- `src/app/App.tsx`, `AppShell.tsx`, `App.test.tsx`: 프로젝트 컨트롤러·실제 저장 상태·결과 라우팅 연결과 회귀.
- `src/entities/scoreValidation.ts`: 저장 악보의 타입/관계/수치 런타임 검증.
- `src/features/library/LibraryPage.tsx`, `ProjectStatus.tsx`, `projects.ts`, `useProjects.ts`, `projects.test.ts`, `useProjects.test.tsx`: 실제 프로젝트 생성·조회·파일 선택·저장·복원·재연결과 취소/늦은 응답/누락 원본 회귀.
- `src/features/practice/practice.ts`, `usePractice.ts`, `usePractice.test.tsx`, `ScorePanel.tsx`, `ScorePanel.test.tsx`: 저장 revision/session 연결, 실제 native 기록과 메모리 표시 구분.
- `src/features/practice/records.ts`, `records.test.ts`, `ResultsPage.tsx`, `ResultsPage.test.tsx`: 저장 이벤트 검증·전체 조회·정확도/히트맵/타이밍·동일 조건 최고/직전 비교.
- `src/features/score/scoreSession.ts`, `ScoreWorkspace.tsx`, `src/shared/logger.ts`, `styles.css`, `src/test/projectFixture.ts`: 원본 asset/saved revision context·프로젝트 UI·오류 코드·결과 스타일·검사 fixture.
- `src-tauri/src/app.rs`, `lib.rs`, `commands/mod.rs`, `commands/storage_api.rs`: Tauri 시작/명령·native picker·job/progress/cancel·raw binary와 실제 번들 자산 회귀 검사.
- `src-tauri/src/judgement/practice.rs`: native snapshot·전체 dirty 이벤트 영속 저장, 저장 장애 시 판정 무효화·동일 미저장 내용 재시도.
- `src-tauri/src/storage/mod.rs`, `database.rs`, `jobs.rs`, `practice_records.rs`, `project_model.rs`, `projects.rs`, `projects_tests.rs`, `migrations/001-projects.sql`: SQLite version1·안전 파일/revision/asset·기록·중단 복구 및 실제 파일/DB 회귀.
- `src-tauri/Cargo.toml`, `Cargo.lock`, `vite.config.ts`: 검증한 안정 의존성/MSRV/번들 feature 고정과 후보 테스트 중복 제외.
- `README.md`, `docs/00-SCOPE-AND-DECISIONS.md`, `02-UI-UX-DESIGN.md`, `08-IMPLEMENTATION-ROADMAP.md`, `10-SECURITY-LICENSE.md`, `12-API-CONTRACTS.md`, `docs/progress/README.md`, `PHASE-04.md`: 실제 구현/계약/의사결정/라이선스/수용 조건·결과와 남은 기능 기록.

기존 소스/문서/사용자 원본 삭제 없음. 후보 빌드 폴더는 Git ignore 대상이며 제품 동작에 필요하지 않습니다. Git commit/push는 미실행입니다.
