# Phase 03 — 오디오 입력과 단음 판정

## 후속 — RMS와 분리한 입력 최대값 누적 진단 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 입력 레벨이 RMS여서 피크1 사인파(약-3dBFS)에서도 기존 RMS>-1 경고가 나오지 않는 누락을 재현했습니다. 기존 튜너/노이즈 게이트·onset/판정을 유지하고 사용자에게 입력 GAIN 안내를 제공하는 진단 후속입니다. 실제 장치 수용과 고급 판정 완료로 기록하지 않습니다.

### 2. 구현 및 변경 사항

- docs/12를 먼저 갱신해 v1 선택적 `fullScaleFrames`와 이전 native 호환·동시 게시 상한/기기 한계를 정의했습니다.
- `audio/dsp.rs`는 실제 DSP worker가 처리하는 유한한 샘플의 절댓값1 이상 프레임을 누적합니다. 오디오 callback/녹음/모니터 큐·피치/onset 연산은 그대로이고 새 할당/로그·디스크 쓰기를 추가하지 않습니다.
- `audio/input.rs`의 새 상태는0부터 시작하며 worker가 누적값을 게시합니다. callback의 captured 카운터 갱신 전에는 현재 capturedFrames 상한을 적용하며 오류/중단은 직전 값을 보존합니다.
- `audioInput.ts`/`audioInput.test.ts`는 v1 이전 필드 누락과 안전 정수/전체 프레임 상한을 검증합니다. `InputPanel.tsx`/테스트는 RMS 표시를 명시하고 누적값/입력 GAIN 안내·기존 고RMS 경고와 중복 제거·새 입력/중단/이전 native를 구분합니다. 새 의존성·DB/Python 계약·자동 입력/REC는 없습니다.

### 3. 테스트 결과

- 수정 전 `pnpm exec vitest run src/features/practice/InputPanel.test.tsx`: **1실패/2성공**,2.25초. RMS-3.01에서 최대값12프레임 안내가 없는 문제를 재현했습니다(`input-full-scale-before-20261026.log`).
- 수정 후 InputPanel/audioInput/useAudioInput 대상: **14개/3파일 성공**,최종3.40초. 타입/lint/포맷과 전체 프론트 **521개/112파일 성공**,36.47초(`input-full-scale-front-20261026.log`). 마지막 중복 경고 분기 보완 뒤 대상14개를 다시 검증했습니다.
- Rust 초기 대상3개는 성공했으나 상태 필드에 직접 값을 대입하는 중복 테스트를 제거하고 기존 실제 서비스의 오류/중단 검사에 통합했습니다. 최종 전체 Rust/Clippy/MSRV·웹/Windows 빌드/원격은 **진행 중**, 실제 완료 결과를 이어 기록합니다.
- 첫 확장 명령에 존재하지 않는 judgement-runtime feature를 지정해 실행 전 실패했습니다. Cargo.toml/CI의 실제 --all-features로 수정했고 실패 로그 `input-full-scale-invalid-feature-20261026.log`를 보존합니다. 이 실패를 검사 성공으로 세지 않습니다.
- 실제 입력 장치/사용자 앱·개인 자료/REC: **미실행** — 자체 신호와 임시 상태만 사용합니다.

독립 후보 확정: main `e44318603b4f43b0e4c3ef2521e5f86d2dc3eb1b`의 EXE41,233,408바이트·SHA `ba282dc0ff02a5d557522aeb29a37b8bb9426e5e5d4421ca243e7adb2e01a757`와 runtime3393파일/64,095,466바이트를 새 UUID 폴더에 보존했습니다(`input-full-scale-candidate-b4843979-4b93-4c36-a73c-c77c7017bd7e.json`). ZIP `validation-packages/26b5ce90-9b86-47b9-b947-52fbc9b300c9/GuitarLab-validation.zip`은3613파일/40,287,939바이트·SHA `8f54d26df8327644674c9f0994ab5e6a180c1ae87904845b2654a1fb3f7f03d5`입니다. 전체SHA/CRC·동일 바이트 추출/실제PS5.1 종료0/개발PATH를 뺀Python3.12.15 검사가 성공했습니다(`input-full-scale-package-receipt-883bc150-a9e9-448d-a26b-e6a8293ea2a7.json`). 같은EXE/ZIP만 Defender 치료 없이 검사해 모두0/지문 동일이고 NotSigned입니다(`input-full-scale-defender-06758da7-7459-4f2b-8674-82a587f7610c.json`). [Windows40255344804](https://github.com/BomJin2/GuitarLab/actions/runs/40255344804)는 진행 중이며 앱 실행/실제 장치·새OS 검증은 미실행입니다. generic 실행 포인터와 사용자 앱/자료는 변경하지 않았습니다.

최종 로컬 결과: 확장 `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features` **253개 성공/28개 기본 제외**,18.90초입니다(`input-full-scale-rust-20261026.log`). 확장 all-targets Clippy **성공**,19.25초·`cargo +1.90.0 check … --all-targets --all-features` **성공**,16.28초입니다. `pnpm build` **성공**,Vite1분42초·기존chunk 안내(`input-full-scale-build-20261026.log`), 최종 내장 `bundle_tests`/Windows custom-protocol 빌드도 **성공**,Windows12.10초·기존MSVC 링크 안내입니다(`input-full-scale-{bundle,native-build}-20261026.log`). 앱은 실행하지 않았습니다. 위 진행 중은 이전 이력이며 정확한 소스 Git/원격을 다음으로 확인합니다.

원격 확정: main `e44318603b4f43b0e4c3ef2521e5f86d2dc3eb1b`의 [Windows40255344804](https://github.com/BomJin2/GuitarLab/actions/runs/40255344804)/job121355885192는 정리까지 **전체 success**입니다.521프론트/112파일, 기본249Rust(44.78초)/확장253Rust(82.89초·각28개 기본 제외), 예제1+1·AI113(2.39초)/도구143(13.757초)·MSRV12.70초를 확인했습니다. `input-full-scale-ci-final-20261026.json`에 정확한 소스/실행을 보존하며 위 원격 대기는 이전 이력입니다.

### 4. 미구현 및 알려진 문제

이 값은 클리핑 발생 시간/지속 시간이나 아날로그 왜곡 판정이 아닙니다. 분석 큐에 도착하지 못한 프레임은 제외하고 정수 입력의 양의 최대값이1 미만일 수도 있어 모든 포화를 검출하지 않습니다. 입력을 다시 시작하면 누적값은 초기화되며 이전 native는 해당 표시를 제공하지 않습니다. 기존 채점 임계값/녹음 PCM·장치 선택/기본 모니터 꺼짐 정책을 유지합니다.

### 5. 다음 작업 계획

전체 Rust/최소 버전·Windows/내장 빌드와 정확한 소스 원격 검사를 마칩니다. 새 필드로 실제 연주 지연·정답률이나 고급 채점 완료를 주장하지 않으며 다음 독립 요구사항은 기존 로드맵 순서/미완료 경계에 맞춰 진행합니다.

## 1. 작업 개요

- 목표: Rust CPAL 입력·레벨·튜너, onset/pitch, 캘리브레이션·epoch 동기화와 결정론적 판정.
- 작업 시작일: 2026-10-13. **완료일: 2026-10-14**.
- Phase 0~2 검증·문서화 완료 후 순서대로 착수. 아래 초기 중간 기록은 이력을 보존하며, 최종 완료 범위와 실제 확인 결과는 문서 마지막 절을 우선합니다.

## 2. 구현 및 변경 사항

- CPAL 0.18.2(Apache-2.0), ringbuf 0.5.3(MIT OR Apache-2.0), 공식 Tauri API 2.12.3 설치. CPAL 최소 요구에 맞춰 Rust 최소 버전을 1.85로 변경. 현재 Rust 1.98에서 컴파일 확인.
- `src-tauri/src/audio/input.rs`: 장치 열거·선택 채널 입력·중단, bounded SPSC sample queue, capture timestamp/sample index, 누락·불연속·장치 오류 진단. 입력 callback에서 DSP/잠금/로그/파일/IPC 수행하지 않음. 알려진 loopback endpoint는 목록과 시작 요청에서 거부.
- `src-tauri/src/audio/dsp.rs`: worker에서 gate·RMS/onset·YIN 계열 pitch PoC. 입력 sample rate를 유지하고 평균 decimation으로 약 12kHz 분석. 1024 분석 sample window와 256 hop, 원본 onset timestamp 유지. 평균 필터의 alias 억제/실제 기타 품질은 후속 측정 필요.
- `src-tauri/src/judgement/mod.rs`: 장치·UI와 독립적인 matcher. COOL/GOOD/MISS, 오음 후 재시도, 중복 sequence/epoch 방지, 보정·속도, 낮은 신뢰/코드/중단 제외. **실시간 UI 채점은 아직 연결하지 않음**.
- `src-tauri/src/commands/mod.rs`, `ipc/mod.rs`, `lib.rs`: 버전·입력 검증을 갖춘 입력 명령과 고정 한국어 오류. blocking 장치 설정은 별도 task에서 실행.
- `src/features/practice/audioInput.ts`, `useAudioInput.ts`, `InputPanel.tsx`: 응답 런타임 검증, 순차 폴링·요청 세대, 장치/채널/gate 선택, 명시적 시작/중단, 레벨·튜너·진단. 설정/연습/연주에서 접근. 모드 이동 시 앱 수준 입력 상태 유지.
- `src/app/App.tsx`, `AppShell.tsx`, 설정/악보 workspace: 실제 입력 상태 표시. 기존 악보 import·반주 재생 구조 유지. 녹음 파일 생성 없음.
- `docs/12-API-CONTRACTS.md`: 구현 전 입력·순수 matcher 계약 추가.

## 3. 테스트 결과 — 중간 기록

| 명령/검사 | 결과 | 비고 |
|---|---|---|
| `cargo check --locked --manifest-path src-tauri/Cargo.toml` | 성공 | CPAL/ringbuf/입력 명령 컴파일 |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml` | 성공 16개 | 8개 판정 시나리오 포함 matcher 10개, DSP 4개, 입력 검증/IPC 2개. 이후 추가한 loopback 테스트는 최종 재검사 예정 |
| `cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings` | 성공 | 순수 엔진과 입력 코드 |
| `cargo test --locked --manifest-path src-tauri/Cargo.toml enumerate_connected_input_devices -- --ignored --nocapture` | 성공 | 실제 장치 열거만. SSL 2 MKII Input 1/2와 stereo Input 확인. 초기 5개 중 Loopback 제외 수정 |
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` | 성공 | 프론트 38개, alphaTab 기존 큰 chunk 경고 유지. 최신 상태 표시 수정 후 최종 재검사 예정 |
| `cargo run --locked --manifest-path src-tauri/Cargo.toml` | 성공 | 실제 Windows 앱·설정 화면·장치 목록 확인 |
| 실제 기타 입력·5분 안정성·장치 해제 | 미실행 | 사용자가 SSL Input 1을 지정, 검증 진행 예정 |
| clock mapping/보정/실시간 ScorePanel | 미실행 | 연결 구현 전 |

- 제한된 네트워크에서 `cargo info`가 배포 버전을 찾지 못해 레지스트리 접근 권한으로 공식 버전·라이선스를 확인한 뒤 설치했습니다.
- 제한 환경의 `pnpm exec prettier` shim 실행이 실패해 프로젝트에 설치된 `node node_modules/prettier/bin/prettier.cjs`로 직접 포맷했습니다.
- MSVC 라이브러리 생성 `linker_messages` 알림은 기존과 동일하며 빌드 실패가 아닙니다.
- 실제 입력 캡처/사용자 연주를 합성 테스트 통과로 대체하지 않습니다. 현재 테스트 수와 결과는 위 중간 시점 기준입니다.

## 4. 미구현 및 알려진 문제

- 실제 기타 음역별 cents/onset p50·p95/CPU/5분 drop 측정, 분리·재연결 검증 필요.
- WebView 재생과 CPAL capture clock의 유효성·불확실성 측정 및 epoch coordinator 미구현. 따라서 실제 COOL/GOOD/MISS UI를 제공하지 않습니다.
- 캘리브레이션 UI·앱 데이터 경로 offset 저장·실시간 ScorePanel/Combo 미구현.
- DSP는 깨끗한 단음 PoC. 화음/왜곡/고급 주법의 정확도를 보장하지 않으며 물리적 줄·프렛을 추정하지 않습니다.
- 기본 포맷만 협상합니다. 사용자 지정 44.1k/48k·128/256/512 buffer 선택은 아직 제공하지 않으며 callbackFrames는 실제 관측값만 표시합니다.
- 이름으로 알려진 루프백 endpoint를 제외합니다. 사용자는 기타 DI 입력을 선택해야 하며 임의 가상 드라이버의 내부 라우팅을 앱이 보증하지 않습니다.

## 5. 다음 작업 계획

1. 사용자 선택 SSL Input 1에서 입력 시작/중단·단음·drop·장치 오류 측정.
2. capture/playback clock 동기화와 불확실성 진단·순수 clock 테스트. DSP 대기 시간이 matcher의 무입력 MISS를 앞당기지 않도록 처리된 capture watermark를 사용.
3. 장치/포맷별 calibration UI·offset 저장과 정상/실패/취소 계약 테스트.
4. 실시간 판정·콤보를 연결하고 speed/seek/loop/pause/끊김 통합 테스트. 수용 조건 확인 후에만 로드맵을 완료 표시.

## 튜너 우선 슬라이스 검증 — 2026-10-13

- 사용자 요청에 따라 직접 UI 조작을 중단했습니다. 앱/기타 조작은 사용자가 수행하고 코드·명령 검사만 자동 수행합니다.
- 크로매틱 튜너에 큰 음 이름·Hz(A4=440)·cents 게이지·높음/낮음 안내·중앙 ±5cents 표시를 추가했습니다. confidence 0.85 미만, 정지·장치 오류에서는 이전 검출음을 숨깁니다. 프렛/줄의 실제 식별 기능은 아닙니다.
- 사용자 선택 SSL 2 MKII **Input 1**에서 사용자가 입력 시작·단음 연주 후 **“튜너가 정상적으로 움직입니다”**라고 확인했습니다. 이 확인은 기본 튜너 동작에 한정하며 전체 음역 정확도·5분 안정성·drop 수·onset p50/p95를 측정했다는 의미가 아닙니다.
- 강한 2차 배음 fixture에서 E2가 E3(MIDI 52.045)로 잡히던 실패를 재현했습니다. 반주기/1주기의 보간 차분 잔차를 비교하도록 수정하고 동일 fixture를 통과했습니다. 12k/14.7kHz 합성 MIDI40..88 전 음역에서 오보정 회귀 테스트도 통과했습니다. 실제 왜곡 기타 전체를 보증하지 않습니다.
- 프론트 `pnpm typecheck`, `pnpm lint`, `pnpm test` **47개 통과**. 장치 선택 전 미캡처, 화면 재진입 실제 device/channel/gate 보존, 늦은 상태 조회·이중 시작·실패 재시도 테스트 추가.
- `cargo check`, `cargo clippy -- -D warnings`, `cargo fmt --check`, `cargo test` **20개 통과/하드웨어 열거 1개 기본 제외**. 별도 `enumerate_connected_input_devices -- --ignored --nocapture`는 실제 실행 성공, 루프백 제외 후 장치 4개 확인.
- `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm build`, `pnpm format:check` 성공. 기존 alphaTab 큰 chunk/MSVC library 생성 경고는 유지.
- 최신 `cargo run --locked --manifest-path src-tauri/Cargo.toml` 앱 재실행 성공(사용자가 기존 창을 직접 닫은 후). 최신 native 세션 2003.
- **Phase 3 전체는 여전히 진행 중**. 다음은 capture↔playback clock PoC와 calibration 저장·판정 연결입니다.

## clock·수동 보정 저장 구현 — 2026-10-13, 미검증 범위 포함

### 구현 및 파일

- `src-tauri/src/audio/clock.rs`: capture mapping, 3 anchor/400ms warmup, stream/epoch/rate·왕복 불확실성·잔차·오래된 입력 검사. requestSequence로 pause 이전 늦은 요청 거부.
- `src/features/player/captureClock.ts`, `useCaptureClock.ts`, `PlayerEngine.ts`, `usePlayer.ts`: 실제 media currentTime을 IPC 직전/직후 표본화하고 native clock에 연결. UI render 시각/Date.now를 판정 clock으로 사용하지 않음. 입력 진단에 왕복·anchor·잔차 표시. 실제 Windows clock PoC 검증은 아직 미실행.
- `src-tauri/src/judgement/calibration.rs`: 중앙값/MAD·이상치 제거·표본 8개 기준 순수 보정 추정. 실측 wizard에는 아직 연결하지 않음.
- `src-tauri/src/storage/calibration.rs`, `storage/mod.rs`: 수동 보정 profile JSON, revision 충돌·크기/스키마 검증·임시 파일 sync 후 rename·손상 파일 보존. 프로필 키는 현재 서버 측 입력 설정으로 생성하며 다른 stream generation이면 저장 거부.
- `src/features/settings/calibration.ts`, `useCalibration.ts`, `CalibrationPanel.tsx`, `SettingsPage.tsx`: 수동 ±500 real ms 저장/재읽기, 출력 환경, 설정 불일치 시 미적용, 저장 상태·오류. 수동값을 측정값으로 표시하지 않음. 실제 저장 명령의 앱 데이터 경로 검증은 아직 미실행.
- `src/shared/validation.ts`: 입력·보정의 공통 JSON 경계 검사. `commands/mod.rs`, `lib.rs`, `App.tsx`, `InputPanel.tsx`, `ScoreWorkspace.tsx`, 계약/범위 문서 변경.
- `bufferFrames`는 CPAL WASAPI의 실제 협상 period, `callbackFrames`는 변동 가능한 관측 packet으로 분리. 버퍼 미확인 시 튜너를 허용하고 보정 저장은 거부.
- 설치된 serde_json1.0.154와 uuid1.28.0의 라이선스·MSRV 확인 후 exact 고정. uuid 요구에 따라 Rust 최소1.89, 현재1.98.
- `package.json`에 `pnpm verify:app` 추가: 프론트 타입/린트/테스트/빌드/포맷과 Rust fmt/clippy/test를 순서대로 실행. **새 통합 명령 자체는 미실행**.

### 검사 결과와 실행 제한

- 마지막 전체 프론트 실행: **59개 테스트 통과**, 타입·린트 성공. 이후 expectedStreamGeneration/입력 재읽기 초기화 변경의 타입 검사만 성공한 상태입니다. 최종 전체 프론트·빌드·포맷은 **미실행**: 자동 승인 검토가 계정 사용량 제한으로 실패해 실행되지 않았습니다. 안전상 거부 판정은 아니며 우회 실행하지 않았습니다.
- 정상 권한 환경에서 마지막 수집된 Rust 전체 검사: **32개 통과/하드웨어 열거 1개 제외**. 이후 추가한 파일 상한·세대 검사 등의 최종 clippy는 성공 출력 확인. 후속 test 실행 세션26039는 환경 변경 후 핸들이 없어 최종 결과 미확인.
- 새 제한 환경에서 `cargo fmt --check`: **실패**, A드라이브/프로젝트 canonicalize 접근 거부(os error5). `cargo clippy --locked --offline ... -- -D warnings`: **성공**. `cargo test --locked --offline ...`: **실패**, 파일 fixture 경로 접근 실패 과정에서 테스트 정리 Drop의 추가 panic이 최초 오류를 덮으며 프로세스가 비정상 종료(0xc0000409). 따라서 최종 전체 Rust 통과로 기록하지 않습니다.
- 테스트 fixture 정리에서 경로 확인 실패 시 삭제를 생략하고 고정 진단을 남기도록 수정하여 이중 panic을 제거했습니다. 이 정리 변경의 재실행은 **미실행**, 일반 권한의 수동 검사 또는 자동 승인 검토 복구 후 확인 필요. 실제 앱의 사용자 보정 파일을 삭제하거나 경로 검사를 약화하지 않았습니다.
- Rust 최소 버전 변경 후 clippy의 is_multiple_of 제안을 적용했습니다. useCalibration의 effect/취소 ref 린트 경고는 useCallback과 요청 세대 참조로 해결하고 타입·린트 성공을 확인했습니다.
- 현재 프로세스 확인에서 이전 native/Vite 프로세스가 없고 기존 세션 핸들이 유효하지 않음. 이전 기록의 세션2003/70499를 살아 있다고 가정하지 말고 실행 상태부터 확인할 것.

### 남은 작업 / 재개

1. `pnpm verify:app` 최종 실행 결과 확인. 최신 native/Vite 재실행 후 clock 진단·수동 보정 저장/재읽기를 사용자가 검증.
2. 반복 연주 calibration wizard, 측정 provenance·취소·프로필 저장, 실제 채점 적용. 순수 추정 함수 통과를 실측으로 대체하지 말 것.
3. 처리된 capture watermark와 저신뢰 onset을 matcher에 연결, ScorePanel/Combo·attempt 기록·pause/seek/loop/장치 오류 통합.
4. 실제 장치 5분 안정성·분리/재연결·음역·지연 분포 측정. **Phase 3 전체 미완료**, Phase 4로 넘어가지 않음.

### 수동 검사 피드백 — 포맷 수정 (2026-10-13)

사용자 `pnpm verify:app` 실행이 `audioInput.test.ts`의 추가된 bufferFrames 테스트 줄 포맷에서 중단되었습니다. 해당 파일을 설치된 Prettier로 수정하고 전체 `prettier --check .` 성공을 확인했습니다. Rust fixture 정리 코드도 형식을 정리했습니다. 현재 제한 환경의 cargo fmt/rustfmt는 경로 canonicalize 접근 거부로 실행 실패해 Rust 전체 포맷·통합 검사는 여전히 사용자 일반 터미널에서 확인해야 합니다. 기능 변경이나 새로운 Phase 완료 처리는 없습니다.

### 사용자 검사 종료 로그 확인 (2026-10-13)

사용자가 재검사 후 main/doc-tests의 `0 passed; 0 failed` 정상 종료 로그를 전달했습니다. 이 0개는 해당 target의 테스트가 없다는 뜻이며 라이브러리 단위 테스트 개수와 다릅니다. 앞서 요청한 `pnpm verify:app`이 이 지점까지 도달했다면 `&&`로 연결된 앞선 검사가 성공한 것으로 해석할 수 있습니다. 전체 원문·단위 테스트 개수는 전달되지 않아 정확한 최종 개수를 추가로 단정하지 않습니다. 다음은 최신 Windows 앱에서 clock 진단과 수동 보정 저장/재읽기 확인입니다. Phase 3 전체 완료 처리는 하지 않습니다.
## 추가 실제 앱 검증 — 2026-10-13

- 사용자 수동 검증 성공: 최신 `pnpm tauri dev` 앱에서 SSL 2 MKII Input 1 입력을 시작하고 0ms 수동 보정 저장 후 다시 읽었습니다. 사용자 응답: “0ms 저장값이 다시 표시됩니다”. 저장·재읽기 UI 흐름 확인이며 지연이 실제 0ms라는 측정 결과는 아닙니다.
- 재생/입력 clock 진단은 사용자 확인 대기 중입니다. 반복 연주 측정 sampler 코드는 추가했으나 새 테스트는 아직 **미실행**이며 Phase 3 전체는 진행 중입니다.

### 수동 검증 중 자동 재시작 정리

- 원인: 사용자에게 앱 검증을 요청한 동안 Rust 소스를 수정하여 `tauri dev` 파일 감시가 앱을 재시작했습니다. 사용자 검증을 방해했으므로 추가하던 측정 연결 변경을 되돌렸습니다.
- 반복 측정 명령/MEASURED 저장은 미구현입니다. docs/12에는 초안으로 명시했으며 기존 MANUAL 저장 구현을 유지합니다.
- 현재 앱 확인이 끝날 때까지 소스 수정과 재실행을 하지 않습니다. 후속 작업도 구현·빌드와 사용자 수동 검증 시간을 분리해야 합니다.
- 이번 복구 후 새 빌드/테스트는 **미실행**입니다. 실제 clock 진단 역시 재시작으로 중단되어 확인되지 않았습니다.

## 소스 수정 없는 검토·순수 모듈 검증 — 2026-10-13

### 작업 개요와 변경 파일

- 전체 상태: Phase 3 진행 중. 사용자 앱 확인 중에는 소스 수정·앱 시작/중단·재실행을 하지 않습니다.
- 이 검토에서는 제품 소스를 변경하지 않았습니다. 진행 문서 두 개를 갱신하고 Git 제외 경로 `src-tauri/target/inspection/phase3-pure.rs`에 임시 검사 진입점을 만들었습니다. 현재 소스의 ipc/judgement/calibration/calibration_sampler/clock/dsp 모듈을 `#[path]`로 직접 포함하며 복제한 구현이나 가짜 분석 결과로 검사하지 않습니다.
- 프로세스 조회에서 guitarlab/node/cargo 항목을 찾지 못했습니다. 사용자 수동 확인이 끝났다고 해석하거나 자동으로 앱을 다시 시작하지 않았습니다.

### 테스트 결과와 명령

| 검사 | 결과 | 범위와 제약 |
|---|---|---|
| `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml judgement:: -- --nocapture` | 컴파일 실패 | Tauri generate_context의 `OUT_DIR env var is not set` 오류. 테스트 실행 전 중단되어 matcher 실패를 의미하지 않음 |
| 임시 진입점 `rustc --edition=2021 --test ...` 후 `phase3-pure.exe` | 31개 통과 | 현행 순수 모듈: matcher 10, 보정 추정 3, sampler 5, clock 6, DSP 6, IPC 1. sampler의 이전 미실행 상태는 이 범위에서 해소됨 |
| 임시 관찰 검사 두 개 추가 후 같은 실행 | 33개 통과 | 위 31개 + 아래 두 현재 동작 재현. 관찰 검사의 통과는 결함 수정 완료를 뜻하지 않음 |
| 전체 앱 Rust 빌드/fmt/clippy, 프론트 통합 검사, 실제 clock 진단 | 미실행 | 이번 검토 범위 밖. 사용자 앱 확인을 방해하지 않으며 제한 환경 Cargo 컴파일 문제도 남음 |

재현 실행 예시(프로젝트 루트, 임시 진입점과 기존 의존성 빌드가 존재할 때):

```powershell
$phase3Serde = Get-ChildItem -LiteralPath 'src-tauri/target/debug/deps' -Filter 'libserde-*.rlib' |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
rustc --edition=2021 --test src-tauri/target/inspection/phase3-pure.rs `
  -L dependency=src-tauri/target/debug/deps --extern "serde=$($phase3Serde.FullName)" `
  -o src-tauri/target/inspection/phase3-pure.exe
if ($LASTEXITCODE -eq 0) { & 'src-tauri/target/inspection/phase3-pure.exe' }
```

이 경로는 빌드 산출물이며 새 세션에서 보존을 보장하지 않습니다. 전체 `cargo test`를 대신한 완료 근거로 사용하지 않습니다. 독립 실행기의 dead_code 경고 3개와 제한 환경 canonicalize 경고가 있었으나 테스트 실행은 성공했습니다.

### 검토에서 확인한 미해결 사항

1. `audio/dsp.rs`는 confidence 0.85 미만 또는 피치 미검출 onset을 최종 이벤트로 내보내지 않습니다. 현재 튜너는 저신뢰를 숨기지만, 실시간 matcher 연결 시 불확실한 연주를 무입력 MISS로 만들 수 있습니다. 저신뢰/미검출 onset 계약과 UNVERIFIED 전달을 먼저 구현해야 합니다.
2. DSP는 onset 후 피치 창을 채우고 최대 200ms 대기합니다. matcher `advance`에는 이 지연을 아는 기능이 없으므로 현재 재생 시각으로 직접 호출하면 입력 분석 전에 MISS가 확정될 수 있습니다. 처리 완료된 capture 시각과 미확정 onset을 반영한 마감 기준이 필요합니다.
3. `useCaptureClock.ts`는 effect마다 sequence를 0으로 초기화하고 Rust ClockSession은 같은 stream의 마지막 sequence를 유지합니다. 임시 검사에서 기존 sequence 10 이후 새 sequence 1이 INVALID_INPUT으로 거절되는 것을 재현했습니다. 실제 재마운트/HMR 상황의 끝까지 이어진 앱 재현은 미실행입니다. bridge 재생성 시 요청 번호 연속성 또는 세션 식별 계약을 추가해야 합니다.
4. malformed monotonicNs를 보낸 ClockSession.update가 오류를 반환하면서 직전 mapping의 READY 상태를 남기는 것을 임시 검사에서 재현했습니다. 현재 UI는 UNCERTAIN을 표시하고 오래된 mapping은 최대 1초 제한이 있지만, 향후 네이티브 채점이 오류 이후 예전 mapping을 사용하지 않도록 명시적 무효화가 필요합니다.

### 다음 작업

사용자 clock 진단 확인 후 소스 작업을 재개합니다. 위 clock 생명주기 오류를 회귀 테스트와 함께 수정하고, 저신뢰 onset·처리 시각을 계약에 반영한 뒤 반복 연주 보정/실시간 판정 연결을 구현합니다. 구현·빌드를 끝낸 뒤 소스 수정을 멈춘 상태에서 사용자 하드웨어 검증을 요청합니다. Phase 4는 Phase 3 완료 조건 확인 전 착수하지 않습니다.

### 사용자 실제 입력 진단 — 2026-10-13

사용자가 전달한 앱 표시: 48000Hz / 1채널 / f32, callback 480프레임 / 협상 버퍼 480프레임, 캡처 7455840프레임 / 누락 0 / 불연속 0 / 검출 onset 30, capture monotonic ns `99265959337966`.

- 누적 캡처 약 155.33초(프레임/샘플레이트), 버퍼 period 10ms. 관측 구간 누락·불연속 0은 확인했지만 5분 안정성, CPU, 전체 음역 정확도, onset 오차 분포를 대신하지 않습니다.
- 같은 표시의 clock은 “입력과 반주 재생이 필요합니다”, 왕복/잔차는 미표시, anchor 0입니다. 입력 통계 확인은 성공이나 clock READY 검증은 **미확인**입니다. 정지/음원 미선택 상태에서의 정상 대기 표시일 수 있으므로 재생 위치가 실제 움직이는 동안 다시 확인합니다.
- 사용자에게 합성 음원과 0~2000ms 반복 재생의 진단을 요청했으며 소스 수정·앱 재실행은 계속 중단한 상태입니다. OS 프로세스 조회에 항목이 없어도 사용자 앱 표시를 무시하거나 앱 종료로 단정하지 않습니다.

### 사용자 실제 재생·입력 clock 안정 표시 확인 — 2026-10-13

- 합성 음원 불러오기는 사용자가 일시적으로 실패를 의심한 뒤 “아니다 된다”라고 확인했습니다. 조사 중 읽기 명령만 실행했으며 해당 기능 소스는 수정하지 않았습니다.
- 후속 사용자 진단: 48000Hz / 1채널 / f32, callback·협상 버퍼 각각 480프레임, 캡처 2951040프레임 / 누락 0 / 불연속 0 / 검출 onset 42, monotonic ns `99476289940766`.
- 재생 시간 동기화 표시: **동기화 PoC 안정**, 왕복 **3.20ms**, anchor **8**, 최대 잔차 **0.94ms**. 사용자 요청에 따른 실제 앱 재생·입력 동기화의 기본 안정 표시 확인은 성공입니다. 앞선 IDLE(anchor0) 관측과 구분합니다.
- 왕복은 WebView↔Rust IPC 시간이고 잔차는 미디어 clock과 capture clock 앵커 사이의 일관성입니다. 음향 출력 지연·사용자 반응·기타 onset 검출 오차를 합한 실측 지연은 아직 측정하지 않았습니다.
- 누적 캡처 약61.48초 구간의 누락/불연속0 확인입니다. 실제 5분 연속 안정성, pause/seek/rate 변경 후 재동기화와 장치 분리/재연결 검증은 **미실행**입니다. 실제 점수 연결과 반복 연주 보정 wizard도 미구현이며 Phase 3 전체는 완료하지 않습니다.
- 이번에는 진행 문서만 갱신했으며 앱 재시작을 유발하는 소스 수정은 하지 않았습니다. 다음 구현은 앞서 기록한 clock 생명주기·저신뢰 onset·분석 마감 시각 처리부터 진행합니다.

## clock 재연결·불확실한 입력 처리 — 2026-10-13

### 작업 개요

Phase 3 진행 중. 실제 기본 clock 확인 후 재연결 오류와 성급한 MISS 위험을 수정했습니다. Phase 전체 완료 날짜는 아직 없습니다. 앱을 감시하지 않는 Git 제외 target 폴더에서 후보를 구현·검사한 뒤 반영했습니다.

### 구현 및 주요 파일

- `src-tauri/src/audio/clock.rs`: 마지막 requestSequence/playbackEpoch 조회, 최신 malformed/overflow/중복 timestamp 오류 시 mapping 무효화. 오래된 sequence/epoch/다른 stream 거부 유지 및 회귀 테스트.
- `src/features/player/captureClock.ts`, `useCaptureClock.ts`, `PlayerEngine.ts`와 대응 테스트: native 번호 하한을 읽어 재마운트 요청 연속성 확보, 새 플레이어의 이전 epoch 재사용 방지. 일시정지 reset에도 적용.
- `src-tauri/src/audio/dsp.rs`: 미검출 피치를 null로 명시, 다음 공격에 밀린 미확정 onset을 worker 내 최대8개 대기열에 보존. 초과는 불연속 진단에 반영. 기존 튜너/YIN 피치와 지속음 억제 유지.
- `src-tauri/src/audio/input.rs`: nullable onset, unknown confidence0, 처리 마감 시각 `judgementWatermarkNs` 발행. 새 계산은 worker에서만 수행하며 실시간 콜백은 ring/atomic 전송 유지.
- `src-tauri/src/judgement/mod.rs`: 피치 미확정 후보는 UNVERIFIED, 유효 피치 재시도 허용. `calibration_sampler.rs`는 기존 코드 포맷 적용.
- `src/features/practice/audioInput.ts`, `audioInput.test.ts`: nullable onset/처리 시각·u64 timestamp 계약 검사. watermark가 캡처 시각보다 큰 값 거부.
- `docs/12-API-CONTRACTS.md`: 구현 전 계약 갱신. 진행 문서 두 개 갱신. 삭제한 제품 기능과 새 제품 의존성 없음.

### 테스트 결과·명령

| 검사 | 결과 | 범위 |
|---|---|---|
| 임시 후보 타입·린트·Vitest·Vite·Prettier | 성공 | 프론트62개 |
| 임시 Cargo 후보 clippy/test | 성공 | 실제 입력·저장 포함45개, 장치 열거1개 제외 |
| 루트 `pnpm verify:app` | 성공 | 타입·린트·테스트·빌드·포맷·Rust fmt/clippy/test 정상 종료 |
| 임시 프론트 복사본 정리 후 루트 `pnpm test` | 성공 | 제품 소스16파일/62개. 첫 통합 실행의124개는 제품62+임시62 중복이므로 공식 개수로 사용하지 않음 |
| 최종 clock 보완 후 `cargo fmt --check --manifest-path src-tauri/Cargo.toml`, `cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml -- -D warnings`, `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml` | 성공 | 실제 Tauri crate45개/기본 제외1개. main/doc-tests0개는 별도 target |
| 변경 후 native 입력·재마운트·pause/seek/rate 실제 회귀 | 미실행 | 이전 사용자 기본 clock 결과와 이번 수정 후 검증 구분 |
| Python 검사 | 미실행 | Python 소스/의존성 변경 없음 |

DSP→matcher 합성 통합 테스트에서 200ms 분석 대기 뒤 오는 피치 미확정 입력이 처리 시각 기준으로 MISS 대신 UNVERIFIED가 됨을 rate0.5/0.75/1/1.5에서 검증했습니다. 잡음·60ms 간격 두 공격·지속음·강한 배음 회귀도 포함하며 실제 기타 지연 실측을 대신하지 않습니다.

### 발생한 오류와 해결

- 기본 제한 환경의 Rustfmt 접근 거부, Vitest realpath EPERM·타입 의존성 해석 오류: 이번에 자동 검토가 허용한 require_escalated 로컬 검사에서 타입/테스트/포맷 성공. 과거 사용량 제한 이력과 구분합니다.
- 직접 rustc 임시 전체 검사에서 서로 다른 feature의 serde 캐시가 섞여 trait 불일치: 제품 의존성 수정 없이 임시 Cargo manifest로 exact 버전들을 일관되게 해결하고 검사 성공.
- 임시 fixture 복사 위치 오류로 suite import 실패: 원본 절대 경로에서 올바른 임시 루트로 복사 후62개 성공. 임시 프론트 폴더는 절대 경로 확인 후 삭제하여 루트 테스트 중복 발견 해소.
- 기존 alphaTab 약1.28MB chunk 경고와 MSVC library 생성 알림 유지. 검사 실패 아님.

### 미구현·다음 작업

후속 실제 앱 회귀: 사용자가 일시정지→재생→0.75× 변경 확인 요청 후 “제대로 안정으로 돌아옴”이라고 응답했습니다. 중단/재생/배속 변경 뒤 clock 안정 복귀는 실제 앱에서 확인했습니다. 재마운트/HMR·장치 분리·5분 지속성 및 새 unknown onset 경로의 실제 기타 측정은 아직 미실행입니다. 이 사용자 확인이 끝나 다음 보정 구현을 진행합니다.

반복 연주 측정 세션·취소·측정값 저장/wizard, native matcher와 ScorePanel/Combo·attempt 연결이 남았습니다. watermark는 발행하지만 실제 채점을 호출하지 않습니다. 다음은 보정 wizard, 이후 실제 판정 연결 및 5분 안정성·장치 분리·음역/onset 지연 검증입니다. 이전 임시 observation harness는 수정 전 동작 기록이며 최신 전체 Cargo 결과를 우선합니다. Phase 3 수용 조건 확인 전 Phase 4 미착수.
## 반복 연주 보정 wizard 구현 — 2026-10-13

### 작업 개요

Phase 3 진행 중. 사용자 확인으로 pause→재생→0.75× 변경 후 clock 안정 복귀를 기록하고, 전용 클릭에 맞춰 단음을 반복하여 관측 지연을 계산·저장하는 기능을 구현했습니다. Phase 전체 완료 날짜는 아직 없습니다.

### 구현 및 주요 변경 파일

- `src/features/settings/CalibrationClickClock.ts`: 사용자 시작 때만 전용 AudioContext를 열어16회 클릭 예약(첫1000ms, 간격750ms). 원본 음원을 교체하지 않고 기존 반주를 일시정지합니다. 취소·종료 시 예약 출력/노드/context 정리, 늦은 resume가 새 context를 닫지 않도록 처리.
- `useCalibrationMeasurement.ts`, `calibrationMeasurement.ts`: 단일 전용 clock bridge, 네이티브 실제 표본만 수집/표시, 준비 단계도90초 기한, 입력 변경/재생 조작/화면 이동 취소, revision 충돌 재읽기, 저장 중 취소와 저장 완료의 구분. 서버에는 측정 ID만 보내며 입력 배열이나 계산한 측정값을 보내지 않습니다.
- `CalibrationPanel.tsx`, `SettingsPage.tsx`, `src/app/App.tsx`: 시작/취소/측정 저장 UI, 표본/관측 오프셋/MAD 흔들림/제외 수 표시. 측정 중 수동 변경은 잠그고 재읽기는 허용. 기존 수동 저장·음원·악보 유지.
- `calibration.ts`, `useCalibration.ts`: MANUAL/MEASURED 구분, 측정 통계 계약 검사, 저장된 document 반영. `src/shared/logger.ts`: 개인 경로/원문 없이 정리 실패 진단.
- `src/features/player/useCaptureClock.ts`: 보정 동안 일반 media bridge 비활성화, 같은 진단 decoder 재사용. 두 clock이 native mapping을 동시에 갱신하지 않습니다.
- `src-tauri/src/judgement/calibration_measurement.rs`: UUID 측정 세션, 최초 sequence 제외, 고정 epoch/grid·입력 구성·누락/불연속 검사, 최대90초/16개 표본, 취소/SAVED 생명주기. native capture에서만 표본을 얻습니다.
- `audio/input.rs`, `audio/clock.rs`, `audio/mod.rs`: 실제 캡처 온셋의 현재 mapping 변환·프로필 검증. `judgement/calibration.rs`, `calibration_sampler.rs`, `mod.rs`: 추정 응답/예약된16개 박자 한정 및 모듈 등록.
- `storage/calibration.rs`: 측정값 원자 저장, 기존 MANUAL JSON 호환, 같은 key ID 유지, 수동 덮어쓰기 때 측정 통계 제거. `commands/mod.rs`, `lib.rs`: 네 명령과 MeasurementService 등록.
- 관련 프론트/네이티브 테스트와 docs/12·진행 문서 갱신. 삭제된 제품 기능·추가 제품 의존성·오디오 파일 생성/전송 없음.

### 테스트 결과와 오류 해결

| 실행 | 결과 | 범위 |
|---|---|---|
| 임시 후보 타입/린트/테스트/빌드/포맷 | 성공 | 프론트73개, 실제 서버 응답 형식/취소·타임아웃·저장 중 취소/UI 잠금 포함 |
| 임시 후보 Rust clippy/test | 성공 | 50개/장치 열거1개 기본 제외 |
| 반영 후 루트 `pnpm verify:app` | 성공 | 타입·린트·73개 테스트·빌드·포맷·Rust fmt/clippy·50개 테스트/1개 제외 전체 정상 종료 |
| 최신 Windows 앱 프로세스 조회 | 성공 | 반영 후 새 PID30356 실행 확인. 소스 반영 이전 PID37712와 구분. 프로세스 조회는 UI/실제 측정 검증을 대신하지 않음 |
| 실제 클릭 출력·반복 기타 측정·MEASURED 저장/재읽기 | 미실행 | 사용자 수동 검증 요청 예정. 합성/mock 테스트로 실제 장치 결과를 주장하지 않음 |
| Python 검사 | 미실행 | Python 소스/의존성 변경 없음 |

- 없는 jest-dom matcher 사용으로 새 UI 테스트 타입 오류가 발생했습니다. 패키지를 추가하지 않고 표준 DOM disabled 속성 검사로 수정했습니다.
- 화면 이동 effect의 객체 의존성 린트 경고는 안정적인 active/cancel 값을 분리해 해결했습니다.
- 출력 준비가 영원히 완료되지 않는 경우도 시작 시점 기한으로 종료하며, 사용자 gesture 안에서 AudioContext 준비를 시작합니다. 늦은 완료·저장 응답 뒤 정리는 테스트로 확인했습니다.
- 기존 alphaTab 약1.29MB chunk 경고 유지. 검사 실패 아님. 후보를 검사한 뒤 반영했고 임시 프론트 복사본은 경로 검증 후 정리해 루트 테스트 중복을 방지했습니다.

### 미구현·알려진 제약·다음 작업

실제 측정 지연은 출력 지연+사용자 박자 반응+입력/검출 지연의 합이며 순수 장치 latency가 아닙니다. 한 박자 절반375ms보다 큰 지연의 위상 모호성은 수동값으로 보완합니다. 헤드폰을 권장하고 출력/모니터 조건 변경 시 재측정합니다. 실제 반복 측정·저장 검증은 대기 중입니다. 다음은 native matcher/ScorePanel/Combo·attempt 연결, 이후5분 안정성·장치 분리/재연결·음역/onset 분포 검증입니다. Phase 3 전체 완료·Phase 4 착수 아님. 사용자 확인 동안 원본 소스를 수정하지 않습니다.
### 반복 보정 실제 사용자 결과 — 2026-10-13

사용자가 전달한 실제 앱 출력: “측정한 보정값을 로컬에 저장했습니다”, 수집11/16회, 보정 동기화 안정/최대 잔차8.12ms, 관측 지연45.82ms, 흔들림38.18ms, 유효11회/이상치 제외0회. 실제 반복 입력과 MEASURED 저장 성공을 확인했습니다. 16클릭 중5회가 표본으로 수집되지 않은 이유별 분석은 아직 수행하지 않았습니다. clock 잔차와 반응 흔들림을 순수 입력 하드웨어 latency 또는 전체 음정 정확도로 해석하지 않습니다.

재읽기 버튼을 포함한 확인 요청에 사용자가 위 출력을 제공했습니다. 다만 ‘현재 설정 저장값’ 행의 재읽기 원문은 별도로 제공되지 않았으므로 저장 성공 확인과 구분합니다. 네이티브 JSON 재읽기·측정 통계 유지 테스트는 통과했고 실제 앱의 해당 표시 원문은 미확인입니다. 다음은 이 프로필의 biasRealMs를 실제 matcher/ScorePanel/Combo에 연결하는 작업입니다. Phase 3 전체는 여전히 진행 중입니다.
## 실제 단음 채점 연결 — 2026-10-13

### 작업 개요

Phase 3의 저장 보정값 → 실제 CPAL onset → 순수 matcher → 점수·콤보 UI를 연결했습니다. 이 수직 슬라이스의 구현·자동 검사 날짜는 2026-10-13이며, 실제 기타 채점 수용 검증과 Phase 전체 완료는 아직 대기 중입니다. 반복 보정의 실제 결과(11/16회, 45.82ms, 흔들림38.18ms)는 저장 프로필에서 읽으며 코드에 하드코딩하지 않습니다.

### 구현 및 변경 파일

- `src-tauri/src/judgement/practice.rs` 신설: UUID 시도, 저장 보정 revision·프로필/실제 입력 구성 검증, 보정 사본/악보 revision/트랙/epoch/배속/허용치 고정, 실제 입력 수집 및 순수 matcher 호출. 중복 sequence·시작 이전 공격·누락/불연속/clock 오류 처리, 중지 멱등성, 최근128이벤트와 전체 통계.
- `src-tauri/src/audio/input.rs`, `audio/mod.rs`: 일반 배속의 native 캡처 매핑과 DSP 처리 마감 시각 조회. 콜백은 변경하지 않으며 조회/DSP/채점은 콜백 밖에서 수행합니다.
- `src-tauri/src/judgement/mod.rs`: 채점 시작 전에 GOOD 창이 열렸던 목표를 SKIPPED 처리하여 늦은 시작·동기화 준비에 따른 부당한 MISS 방지. `commands/mod.rs`, `lib.rs`: start/get/stop_practice_attempt 및 PracticeService 등록.
- `src/features/practice/practice.ts` 신설: 외부 응답 형식·범위·점수/정확도 일관성 검사, 선택한 악보 트랙의 공격 음표 → 앵커 시간 변환, 타이 연결음 제외, 루프 [A,B) 구간 대상, 허용 오차 preset/범위.
- `usePractice.ts` 신설: 명시적 시작, 직렬 요청/폴링, pause/seek/rate/loop·악보/트랙/보정 변경 시 이전 시도 종료, 늦은 시작 응답·마운트 해제 정리, 완료 시도 중복 재시작 방지, 최근20시도 메모리 이력.
- `ScorePanel.tsx`: 실제 점수/콤보/COOL/GOOD/MISS/제외/정확도/최근 타이밍/적용 보정/시도 이력. 모니터 환경, Easy/Normal/Hard 및 직접 허용치 설정, 채점 중 조건 잠금. 기존 DEMO 프리뷰는 별도 경로에 유지.
- `src/app/App.tsx`, `src/features/score/ScoreWorkspace.tsx`: 앱 레벨 controller와 실제 작업 공간 연결. 카피·설정·반복 보정 중에는 채점하지 않습니다. 기존 악보/음원 import와 튜너 유지.
- `InputPanel.tsx`, `src/features/settings/CalibrationPanel.tsx`: 미연결 안내를 현재 채점 진입점으로 갱신. `src/shared/styles.css`: 최근 판정500ms 강조 및 동작 줄이기 지원. `logger.ts`: 고정 정리 실패 코드만 기록.
- `practice.test.ts`, `usePractice.test.tsx`, `ScorePanel.test.tsx`, `src/test/practiceFixture.ts`: 계약·생명주기·UI fixture. 테스트의 사전 생성 점수는 test 폴더/테스트에서만 사용하고 실제 앱 결과로 전달하지 않습니다.
- `docs/12-API-CONTRACTS.md`: 코드 전 계약 갱신. `README.md`, 이 문서와 진행 요약 갱신. 제품 기능 삭제/새 의존성/오디오 저장·네트워크 전송 없음.

### 테스트 및 오류 해결

| 명령/검증 | 결과 | 범위 |
|---|---|---|
| 임시 후보 TypeScript/ESLint(경고0)/Prettier | 성공 | 기존 앱을 재시작하지 않는 target 후보에서 검사 |
| 임시 후보 `vitest run` | 성공 | 당시 전체82개; 추가 UI/마운트 해제 검사 뒤 새 관련12개 성공 |
| 임시 후보 `vite build` | 성공 | 제품과 동일 설치 의존성 사용 |
| 임시 Cargo `cargo fmt`, `cargo clippy ... -- -D warnings`, `cargo test ...` | 성공 | 60개 통과, 실제 장치 열거1개 기본 제외 |
| 원본 반영 후 `pnpm verify:app` | 성공 | TS strict, ESLint, 프론트85개/23파일, Vite build, Prettier, Rust fmt/clippy/test60개·제외1개 정상 종료 |
| 새 단음 채점의 실제 Windows 기타 테스트 | 미실행 | 최신 앱 실행 후 사용자 수동 확인 필요. 자동 fixture로 대신하지 않음 |
| 실제5분 지속성·장치 분리/재연결·음정/온셋 p50/p95·CPU 측정 | 미실행 | 사용자 물리 조작과 측정 절차 필요 |
| Python 검사 | 미실행 | 해당 소스/의존성 변경 없음 |

Rust 연결 테스트10개: rate0.5/0.75/1/1.5 보정과 이중 점수, watermark 대기 후 UNVERIFIED, WRONG_NOTE 재시도·단일 MISS, 늦은 시작/늦게 도착한 이전 공격, 장치/clock 오류 제외, drop/불연속/1.5초 폴링 정지/onset 보존 누락/버퍼 변경, 중지/오래된 ID, 계약/보정 revision·key, 반복 시도 ID·통계 분리, 최근128개 상한에서도 전체 점수 보존. 실제 기타 품질 측정의 대체가 아닙니다.

개발 중 unknown 응답 객체의 타입 좁히기가 callback 안에서 유지되지 않는 TS 오류는 검사한 배열/sequence를 지역 상수로 분리해 수정했습니다. 악보 revision UUID memo의 불필요 의존성 린트 경고는 해당 문서 존재 여부를 실제 계산에 사용하도록 수정했습니다. 임시 프론트는 경로 확인 후 제거하여 루트 테스트 중복 수집을 방지했습니다. alphaTab 약1.306MB chunk 경고는 유지하며 빌드 실패는 아닙니다. 자동 승인 검토가 허용한 require_escalated 로컬 검사로 이전 sandbox 접근 오류를 피해 검증했습니다.

### 미구현·알려진 제약

- 깨끗한 단음 PoC이며 실제 줄/프렛 판별 및 고급 주법 인식은 구현하지 않았습니다. 동시 음표는 UNSUPPORTED, 저신뢰는 UNVERIFIED입니다.
- media clock은 PoC 동기화이며 sample-accurate 출력 시간을 보장하지 않습니다. 시작/동기화 준비 전 GOOD 창이 열렸던 음표는 제외하므로 첫 음표가 제외될 수 있습니다.
- 시도 요약20개·최근 이벤트128개는 메모리 한정이며 전체 이벤트/영구 결과·히트맵/SQLite 저장은 Phase 4입니다. 악보 revision은 이번 실행에서만 유효한 UUID입니다.
- 출력 환경 변경은 자동 검출하지 않으므로 모니터 환경 선택과 재보정이 필요합니다. 관측 보정에는 연주 반응과 출력/입력 지연이 함께 포함됩니다.
- 기본 권한 프로세스/포트 조회는 기존 앱을 보지 못했습니다. 앱 부재로 판단한 실행 시도가 1420 포트 충돌로 종료되었습니다. require_escalated 조회로 기존 최신 앱 PID39920(21:46:40)과 기존 Vite PID10412의127.0.0.1:1420 리스너를 확인했습니다. 이 시도에서 생성한 중복 PID39764만 실행 파일 경로·시작 시각(21:50:50) 검증 후 종료했으며 기존 앱/서버는 유지했습니다. 개발 실행 명령의 포트 충돌과 기존 앱 실행 확인을 구분합니다. 기본 권한 조회의 빈 결과로 앱/서버 부재를 단정하지 않을 것입니다.

### 다음 작업 및 재개 위치

최신 앱을 실행하고 SSL Input 1·저장된 보정값으로 실제 점수 변화/무입력 MISS·시도 전환·입력 분리 시 감점 제외를 확인합니다. 수동 확인 요청 후 원본 소스와 앱 프로세스는 건드리지 않습니다. 이어서5분 안정성·장치 재연결 및 음역/온셋 측정을 수행합니다. Phase 3 수용 조건·문서화 완료 후 로드맵 순서대로 Phase 4에 진입합니다.

최종 안내 문구 수정 후 `pnpm verify:app`을 다시 실행하여 동일하게 프론트85개/Rust60개·제외1개와 모든 통합 검사를 통과했습니다. 최신 기존 native PID39920/서버10412 유지 상태에서 실제 앱 검증을 요청합니다. 사용자 수동 확인 중 제품 소스 수정·프로세스 재시작/종료 금지입니다.

### 실제 단음 채점 사용자 확인 및 3초 준비 요청 — 2026-10-13

사용자가 실제 앱에서 SCORE1000, COMBO2, COOL0/GOOD2/MISS5, 감점 제외1/대상8, 정확도14.3%, 최고콤보2, GOOD/EARLY113.7ms, epoch23/rate0.5/적용 보정45.82ms를 전달했습니다. native 실제 단음 판정·보정값 적용·점수 UI 표시를 확인했습니다. 최근9시도 목록의 FINISHED/STOPPED,0.5×/1×,별도 점수/제외 수도 전달받았습니다. 같은 epoch라도 사용자가 새로 채점을 시작하면 별도 attemptId를 사용합니다. 이 출력만으로 무입력 전용 실험 여부·loop/seek/장치 분리/5분 검사까지 통과했다고 해석하지 않습니다.

사용자가 약3초 준비 시간을 요청하여 기존 카운트인에 실제 시간 기준3초 옵션과3→2→1 표시를 확장합니다. 실제 확인이 끝난 뒤의 새 요청이며 후보에서 검사한 후 프론트만 반영합니다. 검토에서 배열 enum을 문자열로 변환해 받아들이는 계약 오류, 중지 IPC 실패 때 시도 ID를 먼저 버리는 오류를 후보 회귀 검사로 재현했습니다(새2개 실패). 엄격한 문자열 검사와 성공 응답 후 ID 해제/같은 ID 재시도로 수정하는 중입니다. 현재 원본은 기존85개 테스트 통과 버전을 유지합니다. 최신 완료 여부는 이후 검사/반영 기록을 우선합니다.

## 3초 준비 및 연결 오류 보완 완료 — 2026-10-13

### 구현과 파일

사용자 요청의 재생 전 준비 시간을 구현했습니다. Phase 3 전체는 진행 중입니다.

- `src/features/player/PlayerEngine.ts`: 기존 마디 카운트인 예약을 재사용하는3초 준비, 실제 시간 기준3클릭, countInRemainingMs 진행값, 취소 시 타이머/클릭과 대기 Promise 정리. 기존1/2마디 카운트인은 템포/박자/배속을 그대로 반영합니다.
- `TransportBar.tsx`, `src/app/AppShell.tsx`: 연습/연주에서는 재생 버튼과 Space의 기본3초 준비, 카피/일반 화면은 기존 즉시 재생. 끄기/3초/1·2마디 선택과 남은 초 표시. loop의 매 반복에 준비 시간을 삽입하지 않습니다.
- `src/features/practice/usePractice.ts`: 준비 중에는 새로운 채점 시도를 시작하지 않으며 준비 상태를 표시. 중지 IPC가 실패하면 시도 ID를 유지하고 같은 ID의 중지가 성공한 뒤 다음 시도를 시작합니다. 중지 중복 요청은 같은 Promise로 합칩니다.
- `practice.ts`: 배열 등을 문자열처럼 변환한 enum을 거부하는 실제 문자열 검사. 런타임 잘못된 detail/reason에 따른 UI 오류 방지.
- `PlayerEngine.test.ts`, `TransportBar.test.tsx` 신설, `practice.test.ts`, `usePractice.test.tsx`: 배속0.5/1/1.5에서 실제3초·3→2→1, pause/seek/rate/loop/load/dispose 취소와 늦은 출력 준비, 버튼/Space/끄기/기존 마디, 중지 실패 재시도, 배열 enum 거부 회귀.
- docs/12 계약을 먼저 갱신하고 README/로드맵/진행 문서를 갱신했습니다. 새 라이브러리 및 native 코드 변경은 없습니다.

### 검증 결과와 오류

| 실행 | 결과 |
|---|---|
| 후보의 새2개 오류 재현 | 실패2개(의도한 회귀 재현), 수정 후 해당 검사 통과 |
| 후보 TypeScript/ESLint(경고0)/Prettier | 성공 |
| 후보 관련4파일29개 테스트 | 성공 |
| 후보 전체92개 테스트/Vite build | 성공 |
| 원본 최종 `pnpm verify:app` | 성공: 프론트92개/24파일, Rust60개·장치 열거1개 제외, 타입/린트/빌드/포맷/fmt/clippy 정상 종료 |
| 실제 앱3초 준비 표시와 취소 | 미실행: 사용자 확인 대기 |
| 실제 장치 분리/재연결·5분/음역/온셋 분포 | 미실행: 사용자 물리 조작·측정 필요 |
| Python 검사 | 미실행: 변경 없음 |

테스트 정리 시 mock 복원 뒤 비동기 hook 정리가 실행되어 허위 정리 실패 로그가 발생했습니다. 해당 테스트에서 컴포넌트 정리와 Promise 완료를 먼저 처리하고 mock을 복원하여 해결했습니다. 기존 alphaTab 약1.308MB chunk 경고는 유지하며 빌드 실패가 아닙니다. 원본 반영은 프론트만 수행했고 기존 native PID39920·시작시각21:46:40이 유지됨을 확인했습니다. 앱 종료/새 프로세스 생성 없음.

### 남은 제약과 다음 작업

3초 준비는 입력/출력 지연 보정 또는 재생 clock의 sample-accurate 보장을 대신하지 않습니다. 준비 동안 반주는 멈추며 native media 동기화는 실제 재생 후 준비되므로 첫 불완전한 판정 창의 SKIPPED 정책은 유지합니다. 실제 새로운 준비 표시·장치 분리/재연결·지속 입력을 확인한 뒤 Phase 3 수용 조건을 검토합니다. 실제 사용자가 이미 확인한 단음 점수/보정 결과를 과거 ‘미실행’ 기록과 구분해야 합니다. 수동 확인 요청 후 소스와 앱을 유지합니다.

### 사용자 요청으로 일시중지 — 2026-10-13

사용자가 남은 사용량 때문에 내일 테스트를 이어가자고 요청했습니다. 최종 제품 코드는 저장됐고 통합 검사 프론트92개/Rust60개·장치 열거1개 제외 성공을 유지합니다. 이후 원본 소스 변경·앱 재시작/종료를 수행하지 않습니다.

3초 준비의 실제 표시, 5분 지속 캡처 진단, SSL USB 분리 시 감점 제외/재연결 튜너 복구는 **미실행**입니다. 사용자에게 검사를 요청했지만 실제 결과 대신 일시중지 요청을 받았으므로 성공으로 기록하지 않습니다. 재개 시 진행 README의 중지 안내부터 읽고 이 검사들을 먼저 이어갑니다. Phase 3 수용 조건 충족 후에만 Phase 4로 진행합니다. 실제 점수/보정의 이전 확인 결과는 유효하며 이미 완료된 기능을 다시 구현하지 않습니다.

### 테스트 재개 — 2026-10-14

`pnpm tauri dev` 실행 확인: 세션10876, native PID19424(2026-10-14 15:28:24), Vite PID5948/127.0.0.1:1420. 빌드 정상 종료 및 실행 파일 시작을 확인했습니다. 실제3초 표시·캡처 진단은 사용자에게 요청하고 결과를 기다리는 중이며 성공으로 기록하지 않습니다.

사용자가 어제 중단한 테스트와 작업 재개를 요청했습니다. AGENTS·로드맵·진행 기록·현재 Git 상태와3초 준비 코드의 존재를 확인했습니다. 기존 기본 조회의 빈 결과를 신뢰하지 않고 require_escalated 조회에서 apps/listeners 모두 빈 배열임을 확인했습니다. 원본 소스 변경 없이 `pnpm tauri dev`로 최신 앱 실행을 시작했습니다. 어제 통과한92개 프론트/60개 Rust 결과를 오늘 다시 실행한 것으로 기록하지 않습니다. 다음은 실제3초 준비·지속 입력·SSL 분리/재연결 검증입니다. 테스트 중 소스 변경·앱 재시작은 하지 않습니다.

### 첫 실제 확인 및 시각적 준비 표시 요청 — 2026-10-14

사용자가3→2→1 준비 후 재생 동작을 확인했으며 더 뚜렷한 시각적 표현을 요청했습니다. 제공한 입력 진단은48kHz/mono/f32, callback480·협상 버퍼480프레임, 캡처3,251,520프레임(약67.74초), 누락0/불연속0/onset32, capture monotonic5,608,087,120,366ns입니다. 시간 동기화는 입력과 반주 재생 필요/anchor0으로 표시됐습니다. 재생을 마친 뒤라면 기대하는 대기 상태이며, 해당 출력만으로 재생 중 동기화 오류라고 판단하지 않습니다. 실제 재생 중의 안정 표시와5분 지속 입력은 아직 미확인입니다.

기존 준비 타이머는 유지하고 화면 중앙의 큰 남은 초·원형 진행·준비 취소 표시를 후보에서 추가 검사합니다. 입력은 유지하도록 요청했으며 USB 분리 검사는 지속 입력 수치를 수집한 뒤 진행합니다. 새로운 실제 결과를 받은 뒤 코드 변경 작업을 진행하며 다시 수동 확인을 요청한 동안에는 원본을 유지합니다.

## 시각적 준비 카운트다운 반영 — 2026-10-14

### 구현 및 변경

- `src/features/player/PreparationCountdown.tsx` 신설: PlayerEngine의 남은 시간을 그대로 소비하는 중앙 대형 숫자, 원형 진행, 준비 취소 버튼. 기존 epoch를 key로 사용하여 새 준비의 진행 상태를 분리합니다. 마디 카운트인도 실제 남은 초를 표시합니다. 자체 타이머나 채점 결과를 만들지 않습니다.
- `src/features/score/ScoreWorkspace.tsx`: countIn일 때만 표시하고 재생·취소·오류 상태로 전환하면 숨깁니다. 취소는 기존 engine.pause를 사용합니다.
- `src/shared/styles.css`: 중앙 표시/어두운 배경/큰 숫자와 짧은 강조. 상단·하단 조작 영역은 제외하고 동작 줄이기 설정에서는 숫자 애니메이션을 끕니다.
- `PreparationCountdown.test.tsx`: 실제 props의3→2→1·취소·시작/긴 마디·잘못된 시간 검사2개. docs/02를 먼저 갱신하고 README·진행 문서를 갱신합니다. 의존성/네이티브/입력 콜백 변경 없음.

### 검사와 결과

| 실행 | 결과 |
|---|---|
| 후보 TypeScript/ESLint(경고0)/Prettier | 성공 |
| 후보 관련 검사 | 성공: 새2개와 작업 공간 회귀3개 |
| 후보 전체 Vitest/Vite build | 성공:94개/25파일 |
| 원본 `pnpm verify:app` | 성공:94개 프론트·60개 Rust/장치 열거1개 기본 제외, 타입/린트/빌드/포맷/fmt/clippy 정상 종료 |
| 실제 중앙 표시/취소 육안 확인 | 미실행: 반영 후 사용자 확인 대기 |
| 실제5분 캡처·USB 분리/재연결 | 미실행: 지속 입력 진단 수집 후 진행 |
| Python | 미실행: 변경 없음 |

새 오류 없이 검사했습니다. 기존 alphaTab 약1.309MB chunk 경고는 유지합니다. 직접 화면 조작 없이 후보를 검사한 뒤 프론트만 반영했고 native PID19424/시작시각15:28:24가 유지됨을 확인했습니다. 임시 프론트 폴더는 경로 검증 후 제거하여 루트 테스트 중복 수집을 방지했습니다.

### 읽기 전용 네이티브 성능 관측

2026-10-14 15:30:31.488~15:38:24.382(KST), 동일 PID19424/시작 시각 유지. 경과472.895초, native 누적 CPU0.546875→96.1875초(증분95.640625초): 한 코어 기준 평균20.22%, 논리16코어 전체 기준 평균1.26%. Windows working set33,050,624→37,621,760바이트(약31.52→35.88MiB). 앱/입력은 조작하지 않았습니다.

이 구간에는 입력 시작 전 시간과 프론트 검사·반영 시간도 포함됐고, WebView·Vite·검사 프로세스의 CPU/메모리는 제외됩니다. 전체 앱 또는 정확히5분 연주만의 성능 측정으로 주장하지 않습니다. 두 시점 메모리 값만으로 누수 부재를 증명하지 않으며, 지속 캡처 프레임/누락·불연속은 사용자의 후속 진단으로 따로 확인합니다.

### 다음 작업

새 시각적 준비/취소를 확인하고, 반복 재생 중의 clock과 캡처 프레임·누락·불연속을 수집합니다. 48kHz에서14,400,000프레임 이상인 단일 캡처 구간을 확인한 뒤 USB 분리/재연결 검사로 이동합니다. 사용자 수동 확인 동안 원본 소스와 앱 실행 상태는 유지합니다. Phase 3 전체 진행 중이며 Phase 4는 미착수입니다.

### 반복 재생의 실제 clock 확인 — 2026-10-14

후속 사용자 진단:48kHz/mono/f32, callback·협상 버퍼480, 캡처1,769,760프레임(약36.87초), 누락0/불연속0/onset15, monotonic6,215,019,042,766ns. 재생 clock PoC 안정/왕복1.90ms/anchor12/최대잔차1.81ms. 새 중앙 준비 표시 반영 이후 반복 재생 중의 clock 안정 결과를 확인했습니다.

캡처 프레임은 이전3,251,520보다 작으므로 두 값의 차를 연속 구간 측정으로 사용하지 않습니다. 현재 구간만으로5분 지속을 주장하지 않으며 입력을 유지하도록 다시 안내했습니다. 중앙 숫자·원형과 준비 취소의 실제 확인 답변은 아직 제공되지 않아 미확인으로 유지합니다. 앱 프로세스/개발 세션 로그는 읽기만 확인하고 재시작하지 않습니다.

## 지속 입력 검증 및 개발 화면 새로고침 보완 — 2026-10-14

### 작업 개요와 실제 결과

Phase 3 전체는 진행 중이며 완료 날짜는 미확정입니다. 사용자가 준비 취소의 정상 동작을 확인했습니다. 큰 숫자·원형 표시 자체에 대한 별도의 육안 평가 답변은 없으므로 취소 확인과 구분합니다. 사용자가 한 번 입력을 중단·재시작했다고 답하여 이전 프레임/onset 감소를 자동 초기화 오류로 기록하지 않습니다.

사용자의 후속 실제 진단: 48kHz/mono/f32, 관측 callback480·협상 버퍼480, 캡처32,919,840프레임(685.83초, 약11분26초), 누락0/불연속0/onset140, monotonic7,175,454,304,266ns. 이전 같은 구간의3,112,800프레임/6,554,538,973,466ns와 비교하면 프레임 경과620.98초/monotonic 경과620.9153308초입니다. 차이 약64.67ms는100ms 스냅샷 게시 간격 안에 있습니다. **5분 이상 지속 입력/누락0·불연속0 확인 성공**으로 기록합니다. 파일 쓰기를 중단하고 기존 앱을 유지한 상태에서 수집했습니다.

최신 clock은 IDLE/anchor0이며 반주가 실제 재생 중이었는지는 해당 답변만으로 확인되지 않습니다. 이를 재생 중 안정 성공으로 해석하지 않습니다. 앞서 실제 재생 중 PoC 안정/RTT1.90ms·최대잔차1.81ms와 후속 RTT2.00ms·최대잔차2.19ms/anchor12는 별도 확인 결과입니다. 캡처가 지속돼도 반주가 멈추면 clock은 대기 상태가 됩니다.

### 구현 및 변경 파일

- `vite.config.ts`: Vite6.4.4의 `server.watch.ignored`로 docs/README/AGENTS, src-tauri/ai/fixtures 및 alphaTab 생성 public/font 경로를 감시에서 제외합니다. 문서·후보·생성 폰트 변경으로 페이지 전체가 새로고침돼 임시 악보·반주·시도가 초기화되던 원인을 보완합니다. 실제 UI 소스 감시는 유지합니다.
- `src/test/developmentWatcher.test.mjs`: 별도 OS 임시 폴더에서 실제 Vite 감시기를 실행하고 제외 파일을 수정한 뒤 이벤트가 없으며 UI 소스 수정에는 이벤트가 오는지 확인합니다.1420 포트를 사용하지 않으며, 종료 시 임시 절대 경로를 검증한 뒤 자신이 생성한 폴더만 정리합니다.
- `src/test/setup.ts`: Node 감시 검사에서 DOM 전용 미디어 mock을 호출하지 않습니다. 기존 jsdom 검사 동작은 유지합니다.
- README·로드맵·진행 문서: 실제5분 결과와 남은 USB 검사를 구분합니다. native/오디오 콜백/IPC 계약/의존성 변경 없음.

설정 변경으로 개발 서버가 한 번 재시작됐지만 기존 native PID19424/시작시각15:28:24는 유지됐습니다. 그 뒤 검사 소스 변경에 따른 페이지 갱신은 수동 검사 요청 전의 보완 작업 중에만 발생했습니다. USB 수동 확인 요청 이후 소스와 앱 상태를 유지합니다.

### 실행 검증 및 오류 해결

| 실행/확인 | 결과 |
|---|---|
| 사용자 실제 지속 입력 | 성공:32,919,840프레임/약11분26초, 누락0/불연속0 |
| 사용자 준비 취소 | 성공 |
| `pnpm exec vitest run src/test/developmentWatcher.test.ts` 초기 검사 | 실패: Node 환경에 HTMLMediaElement 없음. DOM mock 조건 처리 후 성공 |
| 초기 `pnpm verify:app` | 실패: Node 내장 모듈 타입 없음. 새 타입 의존성 설치 대신 검사 파일을.mjs로 이동 |
| 다음 `pnpm verify:app` | 실패: finally에서 직접 throw하는 정리 코드의 ESLint 오류. 경로 검증·정리를 함수로 분리 |
| 기본 권한 Prettier 호출 | 실패: Corepack의 registry 조회 ENOTFOUND. 실제 프로젝트를 읽을 수 있는 승인된 권한에서 설치된 pnpm9.14.3으로 재실행하여 성공 |
| 최종 `pnpm verify:app` | 성공: TypeScript/ESLint 경고0/Vitest95개·26파일/Vite build/Prettier/Rust fmt·clippy·test60개, 장치 열거1개 기본 제외 |
| 실제 장치 USB 분리/재연결·감점 제외 | 미실행: 다음 사용자 물리 검사 필요 |
| Python | 미실행: 변경 없음 |

설정 API는 설치된 Vite6 공식 [server.watch 문서](https://v6.vite.dev/config/server-options)와 [JavaScript API 문서](https://v6.vite.dev/guide/api-javascript)를 확인했습니다. 기존 alphaTab 약1.309MB chunk 경고와 개발 sourcemap ENOENT 경고는 남으며, 실제 악보 import 실패 또는 빌드 실패로 기록하지 않습니다.

### 남은 제약 및 다음 작업

5분 입력은 통과했지만 실제 USB 분리 시 남은 목표의 감점 제외·재연결 튜너 복구는 아직 미실행입니다. 정확한 실제 음정 오차 및 onset 지연 분포, 전체 WebView 포함 성능 측정도 미실행입니다. 합성 신호의 정확도와 실제 기타의 정확도를 혼동하지 않습니다. 우선 반복 재생/clock 안정 상태에서 USB 분리 검사를 하고, Phase 3 수용 조건과 문서화 완료 후 Phase 4의 SQLite 저장·기록을 진행합니다.

문서 갱신 후 기존 개발 세션10876의 신규 로그는 빈 출력으로, 이전의 docs/README page reload가 발생하지 않았습니다. 기존 native PID19424/시작시각15:28:24 유지도 재확인했습니다. USB 실제 검사 요청부터 다시 파일 쓰기·소스 변경 없이 대기합니다.

## Phase 3 완료 확인 — 2026-10-14

### 실제 USB 분리 및 재연결

사용자는 USB 분리 후 MISS가 계속 늘지 않았고, 재연결→장치 새로고침→SSL Input 1 입력 시작 후 튜너가 다시 움직였다고 답했습니다. 첫 답변에서는 입력 오류를 못 봤다고 했으나, 후속 분리 확인에서 다음 실제 문구를 전달했습니다: **“입력이 끊겼습니다. 장치를 확인하고 입력을 중단한 뒤 다시 연결하세요.”** 이 문구는 native snapshot.errorCode에 연결된 오류 안내입니다. 실제 분리 오류 표시와 재연결 복구를 확인했으며, 새로운 엔진 수정으로 해결했다고 기록하지 않습니다.

후속 진단은48kHz/mono/f32, callback·버퍼480, 캡처8,965,440프레임(약186.78초), 누락0·불연속0/onset22, monotonic8,251,124,376,666ns, clock 대기/anchor0입니다. 재연결 이후 시작한 별도 캡처 구간이므로 이전11분 결과에 합산하지 않습니다. USB 분리의 실제 감점 제외 수 원문은 미제공이며, 남은 목표의 SKIPPED/점수0 정책은 native 연결 회귀 검사로 별도 검증했습니다. 실제 확인은 오류 안내·MISS 증가 중단·튜너 복구 범위입니다.

### 수용 조건과 최종 검사

- 최소8개 합성 입력: DSP의 MIDI40/45/50/55/59/64/67/76 사인파 pitch 검사, 잡음·무음·강한2배음·지속음/불연속·연속 공격 회귀. 합성 음정 오차10cents 미만 검사를 실제 기타 측정 결과로 주장하지 않습니다.
- 결정론적 판정·이중 점수 방지: 순수 matcher의 한 목표 한 결과/sequence 중복/오음 재시도/무입력 MISS1회, native 연결의 실제 이벤트/watermark 순서와 시도 ID 분리 검사 통과.
- speed/seek/loop: PlayerEngine·clock·matcher·attempt 회귀와 사용자 실제 일시정지→재생→0.75× 안정 복귀 확인.
- 실제 SSL Input 1: 튜너, 보정 저장/재읽기·실제45.82ms 적용 점수, 반복 clock,5분 이상 누락0 입력, USB 오류·MISS 증가 중단·재연결 튜너 확인.
- 최종 코드 검사는 직전 `pnpm verify:app` 성공(프론트95개/26파일, Rust60개·장치 열거1개 제외)을 사용합니다. USB 확인 뒤 제품 코드 변경이 없어 동일 검사를 반복하지 않았습니다. Python은 변경 없어 미실행입니다.

### 남은 제약 및 다음 Phase

Phase 3의 **깨끗한 단음 PoC** 범위를 완료합니다. 실제 줄·프렛 검출, 화음·고급 주법, 실제 음역별 cents·onset p50/p95 및 전체 앱 성능/출시 장치 조합 측정은 미구현 또는 미실행으로 남습니다. 평균 decimation의 alias 억제와 낮은 음의 DSP 지연, 입력/output/사용자 반응이 섞인 반복 보정의 한계를 유지합니다. 개인 입력 오디오 저장/네트워크 전송 없음.

다음은 Phase 4입니다. SQLite migration·프로젝트/asset/악보 revision, 실제 연습 session/attempt/event 영속 저장, 결과/마디 히트맵, 재실행·누락 원본 재연결·저장 실패 복구와10회 기록 검사를 구현합니다. 계약을 먼저 갱신하며, 현재 앱을 자동 종료하지 않고 후보에서 native 저장 기능을 검증한 뒤 적용합니다.


## 2026-10-20 후속 장치 사용성 변경

사용자 요청으로 최초 입력/모니터 출력 목록 자동 열거와 실제 PC 기본 출력 표시·선택, 입력 시작 뒤 기본 모니터 연결을 추가합니다. 입력 캡처/REC의 명시적 시작은 유지하며 모니터 직접 끄기/실패 반복 방지·수동 새로고침을 제공합니다. 이 후속 변경의 상세 구현/오류·테스트·실제 수용은 [PHASE-06B.md](PHASE-06B.md)의 ‘장치 자동 목록·PC 기본 출력·모니터 기본 켜기’를 따릅니다. 기존 Phase3 완료 결과를 새 동작의 검증으로 대신하지 않습니다.

장치 기본 동작 수용 완료(2026-10-20): 최종 프론트301개/Rust163개·확장 Clippy·실제 장치 열거·번들3개/Windows24.08초와 실제v8 DB/모델 보존을 통과했습니다. 사용자가 자동 목록/실제 PC 기본 출력 선택·입력 시작 뒤 자동 모니터/직접 끄기를 정상 확인했습니다. 입력 캡처/REC 자동 시작은 없습니다. 상세 오류/수정·실행 증거/제약과 다음 작업은 PHASE-06B를 따릅니다.
