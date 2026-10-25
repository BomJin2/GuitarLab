# 17. 연주 녹음 · 다시 듣기 · 멀티테이크 · 오버더빙

## 선택 테이크 원본 WAV 내보내기 — 2026-10-25

‘녹음 다시 듣기’의 A/B 중 현재 선택한 READY 테이크를 ‘원본 WAV를 새 파일로 내보내기’로 새 위치에 복사합니다. 전체 원래 mono float32/샘플레이트·PCM을 보존하며 배속 녹음도 변환하지 않습니다. 음량/음소거·정렬·부분 반복이나 반주를 적용한 출력은 기존 믹스와 구분합니다. 이름/메모·보정·누락/복구 정보는 WAV에 포함되지 않으며 복구본도 잃은 구간을 복원한 것으로 표시하지 않습니다. 전체 무결성/새 파일 비덮어쓰기·취소와 앱 데이터 목적지 거부를 적용하고 기존 녹음·DB는 변경하지 않습니다. 버퍼는 기존 전체 읽기의 최대256MiB이며 실제 앱/패키지 수용 상태는 progress/PHASE-04A 최신 절을 따릅니다. 아래 take export 미구현은 이 후속 전 이력입니다.

## 사후 구간 진단의 녹음 한도 일치 — 2026-10-25

누락/경고 없는 READY 녹음의400ms 스펙트럼·1초 단음 변화 진단은 기존 최대10분/256MiB 한도에서 지원합니다. 전체 파일을 메모리에 올리던30초/16MiB 분석 제한은 전체 헤더/길이/SHA 검사와64KiB 읽기·선택 구간만 수집하는 경로로 대체했습니다. 전체 파일 검사는 대기 시간이 발생하며 진행 상태/취소를 유지합니다. REC 동의·원본 WAV·DB·일반 재생/저장 정책과 분석 품질/실험 표시는 유지하며 실제 개인 장기 녹음 수용으로 간주하지 않습니다. 계약과 검사 결과는 docs/12 및 progress/PHASE-07 최신 절을 따릅니다.

> 핵심: **사용자 기타 입력을 독립적인 원본 take로 녹음**, 악보/반주와 연결해 재생하며 원하는 파트로 오버더빙합니다. YouTube의 오디오를 캡처하거나 파일로 출력하지 않습니다.

## 지원 기능

- 연주 모드 `REC` → 입력 장치의 기타 또는 마이크를 녹음, 실시간 wave/minutes 표시, 정지 후 자동 보존.
- 연습/연주 결과 타임라인에 `COOL/GOOD/MISS`, EARLY/LATE 오류 마커를 표시하고 해당 부분으로 seek.
- 테이크 목록: 이름 변경, 간단 메모, 날짜, 연결 악보 리비전/트랙, 녹음 입력 장치, 길이/샘플레이트/오프셋 조회.
- A/B 비교: 같은 목표 악보 트랙의 두 녹음을 파형·볼륨 맞춤 후 번갈아 청취(볼륨 차이가 판정으로 오해되지 않도록 안내).
- `Overdub`: 이전 take을 백킹으로 **재생**하면서 선택한 다른 악보 트랙을 독립 입력 파일로 녹음. 원본 take 수정 금지.
- `Mix Export`: 사용자가 녹음한 테이크와 사용 권한이 있는 로컬 반주만 믹스. 외부 YouTube 영상 오디오의 녹음/추출/병합 금지.
- 편집: 비파괴적인 gain, mute, solo, pan(옵션), 편집 가능한 clip in/out, track offset, 테이크 교체. 녹음된 원본은 불변.
- MP3 export는 인코더 라이선스/기술 선택 확인 이후 추가; 초기 기록·내보내기는 WAV 권장.

## 아키텍처/오디오 신호 라우팅

```text
[마이크 / 오디오 인터페이스] → CPAL input callback → bounded ring buffer
                                             ├→ onset/pitch detector → JudgementEngine
                                             └→ RecorderWriter thread → temp PCM/WAV → finalize
[로컬 반주] ───────────────────────┐
[기존 사용자 take] ──────────────┼→ Playback Mixer → Output/Headphones
[입력 모니터(선택, feedback 방지)] ┘
```

- CPAL 콜백 내부에서 파일 I/O, WAV 헤더 갱신, 메모리 무제한 할당, mutex 대기 금지. 비실시간 전용 `RecorderWriter`에서 디스크 쓰기.
- 입력을 `dry/raw`로 별도 보관해 후처리/톤 시뮬레이션을 비파괴적으로 적용할 수 있게 확장. 원본 입력은 limiter 없이 가급적 손실 없는 PCM.
- 초기 채널 정책: mono input → mono WAV 48kHz 또는 협상된 원본 샘플레이트 그대로 명시; 인터페이스의 기타 입력 채널 지정 기능 제공.
- 입력 모니터와 녹음 대상 구분: 기본 `RecordSource=INPUT_ONLY`; 시스템 오디오 루프백·유튜브/반주 출력·마이크+출력 동시 캡처는 비활성.
- 헤드폰 권장. 스피커 사용 중 어쿠스틱 마이크는 반주가 마이크로 유입될 수 있으므로 `녹음에서 반주가 완전히 분리됨`을 보장하지 않음.

## 동기화·지연 보정

- Recorder는 `captureSampleIndex`, monotonic start time, input sample rate, `playbackEpoch`, 당시 선택 score track, inputCalibrationVersion, roundtrip/out latency 추정을 함께 기록.
- `recordedSampleToSongMs()`는 `[캡처 시각→보정된 재생 논리시각]` 맵이며, take를 re-play 시 보정값을 적용. `Date.now()`나 UI 렌더 시간으로 맞추지 않음.
- seek, A-B loop, speed change, backing switch, pause/resume 발생 시 **segment boundary**를 기록하고 `RecordingSegment[]`로 이어 붙이거나 정책에 따라 새 take 생성. 시간축을 숨겨서 이어 붙이지 않음.
- 초기 Phase: `REC` 중 seek/배속/loop 변경 버튼 잠금으로 복잡도를 줄일 수 있음. 후속 구현 시 segment 시간매핑 계약과 테스트 필요.
- 유튜브 시청 중 기타만 녹음 가능하지만 YouTube 타임라인과 리플레이 매핑은 `BEST_EFFORT`; 서버 버퍼링 등으로 sync drift가 생기면 사용자 수동 보정 및 비채점 표시.
- `sample rate drift`, 음성 장치 교체, buffer overflow, 디스크 부족 시 경고하고 저장 가능한 청크를 우선 복구.

## 녹음 상태 머신

```text
IDLE → ARMING → COUNT_IN → RECORDING → FINALIZING → READY
                    ↘ CANCELLED       ↘ RECOVERABLE_ERROR
IDLE/READY → REPLAYING → READY
```

- `REC` 시작은 사용자 명시적 조작만으로 실행. 마이크 권한/오디오 장치/디스크 여유 확인 후 시작.
- `STOP`은 큐 flush, WAV 메타데이터 finalization, fsync/atomic rename, SQLite commit 순서로 완료 처리. 앱 닫기/크래시로 불완전한 파일은 `RECOVERABLE`로 식별하고 사용자 복구 옵션 제공.
- 녹음 유실을 감추지 않도록 `droppedFrames`와 `warningIntervals` 저장. 완전히 기록되지 않은 take를 완벽한 녹음으로 표시하지 않음.
- 녹음 파일 삭제 시 `trash`나 확인/복구 설계 포함. 분석/음원 분리 임시 파일 정리와 사용자 녹음 삭제를 절대 혼동하지 않음.

## 테이크 관계와 편집 데이터 (초안)

```ts
type RecordingState = 'ARMING'|'COUNT_IN'|'RECORDING'|'FINALIZING'|'READY'|'RECOVERABLE_ERROR'|'CANCELLED';
type RecordedTake = {
  id: string; projectId: string; scoreRevisionId: string; targetScoreTrackId: string;
  backingSourceId?: string; inputProfileId: string; sampleRate: number; channels: number;
  relativeAudioPath: string; frames: number; captureStartMonotonicNs: string;
  recordingSegments: Array<{frameStart:number;frameEnd:number;playbackEpoch:number;songStartMs:number;playbackRate:number}>;
  inputLatencyOffsetMs: number; alignmentOffsetMs: number; state: RecordingState;
  origin: 'USER_INPUT'; createdAt: string;
};
type PlaybackLayer = { takeId:string; gainDb:number; mute:boolean; solo:boolean; pan?:number; alignmentOffsetMs:number };
```

- 실제 구현 시 `recordingSegments`는 SQLite 별도 테이블 또는 안정적인 json column 중 하나를 택하고 이 문서와 `07`, `12` 계약 일치.
- 오디오 파일은 `projects/{projectId}/recordings/{takeId}/dry.wav`; 중간 파일 `.part`를 사용하고 완료 후 `dry.wav`로 승격.
- 사용자가 전 단계에 오디오만 재생한 경우에도 `judgementEvents`는 별도로 존재할 수 있으며 녹음과 점수 저장을 강하게 결합하지 않음.

## 미리 듣기/오버더빙 UX

- `테이크 01 (Lead)` 녹음 → 결과 화면의 `재생` → 마디별 타임라인 확인.
- `세컨 기타 추가` → `targetScoreTrack=Rhythm` → Backing mix에 `테이크 01(Lead)` 추가 → `REC` → `테이크 02 (Rhythm)` 파일 분리 보존.
- 트랙 리스트에서 `Lead 녹음`, `Rhythm 녹음`, `Drums/Bass backing` gain 조절. `내 기타만 듣기`와 `전체 믹스` 전환.
- 테이크 삭제, 이름 변경, 덮어쓰기 모두 확인 단계. 반복 녹음 때 이전 파일을 직접 덮어쓰지 말고 새 takeId 생성.
- 악보와 녹음의 정렬 수정은 파생된 `alignmentOffsetMs`만 저장하고 원본 WAV 샘플을 재작성하지 않음.

## 수용 테스트

1. 합성 48kHz 4초 기타 입력 fixture를 입력한 뒤 출력 WAV frame count·재생 길이·peak·채널 일치.
2. seek 제한 상태에서 REC 중 seek 누르면 명확히 거부; 확장 모드면 segment 생성 및 offset 왕복 검증.
3. 두 take를 덧녹음한 다음 solo/mute/volume/A-B compare가 서로 다른 데이터를 정확히 읽음.
4. 비정상 종료·장치 해제·디스크 full·WAV 헤더 미완료에서 복구 가능한 상태로 표시 및 원본 보존.
5. 녹음이 꺼진 상태에서 입력 스트림을 열어도 디스크에 사용자 오디오가 기록되지 않음.
6. YouTube backing에서 recording writer의 입력이 CPAL input only이고 system playback/audio capture 경로가 없음을 계약/통합 테스트로 증명.
7. A/B 표시가 score revision·track·rate·calibration 설정 차이를 경고하며 비교 가능한 점수만 비교.
# Phase 4A 구현 범위와 현재 제약 (2026-10-15)

실제 계약은 docs/12의 Phase 4A 절과 진행 문서를 따릅니다. 선택된 CPAL 입력 채널의 float32를 원본 샘플레이트 mono WAV로 기록합니다. callback의 기존 bounded ring에서 DSP worker가 REC 동안만 bounded writer queue로 분기하며, WAV·DB·로그·mutex 작업은 callback에서 하지 않습니다. 비유한 입력은 녹음에서 0으로 치환하지 않고 오류로 중단합니다. 관측 누락 수는 ring gap과 writer queue overflow가 겹칠 수 있어 확인된 하한이며, 경고 구간과 불완전 상태를 함께 보아야 합니다.

로컬 정렬 REC는 프로젝트 악보 저장·입력 보정·반주 재생/clock READY·반복 끄기 이후 가능합니다. 기존 재생의3초 준비는 유지하며 REC는 안정된 재생 도중 누른 시점부터 시작합니다. 곡0ms부터 자동 녹음하는 별도의 arming/count-in 결합은 아직 구현하지 않았습니다. 무반주 REC는 정밀 악보 정렬 없이 가능합니다. 녹음 중 UI에서 프로젝트/장치/트랙/seek/rate/loop를 잠그고 native도 세대/clock/epoch/rate/drift를 검사합니다. 첫 버전의 단일 연속 구간은 start/sampleRate/frames/transport/songStartMs로 표현하며 여러 segment 연결은 미구현입니다.

테이크 재생은 원곡과 분리된 PlayerEngine에서 실제 WAV를 사용하고, 저장 당시 리비전과 원본 악보를 읽어 TAB 커서를 표시합니다. 원본 악보가 누락되면 녹음 청취를 유지하고 TAB 오류를 표시합니다. A/B는 같은 악보 시각으로 이동하며 조건 차이와 무반주 정렬 불가를 안내합니다. peak 기준 음량 맞춤은 두 파일 중 작은 peak에 맞춰 감쇠하며 원본은 수정하지 않습니다. 부분 반복과 비파괴 이름/메모/offset을 제공합니다. 판정 이벤트를 녹음 시도 ID에 결합한 오류 마커·take export/삭제·다중 출력 장치 선택·테이크를 반주로 쓰는 오버더빙은 미구현이며4B 및 후속 범위입니다.

파일 형식과 공간 검사는 Microsoft의 [WAVEFORMATEX](https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatex), [GetDiskFreeSpaceExW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getdiskfreespaceexw)를 기준으로 구현했습니다. 추가 라이브러리 설치 없이 Windows API와 Rust 표준 라이브러리를 사용합니다. 실제 SSL Input 1 무반주 녹음13.48초/누락0·WebView 청취는 사용자 확인했습니다. 로컬 정렬·장치 분리 복구·재실행 복원은 확인 전입니다.

테이크 재생 음량0~100%와 음소거는 A/B peak 맞춤 감쇠에 추가 적용하며 WAV와 입력 게인을 바꾸지 않습니다. A/B 전환 중 유지하지만 페이지를 벗어나면 초기화합니다. 앱 자체 입력 모니터링은 미구현입니다. SSL 2 MKII 출력에 연결한 헤드폰·스피커에서는 하드웨어 직접 모니터링을 사용할 수 있으며, 설정은 [SSL 공식 설명서](https://support.solidstatelogic.com/hc/en-gb/articles/19991374319773-SSL-2-MKII-User-Guide)를 따릅니다. 이 경로의 실제 연주 중 청취는 사용자 확인 전입니다.

추가 진행(2026-10-15): 테이크 재생 음량·음소거와 SSL MIX 중간의 직접 청취를 사용자 확인했습니다. USB 끝에서도 듣기 위한 앱 모니터를 추가 구현합니다. `내 기타 듣기`의 명시적 출력 선택/토글·청취 음량은 REC와 독립이며 원본 저장 신호를 바꾸지 않습니다. 선택 채널을 별도 bounded ring으로 출력 callback에 보내고, 입력 종료·출력 오류 시 모니터를 중단합니다. 첫 범위는 동일 sample rate의 mono/stereo Windows 공유 출력입니다. ASIO·리샘플링·앰프 효과는 미구현이며 실제 왕복 지연은 측정 전입니다. 앱 모니터 사용 시 SSL MIX는 USB 끝에 두고, 출력 경로 변경 후 채점 보정을 재확인합니다. 핵심 합성 검사 native5개/front6개 성공, 전체 회귀와 Windows 적용·실제 앱 모니터 청취는 확인 전입니다. 앞의 앱 모니터 미구현/직접 청취 미확인은 이전 상태를 기록한 이력입니다.

모니터 후보 전체 회귀(프론트131개/native100개·기본 제외3개)·타입/린트/빌드/포맷/Clippy·번들1개를 통과했습니다. 실제 SSL 출력의48kHz/stereo/f32 열거도 확인했으며 개인 입력 캡처·출력은 자동 시작하지 않았습니다. Windows 제품 적용과 USB 끝의 실제 모니터 청취/지연은 사용자 확인 전입니다.

실제 확인 추가(2026-10-15): Windows 제품 적용 후 사용자가 MIX USB 끝에서 앱 모니터의 기타 소리를 정상 청취했습니다. 큐480↔960프레임, 출력 부족0·초과/지연 조정0·출력 버퍼480프레임을 확인했습니다. 큐 분량10~20ms는 전체 왕복 지연을 뜻하지 않습니다. 모니터 음량/끄기와 REC 동시 동작·녹음 중 USB 복구는 후속 실제 확인 전입니다.

후속 실제 확인(2026-10-15): REC 중 모니터를 껐다 다시 켜도 녹음 프레임이 계속 증가하고 해당 구간의 기타가 파일에 남음을 사용자 확인했습니다. 새 테이크의 정확한 길이/누락 수는 미제공입니다. 녹음 중 USB 분리/원본 보존 복구와 로컬 정렬 재생은 후속 검사로 남습니다.

USB 분리 실제 확인(2026-10-15): REC 중 SSL 분리 후 INPUT_NOT_ACTIVE 안내·녹음 프레임 정지·모니터 오류 표시를 사용자 확인했습니다. 로컬 메타데이터 읽기 전용 조회에서 최신9.23초/직전13.28초의 앞부분이 RECOVERABLE_ERROR로 남고 관측 누락0임을 확인했습니다. 원본을 READY로 위장하지 않습니다. 새 테이크로 복구한 후의 청취는 아직 별도 확인 전입니다.

복구 실제 확인(2026-10-15): 새 복구 테이크에서 기타가 들림을 사용자 확인했습니다. 메타데이터 조회에서9.23초/443,040프레임이 READY·RECOVERED_PARTIAL로 생성되고 recoveredFrom이 불완전 원본을 가리킵니다. 원본은 RECOVERABLE_ERROR/동일 프레임 수로 유지했습니다. 실제 개인 PCM은 읽지 않았습니다. 로컬 정렬 리플레이·A/B/부분 재생 및 메타데이터 재실행 복원은 별도 확인 전입니다.

A/B 검증 보강(2026-10-15): 저장된 정상 원본 GP 악보를 읽는 테스트 경로에서 논리 악보 위치·커서 tick 유지와500~1500ms 구간 경계 복귀3회를 실제 PlayerEngine으로 검사했습니다. 전체 프론트134개/타입·린트·포맷 성공입니다. 화면 렌더러/실제 오디오 출력은 테스트 대역이며, 사용자 A/B 시각 비교 응답은 불명확해 수동 통과로 기록하지 않습니다. 제품 구현을 바꾸지 않았고 실제 약1초 부분 반복 청취·메타데이터 재실행 복원이 남습니다.

부분 반복 실제 확인(2026-10-15): 사용자가500~1500ms의 같은 짧은 구간이 계속 반복됨을 확인했습니다. 다음은 이름 저장 후 앱 재실행 복원이며, 메모/오프셋은 기존 native 자동 저장·재열기 검증 범위와 구분합니다. A/B 수동 시각 비교는 불명확으로 남기고 자동 위치/커서 검사 결과를 사용합니다.

Phase 4A 최종 확인(2026-10-15): 사용자가 앱 재실행 후 ‘복원 확인’ 이름과 실제 테이크 재생 유지, 별도 콘솔 미생성을 확인했습니다.4A 문서/로드맵 완료이며 위 단계별 ‘확인 전’은 당시 이력입니다. A/B 육안 비교 불명확·실제 왕복 지연 미측정 등 제약은 그대로 유지합니다.

## Phase 4B 후보 기능과 한계 — 2026-10-15

- 연습/연주 화면의 최소 믹스 패널에서 실제 테이크 선택·gain/mute/solo/추가 offset/masterGain·명시적 설정 저장을 제공합니다. 준비 버튼을 눌러야 WAV를 읽어 참조 재생을 연결합니다. 준비 전 참조를 선택한 상태에서는 정렬 REC를 차단합니다. REC 중에는 소스/offset/출력을 잠그고 청취 음량·mute/solo는 입력 원본에 영향을 주지 않습니다.
- TakeMixPlayer는 main PlayerEngine을 교체하지 않고 별도 HTMLAudioElement를 사용합니다. 저장 songStartMs/당시 rate/비파괴 offset을 역변환하며 pause/seek/rate/loop를 따릅니다.80ms 초과 drift 재탐색과 재생 오류 시 전체 참조 정리·기준 반주 일시정지를 제공합니다. 샘플 단위 동기와 실제 지연 품질은 미검증입니다. 청취용 배속 변환은 WebView preservesPitch에 의존하며 native 출력과 지원 범위가 다릅니다.
- 원본 테이크를 들으며 REC하면 referenceTakeIds를 기록하고 기존 InputOnly writer가 새 UUID/WAV를 만듭니다. 출력 재생 신호를 녹음 큐에 연결하지 않습니다. 오버더빙 준비는 같은 프로젝트/저장 리비전/로컬 반주에 연결된 READY만 허용합니다. 다른 트랙 선택·저장 후에는 같은 리비전에서 녹음해야 합니다.
- 출력 믹스 만들기/미리 듣기·사용 권한 확인 후 새 WAV 내보내기를 제공합니다.1× 또는 무반주 테이크 + PCM16/float32 mono/stereo 로컬 WAV만 지원합니다.48kHz mono 출력/선형 리샘플링, 입력64MiB/최대8레이어·출력10분/256MiB, 제한 전 peak/제한 프레임 진단을 표시합니다. 반주 offset은 현재 재생 UI에서0ms이며 take offset만 조절합니다. 배속 테이크 출력/MP3/stereo 보존/pan/clip·고품질 리샘플링은 미구현입니다.
- 아직 신규 Windows UI·실제 오버더빙/동시 청취·내보낸 WAV 청취는 미실행입니다. 합성/자동 결과는 PHASE-04B.md와 구분합니다. YouTube/system 캡처·병합 경로는 없습니다.

청취 품질 수정 후보(2026-10-15): 실제 믹스 재생/테이크 음소거는 확인했으나 ‘믹스에서만 끊김’이 보고됐습니다. 앞선80ms 즉시 탐색 정책을 수정해 같은 배속/음량 쓰기를 생략하고, 연속 재생은 실제 시간160ms 초과 편차의500ms 지속·직전 탐색 후1초 조건을 확인합니다. play 준비/탐색 중 중복 보정을 막으며 명시적 seek/offset은 즉시 적용합니다. 짧은 시각 차이 반복 탐색 회귀와 전체145개 프론트·번들1개 성공, 실제 개선 여부는 수정 exe 적용 후 확인 전입니다. 정밀 동기 보장으로 해석하지 않습니다.

청취 개선 실제 확인(2026-10-15): 수정 exe에서 사용자가 ‘끊김 없이 들림’을 확인했습니다. 현재 실제 프로젝트는 Guitar 1 단일 악보 트랙입니다. 다른 악보 트랙의 참조 오버더빙·독립ID/파일/원본 보존은 자체 두 트랙 합성 저장 테스트로 검증했고, 현재 프로젝트의 실제 새 오버더빙 REC는 다음 검사입니다. 여러 장치의 동기 정밀도/장시간 안정성 또는 다른 트랙 실제 녹음 성공으로 확대하지 않습니다.

오버더빙 실제 저장 확인(2026-10-15): 사용자 READY5.42초/260,250프레임/누락0/peak0.962, 읽기 전용 메타데이터에서 새 takeID e90e96c5-4458-42bf-b812-dc72f19aab90과 referenceTakeIds의 기존 ‘복원 확인’ID를 확인했습니다. 실제 배속은0.5×이며1×로 오인하지 않습니다. 새 테이크 청취·파일 export·solo/설정 재열기는 아직 확인 전입니다.

재생 전 REC 개선 후보(2026-10-15): 사용자가 REC 즉시 활성화를 다시 요청해, 정지 상태 REC→3초 준비→native 입력 기록 준비→반주 재생을 연결했습니다. 녹음 카운트인과 취소는 조작 잠금 밖의 공통 표시로 옮기며, 기존 일반 재생의 준비 표시도 유지합니다. native는 deferTransport 요청에서만 ARMING 동안 입력을 보존하고 최대5초 내 clock mapping을 첫 샘플까지 연결합니다. 준비 취소/입력 오류/동기화 실패·늦은 응답/재생 실패 시 원본 보존과 뒤늦은 자동 재생 방지를 검증합니다. negative songStartMs는 실제 선행 입력과 보정을 표현하며-60초까지 허용합니다. DTO/기존 테이크/SQLite는 버전을 유지하고 새 라이브러리는 없습니다. 실제 새 흐름 확인 전에는 수용 완료로 기록하지 않습니다.

## 사용자 제공 기타 파일을 들으며 REC — 2026-10-20 후보

사용자 파일은 IMPORTED_STEM으로 재생하고 RecordedTake나 referenceTakeIds에 넣지 않습니다. 저장 악보/기준 로컬 반주·입력 보정·clock/반복 조건과 준비 완료가 모두 맞을 때 기존 정렬 REC를 엽니다. 녹음 큐에는 선택 입력만 전달하며 재생 음원/시스템·YouTube를 합치지 않습니다. 청취 설정은 원본 파일을 변경하지 않습니다. 녹음 당시 믹스 전체 snapshot은 저장하지 않으므로 과거 모든 청취 설정의 자동 재현을 보장하지 않습니다. 실제 장치/REC 수용 여부는 PHASE-06B에 구분해 기록합니다.
