# 03. 기술 아키텍처

## 기능·UI 경계 — 2026-10-15

- 입력 캡처/DSP·판정·악보 정규화·AI 작업·녹음/저장은 도메인 모듈·서비스·어댑터에서 처리합니다. UI 컴포넌트에 핵심 알고리즘이나 파일/프로세스 수명을 직접 종속시키지 않습니다.
- React 컴포넌트는 상태 표시와 사용자 명령 전달을 담당하고, 서비스 호출·취소·상태 전이는 별도 서비스/훅을 통해 연결합니다. 엔진은 특정 화면의 DOM·색상·레이아웃을 참조하지 않습니다.
- 공통 도메인 타입, 버전 있는 IPC 계약, SQLite/파일 형식을 화면별 뷰 상태와 분리합니다. 전체 UI를 교체해도 기존 프로젝트·보정값·연습 기록·테이크와 핵심 기능을 유지합니다. 불가피한 계약 변경은 docs/12 선행 변경과 마이그레이션·호환성 검사를 거칩니다.
- 색상·폰트·간격은 공통 토큰으로 관리하고, 필요한 UI 조작은 재사용 컴포넌트로 구성합니다. 현재는 기능·안정성 검증에 필요한 최소 UI만 구현합니다.
- 기존 동작을 일괄 재작성하는 리팩터링은 하지 않습니다. 관련 기능을 추가·수정할 때 이 경계를 유지하며 기능 검사는 UI 스냅샷에만 의존하지 않습니다.

## 시스템 구성

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Tauri WebView  — React/TypeScript                                      │
│ Library / Copy Editor / Practice / Performance / Recordings / Reports / Settings                  │
│ Domain state + alphaTab Adapter + Waveform + Transport UI              │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Tauri invoke / event (버전 명시)
┌────────────────────────▼─────────────────────────────────────────────┐
│ Rust / Tauri Core                                                     │
│ command handlers | project store(SQLite/files) | playback coordinator│
│ device manager(CPAL) → bounded frame queue → onset/pitch DSP           │
│                → note matcher & timing scorer → judgement events      │
│ timeline mapping (score tick ↔ audio time ↔ device monotonic time)     │
└─────────┬──────────────────────────────────────────┬─────────────────┘
          │ local project data                       │ JSONL jobs
          ▼                                          ▼
   SQLite + media cache                      Python AI Sidecar
                                         stem separation / transcription
                                         onset quantization / fingering
```

## 기술 선택

| 부분 | 권장 스택 | 비고 |
|---|---|---|
| Shell | Tauri 2 | Windows x64 1차 타깃 |
| Front | Vite / React / TS(strict) / Tailwind | Next.js SSR보다 로컬 앱 형태에 적합 |
| Score | alphaTab | 기존 악보 import/렌더/커서 및 external media sync 검증 |
| Audio Input | CPAL(Rust) | 플랫폼별 장치 포맷 협상 |
| DSP | Rust DSP 라이브러리 + 자체 onset/pitch 어댑터 | 라이브러리는 PoC 통과 후 결정 |
| AI jobs | Python 가상환경(dev), 번들 Sidecar(release) | stdout JSONL IPC 및 취소 |
| Storage | SQLite + 앱 데이터 폴더 | 원본과 파생물 분리 |
| Test | Vitest, Rust tests, pytest, Playwright(필요 시) | 자동 fixture 우선 |

## 모듈 경계

- `PlayerEngine`: 로드, 재생/일시정지/seek, playback speed, currentTime, loop. 구체 엔진(WebAudio/alphaTab external media)을 어댑터로 감춥니다.
- `ScoreEngine`: NoteEvent 읽기/편집/저장, measure/beat/tick 매핑, `alphaTab` Score 어댑터.
- `SyncEngine`: score tick/time과 실제 원곡 시간을 sync anchor로 정렬. `playerMediaTimeMs`를 유일한 논리 기준으로 삼습니다.
- `InputEngine`: CPAL stream, timestamp, resampling, gain meter, onset/pitch detector.
- `JudgementEngine`: immutable expected events + observed events + calibration을 받아 결정론적 판정.
- `AnalysisEngine`: 비실시간 job 큐, Python worker, progress/cancel, 결과 검증.
- `ProjectRepository`: SQLite·파일 I/O. UI는 직접 파일 내부 구조를 수정하지 않습니다.

## 시계 / 동기화 원칙 (중요)

1. 악보는 musical ticks/beat 기준의 음악 시간축을 가집니다.
2. 악보와 원곡의 관계는 `syncAnchors = [{tick, audioMs}]`의 단조 증가 매핑으로 표현합니다.
3. 재생/seek/loop/속도변경은 PlayerEngine이 이벤트로 보고하며, SyncEngine이 현재 악보 위치를 계산합니다.
4. 입력 오디오 이벤트는 오디오 샘플 위치를 기반으로 monotonic capture time을 얻습니다. **UI `Date.now()`나 React 렌더 시각으로 판정하지 않습니다.**
5. 입력 이벤트를 당시의 playback clock과 동기화된 `playedSongTimeMs`로 변환하고 사용자/장치 지연 오프셋을 적용합니다.
6. `deltaMs = correctedPlayedSongTimeMs - targetSongTimeMs` (음수 EARLY, 양수 LATE).
7. playback rate 변경에 따른 window 해석은 `05`에 정의. 실제 ms와 음악 시간 ms의 차이를 혼동하지 않습니다.

## 재생 전략의 주요 선택지 / 기술 검증 과제

- 옵션 A: alphaTab 자체 synth & backing track / external media sync를 사용.
- 옵션 B: WebAudio/별도 플레이어를 master clock으로 사용하고 alphaTab external-media sync API에 playback status/time을 전달.
- **우선 PoC**: 로컬 MP3 재생, seek, 0.75×(pitch 유지 가능 여부), A-B loop, TAB cursor가 안정적으로 같이 움직이는지 확인. 특히 alphaTab 버전별 external media API·sync points·audio stretching 한계를 실제로 검증하기 전 구현 확정 금지.
- 편집 시 alphaTab data model 직접 변경은 full re-render 비용이 있을 수 있으므로 selection overlay를 분리하고 편집 확정 시에만 렌더합니다.

## 작업·스레드 분리

- UI thread: 사용자 이벤트, 표시, 가벼운 상태 업데이트.
- CPAL audio callback: 프레임 최소 복사 + timestamp + queue push.
- DSP thread: HPF/노이즈 감시/onset/pitch estimate. 과부하 시 명확한 품질 경고.
- Judgement thread: expected vs observed event 매칭 및 판정 발행.
- Background job(s): 파형 생성, 미디어 디코딩, AI 처리, DB 저장.
- Python process: 모델 파일 로딩/추론, 독립 취소·에러 보고.

## 오류 정책

- UI 오류 구분: `FILE_INVALID`, `FILE_NOT_FOUND`, `AUDIO_DEVICE_UNAVAILABLE`, `AUDIO_PERMISSION_DENIED`, `CALIBRATION_REQUIRED`, `AI_MODEL_MISSING`, `AI_JOB_FAILED`, `STORAGE_ERROR`, `UNSUPPORTED_FORMAT`.
- API 반환은 typed `Result` 형태. 임의 문자열을 매칭하는 에러 분기 금지.
- 크래시 직후 재시작: 마지막 저장 성공 체크포인트를 복구하고 임시 파일은 사용자 확인 후 정리.

## 네트워크 정책

- 로컬 사용 기본. 모델/앱 업데이트 다운로드는 **별도 사용자 동작**으로만 실행.
- 예외적으로 사용자가 선택한 **Backing Track Finder**는 공식 YouTube 검색/임베드 API만 허용. 그 밖의 분석 서비스·계정·온라인 악보 수집 서비스 추가 금지.

## 공식 참고

- https://v2.tauri.app/develop/sidecar/
- https://docs.alphatab.net/docs/reference/types/playersettings/
- https://docs.alphatab.net/docs/guides/media-sync-editor
- https://docs.rs/cpal/latest/cpal/

## v0.2 모듈 확장

```text
React: PerformanceWorkspace / ScoreTrackPicker / BackingFinder / RecordingTimeline / TakeMixer
                              │ commands + typed events
Rust: ScoreTrackBinding | BackingAdapter(LOCAL/YOUTUBE metadata only) | SessionCoordinator
      CPAL Input ──> bounded queue ──> RecorderWriter ──> recordings/{takeId}/dry.wav
                   └───────────> PitchDSP/JudgementEngine (선택 악보 트랙 only)
      LocalPlayer / TakeMixer → Output (YouTube embedded player는 별도 비디오 재생)
SQLite: backing sources / audio stems / track bindings / recorded takes / recording segments
Python AI: 기존 whole-guitar separation + 별도 실험적 LeadRhythmSeparatorAdapter
```

- `CaptureClock`와 `BackingClock` 구분: 로컬 재생은 샘플 기준 정밀 sync, YouTube는 사용자 보정 가능한 best-effort position만 제공. 정밀 채점은 실제 clock 검증 전 비활성.
- 입력 캡처(유저 녹음)와 믹서 출력(반주/이전 take)은 별도 bus. recorder가 system loopback이나 YouTube 오디오를 절대 받아서는 안 됨.
- recording writer는 전용 I/O 스레드, 상태머신과 원자적 WAV finalize, recovery. CPU DSP 과부하가 녹음 유실로 전파되지 않도록 독립 큐/진단 필요.
- 데이터 모델: `ScoreTrack`(악보), `AudioStem`(음원), `RecordedTake`(녹음), `BackingSource`(반주); 역할 및 연결은 사용자 승인 기반.
- 코드 경계는 `14` 반주/정책, `15` 연주 UX, `16` 기타분리, `17` 기록/재생 계약 참조.
