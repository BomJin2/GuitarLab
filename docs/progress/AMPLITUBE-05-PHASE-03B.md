# AmpliTube VST3 Integration — Phase 03B(프로젝트별 톤 저장)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 3의 "AmpliTube 플러그인 상태 binary 저장/복원 및 프로젝트 재열기".
- 사용자 결정(2026-11-07): **프로젝트별 저장**.

## 결론

- **PASS(자동)**: 저장소 검사(프로젝트별 왕복·덮어쓰기·다른 프로젝트 분리·8MiB 초과·빈 상태·잘못된 class ID·없는 프로젝트 거부·바이트 손상 시 SHA로 거부), 이전 DB(v2~v9)에서 11까지 migration과 기존 행 보존, 실제 AmpliTube 5.10.4에서 처리·편집 창이 도는 중 상태 10,254바이트 저장 → 같은 플러그인에 복원·다른 class ID 거부.
- **PASS(앱, 사용자 허가 "백업 후 진행")**: 실제 DB를 백업한 뒤 새 빌드를 실행해 10 → 11 migration(프로젝트 5개 유지), 편집 창에서 앰프를 Brit 9000으로 바꿔 프로젝트 "11"에 저장(10,254바이트, 28ms) → Brit Silver로 바꾼 뒤 불러오기(0.8초)로 Brit 9000 복귀, **앱 재시작 뒤** 화면의 "저장한 톤 불러오기" 버튼으로 Brit 9000 복귀(기본은 Brit 8000), 다른 프로젝트는 "저장한 톤 없음"·불러오기 꺼짐을 확인했습니다. 콘솔 오류 0.
- **NOT RUN(사람 확인)**: 귀로 들었을 때 불러온 톤이 저장한 소리와 같은지 → `MANUAL-CHECKS.md` 20번.

## 설계

- 새 표 `project_plugin_states`(프로젝트당 한 행, 011 migration, `user_version` 11). `vst3-host`의 `save_state`가 만든 봉투(component state + 있으면 controller state)를 그대로 저장하고, 형식 이름 `VST3_HOST_SNAPSHOT`·class ID·플러그인 버전·SHA-256을 같이 둡니다. 읽을 때 크기·SHA·형식이 하나라도 틀리면 플러그인에 넣지 않습니다.
- 꺼내기·넣기는 플러그인을 만든 소유 스레드에서 플러그인 잠금을 잡고 합니다(COM 스레드 규칙). 모니터가 처리 중이면 그동안 DSP는 무음 블록을 냅니다(03A와 같은 규칙, 지연은 늘지 않음).
- 자동 저장·자동 복원은 넣지 않았습니다. AmpliTube 인스턴스는 하나라서, 프로젝트를 바꿀 때 자동으로 덮으면 저장 안 한 톤 편집이 사라지기 때문입니다. 저장·불러오기는 버튼으로만 합니다.
- 프로젝트 영구 삭제 때 이 행도 지우고(삭제 표 목록 + FK cascade), 백업은 DB 전체와 함께 들어갑니다.

## 구현된 기능과 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md`, `docs/07-DATABASE-AND-FILES.md` | "프로젝트 AmpliTube 톤 v1", migration 011 설명 |
| `src-tauri/src/storage/migrations/011-plugin-states.sql`(새), `database.rs` | 표 추가, 허용 최대 버전 11 |
| `src-tauri/src/storage/plugin_states.rs`(새), `storage/mod.rs` | 요청 검사, 저장·읽기·무결성 검사, 요약 응답, 테스트 |
| `src-tauri/src/storage/project_purge.rs` | 영구 삭제 표 목록에 추가 |
| `src-tauri/src/plugins/mod.rs` | 소유 스레드 `SaveState`/`LoadState`, `save_state`/`restore_state`(class ID 확인) |
| `src-tauri/src/commands/plugin_api.rs`, `app.rs` | `get_/save_/restore_project_plugin_state` |
| 기존 migration 테스트 9곳, 백업 테스트 2곳 | 새 표 DROP·기대 버전 11(미래 버전 차단 fixture는 12) |
| `src/features/practice/monitorPlugin.ts`, `useMonitorPlugin.ts`, `InputMonitor.tsx`, `src/app/App.tsx` | 요약 검사·API 3개·오류 문구, "톤을 이 프로젝트에 저장"·"저장한 톤 불러오기" 버튼, 저장 여부 안내 |
| 테스트 | Rust: 저장소 1개, 서비스 거부 보강, 설치 플러그인 검사에 상태 왕복. TS: 요약 검사·명령 1개 |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --lib plugins -- --include-ignored` | PASS 3개(상태 10,254바이트 왕복, 다른 class ID `PLUGIN_STATE_MISMATCH`, 처리 부족 0프레임) |
| `pnpm verify:app` | PASS(프론트 856개, Rust 307개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| 실제 DB 백업 | `%APPDATA%\com.guitarlab.app.db10-backup-20261107\guitarlab.sqlite`(앱 데이터 폴더 밖, 앱이 꺼진 상태에서 복사, SHA-256 원본과 같음 `CACB3C55…`) |
| 디버그 앱(내장 화면 빌드) + CDP·Win32 클릭/캡처 | PASS: 로드 전 저장 `PLUGIN_NOT_READY`, 저장 없음 불러오기 `PLUGIN_STATE_NOT_FOUND`, 없는 프로젝트 `PROJECT_NOT_FOUND`, 위 앰프 전환 왕복·재시작 복원·프로젝트 분리 |
| 확인 뒤 정리 | 테스트로 저장한 프로젝트 "11"의 톤 행을 지움(앱 종료 후). 남은 변경은 빈 새 표와 `user_version` 11뿐이며, 기존 17개 표는 백업과 행 단위로 같고 `integrity_check` ok |

## 확인 중 발견

- 앱 메인 창이 최소화돼 있으면 .NET `Process.MainWindowHandle`이 GuitarLab 창 대신 보이지 않는 Tao 이벤트 창(`Tao Thread Event Target`)을 고릅니다. 그래서 `CloseMainWindow()`가 앱을 닫지 못했습니다(그 창에 닫기 메시지가 감). 이후 `FindWindow("Tauri Window","GuitarLab")`에 WM_CLOSE를 보내 0.5초에 정상 종료했습니다. `MANUAL-CHECKS` 11번("누가 숨은 창에 닫기 메시지를 보내는지 모름")의 원인 후보로 적어 둡니다(앱 버그가 아니라 바깥 도구의 창 선택 문제일 수 있음).

## 원본 DI 데이터 무결성

- 녹음·테이크·프로젝트 파일은 읽거나 쓰지 않습니다. migration은 새 표만 만들고 기존 행을 바꾸지 않습니다(이전 버전 migration 테스트가 행 동일을 확인).

## 미완성·제약·리스크

- **되돌리기 어려운 점**: 새 앱을 한 번 실행하면 DB가 11이 되어 이전 빌드(설치본 포함)는 "저장소 오류"로 열지 못합니다. 되돌리려면 이 표를 지우고 `user_version`을 10으로 내려야 합니다(앱 기능 없음). 앱의 백업 기능으로 먼저 백업해 두는 것을 권합니다.
- 상태 봉투는 `vst3-host` 0.11 형식입니다. 호스트 라이브러리를 바꾸면 변환이 필요할 수 있어 형식 이름을 같이 저장했습니다.
- 플러그인 버전이 달라도 복원을 시도합니다(받아들일지는 AmpliTube가 결정). 불러오는 동안 짧게 무음입니다.
- 저장하지 않은 편집은 해제·앱 종료·다른 톤 불러오기 때 사라집니다(확인 창 없음).

## 다음 단계와 재개 지점

- Phase 3 나머지: FX 랙 UI, 누락·라이선스 안내.
