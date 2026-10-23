# src-tauri/AGENTS.md — Rust/Tauri/오디오 규칙

루트 `AGENTS.md`를 반드시 함께 적용합니다.

- Rust의 CPAL 입력 스트림 콜백은 **실시간 안전**을 최우선으로 합니다: 오디오 프레임을 미리 할당한 lock-free 또는 bounded channel에 전송하는 최소 작업만 수행합니다. 넘칠 경우 측정 가능한 drop counter와 상태 경고를 남기며 오디오 스레드를 대기시키지 않습니다.
- 장치 열거/포맷 샘플레이트·채널 협상, 전원 관리, 장치 연결 해제, 드라이버 변경 처리를 별도 모듈로 작성합니다.
- 내부 오디오 프레임은 캡처 측 monotonic sample position / 타임스탬프를 함께 전송합니다. 렌더 프레임 시간은 스코어 계산 타이밍 기준으로 사용하지 않습니다.
- 입력의 샘플레이트와 DSP가 요구하는 샘플레이트가 다르면 리샘플링을 명시하고 지연을 추적합니다.
- 판정 로직은 UI 및 Tauri event와 **분리된 순수 함수**로 유지합니다. 고정 fixture 기반 `cargo test`를 작성합니다.
- Tauri 명령은 문서의 허용 목록만 노출하고 파일 경로·ID·크기·확장자 확인을 수행합니다. 임의 경로 읽기/쓰기 및 shell command 전달을 허용하지 않습니다.
- SQLite 및 파일 작업은 트랜잭션/원자적 저장 전략을 사용합니다. 원본 오디오에 대한 자동 덮어쓰기 금지.
- 일시 중지/seek/속도 변경/A-B loop/카운트인 때 정확히 어떤 이벤트와 판정 상태를 초기화할지 계약에 맞춥니다.
- 에러는 타입 있는 오류로 변환해 UI로 전달하고 민감한 로컬 절대 경로를 로그에서 마스킹합니다.
- 외부 오디오 파일 디코딩은 안전한 디코더를 활용하고 파일 크기/길이 제한 및 잘못된 미디어 대응을 포함합니다.
- `cargo fmt --check`, `cargo clippy`, `cargo test`를 통과시키되 환경상 실행 불가 시 기록합니다.

## 추가 — Recorder 및 Multitrack Mixer

- `docs/15`, `docs/17`의 InputOnly 녹음 및 상태 머신을 필수 준수합니다. 시스템 출력 루프백 캡처를 녹음 소스로 제공하지 않습니다.
- 파일 쓰기는 별도 worker에서 실행. CPAL 콜백은 bounded buffer로 입력만 전달하고 저장 도중 실패/중지 시 recoverable take를 남깁니다.
- 녹음 시작/종료 시 atomic finalize와 `droppedFrames`, 오디오 sample index, playback epoch, score track, alignment 정보를 기록합니다.
- 여러 take를 포함한 mixer에서 gain/mute/solo/offset을 다루되 사용자 녹음 원본 WAV를 덮어쓰지 않습니다.
