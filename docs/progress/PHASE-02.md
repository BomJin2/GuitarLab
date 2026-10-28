# Phase 02 — 악보 import와 재생 동기화

## 후속 — 전체 프로젝트 drop·최소 안내·음원 분할 보관 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 사용자는7f88fb3 고정 앱에서 악보가 실제 불러와짐을 확인했고 좁은 보관 패널 위치를 지적했습니다. 열린 프로젝트 작업 공간 전체의 파일 drop과 최소 안내, WAV/MP3 보관을 추가합니다. 리디자인은 보류하고 기존8MiB 악보/256MiB 음원 제한·원본/미저장·참조 정책을 유지합니다. 대상65프론트/새5native와 최종 전체714프론트/266Rust·타입/lint/포맷/Clippy/MSRV·웹/Windows·내장4개가 성공했습니다. 새 원격/패키지·전체 영역/음원 사용자 수용은 후속입니다.

### 2. 구현 및 변경 사항

- `ProjectFileDrop.tsx`/새 검사: 전용 ProjectScoreDrop/검사를 대체해 부모 capture에서 단 한 번 처리합니다. 파일 enter/내부 이동/leave/drop·blur/dragend/문맥의 최소 안내와 텍스트 통과·잠금/참조 보호를 검사합니다. AppShell 자식을 문맥 key로 재생성하지 않습니다.
- `App.tsx`, `ProjectStatus.tsx`, `LibraryPage.tsx`, `ScoreWorkspace.tsx`, `styles.css`: 프로젝트 작업 범위에만 공통 drop을 연결하고 기존 좁은 영역을 제거했습니다. 안내만 추가하고 inset/padding/z-index·기존 색상 토큰을 사용합니다.
- `useProjects.ts`/검사: 원본 보관 선택을 controller에서 공유하고 음원 File을 전송 서비스로 전달합니다. 원본 연결/재생 로드를 재사용하며 취소 뒤 늦은 음원 결과도 적용하지 않도록 읽기 이후 취소 검사를 공통화했습니다. 기존 악보/편집과 저장 head를 유지합니다. RecordingPanel/ResultsPage의 typed mock에 해당 내부 상태2개를 추가했습니다.
- `audioUpload.ts`, `projects.ts`/새 검사: FileReader로1MiB씩 읽어 같은 job/offset으로 전달하고 받은 확인·최종 자산을 검증합니다. runStorageJob의 준비 단계 실패도 실제 정리 종료까지 관측하고 중복 cancel을 막습니다. 기존 요청은 준비 callback 없이 같은 경로를 유지합니다.
- `asset_staging.rs`, `score_upload.rs`, `projects.rs`: 악보와 음원의 이름/크기·디스크 여유/자체 staging·기존 import/정리를 공유했습니다. 기존 raw 악보 v1은 유지합니다.
- `audio_upload.rs`, `storage/mod.rs`, `commands/storage_api.rs`, native `app.rs`/`lib.rs`: 한 작업/1개 대기 큐·조각 ID/offset/크기·단절/30초 미수신·취소를 처리하고 실제 보관 뒤만 완료합니다. 녹음 idle/종료 guard와 원격 접근 거부에 연결했습니다. DB/Python·외부 의존성은 변경하지 않았습니다.
- `docs/00`,`02`,`04`,`07`,`09`,`12`와 진행 요약에 범위/계약·검증과 미실행을 기록합니다.

### 3. 테스트 결과

- 기존 좁은 영역의 실제 Explorer 악보 불러오기: **사용자 확인 성공**. 그 버전의 저장/reopen은 **미실행**이며 새 전체 영역·음원 수용과 구분합니다. 현재 고정 창을 임의 종료/새로고침하지 않았습니다.
- 최초 공통 staging 검사에서 cfg(test)의 Path import 누락이 발생해 테스트 import를 보완했습니다. 기존 악보 신규3개는 **성공**,0.55초입니다. 첫 타입 검사에서 내부 controller 상태가 추가된 ResultsPage typed mock 누락을 보완했습니다. 이후 타입/lint **성공**입니다.
- 새 native 조각 검사 `cargo test … audio_upload --lib`: **5개 성공**,0.73초. 정상/중복·한 job/큐 상한/잘못된 ID·순서/넘침·취소/단절/timeout·DB 실패와 타 작업 파일 보존을 확인했습니다. timeout은 짧은 deadline 주입이며30초 실제 대기는 미실행입니다.
- 음원 취소 회귀 수정 전 hook31개 중 **1개 실패/30개 성공**,2.79초. 취소 뒤 늦은 완료가 audioAssetId를 바꿨습니다. 읽기 후 공통 signal 검사를 적용해 대상 **65개/5파일 성공**,3.74초입니다. 프로젝트 전체 드롭13개·음원 서비스9개·기존 악보4개/작업8개·hook31개를 포함합니다.
- 첫 `pnpm test`: **712개/129파일 성공**,50.71초. 최종 서비스 검사2개 추가 뒤 전체도 **714개/129파일 성공**,48.09초입니다. `pnpm build`: **성공**,Vite1분57초/기존 큰 chunk 안내. 생성 CSS의 드롭 안내 클래스/공통 토큰·pointer-events:none도 **성공**으로 확인했습니다.
- `cargo test --all-features`: **266개 성공/29개 기본 제외**,23.98초. 최초 Clippy는 검사 코드 `.err().expect()` 지적으로 실패했고 `expect_err`로 수정했습니다. 최종 Clippy **성공**,11.73초·Rust1.90 all-targets/all-features **성공**,14.97초입니다.
- 최종 `pnpm typecheck`,lint/format:check·`cargo fmt --check`는 **성공**입니다. Windows `cargo build … --features custom-protocol` **성공**,26.51초(기존 MSVC 링크 안내)·내장/권한 bundle_tests **4개 성공**,0.01초입니다. 새 Git/원격·패키지는 후속입니다. 실제 새 GUI 전체 영역/안내·음원 청취·저장/reopen/다른OS·256MiB 전체 전달/실제 디스크 부족은 **미실행**입니다. 모의 헤더 바이트를 실제 청취 성공으로 표시하지 않습니다.

### 4. 미구현 및 알려진 문제

전면 시각 디자인·외부 참조 drop·폴더/복수 파일·프로젝트 없는 화면 전체 drop·자동 staging 복구는 미구현/범위 밖입니다. 프로젝트 없는 기존 drop/파일 선택과 기존 재생의 전체 버퍼 정책은 유지합니다. 조각 상한은 전체 프로세스 RSS 상한이 아닙니다. 정리 실패/이미 완료한 commit·OS 강제 종료의 원본 보존 경계를 유지합니다.

### 5. 다음 작업 계획

최종714프론트·타입/포맷·Windows/내장 검사를 마쳤고 Git/원격·독립 ZIP을 확인합니다. 사용자가 기존 고정 창을 저장하고 닫았다고 확인했으며 같은 검증 프로필의 새 고정 실행 파일에서 전체 화면 드래그 안내·악보/음원 적용과 저장/reopen을 짧게 확인합니다. 답변 전 앱을 직접 조작하거나 닫지 않습니다.

## 후속 — 열린 프로젝트의 관리용 악보 끌어놓기 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 프로젝트 없는 drop을 유지하면서 열린 프로젝트의 단일 악보만 관리용 복사로 보관하는 F01 수직 슬라이스입니다. 새 raw IPC/제한 검증과 자체 staging·기존 원본/DB import 재사용, 미저장 보호·실제 취소 종료 잠금을 구현했습니다. 대상44프론트/신규3native 성공,최종693프론트/261Rust·타입/lint/포맷/Clippy·Rust1.90과 웹/Windows·내장4개도 성공했습니다. 새 원격 전체/패키지·PS5.1/Defender까지 성공했으며 실제 사용자 Explorer 수용은 답변 대기입니다.

### 2. 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`/`docs/00-SCOPE-AND-DECISIONS.md`: 먼저 raw v1/4바이트 길이·최대1024 UTF-8 metadata/최대8MiB 악보와 관리용 복사 한정 계약을 기록했습니다. 임의 경로/외부 참조·네트워크 권한을 받지 않습니다.
- `src-tauri/src/storage/score_upload.rs`, `storage/mod.rs`: 메타데이터/파일명(Windows 예약 이름 포함)/확장자·크기를 검증하고 자체 incoming UUID 파일을 기존 import_asset으로 전달합니다. 성공/취소·오류 후 이번 파일/빈 폴더만 정리하고 원본 bytes/표시 이름·중복 보존과 저장 head 불변을 확인합니다.
- `commands/storage_api.rs`, `app.rs`, `lib.rs`: 새 `import_project_score_bytes`를 StorageJob v1/RecordingService idle 보호로 연결하고 원격 origin 접근 거부 검사에 포함했습니다. DB 스키마와 Python 계약은 변경하지 않습니다.
- `scoreUpload.ts`, `projects.ts`: FileReader 취소/바이트 크기·UTF-8 raw body를 서비스로 분리하고 기존 StorageJob에 raw 시작 인자만 추가했습니다. 응답은 동일 projectId/SCORE_IMPORT/MANAGED/available을 검증합니다.
- `useProjects.ts`: 기존 importAsset에 명시적 drop File 경로를 추가해 원본 ID/읽기/정규화·미저장 교체 확인을 재사용합니다. drop에 한해 취소 요청 후 실제 종료까지 잠금을 유지하고 이전 악보를 보존합니다. 기존 파일 선택의 동작은 유지합니다.
- `ProjectScoreDrop.tsx`, `ProjectStatus.tsx`, `LibraryPage.tsx`, `ScoreWorkspace.tsx`, `App.tsx`: 최소 drop 영역/파일 전달을 추가하고 참조·음원·복수 파일/작업 중 입력을 차단합니다. 악보 해석·파일 저장은 UI 안에 구현하지 않았습니다.
- 신규 `scoreUpload.test.ts`/`ProjectScoreDrop.test.tsx`, `useProjects.test.tsx`: raw body·잘못된 응답/취소·파일 종류/잠금·교체 거절·프로젝트 원본 연결과 head 보존10개 회귀입니다. 기존 `InputMonitor.test.tsx`의 mock만 실제 시작/중단 상태를 따르도록 수정했습니다.

### 3. 테스트 결과

- 7f88fb3의 [Windows40647692164](https://github.com/BomJin2/GuitarLab/actions/runs/40647692164)/job122680240813: **전체 성공**. 프론트693(71.89초)·웹6.86초, 기본Rust257/확장261(74.78/84.60초·각29개 기본 제외), 예제1+1·AI113(2.52초)/도구146(23.041초·건너뜀 없음)·Clippy/MSRV1.90(10.18초)·사후 정리를 확인했습니다.

- 최초 native 컴파일에서 ImportResult 위치를 project_model로 잘못 가져와 E0432가 발생했습니다. 실제 projects 모듈의 타입을 재사용하도록 고쳤습니다. 이후 `cargo test … score_upload --lib`: **신규3개 성공**,0.57초입니다.
- `pnpm test src/features/library/scoreUpload.test.ts src/features/library/ProjectScoreDrop.test.tsx src/features/library/useProjects.test.tsx src/features/library/projects.test.ts`: **44개/4파일 성공**,15.93초. 계약4개·UI3개·hook3개 신규를 포함합니다.
- 첫 `pnpm test`: **692개 성공/1개 실패**,57.84초. 기존 모니터 검사 mock의 status가 켜기 이후에도 항상 IDLE을 반환해 실제200ms 폴링이 실행되면 RUNNING 표시를 덮었습니다. 제품 코드는 유지하고 mock 상태를 start/stop과 일치시켰습니다. 후속 대상33개/3파일 **성공**,2.96초입니다. 최종 `pnpm test`는 **693개/128파일 성공**,37.83초이며 타입/lint/포맷도 **성공**입니다. `pnpm build`도 **성공**,Vite2분3초(기존 큰 chunk 안내)입니다.
- 첫 확장 `cargo test --all-features`: **261개 성공/29개 기본 제외**,20.29초. Clippy **성공**,15.05초. Windows 예약 파일명 보완 뒤 최종 전체 **261개 성공/29개 기본 제외**,19.15초입니다. 최종 Clippy **성공**,6.98초·`cargo +1.90.0 check --all-targets --all-features` **성공**,15.47초입니다.
- `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **성공**,14.76초(기존 MSVC 링크 안내). 같은 feature의 `bundle_tests` **4개 성공**,0.01초이며 새 명령의 원격 origin 거부를 포함합니다. `cargo fmt --check`,Git diff/추가 한국어 문자 검사도 **성공**입니다. 새 원격/패키지는 후속입니다.
- 7f88fb3은 main에 push했습니다. 새 독립 ZIP3,613파일/40,331,534바이트·CRC/SHA/실제PS5.1·Python3.12.15와 EXE/ZIP Defender는 **성공**입니다. 정확한 경로/지문은 [Phase8 첫 절](PHASE-08.md)을 따릅니다. Windows40647692164/job122680240813도 사후 정리까지 성공했습니다.
- 실제 Explorer drop/저장·재실행/다른 Windows·개인 자료/디스크 부족·강제 종료: **미실행**. 현재 사용자가 수용한 단축키 고정 앱은 유지하며 새 기능을 적용했다고 표시하지 않습니다.

### 4. 미구현 및 알려진 문제

프로젝트 음원 drop/외부 참조 drop·자동 staging 복구는 미구현입니다. REFERENCE 선택은 파일 선택으로 안내하며 몰래 복사로 바꾸지 않습니다. 새 자산 추가는 저장 head를 바꾸지 않아 프로젝트 저장이 필요합니다. 임시 정리 실패 때 이미 commit한 자산은 남을 수 있으며 오류로 알립니다. 실제 Explorer 입력/정상 종료·배포 전체는 별도 수용입니다.

### 5. 다음 작업 계획

최종693프론트·타입/lint/포맷·웹,261Rust/Clippy·MSRV와 Windows·내장 자산 검사를 마쳤습니다. Git/원격·독립 패키지로 확인하며 사용자에게 현재 테스트 앱의 편집 저장/종료를 요청했습니다. 종료 답변 뒤 새 검증 앱에서 관리용 악보 drop→저장/다시 열기를 요청합니다. 기존 창/원본 자료는 임의로 종료·변경하지 않습니다.

## 후속 — 프로젝트 없는 로컬 파일 끌어놓기 (2026-10-25)

### 1. 작업 개요

완료일2026-10-25(코드/전체 자동 검사·Windows/독립ZIP·원격 기능/격리 설치 검증 완료). F-01의 파일 drop을 프로젝트 없는 작업 공간에 추가했습니다. 기존 파일 선택/자산 관리·편집과 기본9개/부분5개 상태는 유지하며 Explorer/새OS 수용·프로젝트 drag/drop 저장 완료와 구분합니다.

### 2. 구현 및 변경 사항

- 구현 전 docs/12에 File 한 개/확인·거부·잠금 계약을 기록했습니다. 새 IPC/경로 권한·DB·의존성은 없습니다.
- `localMediaImport.ts`의 기존 확장자/크기 검증을 공유 함수로 옮기고 비정수/음수 크기를 읽기 전에 거부합니다. `mediaDrop.ts`는 단일 File/폴더·URL 거부와 기존 가져오기를 연결합니다. 헤더/파서·압축/취소·원본은 재사용합니다.
- `ScoreWorkspace.tsx`: 최소 영역/복사·거부 커서와 기존 미저장 확인/취소/상태 표시. 최신 프로젝트·녹음/채점 잠금을 읽기 전/적용 전 확인하고 파일 버튼도 잠금을 표시합니다. 자동 재생은 하지 않습니다.
- `shared/fileDrop.ts`/`AppShell.tsx`는 앱 모든 화면에서 파일 drop 기본 문서 이동만 막고 텍스트 드래그는 유지합니다. 제품/격리 설치 main 설정과 native 검사1개를 추가했습니다. 설치된 Tauri2.12.3/tauri-utils2.10.1 및 [공식 WindowConfig](https://v2.tauri.app/reference/config/#windowconfig)를 대조했고 CSP/원격·YouTube 권한은 불변입니다.
- 실제 App·파서/PlayerEngine·잠금/편집 통합 회귀와 docs/00·02·04·09·13/로드맵·진행/사용 안내를 갱신합니다. 새 CSS/시각 디자인·DSP/점수·Python/모델은 변경하지 않았습니다.

### 3. 테스트 결과

- `pnpm typecheck`: **성공**. `pnpm exec vitest run src/app/scoreSession.test.tsx src/app/scoreLoop.test.tsx src/shared/fileDrop.test.ts src/features/score/localMediaImport.test.ts`: 최종 **30개/4파일 성공**,17.23초. 파서/파일 전달·자동 재생 없음/잘못된 입력의 읽기 차단·기존 편집·늦은 확인/녹음 잠금 보존을 포함합니다. 최종 메타데이터 경계·예상 진단 정리 후 재확인했고 `file-drop-target-final-20261025.log`를 유지합니다.
- `pnpm lint`/`pnpm test`/`pnpm format:check`/`pnpm build`: **성공**,전체 **492개/106파일**,33.28초·Vite1분22초/기존 큰 chunk 경고. `runtime-validation/file-drop-frontend-20261025.log`/`file-drop-build-20261025.log`를 보존합니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features main_windows_allow_html -- --nocapture`: **1개 성공**,0.00초·컴파일19.82초. `cargo fmt --check`/확장Clippy: **성공**,20.07초. 전체 확장Rust **244성공/28개 기본 제외**,18.39초. `cargo +1.90.0 check … --all-targets --all-features`: **성공**,17.05초. 로그 `file-drop-rust-20261025.log`를 보존합니다.
- 초기 대상1실패/26성공·unhandled1개는 테스트의 Library heading 가정과 JSDOM blob URL API 미제공이었습니다. main 영역 조회·URL 대역으로 수정했고 이후 cleanup보다 URL 복원이 빨라 생긴 revoke 오류도 테스트 cleanup 순서로 고쳤습니다. 파일 검증을 완화하지 않았습니다. 의도적인 교체 확인 실패의 고정 CLOSE_GUARD_FAILED는 예상 진단입니다.
- 최종Windows/새ZIP·원격 기능/격리 설치는 다음 검사 단계이며 선기록하지 않습니다. 실제 Explorer 드래그·사용자 앱 교체/개인 파일·별도Win10/11은 **미실행** — 현재 DOM 대역/자체 fixture·타입/설정 검사이며 개인 자료/입력·REC는 유지합니다.

최종 `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture`: **내장4개 성공**,0.00초/컴파일11.79초. 제품/설치 main 설정과 기존 로컬/원격 권한·YouTube 정책 검사를 포함하며 기본 icon resource 조회 경고2회는 실제 창 아이콘 수용과 구분합니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **Windows 내장 빌드 성공**,11.65초/40,905,216바이트·SHA `0db3809348b6b8800a37cc06c60711d5e09adc0bd6d9f163951da50dbf21bf45`. 기존 MSVC 링크 안내는 유지하고 사용자 앱은 재실행하지 않았습니다. 다음은 정확한 소스의 새ZIP/실제PS/Python 및 두 원격 검사입니다.

독립 패키지도 **성공**입니다. source `847296d5b4d28503eecdac97ba097f1f1d6b14cc`/후보 `file-drop-candidate-e32c362c-6929-4770-a0a4-bf5faa7d14d2.json`은 새 앱 미실행 상태이며 generic 실행 포인터/이전 후보를 바꾸지 않았습니다. 고정 runtime3393파일/64,095,466바이트와 lock SHA `191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d`를 대조했습니다. 새ZIP `validation-packages/d550ed5d-ea61-41bd-a844-16f7c255cfd8/GuitarLab-validation.zip`은 **3613파일/40,220,571바이트·SHA `d0fe7684bd986dc54c88e6d66ce8ede5e44060615574f1c25c43be22ef04283c`**입니다. 기존 `package_validation.py`/`verify_archive`의 전체SHA·CRC/목록과 동일 지문 바이트의 새 폴더 추출, 실제 PS5.1 `-File Test-ValidationPackage.ps1` exit0·개발 경로 제외 Python3.12.15 두 번이 통과했습니다. 영수증 `file-drop-package-receipt-8df107fc-7c3c-4c1c-8099-adf702580b26.json`/로그 `file-drop-package-check-c14d9cf2-8234-479c-adef-03ea84024ab5.log`를 보존합니다. main847296d까지 push했고 [기능40185819117](https://github.com/BomJin2/GuitarLab/actions/runs/40185819117)·[격리 설치40185819137](https://github.com/BomJin2/GuitarLab/actions/runs/40185819137)는 현재 진행 중이며 최종 수용은 미확정입니다.

### 4. 미구현 및 알려진 문제

열린 프로젝트의 관리용 복사/참조에는 drop을 연결하지 않았고 기존 프로젝트 파일 선택을 사용합니다. 폴더/다중·URL/FLAC/OGG 등 확인하지 않은 형식을 받지 않으며 기존 악보8MiB/음원256MiB·압축32MiB 한도를 유지합니다. 영상/시스템 캡처·고급 판정/AI 품질을 확장한 기능이 아닙니다.

### 5. 다음 작업 계획

내장/Windows 실행 파일·새 독립ZIP/실제PowerShell/Python과 원격 기능·격리 설치 검증은 아래 최종 결과로 확정했습니다. 다음은 물리적 Explorer drop과 남은 고급 품질·특화 가중치/별도Windows 조건입니다. 실제 drop 수용을 빌드/서버 시작 성공으로 대체하지 않고 자동 입력/REC·사용자 자료 가져오기를 하지 않습니다.

### 원격 최종 결과 — 2026-10-25

source `847296d5b4d28503eecdac97ba097f1f1d6b14cc`의 [기능40185819117](https://github.com/BomJin2/GuitarLab/actions/runs/40185819117)/job121146256106와 [격리 설치40185819137](https://github.com/BomJin2/GuitarLab/actions/runs/40185819137)/job121146256206는 사후 정리까지 **모두 success**입니다. 위 진행 중/다음 검사는 당시 이력으로 보존합니다.

- 기능: **492프론트/106파일·기본240Rust/42.56초·확장244Rust/47.51초**(각28개 환경 의존 기본 제외), 예제1+1·AI113/2.41초·개발 도구143/14.964초(제외 없음), 타입/lint/Vite/포맷·Clippy·최소Rust1.90 전체 컴파일12.14초와 사후 정리까지 성공했습니다. 새 main 설정 검사는 custom-protocol 전용이므로 기본Rust 수에 더하지 않습니다.
- 설치: Windows Server의 실제 `powershell.exe -File scripts/Test-ValidationInstaller.ps1 -BuildProfile release`에서 별도 식별자 release 설치·새DB9/빈 보관·녹음 없음·3393개runtime/고지 지문, 시작 대기3583ms·정상 종료코드0·제거 등록 해제·AppData/알 수 없는 파일 보존을 확인했습니다. CI 토큰은 관리자이며 `cleanWindowsValidated=false`, 모델 가중치는 미포함입니다. 이 결과를 비관리자/별도Windows10/11·실제Explorer 조작 수용으로 확대하지 않습니다.
- 설치 영수증: `installer-tests/6038c2ce-d591-489f-93b3-b301040b6107/receipt.json`, 별도 식별자 `com.guitarlab.validation.run828819d254224a77a8b26b48f9410397`, 설치기SHA `c8ff6ec9ed152484c8140d747fb8c6f859477f04e3e5112963e9a6d1f2cc5013`. 최적화 앱/도구 빌드는 각각7분04초/2분45초이며 폴더는 CI 작업 공간의 `src-tauri/target/runtime-validation/` 아래입니다.
- 정확한 소스/최종 결론은 `file-drop-ci-final-ba2fd5f9-1b94-446c-aca9-c50138f82667.json`에 보존했습니다. 현재PC 후보EXE/ZIP만의 Defender custom scan도 각exit0/탐지 없음·SHA 불변입니다. 정의1.461.194.0·서명NotSigned/삭제·격리 미적용과 영수증은 [Phase8](PHASE-08.md)을 따릅니다. 원격NSIS/다른백신·최종 출시 수용과 구분합니다.
- root README·로드맵/남은 작업/진행표·Phase8에 최종 범위와 재개 위치를 반영했습니다. 결과 문서는 중복 전체 CI를 피하도록 로컬 커밋에 보존하고 다음 실제 코드 변경 push에 함께 포함합니다. 현재PC 앱·개인 파일/입력/REC·generic 실행 포인터는 변경하지 않았습니다.

## 후속 — 마디 단위 반복 선택 (2026-10-23)

최종 원격 확정: 소스b582828의 [Windows 실행39927076556](https://github.com/BomJin2/GuitarLab/actions/runs/39927076556), job120325984836의 모든 단계/사후 정리는 success입니다.423개/102파일·타입/lint/빌드/포맷·Rust 기본228/확장231개(각 환경 의존26개 제외)·Python AI113개/2.90초/개발 도구66개·Rust1.90 전체 컴파일까지 확인했습니다. 아래 CI 진행/미확인은 해당 시점 이력입니다. 이 결과는 이후 트랙 삭제 소스의 CI 결과가 아닙니다.

### 1. 작업 개요

F-03에 정의된 시작/끝 마디 선택을 기존 로컬 A-B 반복 엔진에 연결합니다. 기본 TAB/오선보 버튼 전환은 유지하며 개인 입력이나 새 모델은 사용하지 않습니다. 전체 로드맵 완료와 별개인 Phase2 기능 보완입니다.

### 2. 구현 및 변경 사항

- `src/features/score/scoreMeasureLoop.ts`: 실제 펼친 masterBars의 시작/끝 tick을 최신 싱크 앵커로 ms 변환하고 선택 순서·음원 범위·250ms 최소 길이를 검증합니다. 쉼표 마디도 포함하며 반복된 같은 마디는 occurrence로 구분합니다.
- `ScoreLoopPanel.tsx`: 시작/끝 선택·적용/해제와 상태/오류를 최소 공통 UI로 제공합니다. 정상 적용은 정지→기존 setLoop→시작 seek, 새 epoch를 만들고 자동 재생하지 않습니다. 하단 ms 입력과 동일한 engine.loop를 사용합니다.
- `src/features/player/TransportBar.tsx`: 외부에서 적용/복원한 반복이 있으면 A/B 입력도 같은 ms로 맞춥니다. 하단에서 껐다 다시 켜거나 R로 다시 켤 때 이전 기본0~2000ms가 아닌 마지막 적용 구간을 재사용합니다.
- `ScoreWorkspace.tsx`, `src/app/App.tsx`: 카피·연습·연주 주 악보에 연결하고 입력 로딩/프로젝트 작업·REC 중 비활성화합니다. 악보 교체 시 선택 초안은 초기화합니다. UI와 변환 함수를 분리하고 새 의존성/IPC/저장 형식은 추가하지 않습니다.
- `scoreMeasureLoop.test.ts`, `ScoreLoopPanel.test.tsx`: 비선형 앵커/인트로·반복/쉼표·선택 오류·기존 상태 보존·하단 반복 공유·epoch/자동 재생 없음과 잠금을 검사합니다. 관련 명세/계약·로드맵/진행 요약을 갱신합니다.
- `src/app/scoreLoop.test.tsx`: 실제 App→ScoreWorkspace→마디 패널의 녹음 잠금 전달을 추가 검증합니다. 최종 검토에서 새 prop이 기존 편집 패널 쪽에 연결된 오류를 발견해 마디 패널에 바로잡았습니다. 기존 상위 inert 보호는 있었지만 별도 fieldset 잠금도 직접 검사하며 이전422개 후보는 실행하지 않았습니다.

### 3. 테스트 결과

- 관련5개/2파일 성공(2.54초), `pnpm typecheck` 성공.
- `pnpm test`:422개/101파일 성공(27.89초). `pnpm lint`, `pnpm build`의 타입 검사·Vite(약60초), `pnpm format:check` 성공. 기존500kB 초과 청크 경고는 남습니다.
- 하단 A/B 동기화 후 관련5개/2파일도 성공(2.68초)했고 최종 전체 회귀422개/101파일을31.29초에 통과했습니다. 최종 타입/lint·빌드/포맷 결과는 후속 기록에 추가합니다.
- 최종 타입/lint·Vite 빌드63초·포맷도 성공했습니다. 실제 브라우저에서도 하단 A=2000/B=4000 반영과 반복 끄기→켜기 후 같은 범위/오류 없음까지 확인했습니다. 최종 화면은 `measure-loop-final-browser-20261023.png`입니다.
- 잠금 연결 수정 뒤 실제 App 통합1개(505ms)와 타입 검사가 성공했습니다. 이 수정까지 포함한 최종 전체 검사/실행 결과는 아래 기록을 따릅니다.
- 잠금 연결을 포함한 최종 `pnpm test`는423개/102파일/26.67초 성공, `pnpm lint`·`pnpm build`의 타입/Vite77초·`pnpm format:check`도 성공했습니다. 새 원격 CI와 Windows 실행 결과는 아래 적용 기록에 추가합니다.
- 실제 개발 브라우저에서 자체2마디 악보/4초 합성 음원을 사용해2마디=2000~4000ms 적용·시작 이동·자동 재생 없음, 재생 후 같은 범위 반복/epoch 갱신과 역전 선택 오류 시 기존 반복 보존을 확인했습니다.0.5×·해제와 최종 Windows 적용 결과는 아래 후속 기록에 구분합니다.
- 같은 브라우저의0.5×도2000~4000ms 안에서 반복하고 epoch가 갱신되며 해제 후 반복 꺼짐/오류 없음까지 확인했습니다. 증거: `src-tauri/target/runtime-validation/measure-loop-browser-20261023.png`(Git 제외).
- 브라우저 탭 생성 호출의 navigation timeout은 생성된 탭3을 다시 바인딩해 해결했습니다. 프로젝트/개인 데이터를 불러오거나 앱 보안 설정을 바꾸지 않았습니다.
- 실제 SSL 입력/채점·REC 동시 검사, 별도 Windows/새 installer는 **미실행**입니다. 엔진/네이티브/녹음 로직은 변경하지 않았으며 별도 OS 환경도 없습니다.

### 4. 미구현 및 알려진 문제

- 범위 초안은 해당 화면에서만 유지합니다. 적용 loop는 기존 ms 저장 정책을 사용하며 싱크를 나중에 바꿔도 마디에 자동 재고정하지 않습니다. 필요하면 다시 적용합니다.
- 음원 밖으로 변환된 마디는 자르지 않고 거부합니다. 사용자가 실제 음원과 싱크를 확인해야 합니다. YouTube/테이크 미리보기·마우스 드래그 범위 선택은 이번 구현 대상이 아닙니다.
- 고급 채점·특화 AI/별도 Windows·최종 배포 미완료는 유지합니다.

### 5. 다음 작업 계획

최신 dist의 내장 검사·Windows 빌드/실행과 기존 데이터 보존 결과를 추가합니다. 이어 F-03/기존 로드맵의 남은 기능 수용 항목을 점검하고, 이미 완료한 기능을 다시 구현하지 않습니다.

### 최종 Windows 적용 기록

- 최종423개 소스의 내장 bundle/권한 정책3개 성공(컴파일39.76초·실행0.12초), Windows 빌드20.33초 성공. 하드링크 캐시 복사 대체/기존 linker·bundle identifier 경고는 유지합니다.
- `measure-loop-candidate.json`: 새 portable UUID `11154eda-2f0f-48e6-ba9c-d76cfd1d6171`, EXE40,687,616바이트·SHA256 `f3531763d4b6890a9fa050dfc4dde65a5bbe1d752453496c1a894d453d6d18ae`. runtime3393개 전체 크기/지문을 확인했습니다.
- **PID4992·PTY38110·‘GuitarLab · 마디 반복 선택’** READY/응답 정상. 이전 PID28404/제어 세션은 이미 종료돼 있었고 새 실행 직전 동명 프로세스 없음을 확인했으며 강제 종료하지 않았습니다. 갱신한 DB9 백업 기준으로16테이블/4모델 marker 보존 검사도 성공했습니다. 현재 앱은 유지하며 입력/REC를 시작하지 않았습니다.
- 소스 `b582828dfe67dbf0f8b58eb6e4473338f62fb12c`를 main에 push했습니다. [원격 Windows CI39927076556](https://github.com/BomJin2/GuitarLab/actions/runs/39927076556)는 최초 확인 시 앱 기본 회귀 진행 중이며 최종 결론은 미확인입니다. 별도 최신 ZIP 검사는 이어서 기록합니다.
- 새 검증 ZIP3613파일/39,981,695바이트/SHA256 `dfbe93f86f3629819e62132a820136297306a34d19bbe58c147871d5191821a0` 생성·외부 지문/전체 목록·내용 확인·새 UUID 폴더 추출/재검사 성공입니다. 위치는 `validation-packages/65b2ac79-8c63-4396-a832-4ba5f67c716d/GuitarLab-validation.zip`이며 모델/개인 DB·녹음은 제외합니다. Windows 기본 PowerShell5.1 독립 런타임 검사는 후속 결과에 구분합니다.
- 새 추출 폴더에서 실제 기본 `powershell.exe -NoProfile -File Test-ValidationPackage.ps1` 검사도 **성공**했습니다. 전체3613파일 지문/누락·추가 없음과 개발 PATH 제외/모델 미설치 조건의 Python3.12.15 실행2회를 확인했습니다. 새 PC·GUI 조작·모델 재설치는 포함하지 않습니다.
- Windows 창 내부 사용자 조작/실제 기타·REC 동시 수용과 깨끗한 별도 OS/installer는 **미실행**입니다. 실제 개발 브라우저 반복·App 통합 잠금과 Windows 시작/데이터 보존 범위를 구분합니다.

## 후속 — TAB 기본 표시와 오선보 전환 (2026-10-23)

### 1. 작업 개요

사용자 요청에 따라 주 악보의 기본 표시를 TAB 전용으로 유지하고 ‘오선보 보기’/‘TAB 보기’ 버튼으로 한 표기씩 전환합니다. 세로/가로 배치와75·100·125·150% 확대도 독립적인 표시 상태로 제공합니다. 이 절은 이번 변경의 최신 기록이며 과거 완료 기록을 삭제하지 않습니다.

### 2. 구현 및 변경 사항

- `src/features/score/scoreDisplay.ts`: 표시 타입·기본값·alphaTab 설정과 렌더 전용 복사본/원본 객체 관계를 분리했습니다. TAB 전용 원본에서도 오선보가 보이게 복사본의 staff 플래그만 바꾸며 원본 음정·운지·시간·ID는 유지합니다.
- `ScoreDisplayControls.tsx`: 별도 전환 버튼과 배치/확대 선택. `ScoreViewport.tsx`: 기존 인스턴스 정리, 늦은 이벤트 무시, 렌더 준비 상태와 원래 음표 선택·커서 연결 및 악보 내부 가로/세로 추적.
- `src/app/App.tsx`, `ScoreWorkspace.tsx`: 같은 실행의 카피·연습·연주 주 악보와 화면 왕복에 표시 상태를 유지합니다. 편집/history·프로젝트 저장 모델과 분리했습니다.
- `scoreDisplay.test.ts`, `ScoreViewport.test.tsx`, `src/app/scoreSession.test.tsx`: 두 기타·쉼표/화음/반복 원본 보존, 표시 전환/선택·Undo·epoch/초점과 늦은 이벤트 회귀를 추가했습니다.
- `docs/00`, `02`, `04`, `08`, `09`, `12`, 루트 README와 진행 요약에 사용자 결정·계약·검증 범위를 반영했습니다. 앞서 만든 TAB+오선보 동시 표시 후보는 실행/배포하지 않고 이번 단독 전환 버전으로 대체했습니다. 새 의존성·IPC·DB 변경은 없습니다.

### 3. 테스트 결과

- `pnpm test`:417개/99파일 성공(31.05초). `pnpm lint`, `pnpm build`의 TypeScript 검사·Vite 빌드(약61초), `pnpm format:check` 성공.
- `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`: 내장 UI/권한 정책3개 성공, 컴파일41.78초. 하드링크 캐시 복사 대체와 기존 linker 경고는 실패가 아닙니다.
- `pnpm tauri build --debug --no-bundle --ci --config <이번 검증 설정> -- --locked --offline`: Windows 실행 파일 빌드22.81초 성공.
- 실제 개발 브라우저에서 기본 TAB만 표시 → 버튼으로 오선보만 표시 → TAB 복귀, 가로 배치/150% 후 세로/100% 복귀, 렌더 완료·오류 없음 확인. 증거: `src-tauri/target/runtime-validation/tab-only-browser-20261023.png`(생성 산출물, Git 제외).
- 해결: 단순 StaveProfile 변경으로는 TAB 전용 원본의 오선보가 숨겨져 렌더 복사본에만 표시 플래그를 적용했습니다. 복잡한 alphaTab 객체의 테스트 identity matcher 실행이 지연돼 해당 identity를 boolean으로 검사하여 같은 단언을 유지했습니다. 개발 포트는 이미 실행 중인 서버를 재사용했습니다.
- 최신 Windows 실행/데이터 보존 확인 결과는 아래 적용 기록에 기록합니다. 이번 변경에서 오디오 입력·녹음·AI 실제 분석, 깨끗한 별도 Windows, 새 설치 프로그램 검사는 **미실행**입니다. 해당 엔진/설치 경로를 변경하지 않았고 별도 Windows 환경도 없습니다.

### 4. 미구현 및 알려진 문제

- 표시 설정은 실행 중 유지하며 재실행 저장은 미구현입니다. 원본 비교·AI/YouTube/테이크 미리보기는 기존 TAB 기본값입니다.
- 오선보 전환이 고급 화음 편집·실제 줄/프렛 판정 지원을 추가하지 않습니다. 표시가 바뀔 때 렌더가 다시 준비되며 그동안 커서를 숨깁니다.
- Vite의 기존500kB 초과 청크 경고는 남습니다. 원본/저장 형식과 재생·녹음 엔진의 변경은 없습니다.

### Windows 적용 기록

`score-notation-candidate.json`의 새 portable 실행 파일(40,686,592바이트·SHA256 `cdf8a128f0ee1335651e84dcfc2da51fc81547d8461220e189ae91e6631f6fc6`)과 runtime3393개 전체 지문을 확인했습니다. 기존 PID33044는 정상 종료0/강제 종료 없음, 새 **PID28404·PTY74119·‘GuitarLab · TAB와 오선보 전환’**은 READY/응답 정상입니다. `score-display_db_probe.py after`로 실제 DB9/16개 테이블과4개 모델 marker 불변을 확인했습니다. 앱은 유지하며 입력/REC는 시작하지 않았습니다. Windows 창 내부 사용자 조작 수용과 이번 새 ZIP/설치 프로그램 검사는 **미실행**입니다. 자동 검사·실제 개발 브라우저 검증과 Windows 실행/내장 UI 검사를 구분합니다.

소스/문서는 `3d7e2424502a84cda25829c1c8783eef41f2f214`로 main에 일반 push했습니다. [Windows CI39913241783](https://github.com/BomJin2/GuitarLab/actions/runs/39913241783)는 최초 조회 시 in_progress이며 최종 성공/실패는 아직 미확인입니다. 직전 성공 실행을 이번 커밋의 성공으로 기록하지 않습니다.

### 5. 다음 작업 계획

이번 Windows 적용·보존 결과를 정리한 뒤 기존 순서에 따라 남은 악보/재생 수용 항목을 확인합니다. 특화 AI·실제 고급 주법 품질·깨끗한 Windows·서명/최종 배포 미완료는 별도로 유지하며 이번 표시 기능을 전체 로드맵 완료로 기록하지 않습니다.

## 1. 작업 개요

- 작업일/완료 날짜: 2026-10-13. 상태: 완료.
- 아래 1~5절은 구현 중간 기록입니다. 최종 구현과 검증은 하단 완료 기록을 기준으로 합니다.
- Phase 1 수용 조건/진행 문서 확인 후 순차 진행.

## 2. 구현 및 변경 사항

- alphaTab 1.6.1(MPL-2.0)과 공식 번들 Vite 플러그인 사용. 최신 1.8.4 코어는 설치 확인 후 플러그인 호환성 문제로 1.6.1에 고정.
- 최신 독립 플러그인의 Node >=20.19/Vite7~8 조건, 이전 코어 export의 누락된 vite 모듈을 확인. 기존 Node20.15/Vite6를 유지할 수 있는 1.6.1로 타입·빌드 검증.
- NoteEvent/ScoreDocument schemaVersion=1 정규화, 960 PPQ, 표준 기타 운지 매핑. 기본 tempoMap만 연결되어 있으며 tempo 변화·반복 기호의 펼친 시간축은 추가 검증 필요.
- 사용자 WAV/MP3, GP/MusicXML 선택 UI, 크기 제한, 오디오 헤더 검증, 작업 generation 취소/교체 결과 보호.
- HTMLAudioElement 기반 PlayerEngine: 재생/일시정지/seek/rate/volume/A-B loop/epoch, preservesPitch 요청. 120 BPM 4박 카운트인 구현, 아직 브라우저 청취·취소 검증 미완료.
- 최소 두 sync anchors와 단조 검증, 인트로와 영역 밖 선형 연장. loop는 현재 audio ms 기준.
- alphaTab boundsLookup.findBeat 기반 실제 좌표의 별도 커서 overlay. 설치된 external media API를 읽었으며 직접 외부 미디어 synth 제어는 아직 도입하지 않음.
- 자체 MusicXML 2마디 E4/G4/A4/B4×2와 48kHz mono 4초 WAV 사인파 생성. 개인 음원/녹음 없음.
- alphaTab 로거는 고정 진단 코드로 바꾸어 내부 오류 원문을 로그에 노출하지 않음.
- 변경: package.json/pnpm-lock.yaml/vite.config.ts, src/main.tsx, App/AppShell/App.test, TransportBar, styles/logger/test setup, Tauri CSP, fixtures README, docs/12.
- 추가: src/entities/score.ts; PlayerEngine/PlayerContext/playerContextValue/usePlayer/sync와 테스트; alphaTabAdapter/ScoreViewport/ScoreWorkspace와 테스트; public/fixtures/*.

## 3. 테스트 결과

| 검증 | 현재 결과 |
|---|---|
| pnpm typecheck | 통과 |
| pnpm lint | 통과 |
| pnpm test | 13개 통과: UI5, sync3, player3, import2 |
| pnpm build | 직전 빌드 통과, 최종 수정 후 실행 결과 수집 필요 |
| 실제 MusicXML import | 8음표 TAB 렌더/0프렛 MIDI64 확인 |
| 합성 WAV 로드/재생 | 길이4초, 재생 완료 위치4초 확인 |
| 2초 seek / 0.75배속 | 2마디 첫 E4와 커서/epoch 변화 확인 |
| A-B 반복 | 0~2초 반복 시작과 epoch 변화 확인, 장시간 반복 회귀는 미실행 |

스크린샷: screenshots/PHASE-02-POC.jpg. 브라우저 viewport 변경 직후 캡처여서 최종 화면 재촬영 필요.

해결한 오류: Fast Refresh component/hook 혼합 경고를 별도 context/hook 파일로 해결. jsdom 미디어 구현 부재는 테스트별 load/pause mock 재설정으로 해결. Python UTF-8 읽기를 명시. 기존 개발 탭의 연결 실패는 새 검증 탭으로 복구. 예상 손상 악보 실패 테스트는 SCORE_IMPORT_FAILED 코드로만 출력.

Tauri 실제 재실행/CSP·브라우저 오디오 청취·MP3·다양한 GP 포맷·카운트인 취소·고급 tempo/repeat: 미실행.

## 4. 미구현 및 알려진 문제

- 메트로놈, 실제 목표 지판(현재 목표 텍스트만 연결), Space/좌우/R 단축키 미구현.
- 현재 카피 화면에만 실제 악보 워크스페이스 연결. 모드 전환 시 악보 선택과 anchors의 상태 유지가 필요함. 연습/연주 DEMO와 실제 플레이어 UI 혼동 없도록 분리 필요.
- 트랙별 음량/선택 완료 범위 추가 검토. 현재 오디오 원본 master volume만 구현.
- loop 교체 후 transport 로컬 표시 상태 초기화, 재생 중 앵커 변경, 카운트인 경합 회귀 확인 필요.
- normalizeScore tempoMap·박자표·원본 바이트 보관·ID 재사용 규칙 계약 보강 필요. 파일 import 결과 오류 메시지를 모두 안전한 고정 사용자 문구로 변환할 것.
- WebView 재생 clock은 native 채점 clock으로 사용하지 않음. Phase3에서 clock PoC 필요.
- 큰 alphaTab 번들 chunk 경고가 있으며 실제 renderer 진입점의 지연 로딩 검토.

## 5. 다음 작업 계획

1. 최종 빌드 결과 수집, actual workbench 상태 공유 및 DEMO 분리.
2. 카운트인 청취/취소 검증, 메트로놈·실제 운지 지판·재생 단축키 구현.
3. 기본/실패/취소/복수 import 회귀와 Tauri 창 검증.
4. Phase 2의 모든 수용 조건을 확인한 뒤에만 완료 표시하고 Phase 3 진행.


## 완료 기록 — 2026-10-13

### 1. 작업 개요와 전체 상태

Phase 2 수용 조건을 구현·검증했습니다. 다음 단계는 Phase 3의 네이티브 오디오 입력·단음 판정입니다. Phase 3 이상의 기능은 완료 처리하지 않았습니다.

### 2. 최종 구현과 수정 파일

- 사용자 MusicXML/GP 선택 → 원본 bytes 메모리 보존 → alphaTab 렌더 → 반복을 펼친 NoteEvent/tempoMap/timeSignatures 정규화. notationNoteId로 반복 occurrence의 원본 음표 관계 유지.
- WAV/MP3 로컬 재생, seek, 0.5~1.5배속, A-B 반복, 현재/다음 음, 6현 지판의 실제 목표 프렛, 악보 커서. 정확한 물리적 운지는 주장하지 않음.
- 카피/연습/연주/라이브러리/설정 이동 후 악보·앵커 유지. 프로젝트 저장 기능을 대신하지 않으며 앱 종료 시 메모리 상태는 사라짐.
- 원곡과 메트로놈 음량을 분리. 악보 트랙은 선택/렌더 대상으로 다루며 별도 오디오 stem이라고 표시하지 않음.
- 현재 마디·앵커의 tempo/박자/배속을 반영한 카운트인과 메트로놈. 인트로 전 클릭 없음. Space 재생/일시정지, 좌우 5초 seek, R 반복 전환, 입력/버튼/링크/패널 조절 중 단축키 충돌 방지.
- 악보/음원과 fixture에 동일한 취소·최신 요청 보호. FileReader abort, fetch AbortSignal, 크기/형식/헤더 검증. 늦은 재생 성공/실패와 이전 media 이벤트가 새 파일을 바꾸지 않도록 보호.
- 루프/음량/박자 상태를 엔진 snapshot 하나에서 관리. StrictMode 수명 재설정과 음원 메타데이터 15초 timeout 처리.
- 수정 파일: src/app/App.tsx, AppShell.tsx, App.test.tsx; src/main.tsx; src/entities/score.ts; src/features/player/*; src/features/score/alphaTabAdapter.ts, ScoreViewport.tsx, ScoreWorkspace.tsx, WorkspacePage.tsx; src/features/practice/Fretboard.tsx; src/shared/styles.css, logger.ts, readBlob.ts, latestTask.ts; src/test/setup.ts; src/vite-env.d.ts; package.json, pnpm-lock.yaml, vite.config.ts, src-tauri/tauri.conf.json; fixtures/README.md; docs/12, docs/08, docs/progress/README.md.
- 추가 파일: scoreSession.ts; timing.ts와 테스트; PlayerEngine/alphaTabAdapter/sync 계약 테스트; scoreSession.test.tsx; latestTask/readBlob와 테스트; public/fixtures/standard.musicxml, standard.gp, sine.wav, sine.mp3; screenshots/PHASE-02-FINAL.jpg.
- 신규 라이브러리는 alphaTab 1.6.1(MPL-2.0). 원본 코드를 수정하지 않았으며 공식 번들 Vite 플러그인을 사용. 독립 최신 플러그인은 현재 Node/Vite와 호환되지 않아 설치하지 않음.

### 3. 테스트 결과와 오류 해결

| 실행 명령/확인 | 최종 결과 |
|---|---|
| pnpm typecheck | 통과 |
| pnpm lint | 통과, 경고 0 |
| pnpm test | 8개 파일, 35개 테스트 통과 |
| pnpm build | 통과, alphaTab worker/worklet·font·JS/CSS 생성 |
| pnpm format:check | 통과 |
| cargo fmt --check --manifest-path src-tauri/Cargo.toml | 통과 |
| cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings | 통과 |
| cargo test --locked --manifest-path src-tauri/Cargo.toml | Rust 기본 테스트 1개 통과 |
| cargo run --locked --manifest-path src-tauri/Cargo.toml | 실행 중인 Vite 서버를 재사용하여 Windows 창 실행·확인 |
| Windows 실제 MusicXML 렌더 | worker/font/TAB 정상, E4(64) 0프렛 표시 |
| Windows WAV 재생·seek | 4초 재생 완료, 1초 seek에서 A4(69) 5프렛과 실제 커서 좌표 일치 |
| Windows 자체 MP3 선택 | 파일 대화상자 키보드 선택 완료, 4초 길이와 새 epoch 확인 |
| 브라우저 MP3 파일 선택 | 실제 filechooser에서 sine.mp3 선택, 4초 길이와 정상 재생 상태 확인 |
| 브라우저 카운트인/메트로놈 | 0.75배속·1마디 설정, 카운트인 상태→재생 완료 확인, 메트로놈 켜기 상태 확인 |
| 브라우저 A-B 반복 | 0~2초 반복 최소 3회 이상, epoch 9→20(일시정지 포함), 구간 내 playhead 유지 |
| 모드 보존 | 반복 후 연습으로 이동해 같은 악보/현재 목표/음원이 유지됨. 라이브러리·설정 이동은 통합 테스트도 통과 |
| 자체 GP7 왕복 | alphaTab Gp7Exporter로 작성한 GP7을 다시 import, 8개 피치 64/67/69/71×2 일치 |
| ffprobe 자체 MP3 | 4.000000초 확인 |

회귀 테스트는 기존 검토에서 찾은 모드 전환, 재생 성공·실패 경합, 반복 초기화, fixture 취소/교체, 박자·배속 카운트인, 인트로 메트로놈, 실제 FileReader abort, StrictMode 재사용을 포함합니다.

해결한 오류:
- 테스트에서 Node fs 타입이 없던 문제는 새 의존성 설치 대신 기존 Vite raw import로 fixture를 읽어 해결.
- 119.99999999999997 같은 부동소수점 결과는 음악적 검증에 맞춰 toBeCloseTo와 박자 필드 검사를 분리.
- 테스트 double의 순환 return type 추론은 독립 생성 함수로 분리해 strict 타입 검사 통과.
- pnpm tauri dev와 기존 Vite 중복 실행은 1420 포트 충돌을 일으킴. 서버의 실제 종료/응답을 확인한 뒤 Vite를 하나만 실행하고 cargo run으로 native 창 검증. 일반 개발 시 pnpm dev와 pnpm tauri dev를 동시에 실행하지 말 것.
- Windows file picker의 열기 버튼은 msedgewebview2 소유로 클릭 자동화가 거부됨. 대화상자 취소 후 supported keyboard Return으로 같은 로컬 fixture 선택을 완료.

### 4. 미구현·검증 제약

- CPAL 입력·튜너·캘리브레이션·채점·점수 저장·녹음·AI·SQLite·에디터는 후속 Phase 범위. UI에 미구현을 명시하며 가짜 결과 없음.
- 영구 저장·재실행 복구는 Phase 4. 현재 세션 원본 bytes/앵커/트랙은 앱 수명만 유지.
- MIDI 합성 트랙 믹서·사용자 stems 믹싱은 미구현. 현재 원곡과 실제 메트로놈 출력만 조절.
- 실제 기타/오디오 인터페이스 입력은 미실행(Phase 3). MP3 배속 음정 유지의 청취 품질·장시간/고 DPI·모든 GP3/4/5/GPX 변형 및 복잡한 주법 원본 보존은 미실행. 실제 성공 fixture 범위는 자체 GP7/MusicXML/WAV/MP3이며 다른 형식도 파서 실패를 정상 안내.
- HTMLAudioElement preservesPitch를 요청하지만 음질·입력 채점의 sample-accurate 동기화를 보장하지 않음. UI clock을 Rust 판정 clock으로 그대로 사용하지 않을 것.
- alphaTab 번들 500kB 초과 경고와 MSVC import-library linker_messages 안내가 남음. 빌드·clippy 성공과 구별하여 기록하며 경고 숨김 설정을 추가하지 않음.
- Python 검사: 미실행, 이번 Phase에서 Python 코드 변경 없음.

### 5. 다음 작업

Phase 3: CPAL 장치 열거/입력 선택, 실시간 안전 큐, monotonic capture timestamp, 단음 pitch/onset PoC, Rust 순수 matcher의 최소 8개 합성 사례, clock anchor/epoch·보정 계약과 실제 장치 진단. 실제 장치 측정이 없는 정확도는 달성했다고 기록하지 않습니다.
