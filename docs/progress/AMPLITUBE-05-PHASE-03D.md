# AmpliTube VST3 Integration — Phase 03D(FX 랙·실시간 Bypass)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 3 "DAW 트랙 FX 랙과 Plugin Browser, Bypass, Insert/Remove, Input Echo 연결", 5.1 FX 랙.
- 사용자 결정(2026-11-07): **하단 믹서 줄에 FX 버튼**, **실시간 Bypass**, **AmpliTube만(+ VST3 추가는 안내)**.

## 결론

- **PASS(자동)**: Bypass 섞기 단위 검사(플러그인 지연만큼 늦춘 원음, 한 블록 선형 전환, 처리 결과가 없어도 원음), 서비스 검사(DRY 모니터 `MONITOR_NOT_AMPLITUBE`·이전 세션 `MONITOR_CHANGED`·버전 거부·스위치 반영), **실제 AmpliTube 5.10.4**로 처리 중 Bypass를 켜면 출력 RMS 0.0707(입력 사인 0.1의 RMS와 같음, 좌우 동일), 화면 검사(입력·테이크 FX 버튼, 적용·빼기, Bypass 조건, 편집 창, VST3 추가 막힘).
- **PASS(앱)**: 하단 믹서에 "입력 FX" 버튼, 메모리에만 추가한 테이크 줄의 FX 버튼과 랙 표시·막힌 이유 안내, 레이어를 빼면 열린 랙도 닫힘, 콘솔 오류 0. 저장하지 않았고 DB 17개 표는 백업과 같습니다.
- **NOT RUN(사람 확인)**: 실제로 Bypass를 눌렀을 때 소리 전환·튐·지연 체감 → `MANUAL-CHECKS.md` 22번. 소리가 예상 없이 나지 않도록 에이전트는 실제 모니터를 켜지 않았습니다.

## 설계

- Bypass는 DSP 스레드에서 합니다. 블록마다 입력을 플러그인 지연(`latency_samples`, AmpliTube 7프레임)만큼 늦춘 원음을 만들고, 플러그인 결과와 섞습니다. 그래서 켜고 꺼도 전체 지연·테이크 재생 위치가 바뀌지 않습니다. 바뀌는 블록(128프레임, 약 2.7ms)만 선형으로 넘깁니다.
- Bypass 중에도 AmpliTube는 계속 처리합니다(되돌릴 때 잔향·상태 유지). 플러그인 잠금을 못 잡아도(편집 창 여는 중 등) Bypass면 원음은 나옵니다. 장치 callback은 Bypass를 읽지 않습니다.
- 화면: `InputMonitor` 안에 있던 모니터·AmpliTube 상태 훅을 App이 한 번 만들어(`useMonitorFx`) 입력 모니터 패널과 하단 믹서가 같이 씁니다. `InputMonitor`는 기존 사용처·테스트를 위해 훅을 직접 만드는 감싸개로 남겼습니다(App은 항상 렌더하므로 동작 같음).
- 랙은 슬롯 하나(`01 AmpliTube 5`)입니다. 입력 줄의 적용은 "모니터에 AmpliTube 사용"(모니터를 끈 뒤만), 테이크 줄의 적용은 2B의 "AmpliTube로 재생"(AmpliTube 모니터가 켜져 있어야)과 같은 상태를 바꿉니다. 인스턴스가 하나라 입력과 그 테이크가 같은 톤·같은 Bypass를 쓴다고 랙에 적었습니다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md` | "AmpliTube FX 랙·실시간 Bypass v1" |
| `src-tauri/src/plugins/dsp.rs` | `BypassMix`(지연선·전환), Bypass 스위치, 단위 검사 |
| `src-tauri/src/audio/monitor.rs` | `MonitorInsert::bypass_flag`, `MonitorBypassRequest`, `insertBypassed`, `set_bypass`, 서비스 검사 |
| `src-tauri/src/audio/input.rs`, `commands/monitor_api.rs`, `app.rs` | `set_input_monitor_bypass` |
| `src-tauri/src/plugins/mod.rs` | 설치 플러그인 검사에 Bypass 출력 확인 |
| `src/features/performance/FxRack.tsx`(새), `BottomMixer.tsx` | FX 랙, 입력 줄·TAKE 줄 FX 버튼 |
| `src/features/practice/useMonitorFx.ts`(새), `InputMonitor.tsx`, `src/app/App.tsx` | 공유 훅, `InputMonitorPanel` |
| `src/features/practice/monitoring.ts`, `useInputMonitor.ts` | `insertBypassed` 검사, `bypass` API, `setBypass`, 오류 문구 |
| `src/shared/styles.css` | `.fx-rack` |
| 테스트 | `BottomMixer.test.tsx` FX 랙 1개, `monitoring.test.ts` 보강 |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --lib plugins -- --include-ignored` | PASS 4개(Bypass RMS 0.0707, 상태 왕복, 처리 부족 0프레임) |
| `pnpm verify:app` | PASS(프론트 858개, Rust 308개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS(테스트 모듈을 파일 끝으로 옮긴 뒤) |
| 디버그 앱(내장 화면 빌드) + CDP | PASS: 위 화면 확인, 메인 창 WM_CLOSE로 정상 종료, DB 비교 차이 없음 |

## 원본 DI 데이터 무결성

- Bypass는 모니터 출력만 바꿉니다. 녹음 PCM·판정 입력은 입력 callback에서 따로 복사하는 DI 그대로이고, 테이크 파일은 읽기만 합니다.

## 미완성·제약·리스크

- 슬롯은 AmpliTube 5 하나이고 순서 바꾸기·여러 플러그인·다른 VST3는 없습니다("+ VST3 추가"는 꺼진 안내).
- 입력과 "AmpliTube로 재생" 테이크가 한 인스턴스를 같이 쓰므로 트랙마다 다른 톤·Bypass는 안 됩니다(UC-4는 인스턴스 여러 개가 필요, Phase 0에서 둘이면 소리가 달라지는 문제 확인).
- 입력 FX 적용은 모니터를 끈 뒤에만 바꿀 수 있습니다(기존 2A 규칙). Bypass는 모니터를 다시 켜면 꺼진 상태로 돌아갑니다.
- 반주·로컬 음원·분리 음원 줄에는 FX가 없습니다.

## 다음 단계와 재개 지점

- Phase 3 남은 것: Score ↔ DAW 전환 중 state/engine/stream 유지 점검(→ [03E](AMPLITUBE-05-PHASE-03E.md), 통과).
- Phase 4: Freeze/Bounce/Export(처리된 소리 파일 만들기).
