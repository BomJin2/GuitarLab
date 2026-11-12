# 재생 Rust 이전 R5 — 배속 재생(피치 유지)

- 작업 일자: 2026-11-11
- Git commit/branch: `main`, 기준 커밋 `650b2b2`(R4와 함께 **커밋하지 않음**).
- 설계·결정: [docs/plugin/PLAYBACK-RUST-DESIGN.md](../plugin/PLAYBACK-RUST-DESIGN.md) 8절(사용자 결정: Signalsmith Stretch, 배속 녹음 테이크는 기존 재생, C++ 원본 포함). 계약: `docs/12` "네이티브 배속 재생 v1".

## 결론

- **PASS(자동)**:
  - 엔진: Signalsmith Stretch 1.4.0·Linear 0.6.4(MIT) 헤더를 공식 저장소의 정확한 commit에서 받아 `src-tauri/vendor/signalsmith/`에 수정 없이 두고, C 래퍼(`guitarlab_stretch.cpp`, 예외를 경계 밖으로 넘기지 않음)와 Rust FFI(`src-tauri/src/audio/stretch.rs`)를 만들어 `build.rs`에서 `cc`로 컴파일합니다. 래퍼 crate 둘은 LLVM 요구·MSVC 컴파일 실패로 쓰지 않았습니다.
  - 재생 버스: 1배속은 기존 경로 그대로. 배속이면 작업 스레드(`stretch_feed.rs`)가 보이스를 1배속 곡 시각으로 섞어 늘인 결과를 곡 위치가 붙은 256프레임 조각으로 링에 넣고, 출력 callback은 꺼내 재생만 합니다(조각은 힙을 쓰지 않아 callback 할당·해제 없음). 이동·속도·구간 변경은 세대를 올려 이전 조각을 버립니다. 메트로놈은 늘이지 않고 출력 위치로 환산, 녹음 시계는 경과 × 배속으로 외삽.
  - 전송 요청이 매번 같은 구간을 다시 보내 배속 중 늘이기가 계속 다시 시작될 수 있던 것을 찾아, 구간이 바뀌지 않으면 아무것도 하지 않게 했습니다.
  - IPC: `set_native_transport`에 선택 `rate`, 스냅샷에 `rate`. 화면: `PlayerEngine.setRate`가 네이티브를 떼지 않고 Rust로 보냄, `NativeTransport` 위치 추정 = 경과 × 배속, 준비의 "1배속만" 조건 제거, 문구 갱신.
  - 회귀 검사: 0.5·0.75·1.25·1.5배 피치 유지(440Hz ±2%), `outputSeek` 정렬(클릭 오차 0.5~0.9ms, 1.5ms 안 단언), 버스 배속 재생(클릭 시각·공개 위치·이동 뒤 새 위치·메트로놈 박 간격·1배속 복귀), 녹음 시계 외삽, 요청 `rate` 선택 필드, 화면 쪽(배속을 Rust로 보냄·위치 추정·스냅샷 속도 범위·준비 중 배속 변경).
- **검사**: `pnpm verify:app`의 모든 단계 통과(프론트 904·Rust 342, 처음엔 서식 1건을 고친 뒤 서식·Rust 단계를 다시 실행), `cargo clippy --locked --all-targets --all-features -- -D warnings` 통과, CI와 같은 `scripts` 단위 검사 통과.
- **PASS(실제 장치, 무음)**: "Output 3/4" 가상 출력·음량 0에서 0.75배로 2초 재생하자 곡 위치가 72,000프레임(기대 72,000) 나아갔습니다. 작업 스레드가 실제 출력 속도를 따라갑니다(`stretched_playback_keeps_up_on_a_real_output_device`, 무시 표시 검사).
- **큰 입력 성능(후속 점검)**: 20초 stereo 레이어 12개를 섞어 늘이는 작업을 sleep 없이 돌리면, release는 실시간의 62~64배입니다. 처음 debug(검증앱)는 4.4~4.7배뿐이었습니다. `build.rs`에서 C++ 늘이기를 항상 `opt_level(2)`로 컴파일하게 바꿔 debug도 31~47배가 되었습니다(`stretch_feed_keeps_up_with_many_layers`, 무시 표시 검사, 실시간 4배 미만이면 실패).
- **NOT RUN(사람 확인)**: 배속 음질·이동·구간·메트로놈·배속 녹음 정렬 → `MANUAL-CHECKS.md` 32번.

## 위험·후속

- 배속으로 녹음한 테이크가 든 믹스는 이번 범위가 아니라 기존 재생으로 넘어갑니다(사용자 결정). 그 레이어만 따로 늘이는 것은 후속.
- 이동·배속 변경 직후 첫 소리까지 수 ms 무음이 있습니다(늘이기 상태를 다시 채움). 음량·mute·solo 변경은 링(약 85ms)만큼 늦게 들립니다.
- 작업 스레드는 2ms마다 링을 채웁니다. CPU가 크게 바쁘면 조각이 늦어 무음이 낄 수 있습니다(실제 장치 검사에서는 문제없음).
- 배포: `vendored` 구성요소 2개를 배포 인벤토리·고지에 더했습니다(앱 안 라이선스 목록은 npm·cargo만 다룸).

## 리뷰 반영(2026-11-13, Codex 리뷰 R1·R2)

- **배속 중 구간 반복의 메트로놈 누락 수정**: 늘인 조각이 구간 끝을 넘거나, 그 조각을 여러 callback에 나눠 읽으면 되감긴 회차의 박을 찾지 못했습니다. 클릭 계산을 구간 끝에서 나누고 callback의 시작 위치도 되감은 위치로 바꿨습니다. 구간 [0,23000)·[23900,46900), callback 128·480프레임에서 회차마다 클릭이 ±2프레임 안에 나는지 검사합니다(`stretched_metronome_clicks_again_after_loop_wrap_inside_a_chunk`).
- **늘이기 실패 알림**: 작업 스레드가 늘이기를 만들거나 처리하지 못하면 전에는 재생 중 표시로 무음에 머물렀습니다. 이제 상태 응답이 `prepared:false`·`NATIVE_STRETCH_UNAVAILABLE`을 돌려 화면이 기존 재생으로 넘어갑니다(`stretch_failure_is_reported_until_a_new_generation_or_the_direct_path`).
- **배속 REC 입력 시계 수정(리뷰 R4-1)**: 네이티브 재생 중 녹음 시계 기준점이 R3 때의 `rate: 1`로 고정되어 있었습니다. Rust가 배속으로 재생하면 곡 위치는 배속으로 가는데 기준점은 1배속이라, 시계가 `CLOCK_UNCERTAIN`이 되거나 녹음·판정의 배속 검사에서 거부될 수 있었습니다. 이제 `readClock()`의 실제 배속을 보내고, 측정 중 배속이 바뀐 표본은 버립니다(`useCaptureClock.test.tsx`). R5 단위 검사는 Rust 쪽만 봐서 이 화면 쪽 연결을 놓쳤습니다. MANUAL 32번의 "배속으로 REC" 확인이 이 경로입니다.
