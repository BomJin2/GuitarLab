# 11. Codex 작업 지시문 모음

> **사용법:** VS Code에서 프로젝트 루트를 열고, 아래 프롬프트를 **Phase별로 하나씩** Codex에 전달하세요. 직전 단계 테스트를 통과하기 전에는 다음 단계로 넘어가지 않습니다. 각 프롬프트의 '파일 읽기'는 구현 전에 반드시 수행합니다.

## 공통 프롬프트(세션마다 시작)

```text
프로젝트의 AGENTS.md를 먼저 읽고 이 지침을 준수하세요. 해당 디렉터리의 하위 AGENTS.md도 읽으세요.
현재 작업은 GuitarLab(가칭) Windows 로컬 데스크톱 앱입니다.
코드 없이 UI만 만든 것을 기능 완료로 간주하지 마세요. 동작하는 최소 단위를 수직 구현하고 자동 테스트/검증을 추가하세요.
범위 밖의 기능은 mock으로 대체하되 반드시 DEMO/미구현 표시를 해 실제 기능처럼 보이지 않게 하세요.
변경한 파일, 검증 명령/결과, 미실행 이유, 알려진 제약을 한국어로 보고하세요.
```

## Phase 0 — 초기 프로젝트

```text
README.md, AGENTS.md, docs/00-SCOPE-AND-DECISIONS.md,
docs/03-TECH-ARCHITECTURE.md, docs/08-IMPLEMENTATION-ROADMAP.md,
docs/13-ENV-AND-RELEASE.md를 읽으세요.
아직 소스 코드가 없다면 기존 문서를 보존한 상태로 Tauri 2 + Vite React TS + pnpm 앱을 초기화하세요.
Tailwind, ESLint, Prettier, strict 타입, 테스트 스크립트 및 핵심 디렉터리 구조를 설정하세요.
Windows에서 앱이 뜨는지 확인하고 실행한 명령과 결과를 보고하세요.
AI/오디오/DB를 한꺼번에 만들지 마세요.
```

## Phase 1 — UI 디자인

```text
AGENTS.md, docs/02-UI-UX-DESIGN.md, docs/01-PRODUCT-REQUIREMENTS.md를 읽으세요.
라이브러리/카피 모드/연습 모드/연주 모드/결과/설정의 화면 및 라우팅을 구현하세요.
디자인 토큰과 AppShell, TopBar, ResizablePanel, TransportBar, ScorePanel, Fretboard 프리뷰를 구축하세요.
디자인 목업 수치는 DEMO 표시, 실제 Tauri 기능은 아직 호출하지 마세요.
1100x680, 1440x900, 1920x1080을 검증하고 UI 테스트를 추가하세요.
```

## Phase 2 — TAB/재생

```text
AGENTS.md, docs/03-TECH-ARCHITECTURE.md, docs/04-SCORE-TAB-EDITOR.md,
docs/12-API-CONTRACTS.md를 읽으세요.
alphaTab을 최소 어댑터로 도입하고 자체 제작된 테스트 악보를 import/렌더하세요.
별도 PlayerEngine 추상화, play/pause/seek, speed, A-B loop, 카운트인, 트랙 선택,
TAB 커서 및 목표 지판 표시를 구현하세요.
원곡과 악보 타임라인을 연동하기 위해 2개 sync anchor를 편집할 수 있도록 하세요.
alphaTab external-media 실제 API/버전 호환을 검증해 이용 여부/제약을 기록하세요.
커서/seek/loop/speed sync 테스트를 추가하세요.
```

## Phase 3 — 기타 입력과 리듬게임

```text
AGENTS.md, src-tauri/AGENTS.md, docs/05-REALTIME-JUDGEMENT.md,
docs/12-API-CONTRACTS.md, docs/09-TEST-PLAN.md를 읽으세요.
Rust CPAL로 입력 장치를 선택하고 캡처하되 콜백에서 블로킹하지 마세요.
PCM timestamp 기반 onset/pitch 이벤트를 만들고 fixture 기반 matcher를 우선 구현하세요.
실시간 UI에 COOL/GOOD/MISS, EARLY/LATE/WRONG NOTE, 콤보, 점수, 정확도 표시를 연결하세요.
calibration, audio device lost, playback epoch, seek/loop/speed 변화에 대응하세요.
단음 판정 자동 테스트 T-07~T-13을 먼저 통과하고 실제 입력 신호를 연결하세요.
성공하지 않은 다성/주법 판정은 아직 지원한다고 표시하지 마세요.
```

## Phase 4 — 로컬 저장

```text
AGENTS.md, docs/07-DATABASE-AND-FILES.md, docs/12-API-CONTRACTS.md를 읽으세요.
SQLite migrations, 프로젝트 관리, 파일 참조/복사, 악보 revision, 연습 session/attempt/event 저장을 구현하세요.
결과 화면에 실제 판정 통계와 마디별 분포를 연결하세요.
재실행 복구, 파일 누락 재연결, 원자적 저장/rollback, 데이터 마이그레이션 테스트를 추가하세요.
```

## Phase 5 — 수동 TAB 에디터

```text
AGENTS.md, docs/04-SCORE-TAB-EDITOR.md, docs/02-UI-UX-DESIGN.md를 읽으세요.
음표 추가/삭제/길이/줄/프렛 수정, 마디/템포/튜닝 조정, Undo/Redo, 저장 및 복구를 구현하세요.
악보 import/AI draft와 동일한 NoteEvent 도메인 모델만 사용하세요.
원본 보존, 재생/채점 대상 변경 반영, JSON/MusicXML export의 실제 가능 범위를 검증하세요.
```

## Phase 6 — AI 자동 카피

```text
AGENTS.md, ai/AGENTS.md, docs/06-AI-COPY-PIPELINE.md,
docs/12-API-CONTRACTS.md, docs/10-SECURITY-LICENSE.md를 읽으세요.
먼저 모델 없이 동작하는 JSONL mock/fixture adapter와 cancel/progress 테스트를 만드세요.
그 후 실제 audio-separator/Basic Pitch adapter, model install 안내, confidence 및 fingering 후보 생성,
AI 초안을 에디터에서 수정/확정하는 흐름을 구현하세요.
Python 개발 실행 및 릴리스 sidecar 번들 검증은 분리해 보고하세요.
원본 파일을 덮어쓰거나 모델을 사용자 동의 없이 다운로드하지 마세요.
```

## Phase 7 — 다성·주법 확장

```text
AGENTS.md, docs/05-REALTIME-JUDGEMENT.md, docs/09-TEST-PLAN.md를 읽으세요.
코드 다중 음정, 벤딩, 슬라이드, 해머링/풀링을 기능별 독립 검출기로 추가하세요.
실제 오디오 fixture에 근거한 precision/recall 및 타이밍 오차를 보고하세요.
미지원/저신뢰 이벤트는 UNVERIFIED/UNSUPPORTED로 처리하고 잘못된 감점을 피하세요.
기존 단음 테스트를 회귀 검증하세요.
```

## Phase 8 — 릴리스/품질

```text
AGENTS.md, docs/09-TEST-PLAN.md, docs/10-SECURITY-LICENSE.md,
docs/13-ENV-AND-RELEASE.md를 읽으세요.
Windows 설치형 패키징, 외부 Python 모델/사이드카 검증, 저작권/라이선스 고지,
오프라인/장치 재연결/데이터 백업/복구/실패 동작을 전체 점검하세요.
실제 수행한 검증과 미완료 항목을 릴리스 체크리스트로 보고하세요.
```

## 버그 수정 템플릿

```text
AGENTS.md와 관련 세부 문서를 읽으세요.
문제: [재현 조건과 실제 결과]
기대: [정확한 목표]
먼저 재현 테스트를 추가한 뒤 최소 범위로 수정하세요.
다른 기능 회귀를 확인하고 변경 이유, 통과/미실행 검증 결과를 보고하세요.
```

## v0.2 Codex 작업 프롬프트 — 연주 모드 확장

### Phase 2A — 두 기타 악보 트랙 선택

```text
AGENTS.md, docs/04-SCORE-TAB-EDITOR.md, docs/15-PERFORMANCE-MODE.md,
docs/16-LEAD-RHYTHM-GUITAR-SPLIT.md, docs/12-API-CONTRACTS.md를 읽으세요.
Guitar Pro/MusicXML의 Guitar 1/2 악보 트랙을 구분하여 리스트와 선택 UI를 구현하세요.
사용자 지정 이름을 지원하되 오디오 stem 존재 여부를 악보 존재와 혼동하지 마세요.
선택한 targetScoreTrackId만 실시간 판정 목표에 반영하고 트랙 전환 시 attempt/epoch 정책을 테스트하세요.
동작하지 않는 AI 분리 기능은 제공한다고 표시하지 마세요.
```

### Phase 4A — 입력 기타 녹음·리플레이

```text
AGENTS.md, src-tauri/AGENTS.md, docs/17-RECORDING-AND-REPLAY.md,
docs/07-DATABASE-AND-FILES.md, docs/12-API-CONTRACTS.md를 읽으세요.
CPAL InputOnly WAV recorder와 별도 writer thread, REC/STOP state machine, `.part`/recoverable 상태를 구현하세요.
녹음된 take를 scoreTrack/scoreRevision과 연결하고 결과에서 재생·A/B 비교·부분 seek를 제공하세요.
YouTube/system output/BackingMixer는 record buffer로 들어가면 안 됩니다.
합성 fixture 테스트와 장치 분리/디스크 full/크래시 복구 테스트를 먼저 작성한 뒤 실제 장치 검증을 수행하세요.
```

### Phase 4B — lead/rhythm 오버더빙

```text
AGENTS.md, docs/15-PERFORMANCE-MODE.md, docs/17-RECORDING-AND-REPLAY.md를 읽으세요.
Lead 사용자 take를 출력 믹서에서 재생한 상태에서 Rhythm 입력만 새 takeId/WAV에 녹음하는 Overdub을 구현하세요.
두 take의 볼륨·solo·mute·offset·A/B 비교와 사용자 소유 로컬 반주를 포함하는 WAV export를 구현하세요.
원본 take 덮어쓰기 금지, YouTube audiovisual content export 금지. 실제 믹스와 테스트 결과를 검증하세요.
```

### Phase 6A — 유튜브 반주 검색

```text
AGENTS.md, docs/14-BACKING-TRACK-FINDER.md, docs/10-SECURITY-LICENSE.md,
docs/15-PERFORMANCE-MODE.md를 읽으세요.
악보의 제목/아티스트/선택 guitar part로 YouTube backing 후보를 공식 API로 검색하되 가능한 키 보호 정책을 먼저 검토하세요.
그 후 사용자가 고른 영상은 보이는 공식 YouTube iframe으로만 플레이어를 렌더링하세요.
영상 오디오 다운로드/추출/AI 분리/로컬 파일 녹음/믹스 저장/백그라운드 playback 구현 금지.
YouTube 시계의 drift와 buffering 처리, sync correction UI 및 정밀 채점 미지원 상태를 검증하세요.
```

### Phase 6B — AI 리드/리듬 분리(연구 기능)

```text
AGENTS.md, ai/AGENTS.md, docs/16-LEAD-RHYTHM-GUITAR-SPLIT.md,
docs/06-AI-COPY-PIPELINE.md, docs/10-SECURITY-LICENSE.md를 읽으세요.
먼저 사용자가 개별 제공한 Lead/Rhythm WAV 불러오기와 믹서 연결을 구현하세요.
일반적인 기타 전체 분리 모델은 리드/리듬 두 stem으로 취급하지 마세요.
실제로 모델/가중치 라이선스가 검증된 특화 분리 adapter가 있는 경우만 실험적 opt-in 경로를 구현하세요.
사용자 A/B 청취 및 role confirmation 전에는 '확실히 분리됨'으로 표시하지 마세요.
분리 실패/품질 부족/모델 미설치에서는 기타 전체 제외 로컬 백킹으로 폴백하세요.
```
