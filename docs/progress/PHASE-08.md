# Phase8 — 품질·릴리스

## 후속 — Windows 캐시 복원·전체 회귀 수용 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 같은 이미지/도구/manifest 키의 첫 저장과 다음 실행의 복원을 실제 GitHub에서 확인했습니다. 이 CI 슬라이스/문서화 완료이며 전체 Phase8·별도 Windows10/11/최종배포 수용은 아닙니다.

### 2. 구현 및 변경 사항

앞선 verify.yml의 제한 경로/고정 공식 action만 유지합니다. 키는 Windows-X64/이미지20261021.278.1/Rust1.98·MSRV1.90/지문ec5dc255…이며 다른 이미지/manifest fallback은 없습니다. registry/debug 컴파일 산출물 약1153MiB(1209406907바이트)만 보존했습니다. 복원 여부로 검사 단계를 생략하지 않았고 release/AI 모델·개인 데이터는 캐시에 넣지 않았습니다. 새 quickstart는 README에서 연결되며 별도 실제 사용자 절차 수용은 미실행입니다.

### 3. 테스트 결과

- ef47a74/[첫 실행40005460026](https://github.com/BomJin2/GuitarLab/actions/runs/40005460026)/job120592111571: cache miss→전체 검사 성공→post 성공 저장.
- d7fc385/[복원 실행40008147793](https://github.com/BomJin2/GuitarLab/actions/runs/40008147793)/job120601256024: 정확한 키 cache hit/1153MiB/복원 성공→모든 검사/사후 정리 success. 이 실행은 JSON 정수 혼동 수정/빠른 시작/후속 문서를 포함합니다.
- 복원 실행: 타입/ESLint·프론트436개/102파일·Vite 빌드/포맷·Rust fmt/Clippy·기본Rust228개/36.17초·확장231개/34.92초(각26개 제외)·native synthetic1개/0.35초·AI113개/2.77초·개발 도구108개/19.240초·최소Rust1.90 전체targets/features12.01초 **성공**. runner2.338.0의 Node24 action도 정상입니다.
- 실제 job 메타데이터(대기열 제외): 첫 실행898초(14분58초)→복원558초(9분18초), 관측 차이340초입니다. 같은 설정의 두 실행이지만 서로 다른 실행기 부하/이번 Rust 소스 무변경 조건도 포함하므로 고정적인 단축률로 보장하지 않습니다. Clippy122초→9.29초, 최소Rust101초→12.01초를 로그에서 확인했습니다.
- 새 앱 실행·실장치/모델/다른 Windows10/11·이미지 값 없는 실행기는 **미실행**입니다. 제품 코드를 바꾸지 않았고 기존 검사/리소스/사용자 상태를 유지했습니다. 이 명시적 비교 이후 새 제품 변경이 없으므로 같은 검사를 불필요하게 다시 반복하지 않습니다.

### 4. 미구현 및 알려진 문제

새 이미지/도구/의존성·workflow 키에서는 의도적으로 처음부터 빌드합니다. 캐시가 없거나 보관 한도 때문에 사라져도 잠금 설치/전체 회귀는 계속 실행합니다. 별도 Windows 장치·오프라인 모델 첫 설치/서명·최종배포는 기존 수용 조건으로 남습니다.

### 5. 다음 작업 계획

이번 실제 성공/후속 R&D 기각 결과·안내/남은 조건을 Git에 정리합니다. 현재 수용 앱을 임의로 재시작하거나 보존 데이터/모델을 교체하지 않습니다. 이후 판정/특화 모델은 참조·조건 문제가 해소된 검증 범위에서만 이어갑니다.

**캐시 첫 저장 — 2026-10-24**: ef47a74의 [Windows40005460026](https://github.com/BomJin2/GuitarLab/actions/runs/40005460026)/job120592111571은 전체/사후 정리까지 success입니다. Windows 이미지20261021.278.1/Rust1.98·1.90/키ec5dc255…에서 cache miss 뒤 성공 저장을 확인했습니다. 프론트436·기본228/확장231Rust(각26제외)·synthetic1·AI113/3.51초·도구107/45.457초·MSRV1.90/1분41초 성공입니다. 같은 키 재사용/시간 개선은 아직 미확인입니다. 다음 strict JSON 수정108개와 안내 문서를 push해 캐시 복원과 전체 회귀를 확인합니다. 아래 미실행/진행 중은 이력이며 전체 Phase8·별도 Windows 수용은 미완료입니다.

## 후속 — 초보 사용자 빠른 시작 안내 (2026-10-24)

### 1. 작업 개요

문서 작성 완료일2026-10-24. 사용자가 기타 초보 수준이라고 알려준 점과 반복된 장치/모니터/REC 혼동을 반영해 현재 기능을 따라가는 한국어 안내를 추가했습니다. 제품 기능 추가·재설계나 전체 출시 수용은 아닙니다.

### 2. 구현 및 변경 사항

`docs/21-QUICKSTART.md`에 입력 시작/실시간 듣기/파일 녹음의 차이, SSL Input1·PC 기본 출력/기본 모니터 꺼짐, 프로젝트/악보 저장, 무반주5초 녹음·READY/다시 듣기, 반주 정렬/3초 준비·REC 비활성 이유, 음소거/볼륨·GAIN 구분과 복구를 정리했습니다. 수동0ms는 연결 확인용 임시값으로만 설명하고 채점 정확도를 주장하지 않습니다. 리드/리듬 자동 분리·고급 채점 미수용과 YouTube 공식 플레이어 범위를 유지합니다. README에서 안내로 연결했습니다.

### 3. 테스트 결과

입력/모니터·프로젝트/보정/녹음/재생 컴포넌트의 실제 버튼·기본값/활성 조건을 읽어 대조했고 새 문서의 로컬 링크2개 **정상**을 확인했습니다. `git diff --check` **성공**입니다. 문서 작성 절차를 새로운 Windows 앱에서 처음부터 따라가는 수동 검사는 **미실행** — 현재 앱을 재실행/입력·REC하지 않았습니다. 기존 사용자 수용과 회귀 결과를 이 새 안내 순서의 실제 수용으로 바꾸지 않습니다. 문서는 Prettier 제외 대상이므로 형식 자동 검사 완료로 기록하지 않습니다.

### 4. 미구현 및 알려진 문제

현재 최소 UI 기준 안내라 후속 리디자인에서 버튼 위치/명칭을 다시 확인해야 합니다. 단음 점수/정렬 보정·실제 악보의 주법 지원 한계와 모델/별도 Windows 검증 제약은 그대로입니다.

### 5. 다음 작업 계획

진행 중인 제한 Rust 캐시의 첫 성공 저장과 동일 키 재사용/전체 회귀를 확인합니다. 사용자 입력/녹음 없이 가능한 검사를 마무리하고 남은 외부 수용 조건을 진행 문서에 유지합니다.

## 후속 — Windows 회귀의 제한 Rust 캐시 (2026-10-24 진행 중)

### 1. 작업 개요

작업 시작일2026-10-24. 매번 새 실행기에서 전체 Rust 의존성을 컴파일하는 비용을 줄이되 기존 회귀/최소 버전 검사는 모두 재실행합니다. 현재 설정/로컬 형식 검증 단계이며 실제 캐시 저장/재사용·시간 단축 수용은 **미완료**입니다.

### 2. 구현 및 변경 사항

`.github/workflows/verify.yml`에 GitHub 공식 actions/cache6.1.0/고정 SHA55cc8345863c7cc4c66a329aec7e433d2d1c52a9를 추가했습니다. [공식 release](https://github.com/actions/cache/releases/tag/v6.1.0)와 고정 action.yml의 node24·성공 때만 저장 조건 및 MIT 고지를 확인했습니다. 현재 실행기에서 이미 쓰는 checkout/setup-node/setup-python과 같은 Node24 세대이며 직전 실제 runner2.338.0이 최소2.327.1보다 높습니다.

Windows 이미지 버전/OS·arch/고정 Rust1.98·MSRV1.90/워크플로·Cargo.toml/lock 지문이 모두 같은 키만 사용합니다. 이미지 버전을 알 수 없으면 캐시 단계를 건너뜁니다. 공개 registry와 debug deps/build/.fingerprint만 보존하고 incremental은 끕니다. release/설치 결과·AI runtime/모델·AppData/개인 녹음/외부 표본은 경로에 넣지 않았습니다. 다른 키의 광범위한 fallback은 없으며 캐시 적중 여부로 검사를 생략하지 않습니다. 독립 설치 workflow는 기존 캐시 없는 경로를 유지합니다.

### 3. 테스트 결과

`pnpm exec prettier --check .github/workflows/verify.yml`·`git diff --check` **성공**. 도구 준비의 pip 실패 exit는 유지하며 이미지 값만 GITHUB_OUTPUT에 추가합니다. 실제 GitHub 첫 캐시 없음/성공 저장·다음 실행의 같은 키 복원과 모든 회귀 재실행은 **미실행**, 다음 push/후속 실행으로 확인합니다. 속도 향상 수치는 아직 측정하지 않았습니다. 새 라이브러리/앱 빌드·사용자 창 재실행은 필요 없어 **미실행**입니다.

### 4. 미구현 및 알려진 문제

캐시의 다운로드/업로드 용량·실제 총 시간 이득은 실행기에서 확인해야 합니다. 이미지/의존성·워크플로가 바뀌면 의도적으로 새로 빌드하며 이 작업이 clean Windows10/11·서명/최종배포 수용을 대신하지 않습니다.

### 5. 다음 작업 계획

직전 Phase7 회귀40002809031은 사후 정리까지 success를 확인했습니다. 캐시 설정과 보존된 후속을 push합니다. 첫 저장/재사용의 원격 로그·시간을 확인하고 실패하면 검사 범위나 잠금 설치를 줄이지 않고 캐시 경로/조건만 수정합니다.

## 후속 — 새 체크아웃의 런타임 재현성 및 격리 설치 CI (2026-10-23)

**최종 결과**: 인자 전달 수정 d17d2b4의 원격 설치39966416447/job120457341775와 전체 회귀39966416679/job120457479390는 사후 정리까지 모두 success입니다. 현재 PC·GitHub Windows Server2025 두 환경에서 이 설치 슬라이스를 완료했습니다. 아래 구현 중/첫 실패는 과정 기록입니다. 실제 별도Windows10/11·서명/최종 배포 완료가 아닙니다.

### 1. 작업 개요

작업 날짜2026-10-23. 개발 PC의 기존 리소스를 복사한 결과와 별개로 새 Windows 실행기가 고정 원본에서 설치기를 준비하도록 자동화합니다. 구현/로컬 검증 중이며 원격 결과·실제 Windows10/11 사용자 PC 수용·전체 Phase8 완료는 아닙니다.

### 2. 구현 및 변경 사항

- `scripts/prepare_ci_installer.py`: 고정 CPython3.12.15 stripped/full 원본 두 개 합계65,751,269바이트의 경로/주소/크기/SHA를 검증합니다. 캐시가 없을 때 명시적 `--download-runtime`만 다운로드를 허용합니다. AI 가중치/개인 자료는 받거나 전송하지 않습니다. 실패/취소 시 자신의 새 partial만 정리하고 기존 파일은 보존합니다.
- `scripts/prepare_validation_installer.py`: 검증된 명시적 리소스 경로도 받아 현재 사용자 앱의 portable 후보 영수증 없이 새 격리 설정을 생성합니다. 기존 후보/설정/AppData·제품 프로세스를 변경하지 않습니다.
- `.github/workflows/installer-smoke.yml`: 기존 고정 Actions·Node22/pnpm9.14.3/Rust1.98/Python3.13.16을 재사용해 고정 설치기·독립 검사 도구를 빌드하고 기본PowerShell5.1로 설치/첫 실행/정상 종료/제거·보존을 확인합니다. 모델 추론이나 깨끗한Windows10/11 수용으로 확대하지 않습니다.
- `ai/models/runtime-bundle-lock.json`: 새 Git checkout을 준비하며 worker3개(model_cache.py/runtime_packages.py/worker.py)의 기존 CRLF 지문과 Git LF blob 차이를 발견했습니다. 소스 의미 변경 없이 LF로 정규화하고 새3393개 목록에서 해당3개 지문/크기만 갱신했습니다. 파일 총합64,095,996→64,095,466바이트, 나머지3390개 동일입니다. 이전 불변 리소스/실행 앱의 내장 lock·설치 이력은 유지합니다. `docs/12`에 계약을 먼저 기록했습니다.
- 두 준비기 테스트에서 다운로드/캐시 보존·변조/크기/경로·취소·동시 게시·명시적 리소스/후보 부재 경계를 검증합니다.

### 3. 테스트 결과

- 새/기존 설치 준비 검사12개 **성공**(1.087초). 전체도구80개 수행 **79성공/링크권한1제외**(8.645초).
- `python -B -X utf8 -m pytest ai/tests -q`: 제한 실행의 임시 rename WinError5로14실패/99성공 후, 코드 변경 없이 같은 일반 Windows 검사에서 **113성공/2.67초**. 제품 실패로 숨기거나 접근 제약을 제품 코드로 우회하지 않았습니다.
- 새 lock과 이전 lock의 목록/모든 지문 대조 및 변경3개 소스의 실제 바이트=Git HEAD LF blob **성공**. `--refresh-lock`은 개발 수동 준비1회에만 사용했으며 CI 준비기는 갱신하지 않습니다.
- 실제 `python scripts/prepare_ci_installer.py` 캐시 재사용 **성공**. 새 리소스 c1f06f7b-fc00-4232-be25-f72e6bb1209c/3393개 전수 SHA·현재 portable 영수증 보존, 네트워크/모델 다운로드 없음입니다. 새 release 계획 f6f193ca-1ef3-4d4f-841a-3b349e227fdf·lock SHA191c1e80…을 생성했습니다.
- 새 workflow Prettier 구문/포맷·Python4개 구문·CRLF 고정 자료를 고려한 diff 검사 **성공**. LF 리소스의 최적화 앱 컴파일1분23초·NSIS 생성 **성공**이며 독립 검사 도구는 빌드 중입니다. 해당 설치 실행/원격 workflow는 아직 **미실행**입니다.
- 직전 소스df8ff43의 [원격39961565269](https://github.com/BomJin2/GuitarLab/actions/runs/39961565269)는 프론트436·Rust228/231(각26제외)·AI113·도구74·최소Rust1.90·사후 정리까지 **success**입니다. 새 CI 준비기 검증과 구분합니다.

### 4. 미구현 및 알려진 문제

GitHub Windows 실행기는 개발 도구/관리자 토큰/WebView2가 있는 서버 이미지일 수 있습니다. 실제 OS/권한을 기록하며 `cleanWindowsValidated=false`를 유지합니다. 별도 Windows10/11 장치·서명/최종 고지 검토·독립 모델 품질 수용은 미완료입니다. 사용자 수용 앱24920/PTY11472와 이전 CRLF 불변 리소스는 그대로 유지합니다.

### 로컬 최종 결과와 첫 원격 실패

- 새 앱/검사 도구 최적화 빌드 각각1분23초/1분36초·NSIS **성공**. 새 설치기 SHA `3c4a298e10eaa49f9de4203adfc6affbecdecbfc114acec7fd022ace71e56e9f`, 설치 본문22,095,360바이트/SHA0643ed47…입니다.
- 기본PowerShell5.1의 실제 새 UUID 설치/전체 지문·새v9/quick_check/빈 프로젝트·정상 종료0/APP_EXITED/최소 PATH 독립Python3.12.15 두 번/제거 후 DB·미등록 파일 보존 **성공**. 관리자 토큰false, installer-tests/85072ce6-a97f-44c3-86f6-cad61a9b6250/receipt.json 보존입니다. 제품16테이블/모델4marker 전후 동일·기존PID24920의 정확한 창/응답도 확인했습니다. 새 LF 설치기의 별도 Defender 재검사는 **미실행**이며 앞 절의 다른 SHA 검사로 대신하지 않습니다.
- cc11fe8의 [원격 설치39965890095](https://github.com/BomJin2/GuitarLab/actions/runs/39965890095)/job120455541572: 프론트/타입·공식 두 원본 명시 다운로드·새 lock3393개 대조 **성공**, 빌드 단계는 pnpm shim이 -- 구분자를 잃어 Tauri가 --locked를 잘못 읽는 오류로 **실패**, 설치 실행은 **미실행**입니다. 설치한 공식 @tauri-apps/cli2.12.2의 tauri.js/process.argv를 확인하고 CI에서 Node 진입점을 직접 호출하도록 수정합니다. 제품/dev 명령이나 패키지 버전은 변경하지 않습니다.
- 후속 d17d2b4: 실제 PowerShell7→Node에서 공백 경로·--/--locked가 모두 보존됨을 확인했습니다. 새 설치39966416447/job120457341775는 직전 인자 오류 지점을 넘어 최적화 빌드 중이며 새 기능 회귀39966416679도 진행 중입니다. cc11fe8 기능 회귀는 수정 push로 cancelled이며 실패/성공으로 바꾸지 않습니다.
- 새 LF 설치기 SHA3c4a298e…의 Defender 단일 파일 검사 **종료0/탐지 없음/SHA 보존 성공**입니다. 정의1.461.161.0/2026-10-23·기존 보호켜짐을 기록한 lf-installer-defender.json을 보존합니다. 앞의 ‘새 LF 파일 검사 미실행’은 이 실행 전 상태이며 다른 SHA의 검사로 대신하지 않았습니다.
- 새 lock의 persistent_files(runtime/·notices/)와 기존 사용자 앱 데이터의 영구Python3.12.15를 읽기 전용 대조해 **3358개 전수 목록/크기/SHA 일치·기존 모델4marker 보존 성공**입니다. worker는 영구 runtime 대상이 아니며 새 리소스에서 따로 읽는 기존 설계를 확인했습니다. lf-persistent-compatibility.json을 보존하며 이번 검사에서 모델 추론/설치·worker 교체는 실행하지 않았습니다. 재설치가 필요 없다는 파일 호환 증거와 실제 모델 전체 재수용을 구분합니다.

### 5. 다음 작업 계획

새 LF 패키지의 격리 설치/독립Python을 먼저 확인하고 Git에 반영한 뒤 두 원격 workflow 결과를 추적합니다. 실패하면 실제 단계/원인을 수정하고 원래 앱·자료를 보존합니다. 별도 OS 성공도 실제 Win10/11 장비 부재를 해소한 것으로 표시하지 않습니다.

### 수정 후 원격 설치 최종 증거

소스 d17d2b454ad000736a61d1c6274e149610db1a0b의 [Windows39966416447](https://github.com/BomJin2/GuitarLab/actions/runs/39966416447)/job120457341775는 **전 단계/사후 정리 success**입니다. GitHub 이미지 Microsoft Windows Server2025 Datacenter/10.0.26100/build26100·관리자 토큰true 환경이며 currentUser 격리 등록/설치만 검사했습니다. 현재 PC의 관리자 토큰false 결과와 구분합니다.

- 새 체크아웃/공식 두 원본 수신·3393개 lock/프론트·타입·최적화 앱7분15초/독립 검사 도구2분47초·NSIS 생성 **성공**.
- 원격 설치기 SHA `c0402978125b59c3c56f040dae5fc334500733e660068ebfda9c64a3c2c2e4e5`. 설치 본문22,097,408바이트/SHA3cee87bf…·NSIS 표식 외 일치·runtime3393개/고지·새v9/quick_check/빈 프로젝트·REC없음·정상 종료0/APP_EXITED·최소 PATH 독립Python3.12.15 두 번 **성공**.
- 제거 등록 소멸·파일 제거·검증 DB/미등록 파일 지문 보존 **성공**. 원격 영수증 installer-tests/0e11dd0c-6918-4e19-840e-b4fdbdbcbc5a/receipt.json은 해당 실행 로그에 포함됩니다. 설치/학습·모델 추론·기타 입력·네트워크 없는 Win10/11 첫 설치를 검사한 것으로 확대하지 않습니다.
- 이 후속 구현/설치 검증은 완료입니다. 소스의 전체 기능 회귀39966416679 최종 확인과 문서/Git 정리를 계속합니다. 별도Windows10/11 장비·고급 판정 정답/모델 조건·최종 고지/서명은 남은 단계 조건으로 유지합니다.

### 전체 회귀 최종 결과

[Windows39966416679](https://github.com/BomJin2/GuitarLab/actions/runs/39966416679)/job120457479390 역시 **전 단계/사후 정리 success**입니다. 프론트436개/102파일·타입/lint/build/포맷, 기본Rust228개/151.04초·확장231개/65.04초(각26개 환경 의존 제외), Python3.13.16의AI113개/3.70초·도구80개/33.034초, Rust1.90 전체 최소 버전 컴파일1분43초를 확인했습니다. 새 다운로드/부분 정리 경계는 실제 Windows에서도 통과했습니다. 로컬 링크권한1제외를 원격에서도 제외된 것으로 기록하지 않습니다. 제품 앱24920/PTY11472와 원본·기존 모델/영구런타임은 유지했습니다.

## 후속 — 최신 작업 화면/트랙 기능의 격리 release 설치 검증 (2026-10-23)

### 1. 작업 개요

작업 날짜2026-10-23. 고급 판정의 독립 정답/특화 모델 및 별도Windows 조건은 미완료로 유지하고, 독립적인 현재 제품 코드의 최적화 설치 패키지·첫 실행/정상 종료/제거를 현재 PC에서 확인합니다. 현재 준비/실행 중이며 전체 Phase8·최종 배포 수용은 아닙니다.

### 2. 구현 및 변경 사항

기존 prepare_validation_installer.py와 Test-ValidationInstaller.ps1을 사용합니다. 설치용 식별자/제품명/실행명에 새 UUID31c6a1da-c2fd-4ee0-8f13-f4f4f067ba6e를 붙여 제품 앱/DB·기존 검증 데이터를 보존합니다. 검증 앱 실행에도 WindowStyle Hidden을 명시했고 PowerShell 구문 검사를 통과했습니다. 실제 사용자 앱24920/PTY11472는 닫지 않습니다. 새 제품 코드/의존성·모델 가중치를 추가하지 않았습니다.

### 3. 테스트 결과

- 고정 runtime3393개 전체 파일 지문·템플릿/새 UUID/최신 dist index SHA 검증으로 release 계획 준비 **성공**.
- 최초 제한 실행 환경의 `pnpm tauri build --ci --config <생성설정> -- --locked --offline`: 최적화 실행 파일 컴파일1분37초 **성공**, NSIS 묶음은 공식 nsis-3.11.zip 주소의 DNS11001 오류로 **실패**. 설치/실행은 하지 않았습니다. 같은 설정을 표준 Windows 실행 환경에서 재시도 중입니다.
- 새 실제 설치·전체 고지/runtime·독립Python/새v9·정상 종료/제거·Defender 검사는 현재 **미실행/진행 중**이며 후속 결과를 기록합니다. 제품 DB/모델 보존용 새 읽기 전용 기준 백업은 생성했습니다.

### 4. 미구현 및 알려진 문제

검증 식별자/현재 PC의 내부 설치본이며 서명된 최종 제품 설치기가 아닙니다. 현재 WebView2가 있는 OS의 조건이고 별도Windows/깨끗한 PC는 사용자 장비 부재로 미실행입니다. legalReviewCompleted/cleanWindowsValidated=false를 유지합니다.

### 5. 다음 작업 계획

NSIS 생성 성공 후 해당 파일만 백신 점검하고, 자체 새 폴더/등록·빈DB로 설치/실행/정상 종료/제거와 보존을 확인합니다. 실패하면 기존 제품이나 검증 데이터를 지우거나 강제 종료하지 않고 원인과 미실행 항목을 기록합니다. 사용자 수용 앱/프로젝트·녹음은 유지합니다.

### 최종 실행 결과

- 표준 Windows 환경의 동일 설정 재시도: 최적화 컴파일1분18초와 NSIS 생성 **성공**. 기존 공식 도구/캐시 경로를 사용했고 보안 설정을 바꾸지 않았습니다. 설치기31,444,397바이트/SHA256 `956f12a04f4bfb7d5621bff7c75cc627cab37aaee128d98a9367ecec0358546d`입니다.
- 기존 Defender의 단일 파일 custom scan 종료0/“found no threats”·검사 전후 SHA 보존 **성공**. 정의1.461.161.0/2026-10-23 기준이며 다른 백신/정의·최종 서명 배포의 안전성 보증이 아닙니다. release-current-defender.json에 보존했습니다.
- 실제 기본PowerShell5.1 `Test-ValidationInstaller.ps1 -BuildProfile release` **종료0 성공**. 관리자 토큰false·새 currentUser 등록/설치, runtime3393개/고지/MIT/백업 안내 전체 지문·원본 NSIS 표식 외 본문 동일, 별도 새v9/quick_check/빈 프로젝트·휴지통/녹음 없음, 정상 종료0/APP_EXITED·개발 PATH 제외 독립Python3.12.15 두 번을 확인했습니다.
- 설치 본문22,095,360바이트/SHA `4bcbd6590c4a3e3c041ce98ceaf54a091ef49337dc3665a3455687f08d8ba328`, 원본표식 전 SHA48699309…입니다. 제거 후 등록 소멸·설치 파일 제거·검증 DB와 자체 미등록 파일 지문 보존도 성공했습니다. 영수증 installer-tests/c20ef32a-b015-45d3-b774-7361ee9d72e7/receipt.json을 보존합니다.
- 실제 제품 DB9/16테이블·4모델 marker 전후 동일, 제품PID24920/PTY11472의 정확한 창/응답을 확인했습니다. 제품 앱을 종료/재실행하지 않았습니다. 이 현재 PC 검증 후속은 완료이며 별도Windows10/11·서명/최종 배포는 미완료입니다. 다음은 GitHub Windows 실행기의 같은 검사 자동화입니다.

## 화면 유지 수정 원격 CI 완료 — 2026-10-23

소스1c1f874d4b499cb5c605ccf4f33cfe267c278dee의 [Windows39958606255](https://github.com/BomJin2/GuitarLab/actions/runs/39958606255)/job120430592741는 모든 단계/사후 정리 success입니다. 프론트436개/102파일·타입/lint/build/포맷, 기본Rust228개/38.58초·확장231개/38.49초(각26개 환경 의존 제외), Python3.13 AI113개/3.70초·도구66개/12.930초, Rust1.90 전체 컴파일2분00초를 확인했습니다. Phase7 후속 감사 도구의 새74개 검사와 별도 결과입니다. 실제 모델/장치·새 installer/별도 Windows 수용을 대신하지 않습니다.

## 트랙 순서 소스 원격 CI 완료 — 2026-10-23

소스9245febf38d72bdcc67a1307104fbe3f822d7422의 [Windows39935960081](https://github.com/BomJin2/GuitarLab/actions/runs/39935960081)/job120355440444는 기본/확장 native·Python/백업 도구·최소Rust1.90와 사후 정리까지 전 단계 success입니다. 사용자 순서 이동·저장 재열기 수용도 확인했습니다. 후속 저장/재열기 화면 유지 수정의 CI·수용을 대신하지 않으며 새 installer/별도Windows·최종 배포는 미완료입니다.

## 트랙 Undo 선택 수정 원격 CI 완료 — 2026-10-23

`e21875462cea4a9d5ac39b0f185d4dadfe4c0007`의 [Windows39933861827](https://github.com/BomJin2/GuitarLab/actions/runs/39933861827)/job120348487238은 사후 정리까지 전 단계 success입니다. 프론트428개/102파일·타입/lint/build/포맷, 기본Rust228개/87.37초·확장231개/40.30초(각26개 환경 의존 제외), Python3.13 AI113개/2.71초·도구66개/16.484초, Rust1.90 전체 컴파일2분18초를 확인했습니다. 사용자 Undo 복구/자동 선택 재수용과 함께 이 버그 수정은 완료입니다. 다음 트랙 순서 소스 `9245febf38d72bdcc67a1307104fbe3f822d7422`의 [CI39935960081](https://github.com/BomJin2/GuitarLab/actions/runs/39935960081)는 진행 중이며 위 성공을 소급하지 않습니다. 실제 모델/장치 재검사·새installer/별도Windows/최종배포는 이번 CI 범위에서 **미실행**입니다.

## 트랙 삭제 소스 원격 CI와 사용자 실패 구분 — 2026-10-23

수정 전 트랙 삭제 소스 `6a0d7d866e8f2ff873fc8eefd613530026bd8180`의 [Windows39930532852](https://github.com/BomJin2/GuitarLab/actions/runs/39930532852)/job120337381172는 사후 정리까지 전 단계 success입니다. 프론트426개/102파일·타입/lint/build/포맷, 기본Rust228개/44.90초·확장231개/37.17초(각26개 환경 의존 제외), Python3.13 AI113개/3.03초·도구66개/11.691초, Rust1.90 전체 컴파일2분16초를 확인했습니다. 사용자 Windows 조작에서 복구 트랙의 선택이 남은 트랙에 머무는 문제가 별도로 발견돼 PHASE-05의 회귀 추가/수정을 진행했고 실제 재수용까지 받았습니다. 자동 검사 success를 실제 사용자 실패 해소로 소급하지 않습니다. Undo 수정 e218754의 CI39933861827과 후속 순서 변경 소스는 각각 별도로 추적합니다. 별도Windows/최종배포는 미완료입니다.

## TAB/오선보 전환 소스의 원격 CI 확인 — 2026-10-23

`3d7e2424502a84cda25829c1c8783eef41f2f214`의 [실행39913241783](https://github.com/BomJin2/GuitarLab/actions/runs/39913241783), job120280827486의 모든 단계/사후 정리가 success입니다. 프론트417개/99파일·타입/lint/build/포맷·기본Rust228개/확장231개(각 환경 의존26개 제외), 실제Python3.13.16 AI113개/5.38초와 개발 도구66개/49.282초·Rust1.90 전체 컴파일1분31초가 성공했습니다. 모델/장치 제외 검사를 성공으로 더하지 않으며 이번에 후속 구현 중인 마디 반복 소스의 원격 결과로 대신하지 않습니다. 별도 Windows/서명·최종 배포는 계속 미완료입니다. 아래 pending/이전 CI 기록은 해당 시점의 이력입니다.

## GitHub Windows 전체 CI 통과 — 2026-10-23

### 1. 작업 개요

완료 날짜2026-10-23. 수정 커밋 `e215134ce3f82ebb9f6c824f52d6ef5691a713cf`의 [실제 실행39889923350](https://github.com/BomJin2/GuitarLab/actions/runs/39889923350), job120206965080에서 모든 단계의 completed/success를 확인했습니다. CI 오류 수정 슬라이스는 완료이며 전체 Phase8/최종 배포 완료와 구분합니다.

### 2. 구현 및 변경 사항

초기 LF 체크아웃 누락은3648895, AI 테스트의 sys/pip/ensurepip 호스트 의존은7351ada, 외부 캐시·임시 경로에 기대던 개발 도구는e215134에서 수정했습니다. 세부 변경 파일과 실패/재현은 아래 각 절에 보존했습니다. 검사/지원 버전·잠금 파일·모델/사용자 데이터 보호 기준을 낮추거나 실패 검사를 제외하지 않았습니다. 이번 최종 기록은 README·로드맵/테스트 계획과 진행 문서만 변경하며 실행 코드는 e215134와 같습니다.

### 3. 테스트 결과

- 잠금 파일 `pnpm install --frozen-lockfile --ignore-scripts` **성공**.
- `pnpm verify:app` **성공**: 타입/lint·프론트411개/98파일·production build·소스 포맷·Rust fmt/Clippy·기본 native228개/48.07초·환경 의존26개 제외.
- 확장 `cargo clippy --locked --all-targets --all-features ... -- -D warnings` 및 `cargo test --locked --all-features ...` **성공**:231개/38.16초·환경 의존26개 제외. 제외된 실제 장치/모델 검사를 성공 개수에 더하지 않습니다.
- Python3.13.16 `python -B -X utf8 -m pytest ai/tests`: **113개/2.64초 성공**.
- 같은 원격의 `python -B -X utf8 -m unittest discover -s scripts -p "test_*.py"`: **66개/13.329초 전부 성공**, 제외0개. 로컬 링크 권한1개 제외와 구분합니다.
- Rust1.90.0 `cargo +1.90.0 check --locked --all-targets --all-features ...`: **2분14초 성공**. 사후 정리까지 모든 step이 success이며 전체 run 결론도 success입니다.
- 보충: 비정규 임시 경로를 제공해 설치 준비/원본 보존 회귀 **성공**. 새 Git 소스 폴더의113개/개발 도구65개·1제외 성공은 아래 기록과 같습니다.
- 실제 장치/AI 추론·새 NSIS/Defender/서명·별도Windows 수용은 **미실행** — 이번 모델 없는 CI 수정 범위 밖입니다. 현재 사용자 앱은 종료/재실행하지 않았습니다.

### 4. 미구현 및 알려진 문제

기존 Vite 청크 크기 안내와 Python3.13의 is_reserved 폐기 예정 경고는 남지만 실패는 아닙니다. 원격 CI 성공이 실제 장치 조합/AI 품질·깨끗한 별도Windows 수용을 대신하지 않습니다. 아래 CI 실패/대기 문구는 각 수정 전 이력입니다.

### 5. 다음 작업 계획

진행 문서/README의 재개 위치를 원격 성공으로 갱신합니다. 실행 코드가 없는 최종 기록 커밋은 `[skip ci]`로 같은 전체 빌드의 중복 실행만 생략하고, 다음 코드 변경부터 기존 workflow를 그대로 실행합니다. 이후 로드맵의 실제 주법 참조·특화 모델 권리/품질·별도Windows 수용 조건을 해당 항목별로 이어서 확인하며 전체 완료로 올리지 않습니다.

## CI 개발 도구의 외부 캐시·임시 경로 의존 제거 — 2026-10-23

### 1. 작업 개요

[수정7351ada 실행39888475426](https://github.com/BomJin2/GuitarLab/actions/runs/39888475426)에서 기존 AI 오류는 해결됐지만 그 뒤 개발 도구2개가 실패했습니다. 작업 날짜2026-10-23. 원인 수정/로컬 검사는 완료했고 후속 원격 전체 결과는 대기입니다. 전체 Phase8 완료와 구분합니다.

### 2. 구현 및 변경 사항

- scripts/benchmark_egset12.py: 외부 자료 루트가 아직 없어도 범위 밖 입력을 내용 읽기 전에 거부하도록 루트의 strict 존재 조건만 제거했습니다. 실제 manifest의 존재/경로·크기/원본 지문 검사는 유지합니다. 외부 자료를 CI에 다운로드하거나 경계 검사를 생략하지 않습니다.
- scripts/test_benchmark_egset12.py: 개발 PC의 실제 외부 캐시 대신 자체 임시 프로젝트를 만들고 캐시 없음/있음 두 경우에 범위 밖 파일 읽기 전 거부와 원본 보존을 확인합니다.
- scripts/test_prepare_validation_installer.py: 임시 PROJECT를 resolve(strict=True)로 정규화해 실제 도구의 canonical PROJECT와 같은 전제를 사용합니다. 공통 checked_path의 경로/링크 보호는 완화하지 않습니다. 앱·네이티브/모델 설치·개인 데이터는 바꾸지 않았습니다.

### 3. 테스트 결과

- 세 번째 실제 CI: 앱 기본 회귀/확장 native **성공**, Rust231개/26개 제외. Python3.13.16의 `pytest ai/tests`: **113개/2.61초 성공**. 사용자가 보낸 이전97성공/8실패·6오류와 구분합니다.
- 이어 `unittest discover -s scripts -p "test_*.py"`:66개 중2개 오류. 외부 캐시 폴더 strict resolve의 FileNotFoundError와 임시 프로젝트 경로의 BACKUP_PATH_INVALID이며 MSRV는 skipped였습니다.
- 수정 전 자체 캐시 없음 회귀에서 동일 FileNotFoundError **재현**. 수정 후 개발 도구 전체는 Python3.10.8에서66개 중65개/12.214초 **성공**, 기존 별도Python3.12.14에서65개/12.536초 **성공**. 각 실제 링크 권한1개는 **미실행/skip**이며 거부 검사를 삭제하지 않았습니다.
- 로컬 `cargo +1.90.0 check --locked --offline --all-targets --all-features --target-dir src-tauri/target/msrv-190 --manifest-path src-tauri/Cargo.toml`: **22.79초 성공**. 실제 원격 MSRV는 후속 실행에서 확인합니다.
- 앱 재빌드/장치·실제 모델 재검사는 **미실행** — 개발 도구·테스트/문서만 수정했습니다. 사용자 수용한 박자 선택 앱은 유지합니다.

### 4. 미구현 및 알려진 문제

Python3.13의 PurePath.is_reserved 폐기 예정 경고는 실패 원인이 아니며 현재 배포 Python3.12.15를 변경하지 않습니다. 원격 전체 green·원격 MSRV는 아직 확인 전이고 별도Windows/서명·최종배포 수용도 미완료입니다.

### 5. 다음 작업 계획

수정과 최신 ZIP 검사 문서를 일반 커밋/push한 뒤 새 CI가 마지막 단계까지 성공하는지 확인합니다. 추가 실패가 있으면 같은 방식으로 원인을 수정합니다. 아래 Python 실패/대기 기록은 이전 실행 이력입니다.

### 새 Git 체크아웃 보충 검사

후속 수정 e215134를 main에 push했고 [실행39889923350](https://github.com/BomJin2/GuitarLab/actions/runs/39889923350)을 확인 중입니다. 같은 커밋을 core.autocrlf=true의 새 UUID 폴더에 체크아웃해 외부 자료/가상환경·dist 없이 실행했습니다. 기존 별도Python3.12.14에서 개발 도구66개 중65개/8.680초 성공·링크 권한1개 제외, AI 계약113개/3.27초 성공입니다. 이 검사는 개발 PC의 제외 파일에 기대지 않음을 확인하며 실제 원격3.13/전체 run 결론을 대신하지 않습니다. 사용자 앱·DB/모델은 유지했습니다.

## GitHub Python 검사 호스트 의존 제거 — 2026-10-23

### 1. 작업 개요

LF 수정3648895의 [재실행39886276574](https://github.com/BomJin2/GuitarLab/actions/runs/39886276574)에서 앱 기본/확장 native는 성공했지만 모델 없는 Python 검사가 실패했습니다. CI 테스트 fixture를 지원 환경/DEMO 데이터로 분리하는 후속이며 제품의 Python 지원 조건을 늘리지 않습니다. 수정·로컬 재현은 완료, 실제 Python3.13 GitHub 재실행은 다음 단계입니다.

### 2. 구현 및 변경 사항

- test_install_managed.py: Windows/Python3.10.8·pip22.2.2 프로필을 모의하고, ensurepip bootstrap과 pip runner도 실제 호스트 대신 지문이 있는4바이트 DEMO로 제공합니다. 프로세스는 기존 _run 모의를 유지해 실제 설치/AI/네트워크를 실행하지 않습니다. 모의 bootstrap 손상도 기존 무결성 검사가 거부하는 회귀를 추가했습니다.
- test_demucs_cache.py/test_demucs_adapter.py: 다운로드/모델 없음 검사의 프로필을 명시해 호스트 Python 버전이 목표 오류보다 먼저 거부되지 않도록 했습니다. 실제3.10/정확한3.12.15 이외 버전 거부 규칙은 제품에 그대로 남습니다.
- test_cp312_installation.py: 미검증3.12.16에 더해3.13.16의 설치 거부/파일 미생성 회귀를 추가했습니다. skip이나 예외 완화로 검사 수를 줄이지 않습니다. ai/제품 소스·모델 계획/원문·DB·IPC·설치 환경은 변경하지 않았습니다.

### 3. 테스트 결과

- 실제 두 번째 CI: 앱 기본/확장 native **성공**, pytest97개 성공/8개 실패·6개 오류(2.53초). AI_SETUP_VERSION/AI_MODEL_VERSION 때문에 fixture가 원하는 취소/손상/모델 없음 경로에 도달하지 못했습니다. scripts와MSRV는 **미실행** — Python 단계 실패 후 skipped입니다.
- 버전만 모의한 첫 로컬 수정은3.10에서112개 성공했으나 별도3.12.14에서107개 성공/5개 실패했습니다. 실제 ensurepip의 고정 wheel이 다른 호스트 의존까지 발견해 DEMO bootstrap/runner로 분리했습니다. 실패 이력을 성공으로 바꾸지 않습니다.
- 최종 `ai/.venv/Scripts/python.exe -B -X utf8 -m pytest ai/tests --tb=short`: **113개/2.95초 성공**, Python3.10.8.
- 이미 제공된 별도 Python3.12.14에서 순수 pytest8.3.5와 packaging 등을 개발 site-packages에서 재사용해 같은 전체 계약: **113개/2.90초 성공**. 새 패키지/모델 설치나 가중치 다운로드는 없습니다. 이는 지원되지 않는3.12.14에서 실제 AI 설치/추론이 가능하다는 뜻이 아닙니다.
- 실제 GitHub Python3.13.16 전체 재실행은 **미실행/대기** — 수정 push 후 결론을 확인합니다. 모델/실제 장치 재검사는 **미실행** — 제품/설치를 바꾸지 않았습니다.

### 4. 미구현 및 알려진 문제

CI 첫 실행은 소스 LF, 두 번째는 테스트 호스트 의존으로 서로 다른 실패였습니다. 아직 실제 전체 run 성공이나 MSRV 단계를 통과했다고 기록하지 않습니다. 실제 모델의 지원 Python/배포용 조건·깨끗한 별도Windows 수용은 유지합니다.

### 5. 다음 작업 계획

정리된 테스트와 수용 완료한 박자 영역 선택을 커밋/일반 push해 CI를 다시 확인합니다. 실패하면 해당 단계 로그로 추가 수정하며 현재 수용 앱의 실행 상태는 유지합니다. 결과가 준비되지 않았다는 이유만으로 독립 작업을 멈추지 않습니다.

## GitHub Windows CI의 LF 체크아웃 보완 — 2026-10-23

### 1. 작업 개요

초기 커밋 c71e80c의 [Windows 기능 회귀 실행](https://github.com/BomJin2/GuitarLab/actions/runs/39884301459)이 실패했습니다. 전체 Phase8 완료와 구분해 원인을 수정하고 실제 원격 재실행을 확인하는 안정성 후속입니다. 작업 날짜2026-10-23, 수정/새 체크아웃 검사는 완료·원격 재실행은 후속입니다.

### 2. 구현 및 변경 사항

실제 job120188764949 로그에서 타입/린트·프론트410개/98파일·Vite가 성공한 뒤 Prettier259파일 오류로 exit1인 것을 확인했습니다. .gitattributes에 소스의 기본 `* text=auto eol=lf`가 빠져 Windows Git 체크아웃의 CRLF 변환이 발생한 원인입니다. 기존 `-text` 예외만으로는 일반 소스의 줄바꿈이 고정되지 않았습니다.

.gitattributes에 기본 LF만 추가했습니다. 고지 원문·폰트/음색·원본 fixture·모델 계획/재현 잠금 파일의 기존 `-text` 예외는 뒤에서 계속 우선합니다. Prettier 기준을 auto로 낮추거나 검사/CI를 삭제하지 않았고 앱·DB/모델 계약·의존성을 바꾸지 않습니다.

### 3. 테스트 결과

- 기존 CI: 프론트410개/98파일 성공, 포맷259파일 실패. Rust/확장 native/Python/MSRV 후속 단계는 **미실행** — 앞선 단계가 실패해 skipped였습니다. ‘모든 기능 실패’와 구분합니다.
- 수정 작업 폴더 `pnpm format:check`: **성공**.
- 새 UUID 작업 폴더로 `git -c core.autocrlf=true checkout-index --all --prefix=...` 실행 후 그 폴더에서 기존 Prettier3.6.2 `--check .`: **성공5.14초**. 현재 작업 폴더의 LF만 검사한 결과와 구분합니다.
- 실제 체크아웃 바이트 검사: 소스433파일의 LF와 기존 지문 보호247파일의 Git blob/원본 바이트 일치 **성공**. 근거는 target/runtime-validation/ci-checkout-eol-receipt.json이며 개인 파일·실제 데이터는 포함하지 않습니다.
- 제품 전체 재검사는 **미실행** — 속성/문서만 변경했으며 앞선 프론트410/Rust231·26제외/Python111·도구65·1제외 결과를 유지합니다. 수정 커밋의 실제 GitHub 전체 재실행은 push 뒤 확인하며 지금 성공으로 기록하지 않습니다.

### 4. 미구현 및 알려진 문제

CI 첫 포맷 실패로 드러나지 않은 뒤 단계의 GitHub 환경 차이가 추가로 있을 수 있습니다. 전체 run을 끝까지 확인해야 합니다. 이 수정은 Windows 별도 PC의 앱 설치/장치·최종 서명 수용을 뜻하지 않습니다. 원문 지문 예외를 제거하거나 전체 자산을 포맷하면 안 됩니다.

### 5. 다음 작업 계획

수정 커밋을 기존 main에 일반 push하고 원격 전체 CI의 실제 결론을 확인합니다. 다음 실패가 나오면 해당 로그에 따라 수정하며 기다리는 동안 TAB 선택 Windows 후보/데이터 보존 검증을 진행합니다. 앞서 준비한 후보 빌드도24.71초 성공했으나 새 앱 실행/보존은 아직 미실행입니다.

## 로컬 데이터 백업 첫 슬라이스 — 2026-10-20

### 작업 개요

- 작업일:2026-10-20. Phase7 고급 채점/주법 참조·다른 Windows 검증은 미완료로 유지합니다. 자동 진행 규칙의 ‘다음 작업과 독립적인 문제는 기록하고 진행’ 예외에 따라 데이터 보호를 먼저 구현했습니다. 전체 Phase8/릴리스는 완료하지 않았습니다.
- 목표: 기존 데이터를 바꾸지 않고 명시적으로 동의한 로컬 DB·프로젝트/녹음·보정값을 새 ZIP에 보존하고 취소/실패·지문 확인을 제공합니다. 앱 UI 후보는 구현했고 Windows 최종 반영은 후속 결과를 따릅니다.

### 구현 및 변경 사항

- `scripts/backup_local_data.py`: 표준 sqlite3 backup API로 WAL 포함 v8 스냅샷/quick_check·FK·비활성 녹음 상태를 확인하고 프로젝트 폴더·보정값을 ZIP_STORED/파일별 SHA manifest에 보존합니다. 개별 링크/junction·경로 이탈/Windows 장치 이름·대소문자 중복·암호화/압축·과대/손상 ZIP을 거부합니다. 완성 ZIP 재검사·flush/fsync 후 같은 디스크의 hard link로 새 이름에만 게시합니다. 기존 목적지는 원자적으로 보존합니다.
- CLI `backup`는 앱 프로세스 종료 확인/2GiB 이하·명시적 개인 데이터 동의를 요구합니다. `verify`는 추출 없이 지문 확인, `restore-preview`는 새 폴더에만 비파괴 추출/DB 재검사합니다. 실제 AppData 교체·삭제·프로젝트 경로 자동 재연결은 수행하지 않습니다.
- 앱은 실행파일에 내장한 고정 코드만 검증된 번들 Python3.12.15로 실행합니다. 추가 설치/모델 실행/네트워크/임의 shell·경로 IPC/새 의존성은 없습니다. 앱 경로는256MiB로 제한해 기존 StorageJob/프론트 bytes 한도를 유지합니다.
- `src-tauri/src/storage/backup.rs`: 별도 프로세스의 제한된 JSONL 진행/결과·타임아웃/직접 자식 취소/종료·오류 코드 변환. 프로젝트 writer 및 녹음 시작 보호를 보유합니다. 실패/취소 시 신규 staging만 정리하며 종료가 확인되지 않으면 정리 미확인 오류를 반환합니다.
- `commands/backup_api.rs`·mod/app/lib: 명시적 동의/버전만 요청받고 native 새ZIP 저장 창을 사용합니다. 다른 저장 작업·REC와 충돌을 막고 백업 중 창 닫기는 완료/취소 안내로 제한합니다. 기존 원격 origin 권한을 확대하지 않습니다.
- `recording/service.rs`: 짧은 active 잠금 안에서 저장 보호를 게시하고 RAII로 해제합니다. 보호 중 새REC는 실패하며 현재 입력 분석/모니터·기존 녹음 코드는 변경하지 않습니다.
- `ai/bundled.rs`·mod: 기존 격리 Python 명령 구성만 공통화해 같은 지문 검증된 runtime의 표준 모듈을 사용합니다. 원래 AI launch 인수·모델 활성 marker·runtime lock/배포 파일은 유지합니다.
- `src/features/settings/localBackup.ts`, `useLocalBackup.ts`, `LocalBackupPanel.tsx`·tests/SettingsPage: 결과 decoder/서비스·상태/취소와 최소 UI를 분리했습니다. 명시적 동의 뒤에만 백업하고 중복/이탈·늦은 응답을 처리합니다. 원본 DB 안의 개인 메모/외부 파일 경로가 포함되며 외부 참조 음원·모델/캐시는 제외됨을 표시합니다.
- docs/07·08·10·12와 진행표를 갱신했습니다. 새 DB migration/기존 파일 삭제는 없습니다.

### 테스트 결과와 오류 해결

- 프론트 대상4개 성공: 동의 전 실행 차단·엄격한 결과/개인 경로 은폐·중복/취소 정리 대기·화면 이탈을 확인했습니다.
- `pnpm verify:app` 성공: 타입/ESLint·프론트322개/82파일·빌드25.97초·Prettier·표준Clippy·Rust196개/10.81초(환경 의존21개 기본 제외). 이후 ZIP 경계/자식 정리를 추가한 최종 native 확장 결과는 아래 후속 기록을 따릅니다.
- 개발 Python 전체29개 성공/심볼릭 링크1개 **미실행**: `ai/.venv/Scripts/python.exe -B -X utf8 -m unittest discover -s scripts -p 'test_*.py'`. 백업 관련7개 중 계정의 링크 생성 권한이 없어 링크 생성 사례만 skip했고 나머지는 실행했습니다. native 기존 링크/junction 검사는 별도로 유지합니다.
- 최초 기본 샌드박스에서 자체 임시 ZIP의 hard link가 WinError5로 차단돼3개 실패했습니다. 자체 임시 데이터만 사용하는 검사를 승인된 실행 환경에서 다시 수행해 성공했습니다. 실제 사용자 데이터나 기존 목적지의 권한을 변경하지 않았습니다.
- 최초 native 테스트에서 존재하지 않는 Result::is_err_or를 사용해 컴파일 실패했고 map_or로 고쳤습니다. 확장 Clippy의 err().expect() 지적은 expect_err로 수정했습니다. 실패 이력을 성공으로 덮어 기록하지 않습니다.
- 기존 번들 리소스/자체 임시 DB·악보로 실제 숨겨진 Python 자식 백업·기존ZIP 덮어쓰기 거부·기존AI 환경 조회3.12.15를 실행해 성공했습니다(첫 실행27.57초). 개인 녹음/사용자 AppData는 이 기능 검사에 사용하지 않았습니다. 실제 자식 취소/64MiB·확장 검사와 Windows 적용은 진행 중입니다.
- CLI의 실제 Windows 프로세스 가드는 실행 중인 GuitarLab을 발견하고 BACKUP_APP_RUNNING을 반환했습니다. 앱을 종료시키지 않았습니다.

### 미구현 및 알려진 문제

- 앱 안의 백업 UI 저장 선택/실제 ZIP 사용자 수용, 실제 AppData 교체/복원/삭제 UI, 모델 재설치, 새PC/다른 Windows 수용은 **미실행 또는 미구현**입니다. 개발 CLI의 새 폴더 미리보기 성공을 실제 앱 복원 완료로 표시하지 않습니다.
- 앱 경로는256MiB 이하이며 장기 녹음이 많으면 제한에 걸릴 수 있습니다. 개발 CLI2GiB와 구분합니다. 원본의 현재 바이트를 보존하므로 이미 손상된 미디어를 복구하는 기능이 아닙니다.
- 외부 REFERENCE 미디어는 복사하지 않으며 DB의 외부 경로는 보존됩니다. 다른 PC에서는 사용자가 재연결해야 합니다. ZIP에 개인 녹음/메모가 들어가므로 명시적 동의를 받습니다.
- OS 강제 종료/드라이버 정지로 자식 종료를 확인하지 못하면 staging이 남을 수 있습니다. 자동 광역 삭제를 구현하지 않았으며 정리 미확인 오류로 표시합니다. 게시 직후의 늦은 취소는 완성 ZIP을 삭제하지 않습니다.
- 실제 Rust1.90 컴파일/5분짜리 대용량 백업·디스크를 채우는 실험·백신 오탐/installer/깨끗한 PC는 **미실행**입니다. 설치된Rust1.98/현재 Windows의 자체 자료 검사와 구분합니다.

### 다음 작업 계획

- 확장 native 회귀/실제 자식 취소·정리→Windows 후보 빌드·원래v8 테이블/모델 marker 보존→새 앱 적용을 완료합니다. 사용자에게 반복적으로 설치/종료를 요구하지 않고 이미 승인된 정상 종료 절차를 지킵니다.
- 앱 백업 ZIP의 의미 검증/복원 전 검사와 라이선스/패키지·오프라인 배포 품질을 진행합니다. 실제 사용자 데이터를 덮어쓰는 복원/삭제는 구체적인 안전 계약을 먼저 정합니다.
- Phase7의 추가 검출/정답 부재, Phase6 특화 분리/선택 검색, 새PC 수용은 별도 미완료로 유지하며 전체 Phase를 완료로 바꾸지 않습니다.


## 백업 Windows 적용 및 최종 자동 검증 — 2026-10-20

- 확장 Clippy/all-targets/all-features와 native 전체199개/10.95초(환경 의존21개 기본 제외) 성공. 최종 실제 번들 백업/기존ZIP 보존·원래worker/64MiB 취소는10.72초에 성공했고 ‘실제 자식 취소/새 staging 정리 확인’을 관측했습니다. 진행 중 새REC 차단/오류 후 보호 해제는 순수 native 검사로 확인했습니다. 마지막 종료 확인/시간 제한 분기의 타입 검사·Windows 빌드도 통과했습니다.
- 개발 도구는 최종 총30개 중29개 통과/실제 심볼릭 링크 생성1개 skip입니다. 실제 링크 권한이 없어 미실행이며 별도로 reparse 속성 모의 주입 차단을 실행했습니다. 상위의 ‘29개 성공/skip’ 표현은 당시 총29개(28개 통과/1개 skip) 실행을 뜻하며 최종 수치는 이 문단을 따릅니다.
- 프론트 최종 타입/번들34.18초·Prettier 성공. Windows 디버그 후보35.93초 성공, 실행 파일39,531,008바이트/SHA256 `b321a6e2afbccc19d8edc2d78a3251cb0e328e3ded02f9d10e9e0d0fd9189f4f`입니다. 동일 불변 runtime3393개/64,095,996바이트를 모두 지문 확인했습니다. 제품 의존성/MSRV1.90/DB 스키마v8은 그대로입니다.
- 전환 준비 스크립트에서 괄호 문법 오류가 먼저 발생했으며 명령이 중단돼 기존 앱은 그대로였습니다. 수정 후 정확한 이전PID1768/경로·Python 자식 없음·활성REC0·새 DB 백업을 확인하고 정상 종료했습니다. 강제 종료하지 않았습니다.
- 새 **PID30760**, `portable/b6abf7dd-a5a4-47fe-970b-564b96e78d82/GuitarLab.exe`를 실행했습니다. 실제v8 DB15개 테이블의 행 수/내용SHA와 모델 marker4개SHA가 전환 전후 동일했습니다. 앱 응답과 실행 확인은 성공이며 사용자 저장 창 선택/백업 ZIP 수용은 **미실행**입니다. 개인 녹음을 이 기능 검사에 사용하지 않았고 모니터 기본OFF/고급 채점 감점 제외를 유지합니다.
- 고지·설치/복원·새PC 수용은 후속이며 Phase8 전체를 완료하지 않습니다. 현재 실행 경로/검사 로그·백업 영수증은 `src-tauri/target/runtime-validation/local-backup-candidate.json`, `local-backup-db-before.json`, `local-backup-db-after.json`, `backup-verify-app.log`, `backup-native-final.log`, `backup-native-actual.log`, `backup-all-helper-tests.log`, `backup-windows-build.log`에 보존했습니다.


## 고지·자동 회귀·최소 Rust·검증 패키지 — 2026-10-20

### 작업 개요

- 작업일:2026-10-20. 백업 첫 경로 적용 후 배포 전 확인 자료/반복 검사를 준비했습니다. 고지 수집/현재 PC의 검증 패키지 실행까지 확인하며, 최종 배포 허가·GitHub 실행·깨끗한 별도 Windows 수용은 미완료입니다.

### 구현 및 변경 사항

- `scripts/collect_release_inventory.py`·test: 설치된 pnpm prod/peer5개와 Windows Cargo normal/build273개를 선택하고 원문을 SHA 기반으로 중복 제거합니다. 임의 registry 외 source/고지 경로 이탈·파일 변조·upstream commit 불일치를 거부합니다. 자동 수집은 네트워크/설치/개인 데이터 접근을 하지 않습니다.
- 원문이 없는8개 crate 중7개는 해당 배포본 VCS commit의 공식 저장소에서 소량 고지를 보완했습니다. selectors0.38.0은 같은 commit에도 원문이 없으며 선언MPL2/표준원문 참조와 source 접근 안내 검토를 구분합니다. 누락을 성공으로 위장하지 않습니다.
- `docs/release/`: 총281개 항목/고지199개·683,319바이트 원문, 소스/지문 JSON·한국어 색인을 생성했습니다. Bravura8개/Sonivox4개 파일은 설치 alphaTab1.6.1과 전부 바이트가 같고, 기존 CPython3.12.15 고지14개는 불변 lock SHA와 일치합니다. 번역/재작성하지 않고 제3자 원문을 보존합니다. 모델 가중치/관리 환경은 제외합니다. legalReviewCompleted=false이며 자체LICENSE 선택을 요청한 상태입니다.
- `.github/workflows/verify.yml`: official action3개를 확인한 안정 release의 정확한40자 commit에 고정했습니다. token은 contents:read/checkout credentials 미보존, push/PR/수동 실행만 받고 배포·모델 다운로드·산출물 업로드는 없습니다. Node22/pnpm9.14.3·Rust1.98 검사→기존 고정 requirements-test.lock/기본 Python 검사→Rust1.90 check를 연결합니다. 기존 잠금 파일을 재사용해 중복 test requirements는 남기지 않았습니다.
- CI 초기 Python3.12.15는 공식 actions/python-versions에 Windows x64 파일이 없어 기본 검사만3.13.16으로 고쳤습니다. pytest8.3.5의 metadataClassifier에는3.13이 없었지만 요구 범위와 공식8.2.1부터의3.13 지원 기록을 확인했습니다. **앱 번들/모델 Python3.12.15는 그대로**입니다. GitHub Windows 배포 존재/지원 확인과 실제 GitHub 실행을 구분합니다.
- `scripts/package_validation.py`, `Test-ValidationPackage.ps1`·test: 현재 후보 exe/현재 소스의 관리 CLI·불변 runtime3393개·고지 자료만 새UUID 검증ZIP에 넣고 전 파일을 재검사합니다. 새 경로/고정 목록만 읽으며 모델/사용자 DB·녹음·PDB·개발 환경은 넣지 않습니다. 원문고지/검증 스크립트·manifest를 포함하며 최종릴리스/installer로 표시하지 않습니다.

### 테스트 결과와 오류 해결

- Python 제품 회귀: `ai/.venv/Scripts/python.exe -B -X utf8 -m pytest ai/tests` **111개/2.81초 성공**. 새 모델 다운로드/개인 오디오 분석은 없습니다.
- 개발 도구 최종 총35개 중34개 성공/실제 링크 생성1개 skip. 고지 그래프의 dev-only 제외/peer 중복, 실제 upstream commit/SHA 경계, 패키지 입력 크기/지문·경로를 자체 임시 자료로 확인했습니다. 실제 계정 링크 생성 권한이 없어 별도 reparse 속성 모의 차단을 실행한 점은 앞선 기록과 같습니다.
- 기존 Rust1.98을 유지하면서 공식1.90.0 최소 도구체인을 별도 설치했습니다. 제품 all-targets/all-features `cargo +1.90.0 check --locked --offline` **1분14초 성공**, native probe all-targets check **29.27초 성공**입니다. 별도target에서 컴파일했고 Cargo.lock/모델/제품 MSRV는 바꾸지 않았습니다. Rust1.90에서 실제 장치/추론은 미실행이며 기존1.98 실행 결과와 구분합니다. 아래/이전 문서의1.90 미실행은 과거 상태입니다.
- CI YAML은 기존 PyYAML6.0.3으로 parse/9개 step·3개 고정action/readonly권한·필수명령·토큰 미보존을 검사했습니다. 처음에는 pnpm 격리된 js-yaml을 루트에서 require할 수 없어 이미 설치한 Python parser를 사용했습니다. 새 parser 의존성은 설치하지 않았습니다. **GitHub workflow 실행/새runner설치·Python3.13.16 실제 실행은 미실행**입니다. 현재 .git은 읽기 전용이며 원격 push/CI 실행을 수행하지 않았습니다.
- 현재 소스의 관리 CLI build11.40초 성공. 고지를 포함한 검증ZIP3601개를 생성하고 전 파일 크기/SHA·새폴더 추출·기본 PATH에서두 차례 독립 Python3.12.15/PACKAGE_MISSING 응답/자원 불변을 확인했습니다. 설치/GUI/사용자AppData 변경은 없습니다. package log와 roundtrip/smoke 영수증은 runtime-validation에 보존합니다.
- Windows 기본 PowerShell5.1의 한국어 source 호환성을 위해 점검 ps1에 UTF-8 BOM을 넣고 새 ZIP을 만들었습니다. 마지막 검증 ZIP은 `validation-packages/34b86809-69bf-4810-8c6b-be8b884cf1dc/GuitarLab-validation.zip`,39,545,616바이트/SHA256 `63d38a8fc7f60db237a1f56f41557a27fc705414a6f598cc4f91e67ff773e967`입니다. 실제5.1 점검 결과는 후속 기록을 따릅니다. 원래ZIP은 덮어쓰지 않았습니다.

### 미구현 및 알려진 문제

- 자체 소스 LICENSE 선택/모델별 고지·최종 소스 접근 안내/최종installer·코드서명/새PC·백신 수용은 미완료입니다. 내부 검증ZIP을 최종 배포물로 공개하지 않았습니다. 디버그 exe에는 개발 빌드 경로가 남을 수 있으며 release/경로 remap 검증은 후속입니다.
- 현재 PC는 WindowsSandbox 실행 파일/활성 기능이 없음을 읽기 전용 확인했습니다. 별도 PC가 없다는 사용자 답변과 함께 깨끗한 Windows 검증을 **미실행**으로 유지합니다. 시스템 기능 활성화·재부팅을 자동 수행하지 않았습니다.
- 고지의 선언 조건 수집은 전체 이용 허가 판정/하위 native vendor 조건·MPL 소스 제공 의무 검토 완료가 아닙니다. 모델은 기존 연구용 안내/opt-in·배포 제외 정책을 유지합니다.
- 앱의 사용자 백업ZIP 수용/실제AppData 복원·삭제·고급 점수는 앞선 문서와 동일하게 미실행/미구현입니다. 이 품질 작업을 Phase7/8 전체 완료로 바꾸지 않습니다.

### 다음 작업 계획

- 기본 PowerShell5.1의 검증 패키지 확인과 현재 자료/README 갱신을 마무리합니다.
- 사용자의 자체 소스 라이선스 선택은 대기하며, 독립적으로 가능한 백업 파일의 앱 내 지문 검사·안정성 작업을 계속합니다. 복원/삭제는 원본을 보존하는 계약과 실패 회복을 먼저 구현하고 사용자 데이터 교체를 임의 실행하지 않습니다.


### 기본 PowerShell5.1 후속 확인

BOM을 포함한 새 검증ZIP에서 전체3601개 파일/추가·누락·링크/개발PATH 제외·두 차례 Python3.12.15 실행을 **실제 Windows PowerShell5.1에서도 통과**했습니다. 로그는 `phase8-package-powershell51.log`이며 모델 설치/GUI/사용자AppData 변경은 없습니다. 이전PowerShell7 성공과 구분해 기록합니다. 이 슬라이스의 현재PC 자동 검사는 완료했고 GitHub/새PC·최종배포 수용은 계속 미완료입니다.

다음 독립 슬라이스로 앱의 기존 백업ZIP을 읽기 전용으로 검사하는 명령/서비스/UI 계약을 docs/12에 추가했습니다. 실제데이터복원/삭제를 수행하는 기능과 구분하며 구현·새Windows 반영 전까지 완료로 표시하지 않습니다.


## 백업 ZIP 읽기 전용 검사 — 2026-10-20

### 작업 개요

Phase8 데이터 보호의 두 번째 슬라이스로 기존 백업 ZIP 검사 경로를 완료했습니다. 전체 Phase7/8과 실제 AppData 복원은 미완료입니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`의 버전 전용 요청/VERIFIED 결과를 먼저 정의하고 `commands/backup_api.rs`, `storage/backup.rs`, app command/원격 차단 목록에 연결했습니다. 사용자 파일 선택 창에서 고른 ZIP만 읽고 경로/명령은 IPC에서 받지 않습니다.
- `scripts/backup_local_data.py`는 기존 CLI 검증기를 재사용하고 누적 payload 진행/취소를 전달합니다. 생성/검사의 최종 상태를 각각 엄격히 구분하며 검사에는 프로젝트 writer를 잠그지 않습니다. REC와 겹치는 디스크 작업은 방지합니다.
- `localBackup.ts`, `useLocalBackup.ts`, `LocalBackupPanel.tsx`에 서비스/상태/최소 UI를 나눠 연결했습니다. 검사에는 백업 생성 동의를 강요하지 않고, 검사 성공을 저장·복원 성공으로 표시하지 않습니다. 손상·다른 manifest·지문 불일치는 고정 오류로 표시합니다.
- Python/프론트/Rust 계약·원본 보존·취소 회귀를 수정했습니다. DB/모델 worker protocol/모니터 OFF·고급 채점 비활성은 유지합니다.

### 테스트 결과

- `pnpm verify:app`: 프론트323개/82파일·타입·린트·빌드·포맷·기본 Clippy/Rust197개 성공, 환경 의존21개 제외입니다.
- `cargo clippy --locked --all-targets --all-features ... -- -D warnings`, `cargo test --locked --all-features ...`: 성공, 확장 Rust200개/10.83초·21개 제외입니다.
- 실제 번들 Python3.12.15의 자체 ZIP 생성→읽기 전용 검증·깨진 ZIP 거부·기존 목적지 보존·원래 worker 실행·64MiB 자식 취소/정리: 명시 실행1개/18.04초 성공입니다. 개인 오디오 분석은 없습니다.
- 개발 도구 unittest36개 중35개 성공/3.504초, 실제 링크 생성 권한1개 skip입니다. 단조 누적 진행/취소 후 ZIP 원본 보존을 포함합니다. `cargo +1.90.0 check --locked --offline --all-targets --all-features ...`:8.77초 성공입니다.
- 마지막 취소 버튼 문구 포맷 후 `pnpm build`:38.39초 성공. Windows `pnpm tauri build --debug --no-bundle --config ...`:34.70초 성공, 기존 linker 라이브러리 생성 경고 외 오류 없습니다.
- 고정 runtime3393파일 SHA 확인 후 기존 PID30760의 작업 없음/DB 새 백업·정상 종료→새 실행파일39,550,976바이트/SHA256 `2397488e137d5c1eae629d7129b4a70f9161d98274a73710d2611031dd1de19b`를 별도 폴더에 게시했습니다. 새 PID27608/portable `51435ad8-e007-4ac9-9e34-15ef3783d326`가 응답하며 실제v8 DB15개 테이블 내용과 모델 marker4개가 전부 유지됐습니다.

### 미구현 및 알려진 문제

사용자 파일 선택 창의 실제 조작 수용은 미실행이며 UI 회귀/실제 고정 worker 검사와 구분합니다. AppData 실제 교체/삭제·새PC·최종installer/서명·자체LICENSE 선택은 미완료입니다. ZIP의 지문 무결성은 출처의 신뢰성이나 실제 완전 복원 성공을 뜻하지 않습니다. 이전 검증ZIP은 이전 앱 버전이며 최종 배포물이 아닙니다.

### 다음 작업 계획

기존 CLI의 새 폴더 복원 미리보기를 앱에 연결합니다. 명시적 동의/새 목적지·취소/실패 시 신규 staging만 정리하고 실제 데이터 교체를 금지합니다. 고지/CI/새PC 의존성은 계속 별도로 기록합니다.


## 새 폴더 복원 미리보기·MIT 적용 — 2026-10-21

### 작업 개요

Phase8의 새 폴더 복원 미리보기와 사용자가 선택한 자체 MIT 적용을 완료했습니다. 실제 AppData 교체/삭제·고급 점수·새PC/최종 배포는 계속 미완료입니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`에 동의 요청/7필드 결과·원본 보호/취소 계약을 먼저 추가했습니다. `commands/backup_api.rs`, `storage/backup.rs`, app handler/원격 차단 목록은 기존 storage job과 고정 worker를 재사용합니다.
- `scripts/backup_local_data.py`: app-preview 모드, 검사와 추출의 취소/진행·게시 직전 확인, v8/quick_check/FK/비활성 녹음 검사를 연결했습니다. native에서 현재 AppData와 겹치는 목적지를 막고 선택한 상위 폴더의 새 `GuitarLab-backup-preview`만 허용합니다. 기존 폴더를 덮어쓰지 않습니다.
- `localBackup.ts`/hook/panel 및 테스트: 복원 미리보기 동의·선택/작업/취소 상태와 별도 완료 문구를 추가했습니다. `appDataReplaced:false`가 없거나 잘못된 결과·다른 명령 상태는 거부합니다. 실제 앱 데이터가 복원됐다고 표시하지 않습니다.
- 백업 중 새 파일 추가도 재검사해 누락된 백업을 성공으로 표시하지 않도록 보완했습니다. 원본과 이미 완성된 출력은 보존합니다.
- 루트 `LICENSE`의 MIT 원문·npm/Cargo/Python 메타데이터, README·docs/00·10·release 안내를 일치시켰습니다. 제3자/모델 조건은 그대로이며 최종 검토 완료를 주장하지 않습니다. `docs/19-BACKUP-AND-RECOVERY.md`에 사용자 사용법/제외 범위를 추가했습니다.

### 테스트 결과와 해결한 오류

- `pnpm verify:app`: 프론트324개/82파일, 타입/린트/빌드38.84초/포맷·표준 Clippy와 Rust197개/11.73초 성공, 환경 의존21개 제외입니다. 확장 Clippy/전체 Rust200개/12.12초도 성공했습니다.
- 최종 개발 도구40개 중39개 성공/6.045초, 실제 링크 생성 권한1개 skip. DB 바이트 보존 추가 확인을 포함한 백업 대상13개 중12개 성공/5.744초·같은1개 skip입니다. 디스크 부족/기존 폴더·동시 생성·검사/추출 취소·SHA는 맞지만 DB버전이 다른 입력을 확인했습니다.
- 초기 Rust 자체 검사에서 SQLite COUNT를 usize로 수신할 수 없어 i64로 수정했습니다. 실제 번들 경로에서는 확장 드라이브 경로가 SQLite URI의 `%3F` authority로 해석되어 첫 검사가 실패했습니다. 자체 임시 자료로 동일 오류를 재현했고 공통 readonly_database에서 확장 드라이브 접두사만 정상화했습니다. 실패 때 신규 staging이 정리되고 원본은 유지됐습니다.
- 수정 후 `actual_bundled_backup_and_runtime_worker_preserve_original_and_new_zip --ignored`: 자체 실제 번들 백업→검사→새 폴더 추출/DB 조회·기존 ZIP/복원 폴더·AppData 목적지 보호·worker 회귀·64MiB 취소/정리1개/26.89초 성공입니다. 개인 녹음 분석은 없습니다. `cargo +1.90.0 check --locked --offline --all-targets --all-features ...`:19.79초 성공입니다.
- 최종 포맷 검사 성공. Windows `pnpm tauri build --debug --no-bundle --config ...`:43.42초 성공. 기존 linker 출력 경고 외 오류 없습니다. 고정 runtime3393개 SHA 확인, 실제v8 DB 새 백업 후15개 테이블 내용/모델 marker4개 보존 성공입니다.
- 이전 PID27608은 후속 조회에서 존재하지 않았으며 종료 원인은 확인하지 않았습니다. 현재 실행 앱이 없음을 확인한 후 새 **PID37716**, portable `f3b49d89-13c1-417f-892d-0d0ed5b26e7d`의 ‘GuitarLab · 복원 미리보기’를 실행해5초 이상 유지/정확한 창 제목·응답을 확인했습니다.39,571,456바이트/SHA256 `9becf45709133b17e79994009fa42379c2c24c308840d3de6ab4cfebf91fbb32`입니다.
- 자체 MIT 원문/3언어 메타데이터를 실제 번들 Python3.12.15의 JSON/TOML parser로 일치 확인했습니다. 최초 일회성 확인의 runtime 경로 오타는 수정 후 재실행했습니다. CI YAML도 실제3.13.16/3개 고정SHA/readonly권한으로 재검사했고 GitHub 실행은 미실행입니다.
- 현재 소스 관리 CLI14.58초 빌드 성공. MIT 포함 새 검증 ZIP3602개/39,550,691바이트·전 파일 크기/지문·새 폴더 추출/모델·개인 데이터 제외를 확인했습니다. `validation-packages/2110e59b-f511-4298-9da8-289e2323ea96/GuitarLab-validation.zip`, SHA256 `57bc9c5e91213b6eaf7f9aa7ca3a249147b632d2b8119ff6daa7e17259edf7cf`입니다. 기본 PowerShell5.1 독립 실행 검사는 후속 결과를 따릅니다.

### 미구현 및 알려진 문제

사용자의 실제 native 선택 창 조작 수용·실제 AppData 교체/삭제·외부 참조 재연결/모델 재설치·새PC·최종installer/서명은 미실행 또는 미구현입니다. 원문 고지 수집은 전체 이용 허가 검토 완료가 아닙니다. 원본/불완전 테이크를 백업해도 손상된 오디오를 자동 복구하지 않습니다. GUI가 종료된 원인은 미확인으로 기록하며 충돌로 단정하지 않습니다.

### 다음 작업 계획

검증 패키지의 기본 PowerShell5.1 최종 확인을 기록하고, Phase8 수용 조건의 로컬 오류/충돌 진단을 연결합니다. 민감한 경로·오디오·예외 원문 없이 고정 코드만 로컬에 제한해 저장하며 오디오 콜백에서 파일을 쓰지 않습니다. 모델/채점·새PC 의존성을 이 작업의 완료로 대신하지 않습니다.


### MIT 포함 패키지의 기본 PowerShell5.1 확인

새 ZIP3602개 전체 파일 지문·새 폴더 추출·최소 PATH의 두 차례 Python3.12.15/기본 모델 미설치 응답을 실제 Windows PowerShell5.1에서도 통과했습니다. `backup-preview-package-powershell51.log`에 보존했으며 사용자 DB/녹음·설치 모델은 읽거나 수정하지 않았습니다. 앞선 진행 중 상태를 갱신합니다.


## 고정 코드 로컬 네이티브 진단 — 2026-10-21

### 작업 개요

Phase8의 오류 처리 수용을 위한 제한된 로컬 진단 슬라이스를 완료했습니다. 모든 OS 충돌을 포착하는 crash reporter/원격 전송 기능은 아닙니다. 전체 Phase7/8은 미완료입니다.

### 구현 및 변경 사항

- `src-tauri/src/diagnostics.rs`: 고정6코드·writer 수신 시각/최근64건·16KiB 문서, bounded queue/별도 writer·새 파일 sync/rename, 저장 실패/큐 초과 지표를 구현했습니다. 알 수 없는 필드·코드/과대 문서는 거부하고 임의 초기화하지 않습니다.
- panic hook은 payload·stack·경로를 읽거나 기본 hook에 넘기지 않고 try_send만 합니다. 오디오 처리 스레드에 디스크 I/O를 추가하지 않았습니다. 종료 때1초 이내 flush를 시도합니다.
- `app.rs`는 앱 초기화/저장·녹음 복구 초기화 오류를 기록합니다. 설치된 Tauri2.12.3 App::run은 프로세스를 직접 종료하는 것을 소스에서 확인해 `lib.rs`를 build+RunEvent::Exit callback으로 연결했습니다. 단순 run 호출 뒤 코드를 두면 정상 종료 로그가 실행되지 않는 문제를 사전에 수정했습니다.
- `commands/diagnostics_api.rs`/handler/원격 차단 목록과 `localDiagnostics.ts`, hook, 최소 panel/test를 분리했습니다. 사용자 명시 읽기/진행·실패·늦은 결과 폐기와 고정 코드만 반환하며 경로나 원문 요청은 받지 않습니다. DB/모델/채점 계약은 유지합니다.

### 테스트 결과

- `pnpm verify:app`: 프론트327개/84파일·타입/린트/빌드31.40초/포맷·기본 Clippy/Rust201개/11.78초 성공, 환경 의존22개 제외입니다.
- 확장 Clippy/all-features Rust204개/11.07초 성공, `cargo +1.90.0 check --locked --offline --all-targets --all-features ...`:9.75초 성공입니다.
- 대상 네이티브4개/0.99초 성공·자식 전용1개 제외. 부모 검사가 해당 자식을 실제로 실행해 panic을 catch하고 고정 코드 저장/flush·payload 비포함을 확인했습니다. 사용자 앱에 panic을 주입하지 않았습니다. 큐 초과·64건 보존·변조/과대 거부도 자체 자료로 확인했습니다. 프론트 대상3개·엄격 decoder/사용자 읽기·오류 원문 비노출 성공입니다.
- Windows build35.46초 성공. 고정 runtime3393개 SHA, 실제v8 DB 백업 후15개 테이블/모델 marker4개 보존 성공입니다. 새 exe39,729,664바이트/SHA256 `c426a1d173ecf5b0558c5ed7915dd557651b2c78a7ea016817c6ecb34e236795`입니다.
- 같은 실행 세션에서 실제 APP_STARTED→녹음/AI 작업 없음 확인→정상 CloseMainWindow→APP_EXITED→같은 exe 재실행→APP_STARTED·정확한 창/5초 응답을 확인했습니다. 새 PID37428/portable `740cc59e-0b74-4aed-92f0-89d228a281e8`의 ‘GuitarLab · 로컬 오류 진단’입니다. 실행을 기다리는 도구 세션89349를 유지하고 있습니다.
- 별도 셸의 프로세스 조회는 같은 실행 세션의 살아 있는 프로세스도 관측하지 못했습니다. 따라서 이전 PID 조회 실패를 앱 종료/충돌의 증거로 삼지 않습니다. 앞선 ‘앱 없음’ 판단은 이 환경의 조회 범위 제약과 구분하며 실제 시작/정상 종료 검증은 같은 세션의 Process 참조/WaitForExit와 로컬 코드로 확인했습니다.

### 미구현 및 알려진 문제

사용자의 진단 읽기 버튼 수용은 미실행이며 자동 UI/실제 파일 기록 검사와 구분합니다. UI 예외 원문·전체 native 오류 자동 수집/로그 내보내기·삭제·OS access violation·강제 종료/초기화 이전 실패의 완전 포착은 미구현입니다. panic 뒤 기록은 best effort이고 기록 손상은 다른 앱 기능을 막지 않고 진단 실패로 남깁니다. 새PC/최종 배포 수용은 계속 미실행입니다.

### 다음 작업 계획

현재 앱은 유지하고, 제품 식별자/데이터와 분리한 Windows 설치 검증 후보를 준비합니다. 내부 검증용 per-user 설치·제거/리소스·고지를 확인하고 실제 제품 배포/서명·깨끗한 OS 수용으로 확대하지 않습니다.


## 제품과 분리된 NSIS 설치·제거 검증 — 2026-10-21

### 작업 개요

현재 PC에서 일반 사용자 권한의 내부 설치·실행·정상 종료·제거 검증을 완료했습니다. 제품과 다른 이름/식별자/실행 파일을 사용하며 최종 릴리스·새PC/서명 수용은 아닙니다. 전체 Phase7/8은 미완료입니다.

### 구현 및 변경 사항

- `src-tauri/tauri.validation.conf.json`: GuitarLab Validation/com.guitarlab.validation/guitarlab-validation.exe, currentUser, Korean/English·zlib NSIS, MIT·제3자 고지·백업 안내와 고정 기본 runtime을 구성했습니다. WebView2 skip은 현재 PC에 설치된 runtime이 전제이며 새PC 배포를 대체하지 않습니다.
- `scripts/prepare_validation_installer.py`/test는 제품/실행 파일명·동일 식별자·관리자 설치·전체 public/개인 미디어 포함을 거부합니다. 고정 runtime3393개 SHA를 확인해 새 UUID의 config/plan만 생성합니다. 제품/모델/프로젝트를 바꾸지 않습니다.
- `scripts/Test-ValidationInstaller.ps1`: 기존 검증 데이터/등록이 있으면 중단하고, 검증 root/상위 링크·제거 대상을 재확인합니다. 새 작업 폴더에 /S /NS로 설치해 바로가기 생성 없이 전체 리소스/등록/독립 Python/GUI·별도 v8 DB/정상 종료를 확인합니다. 제거는 닫힌 검증 앱에만 실행하고 AppData 삭제 옵션을 주지 않습니다. 임의의 다른 파일 보존도 자체 marker로 검사합니다.
- `scripts/verify_installer_binary.py`/test는 설치된 Tauri-utils2.10.1의 단일 UNK→NSS 표식만 적용한 예상 전체 SHA와 비교합니다. 표식 외 한 바이트 변화/모호한 표식은 거부하며 실제 실행 파일을 수정하지 않습니다.
- `docs/release/INSTALLER-TOOLS.json`과 원문: CLI2.12.2가 공식 다운로드·지문 확인한 NSIS3.11/zlib-solid stub, nsis-tauri-utils0.5.3을 수집했습니다. 정확한 plugin commit `13d9edd27b69310e108d6fbd49f90992f8a05390`의 workspace MIT or Apache-2.0 상속과 두 원문, 실제 도구 SHA를 확인했습니다.3개 원문 참조 중 중복을 합쳐 notices/는201개입니다. 앱 의존성281개/원문199개와 별도 범위입니다.
- `scripts/package_validation.py`는 별도 도구 고지 JSON/원문도 검증ZIP에 포함하도록 확장했습니다. legalReviewCompleted:false를 유지합니다. docs/00·13·release에 범위와 재현 절차를 기록했습니다.

### 테스트 결과와 오류 해결

- 준비 설정 단위1개, 표식 경계 단위1개 성공. 개발 도구 전체42개 중41개/5.539초 성공·실제 링크 권한1개 skip입니다. 최종 포맷 검사가 성공했고 PowerShell7.6.5에서 실제 설치 검사를 수행했습니다. UTF-8 BOM과 기본 Windows PowerShell5.1 parser도 확인했습니다.5.1에서의 설치 전체 실행은 미실행입니다.
- `pnpm tauri build --debug --config <생성 설정>`: native18.54초·NSIS1개 생성 성공. 공식 NSIS3.11/플러그인0.5.3 다운로드·hash validation을 확인했습니다. 최초 도구 고지 검사에서 workspace 상속 문법을 단순 문자열로 오판해 정확한 root/멤버 TOML을 확인하고 수정했습니다. 제3자 소스 실행은 하지 않았습니다.
- `pnpm tauri bundle --debug --config ...`: 실제 고지 추가 후 재패키징 성공. 최초 내부 파일은 별도 보존했습니다. 최종35,955,568바이트/SHA256 `d0597a56eb8b37c8ac7386a05fd4034f9937364b4170979aae8c6c1a27a348f0`, `installer-builds/2dd183d7-edb1-4977-87f4-b14c1b623637/final/GuitarLab-Validation-setup.exe`입니다.
- 첫 실제 설치는 성공했지만 SHA 검사에서 중단했습니다. 설치 파일과 빌드 원본의 차이는 정확히3바이트 NSS/UNK였고, 설치된 Tauri-utils의 번들 표식과 CLI의 원본 복구 동작으로 좁혔습니다. 전체 비교를 느슨하게 하지 않고 그 단일 표식만 예상한 SHA를 계산하도록 수정했습니다. 같은 SHA 영수증의 이미 설치된 자체 케이스를 재개해 나머지 검사를 완료했습니다. 수정된 새 설치 스크립트의 처음부터 재실행은 기존 검증 AppData/설정 보존을 위해 별도로 하지 않았으며 초기 실행+동일 케이스 재개와 구분합니다.
- 실제 일반 사용자 token(admin=false)·새 설치/등록·runtime3393개/고지/MIT/안내·NSIS 예상 본문 SHA 성공. 설치된 본문은39,729,664바이트/SHA `5c47236b68b9b7696eb75290ab9a1f78c94326f0fb653c0459af26776ba3dde8`입니다. 정확한 창/응답·별도 빈v8 DB/quick_check·정상 종료 코드를 확인했습니다.
- 최소 PATH/PYTHONHOME·PYTHONPATH 제외로 설치된 Python3.12.15를2회 실행해 기본 모델 미설치 정상 응답을 확인했습니다. 모델 설치/다운로드는 없었습니다.
- 실제 기본 uninstaller 성공: 제거 등록/프로그램 리소스가 사라지고 AppData DB 바이트와 자체 미등록 파일 marker가 보존됐습니다. 검증용 AppData/설정은 삭제하지 않았습니다. 실제 제품은 새 DB 백업 후 원래15개 테이블 내용/모델 marker4개 SHA 모두 그대로입니다. 영수증은 installer-tests/cbb9f283-51a3-44c6-b1f1-194c14e5d19d/receipt.json 및 installer-db-before/after.json입니다.

### 미구현 및 알려진 문제

새PC/다른Windows·WebView2 미설치/전역 DLL 부재·코드서명·백신 오탐 수용은 미실행/미완료입니다. 내부 debug 설치기를 공개 배포하지 않았고 빌드 경로가 포함될 수 있습니다. 설치기 도구 원문 수집은 모든 vendor/소스 제공 조건의 최종 검토 완료가 아닙니다. UI 기반 설치 마법사 수용도 미실행입니다. 검증 AppData/설정을 보존했으므로 반복 검사 시 임의 삭제하지 않습니다. 실제 제품의 데이터 삭제/교체는 수행하지 않았습니다.

### 다음 작업 계획

현재 제품 앱/모델을 유지하며 데이터 관리의 다운로드 캐시 현황·명시적 정리를 별도 슬라이스로 진행합니다. 설치된 환경/활성 marker/프로젝트/녹음은 대상으로 삼지 않고 사용자 확인·단일 작업/취소·범위 검증을 먼저 정의합니다. 실제 사용자 캐시는 자동 삭제하지 않습니다.


### 진단 앱·설치기 고지를 합친 검증ZIP 후속

현재 소스 관리 CLI12.81초 빌드와 새 검증ZIP3605파일/39,593,306바이트·전 파일 크기/SHA/새 폴더 추출·실제 기본PowerShell5.1 최소PATH Python2회도 성공했습니다. 모델/개인 데이터는 포함하지 않습니다. `validation-packages/573ee8fa-8aad-4383-8509-03294a5dbb63/GuitarLab-validation.zip`, SHA256 `f669d4ff9fb41b50781b16fd11c930e2972556034a94acdbdbe098546a0c6427`이며 최종 릴리스/새PC 수용은 아닙니다.


## CP312 다운로드 캐시 관리 — 2026-10-21 구현/자동 검사, Windows 후보 준비 중

### 작업 개요

현재 번들용 모델 다운로드 캐시의 현황 조회와 명시적 정리 기능을 구현했습니다. 실제 사용자 캐시 삭제는 실행하지 않았으며 Windows 후보 적용은 진행 중입니다. 프로젝트/개인 녹음 삭제·휴지통과 Phase8 전체 완료는 아닙니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`에 두 native 요청과 고정프로필·revision/8필드 결과를 먼저 정의했습니다. `ai/cache_cleanup.rs`, `commands/cache_cleanup_api.rs`, handler/원격 거부 목록을 연결했습니다. 고정 CP312 계획의 artifact 이름만 허용하고 legacy cp310/설치 환경/marker/프로젝트·녹음을 제외합니다.
- 조회는 파일 수/논리 크기·이름/크기/수정시각의 revision이며 내용 SHA 검사가 아닙니다. 삭제는 최신 revision·명시 동의/단일StorageJob·REC 차단 후 허용 목록/각 파일/링크를 재확인하고 직접 자식만 unlink·빈 폴더만 비재귀 제거합니다. 일부 취소/오류는 이미 삭제된 캐시를 되돌리지 않음을 안내합니다. 실제 디스크 회수량 측정으로 표시하지 않습니다.
- `cacheCleanup.ts`, `useCacheCleanup.ts`, `CacheCleanupPanel.tsx`/tests로 서비스·상태/최소 UI를 분리했습니다. 모델 변경/조회 뒤 동의를 초기화하고 중복·늦은 응답/취소 잠금을 처리합니다. 원래 백업 종료 안내도 로컬 파일 작업을 포함하도록 문구를 일반화했습니다.
- `docs/20-LOCAL-DATA-MANAGEMENT.md`와 docs/07·10에 저장 범위/사용법·미구현을 기록했습니다. DB/모델 Python protocol/런타임3393파일·기존 설치는 바꾸지 않습니다.

### 테스트 결과와 오류 해결

- `pnpm verify:app`: 프론트331개/86파일·타입/린트/빌드28.05초/포맷·표준 Clippy와 Rust207개/11.41초 성공, 환경 의존23개 제외입니다. 마지막 오류/재다운로드 안내 조정 후 프론트 대상4개·타입/빌드49.12초·포맷을 다시 통과했습니다.
- 확장 Clippy/전체 Rust210개/11.95초·23개 제외 성공. 초기 sha2 0.11의 finalize 결과가 LowerHex를 구현하지 않아 기존 projects::hex를 재사용하도록 수정했습니다. 의존성 변경은 없습니다. `cargo +1.90.0 check --locked --offline --all-targets --all-features ...`:8.42초 성공입니다.
- 자체 캐시/프로젝트·설치 hardlink 원본 보존, unknown 파일/조회 이후·삭제 직전 변경 거부, 시작 전/일부 삭제 후 취소·다른 모델 보존, 실제 NTFS junction 차단을 검증했습니다. 새 물리 캐시 원본을 지우는 테스트는 없습니다.
- 명시 실행한 실제 읽기 전용 검사1개/0.05초 성공: Basic Pitch42개/146,364,006바이트, Demucs34개/708,033,316바이트이며 두 번의 파일 수/크기/revision이 같습니다. 실제 캐시를 삭제/다운로드하거나 개인 오디오를 분석하지 않았습니다.
- 최신 진단 앱·MIT/설치 도구 고지의 검증ZIP3605개/기본5.1 점검은 앞선 후속 기록과 같습니다. 캐시 기능은 그 이후 소스로 해당 ZIP에는 아직 들어 있지 않습니다.

### 미구현 및 알려진 문제

캐시 UI의 사용자 실제 정리 수용/삭제 후 실제 모델 재추론은 미실행이며 원래 사용자 캐시를 보존합니다. 설치 환경이 캐시 대신 자기 모델 파일을 복사해 사용하는 코드 경계를 확인했습니다. 프로젝트·녹음 삭제/휴지통/실제AppData 교체·새PC/서명·최종고지는 여전히 미완료입니다. Windows 새 후보는 아직 빌드/적용 중입니다. 다른 실행 컨텍스트에서는 기존 앱의 프로세스/창을 관측하지 못해 PID 재사용/강제 종료로 업데이트하지 않습니다.

### 다음 작업 계획

Windows 새 실행 파일 준비/기존 데이터 보존을 확인합니다. 현재 진단 앱은 유지 세션89349/PID37428에서 대기 중이므로 안전한 종료 확인 전 같은 사용자 데이터를 여는 다른 제품 버전을 강제 실행하지 않습니다. 진행 가능한 별도 검증/품질 작업은 계속합니다.

### 캐시 관리 Windows 적용·검증ZIP 후속

사용자가 기존 GuitarLab 창 종료를 확인한 뒤 새 후보를 실행했습니다. Windows 빌드36.88초·exe40,190,464바이트/SHA256 `eae89cc53fc4c9ffeabba21e75410633ee426e086b122d004b2c7f8b4abd3243`, 고정runtime3393개/64,095,996바이트를 보존했습니다. 같은 실행 세션에서5초 유지·‘GuitarLab · 캐시 관리 검증’/Responding을 확인했습니다. 현재 PID35504/portable `b13bdd70-0f51-457d-afd8-611571decc09`이며 `cache-cleanup-candidate.json`에 기록했습니다. 실제v8 DB15개 테이블/모델 활성 marker4개 SHA도 이전과 같습니다. 사용자 캐시 삭제·모델 재다운로드는 실행하지 않았습니다.

관리 CLI14.42초 빌드 성공 뒤 새 ZIP3605파일/39,699,921바이트를 생성해 전 파일 지문/새 폴더 추출을 확인했습니다. `validation-packages/3ec7c1a5-e3da-419c-ac46-8040a2f0f686/GuitarLab-validation.zip`, SHA256 `f0cb447c3031d0fbb4ccb207cd5e4834057f962a2bcadd626dfd8b914e550ac5`이며 기본 PowerShell5.1 최소PATH 검사는 진행 중입니다. 최종 릴리스/새PC 수용이 아닙니다.

다음 검사는 기존 `actual_portable_models_install_reuse_transcribe_separate_and_cancel_without_legacy_changes`를 확장해 자체 복사 캐시만 정리하고, 캐시 없는 상태에서 설치 환경 재사용/실제8음 카피·분리를 확인합니다. 원래 사용자 캐시는 전후 읽기 전용 revision으로 보존을 검사합니다. 실행 중이므로 아직 성공으로 기록하지 않습니다.

### 격리 캐시 정리 뒤 두 실제 모델 회귀 완료

확장한 격리 검사1개/278.74초가 성공했습니다. 승인된 원래 캐시는 복사해서만 사용했고 CP312 두 환경의 오프라인 설치 후 복사 캐시를 정리했습니다. 캐시 폴더 부재·논리 삭제 수/크기, 원래 사용자 캐시의 전후 현황/revision 보존을 확인했습니다. 이어 기존 설치 환경 재사용/자체 검증·앱 카피의8음/분리176400프레임·원본/legacy marker 보존·새 설치 취소를 실제 native→번들 Python 경로에서 통과했습니다. 새 다운로드/사용자 캐시 삭제/개인 녹음 분석은 없었습니다.

첫 실행은105.43초 후 `AI_CACHE_UNEXPECTED_FILE`로 실패했습니다. 테스트 재패키징을 위해 복사한 공식 cp310 원본 wheel이 CP312 캐시 폴더에 추가로 남아 있던 사례로, 허용 목록 밖 파일 거부는 유지했습니다. 테스트가 스스로 복사한 그 정확한 원본 wheel 하나만 정리해 수정했습니다. 임의 파일 허용/사용자 캐시 정리 우회는 추가하지 않았습니다. 최초/수정 로그는 `cache-cleanup-model-independence.log`/`cache-cleanup-model-independence-fixed.log`입니다.

새 ZIP3605개는 기본 Windows PowerShell5.1에서도 모든 파일 지문·개발 PATH 없는 Python3.12.15의2회 실행을 통과했습니다(`cache-cleanup-package-powershell51.log`). 현재 PC의 자동/격리 검증이며 실제 사용자 삭제 버튼 수용/새PC·최종릴리스는 계속 미실행입니다. 현재 캐시 관리 앱은 재실행하지 않고 유지하며 Phase7 공개 DI 관측과 후속 품질 작업을 이어갑니다.

## 앱 데이터 단일 실행 보호 — 2026-10-21 진행 중

### 작업 개요

같은 앱 데이터로 두 앱이 동시에 시작하면 새 앱의 미완료 녹음 복구가 기존 앱의 작업과 충돌할 수 있음을 코드에서 확인했습니다. 프로세스/PID 조회에 의존하지 않는 시작 전 OS 잠금을 구현했습니다. 실제 제품 앱은 아직 이전 캐시 후보 PID35504이며 재실행하지 않았습니다. 전체 Phase8은 미완료입니다.

### 구현 및 변경 사항

- docs/12에 고정 빈 파일/비차단 배타 잠금·수명/경로·초기화 전 차단·구버전/CLI 한계를 먼저 정의했습니다. `instance.rs`는 추가 의존성 없이 표준 File::try_lock을 사용합니다. 확인한 안정화 버전1.89보다 프로젝트 최소1.90이 높으며 실제1.90 check도 수행합니다.
- `app.rs`는 진단 writer/DB·미완료 녹음 복구보다 먼저 잠금을 획득해 상태에 보유합니다. 중복/잠금 실패 때 새 창만 숨기고 기존 dialog2.8.2의 비동기 show로 고정 한국어 안내→새 프로세스 종료를 연결했습니다. UI thread에서 blocking_show를 호출하지 않습니다. 다른 root/기존 앱·장치·개인 자료를 조작하지 않습니다.
- `lib.rs`와 docs/07을 갱신했습니다. 새 IPC/DB migration·PID 저장/강제 종료·잠금 파일 삭제는 없습니다. 구버전과 외부 CLI는 기존 정상 종료 전제 조건을 유지합니다.

### 테스트 결과

자체 검사3개/0.21초 성공·자식 전용1개 제외입니다. 부모 검사가 해당 자식을 실제 실행해 같은 root 중복 거부·다른 root 허용·Drop 없이 프로세스 종료 뒤 재획득/기존 DB 바이트 보존을 확인했습니다. 상대 경로/비어 있지 않은 잠금 파일 거부·원본 보존도 확인했습니다. 최초 전체 앱 검사는 alphaTab의 sonivox.sf3 복사 중 Windows UNKNOWN 오류로 중단됐습니다. 두 파일의 지문 일치/서로 다른 파일 ID를 확인하고, 설정/의존성 변경 없이 동일 검사를1회 재시도 중입니다.

### 미구현 및 알려진 문제

실제 Tauri 창2개/안내·종료 수용, 새 Windows·프로세스 외부 파일 변조에 대한 완전 보호는 미실행입니다. 잠금이 없는 구버전/직접 파일을 쓰는 외부 도구를 제어하지 않습니다. 기존 창을 자동 검색/앞으로 가져오는 기능은 추가하지 않았습니다. 잠금 실패 때 데이터 초기화는 시작하지 않으며 기존 데이터는 유지합니다.

### 다음 작업 계획

전체 회귀/MSRV 검사 뒤 제품 AppData와 분리한 검증 식별자로 실제 Windows 창의 중복 안내/새 프로세스 종료·첫 프로세스/DB 보존·재실행을 확인합니다. 현재 사용자 앱은 그대로 유지합니다.

### 단일 실행 보호 실제 Windows 검증 완료

- 재시도한 `pnpm verify:app`이 성공했습니다. 프론트331개/86파일·타입/린트/빌드26.55초/포맷·표준 Clippy와 Rust211개/11.19초 성공, 환경 의존/자식 전용25개 제외입니다. 확장 Clippy11.41초/Rust214개11.04초·Rust1.90 all-targets/all-features check10.26초도 성공했습니다. 첫 alphaTab font 복사 오류의 정확한 원인은 미확정이며 동일 명령 재시도 후 성공했고 의존성/복사 설정을 임의로 바꾸지 않았습니다.
- 별도 식별자 `com.guitarlab.instanceproof`/실행 파일 `guitarlab-instance-proof.exe`/‘GuitarLab · 중복 실행 검증’의 Windows 빌드29.36초, exe40,217,088바이트/SHA256 `e6399995f6450d7059e583540814b3d1835ff1338734caf908da8093949452ac`가 성공했습니다. 원래 고정runtime3393개 전체SHA도 일치합니다. 제품 앱/데이터와 분리된 검증 후보이며 이 exe를 제품의 기존 프로젝트를 여는 앱으로 안내하지 않습니다.
- 같은 실행 세션에서 첫 앱 정확한 창/응답→두 번째 앱의 고정 ‘GuitarLab 시작 안내’→정상 CloseMainWindow로 안내 닫기/두 번째 종료 코드1→첫 앱 계속 응답 및 DB/진단 SHA 보존→첫 앱 정상 종료 코드0→다시 실행/정상 종료 코드0을 확인했습니다. 강제 종료/PID 검색은 없었습니다. 최종 진단은 정확히 APP_STARTED/APP_EXITED 두 쌍으로 중복 시도에서는 writer/DB 복구가 시작되지 않았습니다.
- 별도 앱의 빈DB v8/quick_check·15테이블/프로젝트0·테이크0을 읽기 전용 확인했습니다. 자체 검증 AppData/빈 잠금 파일은 보존합니다. 영수증은 `instance-windows-proof.json`, 실행 스크립트/로그는 `Test-InstanceProof.ps1`/`instance-windows-proof.log`, 후보는 `instance-proof-candidate.json`입니다. 현재 제품 앱PID35504는 닫거나 재실행하지 않았으며 아직 캐시 버전입니다.

이 기능의 구현/자체·별도 Windows 수명주기 검증은 완료입니다. 실제 사용자 제품 후보 전환/구버전과의 혼용 차단·새PC 수용은 별도 미실행이며 전체Phase8은 미완료입니다. 다음 제품 빌드·전환에는 기존 정상 종료 절차와 v8/모델 보존 검사를 적용합니다.

### 제품 전환·관리 CLI·Windows 기본 셸 검증 완료 — 2026-10-21

사용자가 기존 창이 닫혔다고 확인한 뒤 새 제품 후보를 실행했습니다. Windows17.26초·exe40,216,576바이트/SHA256 `6fb838eb3f6a8ea76b4c692b50166703935d7491ed9c72398137c4484e545afd`, 제목 ‘GuitarLab · 데이터 충돌 보호’/PID19208/응답을 확인했습니다. 실제 기존 DB15테이블과 모델4marker SHA가 같습니다. 관리 CLI도 앱과 같은 OS 잠금을 쓰도록 연결했고 실제 제품 실행 중 verify가 worker 시작 전 INSTANCE_ALREADY_RUNNING으로 거부됐습니다. 자체 임시 root의 install/download/verify 차단1개0.35초·확장Rust214개11.15초/26개 제외·Clippy9.73초/MSRV13.62초 성공입니다. CLI의 inspect는 사용자 데이터에 접근하지 않아 잠금 없이 유지합니다.

새 ZIP `validation-packages/8d344f3a-37e2-4c44-b2f9-a40a46f41359/GuitarLab-validation.zip`은3605파일/39,723,348바이트/SHA256 `85b54afd19748bb32079943eb39280ae7c51c12c64269311cbe0cff7d25f7c6f`입니다. 모든 항목의 지문·새UUID폴더 추출과 실제 기본 PowerShell5.1의 전체검사/최소PATH·독립Python3.12.15 두 번 실행이 성공했습니다. 사용자 자료/모델은 포함하지 않았으며 새PC·최종 라이선스 검토/서명 완료는 아닙니다.

`scripts/Run-ValidationCandidate.ps1`은 현재 검증 receipt의 경로·크기/SHA만 허용하고 PTY에서 실제 Process를 유지합니다. status/close만 처리하고 정상 CloseMainWindow를 사용해 native 녹음/저장 차단을 유지합니다. 처음 닫힌 stdin에서는 앱 실행 전 거부하도록 했고 동기 ReadLineAsync 대기는 비차단 키 입력으로 수정했습니다. 별도 창의 정상 상태→닫기→종료0/추가 입력 불필요를 실제 검증했습니다. 현재 제품 유지 세션은96267이며 강제 종료는 없습니다. 이 helper의 PS5.1 구문/실행은 아직 미실행이고 위 ZIP 점검 스크립트의 PS5.1 성공과 구분합니다.

다음 한 슬라이스는 미저장 악보 종료 보호입니다. docs/12 계약부터 작성했으며 변경 감지/1회 native 허가/확인 취소·응답 유실 폴백과 파일 작업 우선 차단을 구현 중입니다. 전체Phase8 체크는 유지합니다.

## 2026-10-21 — 미저장 악보 종료 보호

### 작업 개요

종료 시 악보 편집이 조용히 소실되는 경로를 막는 Phase8 안정성 슬라이스입니다. 구현/자동 회귀와 Windows 빌드를 완료했고 실제 제품 전환/종료·재실행을 확인 중입니다. 전체Phase8 완료는 아닙니다.

### 구현 및 변경 사항

- docs/12에 버전1 활성화/현재 UUID 요청·응답, 취소/5초 무응답 폴백·native 우선순위를 먼저 정의했습니다. Rust `close_guard.rs`, `commands/close_api.rs`, app handler의 상태 머신/확인창을 연결했습니다. 이미 사용하는 uuid1.28.0의 serde 기능만 켰고 새 외부 라이브러리는 추가하지 않았습니다.
- 프론트 `scoreDirty.ts`는 원본별 초기 불변 문서/저장 revision과 비교합니다. 실제 편집/Undo·Redo/저장·읽기 보완을 구분하며 단순 불러오기를 편집으로 표시하지 않습니다. `closeGuard.ts`는 엄격한 결과 계약, `useCloseGuard.ts`는 현재 상태 응답/구독 해제·고정 오류 코드와 최소 안내를 처리합니다. 악보 엔진·데이터 형식을 UI 구성에 종속시키지 않습니다.
- 확인 뒤 native close를 다시 요청해 녹음·설치·백업/진행 StorageJobs를 재검사합니다. 파일 선택 취소 요청 뒤 실제 작업이 종료되기 전에도 차단합니다. frontend Window.onCloseRequested의 기본 destroy 경로를 사용하지 않으며 창 close/destroy·원격 권한은 추가하지 않습니다. root 해제로 활성화 상태를 지우지 않고 응답이 없을 때만 명시적 폴백을 제공합니다.
- App의 공통 안내와 고정 logger 코드, docs/20 사용 범위를 추가했습니다. Python/DB v8/저장 악보·녹음은 변경하지 않습니다.

### 테스트 결과와 오류 해결

- 타입·ESLint 성공. 전체 Vitest338개/89파일24.65초, 추가 대상13개/최종 hook3개 성공. 편집·Undo/Redo·저장/원본 교체, 잘못된 계약/오류, 늦은 구독 해제·현재 상태 응답을 확인했습니다. Vite52.92초/마지막 공통 안내 문구 후40.84초 성공입니다. 기존 alphaTab 포함 큰 청크 경고는 남아 있습니다.
- 확장 Clippy23.44초·전체 Rust218개11.59초/26개 제외 성공 후 마지막 공통 차단 안내의 중첩 if가 Clippy collapsible_if에 걸렸습니다. 조건을 합쳐 수정한 뒤 같은 전체 검사를 다시 실행했습니다. 최종 수치는 후속 기록을 따릅니다. 순수 종료 요청의 정상/취소/오래된 확인·1회 허가/늦은 응답/REC 우선과 파일 선택·취소 중 보호를 검증했습니다.
- `cargo +1.90.0 check --locked --offline --all-targets --all-features`:1분17초 성공. 설치된 Tauri2.12.3의 onCloseRequested/destroy 구현과 dialog2.8.2의 비동기 show/취소 결과를 직접 확인했습니다.
- Windows 후보 build46.87초 성공. 기존 제품은 유지 PTY에서 정상 close/exit0을 확인했습니다. 강제 종료는 없습니다. v8/15테이블·모델4marker의 읽기 전용 지문/새 DB 백업을 전환 전에 만들었습니다. 새 제품 실행·원본 보존·정상 종료의 실제 결과는 후속입니다.

### 미구현 및 알려진 문제

실제 dirty 확인창의 사용자 클릭/취소·실제 녹음 동시 종료 수용은 미실행입니다. 자동 상태 머신 검증과 구분합니다. 프로젝트 전환·폼/믹스의 미저장 상태, OS/강제 종료를 보호하거나 자동 저장하지 않습니다. root가 구독 자체에 실패하면 저장 후 종료 안내를 표시하며 native가 아직 활성화되지 않았을 수 있습니다. 전체Phase8·새PC/최종고지·서명은 미완료입니다.

### 다음 작업 계획

현재 제품 실행/깨끗한 상태의 정상 종료·재실행과 기존 데이터를 확인하고, 미저장 확인 취소의 실제 수용을 별도로 기록합니다. 진행 가능한 다음 안정성 작업을 이어가며 검증하지 않은 Phase 항목을 체크하지 않습니다.

### 종료 보호 Windows 적용·정상 종료 확인

최종 확장Clippy5.68초/Rust218개11.22초·26개 제외, 전체포맷/cargo fmt가 성공했습니다. 후보 exe40,297,984바이트/SHA256 `690b7405013c735f50aaf1f2c6f2c7671a8cc4e0bf8168d82a747c6f4a6b6cac`, runtime3393개 전체 지문을 확인했습니다. 실제 제품 PID20100 실행/응답·v8기존15테이블/모델4marker 보존→변경 없는 상태의 정상 CloseMainWindow/exit0→같은 exe 재실행/응답이 성공했습니다. 현재 PID29636·유지PTY48186/‘GuitarLab · 악보 종료 보호’이며 `close-guard-candidate.json`, `close-guard-lifecycle.json`에 기록했습니다. 기존 제품 PID19208도 정상 종료0이며 강제 종료는 없었습니다.

실행 유지 도구는 실제 기본 Windows PowerShell5.1에서 구문 검사뿐 아니라 상태·정상 close/추가 입력 없이 exit0과 재실행까지 통과했습니다. 앞 절의 helper PS5.1 미실행은 이 후속으로 대체합니다. 실제 미저장 확인창/계속 편집의 사용자 수용은 요청했고 응답 대기입니다. 앱/소스를 유지하며 별도 새 검증ZIP을 점검합니다. helper 실행의 성공을 모든 데이터 소실 경로 보호나 새PC 수용으로 확대하지 않습니다.


### 실제 미저장 확인 수용과 개발 실행 분리 — 2026-10-21

첫 수용에서 사용자는 ‘계속 편집’ 뒤 검은 화면·프로젝트 초기화/변경 소실을 보고했습니다. 실패로 기록하며 자동 검사 성공으로 대체하지 않습니다. 당시 검증한 고정 프로세스29636은 종료0이었고 실제 열린 창은 debug/guitarlab.exe PID32060/‘GuitarLab’이었습니다. 부모의 pnpm tauri dev→cargo run과 개발 포트1420을 읽기 전용 확인했습니다. 사용자에게 개발 실행과 창 종료를 요청했고 앱·부모/1420 listener 부재를 확인했습니다.

제품 소스/실행 파일을 변경하지 않고 같은 SHA690b7405…의 ‘GuitarLab · 악보 종료 보호’만 실행했습니다. 사용자 재검사에서 편집→X→‘계속 편집’ 후 프로젝트와 바꾼 숫자가 유지됨을 확인했습니다. 현재 PID34216/유지PTY65285입니다. 처음 실패가 발생한 정확한 재시작/초기화 시점은 미측정이므로 개발 서버를 유일한 원인으로 확정하지 않습니다. 이후 수용은 고정 빌드 하나에서 수행하며 같은 사용자 데이터를 개발 앱과 함께 열지 않습니다. 저장하지 않고 닫기의 실제 사용자 클릭/진행 REC 동시 종료 수용은 미실행이고 자동 상태 머신 검사와 구분합니다.

## 2026-10-21 — 검증 ZIP 무결성 보완

### 작업 개요

검증 패키지의 목록·전체 지문 확인을 공통 함수로 만들고 잘못된 컨테이너의 경계를 검증했습니다. 이 도구는 실행/추출·사용자 데이터·네트워크 작업을 하지 않습니다. Phase8의 배포 준비 일부이며 최종 배포는 아닙니다.

### 구현 및 변경 사항

`scripts/package_validation.py`의 verify_archive는 신뢰한 외부SHA/압축64MiB·전체256MiB/5000항목·파일64MiB/목록4MiB, 안전 Windows 경로·대소문자 중복/링크/암호화·허용 압축·중복 JSON키/정확한9필드와 파일3필드·필수 exe/스크립트/MIT를 검사합니다. CRC와 전 파일 SHA를 확인하며 지문 검사 후 동일 메모리 바이트를 사용해 다른 경로 내용을 다시 열지 않습니다. package 생성 완료 전에도 같은 함수를 사용합니다. 코드 실행·출력 폴더 생성 기능은 없습니다. 기존 패키지 CLI는 위치 인수 candidate를 유지하고 새 설치 라이브러리는 없습니다.

### 테스트 결과와 오류 해결

- 기존 생성 ZIP3605개/39,735,915바이트/SHA `493b962bda6a804296a1605075fe3377e180ddced27ee58ad0526f7a28e27201`을 새 공통 검사로 확인·새 폴더 추출했고 기본PowerShell5.1의 전 파일·독립Python3.12.15 두 번 검사를 통과했습니다. close-guard-package-roundtrip.json과 close-guard-package-powershell51.log에 기록했습니다.
- 공통 검사 연결 뒤 package_validation.py의 실제 생성 명령도 성공했습니다. 새 ZIP `validation-packages/bb73b7b0-a490-4b8c-a795-b6fab729c4b2/GuitarLab-validation.zip`은 같은3605개/39,735,915바이트·SHA `8c34301de8b4e2c996aaa1447a4e05bd005961cc6fb3aea5ba0f1fb74f6b9145`입니다. 이 새 ZIP의 별도 추출/PS5.1은 아직 미실행이며 이전 ZIP과 구분합니다.
- `python -B -X utf8 -m unittest discover -s scripts -p test_package_validation.py -v`:7개0.447초 성공. 전체 scripts52개6.044초 중51개 성공/링크 권한1개 제외입니다. 가짜 실행 파일은 실행하지 않고 목록/원본 보존, 잘못된 필드/중복·경로/링크·CRC/지문·한도 전 읽기 차단 및 확인 뒤 입력 경로 변경을 검사했습니다.
- 처음 패키지 호출에 미지원 --candidate를 사용해 argparse 오류로 중단됐고 실제 위치 인수로 수정했습니다. 그 실패는 패키지를 생성하지 않았습니다. 실제 사용자 파일/모델 캐시 삭제는 없습니다.

### 미구현 및 알려진 문제

외부 SHA의 신뢰성/공식 서명·모든 라이선스 검토/새PC 수용을 이 함수로 보장하지 않습니다. 모델·개인 데이터 제외는 생성 허용 목록과 별도 검토의 범위이며 ZIP의 임의 내용 의미를 자동 판정하는 기능이 아닙니다. 전체Phase8/실제 데이터 교체·휴지통은 미완료입니다.

### 다음 작업 계획

새 ZIP의 독립 점검을 마치고 MPL 선언 구성요소의 정확한 버전별 소스 접근 안내를 확인합니다. 기존 고정 앱/편집 상태는 유지합니다.


### 검증 ZIP 공통 검사 연결 후 기본 셸 점검 완료

앞 절의 새 ZIP8c34301d…도 새 폴더 추출/전체 지문과 실제 기본PowerShell5.1·최소PATH 독립Python3.12.15 두 번 검사를 통과했습니다. package-integrity-roundtrip.json/package-integrity-powershell51.log에 기록했습니다. 이어진 소스 접근 안내 ZIP은 별도 아래 기록을 따릅니다.

## 2026-10-21 — MPL 구성요소 소스 접근 안내

### 작업 개요

기존 배포 고지의 후속으로 정확한 MPL-2.0 선언6개에 소스를 얻는 방법을 연결했습니다. 새 의존성/모델 선정이나 최종 법적 검토 완료가 아니며 현재 고정 앱/미저장 편집 상태는 유지합니다.

### 구현 및 변경 사항

- docs/release/SOURCE-ACCESS.json과 SOURCE-ACCESS.ko.md에 버전·공식 위치·원본 지문/검토 상태를 기록했습니다. Rust5개(cssparser/cssparser-macros/dtoa-short/option-ext/selectors)의 원본 crate150,290바이트를 sources/에 그대로 복사해 오프라인으로 제공합니다. 원본 고지/타사 코드는 번역·수정하지 않습니다.
- Cargo.lock의 각 archive SHA와 실제 캐시 원본이 같고 설치 registry의 소스66파일이 archive 내용과 같음을 읽기 전용 확인했습니다. 처음에는 개발Python3.10에 tomllib가 없었고 registry에 .cargo-checksum.json도 없었습니다. 새 의존성을 설치하지 않고 잠금의 해당 고정 항목/원본 TAR 스트림의 실제 SHA를 직접 비교하는 방법으로 확인했습니다. archive를 실행하거나 풀어 설치하지 않았습니다.
- alphaTab1.6.1의 공식 npm 메타데이터 SHA cc51aae8…/잠금 integrity 일치와 gitHead 4f78524781ce9441cba1267d45a983c6ac92b977의 GitHub 공개 트리를 확인했습니다. 트리의 TypeScript580개에는 도구도 포함하며 실제 코드 규모나 품질 지표로 사용하지 않습니다. 전체 alphaTab 소스 archive는 동봉하지 않고 정확한 commit 링크를 제공합니다. npm/GitHub의 공개 메타데이터만 수신했으며 개인 자료/모델 전송은 없습니다.
- package_validation.py의 source_archives는 현재 inventory의 MPL 선언 집합·버전/중복/누락·고정 원본 경로/지문·검토 미완료 상태를 검증하고 ZIP에 안내2개/원본5개를 추가합니다. 이동하는 alphaTab branch나 임의 외부 archive URL을 거부합니다. test_release_source_access.py를 추가했습니다. 기존 app/native/AI IPC와 DB8은 바꾸지 않습니다.

### 테스트 결과와 오류 해결

- 소스 접근 대상3개0.194초 성공. 전체 Python55개6.253초 중54개 성공/기존 링크 권한1개 제외입니다. 실제 동봉 지문/정확한 버전 집합·오류/경로/잘못된 hash/공식 출처·이동 branch 거부를 검사했습니다.
- 새 생성 명령 성공: validation-packages/8b2ace8b-a520-4344-b17b-846ce4ed1224/GuitarLab-validation.zip, 3612파일/39,890,840바이트/SHA256 d6dbdbf7b8add25c326cb111a6b38e4aa20e4c2dd8bbeda5af9dc15f86e262cb입니다. 전체 지문/원본 crate5개·새 폴더 추출은 성공했고 기본PowerShell5.1 점검은 진행 중입니다. 최종 결과는 후속으로 기록합니다.
- GitHub tag 페이지/웹 도구의 crates 페이지 읽기는 실패했으므로 성공으로 기록하지 않습니다. 실제 npm의 정확한 gitHead/API tree와 기존 Cargo 캐시/잠금의 원본을 사용했습니다. Mozilla의 공식 MPL2.0 3.1~3.4를 다시 확인했으며 고지 안내에 직접 링크했습니다.

### 미구현 및 알려진 문제

legalReviewCompleted/cleanWindowsValidated는 false를 유지합니다. selectors 원본 archive의 별도 LICENSE 부재는 그대로 기록하고 표준 MPL 원문은 기존 동봉 고지로 연결합니다. alphaTab 소스 링크는 인터넷이 필요합니다. 전체 하위 vendor/가공물·모델 조건·수정 소스 의무와 서명/새PC는 최종 검토 전입니다. 기존 NSIS 설치 파일을 소급 수정하지 않았으며 현재 앱의 UI/기능은 같습니다.

### 다음 작업 계획

소스 포함 ZIP의 기본 셸 점검을 마치고 사용자 데이터 정리의 되돌릴 수 있는 프로젝트 보관/복원부터 계약·마이그레이션/백업 호환성을 확인합니다. 개인 원본/녹음의 실제 삭제나 자동 정리는 실행하지 않습니다.

### 소스 포함 ZIP 독립 점검 완료

위 ZIP d6dbdbf7…의 별도 추출/전체 지문과 실제 기본PowerShell5.1·최소PATH의 독립Python3.12.15 두 번 검사를 통과했습니다. source-access-roundtrip.json/source-access-powershell51.log가 증거입니다. 이 ZIP은 v8 악보 종료 보호 버전이며 후속 프로젝트 보관 기능을 포함한다고 주장하지 않습니다.

## 2026-10-21 — 프로젝트 보관·복원 Windows 후보

### 작업 개요

Phase8 사용자 데이터 관리 중 되돌릴 수 있는 목록 보관 한 슬라이스입니다. 2026-10-21 구현/자동 회귀 검증을 마쳤으며 Windows 후보 빌드·실제 마이그레이션/사용자 UI 수용은 진행 중입니다. 전체 Phase8 완료나 영구 삭제 기능이 아닙니다. 기존 고정 앱과 미저장 편집은 검증 동안 유지합니다.

### 구현 및 변경 사항

- docs/12·07에 먼저 버전1 계약/DB009를 정의했습니다. migrations/009-project-trash.sql, storage/project_trash.rs, commands/project_trash_api.rs 및 명령 허용 목록을 추가했습니다. 보관은 marker만 추가하고 복원은 해당 marker만 제거합니다. 프로젝트·revision·원본·녹음·점수 파일의 이동/삭제는 없습니다.
- 현재 revision/UUID·복원 토큰·1000개 한도·RUNNING 연습/활성 녹음·단일 파일 작업·취소 전 커밋/롤백을 검사합니다. 일반 프로젝트 목록에서 제외하고 기존 프로젝트/녹음/AI/믹스 읽기·쓰기 경로의 소유권 검사에 보관 상태를 연결했습니다. 원격 웹뷰에는 새 명령을 허용하지 않습니다.
- projectTrash.ts의 엄격한 계약/StorageJob, useProjects의 단일 작업·취소 완료 대기/늦은 응답 폐기, LibraryPage/ProjectTrashPanel의 최소 보관·복원 UI를 추가했습니다. 현재 열린 프로젝트는 보관하지 않으며 복원도 자동으로 열거나 현재 악보를 교체하지 않습니다.
- useCloseGuard의 최신 불변 문서 비교를 재사용해 useProjects에 필수 beforeReplace 어댑터를 전달합니다. 새 프로젝트/열기·다시 열기/프로젝트 악보 교체에서 취소·확인 실패는 현재 편집과 미디어 문맥을 유지합니다. 브라우저 확인은 화면 어댑터에만 두며 저장 엔진/IPC를 바꾸지 않습니다. projectError가 Error.code와 Error.message의 고정 오류 코드를 구분하지 못하던 분기도 고쳐 사용자 경로/임의 오류 원문을 표시하지 않습니다.
- backup_local_data.py는 기존 v8/새 v9를 허용하고 실제 버전을 manifest에 보존합니다. 전체 SHA/CRC 확인 때 SQLite 헤더 offset60의 user_version도 대조합니다. v9 보관 자료도 백업하며 기존6필드 결과/Python AI protocol은 유지합니다. docs/19·20의 백업/보관·교체 보호 범위를 갱신했습니다.
- project_trash_tests.rs, projectTrash.test.ts, useProjects/LibraryPage/useCloseGuard 통합 검사와 이전 v2~v8 migration fixture/백업 검사를 보완했습니다. 이전 테스트의 버전 기대만 v9로 바꾸고 원래 행/파일 보존 검증은 유지했습니다.

### 테스트 결과와 오류 해결

- pnpm typecheck/lint/test/build: 성공. 최종 프론트91파일/349개23.83초, Vite43.91초입니다. 취소 요청 뒤 실제 native 완료까지 대기·이미 완료한 보관 유지·오류/거부·복원 중 현재 악보 유지·미저장 확인 취소/실패를 검사했습니다. Vite의 큰 chunk 안내는 남아 있으며 기능 실패는 아닙니다.
- cargo fmt --check, 확장 clippy --all-targets --all-features -- -D warnings: 성공(6.12초). cargo test --all-features:226개11.45초 성공/환경 의존26개 제외. cargo +1.90.0 check --all-targets --all-features:4.96초 성공입니다.
- 보관/복원 검사7개는 기존 전체 테이블 행, 원본 참조/관리 파일, READY 녹음 WAV·메타데이터, 재열기, v8→v9 추가만 적용, 취소/버전 충돌/강제 SQL 오류 롤백·과거 토큰/한도/실행 중 연습 거부를 포함합니다. 실제 사용자 프로젝트의 보관/삭제는 실행하지 않았습니다.
- Python 백업15개 중14개 성공/링크 권한1개 제외(6.741초), 전체 scripts57개 중56개 성공/같은1개 제외(7.799초). 기존 v8 ZIP과 보관 marker·미디어를 포함한 v9 ZIP/새 폴더 미리보기·지원 버전 불일치 거부를 확인했습니다. AI 분석 소스는 변경하지 않아 모델 전체 재추론은 이번 미실행입니다.
- 실제 번들Python3.12.15로 자체 v9 DB·관리 악보·보관된 READY 녹음 WAV의 ZIP 생성→검사→새 폴더 미리보기/원본 보존·취소/worker 회귀1개24.35초 성공입니다. 처음 resource 인자로 ai-runtime 자체를 넘겨 같은 폴더를 중복 탐색한 AI_RUNTIME_INTEGRITY 실패는 상위 경로로 바로잡았습니다. 기존26.02초 성공 후 READY WAV 보존까지 추가한 최종 실행이며 실제 AppData를 쓰지 않았습니다.
- 초기 u64 SQLite 바인딩/조회는 i64 저장과 검사된 변환으로 수정했고 open 반환 tuple 기대를 정정했습니다. 기존 migration6개가 v8 고정 기대 때문에 실패한 것은 fixture와 최신 버전 기대를 보완한 뒤 전체 재검사했습니다. 마지막 테스트 추가 후 fmt 검사는 포맷 차이로 실패해 cargo fmt 뒤 통과했습니다. MSVC linker가 .lib/.exp 생성 안내를 warning으로 보고했으나 Clippy 코드 경고/테스트 실패는 없습니다.

### 미구현 및 알려진 문제

Windows 후보 실행/실제 사용자 v8→v9 보존과 보관·복원 UI 수용은 아직 미실행입니다. 기존 앱은 v8이므로 새 기능이 적용됐다고 표시하지 않습니다. v9 적용 후 v8까지만 지원하는 구버전 앱은 해당 DB를 열 수 없어 전환 전에 백업합니다. 영구 삭제/디스크 회수·실제 AppData 교체·별도 직접 악보 가져오기/폼/믹스/OS 강제 종료 보호·자동 저장은 미구현입니다. 새PC/서명/백신/최종 라이선스 검토·고급 판정 품질도 미완료입니다.

### 다음 작업 계획

Windows 후보 빌드/전체 runtime 지문 확인을 마치고 사용자 미저장 악보 저장·녹음 종료 뒤 기존 창의 정상 종료를 확인합니다. v8 백업·기존15개 테이블/모델4개 marker를 기록한 뒤 v9에서 추가 보관 테이블만 생기는지 확인합니다. 새 테스트 프로젝트로 보관/복원·미저장 프로젝트 교체 취소를 수용하고 최신 검증 ZIP/재실행 보존을 점검합니다. 그동안 개인 파일/캐시를 자동 삭제하지 않습니다.

### Windows 적용과 현재 수용 상태

전체 포맷 검사도 성공했습니다. 내장 Windows 후보는45.00초, 관리 CLI는15.04초 빌드 성공입니다. 하드링크 실패는 복사 폴백으로 빌드를 완료했고 기존 macOS 식별자 권고/MSVC 링크 생성 안내도 남깁니다. 고정 실행 파일40,570,880바이트/SHA256 bea93edbdb65017a2a7aad530ca560e37067a00411f5360331444036a77dcbae와 runtime3393개/64,095,996바이트 전체 지문을 원본/복사본에서 확인했습니다.

사용자가 기존 앱을 닫았다고 답했고 유지PTY65285에서 정상 종료0/forced=false를 확인했습니다. 실제 DB를 작업 폴더의 새 UUID 아래 백업한 뒤 v9 후보를 열었습니다. 읽기 전용 비교에서 원래15개 테이블의 모든 행 지문·모델 marker4개가 같고 project_trash만 빈 테이블로 추가됐으며 quick_check/foreign_key_check가 정상입니다. project-trash-db-before/after.json에 기록했습니다. 현재 PID39480/기본PS5.1 유지PTY77976·제목 ‘GuitarLab · 프로젝트 보관 검증’/portable db1f5a6d-6631-403d-9a1f-3117f1dfb29b입니다. 모니터 기본OFF/고급 코드 점수OFF는 유지합니다.

새 ZIP validation-packages/5f86ab8c-1d92-4d23-9381-cd4227546362/GuitarLab-validation.zip은3612개/39,942,688바이트/SHA256 a3fbda3b8590d9f17ca87e0a25ea9d160ed7e593e26d4a21ce134088e5420ac5입니다. 생성 완료 공통 검사는 성공했고 별도 추출/기본PS5.1 점검은 진행 중입니다. 기존 v8 ZIP과 구분합니다. 사용자에게 새 ‘보관 테스트’ 프로젝트의 보관/복원을 요청했으며 실제 UI 수용/재실행 보존은 아직 미실행·응답 대기입니다. 사용자 확인 중 앱을 재실행하지 않습니다.

### 수용 실패와 열린 프로젝트 보관 후속

위 ZIP의 별도 추출/전체 지문과 기본PS5.1·최소PATH 독립Python 두 번 검사는 성공했습니다. project-trash-package-roundtrip.json/project-trash-package-powershell51.log에 기록했습니다. 이 ZIP은 후속 열린 프로젝트 보관 수정을 포함하지 않습니다.

사용자가 다른 프로젝트는 보관되지만 새 ‘보관 테스트’의 버튼은 비활성이라고 두 번 보고했습니다. 첫 답변에서 현재 프로젝트 보호로만 설명하고 전환을 반복 요청했으나 수용되지 않았습니다. 실제 다른 프로젝트 열기 실패 여부를 관측한 것은 아니며, 코드에서 현재 details ID의 버튼/명령을 무조건 차단하는 제한을 확인했습니다. 이를 완료로 기록하지 않습니다.

docs/00·12의 범위를 먼저 갱신해 열린 프로젝트도 미저장 확인 후 보관하게 수정했습니다. useProjects는 성공 응답 후에만 프로젝트·악보·재생 문맥을 비우며 실패/취소는 보존합니다. LibraryPage는 새/현재 항목도 보관 버튼을 허용하고 보관 후 화면을 닫는 이유를 표시합니다. 다른 항목의 보관/복원은 현재 문서를 유지하고 native 연습/REC 보호도 같습니다. 새 유일 프로젝트의 생성→직접 보관→복원과 미저장 확인 거절/연습 중 오류/취소·최종 성공 시점 회귀를 추가해 대상16개를 통과했습니다. 전체 검사/새 Windows 반영은 진행 중이며 현재 PID39480 앱은 기존 제한 버전 그대로입니다.

### 반복 설치 검증 준비

기존 전용 설치 검증 데이터는 제거 후에도 보존해 다음 동일 식별자 검사를 막습니다. 새 검사를 위해 데이터를 삭제하지 않고 prepare_validation_installer.py에서 검증한 템플릿에 실행 UUID 식별자를 붙여 AppData만 분리했습니다. Test-ValidationInstaller.ps1은 정확한 prefix/UUID·계획 일치·생성 NSIS 식별자와 새 v9/빈 보관 목록을 검사합니다. 2회 준비의 이전 config/원본 보존·서로 다른 ID 회귀를 추가했습니다. 처음 테스트 삽입 위치가 잘못돼 기존 변조 검사 루프에 bytes를 넘긴 오류1개는 위치를 바로잡은 뒤 대상2개 성공했습니다.

전체 scripts58개를 기본 샌드박스에서 실행하자 ZIP 게시 하드링크 WinError5 때문에 자체 백업10개가 실패했습니다. 보호를 완화하지 않고 실제 Windows 임시 fixture로 다시 실행해57개9.849초 성공/기존 링크 권한1개 제외입니다. 첫 새 NSIS 빌드는 target/debug/guitarlab.exe의 제거 접근 거부로 실패했으며 설치/실행은 하지 않았습니다. 기존 제품/검증 AppData 삭제나 강제 프로세스 종료는 없습니다. 최신 UI 빌드 후 실행 파일 교체 권한을 확인해 재시도합니다. 새로운 설치본 수용/새PC는 아직 미실행입니다.

### 열린 프로젝트 보관 수정 적용·사용자 수용 완료

- 타입/lint/전체 프론트91파일351개25.34초·Vite49.35초 성공입니다. UI/화면 controller만 수정해 native 보관 엔진/SQL/IPC는 같고 Rust226개/번들 백업24.35초는 앞 절 결과를 유지합니다. 새 네이티브 Windows 후보 빌드는19.21초 성공입니다. 실제 실행 파일 교체가 가능한 권한에서 빌드했으며 기존 .app 식별자 권고/링커 생성 안내는 남습니다.
- 실행 파일40,570,880바이트/SHA59f348d272f978857f7555e4fd9bc9c70617e7b5bca93079145756388629e500와 runtime3393개 전체 지문을 확인했습니다. 이전 제어PTY77976에 정상 종료 요청을 보내려 했으나 Unknown process id로 전달되지 않았습니다. 다른 프로세스 조회의 부재를 종료 증거로 취급하지 않고 사용자에게 창 종료를 요청했습니다. 사용자 ‘여셈’ 뒤 DB v9 백업/모델 지문을 기록하고 native 단일 실행 보호를 유지한 고정 후보를 실행했습니다. 강제 종료는 없습니다.
- 현재 PID35760/제목 ‘GuitarLab · 새 프로젝트 보관 수정’/portable42f8a314-e839-4f19-a84d-883bb3811463, 새 유지PTY20931입니다. 세션을 실제로 사용할 수 있는지 다음 작업 때 확인해야 하며 새 턴에서도 접속 가능하다고 가정하지 않습니다. 모니터 기본OFF·고급 채점OFF는 유지합니다.
- 최초 재실행 완전 동일 검사는 실패했습니다. 읽기 전용 비교에서 projects4→5/project_trash1→2의 추가를 관측했고, 다른 테이블은 같았습니다. 모든 기존 프로젝트 행이 현재에도 동일하고 다른14개 테이블/모델4marker가 같은지를 별도 snapshot에서 확인했습니다. 이를 전체16테이블 동일이라고 바꾸지 않으며 current-project-trash-db-observation.json에 사용자 조작과 구분했습니다. 새 프로젝트/보관 조작의 정확한 클릭 시각은 계측하지 않았습니다.
- 사용자가 수정 창에서 새 프로젝트 생성 직후 직접 보관→복원을 ‘잘됨’으로 확인했습니다. 초기 제한 후보의 실패를 해결한 보관/복원 수용 완료이며 기능과 문서화를 마쳤습니다. 실제 미저장 확인창 취소·수정본 앱 재실행 후 보관 목록 유지의 추가 수동 검사는 아직 미실행이고 controller/native 재열기 자동 검사와 구분합니다. 최신 수정본의 새 ZIP·별도 설치 반복 검증은 후속입니다.

다음 독립 작업은 이전 검증 데이터를 보존하는 실행별 AppData의 NSIS 설치/전체 고지·MPL 원본/runtime 지문/새 v9 DB·정상 종료/기본 제거입니다. 실제 제품 앱은 유지하며 사용자 프로젝트/녹음 삭제나 실제 AppData 복원은 진행하지 않습니다.

## 2026-10-21 — v9 설치 반복 검증 완료

### 작업 개요

기존 검증 자료를 삭제하지 않고 최신 보관 기능이 포함된 내부 NSIS를 현재 PC에 설치·실행·제거하는 한 슬라이스를 완료했습니다. 2026-10-21 완료이며 전체 Phase8/새PC/최종 배포는 미완료입니다.

### 구현 및 변경 사항

prepare_validation_installer.py는 기존 고정 템플릿을 먼저 검사한 뒤 같은 실행 UUID를 AppData 식별자·제품명·실행 파일명에 부여합니다. Test-ValidationInstaller.ps1은 세 값의 정확한 관계·계획/생성 NSIS 일치와 currentUser를 검사하고 새 v9/빈 휴지통·녹음 없음·전체 리소스/고지 지문/정상 종료·기본 제거를 확인합니다. 기존 등록/앱 데이터가 있으면 덮어쓰지 않습니다. test_prepare_validation_installer.py에는 두 번 준비가 서로 다른 이름/경로를 쓰고 이전 config·원본을 보존하는 검사를 추가했습니다. 한국어 stdin/stdout을 위해 기본PS5.1의 UTF-8 인코딩도 명시합니다. 제품의 DB/IPC/저장 형식과 사용자 프로젝트는 변경하지 않습니다.

### 테스트 결과와 오류 해결

- 최초 UUID AppData만 분리한 설치본은 빌드18.61초 성공했으나 실행 전 기존 NSIS 설정 키를 감지해 안전하게 중단했습니다. 새 AppData/제거 등록은 없고 이전 검증 설정 키만 남아 있음을 읽기 전용으로 확인했습니다. 이를 삭제하는 대신 제품명/실행명·등록 키도 UUID로 분리했습니다.
- 전체 scripts58개 중57개10.967초 성공/기존 링크 권한1개 제외입니다. 실제 분리 설치기 빌드16.40초/NSIS 번들 성공입니다. 기본PS5.1로 새 UUID 폴더에 일반 사용자 token(administratorToken=false) 설치→실제 창/응답·새 v9 DB→정상 종료→독립Python 두 번→제거를 통과했습니다.
- 원본 실행 파일과 설치된 파일은 NSIS bundle marker 차이만 허용하는 기존 검사로 확인했습니다. 실행 파일40,571,904바이트, sourceSHA4591ee5c…/installedSHAf7e1d8d2…입니다. runtime3393개·MIT/백업 안내·MPL 원본5개를 포함한 현재 third-party 모든 파일의 지문이 같고 예상 밖/누락 리소스가 없습니다.
- 기본 제거 뒤 제거 등록이 사라졌고 해당 검증 AppData 및 직접 만든 validation-preserve.txt는 유지됐습니다. 현재 제품 v9의16개 테이블/모델4marker는 설치 전후 모두 동일했으며 이전 com.guitarlab.validation의 v8 데이터도 남아 있습니다. installer-identity-test.log, installer-tests/2f63f249-f95f-4215-8594-f1aa5cad25bc/receipt.json, current-installer-db-before/after.json이 증거입니다.
- 보존한 새 설치기는 installer-builds/40a54171-14db-4862-912d-1a612c688347/final/GuitarLab-Validation-x64-setup.exe,36,298,928바이트/SHA256 7b35733262dd2a214bf9030df6f231ee15cb9e1fb7c7c40d459f1a63ef12ef1b입니다. 이전 설치 파일을 소급 수정하지 않았습니다.
- 실제 설치 검사의 Python 한국어 출력1줄이 PS5.1 기본 stdin 인코딩 때문에 깨졌지만 ASCII SQL/assert 검사는 통과했습니다. UTF-8 설정 뒤 기본PS5.1 구문/한국어 왕복을 별도로 성공했습니다. 불필요한 초기 stdin 확인의 EOFError는 최종 작은 왕복 검사에서 제거했습니다. 인코딩만 바꾼 뒤 전체 설치·제거는 미실행이며 중복 설치/기존 자료 보존 조건을 우회하지 않습니다.
- 최신 제품 수정본 ZIP은 validation-packages/1881e571-94bb-47f3-9eaf-c7b8b74030c6/GuitarLab-validation.zip,3612개/39,942,679바이트/SHA256 96f527b9cee5b86360421b74ed2760f7243fe1019c1585d1212b4a17efae9d09입니다. 생성 시 전체 지문 검사는 성공했고 별도 새 폴더/기본PS5.1 점검은 진행 중입니다. 앞선 a3fbda3b… ZIP은 열린 프로젝트 보관 수정 이전입니다.

### 미구현 및 알려진 문제

현재 PC/WebView2가 설치된 환경의 내부 검증본입니다. 실제 제품 설치기·새PC/서명/백신·WebView2 자동 설치/완전 오프라인/최종 고지·모델 조건 검토는 미실행 또는 미완료입니다. 검증용 AppData/설정·임시 산출물은 보존하며 자동 삭제하지 않습니다. 실제 사용자 AppData 교체/영구 삭제는 미구현입니다.

### 다음 작업 계획

최신 ZIP의 독립 점검/진행 문서 갱신을 마치고, 악보 종료/프로젝트 교체 보호와 같은 기준을 직접 악보 가져오기에도 적용합니다. 현재 고정 사용자 앱과 보관 수용 결과는 유지하며 파일 파싱을 화면과 분리해 기존 직접 import의 오류/취소 동작도 보존합니다.

### 최신 보관 수정 ZIP 독립 점검 완료

위 96f527b9… ZIP의 새 UUID 폴더 추출·전 파일 SHA/CRC와 실제 기본PS5.1·최소PATH 독립Python3.12.15 두 번 검사를 통과했습니다. current-project-trash-package-roundtrip.json/current-project-trash-package-powershell51.log에 기록했습니다. 후속 직접 악보 교체 보호는 이 ZIP에 아직 포함하지 않습니다.

## 2026-10-21 — 직접 악보 가져오기 미저장 보호 후보

### 작업 개요

종료/프로젝트 교체 보호의 다음 한 슬라이스로 프로젝트에 속하지 않은 직접 악보 선택과 자체 fixture 불러오기의 미저장 편집을 보호합니다. 2026-10-21 구현/대상·전체 프론트 검사는 완료했고 Windows 적용·사용자 확인은 진행 전입니다. 현재 사용자는 보관 수정 버전 PID35760을 그대로 사용합니다.

### 구현 및 변경 사항

docs/12에 먼저 입력·취소/실패·적용 경계를 정의했습니다. App의 기존 미저장 확인 어댑터를 ScoreWorkspace에 필수 전달하며 score 교체는 확인 뒤에만 getFile/fetch/읽기를 시작합니다. 거절/확인 실패는 현재 문서/미디어를 보존합니다. 오디오 선택은 악보를 교체하지 않아 확인을 요구하지 않습니다. 실제 파일 확장자/크기·헤더 검증과 alphaTab/정규화 변환은 새 localMediaImport.ts로 이동했습니다. 화면은 진행/취소·확인/결과 반영에 집중하고 기존 LatestTask의 해제·늦은 응답 폐기/에러 메시지·8MiB/256MiB 한도는 유지합니다. 파일 선택 값을 초기화해 같은 파일을 다시 선택할 수도 있습니다. DB/IPC/Python 버전과 native 엔진·사용자 자료는 변경하지 않습니다.

### 테스트 결과

- 타입 검사와 대상13개5.96초 성공입니다. localMediaImport.test.ts의 실제 XML→정규화·원본 bytes 유지/프로젝트 미연결, 확장자/빈 파일/과대 크기의 읽기 전 거부, WAV/ID3 헤더·잘못된 파일·읽기 취소를 검사했습니다.
- scoreSession.test.tsx는 실제 프렛3 편집 뒤 fixture/파일 교체 거절 시 fetch/FileReader를 시작하지 않고3을 유지하는지, 허용한 손상 파일도3을 보존하는지, 허용한 정상 파일만0으로 교체하는지 확인합니다. 기존 취소·이탈·Undo/Redo/모드 이동/손상 회복 회귀도 유지합니다.
- 전체 lint와 프론트92파일355개23.93초 성공입니다. production build/내장 번들·Windows 후보/최종 포맷은 진행 중이며 완료로 기록하지 않습니다. 파싱은 기존 동기 alphaTab을 재사용하므로 동기 파싱 도중의 즉시 중단이나 별도 worker 변환을 구현한 것은 아닙니다.

### 미구현 및 알려진 문제

직접 악보 교체 확인의 실제 Windows UI 수용과 신규 후보 실행은 아직 미실행입니다. 기존 종료/보관 수용을 이 후보의 성공으로 확대하지 않습니다. 폼/믹스/OS 강제 종료의 자동 저장, 새PC·최종 배포와 고급 채점 품질은 미완료입니다.

### 다음 작업 계획

최종 빌드/내장 정책 회귀·포맷을 확인하고 현재 편집·녹음을 보존하는 정상 종료 뒤 새 고정 후보를 적용합니다. 프로젝트를 열지 않은 카피 화면에서 직접 악보 편집→다시 불러오기 취소 시 숫자가 유지되는지만 실제 확인합니다. 후속은 현재 남은 실제 미저장/저장 작업 경계 검토이며 자동 데이터 삭제나 기존 기능 재작성은 하지 않습니다.

### Windows 후보 적용/현재 수용 상태

전체 포맷과 production build45.01초, 내장 UI/원격 접근 정책3개0.01초 및 Windows23.06초 성공입니다. native 엔진 변경은 없어 앞 절 Rust226개/Clippy/MSRV·번들 백업 결과를 유지하며 모델 전체 재추론은 미실행입니다. 현재 구조에서 parser 동기 중단/worker 분리는 여전히 구현하지 않았습니다.

실행 파일40,571,392바이트/SHA9570e78b1f4d0a65e12a0d154078bd1da8b69368d61d9fbf6c8eb8d9f049569b 및 runtime3393개 원본/복사본의 지문을 확인했습니다. 이번에는 유지PTY20931의 실제 상태가 살아 있어 PID35760/정확한 제목·응답을 확인한 뒤 CloseMainWindow 정상 요청을 보냈고 EXITED0/forced=false로 끝났습니다. 세션 부재를 사용자 턴 전환이나 강제 종료로 추정하지 않으며 관측 가능한 제어를 사용합니다. 사용자에게 같은 종료를 반복 요청하지 않았습니다.

실제 v9 DB를 새 UUID 아래 백업한 후 PID14912/유지PTY41084·제목 ‘GuitarLab · 악보 가져오기 보호’/portable666d547d-add3-42f6-a05e-e3aa58da4a4e을 실행했습니다. 재실행 전후16개 테이블의 모든 행과 모델4marker가 같으며 보관 상태도 보존됐습니다. direct-score-import-db-before/after.json이 증거입니다. 사용자에게 프로젝트를 열지 않은 카피에서 프렛3 편집→직접 fixture 재불러오기 취소의 실제 수용을 요청했고 현재는 응답 대기입니다. 앱은 그대로 유지합니다. 이전 보관 수정 ZIP/NSIS를 이 새 보호 기능 포함 파일로 소급 표기하지 않습니다.

### 실제 첫 import 수용 실패/보안 정책 회귀

사용자가 ‘악보를 불러올 수 없습니다. 8MiB 이하의 유효한 GP/MusicXML 파일을 선택하세요.’를 보고했고, 추가 확인에서 편집/취소 후가 아니라 첫 fixture 불러오기임을 확인했습니다. 자동355개/Windows 빌드 성공과 구분하며 이 후보의 수동 수용은 실패입니다.

public/fixtures/standard.musicxml과 dist의2815바이트/SHA b2bb1d3d…가 같은 것을 확인했습니다. 주 창 connect-src가 ipc:와 http://ipc.localhost만 허용하고 자체 origin을 빠뜨려 fetch를 차단하는 조건을 발견했습니다. 이 단계에서 실제 WebView 보안 위반 콘솔을 수집한 것은 아니므로 단독 원인으로 확정하지 않습니다. MDN의 공식 connect-src 설명과 설치된 Tauri2.12.3/tauri-utils2.10.1의 assets.get/압축 해제 코드를 확인했습니다. 버전별 bytes 조회를 사용한 내장 XML 일치/fixture5개 필수와 자체 origin 허용 회귀를 먼저 추가해 설정 변경 전 실패를 확인 중입니다. root 외부 origin/wildcard나 별도 YouTube bridge의 connect-src 'none'·원격 IPC 권한은 그대로 유지합니다.

### 자체 origin 수정 후보 적용/재수용 대기

설정 수정 전 bundle_tests3개 중 실제 XML/자산·원격 ACL2개는 성공하고 자체 연결 정책1개만 실패했습니다. tauri.conf.json의 connect-src에 'self'만 추가한 뒤 확장Rust226개12.73초/26개 제외·Clippy12.98초/fmt가 통과했습니다. 실제 내장 XML bytes는 public 원본과 같고 fixture5개가 모두 들어 있음을 확인했습니다. 외부 주소·wildcard/별도 영상 bridge 정책은 바꾸지 않았습니다.

ScoreWorkspace의 fixture fetch 실패는 LOCAL_FIXTURE_READ_FAILED 고정 안내로 구분해 형식/크기 오류와 섞지 않습니다. 임의 fetch 오류 원문/개인 경로가 표시되지 않는 통합 회귀1개를 추가했고 타입/lint·프론트92파일356개27.30초/Vite56.39초가 성공했습니다. 취소된 fetch는 기존 LatestTask의 canceled로 처리되므로 실패처럼 표시하지 않습니다. 정상/손상·편집 유지·실제 취소 회귀도 유지합니다.

새 Windows22.81초/MSRV1.90 전체 target/features check15.98초 성공입니다. 실행 파일40,571,392바이트/SHA e18d27bcae890c0e7638ade92009dae80d5dbc1a6eeaabf98a4bed800307d578와 runtime3393개 지문을 확인했습니다. 기존 PID14912의 정확한 제목/응답을 유지PTY41084에서 확인한 뒤 정상 종료 요청→EXITED0/forced=false로 전환했습니다. v9 백업 뒤 새 PID35676/유지PTY25103·제목 ‘GuitarLab · 내장 악보 읽기 수정’/portable91280446-9ff4-41f7-9f87-cb8c71e7f8e6을 열어 실제16개 테이블·모델4marker 동일을 확인했습니다. bundled-score-csp-db-before/after.json이 증거입니다.

실제 첫 fixture 읽기/프렛3 편집 후 재불러오기 취소 수용은 다시 요청했으며 응답 대기입니다. 수정 전9aa269fc… ZIP의 무결성 생성은 완료됐지만 기능 수용에 실패한 CSP 버전이므로 사용 가능한 최종 배포물로 간주하지 않습니다. 새로운 CSP 수정본 ZIP/설치기는 아직 미생성·미실행입니다. 기존 파일은 삭제하지 않습니다.


## 비동기 교체 확인 오류 수정 — 2026-10-21 진행 중

### 작업 개요·실제 실패

첫 내장 악보는 열린다는 사용자 결과로 자체 origin 수정의 실제 읽기를 확인했습니다. 그러나 프렛3 적용 후 재불러오기는 확인창 없이0으로 초기화됐습니다. 이 교체 보호 수용은 실패이며 자동 검사 성공과 구분합니다. 설치된 tauri-plugin-dialog2.8.2의 init-iife.js는 window.confirm을 async Promise<boolean>으로 대체하지만 기존 DOM 타입 기반 호출은 Promise 자체를 승인으로 취급했습니다. default capability의 dialog message 권한도 없었습니다. 이전 동기 boolean mock이 두 조건을 포착하지 못했습니다.

### 구현·변경 파일

- docs/12 계약을 먼저 갱신하고 useCloseGuard에서 명시적 true 응답을 await합니다. 공통 확인의 중복 요청·거절·해제/악보 문맥 변경 뒤 승인은 취소로 처리합니다. 임의 오류 원문은 표시하지 않습니다.
- useProjects의 생성/열기/악보 교체/현재 프로젝트 보관 호출자가 확인 완료를 기다립니다. 확인 대기도 직렬화하고 작업 취소/문맥 변경/화면 해제 뒤 파일 작업을 시작하지 않습니다. 실제 보관 완료 뒤만 현재 화면을 비우는 정책을 유지합니다.
- ScoreWorkspace는 확인을 기존 LatestTask 안에서 기다리며 중복 요청·취소/화면 이탈·파싱 사이 문맥 변경의 결과를 폐기합니다. 읽기/파싱 오류는 기존 악보를 유지합니다. localMediaImport의 크기/헤더 경계는 바꾸지 않습니다.
- capabilities/default.json은 로컬 main에 dialog:allow-message만 추가합니다. lib.rs의 실제 권한 해석 테스트가 다른 창·원격 YouTube/loopback message 거부와 파일 open/save·창 close/destroy 거부를 검사합니다. native X 종료 보호/DB9·Python 계약·의존성 버전은 유지합니다.

### 테스트 결과·해결 이력

실제 비동기 취소 mock으로 바꾼 수정 전 통합 검사7개 중1개가 fixture fetch 1회 대신2회로 실패해 재현했습니다. 구현 후 기존 단위 테스트의 동기 assertion1개도 Promise 비교로 실패해 await로 갱신했습니다. 대상4파일26개7.57초, 전체92파일359개31.17초·TypeScript/lint·Vite1분3초와 변경 파일 포맷 검사는 통과했습니다. Vite의 기존500kB chunk 경고는 남습니다. native 전체/권한 검사·Windows 새 후보 적용 및 실제 확인창 취소 수용은 아직 진행 중/미실행입니다.

### 알려진 제약·다음 작업

현재 사용자 앱PID35676은 이전 고정 빌드 그대로 유지합니다. native 검사/빌드 후 정상 종료 보호를 거쳐 새 후보를 적용하고, 실제 프렛3→재불러오기→취소의 숫자 유지까지 확인합니다. 이전 SHA ZIP/installer는 새 비동기 수정 포함 파일로 표기하지 않습니다. 실제 WebView 수용 전 완료로 간주하지 않으며 전체Phase7/8·새PC/최종 배포도 미완료입니다.


### 비동기 수정 고정 Windows 적용/독립 패키지 점검

전체 features Rust226개12.00초/26개 제외·Clippy8.28초/fmt·MSRV1.90 전체 target/features7.57초와 Windows21.77초·전체포맷을 통과했습니다. 실제 runtime authority는 로컬 main message만 허용하고 다른 창·원격 YouTube/loopback 및 파일 open/save·창 close/destroy를 거부합니다. 새 네이티브 명령/DB 마이그레이션·패키지 설치는 없습니다. linker의 import library 생성 경고는 기존과 같으며 실행 실패는 아닙니다.

새 실행 파일40,573,952바이트/SHA7c004c077e05e0aa02c5a2939f3d968fef149964710109b33cab0a587f0645a3와runtime3393개 원본/복사본 지문을 확인했습니다. 유지PTY25103으로 기존35676의 정상 종료를 요청해 EXITED0/forced=false를 확인했습니다. v9 백업 후 PID22032/PTY63068·제목 ‘GuitarLab · 악보 교체 확인 수정’/portable9114a4ab-5527-4378-bceb-347cf14c898e를 열어 기존16개 테이블과4모델 marker 동일을 확인했습니다. async-score-confirm-db-before/after.json과 후보 receipt가 근거입니다. 실제 확인창 취소 수용을 요청했으며 결과 전에는 앱을 재실행하지 않습니다.

새 ZIP validation-packages/c40e2c15-8343-4ea3-993d-22a23c45faea/GuitarLab-validation.zip은3612개/39,946,017바이트/SHA39bd90b23b36137d9d2aa3577abadbeb9092b72b26e17e5bcb383da71e2d9885입니다. 전체 허용 목록/내용 지문을 검사한 동일 바이트를 새 UUID e8ea6203-9969-499b-8474-e07c6d52296c에 추출했고 기본PowerShell5.1 독립 Python2회 점검 중입니다. 검증 ZIP이며 실제 UI 취소/새PC·최종 법적 검토/서명·새 수정 installer 수용 완료로 주장하지 않습니다.


독립 ZIP 검증 완료: 첫 실행은 ZIP의 최상위 GuitarLab 폴더를 빠뜨린 점검 경로 때문에 -File 파일 없음으로 실패했습니다. 압축 내용은 그대로 두고 실제 하위 폴더를 가리키도록 검증 receipt를 수정했습니다. 기본PowerShell5.1의 전체3612파일 지문·개발 PATH 제외/모델 미설치 Python3.12.15 두 번 검사는 성공했습니다. async-score-confirm-package-roundtrip.json에 최종 ZIP_AND_POWERSHELL51_CHECKED를 기록했습니다. 이 점검은 앱 자동 실행/모델 설치를 하지 않으며 실제 확인창 취소·새PC 수용과 별개입니다.


### 실제 비동기 확인 취소 수용 완료

사용자가 새 고정 Windows 앱에서 내장 악보→프렛3 적용→재불러오기 확인창→취소 뒤3 유지에 ‘ㅇㅇ 댐’으로 응답했습니다. 이 수용은 이번 비동기 수정에만 적용하며 첫 CSP 수정만으로 편집 보호가 완료됐던 것으로 소급하지 않습니다. 후보 receipt의 manualDirectScoreGuardAccepted=true/ASYNC_CONFIRM_ACCEPTED를 기록했습니다. 현재 PID22032/PTY63068 및 사용자의 편집을 유지하며 실제 저장/프로젝트 다른 경로는 자동 회귀 결과와 구분합니다. 후속은 독립적인 Phase7 연속 음정 참조 평가입니다.


## 비동기 확인 수정 포함 내부 NSIS 후속 검증 — 2026-10-21 진행 중

악보 교체 취소의 실제 수용이 끝났으므로 최신 프론트 지문과 자체 fetch CSP/main message 권한을 포함한 내부 설치 회귀를 준비했습니다. 실행UUID53de3796-3b7e-4ed8-a9eb-dcdbc7fb89c8의 제품명·프로세스·AppData를 분리해 기존 제품 앱PID22032/미저장 프렛3은 그대로 유지합니다. 이전 내부 설치/보존 자료도 삭제하지 않습니다. 새 실행 계획은 validation-installer-plan.json/installer-builds/53de…/plan.json이며 실제 제품 v9/16개 테이블·모델4marker 읽기 전용 백업/지문을 먼저 보존했습니다. 이 단계의 설치→실행/정상 종료→제거·제품 데이터 비교는 아직 실행 중/미실행입니다. 새PC/서명/최종 배포·법적 최종 검토 완료를 뜻하지 않습니다.


### 첫 후속 설치 실행의 제거 검사 경합/수정

UUID53de… 내부 NSIS의 Rust/Windows 빌드18.07초 및 설치 파일36,296,392바이트/SHA0854b550d6bd2fe4c6482817af7d0567d70998073897f1dbd44e34bdca36e760 생성은 성공했습니다. 기본PowerShell5.1의 실제 설치/실행파일 NSIS 표식 검증·runtime3393개/고지 전체·새v9·정상 종료/독립Python2회까지 진행한 뒤, 제거 완료 poll의 재귀 열거에서 제거 중 사라진 tcl 하위 폴더로 DirectoryNotFound 오류가 났습니다. 완전한 설치/제거 성공으로 표시하지 않습니다.

해당 실행0bdced22-d853-4829-9dca-007a1679ff1e의 자체 잔여 파일은 validation-preserve.txt뿐이며 별도DB 존재/APP_EXITED 기록을 확인했습니다. 그러나 중단된 실행의 제거 전후 DB 지문 대조는 완료되지 않아 미완료로 남겼습니다. 실제 제품16개 테이블/모델4marker는 전후 동일했습니다. 원래 검증 AppData/NSIS 설정을 지우고 재사용하지 않았습니다.

Test-ValidationInstaller.ps1에 작은 완료 probe를 분리해 열거 중 DirectoryNotFound만 false/다음 poll로 재검사합니다. 권한 거부나 다른 오류는 여전히 중단하며 등록 잔존·payload 잔존은 성공이 아닙니다. test_prepare_validation_installer.py가 실제 기본PowerShell5.1에서 해당 함수 AST만 추출해 폴더 소멸→다음 검사·등록 잔존·다른 파일/권한 거부 경계를 확인했습니다. 설치를 수행하지 않는 검사3개0.663초 성공입니다. 제거 시간 한도/대상 경로 재검증/미등록 파일 SHA/DB 보존 정책은 완화하지 않습니다. 새UUIDcd6df0f5-64a1-4618-88c8-d37a2565045a로 별도 회귀를 준비하며 이전 실패 결과는 유지합니다.


### 최신 내부 설치 회귀 완료

새UUIDcd6df0f5-64a1-4618-88c8-d37a2565045a의 빌드18.27초와 NSIS36,296,395바이트/SHA920b6e5fb4190991af8e2bbf72791d532251943eff17191bd20caceec392f146 생성 성공입니다. 기본PowerShell5.1에서 일반 사용자 설치·NSIS 표식 외 실행파일 동일/전체runtime3393개·고지/MIT·새v9/빈 보관 목록·정상 종료·개발 PATH 없는Python3.12.15 두 번·제거/등록 해제·검증DB SHA/자체 미등록 파일 SHA 보존이 모두 통과했습니다. 관리자 토큰은false입니다. receipt는 installer-tests/10a43575-89d0-4eed-a384-22a0af0ae1a8/receipt.json이고 현재 실제 제품16개 테이블/모델4marker도 전후 동일합니다.

수정 후 scripts 전체63개 중62개8.184초 성공/링크 권한1개 제외이며 포맷 명령 성공입니다(문서는 기존 ignore 대상). 현재 제품PID22032/정확한 제목·응답을 유지PTY63068에서 확인했고 미저장 편집은 건드리지 않았습니다. 첫53de… 실행의 제거 poll 실패와 미완료DB 비교는 이 성공으로 덮어쓰지 않습니다. 이번 설치기는 debug 내부 검증 파일이며 새PC/최종 배포·서명/법적 최종 검토 완료는 아닙니다.


## 최적화 내부 설치 검증 — 2026-10-21 착수

현재까지 실제 설치 수용은 debug 빌드이므로 release 빌드 완료로 간주하지 않습니다. 설치된 Tauri CLI2.12.2의 build --help에서 기본release/--debug 동작을 확인했습니다. prepare_validation_installer.py는 --profile debug/release만 허용하고 계획에 buildProfile을 남깁니다. Test-ValidationInstaller.ps1은 -BuildProfile 허용 목록·계획 일치를 확인하고 해당 고정target 경로의 설치기/실행파일/NSIS/관리 CLI를 사용합니다. 기존 기본debug/프로필 없는 계획도debug로만 유지합니다. 임의 profile 경로·관리자 요구·새 의존성/모델 설치는 없습니다.

반복 준비의 두 프로필/UUID·원본 보존·잘못된 profile의 파일 접근 전 거부 및 PowerShell 구문/제거 경계4개0.594초 성공입니다. 최적화 빌드/동일 프로필 관리CLI/실제 설치 회귀는 아직 미실행이며 별도 UUID에서 이어갑니다. 현재 제품 창/미저장 편집은 유지합니다.


release 준비 계획은 UUID3c012e7d-825c-4d67-a03e-c621d3ea4e04/buildProfile=release입니다. 작업 드라이브 여유 약223GB를 확인하고 설치된 의존성 잠금/캐시만 쓰도록 `pnpm tauri build --ci --config <계획 설정> -- --locked --offline`을 실행했습니다. 현재 컴파일 중으로 성공을 선기록하지 않습니다. 잘못된 PowerShell profile의 바인딩 단계 거부 검사도 추가했습니다. 최초 테스트는 한국어PS5.1 오류 출력의 코드페이지를 Python UTF-8 텍스트로 읽어 실패했고, 오류를 무시하지 않고 bytes로 고정 오류 식별자를 검사하도록 수정했습니다. 준비/순서·profile/PowerShell 경계5개0.914초 성공이며 보조 PowerShell 테스트는 새 콘솔을 만들지 않게 실행합니다.


### 최적화 빌드·설치 회귀 완료

잠금/오프라인 release 본체 빌드1분45초 및 같은 프로필 manage_ai_model 예제1분30초 성공입니다. 실행 파일22,031,360바이트/SHA71fe50958e8ed62d7de620ee164c73d09f39cdf9cd43eb185eac461e294f9cf6, 내부 NSIS31,412,477바이트/SHA1f45793e018702397c9ff60abecd82a9ae8b42546c75ff367a26c68215eb304c입니다. installer-builds/3c012e7d-825c-4d67-a03e-c621d3ea4e04/final에 별도로 보존했습니다. 현재 제품debug ZIP/실행 파일을 이 release 식별자로 교체하지 않았습니다.

`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/Test-ValidationInstaller.ps1 -BuildProfile release`의 실제 일반 사용자 설치·NSIS 표식 외 실행파일 동일·runtime3393개/고지·새v9·정상 종료·같은release 관리CLI/개발 PATH 없는Python3.12.15 두 번·제거/등록 해제·검증DB/자체 미등록 파일 SHA 보존을 모두 통과했습니다. 관리자 토큰false이며 installer-tests/545695ef-c262-4d2e-bf3d-fe02b16e8127/receipt.json이 증거입니다. 현재 제품16개 테이블/모델4marker도 기존 백업과 동일합니다.

최적화 전체Rust228개11.28초/26개 제외·release 전체 target/features Clippy1분8초 성공입니다. debug227개와의1개 차이는 release에서만 실행되는 `bundled_release_without_active_model_reports_missing_without_development_fallback`입니다. 제품이 모델 미설치 때 개발환경으로 몰래 폴백하지 않는 검사를 포함합니다. scripts 전체65개 중64개8.835초 성공/Windows 링크 권한1개 제외입니다. 프론트는 변경 없이 직전359개/타입·lint·production build를 유지하며 추가 전체프론트 재실행은 **미실행**입니다. 문서는 기존 .prettierignore 대상이므로 Markdown 자동 포맷 검사는 **미실행**이며 앞 절의 포맷 명령 성공을 문서 전체 검사 성공으로 해석하지 않습니다.

### 최적화 공개 음정 회귀/계산 시간

같은 release로 공개91창을 실제 재평가해3개0.62초 성공했습니다. 결과 results-52d61693-f80e-417b-baf9-f8420f2219b3.json의3458개 상세 지점은 debug 보고서와 정확히 같고 요약도 처리 시간 외 동일합니다. 원본8개 SHA도 유지됐습니다. 각1초 PCM의 계산 중앙값5.31~5.58ms/p95 6.49~7.46ms이며1초 수집/디스크/IPC·실시간 왕복 지연을 포함하지 않습니다. 오차/주법 품질이 개선된 것이 아닙니다. 두 보고서 SHA와 비교는 release-guitarset-comparison.json에 기록했고 실제 고급 점수는 비활성입니다.

### 로컬 Defender 검사·서명 상태

현재 PC의 Defender/실시간 보호 활성 상태와 설치 파일 Authenticode NotSigned를 읽었습니다. 그 뒤 SHA가 같은 final 설치 파일1개만 Start-MpScan CustomScan으로 검사했습니다. 동일 대상/Scan ID의 완료 이벤트1001과 대상 탐지/처리 이벤트0개·파일 SHA 불변을 확인했습니다. 결과 release-defender-scan.json은 LOCAL_CUSTOM_SCAN_COMPLETED_NO_MATCHING_DETECTION이며 정의버전1.461.118.0입니다. 백신 설정/제외/정의 업데이트를 변경하지 않았고 다른 개인 파일·모델을 검사하거나 업로드하는 작업은 하지 않았습니다.

이는 해당 파일/현재 PC/정의에서의 좁은 관측입니다. 다른 백신/새Windows·SmartScreen 평판·서명/최종배포 안전성을 보장하지 않습니다. 방법은 [Microsoft Start-MpScan](https://learn.microsoft.com/en-us/powershell/module/defender/start-mpscan?view=windowsserver2025-ps)·[Defender 이벤트1001](https://learn.microsoft.com/en-us/defender-endpoint/troubleshoot-microsoft-defender-antivirus)의 공식 설명을 확인했습니다. 모델 가중치/개인 자산은 설치기에 포함하지 않으며 cleanWindowsValidated/legalReviewCompleted는false를 유지합니다.

### 남은 수용 조건·재개 위치

현재 제품PID22032/PTY63068·미저장 프렛3 편집을 유지합니다. release 별도 검증 창은 정상 종료/제거됐고 현재 창을 다시 열지 않았습니다. release에서의 실제 기타 입출력/REC·모델 새 설치/분리·세부 편집 UI를 수동 재검사한 것은 아니므로 **미실행**입니다. 새로운 별도Windows 수용은 사용자가 현재PC만 보유해 **미실행**, 서명/최종 배포도 **미실행**입니다. Phase6B 특화 모델의 가중치 권리/검증 및 Phase7 실제 주법 정답/허위 감점률·고급 점수 품질은 여전히 미완료입니다. 다음 외부 조건을 확보하면 이 수용부터 재개하며 완료처럼 표시하지 않습니다.

## 빈 악보 작성 회귀·설치 종료 증거 — 2026-10-22

### 작업 개요

Phase5 후속의 빈 악보 작성이 실제 Windows 사용자 수용까지 완료돼 최신 UI/native를 Phase8 패키지에 반영합니다. 이어 설치 검사에서 종료 요청/대기·APP_EXITED만 확인하고 종료 코드를 빠뜨린 부분을 보완합니다. 현재 사용자 고정 앱PID27900/PTY4579는 유지하며 별도UUID 설치 앱만 대상으로 합니다. 전체Phase8/새PC/서명·법적 최종 검토는 미완료입니다.

### 구현 및 변경 사항

- 빈 악보 공통 원본·UI/도메인 연결·새관리자산/revision 보존과 상세 수정 파일은 PHASE-05의2026-10-22 절을 따릅니다. SQLite9·기존 모델/녹음·판정은 변경하지 않습니다.
- `scripts/Test-ValidationInstaller.ps1`: CloseMainWindow 성공/5초 내 종료/정수 코드0을 모두 요구하는 작은 검사 함수와 applicationExitCode 영수증을 추가합니다. 거절·대기 시간 초과·누락/문자열·비정상 코드는 제거 이전에 실패합니다. 강제 종료는 없습니다.
- `scripts/test_prepare_validation_installer.py`: 기본PowerShell5.1에서 실제 함수AST를 읽어0·거절·시간 초과·null·문자열0·양수/Windows 비정상 음수 코드 경계를 검사합니다. 기존 제거 경합/권한 예외와 프로필 검사는 유지합니다. 새 함수·영수증의 계약을 docs/12에 먼저 기록했습니다.
- 과거 설치 receipt에 applicationExitCode가 없던 것은 실제0 검사를 마친 것처럼 소급하지 않습니다. 이전 성공은 당시 확인한 종료 요청/APP_EXITED 등 범위 그대로 보존합니다.

### 테스트 결과

- 새 설치 보조 경계6개2.264초 성공. scripts 전체66개 중65개12.476초 성공/Windows 링크 권한1개 제외입니다. Windows 하드링크 경계는 허용된 환경에서 검사했으며 사용자 파일 삭제·모델 설치는 없습니다.
- 사용자 수용된 빈 작성 포함 프론트364개53.07초/타입·lint·Vite1분20초·소스format, 확장Rust229개14.19초/26개 제외·Clippy17.07초/MSRV21.02초·Windows47.27초 성공입니다. 전체 Python AI 모델 검사는 이번 worker/모델 변경이 없어 **미실행**입니다.
- 실제 제품 첫 실행에서 이전16테이블·4marker가 동일했고, 이후 사용자가 만든 새 프로젝트/프렛3 저장을 확인했습니다. 설치 회귀용 기준은 이 정상 변경 이후에 별도 blank-score-installer-db-before.json/새백업으로 만들었습니다.
- 새 제품 검증 ZIP3612개/39,967,248바이트/SHA30c43b172a2961c05c5640dde0c5646f1df751cb56a724323f31123c1d2d3aa9 생성·전체 지문/동일 바이트 새 폴더 추출 성공입니다. 기본PS5.1/독립Python 후속은 진행 중이며 완료 후 기록합니다.
- release 내부 설치 UUID63221de0-51c2-4b02-b07c-6ba5a51b3b79의 오프라인 본체 빌드2분3초/NSIS 생성 성공입니다. 실행파일22,061,056바이트/SHA585ae9ae6aa55108e6be84984822c0e8dc8ea8dc1387b6036ae0fbebca0fc4e3, 설치기31,426,307바이트/SHA1164652eb179c8e948b7f8d8bbe567b036b9d1c51acaa53b1dd84f1895117f9b입니다. installer-builds/63221de0…/final에 보존했습니다. release CLI/회귀·실제 설치→종료0→제거는 진행 중/미실행입니다.

### 미구현·알려진 문제 / 다음 작업

기존 자동 저장/고급 악보 편집·특화 파트분리/고급 점수·별도Windows/서명·최종배포는 이번 수정으로 완료되지 않습니다. 새 설치기의 백신·서명·실제 입력/모델 설치 수용도 **미실행**이며 어제 다른 SHA 파일의Defender 결과를 새 파일 결과로 재사용하지 않습니다. 실제 설치 회귀와 새ZIP 독립Python·제품 데이터 보존을 끝내고 최종 영수증/재개 위치를 갱신합니다. 현재 사용자 앱은 유지합니다.

### 최신 release 설치/제거와 독립 ZIP 검증 완료

- 같은 소스의 release 관리CLI 빌드1분42초·release 회귀 빌드1분45초 및 전체230개11.52초/26개 제외 성공입니다. debug229개와의1개 차이는 release 전용 모델 미설치/개발환경 폴백 금지 검사입니다. 이번에 별도 release Clippy 재실행은 **미실행**이며 같은 변경의 확장 debug Clippy 성공과 구분합니다.
- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/Test-ValidationInstaller.ps1 -BuildProfile release` 성공입니다. 자체 설치 실행52c638c0-46fa-4d06-8dc0-d0891c4cf179의 receipt는 CURRENT_PC_INSTALL_RUN_UNINSTALL_VERIFIED이며 applicationExitCode=0을 직접 기록했습니다. 일반 사용자/관리자토큰false·NSIS 표식 외 실행파일 동일·runtime3393개/고지/MIT·새v9 빈DB·APP_STARTED/APP_EXITED·개발PATH 없는Python3.12.15 두 번·정상 제거/등록 해제·검증DB·자체 미등록 파일 SHA 보존까지 통과했습니다. 과거 코드 미기록 receipt는 수정하지 않았습니다.
- 새 ZIP의 전체 지문·동일 바이트 추출 뒤 기본PowerShell5.1/최소PATH·Python3.12.15 두 번 검사도 통과했습니다. blank-score-package-roundtrip.json은 ZIP_AND_POWERSHELL51_CHECKED이며 새 추출 대상은 validation-roundtrip/cb2463b6-a260-49e7-b4f1-d6ca3fe239a8/GuitarLab입니다. 제품/개인 자산·모델 가중치는 ZIP에 넣지 않았습니다.
- 분리 설치/제거 후 실제 제품의16개 테이블(사용자가 새로 저장한 빈 악보 프로젝트 포함)·모델4marker가 설치 직전 기준과 동일했습니다. blank-score-installer-db-after.json에 기록했고 현재 제품PID27900/PTY4579는 유지합니다. 정상 종료/제거한 것은 새UUID의 검증 앱뿐입니다.
- 특화 분리 후보의 권리 근거도 원문/연결된 모델 페이지로 재확인했으나 새 근거를 확보하지 못했습니다(PHASE-06B의2026-10-22 절/출처). 가중치 다운로드·실행/개인 오디오 업로드는 없습니다. 실제 고급 주법 정답/허위 감점률·별도Windows 장비 부재/서명·최종배포는 아직 미완료입니다. 이 조건은 설치 검사 성공으로 대신하지 않습니다.

### 현재 재개 위치

빈 악보 작성 수용·설치 종료 증거·최신 release 내부 설치/제거/ZIP 독립 실행의 이번 슬라이스는 코드·검사·문서까지 완료입니다. 제품 앱은 빈 악보 작성 버전 그대로 유지합니다. 로드맵에 남은 수용 조건은 특화 모델별 허가/고정 출처/두파트 정답 품질, 실제 고급 주법/허위 감점률의 독립 참조, 별도Windows·실제 release 장치/모델 수용 및 서명/고지 최종 검토입니다. 현재 확보하지 못한 외부 근거 때문에 해당 복합 항목은 체크하지 않습니다. 자동 저장/JSON import/고급 편집 확장도 별도 미구현으로 유지하며 이번 완료로 포함하지 않습니다. 승인·자료를 확보하면 이 문서의 수용부터 이어가고 이미 수용한 빈 작성/저장 경로를 불필요하게 재작성하지 않습니다.

### release 실제 모델 통합 추가 완료

추가로 명시적 모델 통합1개277.14초를 실행했습니다. 두 모델 새 격리 설치/자체 검증·같은환경 재사용·복사 캐시만 정리 후 실제8음 카피/4초 두stem 분리·취소 정리가 성공했습니다. 원래 캐시77개/855,155,601바이트의 사전/사후 전체 SHA와 실제 제품16테이블/모델4marker도 동일합니다. 원래 설치/캐시는 삭제하지 않았으며 자체 테스트음원만 분석했습니다. 상세 명령·오프라인 설치/적용 범위/미실행은 PHASE-06의2026-10-22 절을 따릅니다. release-managed-offline-receipt.json에 별도 증거를 기록했습니다.

기본 release230개/26개 제외 중 이번에는 모델통합1개만 명시 실행했으며 나머지 환경 의존 항목을 전부 통과한 것으로 표시하지 않습니다. 실제 설치 앱의 모델 UI 재검사·release 장치 입력/녹음/정밀 지연·별도Windows·최신 설치기 Defender/서명은 **미실행**입니다. 따라서 위 재개 조건에서 release 모델 ‘서비스 격리 회귀’는 해소됐고 실제 GUI/장치·새Windows 수용은 남습니다. 현재 고정 제품과 저장 자료를 유지한 채 다음 세션은 이 구분을 따릅니다.


## JSON 악보 후속의 백업/배포 회귀 — 2026-10-22

- 목표/상태: JSON 자산이 들어온 뒤 기존 원본·이전 리비전·READY WAV/휴지통의 백업과 독립 패키지를 유지하는 검사. 완료 날짜2026-10-22, 해당 회귀 완료이며 전체Phase8은 진행 중입니다.
- 변경: storage/backup.rs의 실제 자체 백업 검사에 JSON 자산을 추가했습니다. 제품 백업/Python·DB 버전은 변경하지 않았습니다. 구체적 기능/전체 변경 파일은 PHASE-05의 JSON 후속 절을 따릅니다.
- 성공: 확장Rust231개/26개 제외·release232개/26개 제외/Clippy/MSRV, 명시적 실제 bundled backup1개28.80초로 JSON/WAV·v9/보관 marker 새 ZIP·새 폴더 복원/원본 보존·실제 자식 취소. 처음 자원 내용 폴더를 상위 대신 지정해 AI_RUNTIME_INTEGRITY 실패했고 portable 상위로 고쳐 성공했습니다. 무결성 검사는 완화하지 않았습니다.
- Windows25.29초/고정 PID27828·DB9/16테이블/4marker 전후 동일·사용자 JSON 프렛4 저장/재열기 성공. json-score-import-candidate.json을 최신 후보로 유지합니다.
- 새 ZIP0e8b49d5…는3612개/39,969,543바이트/SHAbd913d18…입니다. 전체 CRC/SHA/동일 바이트의 새 UUID 추출·각 파일 SHA와 기본PS5.1/최소PATH 독립Python3.12.15 두 번을 통과했습니다. json-score-import-package-roundtrip.json이 ZIP_AND_POWERSHELL51_CHECKED입니다. 이전 installer/AV 영수증은 새JSON 빌드 검증으로 재사용하지 않습니다.
- **미실행**: 새JSON installer/백신·서명/별도Windows·release 실제 장치/모델GUI/최종배포. 이번 변경은 모델/오디오를 수정하지 않아 실제 모델/장치 재검사를 추가하지 않았습니다. 다음은 F-06 자동 저장의 안전 조건을 정의하며 현재 수용한 앱/사용자 데이터는 유지합니다.


## 선택적 자동 저장 후속의 배포 회귀 — 2026-10-22

### 작업 개요/변경

F-06의 선택적 자동 저장 UI/컨트롤러를 추가한 뒤 native 저장·DB9·오디오/모델은 유지하는 배포 회귀입니다. 날짜2026-10-22, 현재 전체 프론트/내장·Windows/ZIP은 성공했고 실제 수용·새release 설치기는 진행 중입니다. 파일/계약과 기능 제약은 PHASE-05 최신 절을 따릅니다.

### 테스트 결과

- 프론트374개/95파일26.80초·타입/전체lint·Vite50.71초/포맷, 최신 내장/권한3개/0.01초·Windows16.03초 성공. 이전 같은 native 소스의 확장231개/release232개·Clippy/MSRV 성공을 유지하며 native 전체를 불필요하게 반복하지 않았습니다.
- 실제 DB9/16테이블·모델4marker 백업/전후 불변, 기존PID27828의 정상EXITED0/forced=false, 새PID37256/PTY74112·‘GuitarLab · 악보 자동 저장’ READY/응답 성공입니다. 현재 자동 저장 사용자 수용은 대기이며 앱을 유지합니다.
- ZIP9da11b66… 3,612개/39,970,329바이트/SHAc4955636… 전체 CRC/SHA·새폴더 추출/전체 지문·PS5.1/최소PATH Python3.12.15 두 번 성공. score-autosave-package-roundtrip.json에 기록했습니다.
- 새 release 내부 설치기를 b2b3f53a-1d89-4bd1-aba3-85a4d72b68a8/com.guitarlab.validation.runb2b3f53a1d894bd1aba385a4d72b68a8로 준비했고 고정 runtime3393개·고지/MIT/최신dist를 포함합니다. 기존 제품 앱 ID/데이터·과거 설치 receipt는 변경하지 않았습니다. 실제 새 설치/종료/제거·Defender는 아직 **미실행/빌드 진행 중**입니다.

### 알려진 제약/다음 작업

별도Windows·서명/최종배포·최신 release 실제 장치/모델GUI는 **미실행**, 검증 조건 미확보입니다. 현재 사용자의 자동 저장 확인 동안 고정 앱을 유지하고, 답변 후 제품과 다른 새 UUID의 내부 설치/정상 종료/제거·설치기 자체 검사만 진행합니다.


### 최신 release 설치·제거/Defender 완료 — 2026-10-22

- release 내부 설치기 빌드 컴파일1분23초·NSIS 묶기 성공. 최종 파일은 installer-builds/b2b3f53a-1d89-4bd1-aba3-85a4d72b68a8/final/GuitarLab-Validation-x64-setup.exe, **31,437,776바이트/SHA `82b1ba52ada050d5d1d9bc257cc1a326f56c380de82a0a303eb752be1d026a60`**. 원본 실행파일22,084,096바이트/SHA cb526ef0dd7ecfc8d05fc1e84de0ed64d0934d6093063f89f4bdf388cd61d46f. final/receipt.json에 기록했습니다.
- `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/Test-ValidationInstaller.ps1 -BuildProfile release` 성공. installer-tests/94ea21eb-9868-4a15-b016-09770f4855a2/receipt.json은 CURRENT_PC_INSTALL_RUN_UNINSTALL_VERIFIED입니다. 일반사용자/관리자토큰false·NSIS 표식 외 실행파일 동일·runtime3393개/고지/MIT·새v9 빈DB·APP_STARTED/APP_EXITED·정수 종료코드0·최소PATH Python3.12.15 두 번·정상 제거/등록 해제·검증DB/자체 미등록 파일 SHA 보존을 확인했습니다. 사용자 제품은 다른 ID/PID37256이며 종료하지 않았습니다.
- 새 설치기 한 파일의 `Start-MpScan -ScanType CustomScan -ScanPath <위 final 파일>` 요청·해당 경로/동일 Scan ID의 시작/완료 이벤트1000/1001 일치·중단 이벤트 없음·일치 탐지1116/1117 이벤트0·파일 SHA 동일을 확인했습니다. 현재 설치된 정의 **1.461.118.0**, 서명 **NotSigned**. score-autosave-release-defender-scan.json에 LOCAL_CUSTOM_SCAN_COMPLETED_NO_MATCHING_DETECTION으로 기록했습니다. 보안 설정·예외를 변경하지 않았고 다른 파일/시스템 전체 검사가 아닙니다. 무감염/다른 백신/SmartScreen 수용 보장도 아닙니다.
- 첫 scan 명령은 반환했지만 완료 이벤트가 아직 없어 CUSTOM_SCAN_EVIDENCE_PENDING/종료1로 기록했습니다. 검사를 다시 시작하지 않고 동일 경로/Scan ID의 뒤늦은 완료 로그를 재조회해 성공을 확인했습니다. 완료를 보지 않고 성공으로 기록하지 않았습니다.
- 기존 release 관리CLI의 AI 코드/번들 계약이 동일해 이를 최소PATH runtime 검사에 재사용했고 새CLI 빌드는 **미실행**입니다. 새GUI 설치/제거와 새runtime검사는 실제로 실행했습니다. 제품 모델/Python·오디오 변경이 없어 실제 모델/입력 재검사도 **미실행**이며 이전 같은 native 소스의 성공과 구분합니다.
- 검증 자체는 완료했으며 전체Phase8은 진행 중입니다. 별도Windows·서명/최종배포·실제 release 장치/모델GUI·사용자 데이터 교체/영구 삭제는 미완료입니다. 사용자 자동 저장 수용 대기와 현재 고정 앱을 유지합니다.


### 선택적 자동 저장 사용자 수용 반영 — 2026-10-22

사용자가 수동 저장 없이 프렛5 자동 저장/프로젝트 다시 열기 후5 유지를 확인했습니다. 해당 후속의 수용/문서화를 완료하고 score-autosave-candidate.json·portable-candidate.json을 SCORE_AUTOSAVE_ACCEPTED로 갱신했습니다. 기존374개/번들3개/Windows·DB9/모델 보존·ZIP/독립Python·최신release 설치/종료0/제거/Defender 결과를 유지합니다. 이번에는 문서/영수증만 변경했으므로 빌드/자동 검사 재실행은 **미실행**입니다. 앱은 종료/재실행하지 않았습니다.

현재 응답으로 앱 완전 재실행/별도Windows·서명/최종배포·실제release 장치/모델GUI/고급 주법 품질까지 수용한 것으로 확대하지 않습니다. 전체Phase8은 진행 중이며 상세 제약/재개 위치는 PHASE-05 마지막 절 및 progress/README의 최신 항목을 따릅니다.


## 자동 저장 선택 복원 후속 회귀 — 2026-10-22

### 작업 개요/구현·변경

프로젝트별 선택을 로컬 Storage에 보존하는 F-06 후속의 회귀입니다. 작업 날짜2026-10-22, 코드/전체 프론트·Windows 적용은 완료했고 실제 앱 재실행 수용은 대기입니다. 저장 어댑터·공유 JSON 파서와 컨트롤러/최소 오류 안내를 추가했으며 native/DB/Python/모델·녹음/모니터 기본값은 바꾸지 않았습니다. 세부 파일/범위는 PHASE-05의 ‘자동 저장 선택의 다음 실행 복원’ 절을 따릅니다.

### 테스트 결과/오류 해결

- 프론트381개/96파일27.15초·타입/전체lint·Vite1분4초/포맷 성공. 초기 null 선택 타입 오류는 명시적 존재 검사로 고쳤고, 첫381개 중1개 실패한 프로젝트 간 같은 문서의 재시도 기록은 projectId+document로 분리해 전체 재실행에서 성공했습니다.
- 내장/권한3개0.01초(컴파일39.94초)·Windows고정24.20초 성공. 실제 DB9 백업·녹음0/이전 프로세스 없음 확인 후 PID28960/PTY23083·‘GuitarLab · 자동 저장 선택 복원’ READY와 기존16테이블·4모델marker 불변을 확인했습니다.
- EXE40,675,840바이트/SHA3608d8b8…/portable7f860838…·autosave-preference-candidate.json이 현재 후보입니다. 실제 선택 켜기/정상 종료·재실행 복원은 **미실행/사용자 응답 대기**이며 응답 전 앱을 유지합니다.
- 새 ZIP2f4508d0-c9c0-4dcf-9145-e4070e1b95bc은3612개/39,970,803바이트/SHA `2c6a2ca395f64d1f86007c2c06cbf8aaa43595d916bfbbd388eef5f8a12e3911`. 생성 시 전체 CRC/파일 지문 성공 후 새 UUID 추출/PS5.1 독립 runtime 검사를 이어갑니다. 개인 데이터/로컬 Storage 선택은 포함하지 않습니다.

### 알려진 제약/다음 작업

native 전체/Clippy/모델·실제 입력 재검사는 **미실행** — 해당 소스가 동일해 기존231개/release232개·Clippy/MSRV 결과를 유지합니다. 새 코드가 들어간 NSIS/Defender/새PC·서명/최종배포는 **미실행**이며 과거 다른 SHA 설치기의 검사 결과로 대체하지 않습니다. 실제 재실행에서 선택 복원과 새 ZIP의 최소PATH 실행을 확인한 뒤 후속 상태를 갱신합니다. 프로젝트 백업에 편의 선택을 포함하거나 강제 종료 초안을 복구하는 기능은 미구현입니다.


### 선택 복원 ZIP 독립 실행 점검 성공

최신ZIP2f4508d0…/3,612개/39,970,803바이트/SHA2c6a2ca3…의 전체 CRC/지문과 동일 바이트 새폴더 추출·각파일 SHA를 통과했고, 기본 PowerShell5.1 Test-ValidationPackage.ps1의 전체지문/최소PATH Python3.12.15 두 번도 성공했습니다. autosave-preference-package-roundtrip.json 상태ZIP_AND_POWERSHELL51_CHECKED입니다. 현재 PID28960/PTY23083 앱과 사용자 설정/자료는 변경하지 않았습니다. 프로젝트에서 선택을 켰다는 응답 뒤 동일 빌드를 정상 재실행할 예정이며 실제 재실행 선택 복원은 여전히 **미실행/수용 대기**입니다. 새 NSIS/백신·새PC·서명/최종배포 미실행은 유지합니다.


### 선택 복원 동일 빌드 재실행 수용 완료 — 2026-10-22

사용자가 선택 켜기 오류 없음과 같은 프로젝트의 앱 완전 재실행 후 체크 유지를 확인했습니다. PID28960을 정상종료0/forced=false로 닫은 뒤 동일SHA3608d8b8… EXE로 PID25868/PTY36815 READY를 확인했고 실제 DB9/16테이블·모델4marker도 기준 동일입니다. 후보는 AUTOSAVE_PREFERENCE_ACCEPTED이며 현재 앱을 유지합니다. 기존381개/내장3개/Windows/독립ZIP·PS5.1/Python 성공과 구분해 이 단계는 동일 빌드의 재실행 수용입니다. 소스가 같아 빌드/전체 자동 검사 재실행은 **미실행**입니다. 실제 끄기 후 재실행·새 설치기/백신/별도Windows·서명/최종배포는 **미실행**이고 전체Phase8은 계속 진행 중입니다.
## 기타 트랙 후보의 고정 실행·독립 패키지 후속 — 2026-10-22

### 1. 작업 개요

Phase5/F-06 기타 악보 트랙 추가 후보의 기존 데이터 보호와 배포 자산 회귀를 확인합니다. 작업 날짜2026-10-22이며 기능 사용자 수용/새 ZIP의 기본PS5.1 실행 확인은 아직 진행 중입니다. 전체Phase8 완료가 아닙니다.

### 2. 구현/변경 사항

제품 Rust/Python·DB9/런타임 잠금·모델·패키지 형식은 변경하지 않았습니다. 최신 프론트를 Windows 고정 실행 파일에 넣고 기존 stage/실행 세션 도구·읽기 전용 DB 백업·ZIP 검사를 재사용했습니다. target 내부의 새 검증 receipt/자체 추출 스크립트만 추가했고 사용자 음원/외부 내보낸 파일은 읽거나 동봉하지 않았습니다. 진행 문서/README를 갱신했습니다.

### 3. 테스트 결과

- 프론트386개/28.48초·타입/전체lint/포맷·Vite52.73초·내장 자산/원격 ACL3개/Windows23.34초 **성공**. 기존chunk/macOS identifier/MSVC 안내와 sandbox hardlink 실패 후 복사 경고가 있고 실제 빌드는 성공했습니다.
- PID25868을 정상 CloseMainWindow/EXITED0/forced=false로 종료한 뒤 PID26692/PTY71808의 정확한 제목/응답·EXE지문을 확인했습니다. runtime3393개/64,095,996바이트 전체 검증·새UUID 복사/재검증, 실제DB9 백업/16테이블 전체 지문 및4모델 marker 전후 동일도 **성공**입니다.
- 새 ZIP: validation-packages/c26b434b-0964-4201-8617-5fd000e354a5/GuitarLab-validation.zip,3612파일/39,971,159바이트/SHA `554f29f9f6a6b5a806c39b9fb9a737098c4636e18b1a2da389ef79700f0ed049`. manifest/경로·중복/링크·CRC/전체SHA와 동일 원본 바이트에서 새UUID폴더 추출/각파일지문 검증 **성공**. 기본PowerShell5.1 Test-ValidationPackage.ps1은 실행 중이며 완료 확인 전 성공으로 기록하지 않습니다.
- 새 후보의 사용자 실제 트랙 추가/저장 복원·새 NSIS/AV·별도Windows·서명/최종배포는 **미실행**입니다. Rust 전체/Clippy/MSRV·모델 재설치는 **미실행** — 해당 코드/설치환경을 바꾸지 않았고 과거 성공을 새 실행 결과로 표기하지 않습니다.

### 4. 미구현/제약

새 ZIP은 개발 검증용이며 모델 가중치/개인 프로젝트·녹음·자동 저장 선택/키를 포함하지 않습니다. 이전 NSIS·Defender 결과는 다른SHA 산출물에만 해당합니다. 별도Windows가 없다는 기존 제약과 서명/최종배포·실제 사용자 데이터 교체/영구 삭제 미구현 상태를 유지합니다.

### 5. 다음 작업

같은 사용자 앱을 유지하며 기본PS5.1 독립 Python2회 완료를 확인하고 사용자 트랙 저장·재열기 수용을 따로 기록합니다. 두 검증을 마친 뒤 현재 재개 지점/Phase별 표를 갱신합니다. 승인 없는 게시/사용자 데이터 교체·강제 종료는 하지 않습니다.

### 기타 트랙 후보 패키지·사용자 수용 최종 결과

2026-10-22 기본PowerShell5.1 Test-ValidationPackage.ps1이 전체 파일 지문과 개발경로 제외 Python3.12.15 두 번 실행을 마쳐 exit0/성공 문구를 반환했습니다. manual-track-package-roundtrip.json은 ZIP_AND_POWERSHELL51_CHECKED입니다. 사용자의 새 트랙/프렛3 저장·프로젝트 다시 열기 유지도 확인해 MANUAL_TRACK_ACCEPTED로 기록했습니다. 후보와 소스는 이 수용 동안 바꾸지 않았습니다. 새 NSIS/Defender·앱 완전 재실행 후 새 트랙·별도Windows/서명/최종배포는 미실행으로 유지합니다. 다음 F-06 이름 편집은 별도 계약·회귀 이후 새 후보로 검증하며 현재PID26692/PTY71808 앱은 유지합니다.

## 트랙 이름 후보의 고정 실행·ZIP 검증 — 2026-10-22

### 1. 작업 개요

Phase5 이름 편집 후보의 최신 UI 내장/기존 데이터 보존·개발환경 없는 패키지 실행을 검증했습니다. 작업 날짜2026-10-22, 자동·현재PC 실행/패키지는 완료했고 사용자 실제 이름 저장·복원은 응답 대기입니다. 전체Phase8 완료가 아닙니다.

### 2. 구현/변경 사항

제품 Rust/Python·DB9·runtime/모델/패키지 형식은 바꾸지 않았습니다. 기존 stage/PTY 정상 종료·DB 백업/지문·ZIP 검사를 사용하고 UUID별 실행/추출 경로와 영수증을 새로 만들었습니다. 사용자 음원·기존 내보낸 파일을 읽거나 동봉하지 않았습니다. 관련 파일/동작은 PHASE-05 마지막 이름 편집 절과 docs/12를 따릅니다.

### 3. 테스트 결과

- 전체 프론트390개/96파일26.68초·타입/전체lint/포맷·Vite55.15초 **성공**. 내장 자산/원격 ACL3개(컴파일15.34초)·Windows22.18초 **성공**. 기존큰chunk/identifier/MSVC 및 hardlink 실패 후 복사 경고는 남습니다.
- 기존PID26692/PTY71808 정상종료0/forced=false→새PID31904/PTY71755 ‘GuitarLab · 기타 트랙 이름’ READY/응답 **성공**. EXE40,676,864바이트/SHA3296bdd8…와runtime3393개 전체 지문을 새UUID portable 복사 후 재검사했습니다. 실제 새 트랙 저장 이후 DB9/16테이블 백업과 전환 전후 전체 지문·4모델 marker 동일 **성공**.
- 새 ZIP3612파일/39,971,305바이트/SHA `a377ccf20ee446580583d1ed271d826dca2c89bef3b149e13b7f30fe986092fb`의 manifest/경로·중복·링크/CRC/전체 지문, 같은 바이트의 새UUID 폴더 추출/각파일 지문 **성공**. 기본PowerShell5.1 Test-ValidationPackage.ps1의 전체지문/최소PATH Python3.12.15 실제2회 **성공(exit0)**. manual-track-name-package-roundtrip.json은 ZIP_AND_POWERSHELL51_CHECKED입니다.
- 새 이름의 사용자 수용·새 NSIS/Defender·별도Windows/서명·최종배포는 **미실행**입니다. Rust 전체/Clippy/MSRV·모델 재설치는 **미실행** — 해당 소스/설치를 변경하지 않았습니다. 새로운 검사 오류는 없습니다.

### 4. 미구현/제약

이 ZIP은 검증용이며 사용자 프로젝트/녹음·편의 선택/키·모델 가중치를 포함하지 않습니다. 과거 설치기·Defender 결과는 다른SHA에만 해당하고 별도Windows 수용/서명·최종배포를 입증하지 않습니다. 실제 사용자 데이터 교체/영구 삭제는 미구현입니다.

### 5. 다음 작업

현재PID31904/PTY71755 앱과 제품 소스를 유지하며 사용자 이름 적용/Undo·Redo/프로젝트 저장·다시 열기 답변을 확인하고 PHASE-05/로드맵/진행 표를 갱신합니다. 다음 고급 판정 참조 조사는 read-only이며 새로운 자료/의존성 수신·점수 활성화는 포함하지 않습니다.

### 이름 편집 사용자 수용 갱신

2026-10-22 사용자가 이름 적용/Undo·Redo·프로젝트 저장·다시 열기 유지에 ‘잘댐’으로 답했습니다. manual-track-name-candidate.json/portable-candidate.json은 MANUAL_TRACK_NAME_ACCEPTED이며 현재PID31904/PTY71755 앱은 유지합니다. 앞선390개/Windows·데이터 보존/ZIP·독립Python 결과와 문서화를 합쳐 이름 편집 후속을 완료했습니다. 앱 완전 재실행 이후 이름 확인·새 NSIS/Defender/별도Windows·서명/최종배포 미실행은 유지합니다. 다음은 기존 악보 입력의 크기/압축·파싱 경계 점검입니다.

## 압축 악보 전개량 보호 후속 — 2026-10-22

### 1. 작업 개요

작업 날짜2026-10-22. 이름 편집 후속의 수용/문서 완료 뒤 기존 악보 입력8MiB 제한과 실제 설치 alphaTab1.6.1의 압축 경로를 점검했습니다. ZIP이 전체 결과를 누적하고 GPX가 선언 해제량·내부 파일 크기로 할당하는 경계를 확인해, 파서에 넘기기 전 컨테이너 전개량을 제한하는 한 수직 슬라이스를 진행했습니다. 구현/프론트·패키지 도구 자동 검사는 완료했고 Windows 적용/새 ZIP은 아직 진행 전입니다.

### 2. 구현 및 변경 사항

- 먼저 docs/12에 원본8MiB·실제/GPX 선언 해제32MiB·항목512개·오류/취소·원본 보존 계약을 추가했습니다. 압축 헤더만 제한하는 초기 설계에서 GPX 내부 파일 크기의 별도 할당도 발견해, 적용 전에 내부 검증까지 범위를 완성했습니다.
- 신규 `src/features/score/scoreArchive.ts`: fflate의 작은 청크 ZIP 스트림으로 실제 합계를 확인하고, GPX BCFZ bitstream/BCFS의 파일 크기·합계·sector/진행·완료도 검증합니다. 검증한 항목을 비압축 내부 ZIP으로 만들어 동일 GPIF/MusicXML·스타일 파서에 전달합니다. 디스크 추출/원본 변환 저장은 하지 않습니다. 헤더를 작게 속인 출력도 실제32MiB에서 멈춥니다.
- `alphaTabAdapter.ts`: 공통 importScore에서 전처리를 사용해 로컬/프로젝트/원본 비교 등 모든 기존 호출 경로에 적용합니다. `ScoreWorkspace.tsx`와 `library/projects.ts`는 한도/잘못된 압축의 고정 한국어 오류를 재사용하고 기존 편집을 유지합니다.
- `localMediaImport.ts`, `library/useProjects.ts`: 파일 읽기 직후 취소를 확인해 취소된 바이트를 파싱하지 않습니다. 취소/실패 뒤 기존 세션/원본·저장 버전을 유지합니다.
- 신규 `scoreArchive.test.ts`·`src/test/gpxFixture.ts`, 기존 localMediaImport/useProjects/App scoreSession 테스트: 자체 GP7·GPX·압축 MusicXML 실제 읽기/음표·시간/튜닝·스타일/원본 보존, 과다 선언/실제 해제량·항목·sector·잘린 데이터·취소/기존 프렛 보존을 검사합니다. 실제 사용자 GPX 파일/악성 외부 파일은 쓰지 않았습니다.
- `package.json`/`pnpm-lock.yaml`: 공식 브라우저 ESM·TypeScript5.7+ 타입 수정·MIT 조건을 확인한 fflate0.8.3 한 개를 `pnpm add --save-exact --ignore-scripts fflate@0.8.3`으로 설치했습니다. 설치 스크립트는 실행하지 않았고 기존 직접/전이 npm 버전 집합에 이 항목만 추가됐음을 검증했습니다. 설치 때 기존 ESLint/whatwg-encoding 지원 종료 안내가 있었으며 관계없는 버전 업그레이드는 하지 않았습니다.
- 배포 inventory/THIRD_PARTY_NOTICES·release README와 새1069바이트 MIT 원문(SHA0a1df3a0…)을 추가했습니다. 목록282개·기존 Rust/자산/runtime·MPL6개/고지는 유지하며 최종 법률 검토 완료로 바꾸지 않았습니다. Rust/Python/DB/IPC 변경은 없습니다.

### 3. 테스트 결과

- 최초 압축8개/회귀 전 단계:5개 압축 검사와 대상39개 **성공**. GPX 내부 추가 후 첫7개 중6개 성공/1개 실패, 재검사 동일 실패: 자체 GP7의 빈 폴더를 GPX 파일로 만들어 빈 파일명 검증에서 거부됐습니다. GPX fixture가 ZIP 디렉터리를 파일로 만들지 않도록 수정했고 보호 규칙은 유지했습니다. 이후7개/압축 MusicXML 보완 후8개 **성공**.
- 최종 `pnpm test`: **성공401개/97파일·27.46초**. 직전400개/28.38초 성공 뒤 압축 MusicXML 회귀를 추가해 전체 재실행했습니다.32MiB+1 자체 반복 바이트의 선언을1로 속여도 파서 호출0/한도 오류임을 확인했습니다.
- `pnpm lint`, `pnpm format:check`, `pnpm build`(타입 포함): **성공**. Vite59.24초/main1,586.13kB·gzip422.77kB, 기존500kB 초과 안내. 마지막 테스트 보완 뒤 타입 검사를 추가 진행 중입니다.
- `python -B -X utf8 -m unittest discover -s scripts -p test_collect_release_inventory.py`:4개/0.099초 **성공**. `test_package_validation.py`:7개/0.513초 **성공**. `test_release_source_access.py`:3개/0.191초 **성공**. 전부 기존 개발 Python으로 검사했고 제품 Python/모델을 재설치하지 않았습니다.
- 최신dist 내장 번들 검사 실행 중입니다. Windows 새 후보 실행/기존DB·모델 보존·새 ZIP/기본PS5.1은 **미실행** — 빌드 후 수행합니다. Rust 전체/Clippy/MSRV·실제 오디오/AI 모델은 **미실행** — 해당 소스를 변경하지 않았습니다.

### 4. 미구현 및 알려진 문제

이 보호는 컨테이너 전개량을 제한하며 XML/GP/스타일 파서 전체의 CPU/메모리 상한·ZIP CRC/진위·서명을 보증하지 않습니다. 모든 파싱을 worker로 옮기는 변경도 미구현입니다. 큰 정상 압축 악보라도32MiB/512개를 넘으면 명시적으로 거부합니다. 실제 외부 GPX의 모든 변형/새 Windows·서명·최종배포는 미검증입니다. 기존 미지원 고급 주법/화음·정확도 조건과 프로젝트/녹음 보호는 유지합니다.

### 5. 다음 작업 계획

최신 번들/Windows 고정 후보→runtime/EXE 전체지문→현재 앱 정상 종료·실제DB9 백업/전후 보존→새 ZIP/독립PS5.1 검사를 마칩니다. 완료 전 현재PID31904/PTY71755의 이름 편집 수용 앱은 유지합니다. 실제 수동 한도 파일 선택을 하지 않았다면 미실행으로 남기고 자동 UI 회귀와 구분합니다.

### 압축 악보 보호 최종 타입/내장 검사

마지막 압축 MusicXML 회귀 보완 후 `pnpm typecheck`도 다시 **성공**했습니다. 최신dist `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`는3개/0.01초(컴파일15.19초) **성공**입니다. 상기 full401개/타입·lint/빌드/포맷과 고지·패키지 도구14개가 현재 소스 기준입니다. Windows 고정 후보 빌드는 다음 단계이며 실제 UI 수용이나 새PC 결과로 바꾸어 해석하지 않습니다.
### 압축 악보 보호 Windows 빌드

`pnpm tauri build --debug --no-bundle --ci --config src-tauri/target/runtime-validation/score-archive-dc3b037a-877a-445a-b61c-736b78a62679.conf.json -- --locked --offline`가22.21초 **성공**했습니다. 경고는 앞선 동일 MSVC/identifier/incremental hardlink→복사 안내이며 새 빌드 오류는 없습니다. 새 고정 runtime/EXE 복사와 지문을 확인한 뒤 정상 앱 전환을 진행합니다. 원본/녹음과 모델 설치 환경은 바꾸지 않습니다.
### 압축 악보 보호 실제 Windows 적용/데이터 보존

기존 PID31904/PTY71755에 정상 CloseMainWindow를 요청해 EXITED0/forced=false를 관측했습니다. 새PID27624/PTY10553·‘GuitarLab · 악보 가져오기 크기 보호’ READY/응답을 확인했습니다. 새portable/dc3b037a-877a-445a-b61c-736b78a62679의 EXE40,685,056바이트/SHA `cb28a5a5610ee24728c224e80a39935c4c96db081680992f67d9a85c099ff9fb`와runtime3393개/64,095,996바이트를 잠금 목록·전체 지문/크기·경로/링크 확인 후 복사·재검사했습니다. 전환 전 실제DB9 백업과 전후16테이블의 행수/전체 지문·모델4marker 동일도 **성공**입니다. 개인 녹음/원본·모델 설치/모니터 기본 꺼짐을 바꾸지 않았습니다.

현재 score-archive-candidate.json/portable-candidate.json은 WINDOWS_RUNNING_PACKAGE_PENDING이며 새 ZIP을 생성/검증 중입니다. 사용자 실제 경계 파일 선택은 **미실행**으로 두고, 자동 UI의 오류 안내/기존 프렛·프로젝트 보존 검사와 구분합니다. 이 보호는 기능 배치가 바뀌지 않아 추가 수동 기타 연주/오디오 캡처를 요청하거나 시작하지 않았습니다.
## 압축 악보 보호 후속 최종 기록 — 2026-10-22

### 1. 작업 개요

완료 날짜2026-10-22. 입력 압축 컨테이너 전개량 보호의 구현·자동 회귀/현재PC Windows 실행·독립 패키지 검증과 문서화를 완료했습니다. 실제 모든 사용자 포맷/파서 리소스 보증·전체Phase8/전체 로드맵 완료는 아닙니다.

### 2. 구현/변경 사항

현재 제품은 PID27624/PTY10553·‘GuitarLab · 악보 가져오기 크기 보호’, score-archive-candidate.json/portable-candidate.json의 AUTOMATED_CURRENT_PC_VALIDATED입니다. 원본8MiB와 실제ZIP/GPX32MiB/512항목·내부GPX/취소 보호, 고정 fflate0.8.3/원문 고지를 적용했습니다. 앞선 새 scoreArchive/회귀·gpxFixture와 어댑터/로컬·프로젝트 읽기/오류 UI, package/lockfile·release 고지/계약/기능·검사/진행 문서가 변경 범위입니다. 수용 단계에서는 추가 제품 소스 수정 없이 영수증/문서만 갱신했습니다.

### 3. 테스트 결과

- 최종401개/97파일27.46초·최종타입/전체lint/포맷·Vite59.24초·내장3개/0.01초(컴파일15.19초)·Windows22.21초·실제DB9/16테이블·4marker 보존 모두 **성공**. 정확한 명령·실패/해결·EXE지문은 앞선 절을 유지합니다.
- 새 ZIP3613파일/39,980,131바이트/SHA `7f3c8204c1f06dc5d5e0bc4f416b5cffa99f57ac0df6263cac5de18408b62bd3`: validation-packages/974f8e4b-eef9-4dd8-9d94-823db472ad03/GuitarLab-validation.zip. manifest/경로·중복/링크·CRC/전체 지문과 동일 바이트의 새UUID 추출/각파일 지문, 기본PowerShell5.1 Test-ValidationPackage.ps1 전체 지문·최소PATH Python3.12.15 실제2회 **성공(exit0)**. score-archive-package-roundtrip.json은 ZIP_AND_POWERSHELL51_CHECKED입니다. 새 MIT 원문1개가 포함됐고 모델 가중치/개인 자료는 포함하지 않습니다.
- 고지 수집4개·패키지7개·MPL 소스 접근3개 **성공**. Rust 전체/Clippy/MSRV·실제 오디오/모델 재설치는 **미실행** — 관련 소스/설치를 바꾸지 않았습니다. 실제 사용자 경계 파일 선택/모든 GPX 변형·새 NSIS/Defender·서명·별도Windows·최종배포는 **미실행**입니다. 자동 UI 회귀/합성 과다 출력 검사를 수동 수용으로 표시하지 않습니다.
- 별도 환경 가능성만 읽기 전용으로 확인했습니다. 기본 sandbox의 CIM 조회는 접근 불가였고 같은 조회를 확장 읽기로 실행해 hypervisor=true, WindowsSandbox.exe 부재를 확인했습니다. 레지스트리는 EditionID=Core/ProductName의 Home 표시를 반환했습니다. [Microsoft 공식 지원 범위](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/)도 Home의 Sandbox 미지원을 명시합니다. receipt는 clean-windows-availability-20261022.json이며 Windows 기능 변경/VM 생성·실행/재부팅은 하지 않았습니다.

### 4. 미구현 및 알려진 제약

전체 파서의 CPU/메모리·ZIP CRC/진위 보증, worker 파싱, 모든 실제 사용자 GPX 변형은 미검증/미구현입니다. 이전 설치기/Defender 성공은 다른SHA 파일에만 해당합니다. 별도Windows 검증은 사용자 장비 부재와 현재Home/Sandbox 부재로 이 환경에서 진행하지 못했습니다. 고급 판정의 실제 주법 정답/허위 감점률과 특화 파트 AI의 가중치 조건/품질도 미해결이며 이를 수용 완료로 바꾸지 않습니다.

### 5. 다음 작업 계획/재개 조건

현재 고정 앱·원본/프로젝트·모델 설치는 유지합니다. 다음 필수 수용 검증은 실제 주법/연속 음정의 확인된 참조·특화 모델 사용 조건/품질·별도Windows 환경이 확보된 범위부터 진행해야 합니다. 기존 공개 참조의 측정값/보류·실패 분모와 고급 채점 비활성 상태를 유지하며, 새 자료를 실제 정답으로 위조하거나 현재PC 검사를 새PC 검증으로 기록하지 않습니다. 현재 단계에 필요한 검증 ZIP/자동 점검 스크립트는 준비돼 있고 OS 업그레이드/기능 변경을 임의로 수행하지 않습니다.
