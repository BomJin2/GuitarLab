# Phase 01 — UI 쉘과 디자인 시스템

## 1. 작업 개요

- 완료 날짜: 2026-10-13. 상태: 완료, 다음은 Phase 2.
- Phase 0의 타입/린트/테스트/빌드 결과를 확인하고 정상 코드 위에 확장함.
- 로컬 Git 저장소를 초기화하고 origin을 https://github.com/BomJin2/GuitarLab.git 으로 연결. 원격은 빈 저장소. 원격 push는 수행하지 않음.

## 2. 구현 및 변경 사항

- 라이브러리/카피/연습/연주/결과/설정/내 녹음/반주 찾기 hash 경로와 모드 전환.
- AppShell, 접이식 Sidebar, TopBar, TransportBar, Panel, StatusState(loading/empty/error/permission/deviceLost), ResizablePanel.
- 포인터 드래그와 키보드 좌우 화살표를 통한 196~320px 패널 조절, 접기/펼치기.
- 다크 컬러 토큰, 56px 상단/88px 하단, 224px/72px 탐색 패널, 내부 스크롤, reduced-motion 대응.
- 정적 TAB·지판·판정 프리뷰는 모두 DEMO 표기. 결과/녹음은 빈 상태. 미구현 기능의 버튼은 비활성.
- Alt+1/2/3 모드 이동, ? 안내, Esc 안내 닫기. 입력 요소에서는 전역 단축키 무시. 본문 건너뛰기와 포커스 표시.
- 수정: src/app/App.tsx, App.test.tsx, src/shared/styles.css.
- 추가: src/app/AppShell.tsx, routes.ts; src/components/ui/Panel.tsx, StatusState.tsx, ResizablePanel.tsx; src/features/player/TransportBar.tsx; src/features/score/ScorePreview.tsx, WorkspacePage.tsx; src/features/practice/Fretboard.tsx, ScorePanel.tsx, ResultsPage.tsx.
- 기존 파일/기능 삭제 없음. 별도 의존성 추가 없음. 네이티브 command/event 변경 없음.

## 3. 테스트 결과

| 검증 | 결과 |
|---|---|
| pnpm typecheck | 통과 |
| pnpm lint | 통과 |
| pnpm test | 5개 통과: 기존 3개, 모드/패널/안내 단축키, 본문 링크 포커스 |
| pnpm build | 통과 |
| 1100×680 / 1440×900 / 1920×1080 | 브라우저 실제 viewport 적용, screenshot 육안 확인. 최소 크기에서 내부 세로/지판 가로 스크롤, 최대 크기에서 전체 지판 확인 |

스크린샷: `screenshots/PHASE-01-1100x680.jpg`, `PHASE-01-1440x900.jpg`, `PHASE-01-1920x1080.jpg`.

오류 해결: Python 수정 스크립트의 기본 cp949 디코딩 실패는 PYTHONUTF8=1로 해결. 본문 링크의 #main이 hash 라우팅을 변경하지 않도록 기본 이동을 막고 main에 포커스를 주도록 수정·테스트.

Rust/Python 재검사: 미실행, 이번 Phase는 네이티브/Python 코드 변경 없음. Windows 고 DPI/실제 스크린리더 전체 검사: 미실행.

## 4. 미구현 및 알려진 문제

- 재생, 악보 import, 입력/판정, 녹음, 모델, 저장은 아직 미구현. Space/좌우/R은 엔진 연결 이후 활성화.
- 프로젝트별 패널 너비 영구 저장은 프로젝트 저장 Phase에서 연결. 지금은 UI 컴포넌트 상태만 유지.
- 상태 컴포넌트의 오류/권한/장치 문구는 실제 엔진 연결 전 공통 표시 구조만 제공.
- 모드 프리뷰는 실제 분석/점수 결과가 아님.

## 5. 다음 작업 계획

Phase 2: 설치할 alphaTab 버전/라이선스/API 검증, 자체 악보 fixture, normalized NoteEvent와 sync mapping, 로컬 재생·seek/rate/loop·카운트인·메트로놈 연동. 실제 기능 완료 전 DEMO는 분리 유지.
