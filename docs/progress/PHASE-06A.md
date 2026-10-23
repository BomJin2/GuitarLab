# Phase 6A — 반주 찾기

## 작업 개요

- 작업일:2026-10-19. 전체 상태: **진행 중**. 이번 목표는 docs/14에서 허용한 URL 직접 입력→공식 표시 임베드의 첫 수직 슬라이스입니다.
- Phase 6의 별도 Windows 배포 검사는 장비 부재로 보류했습니다. 이 검증과 독립적인 기능을 자동 진행 규칙에 따라 시작하며 앞 Phase 전체를 완료로 표시하지 않습니다.
- API 키/보호 프록시가 없으므로 검색을 흉내 내거나 클라이언트에 키를 넣지 않습니다. 검색·프로젝트 저장·수동 앵커/악보 싱크는 이번 슬라이스에 포함하지 않습니다.

## 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`: 구현 전에 URL/동의/원격 격리/표시 수명/제한을 정의했습니다. DB·Tauri command·Python/JSONL v1은 변경하지 않습니다.
- `src/features/backing/youtube.ts`: HTTPS 정확한 허용 호스트·지원 경로/11자 ID 검증, 중복 v/제어 문자/자격 증명/비표준 포트/과대 입력 거부, ID 외 공유 쿼리·fragment를 버리는 정규화를 구현했습니다. capability는 BEST_EFFORT/분석·정밀 반복·타임스트레치·반주 녹음 불가입니다.
- `useYoutubeEmbed.ts`: 동의 전 외부 요청 없음, 로컬 PlayerEngine pause 후 표시, 녹음 잠금/화면 이탈·숨김/표시 영역 이탈·오프라인/네이티브 창 비활성화 시 제거, 재동의/명시적 재열기,15초 연결 경고, 늦은 listener 안전 해제를 분리했습니다. 표시 감시 기능이 없는 환경은 재생을 막습니다.
- `BackingPage.tsx`: 최소 URL·동의·열기/닫기·연결 상태·공식 플레이어·로컬 복귀를 제공합니다. 사용자 ID/시청 콘텐츠는 파일·AI·녹음·믹스 서비스로 넘기지 않습니다. iframe onLoad를 재생 성공으로 주장하지 않습니다. 플레이어의 오류 안내를 그대로 확인할 수 있습니다.
- `src/app/App.tsx`·`AppShell.tsx`: 기존 반주 placeholder를 연결하고 해당 화면의 로컬 transport를 제거했습니다. 입력 분석/기존 녹음 상태는 유지하며 새 REC를 제공하지 않습니다.
- `src/shared/styles.css`·`logger.ts`: 플레이어 최소 크기/최대 너비 공통 토큰과 고정 진단 코드를 추가했습니다. 기존 화면 디자인은 재작성하지 않았습니다.
- `src-tauri/tauri.conf.json`·`src/lib.rs`: CSP의 frame-src만 정확한 YouTube 호스트로 확장했습니다. 외부 스크립트·connect-src·원격 IPC 권한은 확대하지 않았습니다. 새 번들 정책 검사를 추가했습니다.

## 테스트 결과

- 첫 대상 Vitest: **실패2개**, alphaTab의 불완전 IntersectionObserver 대체 구현에 disconnect가 없었고 iframe의 React error 핸들러가 native error 이벤트를 받지 못했습니다. 실제 표시 감시 지원 검사/미지원 안내와 DOM onerror 연결로 수정했습니다.
- 수정 후 `pnpm exec vitest run src/features/backing src/app/App.test.tsx`: **성공35개/3.80초**(기존 앱5개 포함). URL24개·동의/실패/REC/오프라인/표시 밖/화면 이탈/타임아웃/창 비활성화·listener 실패/지연 해제·앱 transport 분리를 확인했습니다. 네트워크나 실제 동영상 다운로드를 수행한 검사는 아닙니다.
- 타입 검사: **성공**. ESLint의 no-control-regex 오류1개는 제어 문자 검사식을 문자 코드 비교로 바꿔 해결했습니다. 최종 전체 회귀는 아래 갱신 결과를 따릅니다.
- Python: **미실행**, 이번 슬라이스는 Python/AI 소스·계약을 변경하지 않았습니다. 직전 Phase 6의111개 성공을 유지합니다.
- 실제 Windows YouTube 재생/Referer·153/비공개/임베드 제한 및 네트워크 장애: **미실행**. DOM 단위 검사를 실서비스 재생 성공으로 기록하지 않습니다.

## 미구현 및 알려진 문제

- 공식 수동 iframe만 제공하며 JavaScript IFrame Player API 시계/상태 이벤트·검색 Data API/쿼터 보호·프로젝트 선택 영구 저장·수동 앵커·TAB 커서는 미구현입니다. Phase 6A 로드맵 복합 항목은 미완료를 유지합니다.
- WebView의 Referer/클라이언트 식별에 따라153 오류가 발생할 수 있습니다. 자동 iframe 문서 load만으로 비공개/임베드 제한·재생 가능 여부를 판단할 수 없습니다. 오류는 우회하지 않고 로컬 반주로 복귀합니다. 실제 서비스 수용 전 완성된 반주 재생 기능으로 주장하지 않습니다.
- URL 선택은 메모리에서만 유지하며 화면 이탈 시 사라집니다. 온라인 재생 중 REC/정밀 채점·로컬 반주 합성은 제공하지 않습니다.
- 숨김/화면 밖 종료는 브라우저/네이티브 이벤트 기반입니다. 실제 WebView 창 최소화·외부 창 전환/네트워크 복구 수동 검증은 미실행입니다.

## 다음 작업 계획

1. 최종 회귀/내장 CSP·원격 권한 검사와 Windows 실행 후보를 검증하고 실제 URL 재생 수용을 확인합니다.
2. 공식 API 식별/격리된 제어 어댑터·실제 오류/상태를 검증합니다. 영상 내용을 읽거나 다운로드하지 않습니다.
3. 선택 메타데이터 영구 저장과 BEST_EFFORT 수동 싱크를 별도 계약/마이그레이션·회귀로 추가합니다. 검색은 키 보호/쿼터 방안이 마련된 뒤 구현합니다.

공식 자료: [임베드 파라미터](https://developers.google.com/youtube/player_parameters), [IFrame API](https://developers.google.com/youtube/iframe_api_reference), [최소 기능/클라이언트 식별](https://developers.google.com/youtube/terms/required-minimum-functionality), [개발자 정책](https://developers.google.com/youtube/terms/developer-policies).

## 최종 회귀 갱신 — 2026-10-19

- `pnpm verify:app`: **최종 성공**. 타입/ESLint·프론트248개·production build·Prettier·cargo fmt/표준 Clippy·Rust142개(환경 의존16개 제외)·binary/doc-tests를 통과했습니다. 최초 샌드박스 실행은 파일 관련45개가 STORAGE_ERROR로 실패했고, 격리 fixture만 사용하는 동일 검사 권한 확대 재실행142개/6.00초 및 최종 전체 명령142개/5.63초로 해결했습니다. 이를 제품 저장 실패로 우회하거나 검사 코드를 약화하지 않았습니다.
- 확장 `cargo clippy --all-targets --all-features -- -D warnings`: **성공6.96초**. 파일시스템 증분 캐시 hard link 실패→복사 대체 경고는 남았으며 Rust 오류는 없습니다.
- `cargo test --features custom-protocol --lib bundle_tests`: **성공3개/0.11초**(컴파일10.79초). 내장 index/script/자체 fixture 허용 목록·YouTube 원격 origin의 event IPC 거부·정확한 frame-src/기존 connect-src를 확인했습니다.
- 첫 native Windows 후보 빌드: **성공14.44초**. 이후 listener 오류 안내의 입력 변경 후 유지·제거 iframe의 native 오류 핸들러 정리를 보완했고 위 전체 회귀를 다시 통과했습니다. 플레이어와 표시 감시 영역을 정확히 일치시키는 CSS 크기 수정 후 최종 UI/실행 파일을 재빌드합니다.
- Vite 큰 chunk 경고와 macOS용 .app identifier 권고는 남아 있습니다. Windows 대상의 기존 식별자/악보 엔진을 이번 기능 때문에 변경하지 않았습니다.
- iframe 문서 요청/네이티브 error 이벤트의 단위 검증은 실제 네트워크 오류 검출/YouTube 서비스 재생 성공을 뜻하지 않습니다. 최종 실행 후보 반영과 실제 재생 수용은 아직 대기이며 앱을 열 때 영상·입력·녹음을 자동 시작하지 않습니다.

## 최종 실행 후보 — 2026-10-19

최종 전체 verify:app의 프론트248개/11.65초·빌드17.13초·Rust142개/5.63초 성공 뒤 표시 영역과 iframe 크기를 일치시키는 CSS를 보완했습니다. CSS 포맷 검사와 `pnpm build` **성공23.96초**, 최신 bundle_tests **성공3개/0.00초**(컴파일6.75초), `pnpm tauri build --debug --no-bundle --config …backing-d0922fbf…conf.json` **성공9.55초**입니다. 기존 AI 고정 리소스3393개/64,095,996바이트의 원본·복사본 전체 SHA와 새 exe 바이트 일치도 확인했습니다. 개발 경로를 제외한 기존 release 점검 도구의 새 폴더 inspect도 Python3.12.15/기본 모델2개 응답으로 통과했습니다. 모델 설치를 다시 실행하지 않았습니다.

제한된 프로세스 조회에는 이전 앱이 나오지 않았지만 권한 밖 조회에서 PID4392/정확한 release 후보 경로/응답 정상을 확인했습니다. 종료로 판단했던 기록을 정정했고, 사용자 허용 범위의 CloseMainWindow·5초 종료 확인으로만 정상 종료한 뒤 새 **PID12140**를 열었습니다. 강제 종료/녹음 차단 우회는 하지 않았습니다.

새 후보는 `src-tauri/target/runtime-validation/portable/d0922fbf-9d92-4ca6-ab27-95fef25845c6/GuitarLab.exe`이며26,258,432바이트입니다. 기존 release 검증 ZIP/이전 후보는 보존했습니다. `backing-candidate.json`의 manualYoutubePlaybackValidated는 false입니다. **실제 영상 재생/서비스 오류·창 전환의 수동 수용은 미실행**이며 사용자 확인 대기입니다. 확인 중 소스 반영/후속 앱 재실행은 하지 않습니다.

## 실제 영상·소리 수용 및 연결 조작 간소화 — 2026-10-19

### 작업 개요

사용자가 기존 Windows 후보에서 ‘영상 소리 정상’을 확인했습니다. URL 직접 임베드의 실제 재생을 수용 완료로 기록합니다. 사용자가 동의 체크의 이유를 질문해, 안내/명시적 연결 의사를 유지하며 별도 체크박스를 열기 버튼 클릭과 합치는 작은 개선을 진행했습니다. Phase 6A 전체는 검색/저장/수동 싱크가 남아 진행 중입니다.

### 구현 및 변경 사항

- `useYoutubeEmbed.ts`: 별도 consent 상태/체크 해제·재체크 로직을 제거했습니다. 화면 진입·URL 입력·숨김에서 돌아옴만으로 iframe을 만들지 않으며 매번 열기 클릭을 기다립니다. 네이티브 상태 감시/REC/표시 영역/오프라인 검사는 유지합니다.
- `BackingPage.tsx`: ‘안내에 동의하고 YouTube 열기’ 한 번으로 연결하고 바로 앞의 전달 정보 안내, 펼칠 수 있는 개인정보 설명, 기존 공식 약관/개인정보 링크를 제공합니다. 사용자 오디오/악보/녹음 업로드 동의와 구분합니다. YouTube가 반드시 체크박스라는 UI 형태를 정했다고 설명하지 않습니다.
- `BackingPage.test.tsx`: 체크박스 부재·URL 입력만으로 연결 없음·명시적 버튼 뒤에만 연결·오류/숨김/재열기·REC 잠금의 회귀를 수정했습니다.
- `docs/12`의 버튼 계약을 먼저 갱신했습니다. native command/DB/Python·모델 설치/다운로드 동의는 변경하지 않았습니다.

### 테스트 결과

- 기존 후보의 실제 Windows 동영상·소리 재생: **성공**, 사용자 응답 ‘영상 소리 정상’입니다. 모든 동영상/광고·비공개/153 오류·네트워크 단절/창 최소화까지 검증했다는 뜻은 아닙니다.
- 수정 후 `pnpm exec vitest run src/features/backing src/app/App.test.tsx`: **성공35개/3.69초**. 실제 네트워크 요청 없이 앱 동작을 검증했습니다.
- 타입/ESLint·production build **성공26.95초**, Prettier 전체 검사 **성공**, Windows native 컴파일 **성공12.90초**입니다. Rust/Python 전체 회귀는 **미실행**(native/Python·IPC 변경 없음), 직전142개/111개 성공을 유지합니다.

### 미구현 및 알려진 문제

새 버튼 UI의 실제 Windows 수동 조작은 **미실행**입니다. 사용자가 수용한 재생 후보는 그대로 두고, 현재 창을 종료/재시작하지 않습니다. URL 직접 열기의 수용 성공을 검색/메타데이터 저장/수동 싱크 전체 완료로 확대하지 않습니다. 별도 Windows 배포 검증도 미실행 상태를 유지합니다.

### 다음 작업 계획

다음 native 후보 적용 때 이 버튼 개선을 함께 반영합니다. 이후 선택 메타데이터 영구 저장·격리된 공식 제어 API/실제 오류 상태 및 BEST_EFFORT 싱크를 별도 슬라이스로 이어갑니다.

최종 산출물은 `src-tauri/target/debug/guitarlab.exe`입니다. 이번에는 실행 중인 독립 후보를 교체하지 않았으므로 새 버튼 UI는 현재 창에 아직 적용되지 않았습니다. 다음 후보 반영 전 기존 `backing-candidate.json`의 수용 exe와 이 새 산출물을 구분하고 리소스 검증·새 복사본을 준비합니다. 이번 변경에서 새 실패는 없었으며 기존 Vite 큰 chunk/macOS identifier·MSVC 링크 안내는 남습니다.

## 프로젝트별 YouTube 영상 ID 저장 — 2026-10-19

### 작업 개요

Phase 6A의 선택 메타데이터 저장/복원 수직 슬라이스를 구현했습니다. 작업일은2026-10-19이며 자동 검증을 완료했습니다. 새 native 후보 적용/실제 사용자 저장 조작은 아직 미실행입니다. 영상·음성을 저장하거나 원래 로컬 반주를 바꾸지 않습니다. Phase 6A 전체는 계속 진행 중입니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`에 v1 ProjectBacking/명시적 null 해제·취소 경계/늦은 응답 폐기 계약을 먼저 정의했습니다. `docs/07`에도 추가 migration 계획을 기록했습니다.
- `src-tauri/src/storage/migrations/006-project-backings.sql`·`database.rs`: SQLite v6의 프로젝트당1개 영상 ID·종류/직접 선택/선택 시각과 FK/ASCII11자 제약을 추가했습니다. 기존001~005는 수정하지 않습니다. 원본 URL/추적 쿼리·영상/음성/연결 동의를 보존하지 않습니다.
- `storage/backing.rs`·`mod.rs`: 프로젝트 소유/UUID·엄격한 종류·선택 값 검증, transaction/upsert/명시적 삭제·커밋 전 취소/오류 보존·손상 행 재검증을 구현했습니다. `projects.rs`의 기존 프로젝트 검증을 재사용하도록 summary의 crate 범위 접근만 열었습니다.
- `commands/backing_api.rs`·`commands/mod.rs`·`app.rs`: get_project_backing/save_backing_selection을 기존 StorageJobs/취소·spawn_blocking 경로에 등록했습니다. 저장은 녹음 중 거부하며 임의 경로/외부 네트워크 인자를 받지 않습니다.
- `features/backing/projectBacking.ts`·`useProjectBacking.ts`: 정확한 필드/프로젝트/저장 선택 일치·진행/취소·화면 이탈/프로젝트 전환/REC 잠금·늦은 응답 폐기를 분리했습니다. cancel 후 native 종료까지 진행 잠금을 유지하고 늦은 취소를 롤백으로 표현하지 않습니다.
- `BackingPage.tsx`·`App.tsx`: 현재 프로젝트에 영상 주소 저장/다시 읽기/삭제/취소를 연결했습니다. 읽기는 입력칸만 복원하고 실제 연결은 새로 명시적 열기를 눌러야 합니다. 직접 URL 입력 시 이전 조회는 취소합니다. 프로젝트 변경은 화면 scope를 새로 만들어 이전 선택/플레이어를 제거합니다.
- 새 frontend/Rust 검사를 추가하고 기존 migration 검사 fixture를 새 버전에 맞췄습니다. 예전 v2/v3/v4 재현 시 새006 테이블도 제거하고 최종 v6를 기대하도록 변경했으며 향후 버전 거부는7로 옮겼습니다. 기존 데이터 보존 조건은 유지했습니다.

### 테스트 결과

- 새 native SQLite 저장/재열기/프로젝트 격리·삭제/취소·위조/누락/실패·v5→v6/제약/계약 검사: **성공4개/0.36초**(최초 컴파일26.23초). 실제 임시 DB/자체 fixture를 사용하며 네트워크 요청은 없습니다.
- 프론트 대상 `pnpm exec vitest run src/features/backing src/app/App.test.tsx`: **성공43개/4.08초**. 복원/저장만으로 iframe 생성 안 됨·취소/늦은 응답·프로젝트 전환/REC/화면 종료·엄격한 응답을 확인했습니다.
- 첫 `pnpm verify:app`: **실패**, 테스트 initialProps.projectId가 undefined만 허용하도록 좁게 추론된 TS2322 두 건입니다. 테스트 초기 객체의 명시적 union 타입으로 고쳤고 제품 타입을 any로 우회하지 않았습니다.
- 최종 `pnpm verify:app`: **성공**. 프론트256개/12.53초·타입/ESLint·production build17.70초·Prettier·cargo fmt/표준 Clippy5.19초·Rust147개/5.91초(환경 의존16개 기본 제외)·binary/doc-tests를 통과했습니다. 기존 녹음·믹스·악보/AI migration·원본 보존도 포함합니다.
- 확장 Clippy/내장 UI·CSP·Windows 후보 적용은 후속 실행 중입니다. Python 전체는 **미실행**(Python/AI·JSONL 변경 없음), 직전111개 성공을 유지합니다.

### 미구현 및 알려진 문제

현재 실행 앱은 이전 수용 후보로 SQLite v5를 사용하며 새 저장 명령/버튼은 미반영입니다. v6 적용 후에는 이전 v5 전용 실행 파일로 DB를 열 수 없으므로 정상 종료·백업/마이그레이션 확인 후 새 후보를 사용합니다. 커밋 이후 취소는 저장이 반영될 수 있으며 다시 읽기로 확인합니다. 영상 제목/채널·검색어는 직접 URL 모드에서 자동 수집하지 않습니다. API 검색·시계/수동 앵커/악보 싱크·정밀 채점은 미구현입니다.

### 다음 작업 계획

검증된 새 Windows 후보를 준비하고 이전 후보 정상 종료→DB 백업→v6 실제 적용/기존 테이블 보존을 확인합니다. 이후 공식 IFrame Player API를 앱 권한과 분리하는 제어 어댑터를 검토·구현하며, 외부 script를 권한 있는 main origin에 직접 추가하지 않습니다. 별도 Windows 검증 보류도 유지합니다.

## 저장 후보 실제 적용/데이터 보존 — 2026-10-19

최종 확장 `cargo clippy --locked --all-targets --all-features -- -D warnings` 성공(9.07초), custom-protocol 번들3개 성공, Windows 후보 빌드27.73초 성공입니다. 고정 runtime3393개 파일의 경로/크기/SHA와 복사본/실행 파일의 동일성을 확인했습니다. 기존 앱을 정상 종료하고 SQLite stdlib backup으로 실제 v5 DB를 workspace target/backups의 새 UUID 폴더에 보존한 뒤 새 후보를 실행했습니다. PID19176/Responding=true·제품 화면 제목을 확인했습니다.

실제 DB는 v6로 전환됐고 이전12개 테이블의 행 수/내용 SHA가 모두 동일합니다. 새 project_backings만 추가됐으며 모델 활성 marker4개도 동일합니다. 결과는 target/runtime-validation/backing-db-before.json·backing-db-after.json·backing-storage-candidate.json에 남겼습니다. 이전 v5 전용 앱은 새 DB에 사용하지 않습니다. 자동 승인 검토의 사용량 오류로 첫 실행 시도는 수행되지 않았고, 사용자 재개 뒤 같은 승인 절차로 정상 적용했습니다.

실제 사용자의 영상 ID 저장/삭제 조작은 **미실행**이며 자동 검사와 구분합니다. Python은 변경 없어 전체 재실행하지 않았습니다. API 검색/수동 앵커·악보 싱크는 미구현입니다. 다음 작업은 권한 있는 main에 외부 script를 넣지 않는 공식 IFrame API 상태/시간 어댑터입니다. Phase 6A 전체는 진행 중입니다.

## 공식 IFrame API 격리 관측 후보 — 2026-10-19

### 작업 개요

Phase 6A의 재생 상태/시간 관측 수직 슬라이스입니다. 공식 API를 앱 권한과 분리하고 사용자 선택 검증 모드로 제공합니다. 작업일2026-10-19, 전체 Phase는 진행 중입니다. 실제 서비스/WebView 시계 수용은 미실행이며 기존 수동 플레이어의 실제 재생 수용과 구분합니다.

### 구현 및 변경 사항

- docs/12의 v1 세션/메시지 계약과 docs/00의 origin 격리 결정을 먼저 정의했습니다. docs/09/10에 검증·보안 경계를 추가했습니다. DB/AI/JSONL은 변경하지 않습니다.
- src-tauri/src/backing/mod.rs·player.html·player.js: 표준 라이브러리의127.0.0.1 임시 listener가 세션별 고정 HTML/JS만 제공합니다. 정확한 Host/GET/경로·8KiB/1초 요청 제한·no-store/no CORS·종료/Drop 해제를 적용했습니다. wrapper만 공식 iframe_api를 로드하고 ready/state/error/currentTime/duration/rate를 관측합니다. 임의 파일/음원/URL 프록시와 IPC는 없습니다.
- commands/youtube_api.rs·commands/mod.rs·app.rs·lib.rs: 엄격한 open/close 계약·REC 거부·세션1개·ID가 같은 세션만 닫기·blocking worker를 연결했습니다. tauri.conf.json은 frame-src에 loopback 임시 포트만 추가하며 main의 원격 script/connect·native 권한은 그대로입니다.
- features/backing/youtubePlayer.ts·useYoutubePlayer.ts: 세션/메시지의 정확한 필드·source/origin/ID/sequence·유한 범위 검증, 준비 timeout15초·관측 지연3초·늦은 응답 정리·화면 수명 해제를 분리했습니다. 시간은 API 원자료이며 보간/채점/REC 연결이 없습니다.
- BackingPage.tsx·useYoutubeEmbed.ts: ‘재생 상태·시간 확인 (검증)’ 선택과 최소 상태/시간/오류 표시를 연결하고 수동 임베드를 유지합니다. URL 입력/복원·검증 선택만으로 접속하지 않으며 기존 명시적 열기/화면 밖/숨김/blur/오프라인/REC 종료를 따릅니다. API 모드에는 기존 단순 document-load timer를 중복 적용하지 않습니다.
- 테스트: native backing/tests.rs의 계약/라우트/실제 로컬 서버·느린 요청 종료, frontend youtubePlayer/useYoutubePlayer/youtubeWrapper 및 BackingPage 통합 검사, bundle remote ACL/CSP 검사를 추가했습니다. src/vite-env.d.ts는 Vite raw import 타입, shared/logger.ts는 고정 종료 실패 코드를 추가합니다. 외부 script를 실제 실행하는 검사가 아닌 자체 stub 검사입니다.

### 테스트 결과

- 대상 frontend48개/3.50초 성공, 타입/ESLint 성공. 실제 로컬 listener 첫2개 검사도 성공했습니다.
- 최종 pnpm verify:app 성공: frontend267개/12.87초·타입/린트·production build·Prettier·cargo fmt/표준 Clippy·Rust150개/6.18초(환경 의존16개 제외)·binary/doc-tests 통과.
- 초기 실패: 미등록 진단 코드 타입·Node fs/vm 타입 및 jsdom URL scheme 가정, prefer-const lint를 확인했습니다. 고정 진단 union과 Vite raw import/자체 wrapper stub 실행으로 변경해 새 의존성 없이 해결했습니다. 테스트 fixture의 외부 접속은 없습니다.
- 확장 Clippy/내장 CSP/권한·Windows 적용은 후속 실행 중입니다. Python 전체는 **미실행**(변경 없음, 직전111개 성공 유지). 실제 서비스 재생/시계/일시정지·seek/배속/오프라인/광고 영향과 새 저장 UI 수용도 **미실행**입니다.

### 미구현 및 알려진 문제

API 검색은 키/보호 서버 결정이 없어 미구현입니다. 수동 앵커·악보 커서 싱크·정밀 채점은 미구현이며 API 관측은 BEST_EFFORT입니다. 실제 Windows에서 script/CSP/앱 식별 오류가 있을 수 있으므로 검증 선택을 끄고 기존 수동 플레이어 또는 로컬 반주를 사용할 수 있습니다. 인터넷이 필요하고 공식 플레이어의 광고/임베드 제한을 우회하지 않습니다. 별도 Windows 배포 검증 보류도 유지합니다.

### 다음 작업 계획

확장 검사·새 Windows 후보 빌드/정상 앱 전환·리소스/DB 보존 확인 후 실제 API 관측 재생을 검증합니다. 이를 통과한 뒤에만 공식 관측 시간에 대한 수동 싱크 앵커와 비점수 TAB 표시를 다음 수직 슬라이스로 진행합니다. 실제 서비스 결과에 따라 정책/보안을 유지한 수정 또는 수동 폴백을 기록합니다. Phase 6A를 완료로 표시하지 않습니다.

### API 관측 확장 검증 갱신

`cargo clippy --locked --all-targets --all-features -- -D warnings` 성공9.82초, `cargo test --locked --features custom-protocol bundle_tests -- --nocapture` 성공3개(컴파일29.83초)입니다. YouTube/loopback remote의 앱·event 명령 권한 거부, main의 script/connect 제한과 frame-src만 좁게 확장, 실제 내장 index/script/허용된 자체 fixture만 포함함을 확인했습니다. test harness의 기본 icon resource 안내와 기존 MSVC linker 안내는 남지만 검사 실패는 없습니다. 최종 verify:app production build20.77초·표준 Clippy6.59초도 성공했습니다. Windows 빌드/실제 API 서비스는 후속이며 Python 전체는 변경 없어 미실행입니다.

### API 관측 Windows 후보 적용 — 2026-10-19

Windows 후보 빌드29.63초 성공입니다. 고정 runtime3393개/64,095,996바이트의 source/복사본 파일 목록·전체 SHA를 확인했고 실행 파일26,612,736바이트/SHA ddf9dfe26a112fa0b6f1fd4de1b8dbedccecc92c12d57e27b48a199b89094bc0의 복사 동일성을 확인했습니다. 기존PID19176을 정상 종료하고 실제v6 DB를 새 UUID 폴더에 백업한 뒤 독립 후보PID31444/Responding=true·‘GuitarLab · YouTube 상태 검증 후보’ 제목을 확인했습니다. 강제 종료는 하지 않았습니다.

재실행 후 실제13개 테이블의 행 수/내용 SHA와 모델 활성 marker4개가 모두 동일하며 새 migration/모델 설치/재다운로드는 없습니다. `youtube-api-db-before.json`·`youtube-api-db-after.json`·`youtube-api-candidate.json`·`portable-candidate.json`에 결과/정확한 실행 경로를 기록했습니다. 기존 후보/백업/ZIP은 보존합니다.

사용자에게 공식 검증 모드의 실제 영상 재생/초 숫자/일시정지 상태 확인을 요청했습니다. 이 실제 서비스 수용·영상 ID 저장 UI 수용은 아직 **미실행**이며 자동 stub/로컬 서버 검사와 구분합니다. 확인 중 현재 앱은 재실행하지 않습니다. 검색 키/보호 서버·수동 앵커·TAB 싱크/정밀 채점과 별도 Windows 배포 검증은 남아 있으며 Phase 6/6A 전체는 미완료입니다.

## 창 전환 시 영상 보존 수정 — 2026-10-19

### 작업 개요

사용자가 열기 버튼이 동작한다고 정정한 뒤 다른 창 전환 때 영상이 사라진다고 보고했습니다. 코드의 native blur 즉시 제거가 원인이며 API 경로에서는 영상/위치를 보존하고 공식 일시정지만 요청하도록 수정했습니다. 전체 Phase 6A는 진행 중이고 실제 API 시계/새 중지 동작의 사용자 수용은 미실행입니다.

### 구현 및 변경 사항

- docs/12/00에 중지 요청/확인·1.5초 timeout·수동 폴백·자동 재개 금지 계약/결정을 먼저 추가했습니다.
- useYoutubeEmbed.ts: API 모드의 창 blur/문서 숨김/표시 밖에서 pauseRequest를 전달하고 선택 영상을 유지합니다. 새 열기/닫기에서는 이전 요청을 초기화하고 비활성 상태의 observer는 중지 요청을 만들지 않습니다. 수동 임베드·URL 변경/페이지 이탈/오프라인/REC의 종료는 유지합니다.
- useYoutubePlayer.ts·youtubePlayer.ts: 소유 wrapper에 PAUSE를 전달하고 정확한 source/origin/세션/영상/최신 requestId·정확한5필드의 PAUSED를 검증합니다. 1.5초 확인 timeout이면 frame/native 세션을 닫고 사유를 표시합니다. 중복 요청은 이전 timer를 해제하며 이탈/실패에서도 timer를 정리합니다.
- native backing/player.js: 부모 요청의 같은 경계를 검증한 뒤 공식 pauseVideo만 호출합니다. API 준비 전 요청도 유지하며 실제 state가 -1/0/2/5일 때만 확인합니다. 재생/버퍼링 상태는 성공으로 답하지 않고 창 복귀 때 playVideo를 호출하지 않습니다.
- BackingPage.tsx와 관련 테스트: 중지 확인 중/창 전환 안내, 실제 native blur·viewport/숨김 보존/위조·이전 확인 무시/timeout 종료, 준비 전 요청/버퍼링 중 미확인·실제 중지 후 확인을 검사했습니다. 기존 영상 위치/프레임을 유지하며 외부 오디오는 캡처하지 않습니다.

### 테스트 결과

대상 frontend50개/3.40초 성공 후 최종 pnpm verify:app이 성공했습니다. 프론트269개·타입/ESLint·production build19.07초·Prettier·cargo fmt/표준 Clippy2.67초·Rust150개/6.18초(환경 의존16개 제외)·binary/doc-tests를 통과했습니다. 초기 실패는 없었습니다. 앞선 API 관측의 확장 Clippy/원격 ACL 검증은 성공이고 이번 Rust/IPC native 명령·CSP 변경은 없습니다. 새 내장 번들/Windows 후보 적용은 후속 실행 중입니다. Python 전체는 변경 없어 **미실행**(이전111개 성공 유지)입니다.

### 미구현 및 알려진 문제

실제 API 재생·시간/일시정지·창 전환 보존 수용은 아직 **미실행**이며 stub/로컬 검사를 실제 서비스 성공으로 기록하지 않습니다. 일시정지 확인이 없으면 영상이 닫히는 폴백이 남고 수동 모드에는 제어 API가 없어 기존 제거를 유지합니다. 검색키/보호 서버·수동 앵커/TAB 싱크·정밀 채점/별도 Windows 배포는 미완료입니다.

### 다음 작업 계획

새 Windows 후보 적용/기존 데이터 보존 후 API 검증 체크를 켠 상태에서 영상/시계와 다른 창 전환→복귀의 일시정지/영상 보존을 확인합니다. 수용 뒤 비점수 수동 앵커/TAB 싱크를 이어갑니다. 사용자에게 일시적인 버튼 비활성 문제를 해결했다고 주장하지 않으며 해당 보고는 사용자가 정정했습니다.

### 창 전환 수정 후보 적용 및 검증 대기

custom-protocol 번들3개와 Windows 빌드14.35초가 성공했습니다. 고정 runtime3393개/64,095,996바이트의 복사 목록/전체 SHA와 실행 파일26,614,272바이트/SHA68a2056df70d758cf9ae88dbf1ab8336ca94a24f758c418c63bacab9d7f7781b을 검증했습니다. 기존 PID31444를 정상 종료한 뒤 실제v6 DB를 새 UUID 폴더에 백업하고 새 PID29260/Responding=true·‘GuitarLab · YouTube 일시정지 검증 후보’를 실행했습니다. 재실행 전후13개 테이블의 행 수/내용 SHA와 모델 marker4개 모두 동일합니다. `youtube-pause-candidate.json`·`youtube-pause-db-before.json`·`youtube-pause-db-after.json`·`portable-candidate.json`에 결과를 보존합니다.

실제 사용자 API 재생/초 숫자와 창 전환 후 영상·위치 보존/일시정지·수동 재개를 요청했습니다. 응답 전에는 성공으로 기록하지 않고 현재 앱을 재실행하지 않습니다. 기존 manualStorageValidated/manualApiValidated/manualPauseValidated도 false를 유지합니다. 원래 보고의 ‘열기 비활성’은 사용자가 동작한다고 정정했으며 별도 원인/해결을 주장하지 않습니다.

후속 수동 싱크는 기존 player/sync.ts의 보간/검증과 player=false인 ScoreViewport를 재사용할 수 있습니다. YouTube 프로필은 영상 ID+프로젝트/저장 악보 revision 문맥으로 분리하고 로컬 ScoreDocument.syncAnchors나 입력 보정/점수를 변경하지 않아야 합니다. API 수용 뒤 별도 계약/추가 migration·취소/복원·오래된 revision 거부부터 구현하며 아직 코드를 만들었다고 표시하지 않습니다.

### 사용자 수용 갱신 — 창 전환 중지/첫 접속

사용자가 ‘일시정지 되긴 한다’고 확인했습니다. 첫 영상 로드가 느렸으나 ‘지금은 바로 된다’고 추가 확인했습니다. 따라서 실제 영상 로드/창 전환 일시정지는 수용으로 기록합니다. 초 숫자/정량 시계·cold-start 구간 시간은 직접 답변/측정이 없어 미실행을 유지합니다. 공식 스크립트/플레이어 최초 초기화·네트워크 캐시의 영향 가능성을 안내했지만 지연 원인으로 확정하지 않습니다. 자체 idle 사전 연결 HTML 검사에서는10ms 응답으로 지연을 재현하지 못했습니다.

별도 안정성 검사에서60ms 간격의 정상 분할 HTTP 헤더는 Windows10053 연결 중단으로 실패했습니다. Windows listener의 nonblocking 상속 상태를 요청 stream에서 명시적으로 해제하고 전체1초 read deadline·최대8개 요청 worker를 적용했습니다. 빈 사전 연결이 실제 요청을 직렬로 막지 않고 종료 때 모든 worker를 join하며 경로/Host/GET/파일/CSP/권한 경계는 유지합니다. 이 오류를 사용자의 초기 지연 원인이라고 주장하지 않습니다. 현재 앱PID29260은 유지하고 수정본을 다음 후보에 포함합니다.

### HTTP 수정 검증 완료 / 다음 슬라이스

분할 요청 회귀의 수정 전 실패10053을 확인한 뒤 요청 stream의 blocking/전체 read deadline·최대8개 요청 worker를 적용했습니다. 대상5개 성공(빈 사전 연결 중 HTML11ms), 확장 all-targets/all-features Clippy4.99초·cargo test --all-features155개/5.60초(환경 의존16개 제외, 번들3개 포함) 성공입니다. 프론트는 변경 없어 직전269개 통과를 유지하고 재실행하지 않았습니다. Python도 변경 없어 미실행입니다. 현재 실행 앱PID29260에는 이 native 수정이 아직 미반영이며 다음 후보에 묶습니다.

다음 수직 슬라이스는 공식 관측 시간→사용자 지정 두 맞춤 지점→비점수 TAB 커서의 화면 임시 미리보기입니다. 처음에는 화면 이탈/영상 변경 시 소실됨을 표시하고 영구 프로필/새 DB migration은 별도 작업으로 남깁니다. 원래 로컬 악보 syncAnchors/배속/입력 보정/점수·녹음 데이터는 변경하지 않습니다.

## 영상·TAB 화면 임시 맞춤 미리보기 — 2026-10-19

### 작업 개요

Phase 6A의 공식 관측 시간에 두 수동 지점을 대응시켜 비점수 커서를 표시하는 첫 슬라이스입니다. 작업일2026-10-19, 전체 진행 중입니다. 화면 임시 기능이며 영구 프로필/복원은 아직 구현하지 않았습니다.

### 구현 및 변경 사항

- docs/12에 화면 임시 문맥·입력/보간/버퍼링/범위 밖/수명 계약을 먼저 정의했습니다. native IPC/Python/DB 구조는 변경하지 않습니다.
- features/backing/youtubeSync.ts: video/score/track/끝 tick 문맥, 반복을 펼친 마디 시작/악보 끝의 두 지점·실제 영상 길이/엄격 증가 검증, 기존 player/sync.ts 재사용과 구간 밖 외삽 금지를 구현했습니다. API 현재 시간을 사용하므로 배속을 다시 곱하지 않습니다.
- useYoutubeSync.ts·YoutubeSyncPreview.tsx: 두 진행 마디 번호/영상 초·일시정지 시 현재 시간 넣기·임시 적용/해제·오류 안내와 읽기 전용 TAB를 분리했습니다. 입력 변경은 기존 임시 적용을 해제합니다. 원래 local syncAnchors/악보/연습 점수·녹음은 바꾸지 않습니다.
- BackingPage.tsx·App.tsx·shared/styles.css: 열린 실제 ScoreSession을 전달하고 API 검증 영상과 TAB를 나란히 배치합니다. 간격은 공통 token으로 추가했습니다. 영상 위에 덮거나 로컬 음원을 재생하지 않습니다.
- ScoreViewport.tsx: tick=null이면 커서만 숨깁니다. 기존 숫자 커서·내부 스크롤·REC 포커스 동작은 유지합니다.
- 실제 추천 영상 전환 때 이전 악보를 잘못 따라가지 않도록 wrapper의 공식 getVideoUrl() 관측을 추가했습니다. YOUTUBE_SNAPSHOT만 v2로 올리고 videoId는 실제 ID 또는 식별 전 null입니다. frontend decoder/모든 메시지 fixture를 함께 변경했고 v1 거부·다른 ID/미식별에서 적용/커서 중지·원래 player 조작 유지 조건을 추가했습니다. native 세션/PAUSE/ACK는 v1, AI JSONL/DB는 변경 없습니다.

### 테스트 결과

대상56개(싱크/실제 fixture UI·nullable ScoreViewport·기존 backing) 최초 성공, v2 전환 중 테스트의 잘못된 버전 사례가 여전히2로 남아1개 실패했습니다. 해당 사례를 구형1/미래3 거부로 수정했고 실제 스키마를 되돌리지 않았습니다. 최종 pnpm verify:app 성공: frontend274개·타입/ESLint·production build18.70초·Prettier·cargo fmt/표준 Clippy2.72초·Rust152개/6.16초(환경 의존16개 제외)·binary/doc-tests 성공입니다. UI 오류 문구를 마디/영상 시간으로 다듬은 뒤 관련5개·최종 UI 빌드를 다시 확인합니다. 기존 HTTP 수정 확장155개/Clippy도 성공했습니다. 실제 Windows 새 TAB 미리보기 수용과 새 getVideoUrl 식별은 **미실행**이며 후속 후보를 준비합니다. Python 전체는 변경 없어 **미실행**(직전111개 성공 유지)입니다.

### 미구현 및 알려진 문제

화면 이탈/영상 변경/닫기에서 임시 맞춤은 소실됩니다. 영구 프로필·저장/복원·다중 지점·정밀 정렬/점수는 미구현입니다. 두 지점 사이 선형 추정이며 중간 템포 변화/광고/네트워크로 어긋날 수 있습니다. 입력/로컬 mixer·REC와 연결하지 않습니다. 실제 영상 ID 미식별/변경·관측 지연/준비/버퍼링은 커서를 숨깁니다. 검색 키/보호 서버와 별도 Windows 배포 검사도 미완료입니다.

### 다음 작업 계획

최종 내장 번들/Windows 후보에 HTTP 안정성 수정과 임시 미리보기를 함께 적용하고 기존 데이터/모델 보존 및 실제 커서 이동을 확인합니다. 이후 별도 프로젝트/영상/저장 악보 revision 문맥의 영구 싱크 프로필을 계약→추가 migration→취소/복원/원본 보존 검사 순으로 구현합니다. 현재 v6 DB에 저장 필드가 생겼다고 주장하지 않습니다.

### 임시 맞춤 최종 UI 검사 갱신

사용자 오류 문구를 구현 용어 대신 두 번째 마디/영상 시간의 증가 안내로 다듬은 뒤 domain/UI5개와 최종 pnpm build(타입 포함)28.56초를 다시 통과했습니다. 새 로직/스타일·기존 ScoreViewport 숫자/null 처리·실제 fixture와 현재 영상 ID v2 경계는 앞선 전체274개 성공에 포함합니다. 실제 서비스에서 추천 영상 전환/새 임시 커서의 수용은 미실행입니다.

### 임시 맞춤 Windows 후보 적용 — 2026-10-19

내장 UI/CSP/원격 ACL 번들3개(0.01초)와 Windows 빌드19.20초가 성공했습니다. 고정 runtime3393개/64,095,996바이트의 복사 목록·전체 SHA 및 실행 파일26,631,168바이트/SHA8cd15572b37d99eb4d21a006aa73d4bdb07a3de7d0d7b664ddce7c7c0f543aad의 복사 동일성을 확인했습니다. 기존 PID29260을 정상 종료하고 실제v6 DB를 새 UUID 폴더에 백업한 뒤 독립 후보 **PID8500/Responding=true**, ‘GuitarLab · 영상 TAB 맞춤 검증 후보’를 실행했습니다. 재실행 전후13개 테이블의 행 수/내용 SHA와 모델 marker4개가 모두 동일하며 DB 형식 변경/모델 재설치는 없습니다. `youtube-sync-candidate.json`·`youtube-sync-db-before.json`·`youtube-sync-db-after.json`·`portable-candidate.json`에 정확한 실행 정보/결과를 기록했습니다. HTTP 분할 요청 수정도 이 후보에 포함됐습니다.

실제 영상의0~10초를 두 기본 진행 지점에 임시 대응해 커서 표시만 확인하도록 요청했습니다. 이 값은 음악적 정렬의 정확도를 보증하는 테스트가 아니며 기타 연주를 요구하지 않습니다. 응답 전에는 임시 싱크/현재 ID v2 수용 성공을 기록하지 않고 현재 앱을 재실행하지 않습니다. 이전 후보의 실제 영상 로드/창 전환 중지 수용은 이력으로 유지합니다. 새 후보의 manualSyncValidated/manualApiValidated/manualStorageValidated는 false입니다.

### 임시 커서 사용자 수용 / 지연 설명 정정

사용자가 임시 TAB 커서 테스트에 ‘된다’고 확인했습니다. 따라서 PID8500의 실제 v2 API/임시 커서 연결을 수용으로 기록합니다. 음악적 정확도/샘플 정밀 동기 측정은 아니며 영구 프로필은 계속 미구현입니다. 이어 지연은 첫 영상 로드가 아니라 URL 입력 후 ‘재생 상태·시간 확인’을 체크하면 열기 버튼이 약3초 뒤 활성화되는 현상이라고 명확히 했습니다. 앞선 cold-load 가능성 안내를 이 현상의 원인으로 기록하지 않습니다.

수정은 mode 변경 시 observer/native blur listener 재등록을 제거하고 ref만 갱신, 명시적 autoplay0 열기를 비동기 intersection callback과 분리·클릭 시 중앙 스크롤, 준비 중 사유 표시입니다. 최신 IO 표본을 사용하고 열기 이전의 오래된 화면 표시 표본은 중지 판단에서 제외합니다. 실제 표시 손실/창 전환 중지·실패 폴백/오프라인/REC는 유지합니다. 현재 앱은 유지하며 수정 후보를 준비합니다.

### 열기 버튼 활성화 수정 검사·Windows 반영 — 2026-10-19

- 작업 범위: Phase 6A의 API 체크 직후 열기 활성화 문제만 수정했습니다. BackingPage/useYoutubeEmbed와 회귀 테스트, docs/00·12·진행 문서를 변경했습니다. 전체 Phase는 진행 중입니다.
- 타입 검사·ESLint·전체 프론트 **275개/71파일(20.14초)**, production build27.73초, Prettier 성공. API 체크 때 native listener/observer를 재등록하지 않고 화면 비율 응답을 기다리지 않는 조건을 추가했습니다. 테스트의 scrollIntoView 원본도 실패 여부와 관계없이 복원합니다.
- 내장 UI/원격 ACL 번들 **3개**와 Windows build **13.61초** 성공. 기존 Rust 엔진·Python 소스는 변경하지 않아 전체 Rust/Python 재실행은 **미실행**이며 직전152개/111개 성공을 유지합니다. 기본 alphaTab 포함 JS의500kB 안내는 기존 빌드 경고로 남습니다.
- 고정 runtime **3393개/64,095,996바이트**의 목록/전체 SHA와 exe 복사 동일성을 확인했습니다. 이전 PID8500을 정상 종료하고 실제v6 DB를 백업한 뒤 **PID29636**, ‘GuitarLab · YouTube 열기 검증 후보’를 실행했습니다. 실행 파일26,631,168바이트/SHA2310af5ba18e854867934d30eb6df51962489002828697b8a322416f8722c01d입니다. 정확한 경로/검사 로그는 target/runtime-validation/youtube-open-* receipt에 기록합니다.
- 실제 수정 후보의 버튼 활성화 시간 수용은 **미실행/사용자 확인 대기**입니다. 이전 후보의 임시 커서 수용과 구분합니다. 다음은 수정 확인과 별도 영구 싱크 프로필 계약/저장·복원이며 검색/별도 Windows·정밀 정렬은 미완료입니다.

### 2026-10-20 버튼 수정 수용 / 다음 저장 슬라이스

사용자가 API 체크 직후 열기 버튼이 활성화됨을 확인했습니다. 재실행 전후 실제v6 DB13개 테이블 내용 SHA/행 수와 모델 marker4개 SHA도 동일합니다. 버튼 지연 수정 슬라이스는 완료이며 전체 Phase6A는 진행 중입니다. 다음은 프로젝트·저장 악보 버전·영상·트랙별 별도 맞춤 저장/명시적 복원입니다. 자동 YouTube 연결이나 원래 로컬 싱크 수정은 추가하지 않습니다.

## 영상 맞춤 영구 보존 슬라이스 — 2026-10-20

### 작업 개요

Phase6A의 두 지점 맞춤을 프로젝트·저장 악보 버전·영상·트랙별로 저장/복원하는 후보입니다. 후보 구현일2026-10-20, 전체 Phase6A는 진행 중입니다. 이전 임시 커서/버튼 지연 수정은 사용자 수용했습니다. 실제 저장 UI/재실행 수용 전 이 슬라이스 전체 완료로 기록하지 않습니다.

### 구현 및 변경 사항

- docs/12 계약을 먼저 정의하고007-youtube-syncs.sql/SQLitev7·storage/youtube_sync.rs·commands/youtube_sync_api.rs를 추가했습니다.4KiB/SHA/불변 revision 소유권·트랙·영상·두 지점/프로젝트100개를 검사하고 명시적 null 삭제·IMMEDIATE transaction/취소·REC 저장 차단을 사용합니다.
- storage/database.rs/mod.rs·commands/mod.rs·app.rs에 연결하고 기존v1~v5 migration 회귀를 최신v7까지 검증하도록 수정했습니다.001~006 SQL은 유지합니다.
- projectYoutubeSync.ts·useYoutubeSyncStorage.ts로 엄격한 응답 계약·공용 StorageJobs/LatestTask·취소 종료 대기·문맥 전환/늦은 응답 폐기를 분리했습니다. useYoutubeSync.ts가 저장 문맥/복원 검증을 담당하고 YoutubeSyncPreview는 최소 조작/상태만 표시합니다. BackingPage/App은 기존 scoreSaved를 전달합니다.
- youtubeSync.ts는 복원 때 실제 펼친 마디/끝 tick·영상 길이를 다시 검사합니다. 로컬 syncAnchors의 마지막 tick은 사용자가 수정할 수 있어 악보 끝으로 간주하지 않도록 점검 중 바로잡았습니다. 원래 악보/로컬 싱크·REC·점수·모델은 변경하지 않습니다.
- 새 native/계약/hook/UI 테스트와 docs/00·02·07·08·09·12·14·README/진행 문서를 갱신합니다. 삭제한 기능은 없습니다.

### 테스트 결과

대상 Rust4개 성공 후 전체 Rust156개/7.54초·환경 의존16개 제외, 확장 Clippy9.16초 성공했습니다. 이후 로컬 앵커와 독립적인 끝 검증/유효 트랙 격리 회귀를 추가해 최종 전체 검사를 다시 실행합니다. 프론트 대상63개/4.42초·타입 성공입니다. 최초 테스트 props의 null 추론 오류는 명시적 union으로 수정했고 ESLint no-control-regex는 Unicode 제어문자 범주 검사로 고쳤습니다. 최종 verify:app/번들/Windows/실제 DB·사용자 수용은 아래 후속 기록 전까지 **미실행 또는 실행 중**입니다. Python은 변경 없어 **미실행**(직전111개 성공)입니다.

### 미구현 및 알려진 문제

두 지점 사이 BEST_EFFORT 선형 미리보기이며 정확한 연주 판정·REC 정렬이 아닙니다. 영상 길이 차이1초 초과·다른 악보 revision은 다시 맞춰야 합니다. 여러 지점/과거 프로필 목록 UI·검색 키 보호/검색 API·깨끗한 Windows 확인은 미구현/미실행입니다. 오래된v6 전용 실행 파일로v7 DB를 열지 않습니다.

### 다음 작업 계획

전체 검사→새 내장 Windows 후보→기존v6 백업/v7 추가 적용·원래13개 테이블/모델 보존→사용자의 명시적 저장/복원→재실행 복원을 확인합니다. 이후 검색 인증/키·쿼터 보호의 남은 의존성을 검토하며 검색을 구현한 것으로 표시하지 않습니다.

### 영구 보존 최종 전체 검사

`pnpm verify:app` 성공: 프론트 **282개/73파일**, 타입·ESLint·production build **20.72초**·Prettier·cargo fmt/표준 Clippy **5.16초**·Rust **156개/7.19초**, 환경 의존16개 제외·binary/doc-tests 성공입니다. 최종 유효 두 트랙의 격리·로컬 syncAnchors 끝과 독립된 저장/원본 보존 회귀를 포함합니다. 로그는 target/runtime-validation/verify-youtube-profile.log입니다. 확장 Clippy/최종 내장 번들/Windows와 실제v7 적용·UI 수용은 후속 기록 전까지 완료로 표시하지 않습니다. 기존 alphaTab 포함 번들 크기 안내는 남고 새 의존성은 없습니다.

추가 확장 Clippy(all-targets/all-features) **4.99초**, 최종 내장 UI/CSP/원격 권한 번들 **3개/0.12초** 성공입니다. 기본 제외16개는 오디오 장치/실제 모델·배포 환경을 요구하는 기존 검사이며 새 저장 테스트를 제외하지 않았습니다. Windows 실제 저장 UI·앱 재실행 수용은 아직 미실행입니다.

### 영구 보존 Windows 적용 / 실제 데이터 보존 — 2026-10-20

Windows build **29.93초** 성공, 고정 runtime3393개/64,095,996바이트의 복사 목록/전체 SHA와 exe 복사 동일성을 확인했습니다. 실행 파일26,896,384바이트/SHA1d8df55fbbee261e97423b5d63e3ab71ae0740159c2f6bfcdec89e58b606bca9입니다. 기존PID29636을 정상 종료하고 실제v6 DB를 새 UUID 폴더에 백업한 뒤 **PID17684/Responding=true**, ‘GuitarLab · 영상 맞춤 저장 검증 후보’를 실행했습니다. portable/21b8d916-5eac-45d0-a422-f30a04c15d22의 독립 후보이며 이전 후보/백업/사용자 파일은 삭제하지 않았습니다.

v7 적용 후 **project_youtube_syncs만 추가**됐고 기존13개 테이블의 행 수/내용 SHA 및 모델 활성 marker4개 SHA가 모두 동일합니다. youtube-profile-candidate.json·youtube-profile-db-before.json·youtube-profile-db-after.json·portable-candidate.json에 정확한 실행/백업/검사 정보를 기록했습니다. 기존 모델 설치·원본 PCM/악보·녹음·로컬 싱크 변경은 없습니다. 구버전v6 앱을 v7 데이터 복원 방법으로 실행하지 않습니다.

실제 UI는 저장 프로젝트의 같은 영상에서0/10초 두 지점 임시 적용→영상 맞춤 저장→맞춤 해제→저장 맞춤 다시 읽기의 적용 문구/값 확인을 요청했습니다. 답변 전 실제 저장 UI/앱 재실행 복원 성공으로 기록하지 않으며 현재 앱을 재실행하지 않습니다. 검색/다중 지점/별도 Windows는 미완료입니다.

### 영상 맞춤 저장 UI 수용 / 재실행 확인 준비

사용자가 실제 저장→화면 적용 해제→다시 읽기에서 적용 문구와0/10초 값의 복원을 확인했습니다. manualProfileValidated=true이며 앱 재실행 수용과 구분합니다. 이후 PID17684를 정상 종료하고 맞춤 포함v7 DB14개 테이블을 별도 백업한 뒤 **동일 exe**를 PID34664로 다시 열었습니다. 새 소스/런타임 변경이 없어 빌드/전체 자동 검사 재실행은 **미실행**이고 앞선 최종 성공을 유지합니다. youtube-profile-reopen-db-before/after.json에 재실행 보존을 기록하며 사용자 재실행 UI 복원은 다음 확인 전까지 미실행입니다.

### 영상 맞춤 영구 보존 슬라이스 완료 — 2026-10-20

사용자가 앱 재실행 후 같은 프로젝트/영상의 저장 맞춤을 재입력 없이 읽어0/10초·적용 문구가 복원됨을 확인했습니다. 저장 UI·재실행 복원까지 수용하여 이 슬라이스를 완료합니다. 원래14개 테이블(맞춤 포함)의 행 수/내용 SHA·모델 marker4개도 재실행 전후 동일합니다. 현재 PID34664/Responding=true이며 같은 exe/SHA를 유지합니다. manualProfileRestartValidated=true로 기록하고 기존 URL 저장 UI만 별도 조작한 수용으로 확대 해석하지 않습니다.

새 조회/저장 두 명령을 원격 YouTube/loopback ACL 거부 목록에 명시해 번들3개(0.00초)를 추가 통과했습니다. 이는 테스트만 추가한 변경이며 실행 앱을 다시 빌드/재시작하지 않았습니다. 최종 프론트282개/Rust156개·전체 검사/Windows 실행 성공과 명확한 미실행/Python/새 OS 제약을 앞선 기록대로 유지합니다.

다음 실제 의존성은 앱 내부 YouTube 검색의 인증/키 관리 방식입니다. docs/14에 공식 문서 확인과 본인 키/별도 서버/검색 보류의 구체적인 방향 후보를 기록했습니다. 현재 Google 프로젝트/키·보호 서버가 지정되지 않아 실제 검색·서버/계정 설정은 **미실행**입니다. 이 결정 없이 공유 키를 앱에 넣거나 검색 성공을 위조하지 않습니다. 중요한 인증 의존성은 사용자 선택 후 진행하며 Phase6A 전체는 미완료입니다.

### 사용자 결정 갱신 — URL 기본, 키 관리 개발 취소

사용자가 본인 키 방식을 잠시 선택한 뒤 API 키 발급의 사용 부담을 지적하고 URL을 직접 가져와 붙이는 방식을 요청했습니다. **최신 요청에 따라 본인 키 요구를 취소**하고 기존 URL/공식 플레이어·IFrame 시간/영상 맞춤 저장·복원을 기본으로 유지합니다. 키 발급 안내/보관 UI·자격증명 접근·네트워크 검색/새 라이브러리 설치는 **미실행**입니다. Microsoft WinCred/windows-sys0.61.2/Rust1.71+·MIT/Apache 호환성은 조사만 했고 Cargo.toml/lock을 변경하지 않았습니다.

URL 기본 슬라이스는 현재 검증/수용 완료이며 전체 Phase6A의 자동 검색은 미구현·사용자 결정으로 보류합니다. docs/00·14·로드맵/진행 요약을 갱신하고 독립적인 Phase6B의 소유 Lead/Rhythm 파일 import를 검토합니다. 실제 AI 파트 분리가 제공된다고 주장하지 않습니다. 현재PID34664와 기존 데이터/모델은 유지합니다.
