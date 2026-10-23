# Phase 02 — 악보 import와 재생 동기화

## 후속 — 마디 단위 반복 선택 (2026-10-23)

### 1. 작업 개요

F-03에 정의된 시작/끝 마디 선택을 기존 로컬 A-B 반복 엔진에 연결합니다. 기본 TAB/오선보 버튼 전환은 유지하며 개인 입력이나 새 모델은 사용하지 않습니다. 전체 로드맵 완료와 별개인 Phase2 기능 보완입니다.

### 2. 구현 및 변경 사항

- `src/features/score/scoreMeasureLoop.ts`: 실제 펼친 masterBars의 시작/끝 tick을 최신 싱크 앵커로 ms 변환하고 선택 순서·음원 범위·250ms 최소 길이를 검증합니다. 쉼표 마디도 포함하며 반복된 같은 마디는 occurrence로 구분합니다.
- `ScoreLoopPanel.tsx`: 시작/끝 선택·적용/해제와 상태/오류를 최소 공통 UI로 제공합니다. 정상 적용은 정지→기존 setLoop→시작 seek, 새 epoch를 만들고 자동 재생하지 않습니다. 하단 ms 입력과 동일한 engine.loop를 사용합니다.
- `src/features/player/TransportBar.tsx`: 외부에서 적용/복원한 반복이 있으면 A/B 입력도 같은 ms로 맞춥니다. 하단에서 껐다 다시 켜거나 R로 다시 켤 때 이전 기본0~2000ms가 아닌 마지막 적용 구간을 재사용합니다.
- `ScoreWorkspace.tsx`, `src/app/App.tsx`: 카피·연습·연주 주 악보에 연결하고 입력 로딩/프로젝트 작업·REC 중 비활성화합니다. 악보 교체 시 선택 초안은 초기화합니다. UI와 변환 함수를 분리하고 새 의존성/IPC/저장 형식은 추가하지 않습니다.
- `scoreMeasureLoop.test.ts`, `ScoreLoopPanel.test.tsx`: 비선형 앵커/인트로·반복/쉼표·선택 오류·기존 상태 보존·하단 반복 공유·epoch/자동 재생 없음과 잠금을 검사합니다. 관련 명세/계약·로드맵/진행 요약을 갱신합니다.
- `src/app/scoreLoop.test.tsx`: 실제 App→ScoreWorkspace→마디 패널의 녹음 잠금 전달을 추가 검증합니다. 최종 검토에서 새 prop이 기존 편집 패널 쪽에 연결된 오류를 발견해 마디 패널에 바로잡았습니다. 기존 상위 inert 보호는 있었지만 별도 fieldset 잠금도 직접 검사하며 이전422개 후보는 실행하지 않았습니다.

### 3. 테스트 결과

- 관련5개/2파일 성공(2.54초), `pnpm typecheck` 성공.
- `pnpm test`:422개/101파일 성공(27.89초). `pnpm lint`, `pnpm build`의 타입 검사·Vite(약60초), `pnpm format:check` 성공. 기존500kB 초과 청크 경고는 남습니다.
- 하단 A/B 동기화 후 관련5개/2파일도 성공(2.68초)했고 최종 전체 회귀422개/101파일을31.29초에 통과했습니다. 최종 타입/lint·빌드/포맷 결과는 후속 기록에 추가합니다.
- 최종 타입/lint·Vite 빌드63초·포맷도 성공했습니다. 실제 브라우저에서도 하단 A=2000/B=4000 반영과 반복 끄기→켜기 후 같은 범위/오류 없음까지 확인했습니다. 최종 화면은 `measure-loop-final-browser-20261023.png`입니다.
- 잠금 연결 수정 뒤 실제 App 통합1개(505ms)와 타입 검사가 성공했습니다. 이 수정까지 포함한 최종 전체 검사/실행 결과는 아래 기록을 따릅니다.
- 잠금 연결을 포함한 최종 `pnpm test`는423개/102파일/26.67초 성공, `pnpm lint`·`pnpm build`의 타입/Vite77초·`pnpm format:check`도 성공했습니다. 새 원격 CI와 Windows 실행 결과는 아래 적용 기록에 추가합니다.
- 실제 개발 브라우저에서 자체2마디 악보/4초 합성 음원을 사용해2마디=2000~4000ms 적용·시작 이동·자동 재생 없음, 재생 후 같은 범위 반복/epoch 갱신과 역전 선택 오류 시 기존 반복 보존을 확인했습니다.0.5×·해제와 최종 Windows 적용 결과는 아래 후속 기록에 구분합니다.
- 같은 브라우저의0.5×도2000~4000ms 안에서 반복하고 epoch가 갱신되며 해제 후 반복 꺼짐/오류 없음까지 확인했습니다. 증거: `src-tauri/target/runtime-validation/measure-loop-browser-20261023.png`(Git 제외).
- 브라우저 탭 생성 호출의 navigation timeout은 생성된 탭3을 다시 바인딩해 해결했습니다. 프로젝트/개인 데이터를 불러오거나 앱 보안 설정을 바꾸지 않았습니다.
- 실제 SSL 입력/채점·REC 동시 검사, 별도 Windows/새 installer는 **미실행**입니다. 엔진/네이티브/녹음 로직은 변경하지 않았으며 별도 OS 환경도 없습니다.

### 4. 미구현 및 알려진 문제

- 범위 초안은 해당 화면에서만 유지합니다. 적용 loop는 기존 ms 저장 정책을 사용하며 싱크를 나중에 바꿔도 마디에 자동 재고정하지 않습니다. 필요하면 다시 적용합니다.
- 음원 밖으로 변환된 마디는 자르지 않고 거부합니다. 사용자가 실제 음원과 싱크를 확인해야 합니다. YouTube/테이크 미리보기·마우스 드래그 범위 선택은 이번 구현 대상이 아닙니다.
- 고급 채점·특화 AI/별도 Windows·최종 배포 미완료는 유지합니다.

### 5. 다음 작업 계획

최신 dist의 내장 검사·Windows 빌드/실행과 기존 데이터 보존 결과를 추가합니다. 이어 F-03/기존 로드맵의 남은 기능 수용 항목을 점검하고, 이미 완료한 기능을 다시 구현하지 않습니다.

## 후속 — TAB 기본 표시와 오선보 전환 (2026-10-23)

### 1. 작업 개요

사용자 요청에 따라 주 악보의 기본 표시를 TAB 전용으로 유지하고 ‘오선보 보기’/‘TAB 보기’ 버튼으로 한 표기씩 전환합니다. 세로/가로 배치와75·100·125·150% 확대도 독립적인 표시 상태로 제공합니다. 이 절은 이번 변경의 최신 기록이며 과거 완료 기록을 삭제하지 않습니다.

### 2. 구현 및 변경 사항

- `src/features/score/scoreDisplay.ts`: 표시 타입·기본값·alphaTab 설정과 렌더 전용 복사본/원본 객체 관계를 분리했습니다. TAB 전용 원본에서도 오선보가 보이게 복사본의 staff 플래그만 바꾸며 원본 음정·운지·시간·ID는 유지합니다.
- `ScoreDisplayControls.tsx`: 별도 전환 버튼과 배치/확대 선택. `ScoreViewport.tsx`: 기존 인스턴스 정리, 늦은 이벤트 무시, 렌더 준비 상태와 원래 음표 선택·커서 연결 및 악보 내부 가로/세로 추적.
- `src/app/App.tsx`, `ScoreWorkspace.tsx`: 같은 실행의 카피·연습·연주 주 악보와 화면 왕복에 표시 상태를 유지합니다. 편집/history·프로젝트 저장 모델과 분리했습니다.
- `scoreDisplay.test.ts`, `ScoreViewport.test.tsx`, `src/app/scoreSession.test.tsx`: 두 기타·쉼표/화음/반복 원본 보존, 표시 전환/선택·Undo·epoch/초점과 늦은 이벤트 회귀를 추가했습니다.
- `docs/00`, `02`, `04`, `08`, `09`, `12`, 루트 README와 진행 요약에 사용자 결정·계약·검증 범위를 반영했습니다. 앞서 만든 TAB+오선보 동시 표시 후보는 실행/배포하지 않고 이번 단독 전환 버전으로 대체했습니다. 새 의존성·IPC·DB 변경은 없습니다.

### 3. 테스트 결과

- `pnpm test`:417개/99파일 성공(31.05초). `pnpm lint`, `pnpm build`의 TypeScript 검사·Vite 빌드(약61초), `pnpm format:check` 성공.
- `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`: 내장 UI/권한 정책3개 성공, 컴파일41.78초. 하드링크 캐시 복사 대체와 기존 linker 경고는 실패가 아닙니다.
- `pnpm tauri build --debug --no-bundle --ci --config <이번 검증 설정> -- --locked --offline`: Windows 실행 파일 빌드22.81초 성공.
- 실제 개발 브라우저에서 기본 TAB만 표시 → 버튼으로 오선보만 표시 → TAB 복귀, 가로 배치/150% 후 세로/100% 복귀, 렌더 완료·오류 없음 확인. 증거: `src-tauri/target/runtime-validation/tab-only-browser-20261023.png`(생성 산출물, Git 제외).
- 해결: 단순 StaveProfile 변경으로는 TAB 전용 원본의 오선보가 숨겨져 렌더 복사본에만 표시 플래그를 적용했습니다. 복잡한 alphaTab 객체의 테스트 identity matcher 실행이 지연돼 해당 identity를 boolean으로 검사하여 같은 단언을 유지했습니다. 개발 포트는 이미 실행 중인 서버를 재사용했습니다.
- 최신 Windows 실행/데이터 보존 확인 결과는 아래 적용 기록에 기록합니다. 이번 변경에서 오디오 입력·녹음·AI 실제 분석, 깨끗한 별도 Windows, 새 설치 프로그램 검사는 **미실행**입니다. 해당 엔진/설치 경로를 변경하지 않았고 별도 Windows 환경도 없습니다.

### 4. 미구현 및 알려진 문제

- 표시 설정은 실행 중 유지하며 재실행 저장은 미구현입니다. 원본 비교·AI/YouTube/테이크 미리보기는 기존 TAB 기본값입니다.
- 오선보 전환이 고급 화음 편집·실제 줄/프렛 판정 지원을 추가하지 않습니다. 표시가 바뀔 때 렌더가 다시 준비되며 그동안 커서를 숨깁니다.
- Vite의 기존500kB 초과 청크 경고는 남습니다. 원본/저장 형식과 재생·녹음 엔진의 변경은 없습니다.

### Windows 적용 기록

`score-notation-candidate.json`의 새 portable 실행 파일(40,686,592바이트·SHA256 `cdf8a128f0ee1335651e84dcfc2da51fc81547d8461220e189ae91e6631f6fc6`)과 runtime3393개 전체 지문을 확인했습니다. 기존 PID33044는 정상 종료0/강제 종료 없음, 새 **PID28404·PTY74119·‘GuitarLab · TAB와 오선보 전환’**은 READY/응답 정상입니다. `score-display_db_probe.py after`로 실제 DB9/16개 테이블과4개 모델 marker 불변을 확인했습니다. 앱은 유지하며 입력/REC는 시작하지 않았습니다. Windows 창 내부 사용자 조작 수용과 이번 새 ZIP/설치 프로그램 검사는 **미실행**입니다. 자동 검사·실제 개발 브라우저 검증과 Windows 실행/내장 UI 검사를 구분합니다.

소스/문서는 `3d7e2424502a84cda25829c1c8783eef41f2f214`로 main에 일반 push했습니다. [Windows CI39913241783](https://github.com/BomJin2/GuitarLab/actions/runs/39913241783)는 최초 조회 시 in_progress이며 최종 성공/실패는 아직 미확인입니다. 직전 성공 실행을 이번 커밋의 성공으로 기록하지 않습니다.

### 5. 다음 작업 계획

이번 Windows 적용·보존 결과를 정리한 뒤 기존 순서에 따라 남은 악보/재생 수용 항목을 확인합니다. 특화 AI·실제 고급 주법 품질·깨끗한 Windows·서명/최종 배포 미완료는 별도로 유지하며 이번 표시 기능을 전체 로드맵 완료로 기록하지 않습니다.

## 1. 작업 개요

- 작업일/완료 날짜: 2026-10-13. 상태: 완료.
- 아래 1~5절은 구현 중간 기록입니다. 최종 구현과 검증은 하단 완료 기록을 기준으로 합니다.
- Phase 1 수용 조건/진행 문서 확인 후 순차 진행.

## 2. 구현 및 변경 사항

- alphaTab 1.6.1(MPL-2.0)과 공식 번들 Vite 플러그인 사용. 최신 1.8.4 코어는 설치 확인 후 플러그인 호환성 문제로 1.6.1에 고정.
- 최신 독립 플러그인의 Node >=20.19/Vite7~8 조건, 이전 코어 export의 누락된 vite 모듈을 확인. 기존 Node20.15/Vite6를 유지할 수 있는 1.6.1로 타입·빌드 검증.
- NoteEvent/ScoreDocument schemaVersion=1 정규화, 960 PPQ, 표준 기타 운지 매핑. 기본 tempoMap만 연결되어 있으며 tempo 변화·반복 기호의 펼친 시간축은 추가 검증 필요.
- 사용자 WAV/MP3, GP/MusicXML 선택 UI, 크기 제한, 오디오 헤더 검증, 작업 generation 취소/교체 결과 보호.
- HTMLAudioElement 기반 PlayerEngine: 재생/일시정지/seek/rate/volume/A-B loop/epoch, preservesPitch 요청. 120 BPM 4박 카운트인 구현, 아직 브라우저 청취·취소 검증 미완료.
- 최소 두 sync anchors와 단조 검증, 인트로와 영역 밖 선형 연장. loop는 현재 audio ms 기준.
- alphaTab boundsLookup.findBeat 기반 실제 좌표의 별도 커서 overlay. 설치된 external media API를 읽었으며 직접 외부 미디어 synth 제어는 아직 도입하지 않음.
- 자체 MusicXML 2마디 E4/G4/A4/B4×2와 48kHz mono 4초 WAV 사인파 생성. 개인 음원/녹음 없음.
- alphaTab 로거는 고정 진단 코드로 바꾸어 내부 오류 원문을 로그에 노출하지 않음.
- 변경: package.json/pnpm-lock.yaml/vite.config.ts, src/main.tsx, App/AppShell/App.test, TransportBar, styles/logger/test setup, Tauri CSP, fixtures README, docs/12.
- 추가: src/entities/score.ts; PlayerEngine/PlayerContext/playerContextValue/usePlayer/sync와 테스트; alphaTabAdapter/ScoreViewport/ScoreWorkspace와 테스트; public/fixtures/*.

## 3. 테스트 결과

| 검증 | 현재 결과 |
|---|---|
| pnpm typecheck | 통과 |
| pnpm lint | 통과 |
| pnpm test | 13개 통과: UI5, sync3, player3, import2 |
| pnpm build | 직전 빌드 통과, 최종 수정 후 실행 결과 수집 필요 |
| 실제 MusicXML import | 8음표 TAB 렌더/0프렛 MIDI64 확인 |
| 합성 WAV 로드/재생 | 길이4초, 재생 완료 위치4초 확인 |
| 2초 seek / 0.75배속 | 2마디 첫 E4와 커서/epoch 변화 확인 |
| A-B 반복 | 0~2초 반복 시작과 epoch 변화 확인, 장시간 반복 회귀는 미실행 |

스크린샷: screenshots/PHASE-02-POC.jpg. 브라우저 viewport 변경 직후 캡처여서 최종 화면 재촬영 필요.

해결한 오류: Fast Refresh component/hook 혼합 경고를 별도 context/hook 파일로 해결. jsdom 미디어 구현 부재는 테스트별 load/pause mock 재설정으로 해결. Python UTF-8 읽기를 명시. 기존 개발 탭의 연결 실패는 새 검증 탭으로 복구. 예상 손상 악보 실패 테스트는 SCORE_IMPORT_FAILED 코드로만 출력.

Tauri 실제 재실행/CSP·브라우저 오디오 청취·MP3·다양한 GP 포맷·카운트인 취소·고급 tempo/repeat: 미실행.

## 4. 미구현 및 알려진 문제

- 메트로놈, 실제 목표 지판(현재 목표 텍스트만 연결), Space/좌우/R 단축키 미구현.
- 현재 카피 화면에만 실제 악보 워크스페이스 연결. 모드 전환 시 악보 선택과 anchors의 상태 유지가 필요함. 연습/연주 DEMO와 실제 플레이어 UI 혼동 없도록 분리 필요.
- 트랙별 음량/선택 완료 범위 추가 검토. 현재 오디오 원본 master volume만 구현.
- loop 교체 후 transport 로컬 표시 상태 초기화, 재생 중 앵커 변경, 카운트인 경합 회귀 확인 필요.
- normalizeScore tempoMap·박자표·원본 바이트 보관·ID 재사용 규칙 계약 보강 필요. 파일 import 결과 오류 메시지를 모두 안전한 고정 사용자 문구로 변환할 것.
- WebView 재생 clock은 native 채점 clock으로 사용하지 않음. Phase3에서 clock PoC 필요.
- 큰 alphaTab 번들 chunk 경고가 있으며 실제 renderer 진입점의 지연 로딩 검토.

## 5. 다음 작업 계획

1. 최종 빌드 결과 수집, actual workbench 상태 공유 및 DEMO 분리.
2. 카운트인 청취/취소 검증, 메트로놈·실제 운지 지판·재생 단축키 구현.
3. 기본/실패/취소/복수 import 회귀와 Tauri 창 검증.
4. Phase 2의 모든 수용 조건을 확인한 뒤에만 완료 표시하고 Phase 3 진행.


## 완료 기록 — 2026-10-13

### 1. 작업 개요와 전체 상태

Phase 2 수용 조건을 구현·검증했습니다. 다음 단계는 Phase 3의 네이티브 오디오 입력·단음 판정입니다. Phase 3 이상의 기능은 완료 처리하지 않았습니다.

### 2. 최종 구현과 수정 파일

- 사용자 MusicXML/GP 선택 → 원본 bytes 메모리 보존 → alphaTab 렌더 → 반복을 펼친 NoteEvent/tempoMap/timeSignatures 정규화. notationNoteId로 반복 occurrence의 원본 음표 관계 유지.
- WAV/MP3 로컬 재생, seek, 0.5~1.5배속, A-B 반복, 현재/다음 음, 6현 지판의 실제 목표 프렛, 악보 커서. 정확한 물리적 운지는 주장하지 않음.
- 카피/연습/연주/라이브러리/설정 이동 후 악보·앵커 유지. 프로젝트 저장 기능을 대신하지 않으며 앱 종료 시 메모리 상태는 사라짐.
- 원곡과 메트로놈 음량을 분리. 악보 트랙은 선택/렌더 대상으로 다루며 별도 오디오 stem이라고 표시하지 않음.
- 현재 마디·앵커의 tempo/박자/배속을 반영한 카운트인과 메트로놈. 인트로 전 클릭 없음. Space 재생/일시정지, 좌우 5초 seek, R 반복 전환, 입력/버튼/링크/패널 조절 중 단축키 충돌 방지.
- 악보/음원과 fixture에 동일한 취소·최신 요청 보호. FileReader abort, fetch AbortSignal, 크기/형식/헤더 검증. 늦은 재생 성공/실패와 이전 media 이벤트가 새 파일을 바꾸지 않도록 보호.
- 루프/음량/박자 상태를 엔진 snapshot 하나에서 관리. StrictMode 수명 재설정과 음원 메타데이터 15초 timeout 처리.
- 수정 파일: src/app/App.tsx, AppShell.tsx, App.test.tsx; src/main.tsx; src/entities/score.ts; src/features/player/*; src/features/score/alphaTabAdapter.ts, ScoreViewport.tsx, ScoreWorkspace.tsx, WorkspacePage.tsx; src/features/practice/Fretboard.tsx; src/shared/styles.css, logger.ts, readBlob.ts, latestTask.ts; src/test/setup.ts; src/vite-env.d.ts; package.json, pnpm-lock.yaml, vite.config.ts, src-tauri/tauri.conf.json; fixtures/README.md; docs/12, docs/08, docs/progress/README.md.
- 추가 파일: scoreSession.ts; timing.ts와 테스트; PlayerEngine/alphaTabAdapter/sync 계약 테스트; scoreSession.test.tsx; latestTask/readBlob와 테스트; public/fixtures/standard.musicxml, standard.gp, sine.wav, sine.mp3; screenshots/PHASE-02-FINAL.jpg.
- 신규 라이브러리는 alphaTab 1.6.1(MPL-2.0). 원본 코드를 수정하지 않았으며 공식 번들 Vite 플러그인을 사용. 독립 최신 플러그인은 현재 Node/Vite와 호환되지 않아 설치하지 않음.

### 3. 테스트 결과와 오류 해결

| 실행 명령/확인 | 최종 결과 |
|---|---|
| pnpm typecheck | 통과 |
| pnpm lint | 통과, 경고 0 |
| pnpm test | 8개 파일, 35개 테스트 통과 |
| pnpm build | 통과, alphaTab worker/worklet·font·JS/CSS 생성 |
| pnpm format:check | 통과 |
| cargo fmt --check --manifest-path src-tauri/Cargo.toml | 통과 |
| cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings | 통과 |
| cargo test --locked --manifest-path src-tauri/Cargo.toml | Rust 기본 테스트 1개 통과 |
| cargo run --locked --manifest-path src-tauri/Cargo.toml | 실행 중인 Vite 서버를 재사용하여 Windows 창 실행·확인 |
| Windows 실제 MusicXML 렌더 | worker/font/TAB 정상, E4(64) 0프렛 표시 |
| Windows WAV 재생·seek | 4초 재생 완료, 1초 seek에서 A4(69) 5프렛과 실제 커서 좌표 일치 |
| Windows 자체 MP3 선택 | 파일 대화상자 키보드 선택 완료, 4초 길이와 새 epoch 확인 |
| 브라우저 MP3 파일 선택 | 실제 filechooser에서 sine.mp3 선택, 4초 길이와 정상 재생 상태 확인 |
| 브라우저 카운트인/메트로놈 | 0.75배속·1마디 설정, 카운트인 상태→재생 완료 확인, 메트로놈 켜기 상태 확인 |
| 브라우저 A-B 반복 | 0~2초 반복 최소 3회 이상, epoch 9→20(일시정지 포함), 구간 내 playhead 유지 |
| 모드 보존 | 반복 후 연습으로 이동해 같은 악보/현재 목표/음원이 유지됨. 라이브러리·설정 이동은 통합 테스트도 통과 |
| 자체 GP7 왕복 | alphaTab Gp7Exporter로 작성한 GP7을 다시 import, 8개 피치 64/67/69/71×2 일치 |
| ffprobe 자체 MP3 | 4.000000초 확인 |

회귀 테스트는 기존 검토에서 찾은 모드 전환, 재생 성공·실패 경합, 반복 초기화, fixture 취소/교체, 박자·배속 카운트인, 인트로 메트로놈, 실제 FileReader abort, StrictMode 재사용을 포함합니다.

해결한 오류:
- 테스트에서 Node fs 타입이 없던 문제는 새 의존성 설치 대신 기존 Vite raw import로 fixture를 읽어 해결.
- 119.99999999999997 같은 부동소수점 결과는 음악적 검증에 맞춰 toBeCloseTo와 박자 필드 검사를 분리.
- 테스트 double의 순환 return type 추론은 독립 생성 함수로 분리해 strict 타입 검사 통과.
- pnpm tauri dev와 기존 Vite 중복 실행은 1420 포트 충돌을 일으킴. 서버의 실제 종료/응답을 확인한 뒤 Vite를 하나만 실행하고 cargo run으로 native 창 검증. 일반 개발 시 pnpm dev와 pnpm tauri dev를 동시에 실행하지 말 것.
- Windows file picker의 열기 버튼은 msedgewebview2 소유로 클릭 자동화가 거부됨. 대화상자 취소 후 supported keyboard Return으로 같은 로컬 fixture 선택을 완료.

### 4. 미구현·검증 제약

- CPAL 입력·튜너·캘리브레이션·채점·점수 저장·녹음·AI·SQLite·에디터는 후속 Phase 범위. UI에 미구현을 명시하며 가짜 결과 없음.
- 영구 저장·재실행 복구는 Phase 4. 현재 세션 원본 bytes/앵커/트랙은 앱 수명만 유지.
- MIDI 합성 트랙 믹서·사용자 stems 믹싱은 미구현. 현재 원곡과 실제 메트로놈 출력만 조절.
- 실제 기타/오디오 인터페이스 입력은 미실행(Phase 3). MP3 배속 음정 유지의 청취 품질·장시간/고 DPI·모든 GP3/4/5/GPX 변형 및 복잡한 주법 원본 보존은 미실행. 실제 성공 fixture 범위는 자체 GP7/MusicXML/WAV/MP3이며 다른 형식도 파서 실패를 정상 안내.
- HTMLAudioElement preservesPitch를 요청하지만 음질·입력 채점의 sample-accurate 동기화를 보장하지 않음. UI clock을 Rust 판정 clock으로 그대로 사용하지 않을 것.
- alphaTab 번들 500kB 초과 경고와 MSVC import-library linker_messages 안내가 남음. 빌드·clippy 성공과 구별하여 기록하며 경고 숨김 설정을 추가하지 않음.
- Python 검사: 미실행, 이번 Phase에서 Python 코드 변경 없음.

### 5. 다음 작업

Phase 3: CPAL 장치 열거/입력 선택, 실시간 안전 큐, monotonic capture timestamp, 단음 pitch/onset PoC, Rust 순수 matcher의 최소 8개 합성 사례, clock anchor/epoch·보정 계약과 실제 장치 진단. 실제 장치 측정이 없는 정확도는 달성했다고 기록하지 않습니다.
