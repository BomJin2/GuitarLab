# Phase 04 — 프로젝트 저장과 연습 기록

## 후속 — 원본 가져오기 DB 실패의 복사본 정리 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 열린 프로젝트 drop의 관리용 보관 경로를 검토하다 기존 import_asset에서 원본 복사 후 DB 삽입/commit 실패 시 새 파일이 남는 문제를 확인했습니다. 드롭 기능보다 기존 저장 실패 처리를 먼저 보완하는 단일 슬라이스이며 대상21개·타입/포맷 검사, 확장 Rust258개/Clippy·Windows·Rust1.90 검사를 통과했습니다. 새 GitHub Actions와 패키지 검증은 후속입니다.

### 2. 구현 및 변경 사항

- `src-tauri/src/storage/projects.rs`: create_new 성공한 파일의 현재 경로를 추적해 .part→최종 복사본 전환 이후 오류도 같은 작업 범위에서 정리합니다. 중복일 때 새 임시 복사본만 지우고 정상 commit한 파일은 유지합니다. 외부 참조는 정리 대상이 없으며 원본/다른 작업 파일은 삭제하지 않습니다.
- `projects_tests.rs`: 관리용/외부 참조 각각에 INSERT 실패·지연 FK COMMIT 실패2개 검사를 추가했습니다. 기존 저장 revision/원본 자산·외부 원본 및 다른 작업 .part의 이름/내용 불변을 확인합니다.
- `docs/12-API-CONTRACTS.md`, `docs/09-TEST-PLAN.md`: 실패 정리와 테스트 기준을 기록했습니다. IPC v1/DB 스키마·UI/오디오/파일 형식·외부 의존성은 변경하지 않습니다. 기존 테스트 창/불변 EXE는 유지합니다.

### 3. 테스트 결과

- 수정 전 `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml import_ --lib`: **2개 실패/3개 성공**. INSERT/COMMIT 실패 후 새 최종 복사본이 남아 파일 목록/내용 보존 검사가 실패했습니다. `asset-import-rollback-red-20261028.log`입니다.
- 수정 후 `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml storage::projects_tests --lib`: **21개 성공**,최종2.55초. 두 신규 검사는 관리용/외부 참조 모두 성공하며 기존 정상/중복·복사 취소·손상/잘못된 JSON·저장/reopen/재연결 검사도 통과했습니다. `asset-import-rollback-target-final-20261028.log`입니다.
- `pnpm typecheck`, `pnpm format:check`, `cargo fmt --check`: **성공**. `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --all-features`: **258개 성공/29개 기본 제외**,20.28초. `cargo clippy --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: **성공**,10.48초.
- `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **성공**,4.84초(기존 MSVC 링크 안내). `cargo +1.90.0 check --locked --offline --manifest-path src-tauri/Cargo.toml --all-targets --all-features`: **성공**,13.94초. 새 Git/원격·패키지는 후속입니다. 프론트 전체/웹 재빌드: **미실행** — 프론트 소스/내장 dist는 e745059의683개·웹 빌드/원격 성공 이후 변경하지 않았습니다.
- 실제 개인 자료/디스크 오류·전원 중단: **미실행** — 자체 임시 DB 오류를 주입하며 원본 제품 프로필을 열지 않았습니다. 열린 프로젝트 drop은 **미구현**입니다.

### 4. 미구현 및 알려진 문제

프로세스 강제 종료/전원 중단의 자동 고아 파일 회수나 기존에 남은 파일의 일괄 삭제는 구현하지 않습니다. 이 호출이 만든 파일만 정리하며 정리 자체의 파일 시스템 오류는 STORAGE_ERROR로 표시합니다. 실제 디스크 부족·권한 변경 및 열린 프로젝트의 Explorer 입력 수용은 별도입니다.

### 5. 다음 작업 계획

확장 Rust/Clippy·Windows/원격을 확인하고 결과를 기록합니다. 현재 정상 앱은 재실행하지 않으며, 다음 열린 프로젝트 drop은 제한된 악보 바이트 전달·관리용 복사/참조 정책·취소/미저장 보존을 검토한 뒤 별도 계약/슬라이스로 구현합니다.

## 후속 — 결과 조회 선택·취소·재시도 (2026-10-27)

### 1. 작업 개요

작업·검증 완료일 2026-10-27. 결과 화면에서 시도를 바꾼 첫 렌더에 새 요약과 이전 마디 결과가 함께 나타나는 문제를 자동 재현하고 수정했습니다. 목록·판정 조회의 수명을 화면에서 분리하고 취소·실패 후 같은 시도만 다시 읽는 경로를 추가했습니다. 로컬/원격 자동 검사·Windows 빌드/독립 패키지 검증은 완료했습니다. 기존 Phase 4 기본 수용과 전체 9단계 기본 완료·5단계 부분 완료의 경계는 유지합니다.

### 2. 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`: 기존 IPC v1/DB를 유지하는 선택별 상태·취소·재시도 계약을 먼저 기록했습니다. `docs/09-TEST-PLAN.md`에 첫 commit·늦은 응답·같은 시도 재진입 등의 검증 기준을 추가했습니다.
- `src/features/practice/usePracticeRecords.ts`: 프로젝트·native 사용 가능 여부·새로고침별 목록/오류를 반환합니다. 전환한 첫 반환부터 이전 목록을 숨기고 이전 응답을 무시하며 조회 중 native가 비활성화돼도 대기 표시가 남지 않습니다.
- `src/features/practice/usePracticeEvents.ts`: 시도/재시도별 조회·진행률·오류·취소를 전담합니다. 늦은 완료·실패·진행률과 이전 문맥의 취소/재시도 명령이 새 조회에 영향을 주지 않으며 전체 판정 조회 성공 후에만 차트를 제공합니다.
- `ResultsPage.tsx`: 조회 명령과 상태 표시를 연결하고 목록 재조회 시 첫 시도를 선택하는 기존 동작을 유지합니다. ‘판정 다시 읽기’는 목록을 다시 읽지 않으며 취소·실패·성공한 빈 결과를 구분합니다. 조회 오류를 기록 없음으로 안내하던 부분도 수정했습니다. 점수/분모·원본 기록·디자인은 변경하지 않았습니다.
- 위 훅의 테스트 2개 파일, `ResultsPage.test.tsx`, `records.test.ts`: 첫 React commit·취소/재시도·이탈·서비스 페이지 취소와 기존 비교/차트를 검사합니다. 새 라이브러리·native/Python 변경·파일 쓰기는 없습니다.

### 3. 테스트 결과

- 수정 전 `pnpm exec vitest run src/features/practice/ResultsPage.test.tsx`: **3개 실패/3개 성공**, 15.95초. 이전 차트 혼합과 취소 안내 부재를 재현했습니다. 세 번째 실패는 앞선 실패가 남긴 일회성 모의 응답 때문이어서 `clearAllMocks`를 `resetAllMocks`로 바꿔 테스트를 격리했습니다. 이를 실제 저장 오류로 해석하지 않습니다.
- 1차 수정 후 같은 화면 검사 **6개 성공**, 2.63초. 대상 검사 **14개 성공**, 이후 프로젝트 전환/목록 수명 검사를 추가한 대상 검사 **19개/4파일 성공**, 2.82초입니다.
- 최종 `pnpm test`: **561개/115파일 성공**, 36.17초. 마지막 서비스 취소 회귀 2개도 포함합니다. 로그 `src-tauri/target/runtime-validation/results-query-front-20261027.log`.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: **성공**. Markdown은 Prettier 검사 대상이 아니며 문서 변경은 별도 차이/내용 검사로 확인합니다.
- 최초 `pnpm build`는 하위 스크립트가 Corepack을 선택해 `registry.npmjs.org`의 `ENOTFOUND`로 실패했습니다. 설치된 pnpm 경로를 현재 명령의 PATH 앞에 넣어 다시 실행했으며 다운로드·설치는 하지 않았습니다. 최종 빌드 결과는 후속 기록을 따릅니다.
- PATH 보정 후 `pnpm build`: **성공**, Vite 1분55초. 기존 큰 chunk 경고는 남습니다. `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests`: **4개 성공**, 실행 0.00초/컴파일 46.65초. `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **성공**, 13.92초/기존 MSVC 링크 경고입니다. 로그는 같은 ignored 검증 폴더의 `results-query-build-20261027.log`, `results-query-bundle-20261027.log`, `results-query-native-build-20261027.log`입니다.
- 소스 `160101e0709d8737ebf27a2a56c9395f08e5ad29`를 main에 push했습니다. [Windows40425714551](https://github.com/BomJin2/GuitarLab/actions/runs/40425714551)/job121930836757은 사후 정리까지 **전체 성공**입니다. 실제 로그에서 프론트 **561개/115파일**(55.66초), 기본 Rust **249개**(44.76초)/확장 **253개**(45.05초·각 기본 제외 28개), 예제 **1+1개**, AI **113개**(2.08초), 도구 **143개**(12.700초·제외 없음), Clippy·MSRV **1.90**(컴파일 7.75초) 성공을 확인했습니다. 해당 전체 native/AI/도구의 이번 **로컬 재실행은 미실행**이며 원격 결과와 구분합니다. 실제 앱/개인 DB·청취·별도 Windows 수용도 **미실행**입니다.
- 이후 같은 소스의 새 ZIP **3,613파일/40,290,355바이트**, 전체 SHA/CRC·새 추출·실제 PowerShell 5.1/최소 PATH의 독립 Python 3.12.15 두 번과 EXE/ZIP Defender 검사 **성공**입니다. 정확한 경로/지문·서명 미완료·검사 한계는 [Phase8 첫 절](PHASE-08.md)을 따릅니다. 앱을 실행하거나 기존 후보/사용자 자료를 교체하지 않았습니다.

### 4. 미구현 및 알려진 문제

취소는 이미 전달된 native 읽기 호출 자체를 강제 종료하지 않습니다. 서비스가 취소된 응답·다음 페이지 요청을 차단하고 훅이 늦은 결과를 적용하지 않습니다. 재시도는 선택한 시도의 판정을 처음부터 읽으며 중간 페이지를 이어 읽지 않습니다. 전체 출시·고급 판정 품질과 별도 OS/모델 수용 조건은 이번 수정으로 완료되지 않습니다.

### 5. 다음 작업 계획

소스 업로드·원격 회귀와 로컬 Windows/독립 패키지 검증을 완료했습니다. 이번 결과 조회 후속의 새 자동 검사/문서 변경과 실제 사용자 수용은 구분합니다. 남은 Phase 6/6A/6B/7/8은 진행 요약의 별도 OS·특화 모델 허가/독립 정답·서명/데이터 교체 범위 등 재개 조건을 따릅니다. 해당 조건 없이 고급 점수나 전체 출시를 완료로 표시하지 않으며, 새 코드 변경이 없는 상태에서 같은 검사를 반복하지 않습니다.

## 2026-10-26 정보 수정·검색 원격 확정

main `2a52cdee4bb956a2ed12538b7e5030b8dbd108e0`의 [Windows40226329111](https://github.com/BomJin2/GuitarLab/actions/runs/40226329111)/job121268380106는 정리 단계까지 **전체 success**입니다. 실제 로그에서509프론트/109파일(82.71초), 기본244Rust(48.79초)/확장248Rust(48.48초·각28개 기본 제외), 예제1+1, AI113(10.32초), 도구143(35.761초·제외 없음), MSRV13.42초와 타입/lint/포맷·제품 Vite8.52초를 확인했습니다. 아래 원격 미실행/검사 중은 이전 이력입니다. 실제 Windows 정보/검색 폼과 개인 자료 변경은 미실행을 유지하며 다음 읽기 전용 저장 이력은 별도 변경입니다.

## 후속 — 로컬 라이브러리 검색 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. 정보 수정 슬라이스의 로컬빌드/포맷을 통과한 뒤 기존 F-01 라이브러리의 로컬 검색을 구현했습니다. 제목/아티스트 요약만 사용하고 원본파일/DB·현재세션을 변경하지 않습니다. 대상검사는 완료했으며 전체검사/빌드·원격은 아래 결과로 구분합니다.

### 2. 구현 및 변경 사항

- docs/12에 입력200 Unicode 코드포인트/정규화·단어·빈검색·원본보존과 새IPC 없음의 계약을 먼저 기록했습니다.
- `projectSearch.ts`: NFKC/소문자·공백단어의 모든일치로 기존순서의 원래요약 참조만 반환합니다. 아티스트null/빈검색·길이초과를 구분하고 사용자문자를 정규식/SQL로 실행하지 않습니다.
- `LibraryPage.tsx`: 공통toolbar의 제목/아티스트 검색·지우기·개수와 0개원본/검색없음/검색어길이 오류를 구분합니다. UI초안과 검색함수를 분리했고 현재프로젝트/정보수정 폼·기존열기/보관 기능을 유지합니다. 새네트워크/파일읽기/자동열기·라이브러리·CSS는 없습니다.
- `projectSearch.test.ts`/`LibraryPage.test.tsx`: 한글조합·전각/대소문자·교차필드·여러단어/특수문자·200자경계/null·순서/입력불변과 실제필터/빈상태/지우기·API호출 없음/원래목록 복귀를 검사합니다.

### 3. 테스트 결과

`pnpm exec vitest run src/features/library/projectSearch.test.ts src/features/library/LibraryPage.test.tsx`: **7개/2파일 성공**,3.22초. 전체프론트/타입/lint/포맷은 현재검사 중이며 Vite/최종Windows·패키지/원격과 실제Windows 검색폼은 아직 **미실행**입니다. 사용자가 연주하거나 실제프로젝트를 변경할 필요 없이 자체요약으로 검사했고 사용자 앱/자료·입력/REC는 유지했습니다.

이후 `pnpm test` **509개/109파일 성공**,34.71초와 `pnpm typecheck`/`pnpm lint`/`pnpm format:check` **성공**을 확인했습니다. 로그 `library-search-front-20261026.log`를 보존합니다. 다음은 현재진행 중인Vite/내장·Windows이며 이결과가 새원격/실제Windows 폼수용은 아닙니다.

### 4. 미구현 및 알려진 문제

현재 읽은 일반 프로젝트 최대1000개만 검색합니다. 파일내용/휴지통·서버 검색/정규식·검색어 영구저장/초성검색은 이번범위가 아닙니다. 새목록이 읽히면 같은검색어를 다시 적용하며 다른화면/재실행은 기본빈검색으로 돌아갑니다. 고급 품질/별도Windows·전체출시 수용은 별도로 유지합니다.

### 5. 다음 작업 계획

전체검사/빌드·문서화를 확정한 뒤 기존 F-06에 정의된 이전악보 버전보존의 조회 경로를 이어갑니다. 우선 현재악보/저장head를 바꾸지 않는 목록/읽기부터 구현하고 자동복원·원본덮어쓰기는 하지 않습니다. 최종 통합후보/원격은 각소스의 실제결과로 구분합니다.

### 검색 로컬 빌드 확정

최종 `pnpm build` **성공**,Vite47.04초/기존큰chunk 경고. 내장4개 **성공**,0.01초와 Windows빌드 **성공**,11.54초입니다. 로그 `library-search-build-20261026.log`/`library-search-bundle-20261026.log`/`library-search-native-build-20261026.log`를 보존합니다.509프론트/타입/lint/포맷과 앞선변경 없는248확장Rust·Clippy/MSRV를 구분하며 이번검색은Rust/Python을 변경하지 않았습니다. 두관리기능의 새통합ZIP/원격·실제Windows 폼/새OS는 미실행으로 유지합니다. 문서/로컬검증 후 바로 읽기전용 버전조회로 진행합니다.

## 후속 — 프로젝트 제목·아티스트 수정 (2026-10-26)

### 1. 작업 개요

작업일2026-10-26. F-01의 프로젝트 정보에 명시적 수정 경로를 추가합니다. 기존 Phase4 기본수용을 재구현하지 않고 제목/아티스트만 악보·원본·녹음·연습기록과 독립적으로 갱신합니다. 구현/대상 검증은 완료했고 전체검사/빌드·패키지/원격은 아래 결과를 따릅니다.

### 2. 구현 및 변경 사항

- 먼저 docs/12에 기존정보 비교/200 Unicode 코드포인트·제어문자/취소/원본보존·로컬명령 계약을 기록했습니다. DB9와 기존 project/assets/revisions·Python 계약은 유지합니다.
- `storage/project_metadata.rs`: 단일writer/immediate transaction에서 현재 제목·아티스트를 expected와 대조하고 보관/연습/녹음 상태를 검사합니다. 변경값을 다듬어 제목·아티스트·기존보다 큰 수정시각만 저장하고 동일값은 원래 요약을 반환합니다. 충돌/취소/DB실패/안전정수 상한에서는 이전 행을 유지합니다.
- `commands/project_metadata_api.rs`/등록·remote 권한 회귀: 엄격한 v1 요청과 기존StorageJob·RecordingService.while_idle를 재사용합니다. 다른 native 작업/REC와 직렬화하며 임의경로/알 수 없는 필드는 받지 않습니다.
- `features/library/projectMetadata.ts`: 입력 정규화·요청/응답 검증과 실제 취소종료 대기. 다른ID/mode/revision·다른 변경값의 응답을 거부합니다. `useProjects.ts`는 기존 보관 mutation 수명을 일반화해 현재세션/재생/화면을 유지하고 요약/목록만 갱신합니다. 늦은 취소 뒤 실제 저장완료는 성공으로 반영합니다.
- `ProjectMetadataPanel.tsx`/`LibraryPage.tsx`: 열린 프로젝트의 제목·아티스트 폼과 명시적 저장만 추가합니다. 공통 panel/fieldset/기존상태를 사용하고 실패 시 폼 초안을 보존합니다. 원래 악보 제목/파일명·녹음/점수는 이름 수정 대상이 아닙니다.
- 자체 SQLite·프론트 서비스/hook/실제App 라이브러리 회귀와 controller 모의 두 곳을 갱신했습니다. `project_trash_tests.rows`의 기존 행 대조를 테스트끼리 재사용하며 정리 대상은 자체UUID 임시폴더뿐입니다.

### 3. 테스트 결과

- `cargo test … project_metadata -- --nocapture`: **4개 성공**,0.40초/컴파일37.41초. 전체 다른 테이블/다른 프로젝트 행·revision/자산/원본 바이트·재열기/아티스트 비우기/동일값/충돌/취소·DB실패/보관·활성연습/시각상한을 확인했습니다.
- 첫컴파일에서 존재하지 않는 Result.is_err_or와 rusqlite0.40.2의 u64 ToSql 미지원으로 실패했고 기존is_ok_and·검증한i64 변환으로 해결했습니다. 확장Clippy의 테스트모듈 배치 경고는 모듈을 파일 끝으로 이동해 해결했습니다. `cargo clippy … --all-targets --all-features -- -D warnings` **성공**,9.87초·`cargo +1.90.0 check … --all-targets --all-features` **성공**,17.55초.
- 프론트 대상 최초29개 성공/서비스suite1오류는 모의isTauri 누락이었고 모의를 보완했습니다. TypeScript의 배열분해 undefined 오류는 검사 입력을 리터럴tuple로 한정해 해결했습니다. 최종 `pnpm exec vitest run src/features/library/projectMetadata.test.ts src/features/library/useProjects.test.tsx src/features/library/LibraryPage.test.tsx src/features/library/projects.test.ts`: **39개/4파일 성공**,3.31초. 늦은취소/오류·세션/재생 보존·폼/실제목록을 포함합니다.
- 전체프론트/확장Rust·최종 타입/lint/포맷·Vite/Windows·독립ZIP/원격은 현재 검사 중입니다. 실제Windows 폼조작/개인프로젝트 변경·기타입력/새OS는 **미실행** — 자체 자료의 계약/연결 검사와 구분하고 사용자 앱/데이터를 유지합니다.
- 이후 `pnpm test` **506개/108파일 성공**,45.28초와 `cargo test … --all-features` **248개 성공/28개 환경 의존 기본 제외**,19.36초를 확인했습니다. 로그 `project-metadata-front-20261026.log`/`project-metadata-rust-20261026.log`를 보존합니다. 린트가 금지한 제어문자 범위정규식은 기존 공통패턴인 Unicode Cc로 바꿨고 관련32개/3파일을3.19초에 재확인했습니다. 최종타입은 성공이며 lint/포맷·Windows/패키지·원격은 별도 결과로 기록합니다.

### 4. 미구현 및 알려진 문제

자동 병합·프로젝트 내부 악보 제목/원본 파일명 수정은 제공하지 않습니다. 충돌 시 최신목록/프로젝트를 다시 읽은 뒤 수정해야 하며 기존 미저장 확인을 우회하지 않습니다. 별도Windows10/11·고급 주법/특화모델·전체출시 수용은 이 기능으로 대체하지 않습니다.

### 5. 다음 작업 계획

현재 전체검사/빌드 결과와 문서를 확정하고 다음 독립 F-01 기능인 라이브러리 검색을 이어갑니다. 검색은 로컬 요약만 사용하고 새 I/O/전송·목록/세션 변경을 만들지 않는 범위부터 진행합니다. 사용자 승인을 다시 요청하거나 이전 기능을 불필요하게 재작성하지 않습니다.

### 정보 수정 로컬 빌드 확정

`pnpm build` **성공**,Vite49.09초/기존큰chunk 경고. 최종내장 `cargo test … --all-features bundle_tests -- --nocapture` **4개 성공**,0.00초와 `cargo build … --features custom-protocol` **Windows 빌드 성공**,12.04초/기존MSVC 안내를 확인했습니다. 해당로그는 `project-metadata-build-20261026.log`/`project-metadata-bundle-20261026.log`/`project-metadata-native-build-20261026.log`입니다. 전체506프론트·248확장Rust/Clippy/MSRV와 최종타입/lint 성공을 포함합니다. 한 차례포맷 실패는 새서비스를Prettier로 정리해 최종포맷 성공으로 해결했으며 기능을 완화하지 않았습니다. 실제Windows 폼/사용자프로젝트·새ZIP/원격은 후속으로 유지하고 바로 검색슬라이스를 진행합니다.

## 1. 작업 개요

- 시작일·완료일:2026-10-14. **완료(Phase 4 수용 조건)**.
- Phase 3의 실제 USB 오류·MISS 증가 중단·재연결 복구와 자동 검증을 확인한 뒤 착수합니다.
- 목표:SQLite migration·프로젝트/asset/악보 revision, 실제 session/attempt/event 영속 기록, 결과/마디 히트맵, 재실행·누락 원본 재연결·안전 저장과10회 기록 복구.

**현재 상태**: 제품 반영·통합 검사·문서화 및 실제 앱 재실행 복원까지 완료했습니다. 마지막 사용자 결과는 “잘 열리고 그대로 표시 댐”으로 프로젝트/악보·음원/0.5×/4,000점 시도·마디별 결과 유지 확인입니다. 제품 verify:app110개 프론트/30파일·Rust80개(장치 열거1개 제외), custom-protocol 번들 검사1개 및 Windows 제품 빌드 성공. 아래 후보/미실행 기록은 당시 이력이며 현재 제약과 최종 미실행 범위는 마지막 완료 절을 우선합니다.

## 2. 구현 및 변경 사항

제품은 프로젝트 생성/선택 원본의 복사·참조/안전 revision 저장/재연결과 실제 연습 기록·결과 조회를 지원합니다. 다음 후보 단계 이력은 기존 검증 중 앱을 방해하지 않기 위해 별도 폴더에서 구현·검사한 과정을 보존한 것입니다.

검토한 의존성은 rusqlite0.40.2(MIT, bundled SQLite)와 sha2 0.11.1(MIT OR Apache-2.0, Rust1.88)이며 후보 컴파일을 통과했습니다. native 승인 파일 선택에 tauri-plugin-dialog2.8.2(MIT OR Apache-2.0, Rust1.90)를 선정하고 현재 Rust1.98/Tauri2.12.3에서 후보 컴파일 성공. 기본 cargo info는3.0.0-alpha.3을 반환했으므로 알파를 설치하지 않고 `cargo info tauri-plugin-dialog@2`로 안정2.x를 확인했습니다. 후보 MSRV는1.90이며 제품 반영 때 함께 갱신합니다. npm dialog SDK/광범위 파일·shell 권한 추가 없음. 임의 모델/개인 오디오 전송 없음.

### 현재 후보 파일 및 구현 범위

아래 경로는 당시 `src-tauri/target/phase4-stage/src/` 기준입니다. 완료 시점에는 모두 제품 `src-tauri/src/`로 반영했습니다.

- `storage/project_model.rs`: 실제 normalized score·workspace·project/asset 모델, ID/수치/관계·파일 크기 검증. 기존10~600 BPM/비현악 트랙과250ms loop 한도를 유지합니다.
- `storage/database.rs`, `storage/migrations/001-projects.sql`: version1·외래키/WAL/FULL/busy timeout, 신규/미래/손상 DB 대응과 앱 폴더 내부 경로 검사.
- `storage/projects.rs`: 프로젝트 목록·managed copy/reference·SHA256 중복/손상 확인·동일 원본 재연결, 불변 revision 파일·낙관적 DB commit·마지막 정상 head 유지. 취소·바이트 진행 및 원본 비파괴.
- `storage/practice_records.rs`: 저장 악보/구간의 전체 목표를 native에서 검증, 불변 config fingerprint·native snapshot/event transaction, sequence 유실·중복·hash 손상 검사, 전체 이벤트 페이지 조회와 INTERRUPTED 기록 복구.
- `judgement/practice.rs`: 선택적 archive 요청과 native service 저장 연결. 저장 실패 시 새 판정을 중단하고 남은 목표 제외·동일 미저장 이벤트 재시도,128개 화면 이력과 별도 전체 dirty 이벤트 유지. 기존 archive 없는 메모리 동작 보존.
- `storage/jobs.rs`: 한 번에 한 파일 작업, 진행·취소 요청/실제 완료 구분, 오래된 작업 취소가 새 작업을 건드리지 않도록 ID 확인, binary 결과1회 소비. native picker/commands 연결은 이어서 구현합니다.
- `storage/projects_tests.rs`, `judgement/practice.rs` 테스트: 실제 임시 SQLite/files·native 합성 입력으로 검증하며 해당 입력을 사용자의 실제 연주 기록으로 표시하지 않습니다.

### 후보 UI/명령 연결 진행

- `commands/storage_api.rs`, `app.rs`: picker 승인 파일만 읽는 command/job·취소·raw binary 전달과 Tauri builder 등록을 후보에 구현하고 컴파일/Clippy를 통과했습니다. 앱 시작 시 DB 실패가 튜너/메모리 연습까지 종료시키지 않도록 오류를 분리합니다.
- 프론트 후보 `src-tauri/target/phase4-web/src/`: `entities/scoreValidation.ts`, `features/library/projects.ts/useProjects.ts/ProjectStatus.tsx/LibraryPage.tsx`의 strict 계약·취소·프로젝트 생성/복원/원본 선택/저장 UI, `features/practice/records.ts/ResultsPage.tsx`의 전체 이벤트/가중치 정확도·히트맵·타이밍·동일 조건 최고 기록을 연결했습니다. app/scoreSession/usePractice/ScorePanel에 저장 context를 연결하며 프로젝트 없는 기존 연습은 유지합니다.
- `completedOrder`로 동점의 첫 완료 순서를 보존하고 throughSequence로 조회 중 증가하는 이벤트의 상한을 고정했습니다. JSON/hash·연속 sequence·최종 note ID 중복·판정 수/총점을 검사합니다.
- 후보 Front TypeScript/ESLint 경고0·전체109개/30파일 검사 성공. production Vite build 성공(큰 alphaTab chunk 경고 유지).
- `src-tauri/target/phase4-app/`의 실제 Tauri context/builder와 프론트 번들을 포함한 Windows 실행 파일 빌드 성공(`cargo build --features tauri/custom-protocol --target-dir src-tauri/target/phase4-stage/target`). **실행은 아직 미실행**이며 기존 native19424/15:28:24를 유지했습니다. 이후 수정한 관리용 복구/UI는 최종 빌드에 다시 반영합니다.

Windows junction 실제 생성→앱 폴더 밖 경로 차단→원본 보존→junction 자체 정리 검사 성공. managed copy 누락/손상도 새 UUID 복구 파일과 asset 연결 갱신으로 처리하도록 보완합니다. 기존 파일과 원본을 덮어쓰지 않으며 복구 경로에도 고정 UUID/canonical 검사를 적용합니다.

### 최종 후보 자동 검증 및 실제 실행 준비

- managed 복구 회귀 성공: 손상된 기존 복사본·사용자 원본을 보존하고 새 UUID 파일로 복구, 같은 불변 악보 revision 재열기와 복구본 누락 후 재복구까지 확인했습니다. 재연결 작업도 재생을 일시정지한 뒤 수행합니다.
- 프론트110개/30파일 전체 검사 성공, TypeScript·ESLint 경고0·Prettier 성공. 추가로 직전 동일 조건 완료 시도 대비 실제 점수/정확도 차이 비교와 관련6개 회귀 성공. 누락된 음원을 열어도 audioAssetId와 저장 설정을 지우지 않도록 보완했습니다.
- Native80개 성공/실제 장치 열거1개 기본 제외. Windows junction·11개 저장소 검사,10회 native 합성 시도 복구·300개 이벤트·저장 실패·초기300개 SKIPPED·완료 순서/조회 상한 포함. 최종 fmt/clippy 및 후보 exe 최신 동기화·빌드 진행 중입니다.
- 테스트/빌드 결과는 **후보 폴더 기준**입니다. 제품 src/src-tauri source는 아직 Phase 3 버전이며 새 후보를 실행해 native IPC·file picker·저장/복원 동작을 확인한 뒤 반영합니다. 기존 앱 자동 종료 없음.

최신 최종 후보 exe 빌드 성공: `src-tauri/target/phase4-stage/target/debug/guitarlab-phase4-preview.exe`(custom-protocol로 검증한 최신 프론트 포함). 설치된 Tauri2.12.3/tauri-build2.7.2/tauri-macros2.7.2 source에서 custom-protocol이 DEV=false 및 번들 자산 사용을 결정함을 확인했습니다. 기존1420 개발 화면에 의존해 새 UI를 검증했다고 오인하지 않습니다. 실행과 실제 프로젝트 저장/복원은 아직 미실행입니다. 기존 앱19424/15:28:24 및 세션10876를 유지하고 사용자에게 기존 창 종료를 요청한 뒤 새 후보를 실행할 예정입니다.

## 3. 테스트 결과

| 명령/검사 | 결과 |
|---|---|
| `cargo info rusqlite@0.40.2`, `cargo info sha2` | 성공: 실제 배포 metadata 확인 |
| 초기 후보 `cargo check` | 실패: test용 lib에 기존 main 자동 검색. autobins=false로 검사용 구성 보완 |
| 최초 저장소 `cargo test` 컴파일 | 실패: SQLite u64 미지원·SHA2 0.11 출력 LowerHex 미지원·Read/Write by_ref 경합. checked i64 변환·명시적 hex·Read 호출로 해결 |
| 저장소9개 검사 최초 실행 | 실패1개: 손상 fixture가 기존과 같은'x' 바이트를 썼음. 실제 바이트 변경 후9개 성공 |
| 후보 저장소 전체 Rust 검사/Clippy | 성공:69개·실제 장치 열거1개 제외/경고0 |
| native 기록 추가 후 전체 Rust 검사/Clippy | 성공:73개·제외1개/경고0,10회 matcher 기록 재열기·중복 저장·300이벤트 보존·중단 복구 포함 |
| 저장 실패/초기300개 제외 전체 flush 회귀 | 성공: 관련5개 및 Clippy 경고0 |
| dialog2.8.2 추가 후보 `cargo check` | 성공: 현재 Tauri2.12.3/Rust1.98 컴파일 |
| 앱 재실행 복구·10회 실제 연습 기록 | 미실행: 저장 연결 구현 전 |
| TypeScript/린트/빌드·Python | 미실행: 해당 Phase 제품 코드 반영 전 |

### 제품 소스 반영 후 통합 검사 — 2026-10-14

- 실제 결과 화면: 사용자가 ‘마디별 정확도 표시 되고’라고 확인했습니다. ‘결과 표시 정상·닫았습니다’는 사용자 답변 예시였으며 제품 UI 문구가 아니라고 안내했습니다. 이어 프로세스 조회에서 GuitarLab 창 종료를 확인해 검증 중인 앱을 직접 종료하지 않았습니다.
- 후보/제품의 파일 hash를 비교해 변경된24개 프론트 파일과13개 Rust/SQL 파일만 반영했습니다. 원본 기능 소스 삭제 없음. 제품 Cargo MSRV1.90·3개 직접 의존성·표준 custom-protocol feature, Cargo.lock26개 전이 패키지 추가 및 Vite 후보 테스트 제외를 반영했습니다. 원래 제품 frontendDist=`../dist`를 유지합니다.
- `cargo check --offline --manifest-path src-tauri/Cargo.toml`: 성공. 기존 캐시에서 lockfile 및 제품 컴파일 확인.
- `pnpm verify:app`: **성공**. TypeScript/ESLint,110개 프론트/30파일, Vite production build, Prettier, Rust fmt/Clippy,80개 Rust 성공·장치 열거1개 제외. 테스트 대상에 후보 복제본을 포함하지 않았습니다.
- Vite 큰 alphaTab chunk 안내가 남습니다. Rust test의 MSVC linker는 DLL import library 생성 안내를 warning으로 출력했지만 검사는 성공했습니다. Clippy -D warnings는 성공했습니다. 이 안내를 입력/저장 오류로 해석하지 않습니다.
- Python은 변경하지 않았고 이번 Phase에서 **미실행**입니다. 앱의 제품 실행 파일 빌드·재실행 후 영속 복원은 다음 확인으로 남습니다.

- 제품 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`:1개 성공. 실제 제품 설정의 디렉터리와 내장 index.html/JavaScript를 검증했습니다.
- 제품 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`:성공. `src-tauri/target/debug/guitarlab.exe`(21,810,688바이트,2026-10-14 19:34:08 KST) 생성. 기존 창이 없는 상태에서 이 제품 파일을 재실행해 기존 프로젝트/0.5×/4,000점 기록 복원을 확인합니다. 실제 재실행 복원 결과는 아직 대기 중입니다.

공식 참고:[rusqlite0.40.2](https://docs.rs/rusqlite/0.40.2/rusqlite/struct.Connection.html), [SQLite PRAGMA](https://sqlite.org/pragma.html), [SQLite atomic commit](https://sqlite.org/atomiccommit.html).

## 4. 미구현 및 알려진 문제

완료 시점: 수동 저장을 제공하며 편집 자동 저장은 Phase 5에서, 프로젝트 JSON/ZIP 백업·정리와 배포 고지는 Phase 8에서 구현합니다. 녹음/AI/다중 기타 역할 UI는 후속 Phase 범위입니다. 첫 음의 판정 창이 준비 전에 시작되면 SKIPPED로 제외될 수 있으며 준비 시간의 입력/clock 사전 연결은 미구현입니다. 프로젝트 목록은 최대1,000개이며 시도 목록은 아직 페이지 구분이 없어 대규모 기록 최적화가 필요합니다. 저장 실패의 미참조 파일은 자동 삭제하지 않고 원본 보존을 우선합니다. 실제 Rust1.90 검사·강제 프로세스 종료/전원 차단·실제 사용자10회 연주·신규 화면의 DPI 스크린샷/Python은 미실행입니다. 정상 종료/재실행 복원, native10회 합성 기록, 저장 오류/중단 복구 회귀는 실행 성공했습니다.

다음 문단은 제품 반영 전 제약 이력입니다.

제품 source 반영·실제 Tauri IPC/file picker/저장·재실행은 미실행입니다. 후보에는 관련 UI/command·앱 시작 관리·히트맵을 구현했지만 현재 앱에서 동작한다고 표시하지 않습니다. 후보의10회 기록은 합성 입력/native matcher→SQLite→재열기 범위이며 실제 데스크톱10회 연주/종료·재실행은 미실행입니다. Windows junction 차단은 실제 검사 성공했습니다. 기존 보정 JSON과 메모리 기록을 새 영속 기록으로 오인하지 않습니다. 취소·DB 실패로 남은 미참조 파일은 원본을 자동 삭제하지 않고 후속 복구/정리 UI에서 다룰 예정입니다. 실제 Rust1.90 실행은 미실행이며 현재1.98만 검증했습니다.

## 5. 다음 작업 계획

다음 Phase는 로드맵 순서의 **Phase 2A**입니다. 기존 트랙 선택/커서/단일 트랙 matcher를 유지하면서 guitar track 역할/안정적인 activePerformanceTrackId 저장과 두 기타 독립 fixture를 검증합니다. 다음으로 Phase 4A의 명시적 입력 REC·WAV 저장/복구를 구현합니다. 이미 사용자 데이터로 사용한 migration001을 다시 수정하지 않고 후속 DB 변경은 추가 migration으로 처리합니다. 현재 실행 중인 앱의 사용자 검증은 소스 변경·자동 재시작으로 방해하지 않습니다.

다음1~4항목은 초기 계획 이력입니다.

1. 버전/취소/오류·사용자가 선택한 파일 접근 계약을 docs/12에 확정합니다.
2. migration·managed/reference assets·sha256 재연결·불변 악보 revision과 낙관적 충돌 검사를 후보에 구현합니다.
3. Native practice session/attempt/event 기록과 frontend 프로젝트·결과 UI를 연결합니다.
4.10회 기록·재열기·원본 누락/재연결·중단/실패·경로 우회·이전 revision 보존을 검증하고 실제 앱에서 확인합니다.

## 실제 후보 실행 중 확인한 번들 경로 오류 — 2026-10-14

- 사용자가 기존 창 종료를 확인한 뒤 후보 실행을 시도했습니다. 프로세스 실행만으로 UI 성공을 판단하지 않았습니다. 첫 버튼 미노출 보고 당시에는 기존 Phase 3 실행 파일이 다시 실행되어 있었고, 후보를 별도로 실행해 사용자가 보내준 화면으로 실제 문제를 확인했습니다.
- 후보 창에 앱 UI 대신 `phase4-web/dist` 폴더 목록이 표시되었습니다. 후보 설정의 Windows 절대 경로가 설치된 Tauri의 `FrontendDist::Url`로 해석되어 번들 자산이 비어 있던 구성 오류입니다. 기존 제품 설정의 `../dist`는 이 오류에 해당하지 않습니다.
- 후보 `tauri.conf.json`을 `../phase4-web/dist`로 수정했습니다. 후보 Cargo에 표준 `custom-protocol` feature와 별도 `guitarlab-phase4-preview-ui` 실행 타깃을 추가해 열린 기존 창을 자동 종료하거나 실행 파일을 덮어쓰지 않습니다.
- 실제 `generate_context!()`가 디렉터리 설정 및 내장 `index.html`/JavaScript를 포함하는 회귀 검사 추가. `cargo test --locked --manifest-path src-tauri/target/phase4-app/Cargo.toml --features custom-protocol --lib bundle_tests --target-dir src-tauri/target/phase4-stage/target`: **1개 성공**, 기존81개는 이번 필터 검사에서 미실행입니다.
- 초기 일반 권한 `cargo fmt`는 Windows 경로 접근 거부로 실패했고, 권한 있는 동일 명령으로 성공했습니다. 프론트 소스는 변경하지 않았습니다. 수정된 후보의 실제 UI·저장/복원 확인은 아직 대기 중이며 Phase 4 전체 완료로 기록하지 않습니다.

### 실제 프로젝트 저장·복원 확인 — 2026-10-14

이어 실제 단음 연주 결과를 사용자 제공했습니다: epoch31/0.5×/보정45.82ms,4,000점/COOL1/GOOD6/MISS0/제외1/최고 콤보7/대상8음/정확도57.1%. 로컬 SQLite를 Python 표준 sqlite3의 `mode=ro`·`query_only`로 조회해 같은 시도가 FINISHED로 저장된 사실과8개 전체 이벤트, 요약/이벤트 SHA-256 및 sequence1~8 무결성을 확인했습니다. 첫 이벤트는 SKIPPED입니다. 사용자 오디오를 읽거나 전송하지 않았으며 임의 기록을 생성하지 않았습니다. 결과 화면 육안 확인과 앱 재실행 후 복원은 아직 미실행입니다.

현재 시작 구간 제약: matcher가 시작 전 판정 창을 충분히 관측하지 못한 음을 SKIPPED로 처리하므로 첫 음이 제외될 수 있습니다. 해당 시도의 COOL1+GOOD6=7음과 제외1음이 대상8음에 대응하며 콤보7/가중 정확도4÷7=57.1%는 올바른 계산입니다. 첫 음까지 온전하게 채점하려면 준비 시간의 입력/clock 사전 연결을 별도로 개선해야 합니다. 안전한 제외 규칙을 제거하거나 과거 판정을 만들어 보완하지 않습니다.

수정 후보 `guitarlab-phase4-preview-ui.exe` 빌드·실행 성공. 사용자에게 native picker로 자체 fixture 악보/음원 선택,0.5× 변경, 프로젝트 저장·다시 열기를 요청했고 “잘 불러와짐 0.5배속한거도 적용되어서 불러와지고”, “잘 불러와집니다.”라는 결과를 받았습니다. 실제 앱의 악보·음원 불러오기와 저장 설정 복원을 확인했습니다. ‘악보 저장됨’ 행의 원문은 별도 제공되지 않았으며 앱 종료/재실행 후 복원 및 실제 연습 기록·결과 화면은 아직 미실행입니다. 다음 확인 동안 소스·앱 실행 상태를 유지합니다.

## 최종 완료 기록과 주요 제품 파일 — 2026-10-14

마지막 실제 확인에서 제품 앱을 새로 실행한 뒤 저장 프로젝트·악보·음원·0.5×·4,000점 시도·마디별 결과가 그대로 표시된다고 사용자 확인했습니다. Phase 4 수용 조건과 문서화를 완료했습니다. 개인 입력 오디오는 파일로 기록하지 않았으며 네트워크 전송도 하지 않았습니다. 다음 Phase는 2A입니다.

주요 제품 변경 파일과 이유:

- `src/app/App.tsx`, `AppShell.tsx`, `App.test.tsx`: 프로젝트 컨트롤러·실제 저장 상태·결과 라우팅 연결과 회귀.
- `src/entities/scoreValidation.ts`: 저장 악보의 타입/관계/수치 런타임 검증.
- `src/features/library/LibraryPage.tsx`, `ProjectStatus.tsx`, `projects.ts`, `useProjects.ts`, `projects.test.ts`, `useProjects.test.tsx`: 실제 프로젝트 생성·조회·파일 선택·저장·복원·재연결과 취소/늦은 응답/누락 원본 회귀.
- `src/features/practice/practice.ts`, `usePractice.ts`, `usePractice.test.tsx`, `ScorePanel.tsx`, `ScorePanel.test.tsx`: 저장 revision/session 연결, 실제 native 기록과 메모리 표시 구분.
- `src/features/practice/records.ts`, `records.test.ts`, `ResultsPage.tsx`, `ResultsPage.test.tsx`: 저장 이벤트 검증·전체 조회·정확도/히트맵/타이밍·동일 조건 최고/직전 비교.
- `src/features/score/scoreSession.ts`, `ScoreWorkspace.tsx`, `src/shared/logger.ts`, `styles.css`, `src/test/projectFixture.ts`: 원본 asset/saved revision context·프로젝트 UI·오류 코드·결과 스타일·검사 fixture.
- `src-tauri/src/app.rs`, `lib.rs`, `commands/mod.rs`, `commands/storage_api.rs`: Tauri 시작/명령·native picker·job/progress/cancel·raw binary와 실제 번들 자산 회귀 검사.
- `src-tauri/src/judgement/practice.rs`: native snapshot·전체 dirty 이벤트 영속 저장, 저장 장애 시 판정 무효화·동일 미저장 내용 재시도.
- `src-tauri/src/storage/mod.rs`, `database.rs`, `jobs.rs`, `practice_records.rs`, `project_model.rs`, `projects.rs`, `projects_tests.rs`, `migrations/001-projects.sql`: SQLite version1·안전 파일/revision/asset·기록·중단 복구 및 실제 파일/DB 회귀.
- `src-tauri/Cargo.toml`, `Cargo.lock`, `vite.config.ts`: 검증한 안정 의존성/MSRV/번들 feature 고정과 후보 테스트 중복 제외.
- `README.md`, `docs/00-SCOPE-AND-DECISIONS.md`, `02-UI-UX-DESIGN.md`, `08-IMPLEMENTATION-ROADMAP.md`, `10-SECURITY-LICENSE.md`, `12-API-CONTRACTS.md`, `docs/progress/README.md`, `PHASE-04.md`: 실제 구현/계약/의사결정/라이선스/수용 조건·결과와 남은 기능 기록.

기존 소스/문서/사용자 원본 삭제 없음. 후보 빌드 폴더는 Git ignore 대상이며 제품 동작에 필요하지 않습니다. Git commit/push는 미실행입니다.
