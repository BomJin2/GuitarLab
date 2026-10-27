# Phase 4A — 입력 녹음과 다시 듣기

## 후속 — 테이크 정보 저장 중 재생 유지 (2026-10-27)

### 1. 작업 개요

작업일 2026-10-27. 이름/메모와 정렬 offset 변경만으로 WAV/악보를 다시 읽어 재생이 멈추고 위치가 초기화되는 문제를 수정했습니다. 대상12개·전체646프론트/타입/lint 성공이며 포맷/웹·Windows·Git/원격 확정은 후속입니다. 기존 녹음/원본·기본 수용은 유지합니다.

### 2. 구현 및 변경 사항

- `docs/12`, `docs/09`, `docs/17`: 파일 내용 식별자와 가변 정보의 구분, 실제 재읽기·A/B 최신 offset과 검증 기준을 먼저 기록했습니다. IPC/DB·녹음 파일·원본/보정·배속/볼륨/부분 반복 형식은 변경하지 않습니다.
- `TakeReplay.tsx`: 파일/악보 읽기를 프로젝트·테이크 ID/내용 SHA·프레임/샘플레이트·저장 악보 revision/트랙과 명시적 재읽기에 연결했습니다. 이름/메모 변경은 기존 미디어/재생/위치를 유지하며 가벼운 최신 metadata 참조 갱신을 별도 layout 수명으로 옮겨 A/B는 새 정렬 offset을 사용합니다.
- `TakeReplay.test.tsx`:4개 회귀를 추가해 기존 이름/메모 변경의 재생 중단·offset 변경의 위치 손실을 재현하고 내용 변경/명시적 재읽기·진행 중 읽기 보존을 확인합니다. UI 디자인/네이티브 엔진과 외부 의존성은 변경하지 않습니다.

### 3. 테스트 결과

- 수정 전 **2개 실패/4개 성공**,4.10초를 재현했습니다. 이름/메모·offset 변경 뒤 읽기 횟수와 재생 위치가 달라졌습니다. 로그 `take-replay-metadata-red-20261027.log`.
- 수정 후 초기 대상 **11개 성공**,4.27초. 읽는 중 정보 갱신을 추가한 최종 `pnpm exec vitest run src/features/recordings/TakeReplay.test.tsx src/features/recordings/RecordingsPage.test.tsx src/features/recordings/TakeExportPanel.test.tsx`: **12개/3파일 성공**,4.94초입니다. 원곡 미디어·기존 A/B/TAB tick/음량/부분 반복도 유지합니다.
- `pnpm test`: **646개/122파일 성공**,48.20초. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: **성공**. `pnpm build`: **성공**,Vite2분2초/기존 큰 chunk 안내. 내장 자산/권한 **4개 성공**·Windows 빌드 **성공**,13.75초/기존 MSVC 링크 안내입니다. 새 Git/원격은 후속이며 로그 `take-replay-metadata-…-20261027.log`에 보존합니다.
- 앞선 목록/복구 소스4243408은 웹2분4초·내장4개/Windows14.40초·독립 ZIP3,613파일/40,293,800바이트·CRC/SHA·실제 PS5.1/최소 PATH Python3.12.15 두 번이 성공했습니다. 그 소스의 [Windows40503288346](https://github.com/BomJin2/GuitarLab/actions/runs/40503288346)/job122186116665는 진행 중이며 현재 재생 유지 소스와 구분합니다. 지문/영수증은 Phase8 후속에 기록합니다.
- 앞선 소스의 최종 실제 로그를 확인해 사후 정리까지 **전체 성공**으로 확정했습니다. 프론트642/122파일(99.39초), 기본Rust252/확장256(45.01/47.47초·각29개 기본 제외), 예제1+1·AI113(4.44초)/도구143(13.793초)·Clippy/MSRV1.90 성공입니다. 위 원격 대기는 확정 전 이력이며 재생 유지 추가 전 후보와 이후 코드를 구분합니다.
- 실제 새 GUI/개인 녹음·청취/REC·별도 OS는 **미실행** — 합성 WAV·모의 파일 API/미디어와 실제 PlayerEngine으로 검사하며 사용자 앱/입력·설치 모델/개인 DB는 조작하지 않았습니다. 새 로컬 전체 native/Python/도구 재실행은 **미실행** — 해당 엔진과 의존성은 기존 검증 소스와 동일합니다.

### 4. 미구현 및 알려진 문제

현재 청취 위치를 유지하면서 정렬 offset만 바꾸면 악보 커서 위치는 새 매핑으로 달라지는 것이 정상입니다. 다른 테이크/실제 내용 변경이나 명시적 다시 읽기는 기존처럼 재생 준비를 다시 수행하며 모든 상황에서 재생을 유지한다고 주장하지 않습니다. 실제 장치 청취·장기 동기/별도 OS 수용은 별도입니다.

### 5. 다음 작업 계획

최종 빌드·Git/원격과 두 수정이 포함된 독립 패키지를 확인하고 문서화합니다. 원본 녹음/사용자 앱은 유지하며 앞선 후보 검증을 새 코드의 검증으로 혼용하지 않습니다.

## 후속 — 녹음 목록·정보 저장·복구의 문맥 보호 (2026-10-27)

### 1. 작업 개요

작업일 2026-10-27. 녹음 페이지의 파일 작업을 화면에서 분리하고 프로젝트 전환/이탈 뒤 이전 목록·저장/복구 명령과 취소 종료 경계를 보완했습니다. 대상24개·전체642프론트/타입/lint/포맷은 성공이며 웹/Windows·Git/원격 확정은 진행 중입니다. 기존 Phase4A 기본 수용과 이번 후속의 실제 앱 미실행은 구분합니다.

### 2. 구현 및 변경 사항

- 먼저 `docs/12-API-CONTRACTS.md`, `docs/09-TEST-PLAN.md`에 문맥/명령·논리 조회 취소/복구 종료·원본 보존을 기록했습니다. `docs/17`에 화면/컨트롤러 분리와 상태 표시를 반영했습니다. 기존 IPC v1·DB/원본·녹음/모델 엔진은 변경하지 않습니다.
- `useRecordedTakes.ts`: 기존 페이지의 목록/정보 저장/복구를 옮겼습니다. 프로젝트 문맥의 첫 반환과 이전 명령/같은 ID 복귀·이탈을 보호하고 현재 잠금·목록의 실제 테이크 소유권/상태·정보 저장/복구의 중복을 확인합니다. 취소/전환 뒤 실제 쓰기 종료까지 잠금을 유지하고 현재 조회만 표시합니다.
- `recordings.ts`: 복구만 기존 StorageJob의 `waitForCancellation:true`를 사용해 실제 terminal까지 확인합니다. `useRecordedTakes`는 취소 뒤 실제 오류를 숨기지 않고 이미 완료된 복구본은 유지/재조회합니다. 이미 보낸 직접 정보 저장은 취소했다고 표시하지 않습니다.
- `RecordingsPage.tsx`: A/B·폼/재생 표시만 남기고 파일 명령을 컨트롤러에 전달합니다. 프로젝트 변경 때 선택/재생 패널을 해제하고 목록이 성공한 뒤에만 빈 목록을 안내합니다. 조회 취소·복구 취소/정리 중·실제 저장 안내를 구분하며 기존 청취/출력/분석·디자인 값은 유지합니다.
- `useRecordedTakes.test.tsx`, `RecordingsPage.test.tsx`, `recordingRecovery.test.ts`:18개 회귀를 추가했습니다. 모의 파일 API/DEMO 청취 표시와 가짜 타이머만 사용하며 실제 개인 WAV/DB를 읽거나 복구하지 않았습니다.

### 3. 테스트 결과

- 기존 동작을 컨트롤러로 옮긴 뒤 초기 **10개 실패**,3.57초를 재현했습니다. 프로젝트 첫 반환/이전 함수·외부 테이크/목록·중복 작업·늦은 저장 오류와 실제 복구 취소 종료를 검사했습니다. 로그 `take-list-context-red-20261027.log`. 초기 수정 후 **10개 성공**,3.50초입니다.
- 정상 저장/원본 객체 불변·목록 취소/재시도·취소 후 오류/완료 복구본·이전 취소·프로젝트 전환 중 실제 종료 대기를 보강했습니다. 기존 replay/출력까지 `pnpm exec vitest run src/features/recordings/useRecordedTakes.test.tsx src/features/recordings/RecordingsPage.test.tsx src/features/recordings/recordingRecovery.test.ts src/features/recordings/TakeReplay.test.tsx src/features/recordings/TakeExportPanel.test.tsx`: **24개/5파일 성공**,4.49초입니다.
- `pnpm test`: **642개/122파일 성공**,45.73초. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: **성공**. 첫 lint의 ref cleanup 경고는 기존 패턴처럼 effect 안에 ref 별칭을 두어 해결했습니다. UI 검사에서 A/B의 같은 옵션을 단일 요소로 찾던1개 실패는 A 선택칸 안으로 조회를 좁혀 해결했습니다. 로그 `take-list-context-target-final-20261027.log`, `take-list-context-front-20261027.log`.
- `pnpm build`: **성공**,Vite2분4초/기존 큰 chunk 안내. 내장 자산/권한 **4개 성공**, Windows `cargo build … --features custom-protocol` **성공**,14.40초/기존 MSVC 링크 안내입니다. 소스4243408을 main에 push했고 [Windows40503288346](https://github.com/BomJin2/GuitarLab/actions/runs/40503288346)/job122186116665는 진행 중입니다. 같은 소스의 독립 ZIP3,613파일/실제 PS5.1·최소 PATH Python3.12.15 두 번은 성공이며 뒤의 재생 유지 변경과 구분합니다. 보조 로그/산출물은 ignored `src-tauri/target/runtime-validation/`에 보존합니다.
- 원격 최종은 프론트642/252·256Rust·AI113/도구143·예제1+1·Clippy/MSRV1.90·사후 정리까지 **전체 성공**입니다. 이 목록/복구 슬라이스의 실제 검증 완료일은2026-10-27이며 위 대기는 확정 전 이력입니다. 독립 ZIP의 경로/지문은 Phase8 최신 절을 따르고 추가 재생 유지 코드의 검증과 구분합니다.
- 실제 새 GUI·개인 메타데이터 저장/복구·청취/REC·별도 OS는 **미실행** — 합성 metadata/모의 API로 수명을 확인하며 사용자 앱/개인 자료·입력/모니터·설치 모델은 조작하지 않았습니다. 전체 로컬 native/Python/도구 재실행은 **미실행** — 해당 엔진/의존성 변경이 없으며 새 소스의 원격 회귀와 구분합니다.

### 4. 미구현 및 알려진 문제

목록 조회는 이미 보낸 직접 읽기 명령을 강제 중단하지 않고 결과 적용만 취소합니다. 정보 저장은 이미 보낸 native 쓰기를 rollback하거나 취소할 수 없으며 실제 응답까지 기다립니다. 복구 취소와 완료가 경합하면 새 복구본을 삭제하지 않습니다. 원본 파일 삭제/덮어쓰기·완전 복원/고급 주법·별도 Windows 수용은 이번 범위가 아닙니다.

### 5. 다음 작업 계획

최종 웹/내장/Windows·Git/원격과 독립 패키지를 확인하고 정확한 결과/미실행을 확정합니다. 사용자 앱을 임의로 재실행하거나 개인 파일로 검증을 대신하지 않으며 이미 성공한 엔진 검사를 새 변경 없이 반복하지 않습니다.

## 후속 — 녹음 최대 입력 안내 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 입력 설정의 레벨 안내와 달리 녹음/다시 듣기에 숫자 peak만 보이던 부분을 보완합니다. 기존 검증된 최대값을 사용한 안내이며 별도 PCM 분석이나 고급 판정이 아닙니다. 기본 수용/전체 진행 상태는 유지하고 실제 앱 수용은 구분합니다.

### 2. 구현 및 변경 사항

- 먼저 docs/12에 원래 peak/1 기준·반올림/왜곡 비확정·데이터 불변 계약을 기록했습니다.
- `RecordingLevelNotice.tsx`는 검증된 peak를 받는 공통 순수 표시입니다. `RecordingPanel.tsx`/`TakeReplay.tsx`에 연결해 녹음 중·저장 후·A/B 선택에서 동일하게 입력 GAIN과 재생 음량의 차이를 설명합니다. 새 IPC/의존성·네이티브/저장 형식은 없습니다.
- 두 기존 통합 테스트에 실제1/1.2·반올림0.9996·take 해제·A/B 이동·음소거/음량과 독립된 안내/REC·STOP 불변 검증을 추가했습니다. docs/17·09·21에 기능/검사/초보자 안내를 반영합니다.

### 3. 테스트 결과

- `pnpm exec vitest run src/features/recordings/RecordingPanel.test.tsx src/features/recordings/TakeReplay.test.tsx`: **4개/2파일 성공**,3.79초.
- `pnpm typecheck`/`pnpm lint`/`pnpm format:check`: **성공**. `pnpm test`: **519개/112파일 성공**,36.90초(`recording-level-front-20261026.log`). 기존 재생 음량/A·B 비율을 새 최대값 fixture에 맞춰 확인했고 별도 실행 오류는 없었습니다.
- 웹/내장 자산·Windows 빌드/새 소스 원격: **미실행**, 이 문서 작성 후 이어서 검증합니다. native/Python 구현이 바뀌지 않아 전체 로컬 엔진 검사는 **미실행**이며 직전fc6628c의247/251Rust·AI113/도구143·MSRV 원격 성공과 구분합니다.
- 실제 앱/개인 녹음 청취·인터페이스 GAIN 변화: **미실행** — 현재 사용자 앱/자료·입력/REC를 조작하지 않습니다.

원격 확정: main `509ee966738a4277b2faebb36ff9ff028cfdd9c4`의 [Windows40254348865](https://github.com/BomJin2/GuitarLab/actions/runs/40254348865)/job121352878211는 정리까지 **전체 success**입니다.519프론트/112파일, 기본247Rust(45.72초)/확장251Rust(47.01초·각28개 기본 제외), 예제1+1·AI113(6.08초)/도구143(15.799초)·MSRV12.13초를 확인했습니다. `recording-level-ci-final-20261026.json`에 정확한 소스/실행을 보존하며 위 원격 대기는 이전 이력입니다. 이 UI 후속의 독립 새 ZIP·실제 사용자 앱 수용은 미실행이며 직전6393f5f 패키지/설치 영수증과 구분합니다.

최종 로컬 빌드: `pnpm build` **성공**,Vite1분27초·기존500kB chunk 안내입니다(`recording-level-build-20261026.log`). `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture`/`cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`는 **성공**이며 Windows 빌드는12.61초·기존MSVC 링크 안내입니다(`recording-level-{bundle,native-build}-20261026.log`). 위 빌드 미실행은 이전 이력이며 현재 앱은 재실행하지 않았습니다. 새 Git/원격은 이어 확인합니다.

### 4. 미구현 및 알려진 문제

최대값에는 구간/샘플 수·지속 시간 정보가 없습니다. 실제 아날로그 왜곡이나 clipping을 판정하거나 원본을 자동 보정하지 않습니다. float WAV는1 초과도 보존하는 기존 정책을 유지합니다. 네이티브 데이터/녹음·재생 볼륨 정책과 고급 채점은 변경하지 않습니다.

### 5. 다음 작업 계획

이 소스의 웹/Windows 내장 빌드·Git/원격 회귀를 확인하고 다음 독립 요구사항을 진행합니다. 기본9개/부분5개의 미수용 조건은 기존 로드맵을 유지합니다.

## 후속 — 테이크 원본 WAV 내보내기 (2026-10-25)

### 1. 작업 개요

완료일2026-10-25(코드/자동 검사, Windows 패키지·원격은 아래 상태 참조). 현재 선택한 READY 테이크의 전체 원본 WAV를 새 파일로 보존합니다. 기존 기본9단계 수용/5부분 상태는 유지하며 실제 앱 저장 창/개인 녹음 수용과 전체 출시 완료는 구분합니다.

### 2. 구현 및 변경 사항

- 구현 전 docs/12에 `export_recording` v1을 기록했습니다. 프로젝트/테이크 UUID만 받고 경로·PCM을 프론트로 반환하지 않습니다. 기존 StorageJob·취소/종료 보호·native 새 파일 선택 창을 사용하며 창 전후에 녹음 상태를 확인합니다.
- `storage/recording_export.rs`: 소유권/보관·READY·기존10분/256MiB 길이/전체SHA·정규 헤더 확인 후 원래 mono float32 바이트를 복사합니다.0.5× 녹음에도 배속/음량·부분 반복/정렬을 적용하거나 반주·시스템/YouTube 출력과 합치지 않습니다. 앱 데이터 안 목적지/기존 파일·손상/누락은 거부합니다.
- `storage/export_file.rs`: 기존 비덮어쓰기 저장에 진행 콜백 경로만 추가했습니다. 악보/믹스의 원래 함수는 유지합니다. 새 임시 파일 flush/sync→hard-link 게시를 재사용하고 게시 전 취소/진행 실패·동시 목적지 충돌에서 원본/기존 목적지를 보존합니다.
- `commands/recording_api.rs`/`app.rs`는 명령/엄격한 요청 검사, `takeExport.ts`/`useTakeExport.ts`/`TakeExportPanel.tsx`/`RecordingsPage.tsx`는 서비스·수명/취소·최소 UI를 분리합니다. 중복 시작/이탈 뒤 늦은 성공을 막고 브라우저 제한·누락/복구·metadata 미포함을 안내합니다.
- native3개/요청1개·프론트8개 회귀와 docs/09·17/로드맵·진행표를 갱신합니다. Python/DB·모델/새 의존성 변경은 없습니다.

### 3. 테스트 결과

- `pnpm typecheck`/`pnpm exec vitest run src/features/recordings/takeExport.test.ts src/features/recordings/TakeExportPanel.test.tsx`: **8개 성공**,2.81초. ID만 전달/정확한6필드·길이·SHA/손상·초기 취소·native 정리 대기·중복/이탈·오류/복구 경고를 검사했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features recording_export -- --nocapture`: **3개 성공**,0.57초. 자체48kHz/1초 원본/출력 바이트·SHA와0.5× metadata 불변·취소/진행 실패/충돌·내부 목적지/다른 프로젝트/보관·손상/헤더/누락/불완전 상태를 확인했습니다. `… export_take_request -- --nocapture`: **1개 성공**,0.00초(버전/UUID·임의 경로/추가 필드 거부). 게시 직전 동시 목적지 생성 거부도 최종 전체 검사에 포함합니다.
- `pnpm lint`/`pnpm test`/`pnpm format:check`: **성공**,전체 **484개/105파일**,40.50초. `cargo fmt --check`/확장Clippy: **성공**(13.04초). `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features`: **243성공/28개 기본 제외**,21.15초·컴파일22.41초. `cargo +1.90.0 check --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features`: **성공**,18.12초. 선택 창 뒤 녹음 재확인 연결은 후속 내장 검사에서도 확인합니다.
- 초기 타입 실패2건은 설치하지 않은 `toBeDisabled` 대신 DOM 속성 검사로 수정했습니다. native 첫 컴파일의 `canceled` import/fixture progress 인자를 연결했습니다. 첫 대상6성공/2실패는 Error를 record로 먼저 처리해 세부 코드 안내가 빠진 문제로, Error 우선 처리 후8개 통과했습니다. 실패를 성공으로 기록하지 않습니다.
- 로그 `runtime-validation/take-export-frontend-20261025.log`/`take-export-rust-20261025.log`를 보존합니다. Vite/Windows 내장·새ZIP/원격은 현재 검사 단계입니다. 실제 앱 저장 창·개인 WAV/청취·새OS/디스크 채우기/물리 전원 차단은 **미실행** — 자체 임시 파일/실패 주입만 사용했고 기존 앱·사용자 자료는 유지했습니다.

후속 로컬 빌드도 **완료**했습니다. `pnpm build`의 타입 검사/Vite1분26초가 성공했고 기존500kB 초과 chunk 경고는 유지합니다. 파일 선택 후 녹음 재확인 연결과 최종 충돌 원본 검사를 포함한 확장Clippy6.73초·대상native3개0.57초·내장 `bundle_tests`3개/0.00초(컴파일10.52초)도 성공했습니다. 내장 검사 문맥의 icon resource 조회 경고2회는 실제 앱 아이콘 수용과 구분합니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`은 **성공**,3.64초/40,904,704바이트·SHA `2c25a3e6343307068f30f0e455b7894971d7df1d9a5549a0eeedb494947ac7e9`입니다. 기존 MSVC 링크 안내 경고를 유지하고 새 앱은 실행하지 않았습니다.

독립 패키지 검사도 **성공**입니다. source `3fa728cc17054cd8a9a15dd74348eca0d3b1ffe2`/후보 `take-export-candidate-209468e3-98f9-4839-8ac8-d90722f1781f.json`에 새 앱 미실행 상태를 보존했습니다.3393runtime파일/64,095,466바이트와 lock SHA `191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d`를 검증했습니다. 새ZIP `validation-packages/8b2437b2-dd60-4662-8759-d20fcd689f52/GuitarLab-validation.zip`은3613파일/40,219,576바이트·SHA `fb502bc793df6a31e37005145120abdf0fc47d890aeb179f6efa7be1315b98e4`이며 전체SHA/CRC·같은 지문 새 추출·실제 Windows PowerShell5.1 `-File Test-ValidationPackage.ps1` exit0/개발 경로 제외 독립Python3.12.15 두 번이 통과했습니다. 영수증 `take-export-package-receipt-cdf4c405-0248-4ad2-8d24-561df8ae5309.json`/로그 `take-export-package-check-0f370562-5641-4951-88e5-6ddb35716772.log`를 유지합니다. 실제 사용자 앱·입력/녹음·generic portable-candidate는 건드리지 않았고 새 원격 회귀는 업로드 후 확인합니다.

### 4. 미구현 및 알려진 문제

기존 전체 읽기를 재사용해 native 최대256MiB 버퍼가 필요할 수 있으며 제한 메모리 구간 분석과 구분합니다. 전체 프로세스 최고 메모리는 실측하지 않았습니다. 원본 검사 동안 진행률0이며 출력 바이트로 진행합니다. hard-link가 불가능한 FAT/exFAT 등 목적지는 오류이며 덮어쓰기 폴백이 없습니다. 누락/복구 정보·메모/정렬은 앱에만 남고 잃은 구간은 복원하지 않습니다. MP3·부분 잘라내기·영구 삭제는 추가하지 않았습니다.

### 5. 다음 작업 계획

main1874417의 [Windows40183110904](https://github.com/BomJin2/GuitarLab/actions/runs/40183110904)/job121138145977는 **전체 success**입니다.485프론트·240/243Rust·AI113/도구143·MSRV/사후 정리까지 통과했고 이 원본 WAV 후속의 원격 검사도 확정했습니다. 실제 앱 선택 창/개인 녹음 내보내기는 미실행으로 유지합니다. `docs/21-QUICKSTART.md`에 원본 출력 순서와 전체 프로젝트 백업의 차이를 추가했습니다. 최종 기록/사용 안내는 로컬 커밋에 보존해 다음 실제 변경 push에 포함합니다.

악보 출력 안내 후속까지 포함한 source6d48613의 최종485프론트·내장Windows/새3613파일ZIP·실제PS5.1/독립Python 두 번도 성공했습니다. 현재 후보/최종 SHA는 [Phase5 최신 절](PHASE-05.md)을 따르고 위3fa728c/484개 패키지는 이 기능만의 이전 검증 이력으로 보존합니다. 두 후속의 새 원격 전체 결과는 업로드 뒤 확정합니다.

Vite/Windows 내장·독립 ZIP/실제PowerShell·번들Python·새 원격 전체 회귀는 모두 완료했습니다. 악보 내보내기 Error 후속도 재현/수정·검증을 완료했고 PHASE-05 최신 절을 따릅니다. 같은 수동 기타 검사를 반복 요청하지 않습니다. 실제 앱 저장 창/개인 청취와 고급 판정의 독립 정답·특화 가중치/별도Windows 수용 제약은 이 자동 검사로 완료 처리하지 않습니다.

## 1. 작업 개요

- 작업 시작: 2026-10-15, 사용자 재개 요청.
- 완료 날짜: 2026-10-15.
- 상태: 완료(아래 최종 결과 기준). 중간 진행 기록은 이력으로 보존합니다.
- 목표: 명시적 REC로 선택한 입력만 WAV에 기록하고, 불변 테이크를 프로젝트/악보 리비전에 연결해 다시 듣기·A/B·부분 재생·중단 복구를 제공합니다.

## 2. 구현 및 변경 사항

- 최종 결과: 입력 전용 녹음·원본 보존 복구·정렬 replay/A-B·부분 반복·메타데이터 저장과 앱 재실행 복원까지 구현/검증했습니다. 아래 단계별 ‘확인 전’ 문구는 당시 이력이며 현재 판정은 최종 결과/제약을 따릅니다.
- 입력 전용 WAV writer/명시적 시작·중지·진행 조회, 테이크 metadata와 추가 SQLite002, 원본 보존 복구 및 프론트 연결을 구현했습니다. 수정 후 실제 SSL Input 1 무반주 녹음과 WebView 재생을 사용자 확인했습니다. 로컬 정렬·오류 복구·재실행 복원은 확인 전입니다.
- `docs/progress/README.md`: 중단 상태를 재개 및 Phase 4A 진행 중으로 갱신했습니다.
- 새 파일: Rust `recording/{model,router,service,wave,mod}.rs`, `commands/recording_api.rs`, `storage/recordings.rs`, `storage/recordings_tests.rs`, `storage/migrations/002-recordings.sql`; 프론트 `features/recordings/{RecordingPanel,RecordingsPage,TakeReplay}.tsx`, `{recordings,useRecording,waveform}.ts` 및 관련 테스트, `src/test/recordingFixture.ts`.
- 수정 파일: `src-tauri/src/{lib,app}.rs`, `audio/{input,mod}.rs`, `commands/{mod,storage_api}.rs`, `storage/{database,projects,projects_tests,calibration,mod}.rs`; `src/app/{App,AppShell}.tsx`, `features/player/{PlayerEngine.ts,TransportBar.tsx,TransportBar.test.tsx}`, `features/library/projects.ts`, `features/score/ScoreWorkspace.tsx`, `features/practice/{InputPanel,ScorePanel}.tsx`, `shared/{styles.css,logger.ts}`. 입력 분기/시각 검증·API 등록·기존 job 재사용·녹음 중 잠금·상태 안내 및 별도 replay engine 연결 목적입니다.
- 설계/진행 문서: `README.md`, `docs/{00,07,12,17}` 및 `docs/progress/{README,PHASE-04A}.md`. 기존 초안/이력은 삭제하지 않았습니다.
- callback은 원본 f32/index/시각을 기존 ring에만 전달합니다. 녹음 분기와 파일 쓰기는 각각 DSP/writer worker에서 수행합니다. 전용 큐는 입력2초 분량으로 제한하고 첫 누락/NaN/clock·장치 실패 시 연속된 앞부분을 보존합니다.
- REC 중 탐색/배속/반복/프로젝트/장치/목표를 잠그고, native도 세대/epoch/rate/시각을 확인합니다. 창 닫기는 STOP/저장 전 차단합니다. 파일은 최대10분/256MiB, 공간 확인 및 fsync/rename/DB 순서로 확정합니다.
- 다시 듣기는 원곡 asset을 교체하지 않는 별도 PlayerEngine, 실제 PCM 파형, 당시 악보 리비전/TAB 커서, 부분 반복·A/B 조건 경고/peak 감쇠 음량 맞춤·비파괴 이름/메모/offset을 제공합니다. 복구는 새ID에 복사하고 원본을 남깁니다.
- 기존 프로젝트·보정값·migration001·녹음 원본을 보존합니다. 새 의존성은 아직 추가하지 않았습니다.

## 3. 테스트 결과

- 실행 전 확인: Git 상태/관련 규칙/로드맵/이전 결과를 읽었습니다. 기존 파일은 untracked 상태이며 commit/push는 실행하지 않았습니다.
- 프로세스/포트 확인: 실행 중 GuitarLab과 1420 개발 서버 없음. 이전 앱을 종료하지 않았습니다.
- `pnpm typecheck`, `pnpm lint`: 개별 검사 성공. 새 모듈의 타입 오류/린트 경고를 수정했습니다. 최종 통합 검사는 진행 중입니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`: 중간90개 성공/장치 열거1개 제외. 이후 추가된 검사의 녹음 필터 실행은10개 성공/합성 산출물 생성1개 기본 제외입니다. 최종 전체 수치는 최종 검사 후 갱신합니다.
- `pnpm exec vitest run src/features/player/TransportBar.test.tsx src/features/recordings`: 핵심10개 성공(계약/시간 변환/출처 거부/파형/명시적 REC/늦은 응답 폐기/중복 방지/잠금/독립 replay·A/B·부분 반복).
- 실제 임시 파일/DB로192,000프레임(4초)의 bounded queue→WAV→DB→재열기, 메타데이터 편집 시 PCM/리비전 불변, `.part` 미완성 헤더·마지막 부분 프레임, rename 후 commit 전 크래시, 복구 취소·손상/NaN, disconnect·overflow·clock 실패의 앞부분 보존을 검사했습니다. 순수 writer의 디스크 실패 주입도 성공했습니다. 실제 디스크를 가득 채운 검사는 아닙니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib recording::wave::tests::export_synthetic_wave_for_independent_decoder -- --ignored --nocapture`: 별도 합성 WAV 생성1개 성공. 산출물은 `src-tauri/target/recording-validation/four-seconds-27599b30-e496-45f6-a480-93d4632925d4.wav`이며 개인 입력이 아닙니다.
- `ffprobe -v error -show_entries stream=codec_name,sample_fmt,sample_rate,channels,duration,duration_ts,time_base -of json <위 합성 WAV>`: pcm_f32le/flt,48,000Hz/1채널, duration_ts192,000·4.000000초 성공. 이어 Python subprocess/FFmpeg float32 디코드에서192,000개의 유한 샘플·768,000 PCM 바이트·peak0.5를 독립 확인했습니다. FFmpeg는 테스트 도구이며 앱 의존성에 추가하지 않았습니다.
- 발생 오류/해결: rusqlite의 u64 ToSql 미지원은 검증된 안전 범위의 i64로 저장, sha2 출력 hex는 기존 변환 함수 재사용, closure 오류 타입을 명시했습니다. JSX 닫기/배열 undefined/진단 코드 타입·effect 의존성/컴포넌트 외 함수 분리를 보완했습니다. Clippy의 is_multiple_of/중첩if를 수정했습니다. 첫 프론트 통합 검사의 잠금 테스트 실패로 button 자체 disabled와 handler guard를 추가했고, 후속 변경된 버튼 이름을 테스트에 반영했습니다. 핵심 재검사10개 성공입니다.
- 실제 REC·재생·장치 분리·복구: 미실행 — 기능 구현 및 자동 검사 후 사용자가 직접 확인합니다.
- 이전 Phase 2A의116개 프론트/82개 Rust·제외1개/번들1개 성공은 이전 검사 이력입니다.

### 최종 통합 검사 — 2026-10-15

- 최신 `pnpm verify:app` 종료 코드0: TypeScript/ESLint, 프론트125개·35파일, production build, Prettier, cargo fmt, Clippy `-D warnings`, Rust92개 성공/2개 기본 제외, binary/doc-tests 성공.
- 기본 제외2개는 실제 장치 열거와 합성 WAV 산출물 생성입니다. 합성 WAV 생성은 위 별도 명령으로1개 성공했으며 실제 장치 열거는 오늘 미실행입니다.
- 마지막 추가 테스트의 this 별칭 린트 오류를 Set에 instance를 수집하는 방식으로 수정했고, 이벤트 listener 실패가 unhandled rejection으로 남지 않고 UI에 STOP 안내를 보이는지 검사했습니다.
- 빌드 경고: 기존 alphaTab 포함 main chunk약1,367kB. Rust MSVC linker의 라이브러리 생성 안내가 경고로 출력되지만 Clippy/컴파일/테스트는 성공했습니다. 경고를 숨기도록 설정을 바꾸지 않았습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`: 실제 generate_context에 index.html/JavaScript가 내장됨을 확인한1개 검사 성공.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: Windows 제품 실행 파일 빌드 성공. `src-tauri/target/debug/guitarlab.exe` 22,724,096바이트,2026-10-15 14:39:10.
- 기존 앱 없음 확인 후 제품 실행. 권한 있는 재조회에서 PID28240/14:40:26 시작/창 제목 GuitarLab 확인. CLI의 Start-Process 출력은 혼합 객체 표 형식으로 잘려 실제 PID는 별도 조회 값을 사용합니다. UI 기능은 아직 사용자 확인 전입니다.
- 실행 후 로컬 DB를 Python sqlite3 `mode=ro`/`query_only=ON`으로 읽어 schemaVersion2·기존 프로젝트2개/시도3개·REC 전 take0개 확인. 오디오 파일은 읽지 않았고 캡처/녹음도 자동 시작하지 않았습니다.
- 현재 사용자 실제 SSL Input 1 무반주 REC→STOP→READY/프레임·누락/다시 듣기 확인 요청을 준비했습니다. 해당 확인이 시작된 뒤 소스·문서·앱을 수정/재시작하지 않고 기다립니다. 아직 실제 REC/청취/분리/재실행 복원은 미실행입니다.

## 4. 미구현 및 알려진 문제

- 최종 검증 구분: 실제 SSL 녹음/청취·모니터·USB 분리/복구·정렬 테이크 저장·부분 반복·이름 재실행 복원은 확인했습니다. A/B의 논리 위치/커서는 자동 수치 검사 성공이며 사용자 육안 비교는 불명확합니다. crash/디스크 부족은 실패 주입으로 확인했고 실제 디스크 채우기/강제 종료는 미실행입니다. 아래 ‘남음’은 중간 이력으로 보존합니다.
- 최종 전체 검사/Windows 실행·실제 SSL Input 1 무반주 REC/재생을 확인했습니다. 추가 재생 음량 UI 검사와 로컬 정렬·A/B·녹음 중 장치 분리/복구·재실행 복원이 남았습니다. 로드맵 체크는 아직 하지 않았습니다.
- 로컬 정렬 REC는 안정된 반주 재생 도중 누른 시점부터 시작합니다. 곡0ms 자동 arming/count-in 결합과 다중 segment는 미구현이며 무반주는 악보 정렬 없이 기록합니다. 기존 재생3초 준비는 유지합니다.
- 관측 누락 수는 ring gap과 writer queue overflow가 겹칠 수 있어 하한으로 기록하며 경고/불완전 상태와 함께 제공합니다.
- 판정 시도ID에 연결한 오류 마커, take 삭제·export, 오버더빙/믹스 출력은 미구현입니다. 원본 악보가 누락되면 녹음은 청취 가능하나 TAB 표시를 생략합니다. Rust 최소1.90 실제 실행 검사는 미실행이며 현재1.98에서 검사합니다. Python 변경/검사는 미실행 — 이번 범위가 Rust/프론트입니다.
- 초기 UI는 선택된 테이크의 정보를 저장·새로고침하면 해당 WAV를 다시 불러옵니다. 원본은 불변이나 재생 위치/부분 반복의 지속 보존은 후속 UX 개선 범위입니다.
- 기존 첫 음의 채점 준비 구간 SKIPPED 제약과 실제 장치의 음정/onset 분포 미측정은 이전 문서대로 유지합니다.
- 개인 오디오의 네트워크 전송과 시스템/YouTube 출력 캡처 경로를 만들지 않습니다.

## 5. 다음 작업 계획

최종 다음 작업: Phase 4B의 이전 테이크를 들으며 독립 입력 녹음, gain/mute/solo/정렬 및 허용된 로컬 WAV 믹스 출력을 구현합니다. 녹음 원본/기존 리비전/마이그레이션을 보존하고 계약·엔진·최소 UI를 분리합니다. 아래1~4는 완료 전 계획 이력입니다.

1. 버전1 녹음 요청·상태·테이크·시각/오류/복구 계약을 확정합니다.
2. WAV writer와 입력 경계/누락·저장 실패·원본 보존을 실제 파일 테스트로 검증합니다.
3. 추가 migration002·명시적 REC/STOP·다시 듣기/A-B를 연결하고 전체 회귀 검사를 실행합니다.
4. 실제 SSL Input 1 녹음과 재실행 복원을 확인한 뒤에만 Phase 4A를 완료하고4B로 진행합니다.

## 실제 REC 즉시 중단 문제 — 2026-10-15

- 사용자 결과: REC를 누르면 바로 취소되는 것처럼 보임. 실제 녹음 성공/청취 확인으로 기록하지 않습니다.
- 로컬 DB의 최근5개 테이크 메타데이터만 읽기 전용 확인: 모두 무반주 transport=null, RECOVERABLE_ERROR/CAPTURE_CLOCK_GAP.480/1,920/7,200/19,680프레임 등 블록 경계에서 종료됐습니다. 개인 PCM은 읽거나 전송하지 않았고 원본과 이전 메타데이터를 보존했습니다.
- 설치된 CPAL0.18.2 WASAPI 소스가 GetBuffer의 callback별 QPC 시각을 capture timestamp로 쓰는 것을 확인했습니다. 기존 검사에서 다음 블록 첫 시각이 이전 블록의 계산된 마지막 시각보다 조금만 앞서도 실패했습니다.480프레임 단위·±0.2ms 시각 흔들림의 자체4초 fixture에서480번째 프레임에 동일 실패를 재현했습니다(수정 전 회귀 테스트 실패).
- `recording/service.rs`: PCM 순서는 sample index로 검사하고, 누적 sample clock과 관측 시각의 잔차가100ms를 초과할 때 시각 오류로 중단합니다. NaN·실제 누락/중복·큰 시각 점프·누적 drift·overflow·장치/clock 오류 차단은 유지합니다. 시각 오류/중복만으로 누락1프레임을 추정하지 않습니다.
- `recording/router.rs`: REC 시작 시각 필터는 첫 샘플 선택까지만 적용하여, 이후 작은 시각 역행이 연속 PCM의 일부를 버리지 않게 했습니다. 상태는 DSP worker의 route clone 사이에서 공유하며 callback에 잠금/파일 작업을 추가하지 않았습니다.
- `storage/recordings_tests.rs`: writer 통합4초 fixture도 callback별±0.2ms 시각을 적용해192,000개 PCM 보존·프레임 누락0·원본 sample 값 일치를 확인했습니다. 추가 회귀3개(블록 겹침, 시작 경계, 누적 drift/큰 역행)를 포함한 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib recording`:13개 성공/합성 산출물 생성1개 기본 제외.
- 전체 native 검사·Windows 빌드/수정 앱 적용·실제 SSL 재확인: 진행 전. 기존 앱 PID28240/14:40:26을 유지했고 직접 종료하지 않았습니다. 이전125개 프론트/92개 Rust 결과와 이번 수정 후 결과를 구분합니다.

수정 후 검사: `cargo fmt --check`·`cargo clippy --locked -- -D warnings` 성공. `cargo test --locked --manifest-path src-tauri/Cargo.toml`은95개 성공/장치 열거·합성 산출물 생성2개 기본 제외, binary/doc-tests 성공입니다. 이번 수정은 Rust 내부 검증/route/tests와 계약·진행 문서에 한정하여 프론트 타입·린트·125개 테스트·production build는 반복하지 않았으며, 앞선 최종 성공 이력을 유지합니다. 실행 중 제품 exe는 아직 수정 전 버전입니다. 사용자가 창을 닫았다고 알려주면 Windows 제품을 빌드·재실행하고 실제 녹음을 다시 확인합니다. 실패한 짧은 테이크의 자동 삭제/메타데이터 재작성은 하지 않습니다.

수정 후 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`도1개 성공했습니다. 사용자 창 종료 확인을 요청하고 기다립니다. 실제 하드웨어에서 수정이 적용된 결과는 아직 확인하지 못했습니다.

사용자 ‘닫음’ 응답 후 실제 기존 프로세스 없음 확인. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 종료 코드0. 수정 exe22,726,656바이트/14:53:22, 새 실제PID34532/14:54:31/창 제목GuitarLab 확인. 입력/REC 자동 시작과 이전 테이크 삭제는 하지 않았습니다. 이제 동일한 무반주 REC 약10초→STOP→READY/누락/청취 재검사를 요청합니다. 확인 동안 파일/앱을 수정하거나 재시작하지 않습니다. 실제 성공 결과는 여전히 대기 중입니다.

## 실제 무반주 녹음 성공 및 음량 요청 — 2026-10-15

- 사용자 실제 재검사 성공: READY·13.48초·647,206프레임·누락0·peak1.000, 녹음 다시 듣기에서 기타 소리가 잘 들림. 앞의 성공 대기는 이 결과로 해소했습니다. 개인 WAV는 읽거나 전송하지 않았습니다.
- `TakeReplay.tsx`: 테이크 재생 음량0~100%·음소거를 추가했습니다. A/B peak 감쇠와 사용자가 선택한 음량을 곱해 별도 replay engine에 적용합니다. 음량/음소거는 A/B 전환 중 유지하고 페이지를 벗어나면 초기화합니다. WAV·입력 게인·원곡 엔진은 변경하지 않습니다.
- `TakeReplay.test.tsx`: 음량/음소거/맞춤 해제·A/B 전환 시 음량 유지, 재생 위치/epoch/미디어와 원곡 음량 불변·WAV 중복 읽기 없음 검사를 보강했습니다. 추가 변경 후 실행 결과는 후속 기록합니다.
- `InputPanel.tsx`: 연주 중 청취를 위한 직접 모니터링 안내를 추가했습니다. 현재 앱 자체 입력→출력 모니터는 미구현입니다. SSL 출력에 연결된 헤드폰·스피커는 MIX로 INPUT/USB 비율, PHONES/MONITOR로 출력 음량을 조절하며 Input 1 단독은 STEREO를 끕니다. [SSL 2 MKII 공식 설명서](https://support.solidstatelogic.com/hc/en-gb/articles/19991374319773-SSL-2-MKII-User-Guide)를 확인했습니다. 사용자가 실제 연주 중 듣는 결과는 아직 대기입니다.
- 추가 UI의 Windows 적용·실제 음량 청취·로컬 정렬/A-B·녹음 중 USB 복구·앱 재실행 복원은 미실행입니다. 기존 실행 앱을 직접 종료하지 않습니다.

추가 변경 후 `pnpm verify:app` 종료 코드0: TypeScript·ESLint·프론트125개/35파일·production build·Prettier·cargo fmt·Clippy `-D warnings`·Rust95개/기본 제외2개·binary/doc-tests 모두 성공했습니다. `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`도1개 성공했습니다. alphaTab 포함 main chunk1,368.31kB 경고와 MSVC 라이브러리 생성 안내는 남습니다. 새 라이브러리/IPC 계약 변경은 없습니다. 기존 실행 PID34532는 이전 UI를 포함하므로 사용자 종료 확인 후 Windows exe를 다시 빌드·실행해야 새 음량 조절이 적용됩니다. 실제 새 UI 청취 확인 전 완료로 표시하지 않습니다.

사용자 ‘닫음’/직접 모니터링 ‘아직 확인 안 함’ 응답 후 실제 앱 프로세스 없음 확인. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 성공, 새 exe22,727,168바이트/2026-10-15 16:26:49. 중복 실행 없음 재확인 후 실행하여 실제PID31700/16:27:01/창 제목GuitarLab을 확인했습니다. 저장 프로젝트와 기존13.48초 테이크 재열기·새 음량/음소거·하드웨어 직접 모니터링 청취는 사용자 확인 대기입니다. 입력·REC를 자동 시작하지 않았고, 확인 동안 파일 수정·앱 종료/재시작을 하지 않습니다. Phase 4A 진행 중을 유지합니다.

## 앱 입력 모니터 추가 — 2026-10-15

- 사용자 결과: 테이크 재생 음량·음소거 정상. 기존 녹음 재생 경로에서 확인한 것으로 기록하며 별도 메타데이터 재실행 복원 전체 검사를 완료한 것으로 확대하지 않습니다. SSL 직접 모니터는 MIX 중간에서 실제 들림을 확인했고, USB 끝에서도 들리는 DAW형 모니터를 추가 요청했습니다.
- 계약을 `docs/12`에 먼저 추가했습니다. v1 출력 열거·모니터 시작/중단/조회·세션별 음량 명령입니다. 기존 입력/녹음 DTO는 유지합니다.
- 새 native 파일 `audio/monitor.rs`, `commands/monitor_api.rs`; 수정 `audio/{input,mod}.rs`, `app.rs`, `commands/mod.rs`. 선택 입력 채널을 callback에서 별도100ms bounded ring으로 복사해 CPAL 출력 callback으로 전달합니다. DSP와 녹음 큐를 소비하지 않으며 callback 잠금·파일·로그·할당을 추가하지 않았습니다. 출력에만 음량/유한값 처리/클램프·좌우 복제를 적용하고 WAV는 불변입니다.
- 기본 꺼짐·음량25%, 명시적 출력 선택/시작, REC와 별도 중단, 입력 종료·장치 실패 시 무음/모니터 정리를 구현했습니다. 세션이 바뀌면 이전 샘플/음량 요청을 거부합니다.20ms prefill,60ms 초과 backlog 감축과 출력 부족·초과 진단을 제공합니다. 전체 왕복 지연 수치로 표시하지 않습니다.
- 새 front `practice/{monitoring.ts,useInputMonitor.ts,InputMonitor.tsx}` 및3개 테스트; `App.tsx`, `InputPanel.tsx`를 수정했습니다. 전역 모니터 패널은 녹음 중 잠금 영역 밖에 두어 REC 중에도 끌 수 있습니다. 출력 선택/모니터 상태와 재생·녹음을 구분하고, 음량 연속 변경은 마지막 값을 적용하며 이전 조회 응답을 버립니다.
- API 확인: 설치된 CPAL0.18.2의 `examples/feedback.rs`, `traits.rs`, WASAPI `Stream::drop`과 ringbuf0.5.3의 caching wrapper/단일 consumer 규칙을 읽었습니다. 기존 stream을 drop한 뒤 consumer를 새로 만들고 service 잠금으로 수명을 직렬화합니다. 새 라이브러리/ASIO 기능/리샘플러 설치 없음.
- 핵심 native `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib audio::monitor`:5개 성공. 유한/비유한·초과 입력·mono→stereo/unsigned 무음·음량0·비활성·재시작 잔여/오류·bounded/drop/underrun·잘못된 입력/추가 필드/없는 장치 세션/멱등 중단을 합성 신호로 검사했습니다. 실제 오디오 출력 스트림은 시작하지 않았습니다.
- 핵심 front `pnpm exec vitest run src/features/practice/monitoring.test.ts src/features/practice/useInputMonitor.test.tsx src/features/practice/InputMonitor.test.tsx`:6개 성공. 계약/명시적 시작·REC 명령 없음/입력 중단과 독립/늦은 조회/음량 병합·실패 시 재시도 중단/브라우저 비실행을 검사했습니다.
- 발생 오류: Windows에서 `inputMonitor.ts`와 `InputMonitor.tsx`의 대소문자 파일명 충돌 → 서비스 이름을 `monitoring.ts`로 변경. 테스트의 `Debug` 누락과 `isTauri` mock 누락을 보완했습니다. mock 상태 조회가 성공한 음량 변경을 반영하지 않아 rollback 검사 실패 → 실제 native와 같은 상태 전이로 fixture 수정 후6개 성공.
- 제약: 동일 sample rate의 mono/stereo 출력만 지원하며 mismatch를 명시 거부합니다. Windows 공유 모드로 ASIO/지연0/앰프·이펙트는 미구현입니다. 모니터 경로 변경 후 기존 채점 보정값의 적합성은 재확인이 필요합니다. 실제 USB 끝 청취·지연/음량/끄기·REC 동시 동작은 미실행입니다. 기존 앱을 직접 종료하지 않습니다. Phase 4A 전체 미완료입니다.

### 모니터 최종 검사 및 적용 대기

- `pnpm verify:app`: 종료 코드0. 타입·ESLint·프론트131개/38파일·production build·Prettier·Rust fmt/Clippy·native100개 성공/3개 기본 제외·binary/doc-tests 성공입니다.
- 이후 코드 검토에서 출력 장치 초기화 중 입력 상태 잠금이 DSP/녹음 검사를 지연시킬 가능성을 보완했습니다. 입력 버퍼/실패 플래그/설정만 짧게 복사한 뒤 잠금을 해제하고 출력 장치를 엽니다. 입력 수명 플래그와 오류 원자값으로 종료/재시작 경합을 검사해 끊긴 입력의 소리를 재개하지 않습니다. 모니터 조회도 입력 잠금을 기다리지 않습니다. 관련 합성 검사를 보강했고 수정 후 `cargo fmt --check`, `cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings`, `cargo test --locked --manifest-path src-tauri/Cargo.toml`100개/기본 제외3개가 다시 통과했습니다. 프론트는 이 보완에서 변경하지 않았습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`: 최신 UI index.html/JavaScript 내장 검사1개 성공.
- 실제 출력 장치 열거만 별도 실행: `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib audio::monitor::tests::enumerate_connected_monitor_outputs -- --ignored --nocapture`1개 성공. SSL Output과 NVIDIA Broadcast Speakers가 각각48,000Hz·stereo·f32로 반환됐습니다. 입력 캡처와 출력 스트림은 시작하지 않았습니다.
- 기본 제외3개는 실제 입력 장치 열거·실제 출력 장치 열거·합성 WAV 생성입니다. 출력 열거는 이번에 위 별도1개 성공, WAV 생성은 이전 독립 검사 성공, 입력 열거는 오늘 미실행입니다. 개인 WAV는 읽지 않았습니다.
- 남은 경고: alphaTab 포함 main chunk1,375.09kB, MSVC 라이브러리 생성 안내. Rust 최소1.90·Python 검사는 이번에 미실행이며 실제 Rust1.98 검사를 사용했습니다.
- 기존 실행PID31700이 남아 있어 실행 파일 교체/앱 재시작은 아직 미실행입니다. 사용자 창 종료 확인 후 Windows 제품을 빌드·열고, MIX USB 끝에서 입력 모니터 켜기/음량/끄기와 실제 지연을 확인합니다. 실제 청취/REC 동시 사용과 Phase 4A 남은 로컬 정렬·녹음 중 USB 복구 검사는 완료로 표시하지 않습니다.

### 앱 모니터 Windows 제품 적용 — 2026-10-15 17:49

사용자 ‘닫음’ 후 실제 프로세스가 없음을 확인했습니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 종료 코드0, exe23,035,392바이트/17:48:51. 중복 실행 없음 재확인 후 제품 실행, 실제PID22000/17:49:02/창 제목GuitarLab 확인. 기본 모니터 꺼짐·음량25%이며 입력 캡처·오디오 출력·녹음을 자동 시작하지 않았습니다. 앞선131개 프론트/100개 native·번들1개 결과를 유지하고 이번에는 제품 빌드/실행만 확인했습니다. 기존 MSVC 라이브러리 생성 안내 외 빌드 실패는 없습니다.

다음 실제 확인은 SSL Input 1 입력 시작→모니터 출력 새로고침/SSL Output 선택→MIX USB 끝→모니터 켜기·음량 변경·끄기·체감 지연입니다. 실제 청취·REC 동시 동작·장치 분리 복구/로컬 정렬은 아직 미실행입니다. 확인 요청 후 파일·앱 상태를 유지하고 사용자 결과를 기다립니다. Phase 4A 전체 완료로 표시하지 않습니다.

### 앱 모니터 실제 청취 확인 — 2026-10-15

- 사용자 실제 결과: SSL USB 끝의 앱 모니터에서 기타 소리가 잘 들림. 모니터 큐480/960프레임 교대, 출력 부족0프레임·큐 초과/지연 조정0프레임·출력 버퍼480프레임을 제공했습니다.
- 기존48kHz 기준 큐는 약10~20ms 분량입니다. OS·입출력 장치 버퍼를 포함한 전체 왕복 지연 측정값이 아니며, 실제 지연 분포나 장시간 무결성을 측정한 것으로 기록하지 않습니다. 모니터 음량/끄기는 이번 답변에서 명시 확인되지 않았습니다.
- 새 코드/의존성 변경과 자동 검사 반복은 하지 않았습니다. 이전 최종 프론트131개/native100개·번들1개·Windows 빌드 성공 이력을 유지합니다. 변경 파일은 진행 문서와 녹음 명세뿐입니다.
- 다음 수동 검사: 모니터를 켠 무반주 REC 도중 청취 음량·끄기·켜기 조작에도 녹음 프레임이 계속 증가하고 STOP 후 READY·청취가 되는지 확인합니다. 이어 실제 녹음 중 USB 분리의 오류/원본 보존 복구와 로컬 정렬/A-B·부분 재생을 확인합니다. 이들은 미실행이며 Phase 4A 전체 진행 중입니다. 사용자 테스트 동안 제품PID22000과 소스를 그대로 유지합니다.

### 모니터 토글과 녹음 독립 실제 확인 — 2026-10-15

- 사용자 결과: ‘모니터 끄기 다시 켜기 해도 녹음 프레임이 정상 작동하고 기타도 남아있음’. 녹음 중 모니터 토글이 입력 저장을 끊지 않음을 실제 확인했습니다.
- 새 테이크의 정확한 READY 문구/길이/프레임/누락 수는 미제공이므로0 누락이나 특정 녹음 길이를 추정하지 않습니다. 모니터 음량 변경의 청취 결과도 별도 명시 확인 전입니다. 테이크 재생 음량·음소거는 앞선 사용자 확인 완료와 구분합니다.
- 제품 소스 변경·자동 검사 반복은 하지 않았습니다. 이번 변경은 `docs/progress/{README,PHASE-04A}.md`, `docs/17`에 실제 결과/남은 항목을 기록하는 문서 갱신입니다. 기존 자동 검사131개 front/100개 native·기본 제외3개·번들1개·Windows 빌드 성공 이력을 유지합니다.
- 다음은 새 무반주 테스트 REC 약5초 뒤 USB 분리→입력/모니터 오류 및 녹음 중단→USB 재연결/Input 1 튜너 복구입니다. 상태 확인 후 방금의 불완전 테이크를 ‘원본 보존하여 복구’하고 끊기기 전 기타를 다시 듣는 실제 검사를 진행합니다. 장치 분리 REC 복구와 로컬 정렬/A-B/부분 재생은 아직 미실행이며 Phase 4A 전체 진행 중입니다. 실제 검사 요청 후 소스·문서·앱을 수정/재시작하지 않고 기다립니다.

### REC 중 USB 분리 실제 결과 — 2026-10-15

- 사용자 원문: `테이크 안내: INPUT_NOT_ACTIVE · 불완전 테이크는 다시 듣기에서 복구할 수 있습니다.`, 모니터 오류 해제 버튼 표시, 녹음 프레임 정지. 장치 분리의 오류/REC 중단·모니터 오류 표시를 실제 확인했습니다. ‘복구도 되는거 같은데’는 입력 재연결과 테이크 파일 복구 중 어느 쪽인지 명확하지 않아 파일 복구 성공으로 확대하지 않습니다.
- Python sqlite3로 앱 데이터 DB의 최근6개 테이크 메타데이터만 `mode=ro`/`PRAGMA query_only=ON` 조회했습니다. 개인 WAV/원시 PCM을 읽거나 전송하지 않았으며 DB/파일을 수정하지 않았습니다. SELECT는 ID/state/metadata_json/metadata_sha256에 한정하고 출력은 프레임/샘플레이트/누락/오류/복구 원본ID/메타데이터 해시 검증만 허용했습니다.
- 최신 불완전 원본ID `55470f00-3099-4dfc-b73c-dc34a1dd4abb`: RECOVERABLE_ERROR/INPUT_NOT_ACTIVE,443,040프레임/48,000Hz=9.23초, 관측 droppedFrames0, recoveredFrom=null, 메타데이터 SHA-256 일치. 직전 불완전 원본ID `5df410e1-a440-4a1a-bfb5-6cb1deb9ad0b`도 동일 상태/오류,637,440프레임=13.28초/관측 누락0입니다. 분리 뒤 미수신 구간이 없었다는 뜻은 아니며 불완전 표시를 유지합니다.
- 기존 READY 테이크647,206프레임 및 최근 READY2개도 남아 있고 메타데이터 해시가 일치했습니다. 최신6개에는 복구한 새 테이크가 없어 방금 원본의 파일 복구/청취는 아직 확인 전입니다.
- 다음: 다시 듣기에서 최신9.23초 불완전 테이크의 ‘원본 보존하여 복구’→새 ‘복구한 테이크’ READY/길이와 끊기기 전 연주 청취 확인. 이후 로컬 정렬 리플레이/A-B/부분 재생과 이름·메모 재실행 복원을 검사합니다. 제품 소스/의존성 변경·자동 검사 반복은 없고 문서만 갱신했습니다. 사용자 수동 확인 동안 앱·파일을 유지합니다. Phase 4A 전체 진행 중입니다.

### USB 분리 테이크 복구·청취 성공 — 2026-10-15

- 사용자 ‘기타 소리 잘 들림’으로 복구 후 청취를 실제 확인했습니다. 이어 DB 메타데이터만 같은 읽기 전용 방식으로 조회했습니다. 개인 WAV·PCM은 읽거나 전송하지 않았습니다.
- 새 복구ID `810f0bd2-9e5e-489b-af1f-bdeb8560094c`: READY,443,040프레임/48kHz=9.23초, 관측 droppedFrames0, errorCode=RECOVERED_PARTIAL, recoveredFrom=`55470f00-3099-4dfc-b73c-dc34a1dd4abb`, transport/songStartMs=null, 메타데이터 SHA-256 일치.
- 불완전 원본ID `55470f00-3099-4dfc-b73c-dc34a1dd4abb`는 RECOVERABLE_ERROR/INPUT_NOT_ACTIVE·동일443,040프레임으로 남고 메타데이터 해시가 일치했습니다. 원본을 READY로 덮어쓰지 않고 새 테이크로 연결됨을 확인했습니다. 실제 원본 WAV 바이트 비교는 수행하지 않았으며 원본 바이트 보존은 앞선 합성 파일 회귀 테스트 범위로 구분합니다.
- 로드맵4A의 첫 항목(InputOnly WAV recorder/명시적 REC·Stop/.part 복구)을 실제 확인 후 `[x]`로 갱신했습니다. 전체 Phase 완료 표시는 하지 않았습니다. 최신 자동 검사는 기존131개 front/100개 native·기본 제외3개·번들1개이며 이번에는 메타데이터 조회와 문서 갱신만 수행했습니다.
- 남은 실제 검사는 로컬 반주에 정렬한 REC/악보 커서, 정렬된 두 테이크 A/B·부분 반복, 이름/메모/오프셋 저장 후 앱 재실행 복원입니다. 다음은 반복 끄기·0.5× 반주 재생/clock 안정→정렬 REC→STOP/리플레이 확인입니다. 모니터의 전체 왕복 지연은 미측정이며 ASIO/리샘플링은 미구현입니다. 사용자 테스트 동안 소스·문서·앱을 그대로 유지합니다.

첫 로컬 정렬 실제 검사는 기존4초 합성 반주를0.5×/반복 끄기로 재생하고, REC가 활성화된 뒤 녹음해 재생 종료 시 상태와 다시 듣기의 악보 커서를 확인합니다. 재생 종료와 clock reset/녹음 확정의 순서도 아직 실제 확인 전이므로 READY를 미리 단정하지 않으며 오류 원문을 요청합니다. 이 검사 동안 파일과 앱 상태를 유지합니다.

### 정렬 REC 접근 방해·비활성 사유 수정 — 2026-10-15

- 사용자 결과: 정렬 체크 시 REC가 비활성화된 것 같음. 재생 중에도 같은지 요청하자 ‘재생을 누르면 악보에 고정되어 위에를 확인할 수 없음’을 확인했습니다. 실제 재생 중 REC 활성 조건 충족 여부와 로컬 정렬 녹음은 아직 확인하지 못했습니다.
- 원인: 앱 `ScoreViewport.tsx`의 커서 효과가 본문 `#main`과 위치를 비교한 뒤 `cursor.scrollIntoView()`를 호출했습니다. 커서가 움직일 때 전체 스크롤 체인이 악보로 이동해 사용자의 상단 REC 접근을 방해했습니다. alphaTab 자체 재생은 비활성이며 이 호출은 앱 코드였습니다.
- 수정 전 `ScoreViewport.test.tsx`에서 커서가 화면 아래로 넘어갈 때 전체 페이지 스크롤 함수가 호출됨을 재현했습니다(회귀1개 실패). 수정 후 로컬 악보 section의 scrollTop만 바꾸고 페이지 위치·REC 키보드 포커스를 유지하며, 보이는 커서는 이동하지 않고 위로 seek하면 내부만 복귀하는 동일 검사1개가 성공했습니다. 주 작업 공간·테이크 replay 양쪽이 같은 컴포넌트를 사용합니다.
- `shared/styles.css`: 악보 높이 최소240px/최대40vh와 내부 overflow/overscroll containment를 적용했습니다. `.recording-panel`은 본문 상단 sticky로 유지하고 일반 준비 설명은 details로 접었습니다. 전체 페이지를 자동으로 되돌리지 않으면서 REC/STOP을 계속 사용할 목적입니다. 실제 Windows 화면 크기별 육안 확인은 미실행입니다.
- `RecordingPanel.tsx`: 기존 시작 조건을 유지하며 네이티브/사용 가능 모드·프로젝트 작업/악보 저장·정상 입력·보정값·프로젝트 반주 연결·반복/재생 준비·재생 중·동기화 준비의 구체적인 비활성 이유를 표시합니다. 준비 완료 시 현재 반주 위치부터 녹음됨을 안내합니다. REC aria-describedby로 상태 안내를 연결하고 녹음 중 잠금·STOP 접근·native 검증은 유지합니다.
- `RecordingPanel.test.tsx`: 정지 중 이유/버튼 비활성, 재생+동기화 후 정확한 INPUT_ONLY transport 요청, 동기화 대기/프로젝트 음원 미연결/반복 중 차단, 무반주 전환 시 transport=null을 검사했습니다. 핵심2개 및 TypeScript 성공입니다. 최초 테스트의 node:fs 타입 미설치 오류는 자체 AlphaTex fixture를 사용해 해결했으며 새 의존성을 추가하지 않았습니다.
- 변경 파일: `src/features/score/{ScoreViewport.tsx,ScoreViewport.test.tsx}`, `src/features/recordings/{RecordingPanel.tsx,RecordingPanel.test.tsx}`, `src/shared/styles.css`, UI 명세·진행 문서. Rust/IPC/SQLite/개인 WAV는 변경하지 않았습니다. 전체 검사 및 새 UI 번들/Windows 적용·실제 재확인은 진행 전/진행 중으로 구분합니다. 기존 앱을 자동 종료하지 않습니다.

수정 후 `pnpm verify:app` 종료 코드0: 프론트133개/40파일, TypeScript·ESLint·production build·Prettier·cargo fmt·Clippy·native100개/기본 제외3개·binary/doc-tests 성공. `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`1개도 성공했습니다. main chunk1,376.40kB와 MSVC 라이브러리 생성 안내 경고는 유지합니다. 기존 실행 파일은 이전 UI를 내장하고 있으므로 사용자 종료 확인 후 제품 exe 재빌드/실행이 필요합니다. 새 Windows UI에서 sticky/내부 스크롤·정렬 REC 사유 확인과 로컬 정렬 녹음은 아직 미실행입니다.

### REC 접근 수정 Windows 적용 — 2026-10-15 18:23

사용자 ‘닫음’ 후 실제 프로세스 없음 확인, `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 종료 코드0. exe23,035,904바이트/18:22:55. 중복 실행 없음 재확인 후 실행해 실제PID33128/18:23:08/창 제목GuitarLab 확인. 입력·모니터·REC를 자동 시작하지 않았고 기존 프로젝트/테이크를 수정하지 않았습니다. 이번에는 제품 빌드/프로세스 실행만 확인했으며133개 front/100개 native·기본 제외3개·번들1개는 앞선 최종 검사입니다.

이제 저장 프로젝트·SSL Input 1·연주0.5×·반복 끄기·로컬 정렬 켜기→재생 중 상단 REC 접근과 옆의 준비 상태를 확인합니다. 활성화되면 REC 후 반주 종료 시 상태, 계속 비활성이면 구체적인 안내 문구를 요청합니다. 실제 UI/로컬 정렬 녹음은 아직 미실행이며 검사 요청 이후 파일·앱을 수정/재시작하지 않고 기다립니다. Phase 4A 전체 진행 중입니다.

### 기능·안정성 우선 규칙 반영 및 정렬 REC 저장 확인 — 2026-10-15

- 사용자 결정: 현재 UI를 완성형으로 보지 않고 추후 전면 리디자인합니다. UI/비즈니스 로직 분리, 핵심 기능의 UI 비종속, 공통 토큰, 재사용 UI, 최소 UI, 전체 UI 교체 시 기능·데이터 구조 보존의6개 규칙을 `AGENTS.md`10절에 추가했습니다. `README.md`, `docs/{00,02,03,08}` 및 진행 문서에 같은 결정을 반영했고 기존 내용/로드맵 순서/검증 조건을 삭제하지 않았습니다.
- 이번 규칙 반영은 문서 변경입니다. 전체 UI 리팩터링·추가 디자인·새 의존성·제품 소스/데이터 변경·앱 재실행은 하지 않았습니다. 기존 모든 디자인 값의 토큰 이행을 완료했다고 주장하지 않습니다. 후속 기능 변경에서 공통 토큰과 도메인/서비스 경계를 유지합니다.
- 사용자가 REC 활성화가 조금 늦게 느껴진다고 확인했습니다. clock의 실제 준비 조건은 최소3개 anchor·400ms 관측 구간이며 프론트는200ms 간격으로 동기화합니다. 정확한 실제 활성화 소요시간은 미측정입니다. 검증 없이 동기화 조건을 완화하거나 지연을0으로 기록하지 않습니다.
- 앱 데이터 DB를 mode=ro/query_only로 읽어 최근 정렬 테이크2개가 READY임을 확인했습니다. 최신ID60af7e3d-b5c7-4850-a084-66b34d321904:291,698프레임/48kHz≈6.08초, transport.rate0.5/epoch9/songStartMs≈900.63. 직전IDcf9a2c88-5c4b-4968-ac34-b118e3b8c175:340,022프레임≈7.08초, rate0.5/epoch8/songStartMs≈395.60. 두 테이크의 backingAssetId가 같고 오류 코드는null입니다. 개인 WAV는 읽지 않았습니다.
- 실제 정렬 REC가 저장된 상태까지 확인했으며 TAB 커서/정렬 재생·A-B·부분 반복의 실제 청취와 메타데이터 재실행 복원은 아직 미실행입니다. 다음은 이미 저장된 두 테이크를 사용해 이 기능들을 확인합니다. 문서 반영은 변경 내용 검색으로 확인했으며 Markdown은 기존 Prettier 제외 대상입니다. 타입/린트/테스트/빌드 재실행은 미실행 — 문서만 변경했고 제품 소스/의존성이 동일하기 때문입니다. 기존133개 front/100개 native·기본 제외3개·번들1개 성공 이력을 유지합니다. 전체 Phase 완료/4B 착수는 아직 아닙니다.

추가 메타데이터 비교에서 두 정렬 테이크의 프로젝트/악보 리비전/대상 트랙/보정값/반주/배속이 모두 같고 관측 droppedFrames가 각각0임을 확인했습니다. 따라서 새 녹음 요청 없이 기존 최신6.08초(A)·직전7.08초(B)로 정렬 replay/A-B·부분 반복을 확인합니다. 실제 소리와 TAB 커서, A/B 전환 시 논리 위치 유지, 부분 반복 청취는 아직 사용자 확인 전이며 요청 후 파일·앱을 유지합니다.

### A/B·부분 반복 자동 검증 보강 — 2026-10-15

- 사용자가 앞선 복합 수동 요청을 ‘잘 모르겠음’으로 답했습니다. 수동 커서 위치 비교/부분 반복 청취는 결론 보류이며 통과로 기록하지 않습니다. 현재 기능 중심 원칙에 따라 디자인 작업이나 화면 교체 없이 부족했던 자동 검증을 보강했습니다.
- 변경 파일: `src/features/recordings/TakeReplay.test.tsx`, 진행 문서, `docs/17`. 공통 재생 테스트 준비를 재사용하고 기존 악보 누락 시 WAV 청취/음량 검사에 더해 저장 원본 악보를 정상 읽는 경로1개를 추가했습니다. 제품 UI/핵심 구현·IPC·데이터/의존성을 수정하지 않았습니다.
- 자체 AlphaTex를 설치된 alphaTab1.6.1의 Gp7Exporter로 GP 바이트에 변환하고 실제 importer/lookup/정규화/시간 매핑을 사용했습니다. native 파일 읽기 응답은 자체 GP/WAV fixture로 모의하며 실제 사용자 오디오는 읽지 않습니다. alphaTab 화면 렌더러는 전달받은 tick을 표시하는 테스트 대역, HTMLMediaElement.play는 모의입니다. 따라서 실제 청취나 시각적 커서 검증으로 확대하지 않습니다.
- 실제 PlayerEngine에서 A의1000ms→B의600ms로 바뀌어도 같은 악보 tick2860.8이 유지되고 원곡 media가 그대로임을 확인했습니다. 부분 시작500/끝1500ms에서 timeupdate가 구간을 넘을 때 시작500ms로 돌아가는 동작을3회 반복해 검사했습니다. 단순히 loop 설정값만 비교하지 않고 재생 위치·계속 재생 상태와 커서 tick을 확인했습니다.
- `pnpm exec vitest run src/features/recordings/TakeReplay.test.tsx`:2개 성공. `pnpm typecheck`, `pnpm lint`, `pnpm test`134개/40파일, `pnpm format:check` 성공. 새 오류 없음.
- 빌드/Rust/Windows 재실행은 미실행 — 테스트와 문서만 바뀌어 기존 제품 동작/실행 파일이 동일합니다. 직전133개 front/100개 native·기본 제외3개·번들1개/Windows 제품 빌드 성공 이력과 구분합니다.
- 다음 수동 확인은 최근 테이크 하나에서500~1500ms의 약1초 구간이 반복되는지만 요청합니다. 이후 이름·메모·오프셋 저장/앱 재실행 복원을 검증합니다. A/B 시각 비교는 사용자 확인 불명확으로 남기며 Phase 4A 전체 완료 표시를 하지 않습니다. 새 요청 이후 파일/앱을 그대로 유지합니다.

### 부분 반복 실제 청취 성공·저장 재실행 준비 — 2026-10-15

- 사용자 결과: ‘같은 짧은 구간이 계속 반복됨’.500~1500ms 부분 반복의 실제 청취를 확인했습니다. A/B 커서 위치의 수동 판단과 혼합하지 않고, 자동 수치 검증/실제 청취를 구분합니다.
- 다음 수동 검사는 최신6.08초 테이크의 이름만 ‘복원 확인’으로 저장하고 앱을 닫은 뒤 재실행하는 단순 경로로 줄입니다. 메모·오프셋 변경/재열기는 기존 native 자동 파일·SQLite 테스트에서 검증했으며 이번 실제 수동 변경 성공으로 주장하지 않습니다. 사용자에게 같은 복합 시나리오를 반복 요청하지 않습니다.
- 최신ID60af7e3d-b5c7-4850-a084-66b34d321904의 편집 전 메타데이터(ID/READY/이름/메모/오프셋0/291,698프레임/48kHz/PCM 파일 해시/리비전/트랙)를 mode=ro/query_only로 읽어 비교 기준으로 보관했습니다. 오디오 파일 자체는 읽지 않았습니다. 첫 터미널 한글 표시가 깨져 JSON ensure_ascii=True로 다시 읽어 정확한 기준값을 보관했고 앱 데이터를 수정하지 않았습니다.
- 이번 변경 파일은 `docs/progress/{README,PHASE-04A}.md`, `docs/17`입니다. 제품 소스·데이터·의존성 변경/빌드/타입·린트·테스트 재실행은 미실행 — 문서와 읽기 전용 진단뿐이기 때문입니다. 최신134개 front/100개 native·기본 제외3개·번들1개/제품 빌드 성공 이력을 유지합니다. 새 빌드 없이 기존exe를 사용자가 닫은 뒤 다시 엽니다.
- 저장/종료·재실행 후 UI 복원과 기존 PCM 메타데이터 보존 확인은 아직 미실행입니다. 이 검사를 마친 뒤 남은 로드맵 체크·Phase 4A 최종 문서화를 검토하고 다음4B로 진행합니다. 실제 확인 전 완료 표시는 하지 않으며 요청 이후 파일·앱을 유지합니다.

### 이름 저장·종료 후 유지 및 개발 실행 콘솔 수정 — 2026-10-15

- 사용자가 이름 저장 후 앱을 닫았다고 확인했고 실제 GuitarLab 프로세스가 없었습니다. 종료 후 읽기 전용 DB 결과를 편집 전 기준과 비교해 ID60af7e3d-b5c7-4850-a084-66b34d321904의 이름이 ‘복원 확인’으로 유지됨을 확인했습니다. READY/291,698프레임/48kHz 및 저장된 원본 해시·리비전·트랙·메모·오프셋은 동일했습니다. 실제 WAV를 다시 읽어 바이트 비교한 것으로 확대하지 않습니다.
- 사용자 추가 질문: cmd 창이 하나 더 열리는 이유. 기존 `main.rs`는 release에서만 windows_subsystem을 설정해 직접 실행한 debug exe가 PE 서브시스템3(Console)이었습니다. 일반 Windows 앱 실행에는 debug도 GUI 서브시스템을 사용하도록 한 줄을 변경하고 테스트 실행은 제외했습니다. 다른 기존 cmd/conhost 프로세스는 종료하지 않았고 사용자가 본 개별 cmd의 정체까지 모두 확인한 것은 아닙니다.
- 실행: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings`, `cargo test --locked --manifest-path src-tauri/Cargo.toml` 성공(100개/제외3개, binary/doc-tests 성공). `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 성공. 자체 PE 헤더 검사에서 새 exe 서브시스템2(Windows GUI)·23,035,904바이트 확인. 사용자 종료 후 새PID33628/19:01:36으로 실행했습니다. MSVC 라이브러리 생성 안내 경고는 남았습니다.
- 추가 검사 실패: 표준보다 넓은 `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`에서 기존 테스트의 `chunks_exact_to_as_chunks`1개(`audio/monitor.rs`)와 `err_expect`7개(`judgement/practice.rs`, `storage/projects_tests.rs`)가 검출됐습니다. 이번 실행 속성 변경 원인으로 보지 않으며 테스트 코드 lint 정리는 후속 작업으로 남깁니다. 이 확장 검사를 통과했다고 기록하지 않습니다.
- 프론트/번들 검사는 미실행 — 변경이 Rust binary의 Windows 실행 속성 한 줄뿐이며 기존134개 프론트·번들1개 성공 이력을 유지합니다. 의존성·IPC·데이터는 변경하지 않았습니다. 앱에서 ‘복원 확인’ 이름·재생 복원과 별도 콘솔이 새로 생기지 않는지는 사용자 확인 대기입니다. 해당 요청 후 파일·앱을 유지하며 Phase 4A는 최종 확인 중입니다.

### 최종 사용자 확인·완료 — 2026-10-15

- 사용자 ‘보이고 재생도 됨 cmd창도 안생김’: 재실행한 제품에서 ‘복원 확인’ 이름 표시와 실제 녹음 청취, 별도 콘솔 미생성을 확인했습니다. 앞선 읽기 전용 메타데이터 유지 검사와 구분해 실제 UI/청취 결과로 기록합니다.
- 최종 검사: 프론트134개/40파일·타입/린트/포맷, native100개/기본 제외3개·fmt/표준 Clippy, 번들1개와 Windows 빌드/실행 성공. 각 명령 시점과 미실행 범위는 위 이력을 따르며 이번 답변 수신만으로 검사를 다시 실행한 것으로 기록하지 않습니다.
- 로드맵4A의 나머지 항목과 진행표를 완료로 갱신했습니다. 원본/네트워크/YouTube 정책과 실제 A/B 육안 판단·실제 왕복 지연/ASIO·다중 segment·곡0ms 자동 REC 등 기존 제약은 유지합니다. 다음은 승인 요청 없이 Phase 4B입니다.
