# 재생 Rust 이전 R3 — 메트로놈·카운트인·녹음 정렬

- 작업 일자: 2026-11-10
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 설계: [docs/plugin/PLAYBACK-RUST-DESIGN.md](../plugin/PLAYBACK-RUST-DESIGN.md), 계약 `docs/12` "네이티브 재생 v1"(R3 항목). 앞 단계: [R1](PLAYBACK-RUST-R1.md), [R2](PLAYBACK-RUST-R2.md).

## 결론

- **PASS(자동)**:
  - 재생 버스: 메트로놈(재생 중 곡 박자 원점·간격에 맞춰 40ms 사인 클릭, 강박 1200Hz·약박 800Hz, 끝 2ms 페이드), 카운트인(재생과 무관하게 지금부터 정해진 수·간격으로 클릭), 블록마다 "이 블록 첫 프레임이 장치에서 들리는 시각(QPC ns)"과 그 곡 프레임을 기준점으로 공개, `song_ms_at(now)`가 출력 지연·구간 되감기를 반영해 그 순간 들리는 곡 위치를 계산.
  - 모니터 출력 callback이 cpal의 재생 시각(`OutputCallbackInfo.timestamp().playback`)을 넘김. cpal WASAPI는 입력 시계(`stream.now()`)와 출력 재생 시각을 같은 QueryPerformanceCounter 기준으로 줍니다(소스 확인).
  - IPC 3개: `set_native_metronome`, `native_count_in`, `get_native_clock`(입력 시계 값 + 그 순간 들리는 곡 위치).
  - 화면: 네이티브 재생 중 메트로놈 켜기·음량·박자 변경은 Rust로 보내고 WebAudio 클릭을 쓰지 않음, 카운트인 클릭도 Rust로(대기·`beforePlay`·재생 시작 흐름은 그대로), 녹음 시계 기준점은 `get_native_clock`의 곡 위치로 만듦(불확실성 0.5ms, 왕복 시간과 무관).
  - `pnpm verify:app` 통과(프론트 884·Rust 327), `cargo clippy --locked --all-targets --all-features -- -D warnings` 통과. 처음 전체 검사에서 메트로놈 설정 실패를 "재생 풀림"으로 처리해 R2 테스트가 깨진 것을 찾아, 클릭 설정 실패는 기록만 하고 재생은 유지하도록 고쳤습니다.
- **PASS(실제 앱, 무음)**: SSL 입력을 캡처만 켜고(모니터 없음) "Output 3/4" 가상 출력·음량 0으로 사용자 프로젝트 믹스를 재생하며 0.3초 간격으로 6번 쟀습니다. 들리는 곡 위치의 증가/입력 시계 증가 비율 0.994~1.006(블록 단위 흔들림), 렌더 위치와 들리는 위치 차이(출력 지연) 33~40ms. 카운트인·메트로놈 명령 오류 없음. 입력은 원래대로 꺼 두었고 저장한 것은 없습니다.
- **NOT RUN(사람 확인)**: 클릭 소리·박 위치를 귀로 확인, 네이티브 재생으로 녹음한 테이크의 정렬 → `MANUAL-CHECKS.md` 30번.

## 위험·후속

- **지연 보정과의 관계**: 기존 녹음 정렬은 WebView 재생 위치(장치 지연 미포함)를 기준으로 했고, 지연 보정 프로필도 그 상태에서 쟀습니다. 네이티브 재생은 장치에서 들리는 시각(출력 지연 포함)을 기준으로 하므로, 같은 보정 프로필을 그대로 쓰면 출력 지연(측정 약 35ms)만큼 정렬이 달라질 수 있습니다. 실제 녹음으로 확인한 뒤 보정 방식을 정해야 합니다(결정 필요 시 사용자에게 물음).
- 메트로놈은 1배속 기준입니다(네이티브 재생은 1배속만).
- 카운트인 대기 시간은 여전히 화면 타이머라, 마지막 클릭과 재생 시작 사이 간격이 수 ms 흔들릴 수 있습니다.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src-tauri/src/audio/playback_bus.rs` | 메트로놈·카운트인 클릭 합성, 재생 시각 기준점, `song_ms_at`, 테스트 2개 |
| `src-tauri/src/audio/monitor.rs` | callback 재생 시각 전달(`render_timed`) |
| `src-tauri/src/audio/input.rs` | 입력 시계 값 crate 안 공개 |
| `src-tauri/src/commands/native_playback_api.rs`, `app.rs` | IPC 3개 |
| `src/features/player/nativeTransport.ts`(+test) | 메트로놈·카운트인·시계 API |
| `src/features/player/PlayerEngine.ts` | 네이티브 메트로놈·카운트인 |
| `src/features/player/useCaptureClock.ts`(+test) | 네이티브 기준점 |
