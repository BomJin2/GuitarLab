# 재생 Rust 이전 R1 — 재생 버스와 입력 없는 출력

- 작업 일자: 2026-11-10
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 설계·결정: [docs/plugin/PLAYBACK-RUST-DESIGN.md](../plugin/PLAYBACK-RUST-DESIGN.md). 사용자 결정(2026-11-10): 단계안 R1 → R2 → R3, 출력은 모니터와 같은 장치, MP3는 계속 WebView, 속도 변경은 나중에.

## 결론

- **PASS(자동)**:
  - 재생 버스(`src-tauri/src/audio/playback_bus.rs`): 여러 stereo 보이스를 곡 위치·시작 프레임·음량대로 섞음, 재생·정지·이동·구간 반복(블록 안에서 되감기), NaN 프레임 건너뜀, 바뀐 보이스 묶음은 제어 쪽에서만 해제, stream을 다시 만들 때 위치·재생 상태·아직 적용 안 된 이동 명령을 이어받고 샘플레이트가 바뀌면 보이스를 비움.
  - 모니터 출력(`monitor.rs`): 버스 소리를 삽입(AmpliTube) 뒤에 더하고 모니터 음량·입력 상태와 무관하게 냄(입력이 닫힌 reader로 확인). 기존 모니터 테스트는 수정 없이 통과.
- **PASS(실제 장치, 무음)**: SSL "Output 3/4" 가상 출력에 입력 없이 재생 출력을 열어 0.3초에 14,400프레임(48kHz) 진행, 모니터 상태는 그대로, 끄면 stream 해제(`cargo test -- --ignored output_only_stream`). 음원을 싣지 않아 소리는 나지 않았습니다.
- 검사: `pnpm verify:app` 통과(프론트 878·Rust 322), `cargo clippy --locked --all-targets --all-features -- -D warnings` 통과.
- **NOT RUN**: 모니터를 켜고 끌 때 재생 출력이 이어지는지(실제 입력 필요), 청취. 화면 연결과 IPC는 R2입니다.

## 변경

- 새 `src-tauri/src/audio/playback_bus.rs` + 테스트 4개.
- `src-tauri/src/audio/monitor.rs`: 장치 찾기·stream 만들기를 함수로 분리(`find_output`, `build_stream`), reader에 버스, 서비스에 `start_output`·`stop_output`(재생만 하는 stream), 모니터를 켜면 재생 stream을 모니터 stream에 합치고 끄면 재생 stream을 다시 엶. 재생만 하는 stream은 모니터 상태(`STOPPED`)를 바꾸지 않습니다. 테스트 2개(하나는 실제 장치, 무시 표시).
- IPC·화면·저장 형식은 바뀌지 않았습니다.

## 미확인·후속

- 모니터 켜기·끄기 때 stream을 다시 만들어 수십 ms 끊길 수 있습니다(설계상 허용, callback 안에서 AmpliTube를 해제하지 않기 위함).
- R2: 보이스 불러오기(WAV 반주·TAKE·Freeze·STEM·IMPORTED_STEM·RENDER를 엔진 샘플레이트로), IPC, `PlayerEngine` 네이티브 모드, MP3·배속일 때 WebView로 자동 전환.
