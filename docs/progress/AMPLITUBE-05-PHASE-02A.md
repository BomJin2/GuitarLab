# AmpliTube VST3 Integration — Phase 02A

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 실시간 입력 모니터에 AmpliTube 5를 꽂기(명세 Phase 2 중 2A). 테이크 재생(2B)은 D2에 따라 다음 단계입니다.
- 사용자 결정(2026-11-07): AmpliTube 처리는 **별도 DSP 스레드**(장치 callback의 Mutex 금지 규칙 유지, 대신 블록 하나만큼 지연 추가).

## 결론

- **PASS(자동·실제 플러그인)**: 설치된 AmpliTube 5.10.4를 앱 안에서 불러와, 장치 callback ↔ 잠금 없는 SPSC 링 ↔ DSP 스레드 경로로 처리했습니다. 실제 플러그인 검사에서 처리 출력이 나왔고, 부족(무음) 0~352프레임(2초 중 최대 0.37%)이었습니다. 실제 앱에서 불러오기 15.9초 → READY, 해제 뒤 메모리가 돌아옵니다(약 1GB → 77~89MB).
- **NOT RUN(사람 확인)**: 실제 기타·SSL 입력으로 AmpliTube 모니터를 켜서 듣기, 끊김·지연 체감, 녹음 파일이 원음인지 확인 → `MANUAL-CHECKS.md` 17번.
- **보류(라이선스 절차)**: 배포 고지(`docs/release`) 갱신. 아래 "미완성" 참고. 이 상태로 커밋하면 원격 "Windows 격리 설치 검증"이 실패할 것입니다.

## 구현된 기능과 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md` | "모니터 AmpliTube 삽입 v1" 계약(명령 3개, `insert` 선택 필드, DSP 스레드 경로, 위험), 삽입 v1 스냅샷에 `AMPLITUBE`·`insertUnderrunFrames` |
| `src-tauri/Cargo.toml`, `Cargo.lock` | `vst3-host =0.11.0`(`default-features = false`), Windows 전용 `windows-sys =0.61.2`(`Win32_System_Threading`, 이미 트리에 있던 버전) |
| `src-tauri/src/plugins/mod.rs`(새) | `MonitorPluginService`: 불러오기·해제·상태, 플러그인 소유 스레드(COM 해제 스레드 고정), AmpliTube 식별(이름·제조사·`Fx`)과 mono→stereo 버스 확인, `take_insert` |
| `src-tauri/src/plugins/dsp.rs`(새) | `ThreadedInsert`: callback은 링에 넣고 꺼내기만, DSP 스레드가 128프레임 단위로 `RealtimePluginRunner` 처리, 시작 무음(첫 callback 길이 + 128), 부족 계수, 스레드 우선순위 TIME_CRITICAL, 모니터를 끄면 러너 반환 |
| `src-tauri/src/audio/monitor.rs` | `insert` 요청 필드(`DRY`/`AMPLITUBE`), 시작이 삽입을 받음, 스냅샷 `insertUnderrunFrames`, AMPLITUBE 지연에 출력 버퍼 더함 |
| `src-tauri/src/audio/input.rs` | `start_monitor_with(request, make_insert)`(현재 입력 샘플레이트로 삽입 생성) |
| `src-tauri/src/commands/plugin_api.rs`(새), `commands/mod.rs`, `monitor_api.rs`, `lib.rs`, `app.rs` | 명령 `get_monitor_plugin`·`load_monitor_plugin`·`unload_monitor_plugin`, 서비스 등록, 모니터 시작의 삽입 선택 |
| `src/features/practice/monitorPlugin.ts`(새), `useMonitorPlugin.ts`(새) | 플러그인 API·검사·오류 문구, 불러오는 동안만 1초 간격 조회 |
| `src/features/practice/monitoring.ts`, `useInputMonitor.ts` | `AMPLITUBE` 삽입 선택(실행 중 변경 불가), DRY일 때는 `insert`를 보내지 않음 |
| `src/features/practice/InputMonitor.tsx` | "AmpliTube 5 (VST3)" 줄: 불러오기/해제, "모니터에 AmpliTube 사용", 상태·부족 안내, 앱 안 실행 위험과 비제휴 문구 |
| `src/app/thirdPartyLicenses.json` | 앱 안 고지 재생성(Rust 158 → 165: vst3-host, vst3, com-scrape-types, rtrb, crossbeam-queue, libloading 0.8.9, winapi) |
| 테스트 | Rust: 식별·버스 규칙, 요청 검사·상태 보호, `insert` 값 검사, 실제 AmpliTube DSP 경로(ignore 검사). TS: `monitorPlugin.test.ts` 3개, 기존 시작 인자 기대값 2곳 |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --lib -- audio::monitor plugins` | PASS 10개(+ignore 2) |
| `cargo test --lib -- plugins::tests::installed_amplitube --ignored --nocapture` | PASS 2회(부족 352 → 0프레임, 지연 135프레임 = 128 + 플러그인 7) |
| `pnpm vitest run src/features/practice` | PASS 81개 |
| `pnpm verify:app` | PASS(프론트 852개, Rust 302개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS(지적 3건 수정 뒤) |
| `node scripts/third_party_notices.mjs --check` | PASS(재생성 뒤) |
| 디버그 앱 + CDP: 불러오기→READY→입력 없는 모니터 시작 거부(`INPUT_NOT_ACTIVE`)→모르는 `insert` 거부→해제, 2회 반복 메모리 | PASS: READY 15.9초, 메모리 997/1004MB → 86/89MB, 콘솔 오류 0 |
| CDP: "응가" 열기(저장 없음) → 연습 화면 AmpliTube 줄 | PASS: 입력 꺼짐이면 불러오기 비활성 + 안내 문구 |

## 원본 DI 데이터 무결성

- 녹음 경로·입력 callback은 바꾸지 않았습니다. AmpliTube는 모니터 출력 쪽 삽입에서만 처리하고, 녹음 PCM·판정 입력은 입력 callback에서 따로 복사한 DI입니다.
- 사용자 프로젝트·녹음은 저장·변경하지 않았습니다(CDP는 열기와 화면 이동만).

## Windows + SSL + AmpliTube 5 실기기 검증

- AmpliTube 5 로드·처리(DSP 스레드): **검증**(이 PC).
- 실제 입력 → AmpliTube → SSL 출력 청취, 끊김, 지연 체감, 녹음 원음 확인: **미실행** → MANUAL-CHECKS 17.
- 에디터·톤 변경·상태 저장: Phase 3.

## 미완성·제약·리스크

- **배포 고지 재수집(보류)**: `scripts/collect_release_inventory.py`로 새 폴더(`src-tauri/target/runtime-validation/release-notices-fd9c6dfe-…`)에 다시 수집했습니다. 새 7개 중 6개는 원문이 자동 수집됐으나 **`com-scrape-types` 0.1.1은 크레이트에 라이선스 파일이 없어 "검토 필요"**입니다(선언은 MIT OR Apache-2.0). 이전과 같은 방식이면 정확한 upstream 커밋의 원문을 받아 보완한 뒤 `docs/release`를 갱신합니다. 사용자 확인 전에는 `docs/release`를 바꾸지 않았습니다.
- 모니터 실행 중에는 삽입을 바꿀 수 없습니다(끄고 다시 켬). 불러오기는 현재 입력 샘플레이트로 하며, 샘플레이트가 바뀌면 해제 후 다시 불러와야 합니다.
- 앱 안 실행이라 AmpliTube가 멈추거나 죽으면 앱도 영향을 받습니다(명세 §9.3).
- AmpliTube 기본 톤만 들립니다(에디터 없음). Phase 0의 O-1(인스턴스 공존 시 소리 변화)은 인스턴스 하나만 쓰므로 이번 범위에서는 나타나지 않습니다.
- 모니터 지연 = 큐 목표 20ms + 출력 버퍼 + DSP 시작 무음(첫 callback + 128) + 플러그인 7프레임. 화면에는 구성 추정으로만 표시합니다.

## 다음 단계와 재개 지점

- (해결, 2026-11-07) `com-scrape-types` 원문 보완과 `docs/release` 갱신 → [02B](AMPLITUBE-05-PHASE-02B.md) "배포 고지".
- Phase 2B(D2): 테이크 재생을 Rust 출력 엔진으로 옮기고 같은 AmpliTube 인스턴스로 재생에 적용합니다. 모니터와 재생이 같은 인스턴스를 쓰려면 출력 그래프 하나(입력 모니터 + 테이크 재생 합산)가 필요합니다.
- Phase 3: 에디터 창(Windows는 `vst3-host` 문서상 런타임 미검증), 상태 blob 저장·복원.
