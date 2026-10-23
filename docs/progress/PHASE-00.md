# Phase 00 — 프로젝트 스캐폴딩

## 1. 작업 개요

- 목표: Windows용 Tauri 2 + Vite React TypeScript 기본 앱과 Rust/Python 개발 구조, 품질 검사 기반 마련.
- 완료 날짜: 2026-10-13 (한국 시간).
- 상태: Phase 0 완료. Phase 1 이후는 진행하지 않음.
- 사전 확인: 루트/네이티브/Python AGENTS.md, README.md, docs/00~17의 모든 Markdown을 읽음. 최초 파일은 설계 문서뿐이며 Git 저장소가 없어 Git diff/커밋은 미실행.

## 2. 구현 및 변경 사항

- React 19.3.0, TypeScript 5.9.3 strict, Vite 6.4.4, Tailwind 4.3.3 구성. pnpm 9.14.3 및 직접 의존성 정확한 버전, pnpm/Cargo/Python 테스트 잠금 파일 추가.
- 기본 hash 탐색: 라이브러리, 설정, 잘못된 경로 안내. 브라우저 뒤로/앞으로를 지원하는 기본 hashchange 구독.
- 문서 02의 차콜 색상, 56px 상단, 224px 사이드바, 88px 하단, 최소 1100px 콘텐츠 및 1440×900 기본 창을 반영. 전체 디자인 시스템은 아직 구현하지 않음.
- EmptyState, 렌더 오류 경계/재시도, 전역 오류 및 Promise rejection의 고정 진단 코드 로깅. 앱 자체 진단은 콘솔/표준 오류 출력만 사용하며 파일 로그·회전·크래시 복구는 미구현. 오류 원문과 사용자 경로를 앱 로거에 전달하지 않음.
- 오디오/악보/AI/저장은 준비 중으로 명시하고 실제 기능 버튼은 비활성화. 모의 점수나 분석 결과는 표시하지 않음.
- Tauri 2.12.3, 최소 capability, CSP, 직접 생성한 임시 기본 아이콘 추가. 파일/shell/마이크 권한과 command는 없음.
- Rust 기능별 폴더와 Python 패키지/분석 모듈 폴더를 준비. 빈 폴더는 `.gitkeep`으로 보존하며 기능 구현을 의미하지 않음.
- Python은 모델 다운로드·분석 worker·Rust subprocess 없이 패키지 구조와 프로토콜 버전 상수만 준비.
- 기존 요구 문서와 세 AGENTS.md 보존. README, 범위 결정 로그, API 실제 상태, 개발환경 안내를 추가하고 Phase 0 체크만 완료 처리.

### 주요 변경 파일과 이유

| 파일/경로 | 이유 |
|---|---|
| package.json, pnpm-lock.yaml, .npmrc | 고정 의존성, 개발/검사 스크립트, 설치 스크립트 기본 차단 |
| index.html, tsconfig.json, vite.config.ts | 한국어 진입점, strict 타입, Vite/Tailwind/Vitest 설정 |
| eslint.config.js, .prettierrc.json, .prettierignore, .gitignore | 코드 품질 및 생성 산출물 제외 |
| src/main.tsx, src/app/* | 앱 시작, 탐색, 오류 경계, 렌더/경로/오류 테스트 |
| src/components/ui/EmptyState.tsx | 재사용 빈 상태 |
| src/features/library/LibraryPage.tsx, src/features/settings/SettingsPage.tsx | 기능 상태를 명확히 표시하는 기본 페이지 |
| src/shared/*, src/test/setup.ts | 디자인 토큰, 한국어 문자열, 진단 로거, 테스트 정리 |
| src-tauri/Cargo.toml, Cargo.lock, build.rs, tauri.conf.json | 네이티브 앱과 고정 Rust 의존성 |
| src-tauri/src/main.rs, lib.rs, ipc/mod.rs | 시작 오류 처리와 프로토콜 기반 구조 |
| src-tauri/capabilities/default.json, icons/icon.ico | 최소 권한과 임시 앱 아이콘 |
| ai/pyproject.toml, requirements-test.lock, guitarlab_ai/*, tests/test_structure.py | 모델 없는 Python 구조와 고정 테스트 환경 |
| fixtures/README.md | 자체 제작 fixture 정책 |
| docs/progress/PHASE-00-LICENSES.json | 설치된 npm 의존성의 라이선스 메타데이터 목록 |
| README.md, docs/00, 08, 12, 13, progress/* | 실행 방법, 환경 결정, 실제 완료 범위/검증 결과 |
| 기능별 .gitkeep | 루트 규칙에 명시된 향후 모듈 디렉터리 보존 |

## 3. 테스트 결과

| 명령/검증 | 결과 |
|---|---|
| pnpm install | 성공, 286개 패키지 설치; 설치 스크립트 차단 유지 |
| pnpm install --frozen-lockfile --offline | 성공, 잠금 파일 재현 설치 |
| pnpm typecheck | 성공 |
| pnpm lint | 성공, 경고 0 |
| pnpm test | 성공, 3개 테스트: 빈 상태/비활성 버튼, 설정/잘못된 경로, 렌더 오류 경계 |
| pnpm build | 성공, HTML/CSS/JS 생성 |
| pnpm format:check | 성공 |
| cargo fmt --check --manifest-path src-tauri/Cargo.toml | 성공 |
| cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings | 성공 |
| cargo test --locked --manifest-path src-tauri/Cargo.toml | 성공, Rust 기본 구조 테스트 1개 |
| ai/.venv/Scripts/python.exe -m pytest ai/tests | 성공, Python 기본 구조 테스트 1개 |
| pnpm tauri dev | 성공, MSVC 빌드와 guitarlab.exe 실행 |
| 개발 서버 HTTP 확인 | http://127.0.0.1:1420 응답 200 |
| Windows 실제 창 확인 | computer-use로 GuitarLab 창과 라이브러리 렌더 확인, 환경 설정 클릭 후 페이지 전환 확인 |
| pnpm licenses list --json | 성공, GPL/UNKNOWN/UNLICENSED 문자열 없음. 정식 배포 시 Rust/Python 전이 의존성 및 고지 파일 추가 검토 필요 |

### 발생한 오류와 해결

- 기본 샌드박스의 npm 조회는 `ENOTCACHED`, Vite/Vitest는 esbuild `spawn EPERM`으로 실패. 승인된 권한 범위에서 레지스트리 접근/필요 하위 프로세스 실행 후 성공. 운영 코드 변경이나 임의 설치 스크립트 실행으로 우회하지 않음.
- 기본 환경의 `pnpm exec prettier` 호출이 명령 탐색 실패. 승인된 실행 환경에서 같은 명령을 다시 실행하여 포맷 성공.
- 시스템 Python에는 pytest가 없어 `No module named pytest` 발생. 프로젝트 내부 `ai/.venv`를 생성하고 pytest 8.3.5 설치 후 성공.
- 초기 Rust 상수의 dead_code 경고는 ipc 모듈을 공개해 해결. Rust 1.98의 MSVC DLL import library 생성 출력은 `linker_messages` 경고로 남음. 테스트/앱 빌드는 성공하며 clippy 경고 검사도 통과. 해당 메시지를 숨기기 위한 allow 설정은 추가하지 않음.
- 설치 시 ESLint 9 지원 종료 및 whatwg-encoding 전이 의존성 deprecation 경고가 있음. 현재 Node 버전 호환성을 유지했고 향후 도구 업그레이드 과제로 기록.

### 미실행 검증

- Windows 설치 프로그램 생성/새 PC 설치: 미실행. Phase 8 범위이며 번들 비활성.
- 전체 해상도 1100×680/1920×1080, DPI, 접근성 수동 검사: 미실행. Phase 1에서 검증.
- 오디오 하드웨어/SQLite migration/AI 분석/JSONL 성공·실패·취소 계약: 미실행. 아직 구현하지 않은 기능.
- Git diff/커밋: 미실행. 최초 폴더에 Git 저장소 없음.

## 4. 미구현 및 알려진 문제

- 전체 모드 화면/라우팅, splitter, 단축키, 실제 악보·플레이어·오디오 입력·판정·녹음·SQLite·AI·sidecar·설치 패키지는 미구현.
- Python 3.10.8 검증은 모델 없는 구조 테스트에 한정. AI 구현 전에 3.11/3.12와 선택 모델 호환성을 확인해야 함.
- 현재 개발 도구는 설치 환경에 맞춘 버전이며 Node 업그레이드 후 지원 중인 Vite/ESLint로 전환 검토 필요.
- Rust/Python 테스트는 초기 구조 검사이며 분석·판정 정확도나 런타임 프로세스 연동을 증명하지 않음.
- 로그는 최소 진단 코드만 제공. 영구 로그와 실제 사용자 데이터 저장 정책은 후속 구현 필요.

## 5. 다음 작업 계획

1. 사용자 요청 후 Phase 1: 라이브러리/카피/연습/연주/결과/설정 전체 라우팅과 디자인 시스템.
2. 공통 패널·splitter·모드 전환·키보드 접근성 및 빈/오류 상태 확장.
3. 1100×680, 1440×900, 1920×1080 화면 검증. 데이터 프리뷰가 필요하면 DEMO 표시.
4. Node/개발 도구 업그레이드 및 지원 상태 검토. 분석·오디오·DB는 해당 Phase 전까지 연결하지 않음.

### 참고한 공식 문서

- [Vite 6 Node 지원](https://v6.vite.dev/blog/announcing-vite6)
- [Tailwind Vite 설치](https://tailwindcss.com/docs/installation/using-vite)
- [Tauri 2 Windows 준비](https://v2.tauri.app/start/prerequisites/)
- [Tauri 2 설정](https://v2.tauri.app/reference/config/)

버전/엔진/라이선스는 설치 전 npm registry 메타데이터 및 설치 후 package.json/잠금 파일로 확인했습니다.
