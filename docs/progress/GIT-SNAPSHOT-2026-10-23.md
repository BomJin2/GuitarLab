# Git 초기 업로드 정리 — 2026-10-23

## 1. 작업 개요

- 목표: 지금까지 작성한 GuitarLab 소스·문서·테스트·재현용 잠금 파일을 정리해 사용자가 지정한 BomJin2/GuitarLab 저장소에 올립니다.
- 정리 날짜: 2026-10-23. 원격 브랜치/기존 로컬 커밋이 없는 초기 저장소임을 확인했습니다. 기존 원격 이력을 덮어쓰거나 force push하지 않습니다.
- 전체 상태: Phase0~5 기본 범위와2A/4A/4B 완료, Phase6/6A/6B/7/8 부분 진행입니다. 전체 완료/최종 배포본으로 표시하지 않습니다. 단계별 증거는 기존 PHASE 문서와 progress/README.md에 보존합니다.

## 2. 구현 및 변경 사항

| 영역 | 현재 구현 범위 |
|---|---|
| 앱/플레이어 | 모드별 라우팅, 공통 토큰, 로컬 악보/음원, 재생·배속·반복·3초 준비·수동 싱크 |
| 입력/판정 | 선택 입력 장치, 레벨·단음 튜너/onset, 보정·clock 진단, 단음 점수·장치 분리 보호 |
| 저장 | SQLite9·프로젝트/원본/불변 악보 버전·연습 기록, 보관/복원·백업·미저장 교체/종료 보호 |
| 녹음/믹스 | 명시적 REC만 입력 WAV 기록, 비파괴 복구, 다시 듣기/A-B·부분 반복·음량, 오버더빙·사용자 기타/stem 믹스·새 WAV 출력 |
| 악보 편집 | 기본6줄 단성 음표·마디/템포/튜닝·Undo/Redo·JSON/MusicXML·빈 악보/JSON 가져오기·선택적 자동 저장·트랙 추가/이름 변경 |
| 최신 편집 후속 | 실제 TAB 숫자 클릭·이전/다음·좌우/Home/End 선택, 반복 occurrence/재렌더·다른 트랙/잠금 보호. 저장과 분리된 임시 선택 상태 |
| AI/온라인 | 선택 모델 관리·로컬 Basic Pitch 초안/Demucs 전체 기타 분리·저장/다시 열기, 공식 YouTube URL 플레이어·수동 영상/TAB 맞춤 |
| 품질 | 압축 악보 해제32MiB/512항목·GPX 내부 경계/취소, 원문 라이선스/고정 source 안내, 격리 실행/검증 ZIP·내부 설치 검증 도구 |

주요 폴더는 src/(프론트/도메인), src-tauri/(네이티브), ai/(배치 worker/모델 어댑터), scripts/(자체 검사·백업/패키징), docs/(요구사항/계약·진행/고지)입니다. pnpm-lock.yaml/Cargo.lock·모델별 설치 계획/지문은 재현용으로 포함하고 설치 환경/가중치는 포함하지 않습니다.

최신 TAB 후속은 scoreNoteSelection.ts·useScoreEditing.ts·ScoreViewport/ScoreEditor/ScoreWorkspace와 관련4개 회귀 파일, docs/04·08·09·12·PHASE-05에 기록합니다. 이번 정리는 README 최신 요약·진행 문서·.gitignore의 .env.* 제외를 추가하며 기존 개발 이력은 삭제하지 않습니다. .gitattributes는 고지 원문/자산·원본 fixture·재현 잠금 파일에 줄바꿈 변환을 적용하지 않아 원래 지문을 유지합니다.

## 3. 테스트 결과

- 업로드 대상 사전 확인: 777파일/12,688,351바이트(이번 정리 문서 추가 전). 알려진 개인 내보내기3개·가상환경·target/dist·외부 평가 데이터는 git check-ignore로 제외를 확인했습니다. 일반 개인키/GitHub/Google/AWS 토큰 패턴 검출0건이며 이는 모든 비밀 형식에 대한 보증은 아닙니다.
- 직전 최신 소스: 프론트410개/98파일·타입/lint/포맷 성공. 실제 개발 브라우저의 TAB 두 번째 숫자 선택→목록/프렛/커서 연동, Right→다음·End→마지막·Home→처음 동작을 확인했습니다. 이 결과를 Windows 네이티브 수동 수용으로 표시하지 않습니다.
- `pnpm verify:app`: 타입·ESLint·프론트410개/98파일(29.96초)·빌드(Vite1분6초)·Prettier·cargo fmt·기본 Clippy는 성공했으나 마지막 sandbox Rust 검사에서 hardlink 권한 오류로151개 성공/77개 실패/26개 제외, 전체 명령은 exit101이었습니다. 이를 전체 성공으로 기록하지 않습니다.
- `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml`: 작업 폴더의 새 TEMP/TMP·허용된 별도 실행으로 **231개 성공/0실패·26개 제외**, 실행11.53초/컴파일18.78초. 내장 번들3개를 포함하며 실제 장치·개발 설치/공개 음원 자료가 필요한 명시적 ignored 검사는 이번에 실행하지 않았습니다.
- `cargo clippy --locked --offline --all-targets --all-features --manifest-path src-tauri/Cargo.toml -- -D warnings`: **성공7.37초**. incremental hardlink 실패 후 복사·MSVC importlib·Vite 청크 크기 안내는 기존 환경/크기 경고로 남아 있습니다.
- Python 기본 sandbox 검사: 111개 중97개 성공/14개 실패. scripts66개 중 오류10개/링크 권한1개 제외. 실패는 sandbox 임시 폴더의 os.replace/os.link WinError5였습니다. 테스트 예외를 완화하지 않고 작업 폴더 안 새 임시 경로·허용된 별도 실행으로 재검사해 pytest111개/2.25초 성공, scripts66개 중65개/3.351초 성공·심볼릭 링크 권한1개 제외를 확인했습니다.

## 4. 미구현 및 알려진 문제

- 새 TAB 선택 기능의 Windows 고정 후보 빌드/사용자 조작·최신 독립 ZIP/설치기 검사는 미완료입니다. 직전 압축 보호 앱의 실행/보존 결과를 새 소스에 소급하지 않습니다. 이번 요청에서는 앱을 종료하거나 재실행하지 않습니다.
- 별도 깨끗한 Windows/실제 주법 정답·연속 음정 품질과 특화 분리 가중치 조건은 미확보/미검증입니다. 해당 항목만 보류하고 독립 개발은 이어갈 수 있습니다.
- 고급 실시간 채점·특화 리드/리듬 AI·서명/최종배포·실제 데이터 교체/영구 삭제는 미완료입니다. YouTube API 검색은 사용자 결정으로 보류하고 URL 입력을 사용합니다.
- Git 저장소에는 모델/설치 runtime·가상환경·개인 녹음/내보내기/DB·작업 target의 검증 영수증을 포함하지 않습니다. 일부 개발 검증 명령은 로컬에서 따로 생성한 runtime/후보가 있어야 실행 가능합니다.

## 5. 다음 작업 계획

현재 정리본은 빈 main의 초기 커밋과 origin 일반 push로 보존합니다. 강제 push/기존 이력 삭제·새 릴리스 배포는 하지 않습니다. 정확한 커밋 SHA/서버 반영 여부는 로컬 git log와 GitHub main의 기록으로 확인하며 이 문서 안에 자신의 커밋 SHA를 미리 기입하지 않습니다.

그다음 같은 소스의 Windows TAB 선택 후보를 적용·검증합니다. 기존 원본/DB·모델·녹음을 보존하고 실제 수용 대기와 독립적인 기능을 계속합니다. 재개 시 progress/README.md와 PHASE-05 최신 절을 먼저 확인합니다.
