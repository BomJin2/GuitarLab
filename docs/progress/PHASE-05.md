# Phase 5 — 수동 TAB 편집

## 후속 — 악보 파일 출력의 문맥·취소 수명 (2026-10-28)

### 1. 작업 개요

작업/검증 완료일2026-10-28. 현재 편집본/조회한 저장 버전의 파일 출력에서 이전 명령 재사용과 선택 변경·취소 조기 잠금 해제를 보완합니다. 구현·대상/전체674프론트·타입/lint/포맷·웹/내장4개/Windows·원격/독립 패키지/보안 검증을 완료했습니다. 기존 수동 편집·저장/출력의 기본 수용과 이번 실제 GUI 미실행을 구분합니다.

### 2. 구현 및 변경 사항

- 먼저 `docs/12-API-CONTRACTS.md`에 최신 조작 잠금/문서 소유권·실제 취소 종료와 기존 IPC v1 유지 조건을 기록했습니다. `docs/04`, `docs/09`에 동작/회귀 기준을 보완합니다.
- `src/features/score/useScoreExport.ts`: 문서 문맥·이탈/같은 객체 복귀·최신 조작 허용/실행 가능 여부를 확인하고 첫 반환부터 이전 결과·진행을 숨깁니다. 실제 서비스 종료 전 새 작업을 시작하지 않으며 현재 문맥의 취소만 처리합니다.
- `src/features/score/scoreExport.ts`: 기존 StorageJob의 waitForCancellation을 사용해 취소 요청 뒤 실제 terminal 상태까지 확인합니다. JSON/MusicXML 스키마·8MiB/실제 의미 왕복·새 파일만 저장하는 정책은 유지합니다.
- `ScoreEditor.tsx`, `ScoreHistoryPanel.tsx`: 현재 문서/조회 버전과 최신 잠금을 연결하고 취소 정리 상태·반복 취소 방지를 표시합니다. 원본 기반 편집의 가공 문서는 매번 새 객체이므로 작업 문맥에는 안정적인 session.document를 사용합니다.
- `useScoreExport.test.tsx`에8개, `scoreExportCancellation.test.ts`에3개, `ScoreEditorExport.test.tsx`에1개 검사를 추가하고 기존 저장 버전 취소 검사에 잠금/문구를 보완했습니다. 엔진/음원·DB·플레이어·의존성은 변경하지 않습니다.

### 3. 테스트 결과

- 수정 전 대상13개 중 **11개 실패/2개 성공**,14.19초로 이전 실행·취소/최신 잠금과 native 종료 대기 회귀를 재현했습니다. 로그 `score-export-lifecycle-red-20261028.log`입니다.
- 통합 연결 과정에서 원본 기반 가공 문서가 화면 갱신마다 바뀌어 출력을 취소하는 **1개 실패**,2.48초를 재현했습니다. 안정적인 실제 문서를 문맥으로 사용해 해결했습니다. 로그 `score-export-editor-identity-red-20261028.log`입니다.
- 최종 `pnpm test src/features/score/useScoreExport.test.tsx src/features/score/scoreExportCancellation.test.ts src/features/score/scoreExport.test.ts src/features/score/ScoreEditorExport.test.tsx src/features/library/ScoreHistoryPanel.test.tsx`: **23개/5파일 성공**,3.25초. 신규12개/기존11개·실제 alphaTab 의미 왕복·취소 상태별 응답/편집 통합·버전 조회 보존을 확인했습니다.
- `pnpm test`: **674개/125파일 성공**,38.44초. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: **성공**. `pnpm build`: **성공**,Vite2분/기존 큰 chunk 안내. `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests`: **4개 성공**. `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **성공**,12.83초/기존 MSVC 링크 안내입니다. 새 Git/원격/독립 패키지 확정은 다음 항목을 따릅니다. 로그는 `src-tauri/target/runtime-validation/score-export-lifecycle-…-20261028.log`에 보존합니다.
- 소스ca90f4a를 main에 반영했고 [Windows40628569772](https://github.com/BomJin2/GuitarLab/actions/runs/40628569772)/job122619308273의 실제 로그/상태는 사후 정리까지 **전체 성공**입니다. 프론트674/125파일(66.08초), 기본Rust252/확장256(50.42/48.42초·각29개 기본 제외), 예제1+1·AI113(1.85초)/도구143(14.871초)·Clippy/MSRV1.90(7.39초)을 확인했습니다. 새 ZIP3,613파일/40,293,692바이트·실제 PS5.1/독립 Python·EXE/ZIP Defender는 성공입니다. 정확한 지문/영수증은 [Phase8 첫 절](PHASE-08.md)을 따릅니다.
- 실제 새 GUI·Windows 파일 선택/개인 악보 출력·청취/입력/REC·별도 OS: **미실행** — 자체 악보/모의 파일 API만 사용하고 사용자 앱·자료는 조작하지 않았습니다. 로컬 전체 Rust/Python 재실행: **미실행** — 해당 엔진/의존성이 변경되지 않았습니다.

### 4. 미구현 및 알려진 문제

동기 악보 검증/직렬화 자체의 즉시 취소나 이미 저장한 파일 삭제를 보장하지 않습니다. 파일 선택창이 열려 있으면 그 창도 닫아야 취소가 끝날 수 있습니다. 화면 이탈 뒤 새 인스턴스의 파일 작업은 기존 native 공통 잠금도 적용됩니다. 기존 원본 기반 과거 버전의 내보내기 미지원은 유지합니다.

### 5. 다음 작업 계획

이번 수정의 전체 검사/Windows·원격/독립 패키지/보안·문서 결과를 확정했습니다. 이어 장치 독립 합성 DSP/프로세스 관측을 Phase8에서 진행하며 실제 오디오 드라이버·Tauri 전체 RSS와 구분합니다.

## 후속 — 저장 조회의 프로젝트 문맥 보호 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 저장 악보 조회의 프로젝트 전환·이탈 경계에서 이전 데이터/함수의 재사용을 검사해4개 실패를 재현했습니다. 현재 프로젝트의 조회만 유지하도록 수정하는 안정성 슬라이스이며 구현·전체 자동 회귀/웹·Windows/독립 패키지·원격 확인을 완료했습니다. 실제 새 앱/개인 이력 수용은 미실행이며 기본9단계/부분5단계 상태는 유지합니다.

### 2. 구현 및 변경 사항

- 먼저 docs/12에 현재 프로젝트에 맞는 반환 상태·이전 load/read/cancel 재사용 차단·이탈 후 새 작업 금지와 같은 ID 재진입의 별도 문맥 계약을 추가했습니다. 새 IPC/DB/권한·의존성은 없습니다.
- `useScoreHistory.ts`는 프로젝트 변경/이탈 정리를 layout 수명주기에서 수행하고 현재 projectId와 일치하는 목록/미리보기만 반환합니다. 파일 작업/취소 전에 mounted와 현재 문맥 소유권을 확인합니다. 문맥 객체는 같은 ID로 돌아와도 이전 함수를 구분하며 소유자 ref를 render 도중 바꾸지 않습니다.
- `useScoreHistory.test.tsx`는 첫 반환부터 외부 프로젝트 데이터 차단·예전 조회/취소·같은 ID 재진입·unmount 뒤 호출과 정상 현재 취소를 검사합니다. 기존 오류/취소의 이전 조회 보존·늦은 응답 방지는 유지합니다. 실제 호출부인 기존 ScoreHistoryPanel/출력/독립 TAB 경로를 함께 확인합니다.
- 관련 명세/진행표를 갱신하며 현재 편집/Undo·저장 head/원본·재생·사용자 앱/입력/REC를 변경하지 않습니다.

### 3. 테스트 결과

- 수정 전 조회 훅 검사 **4실패/2성공**,2.17초(`history-context-before-20261026.log`). 새 문맥에 이전 목록/악보가 반환되거나 이전 load/read가 파일 작업을 시작하고 이전 cancel이 새 조회를 취소하는 동작을 재현했습니다. 실제 사용자 앱/파일에서 발생했다고 기록하지 않습니다.
- projectId 비교만 한 중간 수정 후 같은 ID로 다시 돌아오는 추가 회귀에서 **1실패/5성공**,2.40초를 확인했습니다(`history-context-return-before-20261026.log`). 현재 문맥의 객체 동일성도 확인하도록 보완했습니다.
- 최종 `pnpm typecheck` **성공**,조회 훅/이력 UI/독립 TAB/출력 대상 **21개/4파일 성공**,3.62초(`history-context-target-final-20261026.log`). 전체 프론트/포맷·웹/Windows/새 원격은 **진행 중**입니다.
- 실제 앱의 화면 전환·개인 이력/파일·브라우저 DEMO는 **미실행** — 자체 fixture/모의 조회로 검사합니다. native/Python 엔진은 변경하지 않아 전체 로컬 검사를 반복하지 않았으며 직전10a3e72의253확장Rust·AI113/도구143·MSRV 원격 전체 성공과 구분합니다.

전체 프론트 후속: `pnpm typecheck`/`pnpm lint`/`pnpm format:check` **성공**, 전체 `pnpm test` **546개/113파일 성공**,33.25초(`history-context-front-20261026.log`). `git diff --quiet 10a3e72 -- src-tauri/src ai scripts`로 검증한 엔진/개발 도구와 코드가 같음을 확인했습니다. 원본/개인 파일을 읽어 확인한 것은 아니며 웹·Windows/새 원격 검사는 후속입니다.

최종 빌드: `pnpm build` **성공**,Vite1분28초·기존chunk 안내, `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests` **4개 성공**,0.01초, 같은feature의 `cargo build --locked` **Windows 내장 빌드 성공**,15.52초·기존MSVC 링크 안내입니다. 로그는 `history-context-{build,bundle,native-build}-20261026.log`, EXE41,236,992바이트/SHA `770961d9e94b4d40622f052662d22842227108f59d9ac9d595d4241210883261`입니다. 실제 사용자 앱/새 브라우저 검사는 미실행이고 위 빌드 대기는 이 확정 전 이력입니다. 새 Git/원격·독립 패키지는 후속으로 확인합니다.

Git/패키지 후속:8a18f1fbb460b3a33d24d62c7852835ab6d9150d로 main에 push했고 같은 코드의 새ZIP3613파일/40,289,977바이트·전체CRC/SHA/새 추출·기본PowerShell5.1/독립Python3.12.15 두 번·Defender EXE/ZIP **성공**입니다. 세부 지문/후보/영수증은 PHASE-08 첫 절에 기록합니다. [Windows40332164724](https://github.com/BomJin2/GuitarLab/actions/runs/40332164724)/job121604103210은 진행 중이며 실제 새 앱/브라우저 검사는 미실행입니다. 계약 설명도 검증한 다른 프로젝트 경유→같은 ID 복귀 범위로 구체화했으며 추가 제품 코드 변경은 없습니다.

원격 최종 확정:8a18f1f/[Windows40332164724](https://github.com/BomJin2/GuitarLab/actions/runs/40332164724)/job121604103210은 사후 정리까지 **전체 success**입니다. 실제546프론트/113파일·249기본/253확장Rust(각 제외28개)·예제1+1·AI113/도구143·Clippy/MSRV1.90을 로그로 확인했습니다. 위 진행 중은 확정 전 이력이며 문맥 보호 후속은 구현/자동·빌드/패키지/문서까지 완료입니다. 실제 사용자 앱/새 브라우저·개인 이력 수용은 여전히 미실행입니다.

### 4. 미구현 및 알려진 문제

조회/취소 수명주기 보호이며 이전 버전을 현재 편집에 적용·삭제/원본 기반 내보내기 기능은 추가하지 않습니다. 실제 Windows UI/사용자 이력 수용은 미실행이며 이미 완료한 원격/패키지 결과를 새 소스 성공으로 대신하지 않습니다.

### 5. 다음 작업 계획

전체 프론트/웹·Windows 내장 검사와 새 커밋의 원격 결과를 확인해 기록합니다. 실제 앱/자료를 임의로 바꾸지 않고 외부 OS·특화 모델/고급 주법 품질·출시 조건은 별도로 유지합니다.

재개 기준: 위 자동/빌드·패키지/원격 확인은 완료했습니다. 실제 앱의 프로젝트 전환/같은 ID 복귀와 입력·기타 청취 등은 미실행으로 유지합니다. 기본9단계/부분5단계 및 별도 Windows·특화 가중치/고급 주법 정답·배포 서명/실제 데이터 작업의 미수용 조건을 다음 재개 시 확인하며 동일 소스 검사를 이유 없이 반복하지 않습니다.

## 후속 — 원본 기반 저장 버전 TAB (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 직전95359c4의 원격 전체 회귀와 독립 패키지 검증을 마치고, renderSource가 없는 저장 버전에도 등록 원본의 읽기 전용 TAB를 제공합니다. 현재 구현·대상 검사를 마쳤으며 전체/빌드 검사는 진행 중입니다. 기본9단계/부분5단계 상태와 실제 사용자 앱 수용 미실행을 유지합니다.

### 2. 구현 및 변경 사항

- 먼저 docs/12에 명시적 원본 읽기/실제 취소 완료 대기·표/현재 상태 보존 계약을 추가했습니다. 기존 read_project_asset v1의 자산 소유권/경로·크기·SHA 검사를 재사용하며 임의 파일 선택·새 IPC/DB/의존성을 추가하지 않습니다.
- `projects.ts`의 read가 기존 waitForCancellation 옵션을 전달합니다. `useRevisionScorePreview.ts`는 등록 원본만 읽고 기존 renderStoredScore로 독립 Score/lookup을 준비합니다. 정규화 문서는 원본을 읽지 않는 기존 경로를 유지합니다.
- `ScoreHistoryPanel.tsx`에서 준비 상태를 상위 잠금에 연결하고 실제 바이트 진행/닫기 취소·원본 누락/불일치/저장 트랙 누락을 표시합니다. 닫기 후 실제 작업 종료까지 중복을 차단하며 문맥 이탈·unmount의 늦은 결과를 버립니다. 원본 기반 내보내기는 계속 비활성입니다.
- 훅/UI/API 검사 파일3개와 관련 명세·진행 문서를 갱신합니다. 현재 편집·Undo·재생/저장 head·원본/과거 버전, 사용자 앱·입력/REC를 변경하지 않습니다.

### 3. 테스트 결과

- `pnpm typecheck` **성공**. 훅/이력 UI/기존 프로젝트 읽기·열기/이력 조회 대상 **49개/5파일 성공**,4.43초(`revision-original-target-20261026.log`). 실제 MusicXML 파서/등록 ID·진행/중복·취소 종료 대기·늦은 결과·FILE_NOT_FOUND/ASSET_MISMATCH·잘못된/8MiB 초과 파일과 재시도·문서/바이트/재생 보존을 확인했습니다.
- 첫 Prettier 실행에서 훅 파일 쓰기가 UNKNOWN 오류로 실패했습니다. 해당 파일만 같은 명령으로 재시도해 성공했으며 타입/검사 기준이나 권한을 확대하지 않았습니다.
- 추가 원본 트랙 누락 보호·정규화 경로 읽기0회 검사를 포함한 전체 프론트/타입·lint·포맷과 웹/Windows 검사는 **진행 중**입니다. 실제 브라우저는 원본 읽기 transport DEMO와 제품 네이티브 경로를 구분해 후속 확인합니다.
- 실제 사용자 앱/개인 저장 자료·파일 선택/장치/REC는 **미실행** — 기존 앱을 바꾸거나 자료를 열지 않습니다. native/Python 코드는 변경하지 않아 전체 로컬 검사를 반복하지 않았습니다.

최종 로컬 검사: 추가 보호를 포함한 `pnpm typecheck`/`pnpm lint`/`pnpm format:check` **성공**, 전체 `pnpm test` **534개/113파일 성공**,35.69초(`revision-original-front-20261026.log`). `pnpm build` **성공**,Vite1분37초·기존 chunk 안내입니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol` **성공**,16.12초·기존 MSVC 링크 안내입니다. 처음 feature 없이 실행한 bundle_tests는0개 필터 결과여서 검증 성공으로 세지 않았고 custom-protocol로 재실행해 **4개 성공**,0.01초를 확인했습니다(`revision-original-bundle-final-20261026.log`).

실제 브라우저 후속: 자체 MusicXML/모의 등록 자산 transport의 명시적 읽기0→1, 읽는 중 닫기의 취소 대기/목록·새 준비 잠금·늦은 응답 무시와 재열기를 확인했습니다. 원본 TAB의 **SVG4개/자식64개·프렛0/3/5/7 두 번**을 확인했고 재생0/문서·원본 바이트 불변/커서 숨김입니다. 누락 원본은 오류·표8행을 유지하고SVG0이며 닫기 후 해제됩니다. `revision-original-browser-observed-20261026.json`과 자체 production/빌드 로그8.69초를 보존합니다. 실제 Tauri 자산/개인 이력 수용이 아니며 자체 탭4/서버10134만 종료했습니다. 위 전체/브라우저 진행 중은 이 확정 전 이력이고 새 커밋·원격은 후속입니다.

### 4. 미구현 및 알려진 문제

원본 기반 TAB는 저장 시 연결된 원본의 표시이며 현재 편집으로 적용/프로젝트 전체 복원/재생·원본 기반 새 파일 변환은 구현하지 않습니다. 브라우저에서는 등록 원본을 읽을 수 없다고 안내합니다. 해시가 바뀌거나 원본이 없으면 실패와 표를 유지합니다. 동기 파싱 중 즉시 취소/무지연은 보장하지 않습니다.

### 5. 다음 작업 계획

전체 회귀·실제 SVG/Windows 빌드와 새 커밋의 원격 결과를 확인해 기록합니다. 현재95359c4 패키지와 새 소스의 결과를 혼동하지 않으며 남은 별도 OS·특화 모델/주법·출시 수용은 별도로 유지합니다.

Git/패키지 후속: 구현·검증 문서는2c33c7757efc2c0dfac8e537cc683d80964bdefd로 main에 push했습니다. 같은 커밋의 새ZIP3613파일/40,288,746바이트·전체CRC/SHA/새 추출·기본PowerShell5.1/독립Python3.12.15 두 번·Defender EXE/ZIP **성공**입니다. 세부 지문/후보/영수증은 PHASE-08 첫 절에 기록합니다. [새 원격40292589404](https://github.com/BomJin2/GuitarLab/actions/runs/40292589404)은 진행 중이며 앞선95359c4의 전체 success와 구분합니다.

원격 최종 확정:2c33c77/[Windows40292589404](https://github.com/BomJin2/GuitarLab/actions/runs/40292589404)/job121470920653는 사후 정리까지 **전체 success**입니다. 실제534프론트/113파일·249기본/253확장Rust(각 제외28개)·예제1+1·AI113/도구143·Clippy/MSRV1.90을 확인했습니다. native/Python을 변경하지 않았지만 새 원격 회귀도 통과했습니다. 위 진행 중은 확정 전 이력이며 이 원본 기반 TAB 슬라이스는 구현/자동·브라우저/Windows·패키지/문서까지 완료입니다. 실제 사용자 앱 수용·원본 기반 내보내기/이전 버전 적용과 전체 로드맵의 미수용 조건은 별도로 유지합니다.

## 후속 — 저장 편집본 읽기 전용 TAB (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 조회한 저장 편집본을 현재 작업 공간과 분리한 TAB로 읽는 기능입니다. 직전 새 파일 출력의523프론트/Windows 검사와 로컬5b72288 보존을 확인한 후 시작했습니다. 원본 기반 버전은 제외하고 현재 기본9단계/부분5단계 수용 경계를 유지합니다.

### 2. 구현 및 변경 사항

- docs/12에 먼저 NORMALIZED 한정·명시적 준비·독립 Score/lookup/현재 상태 불변과 동기 파서 한계를 기록했습니다. `useRevisionScorePreview.ts`가 기존 정규화/의미 왕복을 재사용하고 UI는 열기/닫기·상태 표시에 집중합니다.
- `ScoreHistoryPanel.tsx`는 별도의 기존 ScoreViewport에 저장 트랙·null 커서만 전달합니다. 음표 선택/키 탐색/재생 콜백은 연결하지 않으며 표와 내보내기를 유지합니다. 상위 잠금 중 새 준비는 막고 닫기는 허용합니다.
- 새 컨트롤러와 공통 `useScoreExport.ts`의 문맥 초기화는 layout effect로 paint 전에 처리해 빠른 조작과 초기화가 겹치지 않게 했습니다. 새 IPC/DB·native/Python/의존성 변경과 원본 파일 읽기·AI/입력/녹음 실행은 없습니다.
- 훅2개/실제 정규화 왕복과 UI 트랙·닫기/이탈·상호작용 차단 검사를 추가했습니다. docs/02·04·09·21/진행표를 갱신합니다. 기존 설명의 ORIGINAL은 wire 값이 아니며 원본 기반 문서의 실제 표시는 renderSource 누락임을 docs/12와 테스트에서 정정했습니다.

### 3. 테스트 결과

- 초기 완료 검사에서 **1실패/5성공**을 기록했습니다(`revision-preview-target-before-settle-20261026.log`). 빠른 TAB/출력 조작과 passive effect 초기화가 겹치는 모의 조작을 paint 전 초기화로 보완했습니다. 실제 사용자 앱에서 같은 증상을 측정한 것은 아닙니다.
- 초기 alphaTab 순환 객체 동일성 검사 표현의 장시간 비교를 boolean 동일성으로 바꿨고, 별도 realm의 Uint8Array를 값 배열로 비교하도록 검사만 정정했습니다. 진단 실행은 중단·미완료로 남기며 `revision-preview-hook-diagnostic-{2,3}-20261026.log`를 보존합니다. 임시 진단 출력은 제거했습니다.
- 타입 검사는 테스트에 실제 계약에 없는 ORIGINAL 값을 넣어 실패했습니다. 원본 기반 fixture를 필드 누락으로 수정했으며 제품 스키마를 넓히지 않았습니다.
- 수정 후 `pnpm typecheck` **성공** 및 훅/저장 이력 UI/기존 출력/ScoreViewport 대상 **17개/4파일 성공**,3.32초와 최종3.01초입니다(`revision-preview-target-final-20261026.log`). 전체 프론트/포맷·웹/내장/Windows·새 원격은 **진행 중**입니다.
- native/Python 전체 로컬 검사와 실제 사용자 앱/개인 이력·장치/REC는 **미실행** — 해당 엔진 변경이 없으며 자체 fixture로만 검사합니다. 실제 SVG/브라우저 검사는 자동 mock viewport 검사와 구분해 후속 확인합니다.

최종 로컬 검사: `pnpm typecheck`/`pnpm lint`/`pnpm format:check` **성공**·전체 `pnpm test` **526개/113파일 성공**,34.77초(`revision-preview-front-20261026.log`), `pnpm build` **성공**,Vite1분41초·기존chunk 안내입니다. 내장 `bundle_tests` **4개 성공**·Windows custom-protocol 빌드 **성공**,12.45초·기존MSVC 링크 안내입니다(`revision-preview-{build,bundle,native-build}-20261026.log`). 코드 변경 없이 중지 후 같은 산출물/소스를 확인하고 검사를 재개했으며 위 전체 검사 대기는 이전 이력입니다.

실제 브라우저 후속: 자체 DEMO의 올바른 production-3에서 두 트랙 모두 **SVG4개/자식64개**를 확인했습니다. 두 번째 트랙의2·5·7·9와 첫 트랙의0·3·5·7 표시 전환, 닫기 뒤SVG0개·커서 숨김·재생 호출0/문서 불변, 미조회 목록 변경이 실제 조회3을 유지하는 동작과 음정/운지 불일치2의 오류/표 보존·원본 기반1의 미지원 안내를 확인했습니다. `revision-history-browser-observed-20261026.json`을 보존합니다. 초기 production-1/2는 검증용 상대 base 때문에 워커 경로가 assets/assets로 중복돼 SVG 성공으로 세지 않습니다. 제품 자체는 이미 /assets 절대 경로였으며 검증 페이지만 제품의 base/최소 높이에 맞췄습니다. 원격·새 독립ZIP/실제 Windows 파일 선택·사용자 자료는 아직 미실행입니다. 자체 탭3/localhost1432 서버만 종료했고 사용자 앱/입력/REC는 조작하지 않았습니다.

### 4. 미구현 및 알려진 문제

원본 파일 기반 버전 TAB·재생/직접 적용/삭제는 제공하지 않습니다. 정규화 편집 지원 범위를 넘어서는 문서는 표를 유지합니다. 준비는 기존 동기 파서여서 준비 자체의 즉시 취소/전체 무지연과 실제 Tauri 성능을 보장하지 않습니다. 새 창·현재 사용자 앱/파일·head/revision은 변경하지 않습니다.

### 5. 다음 작업 계획

전체 검사/웹·Windows 빌드와 별도 자체 브라우저의 실제 SVG·표시 전환을 확인합니다. 두 독립 후속을 Git/원격에 보존하며 외부 품질/별도OS 수용을 완료로 바꾸지 않습니다.

확정 후속: 두 구현은5b72288/95359c4로 main에 push했고 [Windows40289117144](https://github.com/BomJin2/GuitarLab/actions/runs/40289117144)/job121459740900이 **전체 success**입니다. 실제526프론트·249기본/253확장Rust(제외28개)·AI113/도구143·자체 예제1+1·MSRV를 확인했습니다. 새 ZIP3613파일/40,288,872바이트·전체CRC/SHA/새 추출·PowerShell5.1/독립Python3.12.15 두 번과 Defender의 EXE/ZIP 검사도 성공했습니다. 산출물의 세부 지문/영수증과 별도 OS·서명/실제 앱 미실행은 PHASE-08 첫 절에 기록합니다. 위 원격/패키지 대기 문구는 이 확정 전 이력입니다.

## 후속 — 조회한 저장 편집본 새 파일 보존 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 읽기 전용 저장 이력에서 조회한 편집본을 현재 작업 공간과 분리한 새 JSON/MusicXML로 보존합니다. 기본9단계/부분5단계 상태는 유지하며 코드/대상 검사는 성공, 전체 검사·Windows/원격·실제 파일 선택은 아래 상태로 구분합니다.

### 2. 구현 및 변경 사항

- docs/12에 먼저 NORMALIZED 한정·조회 대상 버전 고정·현재 편집/head/원본 보존·기존 출력 보호 재사용 계약을 기록했습니다. 새 IPC/의존성/DB·native/Python 코드 변경은 없습니다.
- `ScoreHistoryPanel.tsx`가 실제 조회 내용의 버전/전체 트랙을 명시하고 출력·조회 중 중복 동작을 막습니다. 원본 기반/브라우저의 사유와 출력 진행·취소/성공/오류를 표시합니다. 선택칸만 바꾼 미조회 버전을 출력하지 않습니다.
- 기존 `useScoreExport.ts`의 작업 문맥 타입을 object로 넓혀 조회 RevisionDocument에도 동일한 취소/이탈/오류 초기화를 재사용합니다. 파일을 다시 읽는 인수가 아니며 기존 Uint8Array 호출은 유지합니다. 출력 서비스의 의미 왕복/용량/네이티브 파일 보호는 그대로입니다.
- `ScoreHistoryPanel.test.tsx`에 실제 조회/목록 선택 분리·브라우저/원본 기반/상위 잠금·중복/조회 차단·양식/저장 공간 오류 재시도·취소/프로젝트 변경·불변 검증을 추가했습니다. docs/02·04·09·21/진행표에 사용 범위를 기록합니다.

### 3. 테스트 결과

- `pnpm exec vitest run src/features/library/ScoreHistoryPanel.test.tsx src/features/library/useScoreHistory.test.tsx src/features/score/useScoreExport.test.tsx src/features/score/scoreExport.test.ts`: **11개/4파일 성공**,최종3.01초. 실제 JSON/MusicXML 재입력·8MiB 거부와 기존 문맥 취소 검사를 포함합니다.
- 초기 타입/린트와 대상 Prettier는 **성공**. 전체 타입/린트/포맷·프론트/웹 및 내장/Windows 빌드·원격은 **진행 중**, 실제 완료 결과를 이어 기록합니다.
- native/Python 전체 로컬 검사: **미실행** — 해당 코드 변경이 없으며 직전7ff2bef의249/253Rust·AI113/도구143·MSRV 원격 성공과 구분합니다.
- 실제 사용자 앱/파일 선택·개인 저장 이력: **미실행** — 자체 fixture/모의 작업만 사용하며 현재 앱/개인 자료·입력/REC를 유지합니다.

최종 로컬 결과: `pnpm typecheck`/`pnpm lint`/`pnpm format:check` **성공**, 전체 `pnpm test` **523개/112파일 성공**,34.48초(`revision-export-front-20261026.log`)입니다. `pnpm build` **성공**,Vite2분2초·기존chunk 안내이며 `cargo test … --all-features bundle_tests -- --nocapture` **4개 성공**·Windows `cargo build … --features custom-protocol` **성공**,15.45초·기존MSVC 링크 안내입니다(`revision-export-{build,bundle,native-build}-20261026.log`). 앱은 재실행하지 않았습니다. 위 전체/빌드 대기는 이전 이력이며 새 소스 Git/원격과 실제 파일 선택 수용은 구분합니다.

### 4. 미구현 및 알려진 문제

원본 GP/MusicXML 기반 버전은 자동 변환하지 않습니다. 기존 기본 단성6줄/용량/의미 왕복 검증을 통과하는 편집본만 출력합니다. 프로젝트의 음원·녹음/설정 백업이나 현재 편집본으로 직접 복원하는 기능은 아닙니다. 취소 전에 실제 파일이 게시됐다면 기존 출력 안내에 따라 남을 수 있으며 자동 삭제하지 않습니다.

### 5. 다음 작업 계획

전체 프론트/웹·내장/Windows 검사를 마쳐 이 슬라이스를 보존합니다. 이후 같은 저장 이력의 읽기 전용 TAB 미리보기를 독립 후속으로 검토하고 전체 출시·실제 사용자 수용은 기존 미완료 경계를 유지합니다.

## 후속 — 저장 악보 버전 읽기 전용 조회 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 기존 불변 revision의 목록과 선택 내용을 읽는 기능을 구현해 대상/전체 검사·Windows 빌드를 완료했습니다. 새 독립 패키지/원격 회귀와 실제 Windows 폼 수용은 아래에서 구분합니다. 현재 편집본을 적용/복원하는 기능은 포함하지 않으며 기본9개/부분5개 상태를 유지합니다.

### 2. 구현 및 변경 사항

- 구현 전 docs/12에 v1 목록/조회·취소/진행·소유권·100개 페이지 계약을 기록했습니다. `storage/score_history.rs`는 read transaction으로 head/목록을 함께 읽고 `projects.rs`의 기존 unsigned SQL 변환을 공유합니다. 저장 JSON은 기존 revision()의 크기/SHA/소유권 검증을 재사용합니다.
- `commands/score_history_api.rs`와 app/commands/storage 등록·원격 IPC 거부 회귀를 추가합니다. `storage_api::launch_idle`은 기존 trash/metadata의 같은 녹음·StorageJob 보호를 추출해 실제 세 호출 영역에서 공유하며 보호 의미를 바꾸지 않습니다.
- `scoreHistory.ts`는 엄격한 응답/페이지·소유권 검증, `useScoreHistory.ts`는 취소 종료 대기·늦은 응답 폐기·이전 결과 보존을 담당합니다. `ScoreHistoryPanel.tsx`는 명시적 목록/내용 읽기·저장 트랙/최대100음 표, `ProjectStatus.tsx`는 패널 열기만 연결합니다. 현재 프로젝트 컨트롤러/세션/PlayerEngine을 조회 서비스에 의존시키지 않습니다.
- 새 migration/의존성/Python·원본 재연결/음원 읽기·head 변경/새 revision 생성은 없습니다. docs/02·04·07·08·09/진행표를 갱신합니다.

### 3. 테스트 결과

- 대상 `pnpm exec vitest run src/features/library/scoreHistory.test.ts src/features/library/useScoreHistory.test.tsx src/features/library/ScoreHistoryPanel.test.tsx`: **6개/3파일 성공**,2.60초. 목록/응답·취소/실패 보존·전환/이탈·100음 UI를 확인했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features score_history -- --nocapture`: **3개 성공**,2.65초/컴파일11.47초. 임시101개 revision·원본 누락/손상/다른 소유권·취소/보관/커서·DB 불변을 확인했습니다.
- `pnpm typecheck`/`pnpm lint`/`pnpm format:check`: **성공**. 확장Clippy도 **성공**,17.47초. 전체프론트/확장Rust·MSRV/최종Vite/내장/Windows는 현재 검증 중입니다.
- 발생 오류/해결: unsigned SQL helper의 소속을 잘못 참조한 컴파일 오류는 기존 projects 모듈 helper를 형제 모듈에 공개해 재사용했습니다. 테스트의 잘못된 자산 테이블명은 실제 project_assets.relative_path로 수정했습니다. TypeScript의 좁혀진 unknown 속성을 콜백에서 재사용한 오류는 검증 후 지역 상수로 보존했고, 선택 트랙의 undefined 보호를 추가했습니다. 지원하지 않는 toReversed와 설정하지 않은 DOM matcher는 기존 타깃의 복사/reverse·DOM 속성 확인으로 교체했습니다. 새 라이브러리는 설치하지 않았습니다.
- 실제 사용자 앱/개인 프로젝트 조작·Windows 폼 수용·새 독립ZIP/원격은 **미실행** — 앱과 사용자 데이터를 유지하며 자동 검증 후 정확한 소스의 산출물로 구분할 예정입니다. Python은 변경하지 않아 로컬 전체 재검사는 **미실행**이며 원격 회귀 결과와 구분합니다.
- 최종 `pnpm test`: **515개/112파일 성공**,41.77초. `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features`: **251개 성공/28개 환경 의존 기본 제외**,19.53초. 기존 보관/메타데이터/녹음·원격 접근 거부도 포함하며 로그 `score-history-front-20261026.log`/`score-history-rust-20261026.log`를 보존합니다.
- `cargo +1.90.0 check --locked --all-targets --all-features --manifest-path src-tauri/Cargo.toml`/`cargo fmt --check`: **성공**,최소버전11.20초. `pnpm build`: **성공**,Vite49.27초·기존500kB chunk 경고. 최종 `cargo test … --all-features bundle_tests -- --nocapture` **4개 성공**,0.00초와 `cargo build … --features custom-protocol` **Windows 성공**,11.65초·기존MSVC 링크/테스트 아이콘 안내입니다. 로그 `score-history-{build,bundle,native-build}-20261026.log`를 보존하며 위 검사 중 표시는 이전 시점입니다. 앱은 실행하지 않았습니다.

2026-10-26 확정 후속: main `aa488666a22eef265d8710cf8ba2de93a654816e`의 [Windows40227524015](https://github.com/BomJin2/GuitarLab/actions/runs/40227524015)/job121271964128는 정리 단계까지 **전체 success**입니다. 실제 로그의515프론트/112파일(48.13초), 기본247Rust(41.45초)/확장251Rust(49.51초·각28개 기본 제외), 예제1+1, AI113(1.85초), 도구143(13.295초·제외 없음), MSRV7.71초와 타입/lint/포맷·Vite5.77초를 확인했습니다. 영수증 `score-history-ci-final-20261026.json`을 보존합니다.

같은 소스의 실행 파일41,232,384바이트·SHA `a93faa6b0a04aa81d14609c928810d97fbdd83bd12737fd932ececd7b448e324`를 새 UUID 폴더에 복사했고 runtime3393개/64,095,466바이트를 고정 lock과 모두 대조했습니다. `score-history-candidate-2bf30716-e21a-4127-983e-17468c5a42d3.json`은 미실행 후보이며 generic 포인터/기존 앱은 유지합니다. ZIP `validation-packages/55a00fe2-c61a-44dc-a254-47fc314a59f6/GuitarLab-validation.zip`은3613파일/40,286,466바이트·SHA `0d29ca7faf96ca27d24cf0939edaad074c5cfca99317cf303c2795f80deb5831`입니다. 전체SHA/CRC·같은 바이트 추출·실제PS5.1 종료0/개발경로 제외 독립Python3.12.15 실행 검사를 확인했고 `score-history-package-receipt-97cc4a97-2191-4c11-81c2-f88db890f3f9.json`에 기록했습니다. 동일EXE/ZIP만 Defender4.18.26090.9/정의1.461.194.0으로 치료 없이 검사해 모두0/위협 없음·전후 지문 동일을 확인했습니다. `score-history-defender-e4794f70-5348-4dd1-a2c0-487fd762b1ed.json`을 보존하며 서명은NotSigned, 새OS/다른백신·실제폼은 미실행입니다. 위 패키지/원격 미실행은 이전 시점입니다.

### 4. 미구현 및 알려진 문제

저장 목록은 최신100개씩/선택 내용은 트랙당100음 표입니다. 과거 버전의 TAB 렌더/재생·현재 작업으로 적용·버전 삭제·자동 복원은 미구현입니다. 원본 파일 누락은 이 기능이 복구하지 않으며 실제 고급 판정 품질/별도 Windows 수용 조건도 유지합니다.

### 5. 다음 작업 계획

전체 회귀와 Windows 빌드·정확한 소스의 새 검증 ZIP/원격 결과를 마무리한 뒤 독립적으로 진행 가능한 로드맵 후속 기능을 순차 구현합니다. 이전 버전 적용을 추가할 때는 미저장 보호와 현재 세션/Undo·원본 비파괴 계약을 먼저 정의하며 이번 읽기 기능을 자동 적용으로 바꾸지 않습니다.

## 후속 — 편집 기록 단축키 보호 (2026-10-25)

### 1. 작업 개요

작업일2026-10-25. 수동 편집 패널의 키 반복/IME·입력 영역에서 Undo가 실행되는 실패를 재현해 고치고 Windows Ctrl+Y Redo를 기존 기록에 연결합니다. 현재 대상/전체 프론트 검사는 성공이며 최종내장/Windows·패키지/원격은 후속 결과로 구분합니다. 기본9개/부분5개와 고급 품질·별도Windows 조건은 유지합니다.

### 2. 구현 및 변경 사항

- 구현 전 docs/12에 동작/입력·잠금 보호 계약을 기록했습니다. 새IPC/DB·의존성은 없습니다.
- `ScoreEditor.tsx`: 기존 Ctrl/Meta+Z·Shift+Z를 유지하고 Ctrl+Y를 같은 controller.redo에 연결합니다. enabled/defaultPrevented/isComposing/repeat/Alt 보호와 기존 `shared/keyboard.ts`의 입력 판별기를 재사용합니다. 입력/상속 contenteditable·SVG의 자체 Undo는 가로채지 않습니다. 패널 안내만 보완하고 새UI/디자인은 만들지 않습니다.
- `ScoreWorkspace.tsx`: 녹음/재생 잠금을 편집 패널의 기존 locked에 전달합니다. 하위 Undo/Redo 도메인의 잠금에 더해 키 이벤트·버튼 상태도 동일하게 보호합니다.
- `src/app/scoreSession.test.tsx`/`scoreLoop.test.tsx`: 실제 App의 편집·반복/IME/Alt/이미 처리된 이벤트·입력영역/표준입력 보존·Ctrl/Meta Undo/Redo와 Ctrl+Y·잘못된 Y 조합 및 녹음잠금/해제 후 기록 보존을 검사합니다. docs/04·09/21·로드맵/진행표를 갱신합니다.

### 3. 테스트 결과

- 수정 전 새 App 통합 검사 **1실패/22미선택**: 반복 Ctrl+Z가 preventDefault되면서 기존 기록을 되돌리는 문제를 재현했습니다. 수정 후 동일1개 성공(943ms)입니다.
- 확장 대상 `pnpm exec vitest run src/app/scoreSession.test.tsx src/app/scoreLoop.test.tsx src/shared/keyboard.test.ts`: **28개/3파일 성공**,18.56초. 실제 렌더/파서와 DOM 대역을 사용하며 개인 파일/입력은 사용하지 않았습니다.
- `pnpm typecheck`/`pnpm lint`: **성공**. `pnpm test`: **494개/106파일 성공**,47.20초. 로그 `src-tauri/target/runtime-validation/editor-shortcuts-front-20261025.log`를 보존합니다.
- `pnpm format:check`/`pnpm build`: **성공**,Vite1분27초·기존500kB 초과chunk 경고 유지. 로그 `editor-shortcuts-build-20261025.log`를 보존합니다. 내장/Windows·패키지/원격은 현재 검사 중입니다. Rust/Python 전체의 로컬 재검사는 **미실행** — 해당 코드를 변경하지 않았으며 새 원격 결과와 구분합니다. 실제Windows 키 조작·Explorer drop/사용자 기타/새OS는 **미실행** — 이번 수직 슬라이스의 합성 입력 회귀와 구분합니다. Windows 제어 도구는 창 목록 조회만 했고 앱 조작/실제drag를 수행하지 않았습니다.

### 4. 미구현 및 알려진 문제

단축키 범위는 기존 수동 편집 패널입니다. 별도TAB/원본비교/앱전역으로 확대하지 않았고 입력칸의 자체 Undo/Redo는 유지합니다. 고급 주법 점수·특화 두 기타/별도Windows10/11·최종출시 수용은 이 변경으로 해결되지 않습니다.

최종내장 `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture`: **4개 성공**,0.01초/컴파일29.49초. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **Windows 빌드 성공**,11.78초·기존MSVC 링크 안내. 실행 파일40,905,216바이트·SHA `7ba561eafd308968e326b222fba4c235e639193f03ab2d09659ba83e4f882f26`이며 앱은 실행하지 않았습니다. 로그 `editor-shortcuts-bundle-20261025.log`/`editor-shortcuts-native-build-20261025.log`를 보존합니다. 위 내장/Windows 검사 중은 이전 시점이고 새ZIP/원격은 다음입니다.

### 5. 다음 작업 계획

최종포맷/Vite·내장/Windows와 새 독립ZIP/실제PS5.1·원격 회귀를 확인하고 정확한 결과를 추가합니다. 사용자가 연주할 필요 없는 검증부터 계속하며 기존 앱/개인 자료·실행 포인터는 유지합니다. 이후 남은 고급 품질·모델/별도Windows 수용 조건과 독립적인 기능 보완을 구분해 진행합니다.

### 독립 패키지 완료·원격 검사 중

source `6a505640b65bef4e3f2bae219274b610a8138ce4`를 main에 push했고 [Windows40188520521](https://github.com/BomJin2/GuitarLab/actions/runs/40188520521)/job121154334361는 현재 앱 기본 회귀 진행 중입니다. 이전847296d의 원격 성공을 이 수정의 성공으로 표시하지 않습니다.

새 후보 `editor-shortcuts-candidate-f82eb168-32e3-4ee4-9129-01f5529684fd.json`은 앱 미실행이며 generic 포인터는 그대로입니다. 고정3393runtime/64,095,466바이트·lock SHA `191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d` 확인 뒤 새ZIP `validation-packages/aad97234-f1d2-46ea-bc7d-b50bd634e4cf/GuitarLab-validation.zip` **3613파일/40,220,723바이트·SHA `54fed4ae0d23ca816486b64d9fbc9441d76937aa75818845ea74b410920ada3f`**를 만들었습니다. 전체SHA/CRC·같은 지문 바이트의 새 폴더 추출과 실제PS5.1 `-File Test-ValidationPackage.ps1` **exit0**, 개발PATH 제외/모델 없는 Python3.12.15 두 번이 성공했습니다. 영수증 `editor-shortcuts-package-receipt-bbcbc9cc-4219-45cd-9243-362e96ebc236.json`/로그 `editor-shortcuts-package-check-03ec2fdc-997f-49e9-854a-5b0636cfaf96.log`는 `src-tauri/target/runtime-validation/` 아래에 보존합니다. 새Defender/실제Windows 키·Explorer/사용자 자료/별도OS는 미실행입니다. 이어 Phase8의 선언 용량 경계 회귀를 별도로 점검합니다.

### 원격 최종 확정 — 2026-10-26 확인

source6a50564의 [Windows40188520521](https://github.com/BomJin2/GuitarLab/actions/runs/40188520521)/job121154334361는 **전체 success**입니다.494프론트/106파일·기본240Rust/90.35초·확장244Rust/136.82초(각28개 기본 제외)·예제1+1·AI113/3.41초·개발 도구143/22.583초(제외 없음)·타입/lint/빌드/포맷/Clippy·Rust1.90 전체 컴파일10.78초와 사후 정리까지 확인했습니다. 위 진행 중은 이전 시점입니다. 이 결과는 이후 MusicXML 용량 보호의500개 소스를 검증한 결과가 아니며 새 수용은 PHASE-08에서 분리합니다. 실제Windows 키/Explorer·별도Windows/최종출시의 미실행 범위는 유지합니다.

## 후속 — 악보 내보내기 오류 안내 복원 (2026-10-25)

### 1. 작업 개요

완료일2026-10-25(대상 검사, 전체 검사/최종 패키지는 아래 상태 참조). 원본 WAV 후속 검사에서 찾은 동일한 오류 처리 패턴을 기존 JSON/MusicXML 출력에서 재현했습니다. 저장 방식/원본·문서/IPC 계약은 유지하며 실패 원인별 안내만 복원합니다.

### 2. 구현 및 변경 사항

`scoreExport.ts`의 공통 `scoreExportError`와 유일한 호출자 `useScoreExport.ts`를 확인했습니다. `runStorageJob`이 전달하는 `Error(code)`도 record 검사에 먼저 잡혀 `.code`가 없는 일반 오류 안내로 바뀌었습니다. 같은 함수에서 Error 메시지를 먼저 확인하는 순서만 수정했습니다. native `{code}`·알 수 없는 오류의 기존 일반 안내와 경로 마스킹은 유지합니다. JSON/MusicXML 양쪽 호출에 적용되며 새 명령/데이터·UI 디자인/의존성 변경은 없습니다.

### 3. 테스트 결과

- 수정 전 `pnpm exec vitest run src/features/score/scoreExport.test.ts`: **1실패/2성공**,2.14초. `Error('EXPORT_DESTINATION_EXISTS')`에서 새 파일명 안내 대신 일반 문구가 나왔습니다. 실패 로그 `runtime-validation/score-export-error-before-20261025.log`를 보존합니다.
- 수정 후 같은 명령: **3개 성공**,2.18초. 파일 충돌·작업 중·녹음 중·공간 부족의 Error/native 객체 안내 일치 및 임의 개인 경로 비노출을 확인했습니다. 기존 실제 JSON/MusicXML 재입력/취소·응답 계약 검사도 유지합니다.
- 전체 타입/lint/테스트/포맷·Vite는 진행 중이며 성공 전 기록하지 않습니다. Rust 소스는 이 오류 안내 후속에서 변경하지 않았고 직전 WAV 출력의243개/Clippy/MSRV·Windows/독립ZIP 성공과 구분합니다. 새 내장 실행 파일·실제 앱 선택 창/디스크 채우기는 **미실행** — 프론트 오류 변환과 테스트 대역 검증이며 사용자 자료/앱은 유지합니다.

후속 `pnpm typecheck`/`pnpm lint`/`pnpm test`/`pnpm format:check`/`pnpm build`도 **성공**했습니다. 전체485개/105파일·29.41초, Vite1분12초/기존 큰 chunk 경고이며 전체 로그 `runtime-validation/score-export-error-after-20261025.log`와 `score-export-error-build-20261025.log`를 보존합니다. 위 진행 중은 당시 이력입니다. 이번 변경은 프론트 오류 매핑뿐이며 원본 WAV 기능과 함께 최종 내장 빌드/원격 결과를 아래에 확정합니다.

최종 내장 `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture`: **3개 성공**,0.01초/컴파일11.09초. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **Windows 성공**,11.10초/40,904,704바이트/SHA `171e1dcba8f5cb60d08d04a4a5703e79948494ac7cc1d57f84e48eb099e7d9d0`입니다. 원본 WAV 내보내기와 이번 오류 안내가 함께 포함되며 기존 MSVC/검사 문맥 icon 경고2회는 유지합니다. 실제 앱/사용자 데이터는 그대로입니다. 새 독립ZIP/원격은 다음 단계입니다.

최종 독립 패키지도 **성공**입니다. source `6d48613830f816fc62e5ab7a04c9afbf2dbb3d02`/후보 `export-guidance-candidate-623cd9f7-ba2b-4607-b0cc-5ca8ebc3644b.json`은 원본 WAV 내보내기와 오류 안내 양쪽을 포함하며 새 앱 미실행 상태입니다. 고정3393runtime파일/64,095,466바이트·lock SHA `191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d`를 대조했습니다. ZIP `validation-packages/ae843931-d014-41e2-9637-a82847138045/GuitarLab-validation.zip`은 **3613파일/40,219,404바이트·SHA `47871bfcfba10c8adb87191907058349ba11b8428b494a4bdf59b71f0a562ceb`**입니다. `package_validation.py`/`verify_archive`의 전체SHA·CRC/목록·동일 지문 바이트의 새 추출과 실제 Windows PS5.1 `-File Test-ValidationPackage.ps1` exit0·개발 경로 제외 Python3.12.15 두 번이 성공했습니다. 영수증 `export-guidance-package-receipt-3d3570b2-dd79-423f-b43c-d6a96feafeff.json`/로그 `export-guidance-package-check-e742eade-85d6-4e52-9aad-a46a2f4bbd74.log`를 보존하며 generic portable-candidate/이전 후보는 바꾸지 않았습니다. 실제 앱/개인 파일은 미실행·새 원격은 업로드 후 확인합니다.

최종 Git/원격 검사도 **성공**입니다. 두 출력 후속/패키지 기록을 main `1874417d7f97f8775a6629868931213f91864c9d`까지 push했고 [Windows40183110904](https://github.com/BomJin2/GuitarLab/actions/runs/40183110904)/job121138145977는 **전체 success**입니다.485프론트/105파일·기본240개69.75초/확장243개59.45초(각28개 기본 제외)·예제1+1·AI113개18.78초·도구143개22.701초(제외 없음)·Clippy/MSRV1.90(9.90초)/사후 정리까지 확인했습니다. 결과 확정/빠른 시작 후속 문서는 로컬 커밋에 보존하고 다음 실제 변경 push에 함께 포함합니다. 앱/개인 자료·generic 실행 포인터는 변경하지 않았습니다.

### 4. 미구현 및 알려진 문제

파일 시스템의 실제 실패를 없앤 변경이 아니며, 이미 발생한 실패의 복구 방법을 알립니다. 알 수 없는 오류는 원문/개인 경로를 노출하지 않고 기존 일반 안내를 표시합니다. 기존 비덮어쓰기 저장과 원본 보존은 그대로입니다.

### 5. 다음 작업 계획

전체 프론트 회귀/Windows 내장·독립 패키지·Git 업로드/새 원격 전체 회귀까지 완료했습니다. 두 출력 슬라이스는 구현·검증·문서화를 마쳤지만 실제 앱/개인 데이터 수용과 구분하며 고급 판정의 독립 정답/허위 감점률·특화 분리 가중치/별도Windows의 미완료 조건은 유지합니다. 확인되지 않은 품질을 완료로 바꾸거나 기존 관측 자료만 재튜닝하지 않습니다.

## 후속 — 선택한 음표의 반주 위치로 이동 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 사용자는 편집 시작 후 TAB 선택/화살표와 재생 위치 유지가 정상임을 확인한 뒤, 선택한 음표에 맞춰 반주 위치도 움직이도록 요청했습니다. 이전 전역5초 탐색 충돌 방지는 유지하고 선택한 음표의 싱크 기반 탐색을 추가했습니다. 구현·자동 검사·Windows 실행과 사용자의 ‘클릭·화살표 모두 음표 위치로 이동함’ 응답으로 이번 후속 수용을 완료했습니다. 전체 고급 판정/배포 완료와는 구분합니다.

### 2. 구현 및 변경 사항

- useScoreEditing.ts: 클릭·목록·이전/다음·좌우/Home/End가 호출하는 공통 selectNote에 현재 syncAnchors/startTick 변환과 pause/seek를 연결했습니다. 자동 재생·REC는 시작하지 않습니다.
- 준비된 음원만 탐색하며 loading/empty/error는 상태를 보존합니다. 기존 선택 코드가 로딩 중 pause를 호출해 loading을 paused로 바꾸던 문제도 재현·수정했습니다. null/없는 ID·잠금·편집 전은 탐색하지 않습니다.
- 음원 밖/손상 앵커·미디어 탐색 실패는 고정 안내로 표시하고 선택과 기존 위치를 유지합니다. 배속으로 원곡 ms를 재변환하거나 경계로 강제 보정하지 않습니다.
- ScoreEditor.tsx는 동작 안내만 추가했습니다. 렌더/UI와 독립된 기존 컨트롤러·sync 함수를 재사용하며 신규 의존성·IPC/DB·문서/history/원본/녹음 변경은 없습니다.
- useScoreEditing.test.tsx와 ScoreViewport.test.tsx에 실패/상태 보존 및 실제 컨트롤러·TAB·전역 transport 연결 회귀5개를 추가했습니다. docs/00·04·09·12와 진행 문서를 갱신합니다.

### 3. 테스트 결과

- 변경 전 추가 컨트롤러 테스트:15개 중3개 실패/12개 성공으로 탐색 누락·로딩 상태 변경·오류 안내 누락을 재현했습니다.
- `pnpm test src/features/score/useScoreEditing.test.tsx src/features/score/ScoreViewport.test.tsx src/app/scoreSession.test.tsx src/features/player/TransportBar.test.tsx`: **49개/4파일 성공**,12.93초.
- `pnpm test`: **449개/103파일 성공**,35.47초. 인트로/비선형 싱크·0.5배속·반복/문서/history 불변, 음원 없음/로딩/오류·잠금/없는 ID/null·잘못된 싱크/음원 밖·탐색 실패/재시도를 확인했습니다. 실제 ScoreViewport+컨트롤러+TransportBar의 클릭500ms→Right1000ms→Home0ms는 각각 seek 한 번이며 전역5초 탐색은 추가 호출되지 않습니다. alphaTab 렌더 이벤트 자체는 테스트 대역입니다.
- `pnpm lint`, `pnpm format:check`, `pnpm build`(TypeScript 포함): **성공**. Vite81초/176모듈이며 기존500kB 청크 경고는 유지됩니다.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests`: **3개 성공**,컴파일18.86초. 최신 프론트 내장과 기존 CSP/원격 권한 보호를 확인했습니다.
- `pnpm tauri build --debug --no-bundle --ci --config <새 검증 설정> -- --locked --offline`: **성공**,25.77초. 기존 MSVC 링크·incremental 복사·macOS용 identifier 권고 외 새 오류는 없습니다. 새 실행 파일의 리소스 지문 확인/실제 앱 수용은 별도 기록합니다.
- 실제 사용자 수용: **성공** — 새 ‘GuitarLab · 음표 위치 탐색’에서 사용자가 클릭·화살표 모두 음표 위치로 이동함을 확인했습니다. ‘음표만 바뀌고 위치 유지됨’은 이전 동작 수용이며 새 검사와 구분합니다. Rust/AI 전체 재검사: **미실행** — 관련 소스/계약을 바꾸지 않았습니다.
- 기존 PID30248/PTY22831은 정상 종료 요청을 받아 exit0으로 종료했습니다. 새 PID37656/PTY67859가 READY/응답 중이며 note-seek-candidate.json에 연결했습니다. EXE40,689,152바이트/SHA `f550692d4de191c5f0506b70c0ac2b53a33459f6348948d78aa2e534df4e33de`, 같은 LF runtime3393파일/64,095,466바이트의 복사 전후 지문을 확인했습니다. DB9 읽기 전용 snapshot과 시작 후 사용자 테이블15개 전체 내용/행 지문 동일, 복원 없음도 note-seek-startup-data-comparison.json에 기록했습니다.

### 4. 미구현 및 알려진 문제

실제 반주와 음표의 일치는 사용자가 지정한 싱크 앵커에 따릅니다. 음원 밖 음표를 선택해도 재생 위치를 추측하지 않습니다. 음원이 없는 악보의 MIDI 자동 재생이나 YouTube/녹음 테이크 탐색을 추가한 기능은 아닙니다. 현재 ‘준비 중’이 음원 미선택도 포함하는 표시는 이번 범위에서 유지합니다.

### 5. 다음 작업 계획

현재 앱/UI 소스를 유지하고 새 ZIP/독립 검증 결과와 Git/원격 회귀를 정리합니다. 실제 사용자 수용은 위 완료 결과를 재사용하며 같은 조작을 반복 요청하지 않습니다. 이후 Phase7 독립 참조/Phase8 외부 Windows·출시 수용의 남은 조건은 기존 계획을 따르며 이번 작은 편집 기능 수용을 전체 완료로 확대하지 않습니다.

### 패키지 검사 확정

새 ZIP은 validation-packages/1aa89807-f9cd-4774-bce9-a3493871fc6e/GuitarLab-validation.zip,3613파일/40,161,948바이트/SHA `5b912eb92f470ec1b433f80d7411d30d52106c7e26d376465dd848556704f268`입니다. 빌드 정보 사전 검사·전체 ZIP 지문/CRC·새 roundtrip-240ee5cb… 추출 후 기본PowerShell5.1의 전체 파일 지문/최소PATH 독립Python3.12.15 두 번 실행이 **성공(exit0)**했습니다. 기본 도구 환경의 앞선 두 실행은 Get-FileHash 명령을 찾지 못해 실패했으며 PSModulePath 제거만으로 해결되지 않았습니다. 일반 Windows 환경의 동일한 패키지/스크립트 재실행으로 통과했고 제품/검사 스크립트를 완화하지 않았습니다. 정확한 환경 내부 원인은 미확정입니다.

note-seek-package-roundtrip.json에 실패 이력과 성공을 구분했습니다. 사용자 수용된 note-seek-candidate.json을 현재 portable-candidate.json으로 연결하고 이전 portable 영수증은 별도 파일로 보존했습니다. 실제 모델 설치·새OS·서명/최종 배포 검사는 **미실행**이며 현재 앱/개인 데이터/모델은 이 패키지 검사로 바꾸지 않았습니다.

Git 구현/검증 문서는 `4a31712`로 main에 push했습니다. 새 원격 CI 결과는 확인 전이며 이전444개 원격 성공과 이번449개 로컬 검증/실제 사용자 수용을 구분합니다. 두 검증 후보 영수증도 구현 커밋에 연결했습니다.

## 후속 — 저장/프로젝트 재열기 후 작업 화면 유지 (2026-10-23)

### 1. 작업 개요

작업 날짜2026-10-23. 트랙 순서 이동·Undo/Redo·저장 복원을 사용자가 수용한 뒤, 저장 후 카피 화면이 연습/연주로 바뀌지 않도록 요청했습니다. 저장 자체에는 경로 변경이 없고 이어 누른 같은 프로젝트 재열기에서 생성 모드로 이동하는 원인을 확인했습니다. 현재 수정 검증/Windows 적용 중입니다.

최종 갱신: 전체 자동 검사·Windows 적용/데이터 보존 후 사용자가 ‘ㅇㅇ 되는거 같은데’로 카피 화면 유지를 확인했습니다. 이 화면 유지 수정은 검증·문서화 완료이며 아래 진행 중/미실행은 해당 시점 이력입니다. 전체 로드맵/새 배포 패키지 완료를 뜻하지 않습니다.

### 2. 구현 및 변경 사항

- docs/12에 저장/같은 프로젝트 재열기의 화면 유지 계약을 먼저 정의했습니다.
- `src/features/library/useProjects.ts`: 같은 프로젝트를 카피/연습/연주에서 다시 여는 요청만 화면을 유지합니다. 라이브러리 열기/다른 프로젝트 열기는 기존 생성 모드를 따르며, 읽기 대기 중 다른 화면으로 이동해도 끌어오지 않습니다.
- `useProjects.test.tsx`: 세 모드의 저장·재열기 유지와 라이브러리 진입, 실패/취소/늦은 성공의 화면 보존 회귀를 추가했습니다. 새 옵션/전역 상태·IPC/DB/모델·실제 저장 데이터는 변경하지 않습니다.

### 3. 테스트 결과

- 수정 전 새 회귀3개 모두 재열기 경로 검사에서 실패했고 기존17개는 통과했습니다. 저장 직후 화면은 이미 유지됨을 함께 확인했습니다.
- 수정 후 관련21개/2.63초와 타입 검사 **성공**. 전체436개/102파일27.75초, lint·타입/Vite1분8초·format 검사 **성공**입니다. 기존500kB 청크 안내는 유지합니다.
- 중단 전 문서 작성 도구 호출은 사용량 한도로 자동 승인 검토를 완료하지 못해 실행되지 않았습니다. 재개 후 파일/Git 상태를 확인해 문서를 작성하고, 이미 성공한 전체 검사를 불필요하게 반복하지 않았습니다.
- 앞선 트랙 순서 소스9245feb의 CI39935960081은 전 단계 success이며 사용자 순서/저장 복원 수용도 완료했습니다. 이번 화면 유지 수정의 CI와 구분합니다.

### 4. 미구현 및 알려진 문제

수정본의 Windows 사용자 수용·새 ZIP/installer·별도 OS는 **미실행**입니다. 기존 ZIP은 화면 유지 수정 전 버전입니다. 기존 미저장 교체 확인·재생/악보 복원·원본/불변 revision 정책은 유지합니다. Rust/Python 전체 재검사는 제품 코드가 변경되지 않아 이번 로컬 범위에서 **미실행**이며 내장 자산 검사는 따로 수행합니다.

### 5. 다음 작업 계획

내장 자산/Windows 빌드를 확인하고 현재 앱의 정상 종료 후 새 고정 후보를 적용합니다. DB/모델 보존·실제 카피 화면 유지 수용을 구분해 기록하며 확인 중 앱을 재실행하지 않습니다.

### 최종 Windows 적용/수용

- 내장 `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`3개/컴파일37.58초, 고정 설정의 `pnpm tauri build --debug --no-bundle --ci --config ...workspace-stay-60e2c587-225b-4e3a-a60f-e28ef3a54202.conf.json -- --locked --offline`24.63초 **성공**. 기존 hardlink 복사·linker/식별자 안내는 유지합니다.
- EXE40,688,128바이트/SHA256 `c6a4accff143e5a19b419c1664a817b2b000077b3b4bdc935bf39c509b6c01a9`, runtime3393개 전체 지문 확인. 기존33280 제어 세션은 이미 EXITED0/forced=false였고 권한 있는 읽기 조회에서도 다른 앱을 찾지 못해 중복 실행하지 않았습니다. 새 **PID24920·PTY11472·‘GuitarLab · 저장 후 화면 유지’** READY/응답, 실제DB9/16테이블·4모델 marker 전후 동일을 확인했습니다. 개인 입력/REC는 시작하지 않았습니다.
- 사용자에게 카피에서 저장→프로젝트 다시 열기 후 화면 유지를 확인받았습니다. 사용자의 응답은 ‘ㅇㅇ 되는거 같은데’이며 추가 재실행 없이 현재 앱을 유지합니다. 연습/연주와 실패/취소/늦은 응답은 자동 회귀로 검사했습니다.
- 최신 후보는 workspace-stay-candidate.json/portable-candidate.json입니다. 새 ZIP/installer·별도 Windows·실제 장치 재검사는 **미실행**이며 이전 순서 변경 ZIP을 이번 수정 버전으로 안내하지 않습니다. Git 반영 후 이번 소스 원격 CI는 별도 추적합니다.
- 소스/문서를1c1f874d4b499cb5c605ccf4f33cfe267c278dee로 main에 push했습니다. [CI39958606255](https://github.com/BomJin2/GuitarLab/actions/runs/39958606255)는 진행 중이며 최종 결론은 아직 대기입니다.

## 후속 — 악보 트랙 표시 순서 변경 (2026-10-23)

최종 수용 갱신: 사용자가 순서 이동·같은 선택·Undo/Redo·저장/재열기에 ‘ㅇㅇ 되는데’로 답했고, 소스9245feb의 CI39935960081도 전 단계 success입니다. 순서 변경 후속은 이 범위에서 완료하며 아래 대기는 이전 이력입니다. 이어 제기한 저장/재열기 화면 이동은 위 별도 후속에서 수정합니다.

### 1. 작업 개요

작업 날짜2026-10-23. 앞선 트랙 Undo 선택 실패 수정/사용자 수용 이후 F-06 트랙 설정과 docs/04 표시 순서 모델을 보완합니다. 현재 구현·검증 중이며 전체 Phase/릴리스 완료로 표시하지 않습니다.

### 2. 구현 및 변경 사항

- docs/12에 MOVE_TRACK {trackId,targetIndex} 계약을 먼저 정의했습니다. 새 IPC/DB/의존성은 없습니다.
- `scoreStructure.ts`: 유효한 ID/정수·범위/다른 최종 위치를 검증하고 tracks 배열 순서만 변경합니다. 트랙/음표와 시간/싱크 객체는 유지하고 렌더 왕복 검증/이력은 공통 컨트롤러를 사용합니다.
- `ScoreStructureEditor.tsx`: 기존 공통 스타일의 위/아래 버튼과 순서 표시만 추가합니다. 맨 위/아래·녹음/파일 작업 잠금은 차단합니다. 드래그/새 상태 저장 구조를 추가하지 않습니다.
- 도메인/훅/App 회귀는 앞뒤 이동·잘못된 값·단일 트랙·ID/음표/원본·저장 버전 보존·같은 선택/Undo/Redo·독립 원본/렌더 인덱스를 검사합니다.

### 3. 테스트 결과

- `pnpm test src/features/score/scoreStructure.test.ts src/features/score/useScoreEditing.test.tsx src/app/scoreSession.test.tsx`:40개/3파일15.63초 성공, 타입 검사 성공입니다.
- 전체 `pnpm test`:432개/102파일29.27초 **성공**. `pnpm lint`·`pnpm build`의 타입/Vite1분3초·`pnpm format:check` 성공입니다. 기존500kB 청크 안내는 유지합니다.
- 실제 개발 브라우저에서 자체 악보에 추가한 트랙/프렛5를 위로 이동→같은 ID/선택/프렛5·변경된 목록 순서→Undo/Redo→아래/위 이동을 확인했습니다. 맨 위/아래 버튼 상태와 기존 음표를 유지했습니다. 증거 `track-order-browser-20261023.png`는 target/runtime-validation에 보존합니다. 개인 프로젝트/입력/REC는 사용하지 않았습니다.
- Windows·최신 패키지 검사는 진행 중이며 사용자 저장/재열기 수용·새 installer/별도 OS는 **미실행**입니다. Rust/Python 제품 코드/계약 버전은 변경하지 않아 이번 로컬 전체 재검사는 **미실행**이며 내장 UI 검사와 해당 소스의 원격 CI를 별도로 추적합니다. 현재 앱은 수용 완료한 Undo 수정본을 유지합니다.

### 4. 미구현 및 알려진 문제

단성6줄 편집 범위만 지원하며 화음/고급 주법·트랙 드래그 이동은 미구현입니다. 순서 변경은 악보 편집본에만 적용하고 오디오 stem/믹스/테이크를 바꾸지 않습니다. 별도 Windows/최종 배포·실제 고급 판정 품질은 미완료입니다.

### 5. 다음 작업 계획

회귀·실제 렌더/선택을 확인하고 전체 검사 후 새 고정 Windows 후보와 데이터 보존을 검증합니다. 앞선 Undo 수정 CI가 끝나기 전 새 코드 push로 취소하지 않고, 순서 변경 저장/재열기와 사용자 수용을 구분해 기록합니다.

### Windows/패키지 확인

- 내장 `bundle_tests`3개/컴파일15.60초와 `pnpm tauri build --debug --no-bundle --ci --config ...track-order-e78447dd-2a17-4839-bd61-f7175829e62b.conf.json -- --locked --offline`21.00초 **성공**. 기존 hardlink 복사·linker/식별자 안내는 유지합니다.
- EXE40,688,128바이트/SHA256 `aa74d4be5521c0200f2f76ce02b0d30882c1a076eadb9d87d5a5a499a3e858cc`, runtime3393개 전체 지문 확인. 기존30504 정상 종료 요청 accepted=true·exitCode=0·forced=false 뒤 **PID33280·PTY48588·‘GuitarLab · 트랙 순서 변경’** READY/응답을 확인했습니다. 새 백업 기준 실제 DB9/16테이블·모델4marker 전후 동일이며 입력/REC를 시작하지 않았습니다.
- 새 ZIP3613파일/39,983,745바이트/SHA256 `a9aa7850271ccf272b810c1f2adbd1e5e1bb3052572dda63151d56f4d4d9c45b`: 전체 지문·새 UUID 폴더 추출/재검사와 기본PowerShell5.1 종료0·개발 PATH 없는 독립 Python3.12.15 실제2회 **성공**. validation-packages/37036a63-f161-4b1e-9503-7bc4f789ac78에 보존하고 모델/개인 데이터는 제외합니다.
- 사용자에게 순서 이동/같은 선택·Undo/Redo·저장/재열기 확인을 요청했고 현재 앱과 UI 소스를 유지합니다. 실제 수용 응답·이번 소스 CI는 대기이며 별도Windows/새 installer는 **미실행**입니다.
- 소스/문서를9245febf38d72bdcc67a1307104fbe3f822d7422로 main에 push했습니다. [새 CI39935960081](https://github.com/BomJin2/GuitarLab/actions/runs/39935960081)는 진행 중입니다. 앞선 Undo 수정 e218754의 CI39933861827은 전 단계 success로 끝난 뒤 업로드했으며 이전 검사를 취소하지 않았습니다. 사용자 순서 변경 수용 응답은 아직 대기입니다.

## 사용자 실패 후속 — 삭제 Undo의 복구 트랙 선택 (2026-10-23)

### 1. 작업 개요

작업 날짜2026-10-23. 사용자가 트랙 삭제 후 활성화된 되돌리기를 눌러도 트랙이 복구되지 않는다고 보고한 후속입니다. 현재 수정·검증 중이며 기존 Windows 후보를 수용 완료로 기록하지 않습니다.

최종 갱신: 수정본의 자동/브라우저·Windows/데이터 보존·패키지 검증과 사용자의 ‘ㅇㅇ 이제 잘댐’ 복구/자동 선택 수용까지 완료했습니다. 아래 진행 중/대기는 당시 이력이며 전체 로드맵 완료를 뜻하지 않습니다.

### 2. 구현 및 변경 사항

`useScoreEditing.ts`의 공통 apply에서 이전 문서에 없던 ID가 복구되면 해당 트랙을 즉시 선택합니다. 삭제 Undo와 트랙 추가 Redo 모두 같은 ID의 복구된 트랙을 보여주고, 음표/이름 변경 등 트랙 목록이 같은 편집은 현재 선택을 유지합니다. 명시적으로 지정한 선택이 우선합니다. docs/12 계약을 먼저 갱신했고 훅/App에 사용자와 같은 추가→삭제→Undo 회귀를 추가했습니다. DB/IPC/의존성·원본 및 저장 정책은 변경하지 않습니다.

### 3. 테스트 결과

- 수정 전 새 훅 회귀는 트랙 존재 검사에는 통과하고 활성 ID 검사에서 실패했습니다(1실패/9성공). 데이터 복구와 화면 선택을 구분해 재현했습니다.
- 수정 후 관련 훅/App27개/2파일14.98초·타입 검사 성공입니다. 기존 트랙 추가 Redo 회귀는 이전의 첫 트랙 선택 기대 때문에 실패했으며, 복구한 트랙을 선택하는 새 계약과 같은 ID 검사로 갱신했습니다.
- 전체 `pnpm test`428개/102파일28.87초, `pnpm lint`·`pnpm build`의 타입/Vite1분1초·`pnpm format:check` **성공**입니다. 기존500kB 청크 안내는 유지합니다. 문서는 Prettier 검사 대상이 아니며 별도로 검토합니다.
- 실제 개발 브라우저에서 자체 악보→트랙 추가→프렛3 음표→추가 트랙 삭제→Undo 시 같은 ID/2개 목록/활성 선택·프렛3을 확인했습니다. Redo 재삭제→Undo 재복구도 성공했습니다. 증거 `track-undo-selected-browser-20261023.png`는 target/runtime-validation에 보존합니다(Git 제외). 개인 프로젝트·입력/REC를 사용하지 않았습니다.
- 수정 전 소스6a0d7d8의 Windows CI39930532852는 기본/확장 native·Python·MSRV를 포함한 전 단계 success입니다. 사용자 실패나 이번 수정의 검증을 대신하지 않습니다.

### 4. 미구현 및 알려진 문제

수정본의 Windows 사용자 수용·별도 OS/installer 검사는 **미실행**입니다. 현재 실행 중인 이전 후보 receipt는 USER_REPORTED_UNDO_SELECTION_FAILURE로 구분합니다. 편집 이력은 기존처럼 실행 중인 세션에 한정되며 프로젝트를 다시 열면 초기화됩니다.

### 5. 다음 작업 계획

전체 회귀·타입/lint/빌드·실제 브라우저의 복구 트랙 선택을 확인한 뒤 새 고정 Windows 후보를 정상 종료 방식으로 적용합니다. 사용자 데이터/모델 보존과 수정 후 수용을 별도로 기록하고 다음 로드맵 작업을 계속합니다.

### 수정 Windows/패키지 적용 결과

- `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`:3개 성공·컴파일15.81초. `pnpm tauri build --debug --no-bundle --ci --config ...track-undo-1b85373b-4601-45d3-907a-2c0a234eea61.conf.json -- --locked --offline`:20.55초 성공. 기존 증분 캐시 hardlink 복사·linker/식별자 안내는 유지합니다.
- `track-undo-candidate.json`: portable1b85373b-4601-45d3-907a-2c0a234eea61, EXE40,687,616바이트/SHA256 `290e789671997c5d645b8bf0965f7553334f31b11bb30d5c782bfe64f663bd76`. runtime3393개 전체 크기/지문 확인, 기본 모니터 꺼짐/고급 실시간 채점 꺼짐 유지입니다.
- 기존28196 정상 종료 요청 accepted=true·exitCode=0·forced=false 뒤 **PID30504·PTY39065·‘GuitarLab · 트랙 되돌리기 수정’** READY/응답을 확인했습니다. 개인 입력/REC를 시작하지 않았고 새 백업 기준 실제 DB9/16테이블과4모델 marker는 전후 동일합니다. 일반 샌드박스의 DB 읽기 첫 시도는 unable to open database file로 실패해 권한 있는 읽기 전용 조회로 점검했습니다. DB 내용은 변경하지 않았습니다.
- 새 ZIP3613파일/39,982,979바이트/SHA256 `8a496a99d9f5fcfdc0cea67493868a9275d7fd502579ce8363d7352e7e461027`: 전체 목록/내용 지문·새 UUID 폴더 추출 후 재검사 성공입니다. 실제 기본 PowerShell5.1 점검 종료0, 개발 PATH 제외·독립 Python3.12.15 실제2회 성공입니다. validation-packages/bf17d34d-d5bc-492b-9c60-3e7ecb40e970에 보존하며 모델/개인 DB·녹음을 포함하지 않습니다.
- 사용자에게 새 앱에서 같은 추가→삭제→Undo의 복구/자동 선택 확인을 요청했고 응답 대기 중입니다. 현재 앱과 UI 소스를 유지합니다. 실제 사용자 재수용·이번 수정 커밋의 원격 CI·별도 Windows/새 installer는 **미실행/대기**이며 이전 소스의 CI success와 구분합니다.
- 후속 응답으로 사용자가 ‘ㅇㅇ 이제 잘댐’을 확인했습니다. 삭제 트랙 복구/자동 선택은 실제 수용 완료이며 현재 PID30504/PTY39065를 유지합니다. 이번 수정 커밋의 원격 CI는 별도 추적하고, 별도 Windows/새 installer·실제 장치 재검사는 **미실행**입니다.
- 원격 [CI39933861827](https://github.com/BomJin2/GuitarLab/actions/runs/39933861827)도 모든 단계/사후 정리 success를 확인했습니다. 프론트428개·기본Rust228/확장231개(각26개 환경 의존 제외)·Python113/도구66개·최소Rust1.90 컴파일까지 통과했습니다. 후속 트랙 순서 후보로 전환한 현재 앱은 위 첫 절을 따르며 버그 수정의 완료 기록은 유지합니다.

## 후속 — 악보 트랙 삭제/복구와 독립 원본 비교 (2026-10-23)

### 1. 작업 개요

F-06 트랙 관리에서 선택 트랙을 편집본에서 제거하고 기존 Undo/Redo로 복구하는 후속입니다. 작업 날짜2026-10-23, 소스·자동/개발 브라우저 검증 완료이며 Windows 적용/최종 패키지 결과는 아래 후속 기록에 구분합니다. 전체 로드맵/고급 편집 완료를 의미하지 않습니다.

### 2. 구현 및 변경 사항

- `src/features/score/scoreStructure.ts`: REMOVE_TRACK 명령. 명시적 discardNotes=true·존재하는 ID·최소1트랙을 검증하고 선택 트랙/음표만 제외한 새 문서를 만듭니다. 원본·나머지 ID/음표·역할/튜닝·템포/박자/싱크는 보존합니다.
- `ScoreStructureEditor.tsx`: 현재 트랙과 음표 제거 확인을 거친 버튼만 활성화합니다. 이름/음표/튜닝·역할 변경과 트랙 이동 시 재확인하며, 내용이 같은 부모 갱신으로는 확인이 사라지지 않습니다. 마지막 트랙과 잠금 상태를 차단합니다.
- `ScoreEditor.tsx`, 새 `OriginalScoreComparison.tsx`: 트랙 삭제 후 편집본 인덱스를 원본 인덱스로 오해하지 않도록 읽기 전용 원본에 독립 트랙 선택기를 제공합니다. 편집·저장 문서와 무관하며 최초 원본의 트랙 목록을 그대로 봅니다.
- 기존 useScoreEditing의 검증 후 apply/history·안전한 활성 트랙 선택·정지/epoch를 재사용합니다. 원본 파일·이전 revision·stem/테이크/연습 기록을 삭제하지 않고 새 IPC/DB/의존성을 추가하지 않았습니다.
- `scoreStructure.test.ts`, `useScoreEditing.test.tsx`, `src/app/scoreSession.test.tsx`: ID/시간·원본/저장 버전 보존·잘못된 확인/마지막/없는 ID 거부·잠금·같은 ID Undo/Redo·선택 복귀·확인 갱신/독립 원본을 검증했습니다. docs/04·08·09·12와 진행 문서를 갱신합니다.

### 3. 테스트 결과

- 관련34개/3파일 성공(12.38초), 타입 검사 성공.
- 최종 `pnpm test`:426개/102파일/29.47초 성공. `pnpm lint`·`pnpm build`의 타입 검사/Vite63초·`pnpm format:check` 성공. 기존500kB 초과 청크 경고는 유지합니다.
- 실제 개발 브라우저: 자체8음 원본에 별도 트랙/프렛3 음표 추가→최초 트랙 삭제 후 남은 프렛3 보존·마지막 트랙 차단→Undo 시 같은2개 ID→Redo로 재삭제와 최초 원본8음 표시/목록 보존·오류 없음 확인. 증거는 target/runtime-validation의 `track-remove-guard-browser-20261023.png`, `track-remove-original-browser-20261023.png`입니다(Git 제외).
- 검증 중 기존 개발 서버가 종료돼 ERR_CONNECTION_REFUSED가 났습니다. 비어 있는1421 포트를 확인해 검증 서버만 다시 실행하고 새 탭에서 정상 로드했습니다. 고정 앱/보안 설정을 바꾸지 않았습니다. 실패 페이지의 data URL은 도구 정책상 읽지 않고 정상 localhost URL로 새 검증 탭을 열었습니다.
- 새 Windows 빌드/실행·기존 데이터 보존·이번 변경의 GitHub CI/ZIP은 진행 중이며 결과를 아래 추가합니다. 실제 사용자 프로젝트 저장/재실행 복원·녹음 동시 조작·별도 OS/새 installer는 **미실행**입니다. JSON과 실제 alphaTab 렌더 왕복은 자동 검사로 확인했으며 실제 사용자 저장 수용과 구분합니다.

### 4. 미구현 및 알려진 문제

- 기본6줄 단성 편집 지원 범위만 유지합니다. 트랙 재정렬·화음/고급 주법 편집은 미구현입니다.
- 삭제는 현재 편집본/history에 적용하며 저장은 기존 수동/선택적 자동 저장 정책을 따릅니다. 원본/이전 저장본을 제거하는 영구 삭제 기능이 아닙니다.
- 원본 비교는 열 때 첫 트랙으로 시작하고 사용자가 별도로 선택합니다. 편집본의 트랙 선택과 자동 대응하지 않습니다.
- 별도 Windows/특화 AI·실제 고급 주법 품질·최종 배포 미완료는 유지합니다.

### 5. 다음 작업 계획

현재 후보의 내장 UI/Windows 실행·DB/모델 보존과 새 ZIP을 확인하고 소스/문서를 Git에 보존합니다. 이후 기존 로드맵의 남은 수용 항목을 순차 검토하며 미검증 항목을 완료로 표시하지 않습니다.

### 최종 Windows 적용 기록

- 내장 bundle/권한 정책3개 성공(컴파일12.85초), 최종 Windows 빌드16.73초 성공. 기존 linker/bundle identifier 경고는 유지했습니다.
- `track-remove-candidate.json`: portable UUID `6662fd9f-372a-444d-9d6a-2ba605452a09`의 EXE40,687,616바이트·SHA256 `d14e3a8736992df686f084c04d8d5ea48e9646e415c87574357def4148801821`, runtime3393개 전체 크기/지문 확인.
- 기존 PID4992에 정상 종료 요청 accepted=true·exitCode=0·forced=false를 확인한 뒤 새 **PID28196·PTY63814·‘GuitarLab · 악보 트랙 삭제와 복구’** READY/응답을 확인했습니다. 입력/REC를 자동 시작하지 않았고 실제 DB9/16테이블·4모델 marker 지문도 전후 동일합니다. 현재 앱을 유지합니다.
- 소스 `6a0d7d866e8f2ff873fc8eefd613530026bd8180`를 main에 push했습니다. [Windows CI39930532852](https://github.com/BomJin2/GuitarLab/actions/runs/39930532852)는 최초 조회 앱 기본 회귀 진행 중이며 최종 결론은 대기입니다. 앞선 마디 반복 CI success를 이번 커밋에 대신 적용하지 않습니다.
- 새 검증 ZIP3613파일/39,983,535바이트·SHA256 `45c79447e6122bffd253547c5b538982768bc1934cbce17ec05e6bd42ddd642e`의 전체 목록/내용 지문·새 폴더 추출 후 재검사 성공입니다. `validation-packages/90826133-eecf-4f65-8d37-86f8debd577e/GuitarLab-validation.zip`, 모델/개인 데이터 제외. 기본 PS5.1/독립 Python 검사는 후속 결과에 구분합니다.
- 새 추출본의 실제 기본 PowerShell5.1 검사도 **종료0 성공**했습니다. 전체3613파일 지문·개발 PATH 제외·모델 미설치 응답과 독립 Python3.12.15 실행2회를 확인했습니다. 새 PC/모델 추론 수용으로 확대하지 않습니다.
- 실제 사용자 저장 프로젝트의 삭제/저장/재실행 수용과 실제 녹음 동시 조작·별도 OS/installer는 **미실행**입니다. 원본/저장 revision 보존·JSON/alphaTab 왕복과 UI 연결은 자동 검사, 실제 삭제/Undo/Redo는 개발 브라우저 검사입니다.
- 새 앱에서 테스트 트랙 추가→삭제 확인/삭제→Undo 복귀의 짧은 사용자 수용을 비동기로 요청했습니다. 응답 대기 동안 현재 앱과 UI 소스는 유지하고 CI/문서 작업만 계속합니다. 사용자 미응답을 수용 성공으로 기록하지 않습니다.

## 박자 영역 선택 패키지 검증 완료 — 2026-10-23

### 1. 작업 개요

사용자가 수용한 숫자 아래 줄/세로선 선택 실행본의 배포 검증 ZIP을 새 폴더에서 확인했습니다. 작업 완료 날짜2026-10-23. 아래 구현/회귀·Windows 수용 기록은 유지하며 전체 Phase8 배포 완료와 구분합니다.

### 2. 구현 및 변경 사항

제품 소스는 변경하지 않았습니다. 같은 EXE 지문을 담은 새 검증 ZIP과 별도 추출본만 생성했고, 제외되는 개인 녹음/DB·모델 가중치를 추가하지 않았습니다. beat-selection-package-roundtrip.json과 실행 후보 receipt에 실제 성공 결과를 기록했습니다.

### 3. 테스트 결과

- ZIP3613파일/39,979,417바이트·SHA256 `51c2e12d39f4f749fac348f217c591541de3ae6338872828699823db7cd34d41`: 전체 manifest·경로/링크·CRC/파일 지문과 새 UUID 폴더 추출 후 각 파일 비교 **성공**.
- 새 추출본의 `WindowsPowerShell/v1.0/powershell.exe -NoProfile -NonInteractive -File .../Test-ValidationPackage.ps1`: **종료0 성공**. 전체 파일 지문과 개발 도구 경로를 제외한 독립 Python3.12.15 실제2회 실행을 확인했습니다.
- 앱/모델 재실행·추론 검사는 **미실행** — 패키지 검사만 수행했고 사용자 수용 앱을 유지했습니다. 새 NSIS·Defender·서명/별도Windows 수용은 **미실행** — 이 ZIP 검사와 별개입니다.

### 4. 미구현 및 알려진 문제

현재 PC의 새 폴더 검증이며 다른 Windows의 시스템 DLL/WebView2 조건이나 최종 서명 배포를 보장하지 않습니다. 아래 직전 ZIP/최신 ZIP 미실행 기록은 이 완료 전 이력입니다.

### 5. 다음 작업 계획

원격 CI의 수정 커밋 전체 결과를 확인하고 독립적인 로드맵 기능/안정성 작업을 계속합니다. 현재 수용 앱과 사용자 데이터는 유지합니다.

## 숫자 아래 박자 영역 선택 완료 — 2026-10-23

### 1. 작업 개요

완료 날짜2026-10-23. 사용자가 기존 숫자/오른쪽 화살표 선택을 수용한 뒤 ‘숫자 아래 줄도 클릭’하도록 요청한 작은 기능 후속입니다. 구현·회귀/Windows 시작·데이터 보존과 사용자 ‘ㅇㅇ 댐’ 수용까지 완료했습니다. 전체 Phase6B/7/8 완료와는 별도입니다.

### 2. 구현 및 변경 사항

ScoreViewport는 alphaTab1.6.1 공개 beatMouseDown만 구독해 단음이1개인 박자의 줄/세로선/숫자 영역을 선택합니다. 기존 도메인 Note 매핑/반복·트랙/옛 렌더 거부를 재사용하고 쉼표/여러 음의 박자는 추측하지 않습니다. noteMouseDown의 중복 처리와 includeNoteBounds 추가 계산을 없앴고 콜백/잠금 변경만으로 악보 전체를 다시 만들지 않습니다. ScoreEditor 안내, ScoreViewport.test.tsx의 실제 beat 객체 이벤트/쉼표/화음/최신 콜백·해제/키보드 회귀, docs/04·09·12와 진행/로드맵을 수정했습니다. 원본/DB·IPC/모델·의존성/디자인 토큰은 바꾸지 않았습니다.

### 3. 테스트 결과

- `pnpm test src/features/score/ScoreViewport.test.tsx src/app/scoreSession.test.tsx`:18개/2파일10.59초 **성공**.
- 전체 `pnpm test`:411개/98파일33.83초 **성공**. 타입·전체lint/포맷·`pnpm build` **성공**, Vite1분13초/main1,589.26kB·gzip423.91kB(기존 청크 안내 유지).
- 최신dist `cargo test --locked --offline --all-features ... bundle_tests`:3개/0.01초·컴파일16.52초 **성공**. 고정 Windows `pnpm tauri build --debug --no-bundle --ci --config ...beat-selection-4b7b2cac-d3a5-4d36-93a6-126e288d456e.conf.json -- --locked --offline`:22.51초 **성공**.
- 실제 개발 브라우저에서 숫자3 아래 줄 영역을 눌러2번/tick960/3프렛 선택을 확인했습니다. Windows 사용자도 같은 아래 줄/세로선 클릭·숫자/오른쪽 화살표 유지가 정상이라고 확인했습니다. 브라우저 첫 navigation timeout은 렌더 준비 후 같은 탭의 정상 상태를 읽어 해소했으며 새 네트워크 허용/개인 업로드는 하지 않았습니다.
- 이전 PID16228/PTY83891의 정상 CloseMainWindow/EXITED0/forced=false 후 새PID33044/PTY28650·‘GuitarLab · 박자 영역 선택’ READY/응답을 확인했습니다. EXE40,686,080바이트/SHA `6f983765e15e60dd5cf915f3828c820f1ced377aaadc0a165b08515162d61512`, runtime3393개 전체 지문·새 백업/실제DB9/16테이블·4모델 marker 동일입니다. 기본 모니터 꺼짐/REC 미시작을 유지했습니다.
- 숫자 전용 직전 ZIP3613파일/39,979,817바이트/SHA9ee90cd5…는 전체 지문/CRC·새 추출·기본PS5.1/독립Python2회 성공했습니다. **박자 확장 최신 ZIP/새 NSIS/Defender/서명·별도Windows 검사는 미실행** — 직전 결과를 소급하지 않고 후속으로 검사합니다. Rust/Python 제품 전체 재검사는 **미실행** — 제품 코드가 변하지 않았으며 CI/테스트 fixture 변경은 PHASE-08 별도 절을 따릅니다.

### 4. 미구현 및 알려진 제약

한 박자에 여러 음이 있는 화음·쉼표를 클릭해 새 음표를 만드는 기능은 미구현입니다. 기본 단성 편집 한도와 alphaTab의 박자 영역 hit test를 따릅니다. 원본 비교/연습·연주는 편집 선택하지 않고 선택은 저장하지 않습니다. UI 리디자인과 다른 악보 표기 방식의 hit test 수용은 후속입니다.

### 5. 다음 작업 계획

현재 수용된 PID33044/PTY28650 앱을 유지하고 beat-selection-candidate.json/portable-candidate.json에 수용을 기록합니다. 최신 ZIP 검증과 GitHub CI의 Python3.13 테스트 fixture 문제를 마무리한 뒤 진행 가능한 기능/안정성 작업을 계속합니다. 별도Windows·특화 모델/실제 주법 참조는 해당 항목만 보류합니다.

## TAB 선택 Windows 후보 적용 — 2026-10-23

최신dist로 `pnpm tauri build --debug --no-bundle --ci --config ...tab-selection-10ed0e65-9235-47d6-94e4-456eb16cfd32.conf.json -- --locked --offline`가24.71초 성공했습니다. 검증runtime3393파일/64,095,996바이트의 전체 지문·링크/경로를 확인해 새portable에 복사했고 EXE40,685,568바이트/SHA `3524d1690bf80b43f753a3661d61e02e851f0a7161e50705a51878e9df3493c3`를 기록했습니다. 기존 앱은 권한 있는 읽기 조회에서 관측되지 않아 종료/강제 종료하지 않았습니다.

제어PTY83891/PID16228·‘GuitarLab · TAB 음표 선택’의 정확한 제목/READY/응답을 확인했습니다. 새 백업과 비교한 실제DB9/16테이블의 행수/전체 지문·4모델 marker는 동일합니다. tab-selection-candidate.json/portable-candidate.json은 WINDOWS_RUNNING_ACCEPTANCE_PENDING이며 기본 모니터 꺼짐·실시간 고급 채점 비활성·입력/REC 미시작을 유지합니다. 사용자에게 프로젝트 없는 자체 악보 숫자3 클릭→목록/프렛 및 오른쪽 화살표 이동만 요청했으며 실제 수용은 응답 대기입니다. 확인 동안 이 앱과 UI 소스를 유지하고 독립적인 CI/패키지를 검사합니다.

이 절은 아래 소스 정리의 새 Windows 적용 미실행 상태를 갱신합니다. 사용자 실제 선택·새 ZIP/설치기/별도Windows 수용은 아직 완료가 아닙니다. 기본5절 구현/변경 파일·자동 테스트·제약/다음 계획은 바로 아래 소스 정리 절을 따릅니다.

## TAB 클릭·키보드 선택 소스 정리 — 2026-10-23

### 1. 작업 개요

2026-10-22~23 F-06의 클릭/키보드 선택을 구현하고 사용자 요청에 따라 현재 소스를 Git 업로드용으로 정리합니다. 기본 편집 완료 상태는 유지하되 이 후속의 새 Windows 실행본 수용은 미완료로 구분합니다. 외부 자료/별도 Windows 대기는 해당 검증만 보류하며 독립 개발을 멈추는 사유가 아닙니다.

### 2. 구현 및 변경 사항

- scoreNoteSelection.ts: 현재 alphaTab model.Note 객체·선택 트랙/마디/beat와 실제 길이·음정/운지를 도메인 ID에 매핑합니다. 원본 반복은 재생 tick에 가까운 occurrence, 동률은 앞쪽이며 불일치/모호한 중복·옛 렌더는 무시합니다.
- useScoreEditing.ts: 현재 원본 바이트/트랙에 한정한 임시 선택, 공통 selectNote/moveSelection을 추가했습니다. 선택은 저장·history·revision을 바꾸지 않고 잠금/없는 ID·새 음표·삭제/Undo·다른 원본을 검사합니다.
- ScoreViewport.tsx: 설치 alphaTab1.6.1 공개 noteMouseDown/includeNoteBounds를 사용합니다. 자체 player/seek를 켜지 않으며 숫자 클릭은 악보에 초점을 둡니다. 악보 자체 초점의 좌우/Home/End만 처리하고 조합 키/입력칸을 가로채지 않습니다. 기존 내부 커서/스크롤을 재사용합니다.
- ScoreEditor/ScoreWorkspace: 목록·이전/다음 버튼·실제 숫자 클릭/키보드와 선택 속성·정지 커서를 연결했습니다. 미적용 폼 소실을 알리고 연습·연주·원본 비교는 읽기 전용으로 유지합니다. core 도메인/저장/AI/Rust/Python을 UI에 옮기거나 새 의존성을 추가하지 않았습니다.
- 회귀 파일: scoreNoteSelection.test.ts, useScoreEditing.test.tsx, ScoreViewport.test.tsx, app/scoreSession.test.tsx. docs/04·09·12·08과 진행 요약에 계약·검사/미실행 범위를 기록합니다.

### 3. 테스트 결과

- 대상26개/4파일 성공 후 키보드 대상11개/2파일 성공. 전체 pnpm test는 최종410개/98파일 성공(2026-10-22 30.76초, 업로드 전2026-10-23 재검사29.96초)입니다. pnpm typecheck/lint/format:check 성공입니다.
- pnpm build 성공: 최종 Vite1분6초, main1,589.20kB/gzip423.89kB. 기존500kB 청크 경고는 남아 있습니다.
- 실제 개발 브라우저: 자체 악보→편집 시작→TAB 두 번째 숫자 클릭 시 목록2번/tick960/프렛3 및 커서 연동, Right로3번/5프렛, End로8번/7프렛, Home으로1번/0프렛을 확인했습니다. 브라우저 실제 SVG 이벤트이며 mocked 렌더 회귀와 구분합니다. 개인 프로젝트/입력·녹음은 사용하지 않았습니다.
- 최초 검증 서버는 sandbox loopback이 호스트에서 시간 초과였습니다. 검증용 별도1421 서버를 허용된 호스트 실행으로 다시 띄워 HTTP200과 실제 브라우저 동작을 확인했습니다. 사용자 고정 앱/DB/모델은 재실행하거나 변경하지 않았습니다.
- Windows 고정 후보 적용/사용자 수용·선택 기능 포함 새 ZIP/설치기 검사는 **미실행** — 사용자 요청이 Git 소스 정리/업로드로 전환됐습니다. 직전 압축 보호 후보의 성공을 소급하지 않습니다. 최신 Rust/Python 전체 재검사 결과는 GIT-SNAPSHOT-2026-10-23.md에 정리합니다.

### 4. 미구현 및 알려진 제약

동시 다중 선택/범위 드래그·화음/고급 주법 편집·트랙 삭제/재정렬·미적용 폼 저장은 미구현입니다. 기존6줄 단성 한도를 유지합니다. 선택은 임시 상태이며 프로젝트/앱 재열기 시 저장하지 않습니다. 반복 표기의 occurrence 선택 정책은 음원 시각과 사용자가 원하는 반복 차수의 일치를 보장하지 않아 목록으로 정확한 차수를 선택할 수 있습니다.

### 5. 다음 작업 계획

Git 업로드 후 같은 최신dist로 내장 번들·Windows 고정 후보를 만들고 원본/DB/모델 보존과 실제 선택을 검사합니다. 후보 준비 기록은 target/runtime-validation/tab-selection-candidate.json이며 아직 PREPARED입니다. 직전 PID27624/PTY10553은 압축 보호 앱의 마지막 관측 이력으로, 이번 정리에서 현재 실행 여부를 다시 확인하거나 앱을 재시작하지 않았습니다. 독립적인 기능/안정성 개발을 이어가되 미검증 항목을 완료로 표시하지 않습니다.

> 최신 완료(2026-10-22): 자동 저장 선택의 완전 재실행 복원, 기타 트랙 추가/프렛3 저장·재열기, 트랙 이름 적용/Undo·Redo·저장·재열기를 사용자가 확인했고 각 후속을 문서화했습니다. 최종 통합 회귀는401개이며 압축 악보 보호 후속은 PHASE-08 마지막 절에 기록했습니다. 현재 PID27624/PTY10553의 최신 고정 앱을 유지합니다. 아래 이전 ‘대기/미구현’은 각 시점의 이력이며 고급 편집·전체 로드맵 완료를 뜻하지 않습니다.

> 최신(2026-10-22): 자동 저장 선택의 완전 재실행 복원은 사용자 수용/문서까지 완료했습니다. 이어 기타 트랙 직접 추가 후보의 전체386개/타입·lint/포맷·빌드/내장3개·Windows 적용/기존 데이터 보존을 확인했고 사용자 저장·재열기 수용을 기다립니다. 현재PID26692/PTY71808을 유지합니다. 최신 파일·명령·제약은 마지막 ‘기타 악보 트랙 직접 추가 후속’ 절과 그 후속 결과를 따릅니다. 아래 이전 미실행/미구현 기록은 당시 이력입니다.

> 최신 완료(2026-10-22): 선택적 자동 저장을 켜고 프렛5 적용→수동 저장 없이 대기→저장됨/프로젝트 다시 열기 후5 유지를 사용자가 확인했습니다. 기본6줄 단성 범위의 빈 작성·JSON 다시 열기·선택적 자동 저장 후속은 문서까지 완료입니다. 아래 자동 저장 수용 대기/미실행 기록은 당시 이력이며 강제 종료 전용 복구·설정 영구 저장/고급 편집은 계속 미구현입니다.

> 완료(2026-10-22): JSON 악보 파일 다시 열기 후속의 프론트369개/확장Rust231개·release232개/Clippy/MSRV·실제 번들 백업·Windows 프렛4 저장/재열기·독립ZIP 검증을 통과했습니다. 이전 JSON import UI 미구현 기록은 당시 이력이며 현재 범위/제약은 마지막 절을 따릅니다.

> 최신 상태(2026-10-22): 빈 악보에서 직접 작성하는 후속을 추가했고 실제 새 프로젝트/프렛3 저장·재열기를 사용자 확인했습니다. 프론트364개/확장Rust229개·release230개·Windows/기존 데이터 보존 성공입니다. 아래 2026-10-17 기록과 미구현 기능 중 빈 악보 생성 UI만 이번에 해소됐으며 자동 저장/고급 편집·JSON import UI는 유지합니다. 상세 변경·테스트/오류·미실행/후속은 마지막 절을 따릅니다.

> 최신 상태(2026-10-17): Phase 5의 기본6줄 단성 편집 범위 완료. 실제 편집/저장/비교/출력 확인과 최종 프론트171개·Rust113개/제외3개·번들2개 성공을 기록했습니다. 고급 표기·자동 저장·JSON import UI 등의 미구현 범위는 유지합니다. 아래 진행/중단/미실행 기록은 당시 이력이며 최신 결과는 마지막 절을 따릅니다.

## 1. 작업 개요

- 시작일: 2026-10-15. 완료 날짜: 2026-10-17. 상태: 기본6줄 단성 편집 범위 완료.
- Phase 4B 자동 검사/실제 독립 녹음·WAV 출력·설정 복원과 완료 문서를 검토했습니다.
- 첫 목표는 원본을 보존하는 단성 음표 편집·Undo/Redo·렌더/목표/저장 복원의 일관성입니다. 이후 마디/템포/튜닝·비교·JSON/MusicXML 내보내기를 순서대로 구현합니다.

## 2. 구현 및 변경 사항

- docs/12에 선택적 renderSource와 첫 지원 범위·실패/원본 보존·재생 epoch/저장/리플레이 계약을 먼저 추가했습니다.
- 현재 제품 구현은 진행 전이며 구현하지 않은 기능을 완료로 표시하지 않습니다. 기존PID23848 앱은 유지하고 새 제품 적용은 사용자 종료 이후 수행합니다.

### 첫 슬라이스 후보 구현 완료 — 2026-10-15

- 신규 `src/features/score/scoreEditing.ts`: 줄/프렛/시작/길이 수정·추가/삭제의 순수 함수와 최대100개 snapshot Undo/Redo. 실패는 문서를 변경하지 않고 같은 트랙의 중첩/화음·타이·마디 넘김·범위 오류를 거부합니다. 음표/트랙 ID·원본/싱크 앵커를 보존하고 반복을 펼친 편집본의 마디 번호를 새 위치로 맞춥니다.
- 신규 `normalizedNotation.ts`: 기본 음가/쉼표·마디/템포/튜닝을 파생 MusicXML로 변환해 설치된 alphaTab1.6.1에서 실제 import/MIDI lookup을 생성합니다. 재정규화한 음정·시작/길이·운지·튜닝·박자·템포가 다르면 적용하지 않습니다. 내부 파생 XML이며 파일 내보내기 기능을 구현한 것은 아닙니다. [W3C MusicXML TAB](https://www.w3.org/2021/06/musicxml40/tutorial/tablature/)·[duration](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/duration/)와 설치 API를 참고했고 의존성을 추가하지 않았습니다.
- 신규 `useScoreEditing.ts`·`ScoreEditor.tsx`: 컨트롤러를 App 루트에 두어 모드 이동 후에도 history를 유지하고 UI는 명령/속성/오류를 표시합니다. 명시적 편집 시작·음표 선택·폼·추가/삭제·Undo/Redo를 제공하고 녹음/파일 작업 중 명령을 차단합니다. 편집/되돌리기 때 PlayerEngine pause/epoch 변경과 렌더/목표 갱신을 함께 적용합니다. 외부 문서 변경의 오래된 history는 적용하지 않습니다. 기존 토큰/순수 HTML 컨트롤을 사용하고 디자인 작업은 추가하지 않았습니다.
- `src/entities/{score,scoreValidation}.ts`·native `storage/project_model.rs`: v1 선택적 renderSource=NORMALIZED, 누락 호환/알 수 없는 값·null 거부. DB migration/Python protocol 변경 없음. 원본 asset과 불변 revision을 유지합니다.
- `alphaTabAdapter.ts`: 실제 staff.tuning이1번 줄부터인데 기존 코드가 reverse하던 문제를 수정했습니다. 이전 저장 JSON/테이크는 재작성하지 않고 첫 편집에서 원본 모델로 튜닝 사본을 준비합니다. Undo는 원문서·원본 렌더로 복귀합니다. 결정은 docs/00·12에 기록했습니다.
- `app/App.tsx`·`ScoreWorkspace.tsx` 연결, `library/useProjects.ts`·`recordings/TakeReplay.tsx`에서 리비전 renderSource별 어댑터를 사용합니다. 편집 저장 후 표시가 원본으로 되돌아가거나 녹음 리플레이가 최신 원본을 표시하지 않도록 해당 저장 리비전을 렌더합니다. 기존 savedRevision과 현재 문서의 동일성 기반 미저장 표시를 유지합니다.
- 검증 파일: 신규 `scoreEditing.test.ts`5개·`useScoreEditing.test.tsx`2개·`src/test/scoreEditingFixture.ts`; 기존 App scoreSession/alphaTabAdapter/useProjects/TakeReplay 테스트와 native projects_tests 확장. 새 의존성/lockfile/사용자 오디오 변경 없음.

## 3. 테스트 결과

- Phase 5 타입/린트/자동 검사/빌드/Windows 확인: **미실행** — 구현 전입니다.
- 이전 Phase 4B 최종149개 프론트/110개 Rust·제외3개·번들2개 성공과 구분합니다.

### 첫 슬라이스 최종 자동 검사

- `pnpm verify:app`: **성공**. TypeScript·ESLint·프론트159개/46파일·production build(main1,406.47kB)·Prettier·cargo fmt/표준 Clippy·Rust111개/기본 제외3개·binary/doc-tests.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공**.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`: **성공**2개. 현재 프론트 자산과 로컬 이벤트 권한을 검증했습니다.
- 자체 실제 alphaTab 왕복에서 줄2/프렛5=64·음가 수정·쉼표/빈 트랙·반복 마디 번호/박자·템포/두 트랙을 검증했습니다.20회 편집→Undo20→Redo20의 정확한 문서 복귀·history100개 제한·분기 redo 폐기, 잠금/비정상 수치·화음/타이/중첩 거부·원본/ID/싱크 보존을 확인했습니다. UI 수정값이 연습 목표와 모드 복귀에 유지되고, 원본 bytes와 다른 편집 리비전 렌더가 프로젝트/녹음 리플레이에서 복원되는지 확인했습니다.
- native 임시 SQLite/파일에서 이전 renderSource 누락 문서와 새 편집 문서의 저장/재실행·이전 리비전 및 원본 보존·null/다른 enum 거부를 검증했습니다. 개인 데이터는 테스트에 사용하지 않았습니다.
- 발생 오류/해결: 첫4개 검사가 튜닝 반대 순서 때문에 실패해 실제 설치 모델/공개 fixture로 순서를 확인하고 새 normalize/이전 문서의 원본 기반 편집 사본 경로를 분리했습니다. alphaTab 제목의 NBSP 변환은 표시 문자열 비교만 공백 정규화했고 저장 제목은 유지합니다. 테스트 환경의 서로 다른 realm Uint8Array deep equality는 길이+모든 바이트 비교로 바꾸어 실제 보존 검증 범위를 유지했습니다. 실패한 검사는 전체 재실행에서 성공했습니다.
- 큰 JS chunk/MSVC 라이브러리 생성 안내 경고는 유지합니다. Windows 제품 exe 빌드/실제 편집·저장 재실행은 **미실행** — 기존PID23848 앱이 열려 있으며 사용자 종료 뒤 적용합니다. Python 검사는 **미실행** — Python 변경 없음. 실제 장치/지연 측정은 **미실행** — 편집 범위이며 입력 경로는 변경하지 않았습니다.

## 4. 미구현 및 알려진 문제

- Phase 5 전체 미완료입니다. 첫 편집 범위는 기본6줄 단성 악보이며 화음·타이/주법 등의 무손실 편집은 보장하지 않습니다.
- 마디/템포/튜닝·원본 비교·JSON/MusicXML 파일 내보내기와 실제 저장/재실행 확인은 남습니다.
- 첫 편집 후보 제한은PPQ960·6줄 운지 확정·기본 음가/단성·256마디/전체2,000음 이하입니다. 화음/타이·중첩·마디 중간 템포/특수 음가 등 미지원 악보는 거부하며 기존 읽기/재생은 유지합니다. 정규화 편집본은 주법·원본 표기가 간소화되고 반복은 펼쳐집니다. UI에서 편집 시작 전에 안내하며 원본은 별도 보존합니다.
- 실제 Windows 편집 후보는 아직 적용 전입니다. 키보드/악보 클릭 선택·자동 저장·음표 복제 등 추가 편집 조작도 후속 범위이며 미구현입니다.

## 5. 다음 작업 계획

1. UI와 분리된 순수 편집/검증·snapshot history·파생 렌더 어댑터를 구현하고20회 Undo/Redo/오류/원본 보존을 검사합니다.
2. 최소 음표 속성 UI와 기존 저장/리플레이를 연결하고 타입·린트·회귀·빌드를 확인합니다.
3. 검사 후 사용자 앱 종료→제품 적용→간단한 음표 한 개 수정/Undo·Redo/저장 재열기를 확인합니다.
4. 후속 슬라이스를 완료한 뒤에만 로드맵의 Phase 5를 완료로 표시합니다.

## 첫 편집 슬라이스 Windows 적용 — 2026-10-15 23:06

- 사용자 ‘닫음’ 후 실제 앱 프로세스 없음 확인, `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 종료 코드0. exe24,236,544바이트/23:06:20, 새PID5408/23:06:41/창 제목GuitarLab으로 실행했습니다. 위 제품 빌드/실행 미실행은 적용 전 이력입니다.
- 읽기 전용 DB 전후 비교에서 저장 믹스 설정·해시와22개 전체 테이크 메타데이터/해시가 동일하고 저장 SHA-256과 일치했습니다. 사용자 WAV/PCM은 읽거나 전송하지 않았고 입력·모니터·REC를 자동 시작하지 않았습니다.
- 현재 실제 편집/Undo·Redo·저장/재열기는 **미실행/확인 대기**입니다. 기존 저장 프로젝트의 카피 화면에서 첫 음표의 프렛만 바꾸는 간단한 표시 검사부터 확인합니다. 사용자에게 기타 연주를 요구하지 않으며 수동 요청 이후 파일과 앱을 유지합니다.
- 종료를 직접 하지 않은 이유는 이전 사용자 테스트가 중단된 일을 반복하지 않기 위한 현재 협업 방식이며 도구가 종료를 금지해서라는 설명은 하지 않았습니다. 이번에도 사용자가 닫은 뒤에만 전환했습니다.

## 저장 프로젝트 실제 편집 오류·수정 — 2026-10-15

- 사용자 첫 프렛 수정 검사에서 ‘편집본 렌더 왕복에서 음정·시간·운지·박자·템포가 달라 적용하지 않았습니다.’가 발생했습니다. 실제 편집 통과로 기록하지 않으며 실패 시 현재 문서를 보존했습니다.
- 저장 악보의 템포/박자/튜닝·첫 두 음표를 읽기 전용으로 확인했습니다. 개인 WAV/PCM은 읽지 않았고 사용자 악보를 fixture로 복사하지 않았습니다. 자체 standard fixture의 tempoMap 객체 속성 순서를native JSON과 같은bpm/tick 순서로 바꾼 회귀1개에서 같은 오류를 재현했습니다(수정 전 실패).
- 원인/수정: 음표/튜닝/박자 값은 같아도 템포 객체의 JSON.stringify 속성 순서 차이만으로 비교가 실패했습니다. `normalizedNotation.ts`에서 실제tick/bpm 값 배열끼리 비교하도록 수정했습니다. 음정/시간/운지/박자/템포의 실제 값 검증은 그대로 유지합니다. `scoreEditing.test.ts`에 순서 회귀1개를 추가하고 `useProjects.test.tsx`의 저장 편집 리비전 재열기도native 순서로 보강했습니다. DTO/버전·DB/원본/입력/기타 native 코드는 변경하지 않았습니다.
- 성공: `pnpm typecheck`, `pnpm lint`, `pnpm test`160개/46파일, `pnpm build`main1,406.52kB, `pnpm format:check`; 최신 custom-protocol 번들2개. 큰 chunk 경고 유지. native 전체/확장 Clippy 재실행은 **미실행** — native 제품/검사 소스가 동일해 직전111개/제외3개·확장 Clippy 성공을 유지합니다.
- 수정 exe 빌드/실제 편집 재확인·저장 재열기는 **미실행** — 현재PID5408을 유지하고 사용자 종료 뒤 적용합니다. Phase 5 전체 미완료이며 마디/템포/튜닝·비교·파일 내보내기도 남습니다. 종료 요청 후 파일과 앱을 유지합니다.

### 템포 비교 수정 Windows 적용 — 2026-10-15 23:13

사용자 ‘닫음’ 및 실제 프로세스 없음 확인 후 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 종료 코드0. exe24,236,544바이트/23:13:39, 새PID26584/23:13:51로 실행했습니다. 위 수정 exe 빌드 미실행은 적용 전 이력이며 실제 편집 재확인·저장 재열기는 여전히 **미실행/확인 대기**입니다. 입력·모니터·REC를 자동 시작하지 않았습니다. 기존 프로젝트에서 같은 첫 프렛 수정만 간단히 재확인하고 요청 후 파일·앱을 유지합니다.

### 첫 프렛 수정 실제 확인 — 2026-10-15

수정 앱에서 첫 프렛1 적용 시 TAB 숫자가 바뀜을 사용자가 확인했습니다. 앞선 템포 속성 순서 문제의 실제 재확인 성공이며 Undo/Redo·저장/재열기 수동 통과로 확대하지 않습니다. 다음은 되돌리기→다시 실행→프로젝트 저장/다시 열기 확인입니다. 실행 중PID26584는 재실행하지 않고, 다음 마디/템포/튜닝 편집 소스 작업은 내장 UI에 영향을 주지 않는 범위에서 진행합니다. Phase 5 전체는 계속 미완료입니다.

### 기본 음표 편집 슬라이스 실제 수용 확인 — 2026-10-15

사용자가 되돌리기/다시 실행과 저장 후 다시 열기도 정상이라고 확인했습니다. 첫 프렛1 반영·Undo/Redo·새 편집 리비전 저장/실제 재열기까지 첫 슬라이스를 확인했습니다. 이후 마디/템포/튜닝·원본 비교·JSON/MusicXML 내보내기를 같은 Phase 5에서 진행합니다. 기존PID26584는 유지하고 다음 기능을 검사한 뒤 함께 적용합니다. 전체 Phase 5 완료는 아닙니다.

## 구조 편집·원본 비교·파일 출력 후보 — 2026-10-15

### 작업 개요 및 구현

- 상태: 구현/자동 검사 완료, Windows 새 후보 적용·수동 검사 대기. 완료 날짜는 아직 없습니다. 기존 앱PID26584는 재실행하지 않았습니다.
- 신규 `src/features/score/scoreStructure.ts`·`scoreStructure.test.ts`: 선택 마디부터 다음 명시 템포까지 BPM 적용, 선택 마디 박자, 빈 마디 삽입/끝 추가, 해당 마디 모든 트랙의 음표 삭제, 6줄 MIDI 튜닝. 프렛을 유지하며 목표 음정을 다시 계산하고 음표 ID를 보존합니다. 박자 축소로 음표가 넘치면 원문서를 유지한 채 거부합니다. 마지막 마디 삭제·범위/비정상 값도 거부합니다.
- 마디/박자/템포 편집은 UI에서 싱크 재설정 확인을 요구합니다. 기존0tick 음원 시각을 유지하며 새 템포 기반 기본 앵커를 만들고 이후 반주 정렬을 다시 확인해야 합니다. Undo로 이전 음표/싱크를 함께 복원합니다. 튜닝 변경은 시간 앵커를 유지합니다.
- 신규 `ScoreStructureEditor.tsx`, 수정 `useScoreEditing.ts`·`ScoreEditor.tsx`: 구조 편집도 기존 snapshot history/재생 중단/목표 갱신 경로를 사용합니다. 입력 위치로 음표 복제, 패널 버튼 초점에서 Ctrl+Z/Shift+Ctrl+Z, 입력 필드 자체 Undo 유지. 기존 토큰/폼을 사용하고 디자인 값을 추가하지 않았습니다.
- 수정 `normalizedNotation.ts` 및 컨트롤러: 원본 bytes를 별도 alphaTab 모델로 읽어 시작 위치의 읽기 전용 비교를 표시합니다. 편집본/현재 저장 문서를 원본 비교로 덮어쓰지 않습니다. 편집본은 실제 alphaTab 재정규화 왕복을 통과해야 적용됩니다.
- 신규 `scoreExport.ts`·`useScoreExport.ts` 및 각 테스트: JSON/MusicXML 출력 전 문서와 실제 렌더 왕복 검증, 기존 저장 작업의 진행/취소 사용, 중복 요청 차단·화면/원본 변경 후 오래된 응답 무시. 브라우저에서는 파일 저장 버튼을 비활성화합니다.
- 신규 native `commands/score_api.rs`, 등록 `commands/mod.rs`·`lib.rs`: `export_score_file` v1, 형식/문서/크기/녹음 상태 검증 후 native 저장 창에서 새 경로를 선택합니다. JS 임의 경로는 받지 않습니다. JSON은 native 재직렬화, MusicXML은 프론트 의미 왕복 후 native 크기/자체 XML 외곽/DOCTYPE·ENTITY 금지를 검사합니다. native 전체 XML XSD 검증은 미구현입니다.
- 신규 `storage/export_file.rs`, 수정 `storage/mod.rs`·`mixer/export.rs`: 기존 WAV의 새 파일 전용 쓰기를 공통화했습니다. 임시 파일→flush/fsync→원자적 hard-link 공개, 기존 경로/동시 생성 충돌 거부, 취소·디스크 여유 확인과 원본 보존을 유지합니다. WAV 오류 코드는 기존 MIX 코드로 변환합니다. 파일시스템 hard-link 미지원은 명시적 실패입니다.
- `src/app/scoreSession.test.tsx`·`useScoreEditing.test.tsx`에서 구조/복제/튜닝/원본 비교/키보드 연결을 보강했습니다. docs/12 계약을 구현 전에 추가했고 의존성·lockfile·SQLite 스키마·Python 프로토콜은 변경하지 않았습니다.

### 실행 검증 및 오류 해결

- `pnpm verify:app`: **성공**, 프론트169개/49파일, TypeScript·ESLint·production build(main1,417.71kB)·Prettier·cargo fmt/표준 Clippy·Rust113개 성공/3개 기본 제외·binary/doc-tests.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공**.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`: **성공**2개. 최신 내장 UI와 로컬 이벤트 권한을 확인했습니다.
- 새 구조 도메인4개, 출력 어댑터2개, 출력 컨트롤러2개, App 통합 추가1개와 native 출력2개를 포함합니다. 실제 alphaTab 왕복, 기본 싱크 재작성/도입500ms 보존, 박자 축소 거부, 구조 이동/ID 보존, 튜닝/Undo, 원본 비교 분리, JSON 재해석/XML 재입력, 취소/충돌/원본 파일 보존을 검사했습니다. 전체 기존 녹음/믹스/WAV 회귀도 통과했습니다.
- 발생 오류: native 새 테스트가 기존 Fixture의 비공개 경로 필드를 참조해E0616으로 컴파일 실패했습니다. 테스트가 공개된 자체 store.root 아래에 자체 원본을 만들도록 수정했습니다. 제품 저장 구현이나 필드 가시성을 넓히지 않았으며 수정 후 새2개 및 전체 검사가 성공했습니다.
- 알려진 빌드 경고: 기존 alphaTab 큰 JS chunk 및 MSVC 라이브러리 생성 안내. 실패로 처리할 오류는 발생하지 않았습니다.
- Windows 새 후보 exe 빌드/실제 비교·파일 저장: **미실행**, 기존 사용자 앱을 유지 중이며 사용자 종료 뒤 적용합니다. Python 검사: **미실행**, Python 변경 없음. 실제 입력/녹음 재검사: **미실행**, 입력 경로 변경 없는 악보 편집 범위입니다. 기본 제외3개는 장치 열거2개·독립 합성 WAV 산출물1개이며 이번 자동 검사에서 캡처를 시작하지 않았습니다.

### 미구현·제약 및 다음 작업

- 편집 지원은PPQ960·6줄 운지 확정·단성/기본 음가·256마디/전체2,000음 이하입니다. 화음/타이/고급 주법/마디 중간 템포/특수 음가는 무손실 편집을 보장하지 않고 거부합니다. 기존 원본 읽기/재생은 유지합니다.
- 편집 UI는 목록/속성 폼이며 악보 직접 클릭 편집·자동 저장은 미구현입니다. JSON은 내부 문서 출력이며 앱에서 JSON 파일을 선택해 import하는 UI는 미구현입니다. MusicXML은 기존 import 경로로 재입력할 수 있습니다.
- 원본 비교는 별도 시작 위치의 읽기 전용 렌더이며 두 악보의 동시 재생 비교는 미구현입니다. 새 출력 완료 후 취소가 늦게 도착하면 이미 저장된 파일은 유지될 수 있음을 안내합니다.
- 다음은 사용자 앱 종료 확인→새 Windows 빌드/실행→마디 추가/Undo·원본 비교·새 JSON/MusicXML 저장을 간단히 확인합니다. 실제 검증·문서 업데이트 후에만 Phase 5 로드맵 완료와 Phase 6 착수를 진행합니다.

## 구조 편집·출력 후보 Windows 적용 — 2026-10-15 23:44

- 사용자 종료 응답·실제 앱 프로세스 없음 확인 후 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공**. exe24,411,648바이트/23:44:24, 새PID7080/23:44:38/창 제목GuitarLab 실행을 확인했습니다. 위 새 exe 미실행 기록은 적용 전 이력입니다.
- 입력/모니터/녹음을 자동 시작하지 않았습니다. 실제 구조 편집·원본 비교·새 JSON/MusicXML 저장은 **미실행/확인 대기**이며 프로그램 시작 성공을 수동 수용 완료로 확대하지 않습니다.
- 사용자가 앱 종료도 직접 처리해 달라는 취지를 밝혔습니다. 이후 수동 테스트 종료 및 녹음/미저장 작업이 없음을 확인한 경우 도우미가 정상 종료/재실행합니다. 수동 테스트 중 앱을 닫거나 상태 확인 없이 강제 종료하지 않습니다. 기존 종료 요청 방식은 도구의 금지 규칙 때문이 아닙니다.
- 다음 한 가지 검사는 저장 프로젝트→카피→편집 시작→싱크 재설정 확인→끝에 빈 마디 추가/Undo입니다. 기타 연주 없이 확인하고 응답까지 앱/소스를 유지합니다.

## 빈 마디 추가·되돌리기 실제 확인 — 2026-10-15

사용자가 ‘끝에 빈 마디가 생기고 되돌리기를 누르면 사라짐’으로 답했습니다. 새 Windows 후보의 마디 추가 표시/Undo를 실제 확인했으며 템포/박자/튜닝 전체 수동 검사나 원본 비교·파일 출력 성공으로 확대하지 않습니다. 해당 세부 도메인은 위 자동 검사 결과와 구분합니다. 이번 변경은 진행 문서만 갱신했고 제품 소스/실행 앱은 변경하지 않았습니다. 다음은 원본 읽기 전용 비교와 새 JSON/MusicXML 저장 창·파일 생성 확인이며, 확인 응답까지 앱/소스를 유지합니다. Phase 5는 계속 진행 중입니다.

## 원본 비교·파일 저장 실제 확인 및 작업 일시중지 — 2026-10-16

### 확인 결과

- 사용자가 원본 비교에 ‘잘 보임’, JSON/MusicXML 파일 저장에 ‘저장 잘 됨’으로 답했습니다. 별도 원본 렌더 표시와 두 형식의 실제 저장을 확인했습니다. 내보낸 사용자 파일의 내용을 도우미가 열거나 외부로 전송하지 않았습니다.
- 파일 내용의 의미 왕복/JSON 재해석·XML 재입력은 앞서 실행한 자체 fixture 자동 검사 결과입니다. 사용자가 내보낸 파일의 앱 재입력과 외부 악보 프로그램 호환성 검사는 **미실행**이며 저장 성공과 구분합니다.
- 이번 작업은 이 문서와 progress/README.md의 수용 결과/재개 위치만 갱신했습니다. 제품 소스 수정·앱 종료/재실행·입력/모니터/녹음 조작은 하지 않았습니다.
- 새 타입 검사/빌드/테스트는 **미실행**입니다. 진행 문서만 변경했으므로 직전 전체 성공(프론트169개/Rust113개·기본 제외3개, 확장 Clippy·번들2개) 기록을 유지합니다.

### 중단 상태와 다음 작업

- 사용자 ‘오늘은 여기까지’ 요청으로 자동 개발을 일시중지합니다. Phase 6은 시작하지 않았고 재개 요청 전 추가 개발/앱 조작을 하지 않습니다.
- Phase 5 전체 완료 표시는 보류합니다. 재개 시 편집 후 재생/지판/채점 목표 연결의 기존 자동 검증과 로드맵 수용 조건을 최종 검토하고, 부족한 실제 재생 확인이 있으면 그 부분만 보완한 뒤 완료 문서/로드맵을 갱신합니다. 이미 확인한 편집/Undo·Redo/저장/비교/출력은 불필요하게 반복하지 않습니다.
- 고급 화음/타이/주법, 악보 직접 클릭 편집·자동 저장·JSON import UI와 외부 XML XSD 검증 등 위에 명시한 제한은 그대로입니다. 해당 기능을 이번 사용자 확인으로 완료 처리하지 않습니다.

## 최종 수용 및 재개 — 2026-10-17

- 사용자 재개 요청으로 일시중지를 해제했습니다. 기존 실제 프렛 수정/Undo·Redo/저장/재열기·마디 추가/Undo·원본 비교/두 형식 저장 결과를 유지하며 불필요한 수동 반복을 하지 않았습니다.
- `usePractice.test.tsx`에 실제 편집본 alphaTab 재정규화→채점 요청 연결 회귀1개를 추가했습니다. 첫 음을 MIDI65/480tick으로 이동하면250ms 목표와 새 revision이 전달되고 이전 시도를 종료하며 Undo로 MIDI64/0ms가 복원됩니다. `scoreSession.test.tsx`에서 렌더 모델의 프렛과 실제 지판 목표 표시도 확인했습니다. 관련17개 성공입니다. 제품 편집/판정 구현은 변경하지 않았습니다.
- 최초 전체 검사의 포맷 단계가 사용자가 public/fixtures에 내보낸 JSON 때문에 실패했습니다. 개인 파일을 포맷하지 않고 지정 자체 fixture5개만 Git/포맷 대상으로 유지했습니다. 빌드도 public 전체 자동 복사를 끄고 `scripts/publicAssets.mjs`와 타입 선언에서 지정 fixture·폰트/고지·soundfont만 복사합니다. `src/test/publicAssets.test.mjs`의 자체 임시 파일 검사와 native 번들 허용 목록 검사로 사용자 녹음/악보 배포물 혼입을 막았습니다. 사용자 실제 파일 내용은 읽거나 수정/이동/삭제하지 않았습니다.
- 빌드 도구 분리 중 TS7016/Node 타입 부재, 테스트 finally 내 throw 린트 오류가 발생했습니다. 표준 Node mjs 구현과 명시적 Vite 타입 선언을 분리하고 기존 방식의 경로 확인 정리 함수로 해결했습니다. 새 의존성을 설치하지 않았습니다.
- 최종 `pnpm verify:app`: **성공**. TypeScript·ESLint·프론트171개/50파일·production build(main1,417.71kB)·Prettier·cargo fmt/표준 Clippy·Rust113개/제외3개·binary/doc-tests. 최신 custom-protocol `bundle_tests`: **성공**2개. dist/fixtures에는 지정 자체5개만 있는 것을 파일명/크기로 확인했습니다.
- Windows 실제 UI 확인은 앞서 적용한 동일 편집 구현의 사용자 결과이며 이번 추가 테스트/자산 복사 변경 뒤 새 exe 실행은 **미실행**입니다. 다음 native 후보 적용 시 함께 빌드/실행합니다. 실제 하드웨어 채점 재측정·외부 악보 프로그램 호환성·사용자 출력 파일 재입력·Python 모델 검사는 **미실행**이며 이번 수용에 포함하지 않습니다.
- 완료 판단: 로드맵의 NoteEvent/구조 편집·revision/원본 보존·비교/파일 출력·렌더/지판/새 채점 목표 연결을 기본 단성 지원 범위에서 검증했습니다. 고급 주법/화음 편집·자동 저장/빈 악보 생성 UI·직접 악보 클릭·JSON import UI는 별도 제품 확장으로 남고 완료를 주장하지 않습니다.
- 다음은 Phase 6 첫 슬라이스인 제한된 Python dev worker/JSONL 계약·취소/timeout·미설치 상태부터 구현합니다. 실제 모델/가중치 다운로드·분리/카피·릴리스 Sidecar는 검증 전 미구현으로 표시합니다.

## 빈 악보에서 직접 작성 — 2026-10-22

### 작업 개요

F-06의 ‘새로 작성’ 진입점을 기존 기본6줄 단성 편집기에 연결했습니다. Phase6B 모델 권리/Phase7 실제 주법 참조·새Windows 의존성은 미완료로 유지하고, 독립적인 Phase5 후속/Phase8 기능 회귀로 진행합니다. 기본 Phase5 완료 범위를 소급 확대하지 않습니다. 현재 전체 상태는 자동 검사 완료·Windows 빌드/사용자 수용 진행 중입니다.

### 구현 및 변경 사항

- `fixtures/blank.musicxml`: 직접 작성한 표준6줄·기타1트랙·4/4·120BPM·빈1마디 공통 원본입니다. 음표를 임의 생성하지 않으며 외부 다운로드/의존성은 없습니다.
- `src/features/score/blankScore.ts`, `ScoreWorkspace.tsx`: 프로젝트 없는 카피 화면에서 메모리 악보 생성→기존 편집/출력 연결. 비동기 교체 확인·취소/늦은 응답 보호를 재사용합니다.
- `src/features/library/projects.ts`, `useProjects.ts`, `ProjectStatus.tsx`: 프로젝트 빈 악보 생성·기존 파일 작업 상태/취소·관리용 원본 연결. 기존 음원·원본·저장 revision은 유지하며 ‘프로젝트 저장’ 전에는 head를 바꾸지 않습니다.
- `src-tauri/src/storage/projects.rs`, `commands/storage_api.rs`, `app.rs`, `lib.rs`: 버전1/UUID/revision·휴지통 검증 후 새 UUID 파일을 create_new·sync_all하고 자산 행을 트랜잭션으로 기록합니다. 취소·DB 실패 때 자신이 만든 파일만 정리합니다. 새 command의 원격 origin 접근 거부 검사도 포함합니다. SQLite v9/기존 저장 계약은 그대로입니다.
- `blankScore.test.ts`, 앱 `scoreSession.test.tsx`, 프로젝트 API/컨트롤러·Rust 저장/계약 테스트: 빈 문서 실제 alphaTab 왕복·첫 음표 작성/Undo/Redo·MusicXML 출력 재열기, 명시적 저장/재실행·이전 원본/revision 보존, 취소·실패·오래된 revision/휴지통·잘못된 응답을 검사합니다. ResultsPage/RecordingPanel 테스트 컨트롤러에 새 명령만 보완했습니다.
- 계약을 `docs/12`에 먼저 기록하고 `docs/00`, `04`, `09` 및 진행 요약을 갱신합니다. 기존 기능/문서 삭제는 없습니다.

### 테스트 결과·오류

- `pnpm typecheck`, `pnpm lint`, `pnpm test`: 성공. 프론트 전체93파일/364개·53.07초. 빈 악보 도메인/앱 통합10개·28.41초, 프로젝트 API/컨트롤러20개·4.01초도 별도 실행했습니다.
- `pnpm build`: 성공, Vite1분20초. 기존500kB 초과 청크 경고 유지. `pnpm format:check`는 소스 대상 성공이며 기존 ignore 대상 Markdown 자동 포맷 검사는 **미실행**입니다.
- 최초 Rust 빌드는 SQLite params에 u64를 전달해 ToSql 오류가 발생했습니다. 파일 길이를 checked i64로 변환하여 수정했고 실제 임시 SQLite/files의 빈 생성·저장/취소·DB 실패2개0.40초가 성공했습니다. 기본 샌드박스의 incremental 하드링크 경고와 기존 MSVC 산출물 경고는 테스트 실패와 구분합니다.
- 최초 타입 검사에서 기존 테스트의 ProjectController mock2개에 새 필드가 없어 실패했습니다. 결과/녹음 테스트 mock을 보완한 뒤 전체 타입/린트/364개를 통과했습니다.
- 전체 확장 Rust·Clippy/MSRV·Windows 고정 실행/새 기능 사용자 수용은 이 절 작성 시 진행 중/미실행이며 완료 후 후속 결과를 추가합니다.

### 미구현 및 알려진 문제

자동 저장·빈 문서의 새 트랙/화음/고급 표기 작성은 **미구현**입니다. 프로젝트 없는 작성은 JSON/MusicXML 출력으로 보존하며 프로젝트 자체 저장은 프로젝트 안에서 만든 악보를 사용합니다. 빈 악보 생성만으로 아직 프로젝트 revision을 저장한 것은 아닙니다. 새 파일을 기록하는 중 OS가 강제 종료되면 미등록 파일이 남을 수 있으며 이를 자동 삭제하지 않습니다. 실제 디스크 공간 고갈·OS 강제 종료·별도Windows 조작은 **미실행**입니다. 기존 고급 채점/특화 모델/새PC 수용 제약은 유지합니다.

### 다음 작업 계획

전체 Rust/권한 회귀·최소 버전 확인 뒤 새 Windows 고정 빌드를 열고 실제 빈 악보→첫 음표/저장·재열기를 확인합니다. 이전 제품 앱의 유지 PTY에서 EXITED/code0/forced=false를 확인했으며 미저장 편집을 개발자가 강제로 폐기한 것은 아닙니다. 재실행 전 실제 v9의16개 테이블/모델4marker 읽기 전용 백업을 생성했습니다. 파일 내용/사용자 오디오는 전송하지 않습니다. 이후 독립적으로 진행 가능한 직접 작성·데이터 보존 조건을 계속 점검하고 전체 Phase6B/7/8은 미완료로 유지합니다.

### Windows 반영·사용자 수용 완료

- 전체 확장 Rust229개14.19초/환경 의존26개 제외, 전체 target/features Clippy17.07초·최소Rust1.90 검사21.02초·fmt 성공입니다. 제외한 실제 모델/장치/다운로드 검사를 실행했다고 표시하지 않습니다.
- `pnpm tauri build --debug --no-bundle --ci --config <blank-score 후보> -- --locked --offline` 성공(47.27초). 기존 macOS 식별자 권장·MSVC 링크 산출물 경고는 유지합니다. runtime3393개/64,095,996바이트 전체 지문·실행파일40,670,208바이트/SHAe57b38fcdc902901840875243f713cb1a533ca63804e02c9e5e29bd9f1321b38 확인했습니다.
- 새 고정 앱 PID27900/PTY4579·‘GuitarLab · 빈 악보 작성’/응답 정상입니다. 실행 경로는 portable/c792e3db-4885-4c1c-8af4-a3a7a68c67eb/GuitarLab.exe이며 처음 실행 직후 기존v9/16테이블·모델4marker가 이전 백업과 동일했습니다. 이후 사용자의 새 프로젝트/저장은 정상 변경으로 구분합니다.
- 사용자가 새 프로젝트→빈 악보→첫 프렛3 추가→저장→다시 열기 뒤 숫자3 유지에 ‘남아있음’으로 응답했습니다. blank-score-candidate.json/portable-candidate.json에 BLANK_SCORE_ACCEPTED·manualBlankScoreAccepted=true를 기록했습니다. 빈 악보 작성 슬라이스는 문서까지 완료입니다. 기존 고급 편집/자동 저장 등 미구현 조건은 유지합니다.
- 현재 앱은 계속 유지하며 승인 확인 없이 독립적인 Phase8 설치 종료 코드 증거 보완과 최신 release 내부 패키지 회귀를 진행합니다. 새 설치 결과와 실제 모델/장치·별도Windows 수용은 이 수용과 별개입니다.


## JSON 악보 파일 다시 열기 후속 — 2026-10-22

### 1. 작업 개요

- 대상: Phase 5/F-06의 JSON 내보내기 후 다시 열기. 작업 날짜2026-10-22, 완료 날짜는 실제 수용 후 기록합니다. 상태: 구현/자동 회귀 완료, 번들 백업·Windows 실제 수용 진행 중. 외부 모델/고급 주법/별도 PC가 필요한 미완료 항목과 독립적인 후속입니다.
- 목표: 자체 정규화 JSON을 새 파일로 열어 ID·역할·시각/앵커를 유지한 채 편집/원본 비교·프로젝트 저장/재열기. 기존 GP/MusicXML·녹음/연습을 유지합니다.

### 2. 구현 및 변경 사항

- `src/features/score/scoreJson.ts` 신규: UTF-8/BOM 없음·8MiB·schema1/NORMALIZED·고정 필드/자료형/ID 관계·제어문자·중복 키(이스케이프 별칭 포함) 검증. JSON.parse 문법 검증 뒤 키만 검사하며 개인 원문을 오류에 노출하지 않습니다.
- `localMediaImport.ts`: 공통 importScoreSession에 JSON 분기. 기존 기본6줄/PPQ960·256마디/2,000음·실제 마디 위치 일치와 alphaTab 왕복 확인 후에만 세션을 교체합니다. `normalizedNotation.ts`: JSON 최초 원본도 별도 읽기 전용 렌더. 편집 문서로 원본을 대체하지 않습니다.
- `library/useProjects.ts`·`ScoreWorkspace.tsx`: 기존 선택/비동기 미저장 확인·취소·늦은 응답 거부/저장/재열기를 재사용하고 선택 필터·실패 안내에 JSON 추가. 새 화면/디자인·의존성을 추가하지 않았습니다.
- native `commands/storage_api.rs`·`storage/projects.rs`: 기존 SCORE_IMPORT 승인 파일에 .json 추가. 최대 크기/헤더·serde의 중복/알 수 없는 필드와 문서를 검증한 뒤 새 자산을 공개합니다. 초기 큰 공백 뒤 JSON도 허용하며 손상/취소 시 새 part만 정리합니다. DB9/IPC/Python 버전 변경 없음.
- `fixtures/manual-score-v1.json`: 자체2트랙/리드·리듬/고정ID·5초 시작 싱크/첫 프렛3. 사용자 내보내기 파일은 읽거나 변경하지 않았습니다.
- 검사 파일: 신규 `scoreJson.test.ts`, 기존 `localMediaImport.test.ts`·`app/scoreSession.test.tsx`·`library/useProjects.test.tsx`·native `projects_tests.rs`·`storage/backup.rs`. 문서: docs/04·08·09·12 및 progress/PHASE-05·08·README. 문서를 먼저 정의하고 기존 저장·원본/리비전 정책을 유지했습니다.

### 3. 테스트 결과

- 성공: `pnpm typecheck`, `pnpm lint`, `pnpm test` 94파일/369개(25.98초), `pnpm build`(Vite1분), `pnpm format:check`. 기존 큰 JS chunk 경고 유지.
- 성공: `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml` 231개/26개 제외(11.88초), all-targets/all-features Clippy `-D warnings`(10.23초), `cargo +1.90.0 check --locked --offline --all-targets --all-features`(12.99초), `cargo fmt --check`. 제외26개를 성공으로 합산하지 않습니다. MSVC import library 안내 경고 유지.
- 자체 테스트: JSON→실제 alphaTab→프렛3/4 편집→원본3 유지/Undo→MusicXML, 프로젝트 저장/재열기·ID/역할/5초 앵커/원본 전체 바이트 유지. native 관리용 복사/원본 참조·이전 원본/리비전 보존, 70,000 공백 뒤 문서·손상/중복 키·제어문자/UTF-8/BOM·초과 크기/취소·미지원 주법/중첩·잘못된 마디 번호 거부.
- 발생 오류와 해결: JS DOM과 TextEncoder의 서로 다른 Uint8Array realm 때문에 내용이 같아도 deep equality가 실패해 전체 바이트 배열을 비교했습니다. fixture 포맷 후 다중 필드 문자열 치환이 적용되지 않던 검사 입력은 단일 필드 변경과 원문과 다름 검증으로 고쳤습니다. 정규식의 불필요한 escape lint 오류는 제거했습니다. 위 실패 후 전체 회귀가 통과했습니다.
- 실제 번들 백업: 명시적 환경 변수 `GUITARLAB_BACKUP_RESOURCES`에 검증된 portable 상위 경로를 주고 `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml storage::backup::tests::actual_bundled_backup_and_runtime_worker_preserve_original_and_new_zip -- --ignored --exact --nocapture` **성공1개/28.80초**. JSON·READY WAV·휴지통 marker·DB9의 새 ZIP/새 폴더 복원과 원본 바이트 보존, 실제 자식 취소를 확인했습니다. 최초 ai-runtime 내용 폴더를 직접 지정해 AI_RUNTIME_INTEGRITY로 실패했고 이를 포함하는 portable 상위로 바로잡아 통과했습니다. 제품 코드/무결성 검사를 완화하지 않았습니다. Windows 빌드/수용은 진행 중. Python 전체/실제 장치·모델 재검사: **미실행** — 제품 Python·오디오/모델 경로 변경 없음. 새PC·서명/최종 배포: **미실행** — 별도 환경/서명 수단 미확보.

### 4. 미구현 및 알려진 문제

- 자체 schema1/NORMALIZED의 기본 편집 가능 범위만 지원합니다. 임의 JSON·이전 원본 전용 renderSource 누락·화음/타이·고급 주법을 변환해 수용하지 않습니다. 예전 반복 펼침 결과의 마디 번호가 tick과 다르면 새 내보내기나 MusicXML 경로를 사용해야 합니다.
- JSON 하나로 원래 GP/MusicXML/오디오/프로젝트 ID·asset/revision 연결을 복원하지 않습니다. 프로젝트 선택 후 명시적 저장이 필요합니다. 자동 저장·화음/새 트랙 편집은 미구현입니다.
- native의 문서/헤더 검증과 frontend의 편집/렌더 지원 검증은 별개입니다. 구조는 유효하지만 편집 렌더가 불가능한 파일은 가져온 자산으로 남을 수 있으나 기존 악보/head를 교체하지 않습니다.

### 5. 다음 작업 계획

1. 자체 JSON/녹음을 포함한 실제 번들 백업 복원·Windows 후보/기존 DB·모델 보존 확인.
2. 새 테스트 프로젝트에서 JSON 선택→프렛4 편집→저장/재열기와 최초 원본3 비교를 확인하고 수용 상태를 갱신.
3. 수용 동안 고정 앱을 유지하고 독립 ZIP 검사 등 가능한 품질 검증을 이어갑니다. 외부 조건이 없는 특화 AI/고급 주법·새PC를 완료로 표시하지 않습니다.


### JSON Windows 후보 전환 — 2026-10-22

- `pnpm tauri build --debug --no-bundle --ci --config src-tauri/target/runtime-validation/json-score-import-cdf2e679-f57e-461d-92d8-ff633b93b1d8.conf.json -- --locked --offline` 성공25.29초. 런타임3393개/64,095,996바이트 전체 SHA 재확인 후 새 portable UUID에만 복사했습니다.
- 기존 PID27900은 제어PTY4579의 CloseMainWindow로 EXITED/코드0/forced=false. 직전 실제 DB9/16테이블 백업·진행 녹음0 확인 후 새 **PID27828/PTY40590·‘GuitarLab · JSON 악보 불러오기’** READY/응답을 확인했습니다. EXE40,674,304바이트/SHA `cbd1d22a78dd2834b8d88a74a9ad4c6a32698b6b89d149dfddadc6e38a420d22`, portable/cdf2e679-f57e-461d-92d8-ff633b93b1d8. `json-score-import-candidate.json`/`portable-candidate.json`에 기록했습니다.
- 전환 직후 기존16개 전체 테이블 지문·모델4marker 동일을 확인했고 json-score-import-db-before/after.json에 기록했습니다. 사용자 새 프로젝트 작성 이후의 정당한 변경과 이 기준을 혼동하지 않습니다. 입력/모니터/REC는 자동 시작하지 않았습니다.
- 실제 UI 수용은 대기 중입니다. 첫 사용자가 fixture를 찾지 못해 경로를 재확인했습니다. 자체 파일은 `A:\GuitarLab\fixtures\manual-score-v1.json`(1,693바이트)이고 이전 음원 폴더 public/fixtures가 아닙니다. 선택창 파일 이름에 전체 경로를 입력하도록 안내했으며 사용자 파일을 읽거나 이동하지 않았습니다.


### JSON 다시 열기 후속 완료 — 2026-10-22

- 완료 날짜2026-10-22. 사용자가 전체 경로로 자체 JSON을 열어 첫 프렛3→4 수정 후 ‘프로젝트 저장’/‘프로젝트 다시 열기’에서4 유지를 확인했습니다. 따라서 이번 JSON 기본 편집 범위는 구현·검증·실제 수용·문서까지 완료입니다. 원본 비교/ID·역할·앵커는 자동 검사 결과이며 이번 사용자 수용으로 별도 원본 비교 수동 검사를 통과했다고 확대하지 않습니다.
- release 전체 회귀: `cargo test --release --locked --offline --all-features --manifest-path src-tauri/Cargo.toml` **232개 성공/26개 제외**, 컴파일1분31초·실행12.50초. debug231개와1개 차이는 release 전용 개발환경 폴백 금지 검사입니다.
- 새 검증 ZIP: validation-packages/0e8b49d5-469a-4b72-b0dc-43587bc64ad5/GuitarLab-validation.zip, 3,612개/39,969,543바이트/SHA `bd913d18694bdb2e3c6173509e692ef60806d11d969e0500c9cd169acbdd6e38`. 전체 목록/CRC/지문·동일 바이트의 새 UUID 폴더 추출과 모든 추출 파일 SHA 확인 성공입니다. 기본 PowerShell5.1의 Test-ValidationPackage.ps1에서 전체 지문/개발 PATH 없는 Python3.12.15 두 번도 성공했습니다. json-score-import-package-roundtrip.json에 기록했습니다.
- 현재 PID27828/PTY40590 고정 앱은 그대로 유지하고 json-score-import-candidate.json 상태JSON_SCORE_IMPORT_ACCEPTED입니다. 새 설치기/별도Windows·서명·실제 장치 재검사는 **미실행**이며 이 JSON/ZIP 성공으로 대체하지 않습니다. 다음은 F-06에 남은 자동 저장의 작은 안전 범위를 검토합니다. 기존 수동 저장·불변 원본/리비전 정책을 변경하기 전 계약과 자동 검사부터 추가합니다.


## 선택적 악보 자동 저장 후속 — 2026-10-22

### 1. 작업 개요

F-06의 자동 저장 중 기존 기본 편집/불변 버전을 재사용할 수 있는 작은 범위입니다. 날짜2026-10-22, 완료 날짜는 실제 수용 뒤 기록합니다. 상태: 구현/대상19개·타입/lint 성공, 전체 회귀/Windows 수용 진행 중. 외부 모델/새PC와 독립적이며 JSON 후속 완료 뒤 시작했습니다.

### 2. 구현 및 변경 사항

- `src/features/library/useScoreAutosave.ts` 신규: App에 유지하는 컨트롤러가 선택 프로젝트/문서·원본/수동 저장 버전을 확인하고 마지막 적용 변경 후30초 대기합니다. 재생 empty/paused 및 녹음/채점/보정·프로젝트 작업/오류 없음 조건에서만 기존 save를 호출하며 실행 직전 최신 문맥/실제 플레이어 상태를 재확인합니다.
- `ScoreAutosave.tsx` 신규: 순수 표시/체크 이벤트. 기본 꺼짐, 이번 실행에 켠 프로젝트만 적용하고 설정을 영구 저장하지 않습니다. 첫 수동 저장과 지원 범위·30초/불변 버전 증가를 안내합니다. 기능에 필요한 기존 panel/컨트롤만 재사용했습니다.
- `src/app/App.tsx`: 루트에 컨트롤러와 최소 UI 한 곳 연결. 녹음 locked/보정 active/채점 armed를 전달합니다. 저장 비즈니스 로직을 UI에 넣지 않았습니다.
- 저장은 기존 `projectApi.save`·expectedRevision/작업 취소·진행/오류 및 새 불변 revision 경로를 재사용합니다. DB9/IPC·Python/오디오 콜백·원본/녹음은 변경하지 않았습니다. 수동 저장/종료 확인·Undo/Redo도 유지합니다.
- 신규 `useScoreAutosave.test.tsx`4개와 기존 `useProjects.test.tsx`의 실제 훅 연결1개 추가. docs/04·12에 계약을 먼저 정의하고 progress/PHASE-05·README와 docs/09·로드맵을 갱신합니다.

### 3. 테스트 결과

- 성공: 타입 검사·전체ESLint. 대상2파일19개/2.58초(기존14+자동 저장5개), 기본 꺼짐·30초 debounce/같은 편집 한 번·해제 취소·busy/녹음/채점 잠금/오류/최초 저장/다른 원본·버전 제외·프로젝트 전환/해제·실행 직전 재생 재확인·실패 안내/명시 재시도, 기존 저장 훅의 새 버전/원본 보존/저장 완료 갱신을 확인했습니다.
- 발생 오류: 기존 저장fixture에는 운지 정보가 없어 편집 검증이 거부했습니다. 실제 편집 가능한 자체 악보를 저장fixture로 사용해 통과했습니다. Uint8Array.buffer가 ArrayBufferLike인 테스트 타입 오류는 명시적 새 Uint8Array 복사로 ArrayBuffer를 확보해 고쳤습니다. 제품 검증을 완화하지 않았습니다.
- 전체 프론트/빌드/포맷·Windows 후보/실제 자동 저장 수용은 진행 중입니다.
- native 전체/모델·Python/실제 입력 재실행은 **미실행** — native/모델/Python/입력 소스 변경 없음. 직전 JSON의 debug231개/release232개·Clippy/MSRV·실제 백업 성공을 유지하고 새 내장 UI 번들 검사만 별도로 확인합니다. 새PC·서명/최종배포는 **미실행**, 조건 미확보입니다.

### 4. 미구현 및 알려진 문제

- 프로젝트 없는 악보/미적용 폼·최초 저장/새 원본·renderSource 없는 원본 보기 문서는 대상이 아닙니다. 정상 수동 저장 뒤의 NORMALIZED 적용 편집에 한정합니다.
- 저장된 버전/디스크 사용량이 증가하며 이전 버전을 자동 삭제하지 않습니다. 같은 문서의 취소·실패를 무한 재시도하지 않고 오류 해결/수동 저장을 요구합니다. 녹음/채점/보정이나 재생을 중단해 저장하지 않습니다.
- 30초 이내 앱 강제 종료/미저장 종료 확인 무시의 복구 초안·자동 저장 설정 영구 복원은 미구현입니다. 안전한 종료 확인은 유지합니다.

### 5. 다음 작업 계획

전체 프론트/새 번들 검사→고정 Windows 후보→기존 DB/모델 보존→사용자가 자동 저장 체크/프렛 변경 후30초 뒤 저장 버전/재열기 유지를 확인합니다. 수용된 JSON 앱은 검사 완료 전 그대로 유지하고, 수용 중 독립 패키지 등 나머지 작업을 이어갑니다.


### 자동 저장 전체 프론트 회귀 — 2026-10-22

`pnpm test`95파일/374개26.80초 성공입니다. 타입/전체lint·대상19개도 성공했으며 새 Vite/포맷 및 Windows 내장 후보를 검사 중입니다. 현재 실행 PID27828/PTY40590은 기존 JSON 수용 버전이고 소스 수정으로 갱신하지 않았습니다.


### 자동 저장 빌드/권한 회귀

`pnpm build`(타입 검사 포함·Vite50.71초)와 `pnpm format:check` 성공입니다. main1,564.81kB/큰chunk 경고 유지. 최신dist를 포함한 `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`3개/0.01초(빌드11.50초)로 내장 자산·로컬 최소권한·원격YouTube격리도 성공했습니다. native 소스 변경이 없어 전체231개/release232개는 앞선 같은 native 소스 검증을 재사용하며 새 자동 저장 UI의 검증과 구분합니다. 현재 새 Windows 고정 후보를 빌드 중이며 실제 자동 저장 조작은 아직 **미실행**입니다.


### 자동 저장 Windows 적용/실제 수용 대기 — 2026-10-22

- Windows 고정 빌드16.03초 성공. config score-autosave-1f279550-31ba-4593-9704-506dfd60a472.conf.json, 새 portable/1f279550-31ba-4593-9704-506dfd60a472의 EXE40,675,328바이트/SHA `648f3dd6222cbd5ab3149f221397b3b6a2734963ef81b5a5f7a2328241cce8d9`. runtime3393개/64,095,996바이트 전체 SHA를 재확인했습니다.
- 사용자가 저장한 JSON 프로젝트를 포함한 실제 DB9/16테이블 백업/진행녹음0 확인 후 PID27828은 제어PTY40590으로 정상 EXITED0/forced=false. 새 **PID37256/PTY74112·‘GuitarLab · 악보 자동 저장’** READY/응답 확인, 전환 전후16테이블·모델4marker 동일을 확인했습니다. score-autosave-db-before/after.json·score-autosave-candidate.json/portable-candidate.json에 기록했습니다. 입력/모니터/REC·자동 저장을 자동 시작하지 않았습니다.
- 사용자가 켠 후 프렛4→5 적용·수동 저장 없이35초·저장됨/재열기 후5 유지를 확인하도록 요청했고 응답 전 앱을 유지합니다. **실제 자동 저장 수용은 대기/미실행**이며 자동 검사 성공과 구분합니다.
- 새 검증 ZIP9da11b66-6f8a-4d2d-928e-52412e9f7320은3,612개/39,970,329바이트/SHA `c4955636d120c1b9e67c2104b7cc569de693cdacea2c970e0611485892cca794`. 전체 CRC/SHA는 생성 시 검증했고 새 UUID 추출·PS5.1/독립Python 검사를 이어갑니다.


### 자동 저장 ZIP 독립 점검 완료

새 ZIP의 전체 CRC/SHA·같은 바이트에서 새 UUID validation-roundtrip/85b7d095-141e-4ee3-b739-14058a3a782e/GuitarLab 추출/모든 파일 지문과 기본PS5.1 Test-ValidationPackage.ps1·개발PATH 없는Python3.12.15 두 번이 성공했습니다. score-autosave-package-roundtrip.json 상태ZIP_AND_POWERSHELL51_CHECKED. 이 검사는 현재 사용자 앱을 재실행하지 않았고 모델/사용자 데이터는 ZIP에 넣지 않았습니다. 실제 자동 저장은 응답 대기이며 독립적인 새release 내부 설치기 UUID b2b3f53a-1d89-4bd1-aba3-85a4d72b68a8 빌드를 이어갑니다.


### 자동 저장 후보의 독립 release 회귀 완료

최신 내부 NSIS31,437,776바이트/SHA82b1ba52…의 일반 사용자 설치/실행·정상 종료0·최소PATH runtime·제거/검증DB·자체 파일 보존을 확인했습니다. 같은 파일의 현재 Defender 정의1.461.118.0 시작/완료 이벤트 일치·해당 탐지0·SHA 동일도 확인했고 NotSigned입니다. 상세 명령/증거/첫 완료 이벤트 지연과 해결·미실행은 PHASE-08의2026-10-22 마지막 절을 따릅니다. 원래 고정 앱PID37256은 유지했습니다.

사용자가 가져온 자체 manual-score-v1.json의 고정 SHA와 일치하는 테스트 프로젝트 한 개만 읽기 전용 확인한 시점에는 저장 버전2·첫 프렛4였습니다. score-autosave-ui-persistence.json에 관측만 기록했고 자동 저장/사용자 수용 성공이라고 주장하지 않았습니다. 개인 WAV·다른 프로젝트의 악보 내용은 읽지 않았습니다. 실제 프렛5 자동 저장/재열기 응답은 계속 대기합니다.


### 이번 재개 작업의 변경 파일 목록/미해결 지점

- JSON 후속 제품/검사: `fixtures/manual-score-v1.json`, `src/features/score/scoreJson.ts`, `scoreJson.test.ts`, `localMediaImport.ts`, `localMediaImport.test.ts`, `normalizedNotation.ts`, `ScoreWorkspace.tsx`, `src/features/library/useProjects.ts`, `useProjects.test.tsx`, `src/app/scoreSession.test.tsx`, `src-tauri/src/commands/storage_api.rs`, `src-tauri/src/storage/projects.rs`, `projects_tests.rs`, `backup.rs`. 기능별 이유는 JSON 후속의 구현 절에 기록했습니다.
- 자동 저장 제품/검사: `src/features/library/useScoreAutosave.ts`, `useScoreAutosave.test.tsx`, `ScoreAutosave.tsx`, 기존 `src/app/App.tsx`, `src/features/library/useProjects.test.tsx`. 기존 저장 서비스는 변경하지 않고 호출자/컨트롤러와 검사를 추가했습니다.
- 문서: 루트 `README.md`, `docs/04-SCORE-TAB-EDITOR.md`, `07-DATABASE-AND-FILES.md`, `08-IMPLEMENTATION-ROADMAP.md`, `09-TEST-PLAN.md`, `12-API-CONTRACTS.md`, `docs/progress/PHASE-05.md`, `PHASE-08.md`, `README.md`. 과거 기록은 유지하고 최신 범위·검사/실패·제약·다음 작업과 전체 진행표/재개 기준을 갱신했습니다.
- 개발 산출물은 Git 제외 target/runtime-validation 아래 새UUID 후보/영수증·자체 검증 ZIP/설치기/DB백업만 생성했습니다. DB백업·사용자 데이터/모델은 배포 ZIP/설치기에 포함하지 않았습니다.
- 남은 수용: 자동 저장 체크→프렛5 적용→수동 저장 없이35초→저장됨/재열기 후5 유지의 실제 응답입니다. 현재 PID37256/PTY74112 앱은 그대로 유지합니다. 자동 저장 후보를 전체 완료로 올리거나 대기 중 앱을 재시작하지 않습니다.
- 전체 로드맵에 남은 외부 조건: 특화 Lead/Rhythm 가중치의 검증된 권리/고정 출처와 두파트 참조 품질, 실제 고급 주법의 독립 정답/허위 감점률, 별도Windows·서명/최종배포 및 release 장치/모델GUI 수용입니다. 기존 결정/자료 부족을 반복 질문하거나 검증 없이 전체Phase6B/7/8을 체크하지 않습니다.


## 선택적 자동 저장 실제 수용 완료 — 2026-10-22

### 1. 작업 개요

- 완료 날짜: 2026-10-22. Phase5/F-06 선택적 자동 저장 후속의 구현·자동 검사·Windows 적용·사용자 수용·문서화를 완료했습니다. 전체 로드맵 완료를 뜻하지 않습니다.
- 사용자가 안내한 자동 저장 체크→프렛4에서5 적용→수동 저장 없이 약35초 대기→저장됨/프로젝트 다시 열기 확인에 ‘잘댐’으로 응답했습니다. 이 확인은 같은 실행의 프로젝트 재열기이며 앱 완전 종료/재실행 시험으로 확대하지 않습니다.

### 2. 구현 및 변경 사항

- 이번 응답 반영에서는 제품 코드·실행 파일·DB·모델을 변경하지 않았습니다. 앞선 useScoreAutosave/ScoreAutosave·App 연결과 기존 불변 revision 저장 구현을 그대로 유지합니다.
- score-autosave-candidate.json과 portable-candidate.json에 SCORE_AUTOSAVE_ACCEPTED/수동 수용 항목·날짜를 기록했습니다.
- docs/progress/README.md의 전체 표/재개 기준, PHASE-05/08, docs/08·12 및 루트 README의 최신 상태를 갱신했습니다. 이전 실패/수용 대기와 원래 제약 기록은 삭제하지 않았습니다.

### 3. 테스트 결과

- **성공(사용자 실제 확인)**: 자동 저장 활성화 후 적용 편집이 수동 저장 없이 저장되고 프로젝트 다시 열기에서 첫 프렛5 유지. 새 녹음/기타 입력은 요구하지 않았습니다.
- 이전 실행 성공 결과 유지: 프론트374개/95파일26.80초·타입/전체lint·Vite50.71초/포맷, 새 번들/권한3개·Windows16.03초·DB9/16테이블·모델4marker 전후 보존. 같은 native 소스의 debug231개/release232개·Clippy/MSRV, 독립ZIP·최신release 내부 설치/종료0/제거·해당파일Defender 결과도 앞선 절대로 유지합니다. 이 응답 반영에서 다시 실행한 결과로 표시하지 않습니다.
- 타입/빌드/자동 검사 재실행: **미실행** — 이번 변경은 수용 영수증/문서뿐이며 제품 소스/실행 파일은 동일합니다.
- 앱 완전 재실행 후 새 프렛5 수동 재확인·강제 종료 복구·새PC/실제 release 장치/모델GUI·서명/최종배포: **미실행**. 각각 이번 수용 범위 밖이거나 외부 검증 조건이 부족합니다.
- 새 오류는 보고되지 않았습니다. 기존 fixture/ArrayBuffer 타입·Defender 완료 이벤트 지연 및 해결은 앞선 절과 PHASE-08에 유지했습니다.

### 4. 미구현 및 알려진 문제

기본 꺼짐이며 이번 실행의 켠 프로젝트/현재 수동 저장 버전·원본에 연결된 NORMALIZED 적용 편집만 지원합니다. 미적용 폼·프로젝트 없는 악보/최초 저장·설정 영구 복원/30초 이내 강제 종료의 복구 초안은 미구현입니다. 이전 버전은 자동 삭제하지 않아 디스크 사용량이 늘 수 있습니다. 녹음/채점/보정·재생·파일 작업/오류 시 대기하고 같은 편집의 취소/실패를 무한 반복하지 않는 정책은 유지합니다.

### 5. 다음 작업 계획/재개 위치

현재 마지막 확인 앱은 PID37256/제어PTY74112·‘GuitarLab · 악보 자동 저장’, portable/1f279550-31ba-4593-9704-506dfd60a472입니다. 사용자의 새 프렛5를 유지하며 종료/재실행하지 않았습니다. 재개 시 현재 프로세스/저장 상태부터 관측하고 완료한 JSON·자동 저장을 불필요하게 재구현하거나 반복 확인하지 않습니다.

남은 Phase6B/7/8 수용에는 특화 Lead/Rhythm 모델의 검증된 권리/고정 출처·두파트 참조 품질, 실제 고급 주법의 독립 정답/허위 감점률, 별도Windows/실제 release 장치·모델GUI·서명/최종배포 조건이 필요합니다. 현재 부족한 조건을 기록하며 검증 없이 고급 채점을 켜거나 복합 항목을 완료로 체크하지 않습니다.


## 자동 저장 선택의 다음 실행 복원 후속 — 2026-10-22

### 1. 작업 개요

선택적 자동 저장의 프렛5 실제 수용/완료 문서를 검토한 뒤 F-06의 편의 설정 복원을 이어갑니다. 작업 날짜2026-10-22, 완료 날짜는 실제 재실행 확인 후 기록합니다. 현재 상태는 구현/대상 자동 검사 성공·전체 회귀/Windows 적용 진행 중입니다. 외부 모델/장비 조건 없이 진행 가능한 기능이며 전체 로드맵 완료와 구분합니다.

### 2. 구현 및 변경 사항

- 신규 `src/features/library/scoreAutosavePreference.ts`: 앱 전용 로컬 Storage 키의 schema1·켠 프로젝트 UUID 배열만 읽고 씁니다. 미선택 기본 꺼짐·프로젝트별 선택/해제, 최대128개/8KiB·중복/알 수 없는 필드·지원 버전·형식을 확인합니다. 읽기/잘못된 설정은 원문을 보존하고, 쓰기 실패는 전달합니다. 다른 Storage 키/악보/음원/경로는 건드리지 않습니다.
- `src/shared/json.ts`: 기존 JSON 악보의 중복 키/이스케이프 별칭 검사 함수를 이동해 재사용했습니다. JSON.parse 문법 확인/깊이128제한을 유지하며 `score/scoreJson.ts`는 같은 공통 파서를 사용합니다. 원래 JSON 경계 회귀도 실행했습니다.
- `useScoreAutosave.ts`: 저장된 선택을 읽되 손상/읽기 실패는 기본 꺼짐과 안내, 명시적 선택 보존 실패는 현재 실행에만 적용/다음 실행 다를 수 있음을 표시합니다. 기존 원본/revision/첫 수동 저장·30초/정지/녹음·채점 잠금을 유지합니다. 저장 예외를 해당 프로젝트에만 연결해 다른 복원 프로젝트를 막지 않게 했습니다.
- `ScoreAutosave.tsx`: 기존 체크/안내를 재사용하고 관측한 Storage 오류만 별도 alert로 표시합니다. 불필요한 디자인/새 화면·의존성은 추가하지 않았습니다.
- 검사: 신규 `scoreAutosavePreference.test.ts`4개, 기존 `useScoreAutosave.test.tsx`의 복원/손상·프로젝트 전환/녹음 잠금, `useProjects.test.tsx`의 설정 격리. docs/00·12 선행 정의, docs/04·07·08·09/루트README·progress/PHASE-05·08·README에 최신 범위/결과를 갱신합니다.
- 새 IPC/DB/Python·Rust/녹음/모니터 기본값 변경 없음. 선택은 WebView 로컬 편의 설정이며 기존 프로젝트 ZIP 백업/다른 PC 복원에는 넣지 않습니다.

### 3. 테스트 결과

- 성공: `pnpm typecheck`, `pnpm lint`; 대상 `vitest run src/features/score/scoreJson.test.ts src/features/library/scoreAutosavePreference.test.ts src/features/library/useScoreAutosave.test.tsx src/features/library/useProjects.test.tsx`4파일28개/15.80초. 기존 악보의 중복 키/이스케이프·원본/저장 경로와 새 선택의 읽기/쓰기·해제/다른 설정 보존·손상/다른 버전/필드/ID/키·경계128개·Storage 접근 거절/공간 부족을 확인했습니다.
- 발생 오류/해결: 프로젝트 ID가 없는 상태에서 optional chain 동등 비교가 null 선택을 반환하던 TypeScript 오류2건을 명시적 choice 존재 확인으로 고쳤습니다. 수정 후 타입/lint·대상28개 성공.
- 추가한 복원 프로젝트/이전 저장 예외 격리·녹음 잠금 검사와 전체 프론트/빌드·새 내장/Windows는 진행 중입니다. 실제 WebView 재실행 복원은 **미실행/후속 확인 대기**입니다.
- Rust 전체/Clippy·모델/Python/실제 입력 재검사는 **미실행** — 해당 소스가 동일하며 이전 같은 native231개/release232개 결과를 유지합니다. 새 dist 번들/Windows 검사는 별도로 진행합니다.

### 4. 미구현 및 알려진 문제

- 자동 저장은 이전과 같은 적용 편집/저장된 원본·revision 범위이며 강제 종료 전용 복구·미적용 폼/프로젝트 없는 악보는 미구현입니다.
- WebView 데이터 삭제/앱 데이터 초기화 시 선택이 사라집니다. 이 편의 선택은 프로젝트 백업/다른PC로 옮기지 않습니다. 미지원/손상 설정을 임의 초기화하지 않고 현재 선택/오류를 안내하며 전용 설정 복구/초기화 UI는 미구현입니다.
- 설정 쓰기 실패 시 사용자가 현재 실행에서 고른 값만 적용됩니다. 다음 실행에는 이전 저장값일 수 있으므로 실제 오류를 표시합니다. 오류 원문/프로젝트 경로/개인 음원은 로그나 설정에 넣지 않습니다.

### 5. 다음 작업 계획

전체 검사/빌드→현재 DB/모델 백업/보존과 고정 후보 전환→사용자 프로젝트의 선택 켜기/끄기가 실제 앱 재실행 뒤에도 유지되는지 확인합니다. 대기 중 기존 앱을 유지하며 독립 ZIP 검증을 이어갑니다. 그 결과까지 기존 실행 한정 정책을 완전히 해소했다고 기록하지 않습니다.


### 선택 복원 전체 회귀의 실패 수정

첫 전체381개 중380개 성공/1개 실패로 다른 프로젝트에서 같은 문서 객체를 사용하는 전환 검사에 걸렸습니다. 저장 예외 안내만 분리해도 기존 ‘시도한 문서’ 참조가 전역이라 새 프로젝트를 막았습니다. 재시도 기록도 projectId+document로 구분해 같은 프로젝트/편집의 무한 재시도 금지는 유지하고 다른 프로젝트는 독립적으로 처리하도록 수정했습니다. 전체 검사/빌드를 재실행 중이며 기존 테스트를 제거하거나 잠금을 완화하지 않았습니다.


### 선택 복원 전체 프론트 회귀 성공

수정 후 `pnpm typecheck`·전체ESLint 및 `pnpm test` **96파일/381개27.15초 성공**입니다. 복원 프로젝트/같은 문서의 이전 실패 기록·녹음 잠금 회귀도 성공했고 기존 JSON 경계/원본·저장과 입력·모니터 기본 꺼짐 등 기존 기능을 유지했습니다. 새 Vite/포맷·Windows 적용/실제 재실행 수용은 진행 중입니다.


### 선택 복원 프론트 빌드 및 현재 앱 관측

`pnpm build`(타입 검사 포함·Vite1분4초)와 `pnpm format:check` 성공입니다. main1,566.55kB/큰chunk 경고는 기존 제약입니다. 기존 제어PTY74112는 현 도구 세션에서 찾지 못했으므로 종료 요청을 전달하지 않았습니다. 권한 있는 새 프로세스 관측에서 작업 경로의 GuitarLab 목록은 빈 배열이었고, 이전 PID의 종료 코드0/정상 종료를 새로 관측했다고 주장하지 않습니다. 새후보 전 실제 DB9/16테이블 백업과 진행녹음0 확인을 완료했습니다. 내장3개/고정 Windows 빌드를 진행하며 현재까지 기존 앱을 강제 종료하거나 입력/REC를 시작하지 않았습니다.


### 선택 복원 Windows 빌드 성공

최신dist의 `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`3개/0.01초(컴파일39.94초)와 `pnpm tauri build --debug --no-bundle --ci --config src-tauri/target/runtime-validation/autosave-preference-7f860838-2798-43a4-86ae-efbb47f267af.conf.json -- --locked --offline`24.20초가 성공했습니다. MSVC import library/macOS용 .app identifier 안내와 기존큰chunk 경고는 유지합니다. native 소스/DB/Python·모델은 변경하지 않았고 새자산/권한·고정실행파일은 실제 빌드했습니다. runtime/EXE를 새UUID portable에 검증 복사한 뒤 제품 앱을 열어 기존16테이블·모델4marker 보존을 확인합니다.


### 선택 복원 Windows 적용/재실행 수용 대기

- 새 portable/7f860838-2798-43a4-86ae-efbb47f267af·EXE40,675,840바이트/SHA `3608d8b81ed4b16716337d3e5644c4c79a0fa57710e2a9ed8b66fd44b17db9a4`, runtime3393개/64,095,996바이트 전체 지문 재확인/복사 성공입니다. `stage-candidate-20261022.py`는 이 작업의 target 내부 검증 도구이며 새UUID만 생성하고 런타임 전체 파일/링크/지문·복사본 지문을 assert했습니다.
- 이전 앱이 없는 상태에서 새 **PID28960/제어PTY23083·‘GuitarLab · 자동 저장 선택 복원’** READY/응답을 확인했습니다. 실제 DB9/16개 테이블·모델4marker가 사전 백업과 동일합니다. autosave-preference-db-before/after.json 및 autosave-preference-candidate.json/portable-candidate.json에 기록했습니다. 입력/모니터/REC를 자동 시작하지 않았습니다.
- 사용자에게 기존 프로젝트에서 ‘악보 자동 저장’만 켜고 오류 유무를 알려달라고 요청했습니다. 답변 전 앱을 유지하고, 확인 뒤 동일 EXE를 정상 종료/재실행해 선택 복원을 확인합니다. 이 실제 재실행 수용은 **미실행/응답 대기**입니다.


### 선택 복원 검증 ZIP 및 변경 파일 정리

- 새 ZIP validation-packages/2f4508d0-c9c0-4dcf-9145-e4070e1b95bc/GuitarLab-validation.zip은3,612개/39,970,803바이트/SHA `2c6a2ca395f64d1f86007c2c06cbf8aaa43595d916bfbbd388eef5f8a12e3911`입니다. 전체 목록/CRC/SHA 확인과 같은 바이트의 새 UUID 추출·각 파일 지문을 확인했습니다. 추출 대상은 validation-roundtrip/1cb6fddf-7031-4319-b188-ddcc98d69c3b/GuitarLab이며 autosave-preference-package-roundtrip.json에 기록했습니다.
- 이번 제품/검사 변경 파일 전체: 신규 `src/features/library/scoreAutosavePreference.ts`·`scoreAutosavePreference.test.ts`, `src/shared/json.ts`; 수정 `src/features/library/useScoreAutosave.ts`·`useScoreAutosave.test.tsx`·`useProjects.test.tsx`·`ScoreAutosave.tsx`, `src/features/score/scoreJson.ts`. 파서 이동/설정 보존과 프로젝트별 예외/재시도 격리·오류 표시·검사 격리가 각각의 이유입니다.
- 문서 변경: 루트 README, docs/00·04·07·08·09·12와 progress/PHASE-05·08·README. 새 미구현/검증 대기를 실제 완료로 표시하지 않으며 이전 기록은 보존했습니다. 개발 영수증/검증 복사·DB백업은 Git제외 target 아래 새UUID에만 생성했고 사용자 프로젝트/편의 설정은 ZIP에 포함하지 않았습니다.
- 현재 남은 수용은 사용자가 프로젝트에서 선택을 켰다는 응답→같은 고정 앱 정상 종료/재실행→동일 프로젝트에서 켜짐 유지 확인입니다. 응답 전에 앱을 닫거나 원본/실행 파일을 바꾸지 않습니다.


### 선택 복원 ZIP 독립 실행 점검 성공

최신ZIP2f4508d0…/3,612개/39,970,803바이트/SHA2c6a2ca3…의 전체 CRC/지문과 동일 바이트 새폴더 추출·각파일 SHA를 통과했고, 기본 PowerShell5.1 Test-ValidationPackage.ps1의 전체지문/최소PATH Python3.12.15 두 번도 성공했습니다. autosave-preference-package-roundtrip.json 상태ZIP_AND_POWERSHELL51_CHECKED입니다. 현재 PID28960/PTY23083 앱과 사용자 설정/자료는 변경하지 않았습니다. 프로젝트에서 선택을 켰다는 응답 뒤 동일 빌드를 정상 재실행할 예정이며 실제 재실행 선택 복원은 여전히 **미실행/수용 대기**입니다. 새 NSIS/백신·새PC·서명/최종배포 미실행은 유지합니다.


### 선택 켜기 오류 없음 확인/동일 빌드 재실행 준비 — 2026-10-22

사용자가 프로젝트에서 ‘악보 자동 저장’을 켠 뒤 오류가 없는 것으로 응답했습니다. 선택 조작의 오류 없음만 수용했고 재실행 복원 성공은 아직 확인하지 않았습니다. 제어PTY23083에서 PID28960/정확한 창 제목·응답 상태를 다시 관측하고 정상 CloseMainWindow를 요청했습니다. 원본·설정 값을 대신 수정하거나 제품 소스를 변경/재빌드하지 않습니다. 실제 종료 확인 뒤 지문이 같은 고정 후보만 다시 엽니다.


## 자동 저장 선택 복원 실제 수용 완료 — 2026-10-22

### 1. 작업 개요

완료 날짜2026-10-22. 사용자가 선택 켜기 오류 없음과 동일 앱 완전 재실행/같은 프로젝트에서 체크 유지를 확인했습니다. 프로젝트별 선택 복원의 구현·자동 검사·Windows 적용/재실행 수용·문서화를 완료했습니다. 끄기/손상·프로젝트 간 격리는 자동 검사이며 실제 끄기 뒤 재실행 수동 수용으로 확대하지 않습니다.

### 2. 구현/변경

추가 제품 변경 없이 제어PTY23083의 PID28960 정상 CloseMainWindow/EXITED0/forced=false 뒤 동일SHA3608d8b8… 후보만 다시 열었습니다. 새PID25868/PTY36815·‘GuitarLab · 자동 저장 선택 복원’ READY/응답을 확인했습니다. autosave-preference-candidate.json/portable-candidate.json을 AUTOSAVE_PREFERENCE_ACCEPTED로 갱신했고 progress/README·로드맵/계약과 관련 문서 최신 상태를 정리합니다.

### 3. 테스트 결과

- **성공(사용자)**: 선택 켜기 오류 없음, 앱 완전 정상 재실행 후 같은 프로젝트에서 다시 누르지 않아도 체크 유지.
- **성공(직접 실행)**: 실행 파일 SHA동일/정상종료0/새창 응답·재실행 후 기존 DB9/16테이블·모델4marker 기준 동일. 앞선381개/타입/lint/build·내장3개/Windows24.20초·독립ZIP/PS5.1/Python2회 성공도 유지합니다.
- 코드/빌드/전체 자동 검사 재실행은 **미실행** — 이번 수용 단계는 동일 실행 파일만 재실행했으며 소스를 바꾸지 않았습니다. 실제 끄기 후 재실행/새 NSIS·AV/별도Windows·서명/최종배포는 **미실행**입니다.
- 새 오류는 보고되지 않았습니다. 앞선 선택 null 타입/프로젝트 간 재시도 기록 실패 및 해결 이력은 유지합니다.

### 4. 미구현/제약

강제 종료 전용 초안 복구·미적용 폼/프로젝트 없는 악보·선택을 포함하는 프로젝트 백업/다른PC 복원은 미구현입니다. Storage삭제 시 기본으로 돌아가며 손상된 설정의 전용 초기화/복구 UI도 미구현입니다.

### 5. 다음 작업

현재 PID25868/PTY36815 고정 앱과 저장 자료를 유지합니다. 다음은 F-06의 새 기타 악보 트랙 직접 추가를 기존 편집/Undo·Redo·정규화 렌더·프로젝트 저장에 연결하는 작은 후속입니다. 특화 AI/고급 주법/별도Windows 등 외부 수용 조건은 유지하며 실제로 만든 범위만 기록합니다.
# 기타 악보 트랙 직접 추가 후속 — 2026-10-22

## 1. 작업 개요

F-06의 새/기존 악보에 기타 트랙을 직접 추가하는 한 수직 슬라이스입니다. 작업 날짜2026-10-22, 구현/자동 회귀 완료·Windows 사용자 수용 전입니다. 아래 이전 자동 저장 선택 복원 수용 완료 기록은 유지합니다.

## 2. 구현 및 변경 사항

- `scoreStructure.ts`: 기존 StructureEdit에 ADD_GUITAR_TRACK을 추가했습니다. 새 UUID/중복 없는 기타 N(표시용 공백 동등 비교)·표준6줄/UNKNOWN·빈 notes를 추가하고 128개/미지원 문서를 검증합니다. 기존 트랙/음표·박자·템포/수동 앵커는 유지합니다.
- `useScoreEditing.ts`: 기존 history/렌더/일시정지를 재사용하고 새 트랙 선택, Undo로 사라진 현재 선택의 첫 유효 트랙 복귀를 연결했습니다. 원본·savedRevision은 유지합니다.
- `ScoreEditor.tsx`: 최소 추가 버튼과 원본에 없는 트랙의 비교 안내만 추가했습니다. 기존 노트 폼/역할·튜닝·프로젝트 저장·출력 경로를 재사용합니다.
- `scoreStructure.test.ts`, `useScoreEditing.test.tsx`, `src/app/scoreSession.test.tsx`, `useProjects.test.tsx`: 경계/거부·실제 렌더/왕복·선택/Undo·Redo·모드 전환·저장/재열기·이전 버전 불변 검사를 추가했습니다.
- 구현 전 docs/12 계약, docs/04·08·09와 이 진행 기록을 갱신했습니다. 새 의존성/IPC·DB9/Python·실시간 오디오 변경은 없습니다.

## 3. 테스트 결과

- 첫 대상37개 중36개 성공/1개 실패: alphaTab1.6.1이 표시용 트랙 이름의 공백을 NBSP로 바꿔 문자열 비교가 달랐습니다. 음표/시간 손실은 아니며 해당 표시 비교를 명시적으로 정규화하고 이름 충돌 검사에도 반영했습니다.
- 최종 `pnpm test`: **성공386개/96파일·28.48초**. 앞선 전체386개/27.03초 성공 후 표시 이름 충돌 회귀와 테스트 타입 단언을 보완해 재검사했습니다.
- `pnpm typecheck`: **성공**. `pnpm build`: **성공**, 최종 Vite52.73초·main1,567.49kB. 기존500kB 초과 chunk 안내는 유지합니다.
- 전체 `pnpm lint`, `pnpm format:check`: 첫 구현 기준 **성공**. 이름 공백/테스트 후속 변경의 최종 검사는 진행 중입니다.
- 최신 Windows 내장 번들/실행·실제 트랙 추가/저장 복원, 새 ZIP/기본PS5.1 독립 검사는 아직 **미실행** — 최신 UI 빌드 후 수행합니다. native 전체/Clippy/모델·Python은 **미실행** — 해당 소스를 변경하지 않았고 이전 검증과 구분합니다.

## 4. 미구현 및 알려진 문제

트랙 삭제·이름 변경·재정렬/화음·주법·강제종료 전용 복구는 미구현입니다. JSON은 앱 전용 ID/역할/싱크를 보존하지만 MusicXML의 앱 metadata 보존은 지원하지 않습니다. 추가 트랙은 악보이며 별도 기타 오디오나 AI 분리를 생성하지 않습니다. 기존 6줄 단성/256마디·총2000음 편집 한도를 유지합니다.

## 5. 다음 작업 계획

최종 lint/포맷→번들 권한·자산 검사→고정 Windows 후보 준비→기존 앱 정상종료·DB/모델 보존 확인→간단한 사용자 트랙 추가/저장 복원 수용 순서로 진행합니다. 사용자 앱은 후보 준비 전까지 유지합니다. 실제 수용과 독립 패키지 검증을 문서화하기 전 이 후속을 완료로 표시하지 않습니다.

## 기타 트랙 후보 최종 자동 검사·Windows 적용

- 최종 `pnpm lint`와 `pnpm format:check` 모두 **성공**. `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests` 최신 자산/원격 ACL·로컬 안내3개 **성공**(실행0.00초/컴파일35.36초).
- `pnpm tauri build --debug --no-bundle --ci --config src-tauri/target/runtime-validation/manual-track-15425558-5ae9-465d-82fd-187553651ae5.conf.json -- --locked --offline`: **성공23.34초**. MSVC import library/macOS identifier 안내 및 이번 sandbox의 incremental hard-link 실패→복사 경고가 있었고 빌드는 정상 완료했습니다. 권한을 넓히거나 캐시를 삭제하지 않았습니다.
- 새 portable UUID15425558-5ae9-465d-82fd-187553651ae5의 runtime3393개/64,095,996바이트를 잠금 지문/경로·링크 검사 후 복사·재검사했습니다. EXE40,676,352바이트/SHA `110001da24145ce3c3c0c0faf67c73ea66fe7234175f8a00e557af901ee0fbf5`입니다.
- 제어PTY36815에서 기존PID25868에 정상 종료를 요청해 EXITED0/forced=false를 관측했습니다. 새PID26692/PTY71808·‘GuitarLab · 기타 트랙 추가’ READY/응답을 확인했습니다. 전환 전 실제DB9 백업, 전후16테이블의 행수/전체지문·4모델 marker 동일 검사 **성공**. 사용자 프로젝트/녹음은 변경하지 않았습니다.
- manual-track-candidate.json/portable-candidate.json은 WINDOWS_RUNNING_ACCEPTANCE_PENDING입니다. 테스트 프로젝트에서 트랙 추가→프렛3→저장/재열기를 요청했고 사용자 실제 수용은 **미실행/응답 대기**입니다. 입력/REC/모니터를 시작하지 않았습니다. 답변 전 앱과 제품 소스는 유지하며 새 ZIP/기본PS5.1 검사를 진행합니다.

## 기타 트랙 추가 후속 수용·문서화 완료 — 2026-10-22

### 1. 작업 개요

완료 날짜2026-10-22. 새/기존 기본 단성 악보의 빈 기타 트랙 추가·기존 편집/저장 연결이라는 후속 범위의 자동 검사·Windows 사용자 수용·문서화를 완료했습니다. 전체Phase6B/7/8 또는 고급 편집 완료는 아닙니다.

### 2. 구현/변경 사항

추가 제품 코드는 바꾸지 않았습니다. 사용자가 현재PID26692/PTY71808에서 새 트랙/프렛3을 저장·다시 열어 유지됨을 확인했습니다. manual-track-candidate.json/portable-candidate.json을 MANUAL_TRACK_ACCEPTED로 갱신했습니다. 변경 파일은 앞선7개 소스/테스트와 docs/04·08·09·12/README·진행 문서이며 이 수용 단계에는 문서/검증 영수증만 갱신했습니다.

### 3. 테스트 결과

- **성공(사용자)**: 새 기타 트랙·프렛3 추가→프로젝트 저장/다시 열기 후 추가 트랙과 숫자3 유지.
- **성공(직접 실행)**: 새 ZIP3612파일/39,971,159바이트/SHA554f29f9… 전체 구조/CRC/지문·동일 바이트 새 폴더 추출/각파일 지문과 기본PowerShell5.1 Test-ValidationPackage.ps1의 개발 PATH 제외 Python3.12.15 실제2회 실행. receipt는 manual-track-package-roundtrip.json의 ZIP_AND_POWERSHELL51_CHECKED입니다.
- 최종386개·타입/전체lint/포맷·빌드/내장3개/Windows·실제DB/모델 보존 결과는 앞선 기록을 유지합니다. 새 오류는 보고되지 않았고 공백 비교 실패/해결 기록도 유지합니다.
- 앱 완전 재실행 후 새 트랙/새 JSON·MusicXML의 사용자 파일 선택 재가져오기·새 NSIS/AV/별도Windows는 **미실행**입니다. 이번에 확인한 ‘프로젝트 다시 열기’와 구분합니다. 전체 자동 검사를 수용만을 위해 반복 실행하지 않았습니다.

### 4. 미구현/제약

이름 변경·트랙 삭제/재정렬·화음/주법·강제 종료 초안 복구는 아직 미구현입니다. 기본6줄/단성·256마디·총2000음·128트랙 한도, MusicXML 앱 metadata 제외와 오디오 stem 별도 모델 정책을 유지합니다.

### 5. 다음 작업

현재 수용한 고정 앱을 유지하면서 F-06 트랙 설정의 이름 변경을 기존 구조 편집/history·검증/출력·프로젝트 저장에 연결합니다. 새 계약·정상/잘못된 이름/잠금·Undo/Redo·다른 트랙/원본 보존을 먼저 검사하며 다음 후보 준비 전 기존 앱은 재시작하지 않습니다.

## 기타 트랙 이름 편집 후속 — 2026-10-22

### 1. 작업 개요

작업 날짜2026-10-22, F-06의 트랙 이름 설정 한 수직 슬라이스입니다. 직전 트랙 추가 후속의 실제 저장/프로젝트 재열기와 문서 완료를 검토한 뒤 착수했습니다. 구현/자동 검사 완료·Windows 적용과 사용자 수용 전입니다.

### 2. 구현/변경 사항

- 구현 전 docs/12에 SET_TRACK_NAME 계약을 추가했습니다. 기존 `scoreStructure.ts`에서 선택 ID·1~200 Unicode문자·제어문자·다른 트랙과 중복(표시용 NBSP 동등 비교)을 검증하고 이름만 바꿉니다. 공통 이름 비교로 트랙 추가의 중복 회피도 유지합니다.
- `ScoreStructureEditor.tsx`: 선택 이름/적용 버튼만 추가하고 기존 편집 컨트롤러·history·잠금·렌더·프로젝트 저장을 재사용합니다. 별도 상태 저장/IPC·DB/의존성은 없습니다. UI 미적용 폼은 문서에 쓰지 않습니다.
- `scoreStructure.test.ts`, `useScoreEditing.test.tsx`, `src/app/scoreSession.test.tsx`, `useProjects.test.tsx`: 이름 경계/거부·다른 트랙/음표·싱크/원본 불변, XML escape/JSON·실제 렌더, 선택 ID·Undo/Redo/잠금·미적용 폼/오류, 이름·역할 저장/재열기를 확인합니다.

### 3. 테스트 결과

- `pnpm test`: **성공390개/96파일·26.68초**. 이번 이름 후속 검사에서 새 실패는 없습니다. 기존 alphaTab 공백 표시 차이를 회귀에 반영했습니다.
- `pnpm build`(타입 검사 포함): **성공**, Vite55.15초/main1,568.53kB·기존500kB 초과 안내. `pnpm lint`, `pnpm format:check`: **성공**.
- 최신dist 번들3개 검사 실행 중, Windows 고정 후보/실제 이름 저장 복원·새 ZIP/기본PS5.1은 **미실행** — 해당 단계 전입니다. Rust 전체/Clippy/MSRV·AI 모델/실제 장치 검사는 **미실행** — 코드/의존성을 변경하지 않았습니다.

### 4. 미구현/알려진 문제

트랙 삭제/재정렬·고급 화음/주법·강제 종료 초안 복구는 미구현입니다. 이번 이름 적용도 기존 기본6줄 단성 편집 한도를 따릅니다. 입력 중인 미적용 폼은 저장/자동 저장·종료 보호의 적용 문서가 아니므로 ‘트랙 이름 적용’이 필요합니다. 추가/이름은 악보 metadata이며 오디오 파일 이름이나 역할 태그를 자동 변경하지 않습니다.

### 5. 다음 작업

내장 번들/Windows 실행·runtime 전체지문·기존 DB/모델 보존→선택 트랙 이름/Undo·Redo/저장·재열기 사용자 수용→독립 ZIP/PS5.1 순서로 검증합니다. 후보 준비 전 현재PID26692/PTY71808 앱을 유지합니다. 문서/수용 전 완료로 표시하지 않습니다.

### 이름 편집 후보 Windows 빌드 결과

최신dist의 `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`3개가 **성공**했습니다(실행0.00초·컴파일15.34초). `pnpm tauri build --debug --no-bundle --ci --config src-tauri/target/runtime-validation/manual-track-name-221cec21-d900-4344-a2d0-19dee68df61d.conf.json -- --locked --offline`도 **성공22.18초**입니다. 기존chunk/identifier/MSVC 안내와 incremental hardlink 실패 후 복사 경고는 유지합니다. 새runtime/EXE를 UUID별 portable에 검증 복사 중이며 새 창 실제 실행/사용자 이름 저장 복원은 아직 미실행입니다. 전환 전 실제DB9/16테이블을 작업 폴더로 백업했고 데이터/모델을 수정하지 않았습니다.

### 이름 편집 후보 실제 실행/데이터 보존

전환 전 새 트랙 저장이 포함된 실제 DB9/16테이블을 백업했습니다. 기존 제어PTY71808/PID26692 정상 CloseMainWindow/EXITED0/forced=false 뒤 새PID31904/PTY71755·‘GuitarLab · 기타 트랙 이름’ READY/응답을 확인했습니다. runtime3393개 전체 SHA/경로·링크·크기 확인·새UUID portable/221cec21-d900-4344-a2d0-19dee68df61d 복사/재검증과 EXE40,676,864바이트/SHA `3296bdd8d350b2f68504fe83e531d42f1bba06c0bbeca8993bdc1bbc143cc569` 지문을 기록했습니다. 전후 기존16테이블 행수/전체 지문과4모델 marker는 동일합니다. manual-track-name-candidate.json/portable-candidate.json은 WINDOWS_RUNNING_ACCEPTANCE_PENDING입니다.

사용자에게 같은 프로젝트에서 이름 ‘내 리드’ 적용/Undo·Redo·저장/다시 열기를 요청했고 실제 수용은 응답 대기·**미실행**입니다. 답변 전 앱과 제품 소스를 유지합니다. 새 ZIP3612파일/39,971,305바이트/SHA `a377ccf20ee446580583d1ed271d826dca2c89bef3b149e13b7f30fe986092fb`의 생성/전체 manifest·CRC/지문은 성공했고 새 폴더 추출/기본PS5.1 점검을 진행합니다. 새 NSIS/AV/별도Windows/서명·최종배포는 미실행입니다.

### 이름 편집 후보 독립 ZIP 최종 검사

동일 원본 ZIP 바이트의 CRC·manifest·전체 지문을 검증한 뒤 새 폴더 validation-roundtrip/10328260-8437-495e-8472-1fadcb1bb9e5/GuitarLab로 추출하고 각파일 지문을 다시 검사했습니다. 기본PowerShell5.1 Test-ValidationPackage.ps1이 전체 지문·개발 PATH 제외 Python3.12.15 실제2회를 성공(exit0)했으며 manual-track-name-package-roundtrip.json은 ZIP_AND_POWERSHELL51_CHECKED입니다. 모델 설치/사용자 앱 조작·개인 데이터 변경은 없습니다. 사용자 이름 저장·재열기는 아직 응답 대기이며 앱/소스는 유지합니다.

## 트랙 이름 편집 수용·문서화 완료 — 2026-10-22

### 1. 작업 개요

완료 날짜2026-10-22. 사용자 ‘잘댐’ 응답으로 이름 ‘내 리드’ 적용/Undo·Redo·프로젝트 저장/다시 열기 유지까지 확인했습니다. 기본 단성 트랙 이름 편집 후속을 구현·자동 검사·Windows 수용·문서화 완료했습니다.

### 2. 구현/변경 사항

이번 수용 단계는 제품 소스/앱을 바꾸지 않고 manual-track-name-candidate.json/portable-candidate.json을 MANUAL_TRACK_NAME_ACCEPTED로 갱신했습니다. 앞선 scoreStructure·ScoreStructureEditor와4개 회귀 파일, 계약/악보/로드맵/검사/진행 문서가 이 이름 후속 변경 범위입니다. 역할·음표/원본·싱크/DB/Python은 유지합니다.

### 3. 테스트 결과

- **성공(사용자)**: 이름 적용/되돌리기·다시 실행, 저장/프로젝트 다시 열기 후 이름 유지.
- **성공(직접 실행)**:390개/타입·lint/포맷·빌드/내장3개/Windows·기존DB/모델 보존 및 새ZIP/새폴더/전체지문·기본PS5.1/독립Python2회. 정확한 명령·시간/지문은 앞선 결과를 따릅니다. 이번 수용만을 위해 동일 전체 자동 검사를 반복하지 않았습니다.
- 새 오류는 보고되지 않았습니다. 이름 적용 이후 앱 완전 재실행·새 NSIS/Defender·별도Windows·서명/최종배포는 **미실행**이며 프로젝트 다시 열기 수용과 구분합니다.

### 4. 미구현/제약

트랙 삭제/재정렬·고급 화음/주법·강제 종료 초안 복구·미적용 폼 저장은 미구현입니다.6줄 단성/256마디·2000음·128트랙과 역할/오디오 별도 정책은 유지합니다.

### 5. 다음 작업

현재PID31904/PTY71755 수용 앱을 유지합니다. Phase8의 악보 가져오기 크기/파싱 오류 경계를 실제 설치 코드·현재 보호/테스트와 대조하고, 기존 동작을 불필요하게 재작성하지 않는 범위에서 안정성을 보완합니다. 추가 공개 주법 자료 조사는 연속 정답/조건 미확정 상태를 유지하며 고급 점수를 활성화하지 않습니다.

