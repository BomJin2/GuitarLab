# 재생 Rust 이전 R2 — 1배속 네이티브 믹스 재생

- 작업 일자: 2026-11-10
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 설계·결정: [docs/plugin/PLAYBACK-RUST-DESIGN.md](../plugin/PLAYBACK-RUST-DESIGN.md), 계약 `docs/12` "네이티브 재생 v1". 앞 단계: [R1](PLAYBACK-RUST-R1.md).

## 결론

- **PASS(자동)**:
  - Rust: WAV를 stereo 그대로 푸는 `decode_stereo`, 출력 믹스와 같은 레이어 읽기 함수(`layer_source`)로 모든 레이어를 출력 샘플레이트로 맞춰 보이스로 만듦(mono 테이크는 좌우 공유, 음소거 레이어도 미리 풀어 둠), 음량·mute·solo·offset만 바뀌면 다시 풀지 않음, 구성이 바뀌면 `NATIVE_MIX_CHANGED`. IPC 5개(`prepare_native_playback`·`update_native_mix`·`set_native_transport`·`get_native_transport`·`release_native_playback`).
  - 화면: `NativeTransport`(위치 추정·구간 되감기·250ms마다 Rust 위치와 30ms 넘게 다르면 맞춤·준비가 풀리면 한 번 알림), `PlayerEngine` 네이티브 모드(재생·정지·이동·음량·구간을 Rust로, 1배속이 아니게 되면 떼고 알림), 믹스 준비가 출력 장치가 있으면 Rust로 준비하고 파일을 화면으로 읽지 않음, 실패(MP3 등)하면 이유를 알리고 기존 재생으로 준비, 믹스 패널 "Rust 엔진으로 재생" 체크로 끔.
  - `pnpm verify:app` 통과(프론트 882·Rust 325), `cargo clippy --locked --all-targets --all-features -- -D warnings` 통과.
- **PASS(실제 앱, 무음)**: 내장 빌드에서 IPC를 직접 불러 확인했습니다(출력은 SSL "Output 3/4" 가상 장치, 버스 음량 0, 저장 없음). 사용자 프로젝트의 레이어 3개(STEM 2·IMPORTED_STEM 1) 믹스를 707ms에 준비(4초, 48kHz), 0.5초 재생에 위치 520ms 진행, 구간 100~300ms를 걸자 120ms로 되감김, 해제 뒤 `prepared:false·playing:false`, 모니터 상태 그대로, 콘솔 오류 없음.
- **확인 중 발견·수정**: 처음에는 해제 뒤에도 `prepared:true·playing:true`로 보였습니다(빈 보이스 묶음을 "있음"으로 보고, stream을 먼저 버려 정지 명령이 적용되지 않음). 버스에 `clear()`를 넣어 보이스 없음·정지를 바로 공개하게 고치고 테스트를 더했습니다.
- **NOT RUN(사람 확인)**: 실제로 들어 보는 확인(반주·테이크 동기, 구간 반복 이음새, 음량, 이동) → `MANUAL-CHECKS.md` 29번. 화면 버튼으로 재생하는 확인은 사용자 출력 장치로 소리가 나므로 하지 않았습니다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src-tauri/src/mixer/pcm.rs` | `decode_stereo` |
| `src-tauri/src/mixer/render.rs` | 레이어 읽기를 `layer_source`로 분리(출력 믹스 동작 그대로) |
| `src-tauri/src/mixer/native.rs`(+`tests.rs`) | 네이티브 믹스 불러오기·보이스 만들기·선형 변환 |
| `src-tauri/src/commands/native_playback_api.rs`, `app.rs`, `commands/mod.rs` | IPC 5개, 상태 |
| `src-tauri/src/audio/playback_bus.rs` | `clear()` |
| `src-tauri/src/audio/monitor.rs`, `audio/input.rs` | 출력 상태만 확인하는 `check_output`, `with_monitor` |
| `src/features/player/nativeTransport.ts`(+test) | Rust transport 래퍼 |
| `src/features/player/PlayerEngine.ts` | 네이티브 모드 |
| `src/features/performance/useProjectMix.ts`(+test), `MixPanel.tsx`(+test fixture), `src/app/App.tsx` | 네이티브 준비·대체·설정 체크, 모니터 출력 장치 전달 |
| `src/shared/logger.ts` | 진단 코드 3개 |

## 미확인·후속

- 메트로놈·카운트인은 아직 WebAudio(기본 출력)라 Rust 재생과 장치·지연이 다를 수 있습니다 → R3.
- 녹음 정렬 기준점은 아직 화면의 위치 추정에서 나옵니다(출력 지연 미보정) → R3.
- 하단 믹서 레벨 미터는 네이티브 재생 중 레이어 레벨을 보이지 않습니다(재생 요소가 없음).
- 준비는 취소할 수 없고 10분 레이어 여러 개면 수 초 걸릴 수 있습니다.
