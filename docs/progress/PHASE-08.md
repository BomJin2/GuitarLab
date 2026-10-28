# Phase8 — 품질·릴리스

## 후속 — AppData 리디렉션 경로의 백업 생성 오류 수정 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 내장 리소스를 추가한 뒤에도 사용자가 ‘새 ZIP으로 백업’에서 ZIP 형식 오류를 확인했습니다. 앱과 같은 Python3.12에서 읽기 전용으로 재현한 결과, 논리 Roaming 경로가 Windows 패키지의 실제 Local/Packages 하위 경로로 정규화되면서 정상 AppData 루트를 거부했습니다. 경로의 canonical 기준을 맞추고 오류 코드도 분리했습니다. 자동 검사 성공/새 빌드 진행 중이며 실제 GUI 재시도는 아직 미실행입니다.

### 2. 구현 및 변경 사항

- `scripts/backup_local_data.py`: root/하위 항목 lstat의 링크·reparse 거부 후 실제 경로를 정규화한 루트와 비교합니다. 같은 논리 루트의 정상 리디렉션은 허용하고 실제 루트 이탈·루트/하위 링크는 계속 거부합니다. 목적지 덮어쓰기·기존 ZIP/데이터 보존 정책은 유지합니다.
- `scripts/test_backup_local_data.py`: 리디렉션 조상/동일 실제 루트 통과,정규 루트 이탈 거부,root reparse 거부3개 회귀를 추가했습니다.
- `docs/12-API-CONTRACTS.md`를 먼저 갱신한 뒤 `src-tauri/src/storage/backup.rs`가 Python의 `BACKUP_PATH_INVALID`를 같은 코드로 보존하도록 변경했습니다. `localBackup.ts`는 경로 오류를 ZIP 형식 오류와 구분하며 실제 경로를 표시하지 않습니다. v1 요청/결과·DB 스키마는 유지합니다. Rust/프론트에 코드 보존·민감 경로 은폐 회귀 각1개를 추가했습니다.
- 실제 검증 프로필은 파일명/경로·크기/형식 메타데이터만 읽었습니다. 오디오/DB 내용이나 기본 개인 프로필은 진단 입력으로 사용하지 않았습니다. 현재 고정 앱은 이전 실행 파일로 유지하며 새 native/내장 백업 스크립트 적용에는 이후 재실행이 필요합니다.

### 3. 테스트 결과

- 수정 전 신규3개: **오류1/성공2**,1.44초. 정상 리디렉션 루트가 `BACKUP_PATH_INVALID`로 거부됐습니다. 현재 검증 프로필에서도 내장 Python3.12.15의 일반/Windows 확장 경로에서 같은 오류를 재현했습니다.
- 수정 후 같은 내장 Python의 실제 경로 메타데이터 검사 **성공**: 일반/확장 경로 모두9파일·대소문자 중복 없음입니다. 실제 사용자 백업 생성/청취 수용으로 확대하지 않습니다.
- 제한 세션의 Python 대상/전체 검사는 임시 폴더의 하드링크/rename 권한으로 각각10/11오류·링크 권한1개 제외로 실패했습니다. 같은 자체 테스트를 정상 Windows 환경에서 승인된 실행으로 재검사해 **도구149개 실행/148개 성공/링크 생성 권한1개 미실행**,20.10초입니다. 링크 보호는 별도 reparse 속성 검사로도 확인합니다.
- 내장 Python3.12.15 `-I -B -X utf8 -m unittest discover -s scripts -p test_backup_local_data.py -v`: **18개 실행/17개 성공/링크 권한1개 미실행**,13.43초입니다. 로그=`backup-canonical-root-python312-20261028.log`입니다.
- `pnpm typecheck`,lint와 백업 서비스/훅/패널3파일 **15개 성공**,20.65초입니다. 새 오류 안내와 기존 동의·취소/작업 수명 보호를 확인했습니다.
- `GUITARLAB_BACKUP_RESOURCES=<현재 GUI 폴더>`로 Rust 백업4개(기본 제외 통합 검사 명시 포함) **성공**,빌드41.83초/검사29.11초입니다. 자체 데이터의 실제 내장 Python 생성/검사/새 폴더 추출·기존 데이터/ZIP 보존·취소/worker와 새 오류 코드 구분을 확인했습니다. 로그=`backup-canonical-root-native-20261028.log`입니다.
- 전체 `pnpm test`: **715개/129파일 성공**,78.71초. `cargo test --all-features`: **267개 성공/29개 기본 제외**,빌드50.27초/검사27.88초입니다. Clippy **성공**,14.58초·Rust1.90 all-targets/all-features **성공**,14.79초입니다.
- 첫 Prettier 검사는 새 오류 메시지 검사1파일의 줄바꿈으로 실패했습니다. 해당 파일만 Prettier로 정리해 전체 `pnpm format:check`와 `cargo fmt --check`/Git diff 검사를 **성공**했습니다. 동작 변경은 없으며 동일 전체 테스트를 반복하지 않았습니다.
- 웹/Windows 새 빌드와 새 원격/패키지는 **진행 중/예정**입니다. 실제 새 GUI 백업/검사·복원 미리보기는 **미실행**이며 실행 파일 전환 뒤 사용자에게 요청합니다. 새 후보에는3,393파일의 리소스를 먼저 복사/전체 SHA 확인해 EXE만 준비하는 오류를 예방했습니다.

### 4. 미구현 및 알려진 문제

현재 열린 GUI는 수정 전 내장 스크립트를 포함하므로 반복 재시도하지 않습니다. 새 고정 GUI는 EXE뿐 아니라 검증된 ai-runtime을 함께 준비하고 정확한 GUI 폴더의 native inspect를 확인합니다. AppData 자동 교체/영구 삭제·다른OS/전체 출시 수용은 미완료이며 기존 데이터는 변경하지 않습니다.

### 5. 다음 작업 계획

남은 자동 검사/빌드를 마치고 같은 테스트 프로필의 새 고정 EXE·리소스를 준비합니다. 유지할 내용 저장/종료를 사용자에게 요청한 뒤, 명시적 실행 요청에 따라 전환하고 새 ZIP 생성→읽기 전용 검사→새 폴더 미리보기를 순차 확인합니다. 확인 전 현재 앱을 임의 조작/종료하지 않습니다.

## 후속 — 검증 GUI의 내장 런타임 누락과 백업 재시도 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 사용자가 같은 고정 앱에서 백업을 시도했으나 ‘내장 실행 환경의 무결성을 확인하지 못했습니다’로 실패했습니다. 검증 GUI 폴더에 EXE만 복사하고 `ai-runtime`을 빠뜨린 준비 오류를 확인했습니다. 제품 ZIP 자체의 리소스 검증 성공과 실제 GUI 폴더의 누락을 구분합니다. 리소스 추가/native 검사까지 완료했으며 사용자 백업 재시도는 답변 대기입니다.

### 2. 구현 및 변경 사항

- 현재 GUI의 `ai-runtime` 부재와 native 백업이 항상 `resources/ai-runtime`을 검증하는 경로를 확인했습니다. 실패는 Python/백업 저장 호출 전에 발생했으며 새 ZIP 생성 성공으로 기록하지 않습니다.
- 이미 검증한 로컬 런타임을 링크 없는 새 UUID staging에 복사하고 전체3,393파일/64,095,466바이트·SHA/파일 집합을 대조한 뒤 비어 있는 GUI 목적지에 게시했습니다. 다운로드/모델 설치는 없었습니다. EXE SHA·UI/제품 소스·앱 데이터는 불변이며 창을 종료/재실행하지 않았습니다.
- `docs/13-ENV-AND-RELEASE.md`에 GUI도 EXE+리소스를 함께 준비하고 정확한 GUI 폴더의 native 최소 PATH 검사 후 사용자 수용을 요청하도록 명시했습니다. 실제 명령의 무결성 검사나 개발 Python 폴백을 변경하지 않았습니다.
- 로컬 영수증=`src-tauri/target/runtime-validation/gui-proofs/project-wide-drop-60e73f2e/runtime-repair.json`입니다. 기존 proof.json에 리소스 추가 원인/크기·영수증 연결을 기록했습니다.

### 3. 테스트 결과

- 전체 파일 사전/복사 후 검사 **성공**. runtime lock SHA256=`191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d`,3,393파일/64,095,466바이트이며 현재 EXE SHA256=`edaebe6485ba9e7ac2c4156b4cdb20413948aefa17046075fb2443e2779996b5`는 불변입니다.
- 동일 소스의 검증된 `manage_ai_model.exe inspect <현재 GUI 폴더>`·최소 PATH **2회 성공**. Python3.12.15/기본 모델2개 미설치 응답이 정상이며 모델 설치는 실행하지 않았습니다. 도구 SHA256=`3bc935f5a6e123399d93f57370112446a0056a2a23a03e0f0df1e07b21d43c02`입니다.
- 검사 wrapper의 첫 manifest 조회는 files를 map으로 가정해 실패했고 실제 list의 path 항목으로 수정했습니다. 제한 실행 환경에는 SystemRoot가 없어 실행 전 중단됐으며 정상 Windows 환경에서 승인된 읽기 전용 inspect를 실행해 성공했습니다. 이 wrapper 오류를 앱의 백업 오류 원인으로 혼동하지 않습니다.
- `GUITARLAB_BACKUP_RESOURCES=<현재 GUI 폴더>`로 `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml actual_bundled_backup_and_runtime_worker_preserve_original_and_new_zip --lib -- --ignored --test-threads=1`: **1개 성공**,빌드32.23초/검사23.96초. 자체 임시 데이터의 ZIP 생성/검사·새 폴더 DB9/악보/보관 녹음/JSON 추출·원본/기존 ZIP·목적지 보존/손상 거부·취소와 worker 실행을 확인했습니다. 사용자 앱 데이터는 사용하지 않았습니다. 로그=`gui-runtime-repair-backup-native-20261028.log`입니다.
- 실제 GUI의 새 ZIP 생성 재시도는 **미실행/사용자 답변 대기**입니다. ZIP 읽기 전용 검사/새 폴더 복원 미리보기 수용도 **미실행**입니다. 제품/UI 소스를 변경하지 않아 전체714프론트/전체Rust·웹/Windows 빌드는 **재실행 미실행**이며 직전 소스 결과와 구분합니다.

### 4. 미구현 및 알려진 문제

검증 GUI의 준비 오류를 수정했으며 사용자 실제 백업 성공은 아직 확인하지 않았습니다. 기존 데이터/ZIP 덮어쓰기·AppData 교체/영구 삭제는 진행하지 않았고 해당 미구현 경계는 유지합니다. 이전 제품 ZIP의 SHA/검사 결과는 불변이며 리소스가 없었던 GUI를 내장 실행 환경 검증까지 성공한 것으로 기록하지 않습니다.

### 5. 다음 작업 계획

native 통합 검사는 통과했습니다. 기존 창의 새 ZIP 보존 완료 문구를 확인합니다. 성공하면 같은 ZIP 읽기 전용 검사→새 상위 폴더 복원 미리보기를 한 단계씩 사용자에게 요청합니다. 답변 전 창/EXE/UI 소스는 유지합니다.

## 후속 — 실제 입력 유지 중 검증 앱 메모리 관측 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 전체 영역 파일 drop의 사용자 수용을 완료한 같은 고정 앱에서 Phase8의 실제 앱/장기 입력 관측을 진행합니다. 사용자가 SSL Input1 입력을 시작하고 ‘튜너가 움직임 — 입력 유지 중’으로 답했습니다. 5분간 앱 본체/소유 WebView 자식의 수치를 읽고 실제 입력 진단과 장치 분리/재연결을 사용자에게 확인했습니다. **이번 관측/단일 장치 수용 완료**이며 전체 성능·왕복 지연/별도OS 수용 완료는 아닙니다.

### 2. 구현 및 변경 사항

제품/실행 UI 소스와 기존 EXE는 변경하지 않았습니다. 로컬 검증 폴더의 `observe-current-tauri-20261028.ps1`로 기록된 PID/실행 경로·생성 시각/EXE SHA를 대조하고, 검증 앱과 그 소유 WebView 하위 프로세스만5초 간격으로 관측합니다. 프로세스마다 working set/private bytes·누적 CPU를 기록하며 이름/ID·숫자 이외 화면/명령줄/음원 내용은 수집하지 않습니다. 종료·재시작·원격 UI 입력·REC도 하지 않습니다. 같은 폴더에 새 UUID 영수증만 생성합니다.

### 3. 테스트 결과

- 최초 제한 실행 세션에서 기록된 PID가 보이지 않아 `OWN_GUI_PROCESS_NOT_VISIBLE`을 확인했습니다. 앱을 중복 실행하지 않았고, 승인된 읽기 전용 조회에서 같은 PID/정확한 EXE 경로·생성 시각을 확인했습니다. 이는 프로세스 종료나 앱 오류로 처리하지 않습니다.
- 실제 PS5.1의 `powershell.exe -NoProfile -File …/observe-current-tauri-20261028.ps1 -Seconds 3`: **성공**,3.53초/2개 표본. 앱 본체와 WebView 총8개·제외0개였으며 EXE SHA는 불변입니다. 영수증은 검증 폴더 기준 `tauri-input-observation-d50baf3d-b976-4755-8044-b3c64ab9a182/observation.json`입니다.
- 같은 명령의 `-Seconds 300`: **성공**,300.53초/56표본. 조회 비용을 포함해 실제 표본 간격은5초보다 길며, 동일8개 PID·제외0개/EXE SHA 불변을 확인했습니다. 로그=`tauri-input-memory-300s-20261028.log`,원본=`tauri-input-observation-fd4ac21d-3f6e-4f14-8104-fc15309fdc8d/observation.json`,분석/사용자 답변=`summary.json`입니다. 이 파일들은 `src-tauri/target/runtime-validation/` 아래 로컬 검증 산출물이며 배포물에 포함하지 않습니다.
- 원본 관측 SHA256=`d956c0d10ba407a85a0a60e45016dcb2ea9b21c7d2b5318175fdc0fa8780d0cd`,관측 스크립트 SHA256=`c9139705cefc764ebe6a00dcbcae2cad7dd26f87797bd34b92d05be5c3f26cc4`. 잘못된0초 인자는 프로세스 관측 시작 전에 **거부 성공**입니다. 수치의 유한/비음수·시간 증가/동일 PID 집합·8개/제외0개/관측 시간·스크립트 지문을 분석 assert로 확인했습니다.

| 수치(MiB) | 첫 표본 | 마지막 표본 | 최소~최대 |
|---|---|---|---|
| 앱 본체 working set | 46.664 | 46.832 | 46.664~46.848 |
| 앱 본체 private bytes | 8.527 | 9.453 | 8.527~9.484 |
| 본체+소유 WebView working set 합 | 549.707 | 549.094 | 545.879~550.492 |
| 본체+소유 WebView private bytes 합 | 254.074 | 255.047 | 250.445~255.785 |

- CPU 시간 증분은 첫/마지막 표본 간299.91초 동안 본체103.6875초/소유 프로세스 합122.34375초입니다. **논리 코어1개를100%로 잡은 평균**은 본체34.573%/합40.794%이며 전체 PC CPU 퍼센트가 아닙니다. 다른 앱/CPU 부하는 통제하지 않았고 임계값 통과나 오디오 지연 수치로 해석하지 않습니다.
- **사용자 실제 입력 수용 성공**:48,000Hz/1채널/f32·callback/협상 버퍼 각480프레임,캡처28,640,160프레임(596.67초)·누락0/불연속0·onset375·monotonic ns82707718395366입니다. 사용자는 검사 중 다시 시작한 적이 없다고 확인했습니다. 이는5분 기준14,400,000프레임 이상이며 onset 수를 실제 연주 정답/오검출률로 간주하지 않습니다. 반주를 재생하지 않아 clock 대기는 정상이며 clock/왕복 지연 수용은 이번 검사에 포함하지 않았습니다.
- **사용자 실제 분리/재연결 수용 성공**: USB 분리 후 끊김 안내/캡처 정지,재연결→입력 중단/장치 새로고침/SSL Input1 시작 후 튜너/캡처 증가 복구를 확인했습니다. 이번에는 채점·REC/모니터를 테스트하지 않았으며 이전 시도의 해당 수용과 구분합니다.
- 제품/UI 소스 변경이 없어 타입/전체 회귀·빌드는 **재실행 미실행**입니다. 직전 d835084의714프론트/262·266Rust·AI113/도구146 원격 전체·Windows/ZIP 결과는 해당 소스의 결과로 유지합니다. 이번 변경 문서의 Prettier/Git diff·추가 행 문자 검사는 **성공**입니다.

### 4. 미구현 및 알려진 문제

working set 합계에는 공유 페이지가 중복될 수 있어 전체 고유 물리 메모리/RSS로 표시하지 않습니다. private bytes는 실제 사용 RAM과 다릅니다.5분/단일PC 관측만으로 누수 부재·CPU 격리/오디오 왕복 지연·모든 장치/별도OS 성능을 보장하지 않습니다. 모니터/녹음 동시 부하·실제 지연 측정은 **미실행**입니다. 기존 합성DSP 결과와 실제 앱 관측도 구분합니다.

### 5. 다음 작업 계획

300초 관측/실제 누락0·불연속0과 분리/재연결 수용을 확정했습니다. 다음은 같은 고정 앱의 새 ZIP 백업→읽기 전용 검사→새 폴더 복원 미리보기 수동 수용입니다. 현재 새 ZIP 보존 완료 문구 답변을 기다리며 기존 AppData 교체/영구 삭제는 진행하지 않습니다. 확인 동안 앱/실행 UI 소스를 유지합니다.

## 후속 — 전체 프로젝트 파일 drop의 원격·독립 패키지 검증 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. d835084의 전체 작업 공간 악보/WAV·MP3 drop·최소 안내와 음원 분할 보관은 로컬714프론트/266확장Rust·타입/lint/포맷·Clippy/MSRV·웹/Windows·내장4개 및 새 원격 전체를 통과했습니다. 독립 ZIP/PS5.1/Defender와 별도 GUI 준비를 마쳤습니다. 실제 전체 영역/음원·저장/다시 열기는 사용자 수용을 마쳤으며 전체 출시는 미완료입니다.

### 2. 구현 및 변경 사항

소스/계약·신규 회귀와 오류 해결은 [Phase2 첫 절](PHASE-02.md)을 따릅니다. 기본 제품 EXE를 불변 폴더에 고정한 뒤 같은 자체 테스트 프로필을 쓰는 별도 제목/식별자의 검증 EXE를 준비했습니다. 사용자가 기존 창을 저장/종료했다고 확인한 뒤 이전의 명시적 실행 요청에 따라 새 테스트 앱을 한 번 실행했습니다. 앱을 원격 조작하거나 기본 제품 프로필/개인 음원을 열지 않았습니다. 패키지와 GUI의 서로 다른 EXE 지문을 구분합니다.

### 3. 테스트 결과

- d835084의 [Windows40657929271](https://github.com/BomJin2/GuitarLab/actions/runs/40657929271)/job122713419046: **전체 성공**. 프론트714/129파일(56.04초)·웹5.65초, 기본Rust262/확장266(58.96/51.03초·각29개 기본 제외), 예제1+1·AI113(2.30초)/도구146(26.126초·건너뜀 없음)·Clippy/MSRV1.90(11.02초)·사후 정리를 확인했습니다.
- `project-wide-drop-package-20261028.py`: **성공**,`VERIFIED_NOT_LAUNCHED`. ZIP3,613파일/40,391,843바이트·CRC/SHA·새 추출과 실제 PS5.1/최소 PATH Python3.12.15 검사를 확인했습니다. 제품 EXE41,656,832바이트/SHA256=`674063119a060e9786c5f54a77b73ff8e15bdbe6105ed4037ac8dd9b7415b638`,ZIP SHA256=`ceaeaf6ad0180e2ad3e5a075bfa01ace075796e0e0813268fd99de8ac1be36ce`입니다.
- 이하 경로는 `src-tauri/target/runtime-validation/` 기준입니다. ZIP=`validation-packages/ba2a046f-2ef8-4034-9ed4-ffe1d2d4bd2c/GuitarLab-validation.zip`,후보=`project-wide-drop-candidate-32480187-7c1b-4411-b64c-31f58632a889.json`,영수증=`project-wide-drop-package-receipt-51a7d962-85be-4d68-9f45-d90408fb7aa5.json`,추출=`project-wide-drop-roundtrip-f1d14250-b9c5-450b-90bd-727f16d1cc54`입니다. 제품 패키지 앱은 **미실행**입니다.
- 새 제품 EXE/ZIP Defender **성공**: 두 exit0/전후 SHA 불변,NotSigned. 영수증=`project-wide-drop-defender-3fbf3eec-49d4-44f7-852a-b7253ea5c29b.json`입니다. 자동 치료/설정 변경·개인 파일 검사는 하지 않았습니다.
- 별도 GUI=`gui-proofs/project-wide-drop-60e73f2e/GuitarLab.exe`,41,657,344바이트/SHA256=`edaebe6485ba9e7ac2c4156b4cdb20413948aefa17046075fb2443e2779996b5`입니다. 제목=`GuitarLab · 전체 파일 드롭 60e73f2e`,식별자=`com.guitarlab.validation.gui8d7592482b7a4262a7abd95623b97b7e`입니다. 같은 폴더의 proof.json에 사용자 저장/종료 확인·실행 요청과 실행 정보를 기록했습니다. PID가 다른 관측 세션에서 보이지 않는다는 이유로 중복 실행하거나 종료하지 않습니다.
- GUI 복사 후 기본 설정 빌드 **성공**,13.69초·내장/원격 권한4개 **성공**. 기본 바이너리에 제품 식별자가 있고 검증 식별자는 없으며 현재 GUI SHA는 불변임을 확인했습니다. 로그=`project-wide-drop-default-restore-20261028.log`,`project-wide-drop-default-bundle-20261028.log`입니다.
- 실제 JSON을 TAB 위로 드래그했을 때 안내/프렛3 표시는 **사용자 확인 성공**입니다. 음원 드롭/약4초 길이/청취와 저장/다시 열기의 카피·프렛3·음원/소리 유지까지 **사용자 확인 성공**입니다. 256MiB 실전달·실제30초 timeout/디스크 부족/강제 종료·다른 Windows/장기 실제 입력/RSS는 **미실행**입니다. 2MiB 초과 조각/짧은 deadline 주입의 자동 검사를 실제 최대 크기·실시간 대기 성공으로 확대하지 않습니다.

### 4. 미구현 및 알려진 문제

외부 참조 drop·폴더/복수 파일·프로젝트 없는 화면 전체 drop·자동 staging 복구는 미구현/범위 밖입니다. 전체 재생 버퍼 정책은 유지하며1MiB 전송 조각 상한이 앱 RSS 상한은 아닙니다. 실행 파일 서명은 없고 별도 OS·실제 장치/전체 출시 수용 조건도 남았습니다. 기본9개/부분5개 상태를 유지합니다.

### 5. 다음 작업 계획

사용자가 TAB 위 JSON/음원 드롭 안내/프렛3·약4초 청취와 저장/다시 열기를 모두 확인했습니다. 이번 수용 결과를 기록하고 다음 실제 앱/장치·장기 메모리 관측 조건을 검토합니다. 현재 불변 GUI는 유지하며 실제 화면 입력/종료·재실행은 사용자 수동 규칙을 따릅니다. 문서 반영은 계속하되 직접 GUI 입력/종료·재실행은 하지 않습니다.

## 후속 — 프로젝트 악보 drop의 독립 패키지·수동 검증 준비 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 7f88fb3의 관리용 악보 drop에서 로컬693프론트/261Rust·타입/lint/포맷·Clippy/MSRV·웹/Windows·내장4개를 통과했습니다. 새 ZIP/PS5.1/Defender를 확인하고 같은 자체 테스트 프로필을 쓰는 별도 실행 파일을 준비했습니다. 원격 전체도 성공했으며 사용자 실제 Explorer 수용은 답변 대기입니다.

### 2. 구현 및 변경 사항

실제 소스/계약·검사와 오류 해결은 [Phase2 첫 절](PHASE-02.md)을 따릅니다. 기본 제품 패키지를 불변 폴더에 먼저 고정한 뒤 별도 식별자/제목·WebView 폴더만 바꾼 검증 EXE를 복사했습니다. 같은 테스트 프로필의 ‘GUI 확인’을 재사용하며 기본 제품 AppData/개인 자료는 열지 않습니다. 사용자가 기존 창이 닫혀 있다고 확인했고 새 창 실행을 명시적으로 요청해 해당 EXE만 한 번 실행했습니다. 마우스/키보드 조작과 자동 종료는 하지 않습니다.

### 3. 테스트 결과

- `project-score-drop-package-20261028.py`: **성공**,`VERIFIED_NOT_LAUNCHED`. ZIP3,613파일/40,331,534바이트·CRC/SHA·새 압축 해제와 실제 PS5.1/최소 PATH Python3.12.15 검사를 확인했습니다. 제품 EXE41,379,328바이트/SHA256=`6f42f1a70558dac53c56b1a1674fd66393a4c8d14f38acd20e7d217be65b7452`,ZIP SHA256=`8c570dd01e4ba833d55db6fc4d17f2f49f283c0f2c0b42431a1970518f68cc92`입니다.
- 검증 폴더 기준 ZIP=`validation-packages/50f1ce79-3220-4d95-970a-46e1d8738295/GuitarLab-validation.zip`,후보=`project-score-drop-candidate-0347165a-0941-454d-b7c2-923ec8c604c6.json`,영수증=`project-score-drop-package-receipt-248bdc47-fb5b-4dc2-929a-139937a317bd.json`,추출=`project-score-drop-roundtrip-dcaf3fb6-16e7-45a0-a058-207a39a459bf`입니다. 제품 패키지는 **미실행**입니다.
- 새 제품 EXE/ZIP Defender **성공**: 두 exit0/전후 SHA 불변,NotSigned. 영수증=`project-score-drop-defender-0a90d70a-3f0c-483e-bcd7-bdd2fd25b724.json`입니다. 자동 치료/설정 변경·개인 파일 검사는 하지 않았습니다.
- 별도 GUI=`gui-proofs/project-score-drop-c5dc50c5/GuitarLab.exe`,41,379,840바이트/SHA256=`13ea58a8bfce769916b0a17e44c6cf6e7b61c756f63e40a097a46c8b3f50e620`입니다. 실제 바이너리의 검증 식별자/제목을 확인했습니다. 제목=`GuitarLab · 프로젝트 악보 드롭 c5dc50c5`,식별자=`com.guitarlab.validation.gui8d7592482b7a4262a7abd95623b97b7e`입니다. 같은 폴더의 proof.json에 사용자 종료/실행 요청과 비자동 UI 입력을 기록합니다. 실행 PID가 다른 관측 세션에 보이지 않는다는 이유만으로 중복 실행하거나 창을 닫지 않습니다.
- GUI 복사 후 기본 빌드 설정 복원 **성공**,15.73초·내장4개 성공. 기본 식별자/검증 식별자 부재와 GUI SHA 불변을 확인했습니다. 로그=`project-score-drop-default-restore-20261028.log`,`project-score-drop-default-bundle-20261028.log`입니다.
- 7f88fb3의 [Windows40647692164](https://github.com/BomJin2/GuitarLab/actions/runs/40647692164)/job122680240813: **전체 성공**. 프론트693(71.89초)·웹6.86초, 기본Rust257/확장261(74.78/84.60초·각29개 기본 제외), 예제1+1·AI113(2.52초)/도구146(23.041초·건너뜀 없음)·Clippy/MSRV1.90(10.18초)·사후 정리를 확인했습니다.
- 실제 Explorer drop→프로젝트 저장/다시 열기는 **미실행/사용자 답변 대기**입니다.
- 개인 자료/기본 제품 GUI·다른 Windows/디스크 부족·강제 종료/장기 실제 입력/RSS: **미실행**. 단축키 e745059의 사용자 수용과 새 기능을 구분합니다.

### 4. 미구현 및 알려진 문제

프로젝트 음원/외부 참조 drop·자동 staging 복구는 미구현입니다. 기본 제품 패키지와 별도 프로필 GUI EXE를 혼용하지 않습니다. 실제 데이터 교체/영구 삭제·서명·별도 OS와 고급 정확도/특화 AI 수용은 계속 남아 있습니다.

### 5. 다음 작업 계획

같은 테스트 프로젝트의 실제 Explorer drop과 저장/다시 열기를 사용자 답변으로 확인하고 원격 전체 결과를 확정합니다. 현재 새 창/불변 EXE/실행 UI 소스는 유지하며 CLI·문서 확인을 계속합니다. 원격 마우스/키보드 조작으로 수동 수용을 대체하지 않습니다.

## 후속 — 원본 import rollback의 원격·독립 패키지 검증 (2026-10-28)

### 1. 작업 개요

작업/자동 검사일2026-10-28. e736df7의 DB 실패 정리에서 로컬 확장258Rust/Clippy·타입/포맷·Windows/Rust1.90과 새 원격 전체, 독립 ZIP/PS5.1을 확인했습니다. 새 Defender는 승인 검토 한도로 미실행이며 개인 자료·현재 수동 검증 창은 유지합니다.

### 2. 구현 및 변경 사항

소스는 `src-tauri/src/storage/projects.rs`/`projects_tests.rs`의 호출 소유 복사본 정리와 신규2개 회귀입니다. [Phase4 첫 절](PHASE-04.md)에 실패 재현/파일·명령을 기록했습니다. 새 패키지는 기존 Python3.12 런타임 lock/라이선스와 같은 프론트 dist를 사용하고 제품 EXE만 갱신합니다. 앱을 실행하거나 사용자 프로필을 열지 않았습니다.

### 3. 테스트 결과

- 잔여 검사 후속 **성공**: 문서 Git 반영의 승인 검토가 다시 정상 처리돼 같은 승인 절차로 Defender를 재시도했습니다. 새 EXE/ZIP 모두 exit0/전후 SHA 불변,NotSigned이며 영수증은 `asset-import-rollback-defender-5994f4d0-1754-445e-b9fe-fd1d2f312c16.json`입니다. 아래 최초 미실행은 당시 이력으로 보존합니다. 원격/ZIP·PS5.1과 이번 검사까지 완료했으며 실제 새 GUI/장치·다른OS는 여전히 미실행입니다.

- [Windows40639171764](https://github.com/BomJin2/GuitarLab/actions/runs/40639171764)/job122653103870: **전체 성공**. 프론트683(53.82초)·웹5.54초, 기본254/확장258Rust(55.85/53.24초·각29개 기본 제외), 예제1+1·AI113(2.14초)/도구146(18.965초·건너뜀 없음)·Clippy/MSRV1.90(8.04초)·사후 정리를 확인했습니다.
- `asset-import-rollback-package-20261028.py`: **성공**,`VERIFIED_NOT_LAUNCHED`. ZIP3,613파일/40,293,790바이트·CRC/SHA·실제 PS5.1/최소 PATH Python3.12.15 검사를 확인했습니다. 제품 EXE41,247,744바이트/SHA256=`b88d8f076921df6f5967bcd4121ba7e7619e8e2fa094a66fe0b6fe428ed56381`,ZIP SHA256=`6bf43548da763a6d6e572f1a424c99526c364a4107305502fbff6649cb806fdd`입니다.
- 검증 폴더 기준 ZIP=`validation-packages/9001735b-1ada-4eb5-8809-afe3ff3adf91/GuitarLab-validation.zip`,후보=`asset-import-rollback-candidate-db4787e4-a790-4a90-8135-a2bca5027579.json`,영수증=`asset-import-rollback-package-receipt-7b0d5934-ff8a-4302-9b4b-8c4291beca5a.json`,추출=`asset-import-rollback-roundtrip-1dc6ac88-0497-4ca8-83fa-9dd1f01e08ae`입니다. 새 패키지 앱은 **미실행**입니다.
- 새 제품 EXE/ZIP Defender: **미실행**. 검사 helper 생성/Defender 실행 명령의 자동 승인 검토가 사용량 한도로 완료되지 않아 전체 명령이 실행되지 않았습니다. 안전성 거절이 아니며 다른 도구/권한으로 같은 검사를 우회하지 않았습니다. 이전 e745059 후보 Defender 성공은 새 EXE 검사 결과로 혼용하지 않습니다.
- 실제 개인 DB/디스크 부족·전원 중단·새 native GUI/별도 Windows: **미실행**. 사용자 수용한 단축키 고정 창은 이전 e745059이며 이번 native 변경을 적용했다고 표시하지 않습니다.

### 4. 미구현 및 알려진 문제

Defender/서명·별도 OS/실제 장치와 전체 출시 수용은 미완료입니다. 원본 가져오기 실패 보완을 열린 프로젝트의 drag/drop 구현으로 표시하지 않습니다. 현재14단계 중 기본9개/부분5개와 기존 데이터 보존 원칙은 유지합니다.

### 5. 다음 작업 계획

자동 승인 검토가 가능해지면 새 EXE/ZIP Defender와 최종 문서의 Git 반영을 확인합니다. 그 뒤 열린 프로젝트 악보 drop의 바이트 크기/취소·관리용 복사/외부 참조/미저장 보호 계약을 별도 슬라이스로 구현합니다. 실제 화면 조작은 계속 사용자에게 요청합니다.

## 후속 — 단축키 초점 수정의 배포 검사·수동 재확인 준비 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. e745059의 초점 수정은 전체683프론트·타입/lint/포맷·웹/내장4개·Windows 빌드를 통과했습니다. 새 독립 ZIP/PS5.1·Defender를 확인하고 사용자가 직접 실행할 별도 GUI를 준비했습니다. 실제 단축키 재확인과 새 원격 전체 성공을 확인했으며 전체 출시 완료는 아닙니다.

### 2. 구현 및 변경 사항

초점 복원/신규5개 검사의 소스 변경은 [Phase5 첫 절](PHASE-05.md)을 따릅니다. 이전 자체 GUI와 같은 테스트 식별자를 사용해 사용자가 저장한 ‘GUI 확인’/프렛3을 유지하며 새 EXE는 별도 불변 폴더에 복사했습니다. 원본 제품 프로필·개인 자료를 열지 않았고 처음에는 실행 경로를 안내했으며 이후 사용자가 실행을 요청해 해당 수정본만 실행했습니다. 앱 종료/마우스/키보드 조작은 하지 않았습니다.

### 3. 테스트 결과

- `editor-focus-keyboard-package-20261028.py`: **성공**,`VERIFIED_NOT_LAUNCHED`. 새 ZIP3,613파일/40,293,985바이트·CRC/SHA·실제 PS5.1/최소 PATH Python3.12.15 두 번을 확인했습니다. 제품 EXE41,246,208바이트/SHA256=`a301547f6549628959db8d50866829053488729178e1a3d7db930ba322cab0cf`,ZIP SHA256=`035574a00d826975092e4c8ce17b256f71a62818672d289fd6257e07a4889aba`입니다.
- 검증 폴더 기준 ZIP=`validation-packages/244bed0f-3f5b-4d35-88d7-7fe2591076e3/GuitarLab-validation.zip`,후보=`editor-focus-keyboard-candidate-a41843f6-5552-44b1-929d-762ff789d0cb.json`,영수증=`editor-focus-keyboard-package-receipt-26bdf614-09b1-40c4-955b-e6d2239ec4e3.json`,추출=`editor-focus-keyboard-roundtrip-c9732c48-fd10-45f1-b207-4e78c08df792`입니다.
- 새 제품 EXE/ZIP Defender **성공**: exit0/전후 SHA 불변,서명은 `NotSigned`. 영수증=`editor-focus-keyboard-defender-ad5af80b-2cc7-4e3e-b8fd-c3b0737c646f.json`입니다. 자동 치료/설정 변경은 하지 않았습니다.
- 별도 GUI=`gui-proofs/keyboard-focus-d55ec2b1/GuitarLab.exe`,SHA256=`570e0dbf9c24880259b7a981996c91b3d5f255d42cd2e0ecb74b7c19b815df96`,41,246,208바이트. 제목=`GuitarLab · 단축키 초점 수정 d55ec2b1`,식별자=`com.guitarlab.validation.gui8d7592482b7a4262a7abd95623b97b7e`가 실제 바이너리에 포함됨을 확인했습니다. 영수증은 같은 폴더의 `proof.json`이며 사용자의 명시적 요청 후 실행했고 실제 Ctrl+Z/Y 정상은 **사용자 수동 확인 성공**입니다. 첫 실행의 PID가 도구에서 보이지 않아 추가 실행을 시도했으나 해당 시도는 exit1로 끝났습니다. 사용자는 정상 창/단축키를 확인했으므로 기존 창을 종료하거나 잠금 파일을 변경하지 않았습니다. 실행 세션의 종료를 실제 창 종료로 간주하지 않습니다.
- 별도 GUI 복사 후 기본 제품 설정 복원 빌드 **성공**,15.37초. 내장 검사를 잘못 `--test bundle_assets`로 지정해 존재하지 않는 테스트 대상 오류가 발생했고 올바른 `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests`로 수정해 **4개 성공**했습니다. 복원 EXE의 기본 식별자/격리 식별자 부재와 복사한 GUI SHA 불변도 확인했습니다. 재빌드 EXE 지문은 패키지에 고정한 EXE 지문과 구분합니다.
- e745059의 [Windows40637214536](https://github.com/BomJin2/GuitarLab/actions/runs/40637214536)/job122646833819는 사후 정리까지 **전체 성공**입니다. 프론트683(97.14초), 기본252/확장256Rust(110.17/53.68초·각29개 기본 제외), 예제1+1·AI113(2.92초)/도구146(20.969초·건너뜀 없음)·Clippy/MSRV1.90(12.93초)을 확인했습니다. 기본 제품 프로필/개인 파일·장치·다른 OS는 **미실행**입니다.

### 4. 미구현 및 알려진 문제

기존 c6222e5 GUI의 Ctrl+Z/Y 실패는 e745059 수정본에서 사용자 수용까지 확인했습니다. 테스트 프로필/기존 GUI EXE는 보존하며 기본 제품 ZIP을 실행했다고 주장하지 않습니다. 독립 OS·실제 장기 Tauri/장치와 서명 수용은 미완료입니다.

### 5. 다음 작업 계획

수정본 단축키 수용/원격 전체 결과를 Phase5/진행 요약에 반영했습니다. 현재 창/불변 실행 파일을 유지하며 다음 열린 프로젝트 악보 drop의 관리용 복사·취소/오류 보존을 검토합니다. 다른 Windows/실제 장치·서명 등 남은 출시 조건을 완료로 바꾸지 않습니다.

## 후속 — 최신 출력 오류 보존·독립 GUI 수동 검증 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 취소 후 실제 오류를 보존하는 제품 소스c6222e5의 자동 검사/Windows·패키지/보안을 완료했습니다. 실제 GUI는 원본 데이터와 분리한 같은 소스의 검증용 식별자로 열었으며 사용자 요청 이후 원격 입력을 중단하고 사용자가 직접 확인하고 있습니다. 출시 전체/다른 Windows와 장치·전체 RSS 수용은 구분합니다.

### 2. 구현 및 변경 사항

- 제품 변경은 `useScoreExport.ts`의 실제 오류/AbortError·늦은 완료 구분과 추가4개 검사이며 [Phase5 첫 절](PHASE-05.md)에 파일/실패·해결을 기록했습니다.
- `AGENTS.md`11절, `docs/00-SCOPE-AND-DECISIONS.md`: 실제 GUI 마우스/키보드 원격 조작 중단·실행/종료도 사용자 요청·수동 확인 중 창/실행 UI 소스 유지와 독립 CLI 작업 지속을 기록합니다.
- 설치된 Tauri2.12.3/build2.7.2의 TAURI_CONFIG 병합과 app_data_dir 식별자 사용·dataDirectory를 소스로 확인했습니다. 검증용 식별자/제목·별도 WebView 폴더만 바꾸고 실제 제품 소스·CSP/권한은 유지합니다. 원래 제품의 검증 EXE/ZIP은 먼저 불변 폴더에 보존했습니다.
- 자체 GUI 영수증은 `src-tauri/target/runtime-validation/gui-proofs/8d7592482b7a4262a7abd95623b97b7e/proof.json`입니다. GUI EXE SHA256=`1fd7469816737bc6166ededaa3ba1d418510d27aa551d08b05c53e78a7871845`,창=`GuitarLab · 자체 GUI 검증 8d759248`,식별자=`com.guitarlab.validation.gui8d7592482b7a4262a7abd95623b97b7e`입니다. 명시한 새 자체 AppData 폴더만 만들었으며 실행 전 비어 있음/실행 파일의 식별자·제목·SHA를 확인했습니다. 기존 프로필·프로젝트는 열지 않았습니다.

### 3. 테스트 결과

- c6222e5: 대상27개/전체678프론트·타입/lint/포맷·웹1분42초/내장4개·Windows12.34초 **성공**. [Windows40631916894](https://github.com/BomJin2/GuitarLab/actions/runs/40631916894)/job122630020917도 사후 정리까지 **전체 성공**입니다. 원격678프론트(55.63초), 기본252/확장256Rust(57.84/56.45초·각29개 기본 제외), 예제1+1·AI113(2.28초)/도구146(22.159초·건너뜀 없음)·Clippy/MSRV1.90(9.28초)을 확인했습니다.
- `score-export-cancel-error-package-20261028.py`: **성공**,`VERIFIED_NOT_LAUNCHED`. ZIP3,613파일/40,294,070바이트·CRC/SHA·새 압축 해제 후 실제 PS5.1/최소 PATH Python3.12.15 두 번이 성공했습니다. 제품 EXE41,245,696바이트/SHA256=`54c3052383c59e02892c10ab2f42323e289d6819ed1803c87588ff26924087f1`,ZIP SHA256=`58259cbfb013e593c786ac22b702766c515f161f000f435f1f89bd1d9dfbb05f`입니다.
- 검증 폴더 기준 ZIP=`validation-packages/c34f7e55-24b8-4f54-babc-2314b1f91b8b/GuitarLab-validation.zip`,후보=`score-export-cancel-error-candidate-528403e6-63a4-4d5c-b649-5a3106377d7b.json`,영수증=`score-export-cancel-error-package-receipt-10d6e54a-df20-4332-bbb0-3d355b67c9c6.json`,추출=`score-export-cancel-error-roundtrip-6ab76c12-0a40-48c1-be41-ba86302228a8`입니다. 이 제품 패키지는 직접 실행하지 않았고 독립 식별자 GUI EXE와 구분합니다.
- 새 제품 EXE/ZIP Defender **성공**: exit0·위협 없음/전후 SHA 불변,`NotSigned`. 영수증 `score-export-cancel-error-defender-397cf570-0e62-465b-ba0c-5d11bb4de303.json`입니다. 치료/설정 변경·개인 파일 삭제는 하지 않았습니다.
- 독립 GUI 복사 후 기본 개발 EXE는 원래 설정으로 복원했습니다. 빌드15.09초/내장4개 **성공**이며 로그 `gui-default-restore-build-20261028.log`,`gui-default-restore-bundle-20261028.log`입니다. 검증 창은 별도 불변 EXE여서 재실행·화면 초기화 없이 유지했습니다.
- 초기 원격 입력 준비는 `coordinate input geometry is unavailable`와 사용자 입력 감지로 재관측이 필요했고 프로젝트 생성/내용 입력을 자동 검증으로 기록하지 않았습니다. 이후 사용자가 직접 테스트하겠다고 요청해 모든 원격 UI 입력을 중단했습니다.
- 사용자 수동 확인 **성공**: ‘GUI 확인’ 프로젝트 생성,빈 악보에 프렛3 추가,미저장 X→계속 편집 후 창/프로젝트/3 보존,프로젝트 저장/다시 열기 후 카피 화면/3 보존. 키보드 Undo/Redo는 사용자가 **실패**를 확인했고 되돌리기 버튼은3으로 복원됐습니다. 이후3을 저장하고 창을 닫음은 **사용자 확인 성공**입니다. 초점 수정은 Phase5 첫 절의 새 소스로 구분합니다. 입력/모니터/REC를 요청하지 않았습니다.
- 실제 기본 제품 프로필/개인 악보 출력·실제 디스크 부족·CPAL/장기 GUI RSS/별도 OS: **미실행**. 독립 프로필의 GUI 수용과 실제 제품 EXE 전체 수용·앞선 DSP 자식 메모리 관측을 혼용하지 않습니다.

### 4. 미구현 및 알려진 문제

검증용 프로젝트는 별도 프로필에만 있으며 기존 GuitarLab 라이브러리로 옮기지 않았습니다. 검증 프로필/자체 자료는 보존하고 자동 삭제하지 않습니다. 키보드 실패와 사용자 저장/창 닫힘 확인을 분리해 기록하며 프로세스 종료 코드/기본 프로필의 동작은 별도입니다. 기본9개/부분5개와 독립 정답/별도 Windows·서명 수용은 유지합니다.

### 5. 다음 작업 계획

사용자의 키보드 실패와 저장/종료 결과를 기록했고, 새 초점 수정/검증 후 직접 재확인을 요청합니다. 실제 GUI 조작·실행/종료는 사용자에게 요청하며, 코드/CLI 검사·GitHub Actions·문서화는 독립적으로 진행합니다. 테스트하지 않은 실제 디스크 오류/장치와 전체 출시를 완료로 바꾸지 않습니다.

## 후속 — 악보 출력 검증과 합성 DSP 지속 관측 (2026-10-28)

### 1. 작업 개요

작업일2026-10-28. 악보 출력 수명 수정ca90f4a의 로컬/독립 패키지·보안 검증을 완료했고 원격도 전체 성공했습니다. 이어 실제 장치를 사용하지 않는 합성 DSP 지속 처리/Windows 프로세스 메모리 관측 도구를 추가해1초·300초 관측과 로컬 자체 검사를 완료했습니다. 새 도구9fce425의 원격도 사후 정리까지 전체 성공했습니다. 실제 장치/GUI 수용과 출시 전체 완료로 확대하지 않습니다.

### 2. 구현 및 변경 사항

- 제품 변경은 `useScoreExport.ts`, `scoreExport.ts`, `ScoreEditor.tsx`, `ScoreHistoryPanel.tsx`와 신규12개 검사이며 [Phase5 첫 절](PHASE-05.md)에 상세 파일/실패·해결을 기록했습니다. 기존 도구로 새 Windows/ZIP 후보를 만들었습니다.
- `scripts/probes/synthetic_detector.rs`: 제품 `src-tauri/src/audio/dsp.rs`를 직접 포함해 자체 패턴을 실제 시간으로 공급하고 출력·구간 작업 시간/스케줄 초과를 관측합니다. 별도 장치·파일 녹음이나 Tauri 명령을 추가하지 않습니다.
- `scripts/Observe-SyntheticDetector.ps1`: 새 UUID 검증 폴더에만 도구를 빌드하고 생성한 자식의 working set/private bytes·CPU를 관측합니다. 소스 해시/요청 길이·결과를 확인하고 시간 초과/실패 시 자신이 만든 자식만 종료합니다.
- `scripts/test_synthetic_detector_probe.py`:1초 paced 실행/요청 프레임·잘못된 범위/인자 수를 검사합니다. `docs/09`와 진행 요약에 의미/한계와 재개 위치를 기록합니다. 앱 엔진/의존성/개인 오디오는 변경하지 않습니다.

### 3. 테스트 결과

- ca90f4a: 대상23개·전체674프론트/125파일(38.44초)·타입/lint/포맷·웹2분/내장4개·Windows12.83초 **성공**. [Windows40628569772](https://github.com/BomJin2/GuitarLab/actions/runs/40628569772)/job122619308273는 사후 정리까지 **전체 성공**입니다. 원격674프론트(66.08초), 기본Rust252/확장256(50.42/48.42초·각29개 기본 제외), 예제1+1·AI113(1.85초)/기존 도구143(14.871초)·Clippy/MSRV1.90(7.39초)입니다. 새 관측 도구3개는 이 커밋 이후의 별도 검사입니다.
- `score-export-lifecycle-package-20261028.py`: **성공**,`VERIFIED_NOT_LAUNCHED`. ZIP3,613파일/40,293,692바이트·CRC/SHA·새 추출/실제 PS5.1·최소 PATH Python3.12.15 두 번을 확인했습니다.
- EXE41,245,696바이트/SHA256=`eb8291a9a897438a37c08b40efc6663e7b3025efc4f43217aa45a7f6f4d0411a`,ZIP SHA256=`99e6e4b4bbc8127dabb9ebd94c85b6c5f15909df94a97610df8cd23897189b6e`입니다. 검증 폴더 기준 ZIP=`validation-packages/ed205eec-fb04-488e-9c33-86fd9c1bb5b8/GuitarLab-validation.zip`,후보=`score-export-lifecycle-candidate-bc5f7e33-5060-4636-b7e1-c9fe37369098.json`,영수증=`score-export-lifecycle-package-receipt-aa8daa18-8df6-4800-98e5-5879c4df9c23.json`,추출=`score-export-lifecycle-roundtrip-1ef65389-e688-47ca-8aa3-2923697b7fb6`입니다.
- 새 EXE/ZIP Defender **성공**: 둘 다 exit0·위협 없음/전후 SHA 불변,`NotSigned`. 영수증 `score-export-lifecycle-defender-8eebfc90-d9ed-43a4-b6d0-51e223bbdf49.json`에 보존합니다. 치료/설정 변경이나 개인 파일 삭제는 하지 않았습니다.
- `python -B -X utf8 -m unittest discover -s scripts -p test_synthetic_detector_probe.py -v`: **3개 성공**,1.906초. PowerShell 구문 검사 **성공**. 실제 PS5.1의1초 실행 **성공**:48,000프레임/100블록·43출력·불연속0,실측1.000414초·2개 메모리 표본입니다. 영수증 `synthetic-detector-b248c88d-2066-4753-81f9-bb482ec26389/observation.json`입니다.
- 실제 PS5.1 `powershell.exe -NoLogo -NoProfile -NonInteractive -File scripts/Observe-SyntheticDetector.ps1 -Seconds 300`: **성공**,실측300.000132초·14,400,000프레임/30,000블록·14,059출력/10,312음정 출력·76onset·인덱스 불연속0/최대 입력값 계수0입니다. 블록 작업 p50/p95/max=0.0037/0.1586/0.4790ms,예약 시각 초과0입니다. 실제 오디오 프레임 drop·왕복 지연을 측정한 값은 아닙니다.
- Windows 프로세스 표본297개: 최대 관측 working set6,119,424바이트/private bytes1,728,512바이트입니다.10초 이후 표본 범위는 각각5,890,048~6,119,424/1,642,496~1,728,512바이트,마지막 표본(299.675초)의 누적 CPU1.6875초입니다. 표본 간 최대값이며 전체 앱의 피크/누수 부재·출시 임계값 수용을 뜻하지 않습니다.
- 영수증 `synthetic-detector-ef937964-c1fe-4927-8f3d-84b352b7aef8/observation.json`,로그 `synthetic-detector-five-minute-20261028.log`에 보존합니다. 관측 기준 Git ca90f4a/새 개발 도구 작업 트리=true,도구 SHA256=`7195e4bd199da71925024bddaa440e172a9d3d0394448b0e64e3f736876232e5`,제품 DSP SHA256=`a1f194af828f270f49a8c990363ae3e6975c983cec0a12c285dab8f754955db7`입니다. 관측 중 두 소스 해시 불변을 확인했습니다.
- 실제 PS5.1의0/301초 요청은 **거부 성공**,새 검증 폴더가 생기지 않았습니다. `rustfmt --edition 2021 --check scripts/probes/synthetic_detector.rs`,`pnpm format:check`는 **성공**. 이미 설치된 Rust1.90의 별도 컴파일/1초 실행도 **성공**,1.000162초/48,000프레임·43출력/불연속0입니다. 기본 툴체인 변경/설치 없이 `synthetic-detector-msrv-b155f43f-c8d4-420d-b574-ed038d636d00`에 보존했습니다.
- `python -B -X utf8 -m unittest discover -s scripts -p "test_*.py"`: **146개 중145개 성공/1개 미실행**,12.230초. 기존 `BackupTests.test_linked_file_is_never_followed`는 이 Windows 계정에 심볼릭 링크 생성 권한이 없어 OSError로 건너뛰었습니다. 해당1개만 다시 실행해 동일 이유를 확인했고 권한/개발자 모드를 바꾸지 않았습니다. 신규 관측3개는 실제 성공입니다.
- 도구 소스9fce425의 [Windows40630442254](https://github.com/BomJin2/GuitarLab/actions/runs/40630442254)/job122625312969: **전체 성공**. 프론트674/125파일(96.53초), 기본Rust252/확장256(55.34/60.22초·각29개 기본 제외), 예제1+1·AI113(3.16초)/도구146(21.354초·원격 건너뜀 없음)·Clippy/MSRV1.90(12.48초)·사후 정리를 확인했습니다.
- 이후 취소 후 실제 오류 보존은 새 앱 소스의 대상27개/전체678프론트·웹/내장4개/Windows까지 로컬 성공했습니다. 새 Git/원격·ZIP은 Phase5 첫 절을 따르며 위9fce425의 결과를 새 제품 코드에 혼용하지 않습니다.
- 실제 Tauri GUI/CPAL 장치·사용자 녹음/모니터·왕복 지연·앱 전체 RSS/별도 OS: **미실행** — 독립 DSP 관측이며 사용자 앱/장치와 개인 자료는 조작하지 않습니다.

### 4. 미구현 및 알려진 문제

최적화 독립 프로세스는 배포 앱과 빌드/포함 라이브러리·경로가 다릅니다. working set은 공유 페이지를 포함한 Windows 관측값이며 전체 앱 메모리/모든 메모리 누수 부재나 실제 오디오 drop·실시간 채점 지연을 보장하지 않습니다. 소스/패턴·도구/머신에 한정한 관측으로 CPU 격리와 제품 수용 임계값은 별도입니다. 코드 서명/다른 Windows와 Phase7 독립 정답 수용도 미완료입니다. 관측 스크립트의 강제 시간 초과/사용자 중단 경로는 미실행이며 정상·입력 오류·실제 소스/결과 확인과 구분합니다.

### 5. 다음 작업 계획

300초 관측/도구 전체 자체 검사·악보 출력 원격 결과를 기록했습니다. 새 개발 도구9fce425를 Git/원격에 반영해 최종 결과를 확정했습니다. 이후 취소 후 실제 출력 오류 보존은 Phase5 첫 절에서 별도 검증합니다. 추가 개발 도구는 배포물에 포함하지 않으며 실제 GUI·장치/별도 OS 수용은 별도 조건을 따릅니다.

## 후속 — 선택 녹음 작업 수명 후보 검증 (2026-10-28)

### 1. 작업 개요

작업/검증 완료일2026-10-28. Phase4A/사후 분석의 선택 변경·취소 수명 수정 fb7b0a6을 웹/Windows·독립 검증 ZIP으로 확인했습니다. 로컬/보안·원격 전체 검증을 완료했습니다. 기존 기본9개/부분5개와 Phase8 출시 미완료를 유지합니다.

### 2. 구현 및 변경 사항

제품 수정은 `useTakeExport.ts`, `useRecordedPitches.ts`, 신규 회귀16개와 `docs/12`, `09`, `17`이며 [Phase4A 첫 절](PHASE-04A.md)에 재현/동작을 기록했습니다. 기존 빌드/패키지 검증 도구를 재사용해 자체 검증 폴더에만 새 EXE/번들 Python·검증 스크립트/ZIP·영수증을 만들었습니다. 앱 실행·사용자 파일·설치 모델과 원본 녹음은 조작하지 않았습니다.

### 3. 테스트 결과

- 대상26개·전체662프론트/123파일(38.31초)·타입/lint/포맷 **성공**. 최종 웹1분32초·내장4개·Windows13.22초 **성공**입니다. 큰 chunk/MSVC 링크 안내는 기존 경고입니다.
- `python src-tauri/target/runtime-validation/recording-operations-package-20261028.py`: **성공**,`VERIFIED_NOT_LAUNCHED`. 새 ZIP/CRC/SHA·압축 해제 후 실제 PS5.1/최소 PATH Python3.12.15 두 번을 검증했습니다. sourceCommit=`fb7b0a6f33c4f9a5116a8397a95976cd668e948a`입니다.
- EXE **41,245,696바이트**,SHA256=`26ad4b88e602d417db6d78dd8c77ff9b06c126f897b9ce18e4c8187ea8faa226`. ZIP **3,613파일/40,293,889바이트**,SHA256=`4af5dd681d9a96c2fdb6e6f46372d6505405c9d872234322797cef29d7cd7fda`입니다.
- 검증 폴더 기준 ZIP=`validation-packages/356d121f-bfde-4a37-959f-0752bccf3398/GuitarLab-validation.zip`,후보=`recording-operations-candidate-f962b6b1-2b4f-492f-a1bf-098b69292224.json`,영수증=`recording-operations-package-receipt-2928ef55-3784-48ad-87f3-8e8c83aecc0d.json`,추출=`recording-operations-roundtrip-a3accb6f-667c-4ea4-a50d-45fdb99dc6cc`입니다. 로그 `recording-operations-package-check-471a4c9f-eeaa-498a-919c-b296b7e93ead.log`에 실제 PS5.1/Python 검사를 보존합니다.
- [Windows40625741431](https://github.com/BomJin2/GuitarLab/actions/runs/40625741431)/job122610087649: 최종 실제 로그/상태에서 프론트662/123파일(100.33초), 기본Rust252/확장256(56.06/104.78초·각29개 기본 제외), 예제1+1·AI113(2.95초)/도구143(18.878초)·Clippy/MSRV1.90(13.15초)·사후 정리까지 **전체 성공**을 확인했습니다. 이전9106d66의 성공과 구분해 현재 소스를 확정합니다.
- `scan-recording-operations-candidate-20261028.ps1`: **성공**. 새 EXE/ZIP만 `MpCmdRun -Scan -ScanType 3 -File … -DisableRemediation`으로 검사해 둘 다 exit0·위협 없음/전후 SHA 불변입니다. Defender4.18.26090.9/서명1.461.233.0,코드 서명은 `NotSigned`입니다. 영수증 `recording-operations-defender-7255635b-251c-4c95-b84c-79ac77d62358.json`에 기록하며 설정 변경·치료·원본 삭제는 하지 않았습니다.
- 실제 앱 창·새 GUI/청취/입력/REC·장기 RSS·별도 Windows·서명/실제 데이터 교체/삭제: **미실행**. 자동 작업 수명·패키지 검사 범위이며 사용자 환경 수용과 구분합니다. 로컬 전체 Rust/Python/도구 재실행: **미실행** — 엔진/의존성 변경이 없어 원격 회귀로 확인합니다.

### 4. 미구현 및 알려진 문제

검증 ZIP은 실제 다른 Windows의 DLL/WebView2·보안 제품이나 코드 서명 수용을 대신하지 않습니다. 앱/모니터·입력을 시작하지 않았고 실시간 지연/음정 정확도를 새로 보장하지 않습니다. 새 선택에서 이전 작업이 취소 종료 중이면 잠금을 유지합니다.

### 5. 다음 작업 계획

이번 원격/보안 최종 상태와 영수증·문서 정합성을 확인해 결과를 확정했습니다. 이후 남은 실제 GUI/장치·별도 OS/독립 품질·서명/배포 조건은 진행 요약의 재개 기준을 따르며, 같은 코드의 성공 검사를 반복하지 않습니다.

## 녹음 목록·정보 저장 후속 후보 — 2026-10-27

### 1. 작업 개요

작업·검증 완료일 2026-10-27. 녹음 목록/복구 문맥과 정보 변경 중 재생 유지를 두 수직 슬라이스로 검증했습니다. 앞선4243408과 최종9106d66의 원격·독립 ZIP을 확인했고 최신646프론트·웹/Windows·보안 검증을 완료했습니다. Phase8 전체 수용은 미완료입니다.

### 2. 구현 및 변경 사항

제품 파일/실패 재현·해결은 [Phase4A 첫 두 절](PHASE-04A.md)을 따릅니다. 앞선 컨트롤러 후보는 정확한 소스/깨끗한 작업 트리·EXE 지문/고정 runtime을 확인하고 기존 검증기로 새 UUID 폴더/ZIP/추출/영수증만 만들었습니다. 보조 도구/산출물은 ignored `src-tauri/target/runtime-validation/`에 보존하며 사용자 앱/자료·일반 후보 포인터를 변경하지 않았습니다.

### 3. 테스트 결과

- 목록/복구 소스 `424340821b455aef24a393546861c8800f65f4cf`의 [Windows40503288346](https://github.com/BomJin2/GuitarLab/actions/runs/40503288346)/job122186116665는642프론트/252·256Rust(각29개 기본 제외)·예제1+1·AI113/도구143·Clippy/MSRV1.90/사후 정리까지 **전체 성공**입니다. 웹2분4초·내장4개·Windows14.40초도 성공입니다.
- 해당 EXE **41,245,184바이트**, SHA `a05e708ca17b20f26e8e3ed46cabc993a15494b8c8c4827cb11b09373e106603`. ZIP **3,613파일/40,293,800바이트**, SHA `33ea5b5d9adea963b528f012cfd4d155fbd8b77c474838f89755ce02a2f98e3c`입니다. 전체 CRC/SHA·새 추출·실제 PS5.1/최소 PATH Python3.12.15 두 번 **성공**, exit0/`VERIFIED_NOT_LAUNCHED`입니다.
- ZIP `validation-packages/5acb7211-b97a-41e1-b0a4-f6a341d7f3d9/GuitarLab-validation.zip`, 후보 `take-list-context-candidate-dddf1f41-7841-4403-8477-519fd0208252.json`, 영수증 `take-list-context-package-receipt-bad62a5f-ab1d-42c9-b92f-bbffea1dd3e0.json`, 추출 `take-list-context-roundtrip-b6058331-1ec0-42a8-b930-94d8d1c48b58`입니다. 이후 청취 유지 수정 전 후보이며 최신 패키지와 구분합니다.
- 정보 변경 중 재생 유지 후속의 로컬 **646프론트/122파일**, 대상12개·타입/lint/포맷·웹2분2초·내장4개/Windows13.75초 **성공**입니다. 새 소스/원격·두 변경이 포함된 최신 ZIP/보안 검사 결과는 이어 기록합니다.
- 두 수정이 포함된 소스 `9106d66771cde991cc5a5d3c25b58de14e3e0e0f`를 main에 push했습니다. 최신 EXE **41,245,184바이트**, SHA `4e76634678cda3334e0c079c738ecb3ae0d9d4200e0f6ee64e44f4f38cf522dc`. 최신 ZIP **3,613파일/40,293,792바이트**, SHA `44ce75bfe9e386ca316b0d19c20f0bc3192591bac1619c17f468db4376931899`입니다. 전체 CRC/SHA·새 추출·실제 PS5.1/최소 PATH Python3.12.15 두 번 **성공**, exit0/`VERIFIED_NOT_LAUNCHED`입니다.
- 최신 ZIP `validation-packages/cc497daa-adc0-4ac5-9c78-c78ccc1db682/GuitarLab-validation.zip`, 후보 `take-replay-metadata-candidate-009fe353-0149-43a5-b148-679276cd4a3c.json`, 영수증 `take-replay-metadata-package-receipt-22c88a10-c5d6-4050-9b2e-3a8fe33bc6ba.json`, 추출 `take-replay-metadata-roundtrip-f468d45e-00e4-4311-a151-97973142e5a2`입니다. [Windows40505283442](https://github.com/BomJin2/GuitarLab/actions/runs/40505283442)/job122192904415는 진행 중이며 최신 EXE/ZIP만의 보안 검사와 최종 원격 결론을 이어 기록합니다.
- 최신 EXE/ZIP 두 파일만 Defender `-DisableRemediation`으로 검사해 각 exit0/위협 없음/전후 SHA 동일 **성공**입니다. Defender4.18.26090.9·정의1.461.224.0, 실행 파일 **NotSigned**, 영수증 `take-replay-metadata-defender-8331a6cb-f784-4ca0-b9cb-de5c82c83755.json`입니다. 전역 보안 설정·기존 사용자 자료는 변경하지 않았습니다.
- 최신 소스의 원격 실제 로그/상태를 확인해 사후 정리까지 **전체 성공**으로 확정했습니다. 프론트646/122파일·기본Rust252/확장256(각29개 기본 제외)·예제1+1·AI113/도구143·Clippy/MSRV1.90 성공입니다. 상세 시간은 Phase4A 첫 절을 따릅니다. 필수5절/기존 이력·진행 표14개 링크·한국어/공백과 사용 안내의 실제 버튼/입력명4개 일치도 확인했습니다. 이후 결과/안내 문서만 변경하며 제품 소스·검증 패키지는 동일합니다.
- 새 실제 GUI·개인 녹음/메타데이터 복구·청취/REC·새 설치/제거·모델 포함 별도 Windows10/11/다른 백신은 **미실행**입니다. 새 전체 로컬 native/Python/도구 검사는 **미실행** — 변경 없는 엔진의 원격 검증과 구분합니다. 앞선 목록 후보만의 Defender 재검사는 **미실행**이며 최신 통합 후보를 검사합니다.

### 4. 미구현 및 알려진 문제

현재 PC의 ZIP/runtime 검사를 별도 소비자 OS·모델 포함 오프라인 실행으로 확대하지 않습니다. 서명/최종 고지·실제 데이터 교체/영구 삭제·장기 장치/독립 주법 품질과 전체 출시 수용은 미완료입니다. 사용자 개인 파일/앱을 검증 대신 자동 조작하지 않습니다.

### 5. 다음 작업 계획

최신 두 수정의 Git/원격·독립 ZIP/보안 검사와 문서 정합성을 확정했습니다. 결과 문서만 바뀐 뒤 같은 소스의 빌드/모델/패키지 검사를 반복하지 않으며 남은 실제 GUI/장치·별도 OS/독립 품질 조건은 진행 요약을 따릅니다.

## 믹스 문맥 보호 후보의 독립 패키지 — 2026-10-27

### 1. 작업 개요

작업·검증 완료일 2026-10-27. 모델 관리·백업 동의와 믹스 문맥 보호를 포함한 소스 `1586e90b839a6193c4edb62e78c280cd615b4504`의 새 Windows 후보를 검증했습니다. 로컬 빌드/프론트·독립 ZIP·원격/보안 검증을 완료했습니다. Phase8 전체 수용과 실제 새 GUI 검증은 구분합니다.

### 2. 구현 및 변경 사항

제품 변경 파일/실패 재현은 [Phase4B 첫 절](PHASE-04B.md)을 따릅니다. 기존 검증 도구를 재사용해 정확한 소스/깨끗한 작업 트리·EXE 지문·고정 runtime을 확인하고 새 UUID 후보/폴더/ZIP/추출/영수증만 만들었습니다. 산출물과 보조 도구는 ignored `src-tauri/target/runtime-validation/`에 보존합니다. 일반 후보 포인터·기존 패키지·사용자 앱/자료를 변경하지 않았습니다. `docs/21-QUICKSTART.md`에는 실제 백업/검사·새 폴더 추출 순서와 전체 복원 미지원·외부 참조 제외를 추가했습니다.

### 3. 테스트 결과

- 로컬 프론트 **624개/119파일**, 대상32개·타입/lint/포맷·Vite2분22초/내장4개·Windows16.94초 **성공**입니다. 제품 native/Python/도구는 앞선13e9c75와 같으며 앞선 원격 전체/로컬256확장Rust를 새 UI 직접 수용으로 확대하지 않습니다.
- EXE **41,244,672바이트**, SHA `6ebb86074fd9c6737074092b932a6177573a328792c32d118d2a3683960272e9`. ZIP **3,613파일/40,293,961바이트**, SHA `1c3998cc6d96a8eb327cb8e472a66dc0bce3ddac55071bb84f3314053d75ee62`입니다. 전체 CRC/SHA·새 추출과 실제 기본 PS5.1/최소 PATH Python3.12.15 검사 두 번 **성공**, exit0/`VERIFIED_NOT_LAUNCHED`입니다.
- ZIP `validation-packages/f0b50ee9-aa49-439a-bbc9-a0c22d519e7a/GuitarLab-validation.zip`, 후보 `mix-context-candidate-7e8ce9eb-8b64-448d-a96f-4c8cc52ccab3.json`, 영수증 `mix-context-package-receipt-b47d2ff6-147d-49aa-b8c0-7e6e7c4cf89a.json`, 추출 `mix-context-roundtrip-bb0fb25b-9bf2-4917-91a5-6821ce7edf68`입니다. 새 후보를 실행하지 않았고 ZIP에는 기본 runtime만 포함합니다.
- 소스를 main에 push했고 [Windows40498741556](https://github.com/BomJin2/GuitarLab/actions/runs/40498741556)/job122170750934은 진행 중입니다. 최종 EXE/ZIP만 대상으로 하는 Defender 검사도 결과를 이어 기록합니다. 별도 OS/실제 앱과 혼용하지 않습니다.
- 최종 EXE/ZIP 두 파일만 Defender `-DisableRemediation`으로 검사해 각 exit0/위협 없음/전후 SHA 동일 **성공**입니다. Defender4.18.26090.9·정의1.461.224.0, 실행 파일 **NotSigned**, 영수증 `mix-context-defender-8850293f-8f65-4ad5-a7cf-5988c72319bc.json`입니다. 검증 보조 스크립트는 앞선 BOM 수정을 반영했고 이번 실행 오류는 없습니다. 전역 보안 설정/사용자 자료는 변경하지 않았습니다.
- 원격 최종 실제 로그/상태를 확인해 사후 정리까지 **전체 성공**으로 확정했습니다. 프론트624/119파일·기본Rust252/확장256(각29개 기본 제외)·예제1+1·AI113/도구143·Clippy/MSRV1.90이 성공입니다. 상세 시간은 Phase4B 첫 절을 따릅니다. 문서 필수5절/이전 이력·진행 표14개 링크/한국어·공백 및 빠른 시작의 실제 백업 버튼명4개 일치도 확인했습니다. 이후 변경은 결과/사용 안내 문서뿐이며 제품 소스와 검증 ZIP은 그대로입니다.
- 실제 GUI/개인 믹스·청취/REC·새 설치/제거·모델 포함 별도 Windows10/11/다른 백신은 **미실행**입니다. 개인 파일을 자동 분석하거나 모델을 설치/다운로드하지 않았습니다. 새 전체 로컬 Rust/Python/도구 검사는 **미실행** — 변경 없는 엔진의 앞선 성공과 새 소스 원격 결과를 구분합니다.

### 4. 미구현 및 알려진 문제

서명/최종 고지·실제 데이터 교체/영구 삭제·별도 OS/장기 장치·독립 주법 품질 수용은 미완료입니다. ZIP의 무결성/Defender 성공은 전체 악성 여부나 모든 Windows의 실행을 보장하지 않으며 실제 GUI 수용을 대체하지 않습니다. 기존 기본9개/부분5개 경계는 유지합니다.

### 5. 다음 작업 계획

현재 소스의 원격 로그·보안 검사와 문서 정합성을 확정했습니다. 이후 결과 문서만 수정하면 이 소스의 패키지를 다시 만들거나 같은 성공 검사를 반복하지 않습니다. 실제 앱/장치·별도 OS·독립 품질과 배포 범위 등 남은 조건은 진행 요약을 따릅니다.

## 로컬 백업 동의·명령 수명 후속 — 2026-10-27

### 1. 작업 개요

작업·검증 완료일 2026-10-27. 백업 동의 해제 뒤 예전 함수로 실행하거나 화면 이탈 뒤 백업/검사/추출을 시작하는 경계를 수정했습니다. 대상14개·613프론트/타입/lint/포맷·웹/내장/Windows 빌드·Git/원격·최신 패키지 검증을 완료했습니다. 모델 관리 후속 검증과 현재 백업 후보를 구분하고 전체 Phase8은 미완료로 유지합니다.

### 2. 구현 및 변경 사항

- 먼저 `docs/12-API-CONTRACTS.md`, `docs/09-TEST-PLAN.md`에 최신 동의·mount 수명·기존 재시도/취소 정책 보존을 기록했습니다. IPC/DB·백업 native/Python·파일 형식은 변경하지 않습니다.
- `useLocalBackup.ts`: 백업/새 폴더 추출에서 캡처된 과거 값 대신 최신 동의를 확인합니다. 화면 이탈 뒤 모든 실행/동의·취소를 차단하고 취소 뒤 늦은 진행률을 버립니다. 동의는 기존처럼 해제할 때까지 유지하며 실제 작업 종료까지 잠금을 유지합니다.
- `localBackup.ts`: 실제 지원하는 DB v8/v9에 맞춰 BACKUP_DATABASE_VERSION 안내를 수정했습니다. 지원 DB나 복원 정책을 확장한 변경이 아닙니다.
- `useLocalBackup.test.tsx`: 동의 해제/같은 이벤트·화면 이탈·정상 재시도/읽기 전용 검사·늦은 진행률/종료 대기를 검증하는8개 회귀를 추가했습니다. UI 디자인·기존 동의 유지/재시도와 원본 보존 동작은 유지합니다.

### 3. 테스트 결과

- 수정 전 **6개 실패/1개 성공**,2.31초를 재현했습니다. 로그 `backup-command-lifecycle-red-20261027.log`. 수정 후 대상13개 성공에서 취소 진행률 회귀를 추가한 최종 `pnpm exec vitest run src/features/settings/useLocalBackup.test.tsx src/features/settings/LocalBackupPanel.test.tsx src/features/settings/localBackup.test.ts`는 **14개/3파일 성공**,2.48초입니다.
- `pnpm typecheck`, `pnpm lint`: **성공**. `pnpm test`: **613개/119파일 성공**,33.70초. `pnpm format:check`: **성공**. `pnpm build`: **성공**,Vite1분31초/기존 큰 chunk 안내. `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests` **4개 성공**·`cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol` **성공**,11.56초/기존 MSVC 링크 안내입니다. 로그 `backup-command-lifecycle-…-20261027.log`에 보존합니다.
- 앞선 모델 관리 소스 `e43f3fcc65d619cc74ea2a6650f1f6a58b870ea6`는605프론트/35개 대상·타입/lint/포맷·Vite1분52초·내장4개(컴파일34.23초)/Windows12.06초가 성공입니다. 새 ZIP3,613파일/40,293,803바이트·CRC/SHA·새 추출·실제 PS5.1/최소 PATH Python3.12.15 두 번도 성공이며 앱은 실행하지 않았습니다. 이 후보는 현재 백업 수정 전이므로 최신 후보로 혼동하지 않습니다.
- 위 모델 관리 EXE41,244,672바이트/SHA `b84cf423690d6a7e8dd241f858c8d1cb838a36dee0a829e1baa8d6983d8489e6`, ZIP SHA `9c620b9d7f35a6e686fde002f7db412548c87878746a5267f6be8f71d74b512a`. ZIP `validation-packages/dccc9438-afa1-43f3-9b94-bd6703adc714/GuitarLab-validation.zip`, 영수증 `model-command-lifecycle-package-receipt-6751514a-6369-42f0-ae4e-2d17e13a92ee.json`입니다. 보조 도구/산출물은 ignored `src-tauri/target/runtime-validation/`에만 생성했습니다.
- 백업 포함 소스 `13e9c75063107032f611b828ff29dec83a2160ce`의 최신 EXE **41,244,672바이트**, SHA `bdcbfaba087861bc7a750ebb4f438e3db5d0706706e8d8ad247e0952bf7c5d70`. 최신 ZIP **3,613파일/40,294,122바이트**, SHA `ee8728507bc456b3afd18b654192c98d10871a2c51b57ef518da1d6a04b62d75`입니다. 전체 CRC/SHA·새 추출과 실제 PS5.1/최소 PATH Python3.12.15 두 번 **성공**, exit0/`VERIFIED_NOT_LAUNCHED`입니다. ZIP `validation-packages/ed398868-b05e-43fc-af9f-c935aafad3f9/GuitarLab-validation.zip`, 후보 `backup-command-lifecycle-candidate-2acfa7b6-d243-4f5c-9ab9-f8a00841c9f1.json`, 영수증 `backup-command-lifecycle-package-receipt-885b61a2-9bcf-4955-ae1f-ba6a0eccf219.json`, 추출 `backup-command-lifecycle-roundtrip-ca13501f-621b-4f4f-8c0d-312e25bbdc72`입니다. 이 후보에는 모델 관리·백업 수명 수정이 함께 포함됩니다.
- 원격 확장 Rust 단계 지연을 확인하기 위해 동일 구성 `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml -- --nocapture`를 로컬 추가 실행해 **256개 성공/29개 기본 제외**,11.53초를 확인했습니다. 원격 확장도171초 뒤 성공했으며 교착/실패로 기록하지 않습니다. 로그 `model-command-lifecycle-rust-extended-20261027.log`. 해당 실행의 제품 엔진은 백업/모델 관리 전과 동일하며 문서의 전체 로컬 Rust 미실행은 이 추가 검사 전 이력입니다.
- 최신 EXE/ZIP만 Defender의 `-DisableRemediation`으로 검사해 각 exit0/위협 없음/전후 SHA 동일 **성공**입니다. Defender4.18.26090.9·정의1.461.224.0, 서명 **NotSigned**, 영수증 `backup-command-lifecycle-defender-6f76da50-c664-4dd7-b8be-788652028764.json`입니다. 보조 스크립트 첫 실행에서 중복 BOM으로 첫 `$ErrorActionPreference` 설정 오류가 났습니다. 처음 생성된 검사 영수증과 별개로 BOM을 한 개로 고쳐 오류 시 중단 설정을 적용한 재검사도 성공했으며 실패 출력/초기 영수증을 보존했습니다. 제품 코드나 전역 보안 설정 오류/변경은 아닙니다.
- 앞선 모델 관리 [Windows40495120166](https://github.com/BomJin2/GuitarLab/actions/runs/40495120166)/job122158712331은605프론트/252·256Rust·AI113/도구143·예제1+1·Clippy/MSRV1.90/사후 정리까지 **전체 성공**입니다. 종료 확인 후 백업 소스13e9c75를 push했고 [Windows40496717991](https://github.com/BomJin2/GuitarLab/actions/runs/40496717991)/job122163908545은 진행 중입니다. 두 소스를 혼용하지 않으며 백업 후보의 원격 결론은 이어 확정합니다.
- 백업 소스의 최종 실제 로그/상태를 확인해 사후 정리까지 **전체 성공**으로 확정했습니다. 프론트613/119파일(88.39초), 기본Rust252/확장256(53.04/52.78초·각29개 기본 제외), 예제1+1·AI113(4.78초)/도구143(38.936초)·Clippy/MSRV1.90이 성공입니다. 위 원격 진행 중은 확정 전 이력이며 이어 개발하는 믹스 문맥 보호 소스와 구분합니다.
- 새 실제 GUI·개인 DB/녹음의 백업 생성/검사/추출·실제 설치/다운로드·별도 OS 수용은 **미실행** — 모의 서비스로 명령 수명을 검증하며 사용자 앱/자료를 조작하지 않았습니다. 전체 로컬 Python/도구 재실행은 **미실행** — 해당 엔진과 의존성 변경이 없습니다. 앞선 모델 관리 ZIP의 별도 Defender 재검사는 **미실행**이며 모든 수정이 포함된 최종 후보 검사와 구분합니다.

### 4. 미구현 및 알려진 문제

백업 미리보기는 계속 새 폴더 추출만 제공하며 현재 앱 데이터를 교체하는 전체 복원은 구현하지 않습니다. 영구 삭제·서명/별도 Windows·실제 장치·독립 품질 수용도 미완료입니다. 동의 해제는 이미 시작한 작업의 자동 취소를 뜻하지 않으며 진행 중에는 기존 취소/종료 대기 절차를 사용합니다.

### 5. 다음 작업 계획

이 백업 슬라이스의 전체/빌드·Git/원격·독립 ZIP/보안 검증을 완료했습니다. 다음 믹스 문맥 보호는 Phase4B 최신 절에서 별도로 진행하며 이전 후보의 결과를 새 소스의 성공으로 기록하거나 사용자 앱을 임의로 종료하지 않습니다. 실제 데이터 교체·별도 OS/서명·독립 품질 수용 경계는 유지합니다.

## 사용자 기타 AI 입력 후보의 독립 패키지 — 2026-10-27

### 1. 작업 개요

작업·검증 완료일 2026-10-27. 사용자 제공 기타 WAV의 AI 입력과 목록 취소 UI를 포함한 소스 `9e81b3e18f7e8e7076ed970778415dae1de46eb3`의 Windows 실행 파일·독립 ZIP·원격 회귀를 확인했습니다. 이 후보의 검증은 완료이며 Phase8 전체 출시 수용은 진행 중입니다.

### 2. 구현 및 변경 사항

제품 파일·계약·오류 수정은 [Phase6 첫 절](PHASE-06.md)을 따릅니다. 기존 패키지 검증기를 재사용한 `imported-ai-final-package-20261027.py`와 Defender 보조 도구는 정확한 커밋/작업 트리·고정 runtime·EXE 지문을 확인하고 자체 UUID 폴더/ZIP/추출/영수증만 생성했습니다. 보조 도구와 아래 산출물은 ignored `src-tauri/target/runtime-validation/`에 보존합니다. 일반 후보 포인터·사용자 앱/프로젝트·개인 음원은 변경하지 않았습니다.

### 3. 테스트 결과

- 로컬 최종 프론트 **582개/117파일**, 타입/lint/포맷·Vite53.01초·내장 자산/권한 **4개**·Windows 빌드12.62초 **성공**. 이 UI 후속의 Rust/Python/도구는 직전706f513과 동일하며 해당 전체 Rust256개/29개 기본 제외·Clippy/MSRV 성공을 유지합니다.
- [Windows40434282512](https://github.com/BomJin2/GuitarLab/actions/runs/40434282512)/job121959126180은 사후 정리까지 **전체 성공**입니다. 실제 로그에서 프론트582·기본Rust252/확장256(각29개 기본 제외)·예제1+1·AI113/도구143·Clippy/MSRV1.90을 확인했습니다.
- EXE **41,244,160바이트**, SHA `9daf94df5d7ebfe3403ace37dd022d8665bc7f27dbe7eb659241503538cc85fa`. ZIP **3,613파일/40,293,985바이트**, SHA `080322bb062987744ca7f35bd737e04b16bd2dfbcc76fbe10b893f356da9f59a`입니다. 전체 CRC/SHA·새 추출과 실제 기본 PowerShell5.1/최소 PATH Python3.12.15 검사 두 번 **성공**, exit0/`VERIFIED_NOT_LAUNCHED`입니다.
- ZIP `validation-packages/c08afead-1e95-4d0c-9524-208f62907640/GuitarLab-validation.zip`, 후보 `imported-ai-final-candidate-6a686750-44a0-4e77-95b6-f43c7a62c4ff.json`, 영수증 `imported-ai-final-package-receipt-b3b11ec7-49ad-4109-9678-e23d151be13d.json`, 추출 `imported-ai-final-roundtrip-6a00fe62-57f3-470a-acec-3d1d6339ab79`입니다.
- `scan-imported-ai-final-candidate-20261027.ps1`: 자체 EXE/ZIP 두 파일만 `-DisableRemediation`으로 검사해 각 exit0/위협 없음/전후 SHA 동일 **성공**. Defender4.18.26090.9·정의1.461.215.0이며 실행 파일은 **NotSigned**입니다. 영수증 `imported-ai-final-defender-f39a170e-4b5b-4b39-8314-c29bfe6c319f.json`. 전역 보안 설정은 변경하지 않았습니다.
- 자체8음의 native 입력·초안 복원과 이미 승인 설치된 Python3.12.15·Basic Pitch0.4.0에서 자체 float32 WAV의 실제8음 추론 **성공**입니다. 상세 명령·보조 도구 오류/해결·범위/영수증은 Phase6 첫 절을 따릅니다. ZIP에는 기본 runtime만 포함하며 설치 모델 포함 검증이나 다른 OS의 추론을 뜻하지 않습니다.

### 4. 미구현 및 알려진 문제

실제 새 GUI의 파일 선택/분석/적용·재실행 수용, 개인 기타 정확도/실제 청취·모델 포함 별도 Windows10/11·다른 백신·설치/제거 재수용은 **미실행**입니다. 서명/최종 고지 검토·실제 데이터 교체/영구 삭제·고급 판정 품질 등 기존 남은 조건을 유지합니다. GitHub Windows Server 성공을 깨끗한 소비자 Windows10/11 수용으로 대체하지 않습니다.

### 5. 다음 작업 계획

이 후보의 자동 검사·패키지 검증과 결과 문서화를 확정합니다. 다음 별도 OS/서명·실제 Tauri/장치·독립 품질 수용은 [진행 요약](README.md)의 재개 기준을 따릅니다. 이후 결과 문서만 수정하면 이9e81b3e 패키지를 다시 만들거나 같은 소스 검사를 반복하지 않습니다. 기존 설치/원본·프로젝트는 보존합니다.

## 결과 조회 후보의 독립 패키지 — 2026-10-27

### 1. 작업 개요

작업·검증 완료일 2026-10-27. 결과 조회 수정 소스 `160101e0709d8737ebf27a2a56c9395f08e5ad29`의 Windows 실행 파일과 독립 ZIP을 검사했습니다. 로컬 패키지와 새 원격 회귀는 모두 성공입니다. 앱 실행·별도 깨끗한 OS·최종 출시 수용으로 확대하지 않습니다.

### 2. 구현 및 변경 사항

제품 코드/문서 변경은 [Phase4 첫 절](PHASE-04.md)을 따릅니다. 기존 검증기를 재사용한 `results-query-package-20261027.py`에 정확한 Git 커밋·깨끗한 작업 트리·EXE SHA/크기·고정 runtime을 확인하게 하고 새 UUID 후보/폴더/ZIP/추출/영수증만 생성했습니다. 보조 도구/산출물은 ignored `src-tauri/target/runtime-validation`에 보존하며 일반 후보 포인터·기존 사용자 앱/데이터를 바꾸지 않았습니다.

### 3. 테스트 결과

- 프론트 **561개/115파일**, 타입/lint/포맷·Vite 1분55초/내장 **4개**·Windows 13.92초 **성공**. 이번 로컬 전체 Rust/AI/도구 재실행은 **미실행**이며 변경 없는 기존 8a18f1f의 기준과 구분합니다.
- 새 EXE **41,237,504바이트**, SHA `2c6a6d66e262727f1111f6795e9bbc13b3b1113ca51d9242913354c99572e428`. ZIP **3,613파일/40,290,355바이트**, SHA `aa59b9e6591015a8a15251ddc2da092ab9009ca6b718ff0431634b1d0d950b45`입니다. 전체 CRC/SHA·새 추출과 실제 기본 PowerShell 5.1/최소 PATH의 Python 3.12.15 검사 두 번 **성공**, exit0/`VERIFIED_NOT_LAUNCHED`입니다.
- 검증 폴더 안 ZIP은 `validation-packages/8e03da25-8a74-4133-810d-9169d6fc2d48/GuitarLab-validation.zip`, 후보는 `results-query-candidate-c1455928-3bd9-4860-b419-9cb2475f783c.json`, 영수증은 `results-query-package-receipt-acb83fe7-465a-4693-902d-f5c8209c1f3d.json`, 추출은 `results-query-roundtrip-67d8dea6-a9c2-4fed-9083-6500f8189cec`입니다.
- `scan-results-query-candidate-20261027.ps1`: 자체 EXE/ZIP 두 파일만 `-DisableRemediation`으로 검사해 각 exit0/위협 없음/전후 SHA 동일 **성공**. Defender 4.18.26090.9·정의 1.461.215.0이며 `NotSigned`입니다. 영수증 `results-query-defender-5b5f8d99-fbe6-48c8-9cbb-1a2af5c95338.json`. 전역 보안 설정은 변경하지 않았습니다.
- 문서 필수 5절·이전 Phase4 이력 전체 보존·진행 표 14개 결과 문서 링크와 차이의 한국어/공백 검사를 확인했습니다. [Windows40425714551](https://github.com/BomJin2/GuitarLab/actions/runs/40425714551)/job121930836757은 사후 정리까지 **전체 성공**입니다. 프론트561/기본Rust249·확장253(각28개 기본 제외)/예제1+1·AI113/도구143·Clippy/MSRV1.90을 실제 로그로 확인했으며 세부 시간은 Phase4 첫 절을 따릅니다.

### 4. 미구현 및 알려진 문제

실제 새 앱/개인 기록·캡처/청취·모델 포함 별도 Windows 10/11·다른 백신·설치/제거 재수용은 **미실행**입니다. 이번 ZIP은 기본 runtime만 포함하며 모델이 설치됐다고 주장하지 않습니다. 서명/최종 고지 검토·데이터 교체/영구 삭제·고급 판정 품질 등 기존 외부 수용 조건과 9단계 기본 완료·5단계 부분 완료를 유지합니다.

### 5. 다음 작업 계획

새 원격 회귀의 실제 로그/최종 결론까지 확정했습니다. 기존 성공한 코드와 새 후보·실제 사용자 수용을 구분하고, 새 변경 없이 같은 로컬 검사를 반복하거나 기존 사용자 앱을 재시작하지 않습니다. 남은 Phase의 별도 OS/독립 정답·모델 허가/배포 범위 등 외부 재개 조건은 진행 요약의 표를 따릅니다.

## 저장 조회 문맥 보호 독립 패키지 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26.8a18f1fbb460b3a33d24d62c7852835ab6d9150d의 저장 조회 문맥 보호를 새 독립 패키지로 검사했습니다. 로컬/원격 검사는 완료이며 [Windows40332164724](https://github.com/BomJin2/GuitarLab/actions/runs/40332164724)/job121604103210은 전체 success입니다. 실제 새 앱/개인 이력·별도 OS 수용과 구분합니다.

### 2. 구현 및 변경 사항

Git 깨끗함/정확한 커밋·실행 파일/고정 runtime3393파일 전체 SHA를 확인하고 기존 검증기로 새 UUID 후보·ZIP·추출/영수증만 만들었습니다. 일반 후보·기존 앱/패키지나 사용자 자료는 교체하지 않았습니다. 자체 도구/산출물은 ignored `src-tauri/target/runtime-validation`에 보존합니다.

### 3. 테스트 결과

- `history-context-package-20261026.py` **성공**, VERIFIED_NOT_LAUNCHED. EXE41,236,992바이트/SHA `770961d9e94b4d40622f052662d22842227108f59d9ac9d595d4241210883261`, ZIP3613파일/40,289,977바이트/SHA `9d3c88cbade90b51a93d3adc821d2bcb1c48b37490628e4cff0ed55a5dd3a8e8`입니다. 전체CRC/지문·새 추출 동일성·실제 기본PowerShell5.1/최소PATH 독립Python3.12.15 두 번 **성공**,exit0입니다.
- ZIP은 `validation-packages/61e0eace-e1e1-4b90-88f6-c0a04374c127/GuitarLab-validation.zip`, 후보는 `history-context-candidate-eb043ede-c5a8-4f0e-90ea-a7a3c637b5a5.json`, 영수증은 `history-context-package-receipt-6ce87859-655f-4c22-ac09-fc9c9663dada.json`입니다. frontend546/내장4개와 전체localRust 미실행·10a3e72의253 기준을 구분했습니다.
- `scan-history-context-candidate-20261026.ps1` **성공**. 지정 EXE/ZIP 각각 exit0/위협 미검출·전후 SHA 동일, Defender4.18.26090.9/정의1.461.211.0·remediation 비활성·설정 변경 없음입니다. `history-context-defender-e1f3f5dd-6df0-4891-a4d7-48ebfff2ab90.json`에 NotSigned/검사 범위를 기록했습니다.
- 실제 새 앱/개인 이력·파일·입력/모니터/REC·브라우저 DEMO와 별도 Windows10/11·서명/다른 백신/최종 설치기 수용은 **미실행**입니다. native/Python/개발 도구는 검증한10a3e72와 동일하며 새 원격 결론은 후속으로 확정합니다.

### 4. 미구현 및 알려진 문제

현재 PC의 무서명 개발 후보 검사이며 별도 OS/실제 사용자 화면 전환·개인 자료/출시 전체 완료가 아닙니다. 프로젝트 문맥 보호를 전체 프로젝트 복원/이전 버전 적용 기능으로 확대하지 않습니다.

### 5. 다음 작업 계획

8a18f1f의 원격 전체 결과와 진행표/최신 문서 정합성을 확정합니다. 기본9단계/부분5단계와 남은 별도 OS·특화 모델/고급 주법 품질·서명/실제 데이터 작업의 수용 조건은 유지합니다.

후속 확정: 위 원격 **전체 success**,실제546프론트/249기본·253확장Rust(각 제외28개)·예제1+1·AI113/도구143·Clippy/MSRV1.90·사후 정리를 확인했습니다. 14개 Phase 행/고유 결과 파일·최신5절·과거 이력/한국어 신규 문서·CRLF 허용 diff check도 성공입니다. 최종 계약/진행 문서는 검증한 프로젝트 전환→같은 ID 복귀 범위를 구체화하고 결과만 확정했으며 제품 코드/사용자 자료를 추가 변경하지 않았습니다. 실제 새 앱/별도 OS 수용은 완료로 바꾸지 않습니다.

## PC 기본 입력 선택 독립 패키지 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26.10a3e721eb1de60ced9f05c0341f5092c673e827의 PC 기본 입력 선택을 새 독립 패키지로 검사했습니다. 로컬/원격 검사는 완료이며 [Windows40327472732](https://github.com/BomJin2/GuitarLab/actions/runs/40327472732)/job121587803841은 전체 success입니다. 실제 앱의 캡처/청취와 별도 OS·출시 수용은 미실행입니다.

### 2. 구현 및 변경 사항

기존 고정 runtime3393파일/패키지 검증기를 재사용하고 Git 깨끗함/정확한 커밋·실행 파일과 런타임 전체 SHA를 확인했습니다. 새 UUID 후보/ZIP/추출·영수증만 만들었으며 기존 앱/패키지·일반 후보나 사용자 자료는 교체하지 않았습니다. 자체 산출물은 ignored `src-tauri/target/runtime-validation`에 보존합니다.

### 3. 테스트 결과

- `default-input-package-20261026.py` **성공**, VERIFIED_NOT_LAUNCHED. EXE41,236,992바이트/SHA `206ed5549e8082de96a46a68d2f308089bfa49b80ddbaa72955df991d3108d8c`, ZIP3613파일/40,289,763바이트/SHA `5b2d5182ab6525d5a9b28b76133b38c08ab4c73eb2cd363735f1622c2343c6d2`입니다. 전체CRC/지문·새 추출 동일성·실제 기본PowerShell5.1/최소PATH 독립Python3.12.15 두 번 **성공**,exit0입니다.
- ZIP은 `validation-packages/329df692-889c-4a23-a9aa-7d81bf1c2c9e/GuitarLab-validation.zip`, 후보는 `default-input-candidate-123c57d4-1932-47c8-92e2-009f73200d58.json`, 영수증은 `default-input-package-receipt-42a70680-6327-4ee9-b634-eee5c73a03aa.json`입니다. frontend542/실제 전체localRust253·내장4개와 실제 읽기 전용 열거1개를 구분했습니다.
- `scan-default-input-candidate-20261026.ps1` **성공**. 지정 EXE/ZIP 각각 exit0/위협 미검출·전후 SHA 동일, Defender4.18.26090.9/정의1.461.211.0·remediation 비활성·설정 변경 없음입니다. `default-input-defender-5318052e-fd6f-480f-b756-f735ac6068f5.json`에 NotSigned/검사 범위를 기록했습니다.
- 실제 앱의 새 선택 UI/캡처·청취·모니터/REC·개인 자료, 새 브라우저 DEMO·별도 Windows10/11·서명/다른 백신/최종 설치기 수용은 **미실행**입니다. 현재 PC 입력 열거1개 성공을 실제 캡처/청취 검증으로 확대하지 않습니다. 새 원격 전체 결론은 후속으로 확정합니다.

### 4. 미구현 및 알려진 문제

현재 PC의 무서명 개발 후보 검사이며 별도 OS/실제 앱 캡처·청취/출시 전체 완료가 아닙니다. PC 기본 입력과 기타가 연결된 장치가 다를 수 있어 사용자가 실제 입력·채널을 확인하고 시작해야 합니다.

### 5. 다음 작업 계획

10a3e72의 원격 전체 결론과 진행표/최신 결과 문서를 확정합니다. 기본9단계/부분5단계와 기존 별도 OS·특화 모델/고급 주법 품질·서명/실제 데이터 작업의 미수용 조건은 유지합니다.

후속 확정: 위 원격 **전체 success**,실제542프론트/249기본·253확장Rust(각 제외28개)·예제1+1·AI113/도구143·Clippy/MSRV1.90·사후 정리를 확인했습니다. 14개 Phase 행/고유 결과 파일·최신5절·과거 이력/한국어 신규 문서·CRLF 허용 diff check도 성공입니다. 위 원격 대기는 확정 전 이력이며 이후 변경은 결과 문서뿐입니다. 실제 새 앱/별도 OS 수용은 완료로 바꾸지 않습니다.

## 입력 설정 유지 독립 패키지 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26.7dd566aea6b18442105b6167f3b998f9298beddb의 입력 설정 유지 수정을 새 독립 패키지로 검사했습니다. 로컬/원격 검사는 완료이며 [Windows40322363438](https://github.com/BomJin2/GuitarLab/actions/runs/40322363438)/job121570231824는 전체 success입니다. 실제 사용자 앱/장치와 별도 OS 수용은 미실행입니다.

### 2. 구현 및 변경 사항

기존 고정 런타임/패키지 검증기를 재사용해 새 UUID 후보·ZIP·영수증만 만들었습니다. Git 깨끗함/정확한 커밋·실행 파일/3393개 런타임 SHA를 확인하고 기존 앱/패키지·일반 후보나 사용자 데이터를 교체하지 않았습니다. 자체 산출물은 ignored `src-tauri/target/runtime-validation`에 보존합니다.

### 3. 테스트 결과

- `input-selection-package-20261026.py` **성공**, VERIFIED_NOT_LAUNCHED. EXE41,234,944바이트/SHA `9700c6933b6c4da2654edf7f94a70d9339900b88d170150f2f8b852044e0e670`, ZIP3613파일/40,289,259바이트/SHA `dfb65522561729e073a525ced565d41e9b9caf4ba438fdf85068ef35b7dfa48c`입니다. 전체CRC/지문·새 추출 동일성·실제 기본PowerShell5.1/최소PATH 독립Python3.12.15 두 번 **성공**,exit0입니다.
- ZIP은 `validation-packages/95d7e280-732a-47af-9a74-c753bea131ee/GuitarLab-validation.zip`, 후보는 `input-selection-candidate-1eb119d9-df00-4b26-b4d9-ef3e98b30eda.json`, 영수증은 `input-selection-package-receipt-4e792218-37bc-49fe-839a-bc5fd02cee4c.json`입니다. frontend537/bundle4와 전체localRust 미실행·변경 없는253 기준을 구분했습니다.
- `scan-input-selection-candidate-20261026.ps1` **성공**. 지정 EXE/ZIP 각각 exit0/위협 미검출·전후 SHA 동일, Defender4.18.26090.9/정의1.461.211.0·remediation 비활성·설정 변경 없음입니다. `input-selection-defender-b864dd35-db46-44e2-a7bd-8ccfee93fd0c.json`에 NotSigned/검사 범위를 기록했습니다.
- 실제 사용자 앱/장치·입력/모니터/REC·파일 선택, 별도 Windows10/11·서명/다른 백신/최종 설치기 수용은 **미실행**입니다. 새 원격 전체 결론은 후속으로 확정하며 이전2c33c77의 성공을 새 소스 성공으로 대신하지 않습니다.

### 4. 미구현 및 알려진 문제

같은 PC의 무서명 개발 패키지 검사이며 별도 OS/실제 장치 수용·출시 전체 완료가 아닙니다. 새 입력 설정 유지의 실제 SSL 재진입/중단 청취는 자동/DEMO 검사와 별도로 미실행입니다.

### 5. 다음 작업 계획

7dd566a의 원격 전체 결론과 진행표/최신 결과 문서를 확정합니다. 기본9단계/부분5단계 및 별도 OS·특화 모델/주법 품질·서명/실제 데이터 작업의 미수용 조건은 유지합니다.

후속 확정:7dd566a의 위 원격은 **전체 success**이며 실제537프론트/249기본·253확장Rust(각 제외28개)·예제1+1·AI113/도구143·Clippy/MSRV1.90/사후 정리를 확인했습니다. 진행표14개 고유 Phase/결과 파일·최신5절·기존 Phase3/8 이력 보존·CRLF 허용 diff check도 성공입니다. 위 원격 진행 중은 이 확정 전 이력입니다. 최종 결과 문서는 실행 파일/패키지의7dd566a 코드와 구분하며 추가 제품/데이터 변경은 없습니다.

## 원본 기반 TAB 독립 패키지 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26. 원본 기반 저장 TAB의2c33c7757efc2c0dfac8e537cc683d80964bdefd를 독립 패키지로 검사했습니다. 로컬 검사는 완료이고 [Windows40292589404](https://github.com/BomJin2/GuitarLab/actions/runs/40292589404)/job121470920653의 전체 결론은 진행 중입니다. 실제 앱/별도 OS·출시 수용과 구분합니다.

### 2. 구현 및 변경 사항

기존 검증 도구를 재사용해 새 UUID 폴더/ZIP만 만들었습니다. Git 깨끗함/정확한 커밋·EXE/고정 runtime3393파일의 전체 지문을 확인했으며 제품 코드/기존 패키지·일반 후보/사용자 앱·데이터는 교체하지 않았습니다. 모든 자체 도구/영수증은 ignored `src-tauri/target/runtime-validation`에 보존합니다.

### 3. 테스트 결과

- `revision-original-package-20261026.py` **성공**, VERIFIED_NOT_LAUNCHED. EXE41,234,432바이트/SHA `91b2f84d6ac7ceaaca4aff3ba7d16ad0e865c10332d01562f1c419038932289e`, ZIP3613파일/40,288,746바이트/SHA `1877aa49cc45c0fa69dbc38da3ea3d52995f46f344dfa545a9fdd9757f102bd7`입니다. 전체 CRC/지문·새 추출 동일성과 실제 기본PowerShell5.1/최소PATH 독립Python3.12.15 두 번이 **성공**,exit0입니다.
- ZIP 경로는 `validation-packages/54dc5ef5-1090-47fe-8822-604220a5f13f/GuitarLab-validation.zip`, 후보는 `revision-original-candidate-c595f11c-495c-4eb6-b19a-1004e1c18bc0.json`, 영수증은 `revision-original-package-receipt-8c917f05-b67a-4748-a707-7f2b0b351879.json`입니다. frontend534/bundle4를 기록하고 전체 localRust 미실행·변경 없는253 기준과 구분했습니다.
- `scan-revision-original-candidate-20261026.ps1` **성공**. 지정 EXE/ZIP 각각 exit0/위협 미검출·전후 SHA 동일, Defender4.18.26090.9/정의1.461.202.0·remediation 비활성·설정 변경 없음입니다. `revision-original-defender-e10fa452-db59-4e22-883d-7b7c756b26c6.json`에 NotSigned/검사 범위를 기록했습니다.
- PowerShell5.1 출력 로그를 UTF-8로 읽었을 때 한글이 깨져 보인 것은 CP949 콘솔 출력의 표시 문제였습니다. 원본 스크립트/패키지 복사본은 둘 다 UTF-8 BOM이며 실제 로그의 CP949 해독·재인코딩 바이트 동일성/대체문자 없음과 ‘검증 패키지’ 코드포인트를 확인했습니다. 제품 스크립트를 불필요하게 바꾸지 않았습니다.
- 실제 사용자 앱/개인 이력·입력/REC/파일 선택, 별도 Windows10/11·서명/다른 백신/최종 설치기 수용은 **미실행**입니다. 새 원격은 앱 기본/확장 정적 검사까지 성공했고 전체 결과는 후속으로 확정합니다.

### 4. 미구현 및 알려진 문제

현재 PC·무서명 개발 후보 검사이며 별도 OS의 모델 포함 오프라인/장기 실제 Tauri·장치 성능을 검증한 것이 아닙니다. 기본9단계/부분5단계와 출시 미완료를 유지합니다.

### 5. 다음 작업 계획

2c33c77의 원격 전체 결과와 변경 파일/진행표 정합성을 확정합니다. 새 기능·새 실행이 필요한 변경 없이 검사만 반복하지 않고 남은 외부 수용 조건은 진행표를 재개 기준으로 유지합니다.

후속 확정: [Windows40292589404](https://github.com/BomJin2/GuitarLab/actions/runs/40292589404)/job121470920653 **전체 success**. 실제534프론트/249기본·253확장Rust(각 제외28개)/예제1+1·AI113/도구143·Clippy/MSRV1.90·사후 정리 성공입니다. 문서 검사도14개 Phase 행/고유 결과 파일·최신5절·기존 Phase5/8 이력 보존·CRLF 허용 diff check가 **성공**했습니다. 위 원격 대기는 이 확정 전 이력입니다. 결과만 문서화했으며 제품 앱/자료·정책·모델은 변경하지 않았습니다.

## 저장 이력 TAB 독립 패키지·원격 확정 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26.95359c47cfbe50d2e555a967ea2ee4d4d1ceb09b의 저장 이력 TAB·새 파일 출력 후속을 원격 회귀와 독립 배포 검사로 확인했습니다. 해당 검사는 완료이며 별도 Windows10/11·실제 사용자 앱/파일 선택·서명 수용은 미완료입니다.

### 2. 구현 및 변경 사항

제품/런타임 소스를 바꾸지 않고 Git 깨끗함/정확한 커밋을 확인한 뒤 기존 runtime3393파일의 전체 고정 해시와 새 EXE로 UUID 후보·ZIP을 생성했습니다. 검사/영수증은 ignored `src-tauri/target/runtime-validation` 아래에만 보존합니다. 일반 portable-candidate나 기존 설치기/사용자 앱·자료는 교체하지 않았습니다.

### 3. 테스트 결과

- [Windows40289117144](https://github.com/BomJin2/GuitarLab/actions/runs/40289117144)/job121459740900 **전체 success**. 실제526프론트·249/253Rust(제외28개)·AI113/개발 도구143·예제1+1·MSRV/정리 성공을 로그로 확인했습니다.
- `revision-history-package-20261026.py` **성공**. EXE41,233,920바이트/SHA `9743ac81e8c24ecd5ca395e5e99a1a1a8f1690477597dc32455f2f49c473199b`, ZIP3613파일/40,288,872바이트/SHA `947811adfc718ab655e1c2c0774ef77235fdb0a0166ecc9d7bca20b92d2ee6d1`입니다. 전체CRC/목록·SHA/새 추출 동일성·기본PowerShell5.1/독립Python3.12.15 두 번 **성공**, VERIFIED_NOT_LAUNCHED입니다.
- ZIP 경로는 `validation-packages/e60d2aa2-450a-4ba1-b9c9-9351d8bbfef1/GuitarLab-validation.zip`, 후보는 `revision-history-candidate-25e38c82-0e73-46a8-a7de-825b8e82aabc.json`, 영수증은 `revision-history-package-receipt-20282a0c-ae17-457c-867a-b5ecf06963b9.json`입니다. 고정 runtime lock SHA `191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d`와3393파일/64,095,466바이트를 확인했습니다.
- `scan-revision-history-candidate-20261026.ps1`의 EXE/ZIP 지정 검사 **각 exit0/위협 미검출/전후 SHA 동일**. Defender4.18.26090.9·정의1.461.202.0, remediation 비활성·설정 변경 없음입니다. `revision-history-defender-4a292685-434f-4429-b6ec-5d72dc8095f8.json`에 NotSigned·검사 범위를 기록했습니다.
- 실제 앱 실행/사용자 데이터·장치/REC·별도 Windows10/11·다른 백신/서명·최종 설치기 수용은 **미실행** — 자체 패키지만 검사했으며 현재 PC 결과를 별도 OS 수용으로 확대하지 않습니다.

### 4. 미구현 및 알려진 문제

현재 검사 산출물은95359c4 코드이며 이후 원본 기반 TAB 확장은 포함하지 않습니다. 무서명 개발 후보이고 외부 OS/장기 실제 Tauri·입력 성능/출시 전체 완료를 보장하지 않습니다.

### 5. 다음 작업 계획

원본 기반 저장 버전의 읽기 전용 TAB 후속은 PHASE-05에서 별도 검증합니다. 새 변경의 빌드/커밋·원격을 현재 패키지와 구분하고 미수용 외부 조건은 진행표에 유지합니다.

## 진행표와 남은 수용 조건 정리 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26. 진행표가500줄 이상의 과거 기록 뒤에 있어 재개 위치를 찾기 어려운 문제를 정리합니다. 기본9단계/부분5단계와 미수용 조건은 유지하며 기존 날짜별 기록을 삭제하지 않습니다.

### 2. 구현 및 변경 사항

`docs/progress/README.md`의 기존14단계 표를 문서 맨 위로 이동하고 남은5단계의 실제 수용 조건·재개 기준을 추가했습니다. Phase6/8 표에는 최신 코드/검증 결과를 반영하고 제품 기능/모델 설치와 외부 환경·품질 검증을 분리합니다. 현재 WindowsSandbox.exe 부재를 읽기로 확인했으며 OS 기능 설치/설정 변경은 하지 않았습니다. 제품 코드/런타임·데이터와 작업 중 사용자 앱/입력/REC는 변경하지 않습니다.

### 3. 테스트 결과

문서 이동 전 Phase 행14개와 표 단일 존재를 확인하고, 표를 제외한 기존 이력 문자열이 이동 후 그대로 남는지 검사했습니다. `git diff --check`는 CRLF 허용 기준으로 **성공**입니다. 새 소프트웨어 테스트/빌드·실제 앱/개인 자료 조작은 **미실행** — 문서만 옮겼으며 해당 런타임 검사를 반복할 변경은 없습니다. 직전7ff2bef의521프론트·Windows 및 원격 검사는 Phase6 최신절에 별도로 기록합니다.

추가 문서 검증: Phase 결과 링크14개가 각각 고유하고 파일이 실제 존재하며 최신 PHASE-03/04A/06/08의 필수5절이 한 번씩 있는지 **성공**을 확인했습니다. 7ff2bef/[Windows40256414128](https://github.com/BomJin2/GuitarLab/actions/runs/40256414128)는521프론트/249·253Rust·AI113/도구143·MSRV/정리까지 전체 성공으로 확정했습니다. 남은 변경은 이 문서/진행표와 Phase6의 확정 결과뿐이므로 새 제품 빌드나 입력/REC·사용자 앱 재실행을 반복하지 않습니다.

### 4. 미구현 및 알려진 문제

진행표의9/14는 남은 시간 비율이나 전체 출시 완료가 아닙니다. 별도 Windows/특화 모델 허가·독립 정답 품질·서명/실제 데이터 교체·영구 삭제 수용을 완료로 바꾸지 않습니다. 이전 중지 기록은 과거 이력이며 위 최신 재개 상태를 우선합니다.

### 5. 다음 작업 계획

현재 제품 커밋의 원격 결론/문서를 확정합니다. 이후에는 진행표의 외부 수용 조건과 중요한 데이터 작업 범위를 해결한 뒤 해당 Phase의 미완료 항목을 재개합니다. 사용자 URL 선택에 따른 YouTube API 검색 보류와 고급 실시간 채점 비활성 정책은 유지합니다.

## 설치 CI의 Vite 빌드 입력 감시 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26. 절대 출력 경로 수정의 설치 검증을 준비하다가 설치 CI가 Vite 설정/공개자산 복사 모듈 변경을 감시하지 않음을 확인했습니다. 세 입력의 감시만 보완하며 자동 원격 실행은 업로드 후 확인합니다.

### 2. 구현 및 변경 사항

먼저 docs/13에 경계를 기록하고 `.github/workflows/installer-smoke.yml`의 main push.paths에 vite.config.ts/publicAssets.mjs/publicAssets.d.mts 세 줄을 추가합니다. 기존 actions 고정 SHA/도구·contents:read·취소/시간 제한·실제 격리 설치/제거와 데이터 보존 검사는 변경하지 않습니다. 앱/데이터·런타임/모델 설치 코드는 그대로이며 docs/진행표를 갱신합니다.

### 3. 테스트 결과

변경 diff에서 세 입력 경로와 기존 권한/고정 버전 유지·공백을 확인했습니다. 별도의 구현을 복제하는 단위 검사는 추가하지 않습니다. 새 기능/설치 원격 회귀는 **미실행** — 직전6393f5f의 기능 회귀가 끝난 뒤 업로드해 실행/실제 로그를 확인합니다. 제품 코드의 로컬519프론트·타입/lint/포맷·상대/절대 Vite/내장4개/Windows 결과는 아래 절의6393f5f와 구분합니다.

후속: YAML 대상 Prettier 검사도 성공했습니다. main `fc6628c1bfe11b11f871374fcd6e477ff0c5558f`에 업로드한 뒤 [기능40252073543](https://github.com/BomJin2/GuitarLab/actions/runs/40252073543)/[격리 설치40252073597](https://github.com/BomJin2/GuitarLab/actions/runs/40252073597)가 실제 시작됐습니다. 아직 결론 대기 중이며 위 미실행은 이전 시점입니다. 연결 도구의 commit 실행 조회는 PR 이벤트만 대상으로 하므로 push 실행ID는 공개GitHub API로 확인하고, 이후 job/단계/로그는 연결 도구로 읽습니다. 자체 실험 탭·서버1429/1430/1431은 명령줄/포트 소유권을 재확인해 정리했습니다.

최종 확정: main `fc6628c1bfe11b11f871374fcd6e477ff0c5558f`의 [기능40252073543](https://github.com/BomJin2/GuitarLab/actions/runs/40252073543)/job121345964108와 [격리 설치40252073597](https://github.com/BomJin2/GuitarLab/actions/runs/40252073597)/job121345964176 모두 **success**입니다. 기능 검사는519프론트/112파일(51.01초), 기본247Rust(52.16초)/확장251Rust(60.28초·각28개 기본 제외), 예제1+1·AI113(2.02초)/도구143(15.993초)·MSRV/정리까지 통과했습니다. Server의 독립 release 설치는3393개 runtime 검증·시작 대기3075ms·정상 종료0·제거 등록 해제와 앱 데이터/알 수 없는 파일 보존을 확인했습니다. `installer-watch-ci-final-20261026.json`에 지문/정확한 커밋/격리 identifier를 보존했습니다. 모델 포함/깨끗한 Windows10/11 검증은 false이며 사용자 PC 검사를 대신하지 않습니다. 위 대기는 이전 이력이며 제품 코드는6393f5f와 같아 그 후보/ZIP 지문을 그대로 참조합니다.

### 4. 미구현 및 알려진 문제

연결된 GitHub 도구에는 새 workflow_dispatch 실행이 없고 로컬 GitHub CLI도 없어 수동 새 실행으로 대신하지 않았습니다. 필요한 빌드 입력의 자동 감시를 수정해 같은 문제의 재발을 막습니다. 실제 Windows10/11 사용자 PC/모델 포함 오프라인·서명/다른백신·고급 판정 수용은 이 CI로 완료 처리하지 않습니다.

### 5. 다음 작업 계획

업로드 후 기능/격리 설치 두 실행의 정확한 커밋·영수증을 확인하고 실패 시 원인을 해결합니다. 현재 사용자 앱과 자료·입력/REC는 조작하지 않습니다.

## 공개 자산 복사의 절대 출력 경로 수정 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26. 별도 worker 실험 빌드에서 발견한 Vite 절대 outDir 복사 실패를 재현하고 공통 경로 처리 한 곳을 수정했습니다. 대상/전체519프론트·정적 검사·상대/절대 실제 웹 빌드·내장/Windows 빌드는 완료했고 새 소스의 Git/패키지·원격을 후속으로 구분합니다. 전체 Phase8/기본9개·부분5개 상태는 유지합니다.

### 2. 구현 및 변경 사항

- 구현 전 docs/12에 상대·절대 출력 경로와 허용목록/원본 보존 계약을 기록했습니다. `scripts/publicAssets.mjs`에서 root/outDir 결합을 Node join에서 resolve로 바꿨습니다. 기존 타입 선언·복사파일 목록·기본 상대 dist와 사용자 원본/앱 데이터는 유지합니다. 새 의존성·IPC/DB 변경이나 폴더 삭제는 없습니다.
- `src/test/publicAssets.test.mjs`: 기존 자체 파일 생성/정리 경계를 재사용해 Vite configResolved/writeBundle 호출의 상대/절대 실제 파일 복사를 검사합니다. 허용 자산 전체 바이트/목록과 원본·비허용 개인 파일의 보존을 확인합니다. 정리는 기존 임시 상위/전용 prefix 확인을 통과한 자체 테스트 폴더만 대상으로 합니다.
- docs/09·12·13·로드맵/진행표를 갱신합니다. 실제 사용자 public 내보내기 파일을 읽거나 수정하지 않았습니다. 별도 worker 실험의 출력은 target 아래 새 폴더이며 제품 dist/사용자 앱을 실험 페이지로 바꾸지 않았습니다.

### 3. 테스트 결과

- 수정 전 `pnpm exec vitest run src/test/publicAssets.test.mjs`: **1실패/2성공**,1.03초. 절대 Windows 드라이브 경로 앞에 root가 중복된 mkdir 오류를 재현했습니다. 수정 후 같은 명령 **3개 성공**,1.05초/검사228ms입니다.
- `pnpm typecheck`/`pnpm lint`/`pnpm format:check`: **성공**. `pnpm test`: **519개/112파일 성공**,34.11초. 로그 `public-assets-path-front-20261026.log`를 보존합니다.
- 기본 상대 출력의 `pnpm build`: **성공**,Vite1분12초·기존500kB chunk 경고. `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture` **4개 성공**,0.01초, `cargo build … --features custom-protocol` **Windows 성공**,5.78초·기존MSVC 링크/테스트 아이콘 안내입니다. `public-assets-path-{build,bundle,native-build}-20261026.log`를 보존합니다. 앱은 실행하지 않았습니다.
- 별도 절대 outDir의 실제Vite 검증도 성공했습니다. 최초 production-1은 원래 join 경로 오류로7.79초에 실패했고 실패 폴더/로그를 보존합니다. 수정 후 새 production-2의 같은 경로 체인은7.89초, production-3은7.65초에 성공했습니다. `score-import-probe-build-20261026.log`/`score-import-probe-build-fixed-20261026.log`/`score-import-json-probe-build-20261026.log`에서 구분합니다.
- 새 Git/독립ZIP/원격은 **미실행** — 로컬 검사/문서를 마친 정확한 소스로 이어서 검증합니다. Rust/Python 엔진 변경이 없어 로컬 전체 재검사는 **미실행**이며 직전05f1866의247/251Rust·AI113/도구143·MSRV 원격 전체 성공과 구분합니다. 실제 사용자 앱 조작/개인 자료·입력/REC·새OS 수용도 **미실행**입니다.
- 확정 후속: main `6393f5f126af0518c45d162842016cf62aea499f`/[Windows40250996837](https://github.com/BomJin2/GuitarLab/actions/runs/40250996837)/job121342634187는 정리까지 **전체 success**입니다.519프론트/112파일(78.80초), 기본247Rust(50.74초)/확장251Rust(52.34초·각28개 기본 제외), 예제1+1·AI113(2.38초)/도구143(19.234초·제외 없음)·MSRV9.73초를 확인했고 `public-assets-path-ci-final-20261026.json`을 보존합니다.
- 같은 소스 EXE41,232,384바이트·SHA `9d4f99f990d0f2772e8494f8618b6faf342a0f4d4a8fdb08dd506b36be4719ca`와 고정runtime3393개·64,095,466바이트 후보는 `public-assets-path-candidate-671c393a-d853-4f67-84ec-47db5af4c0d0.json`입니다. 새 ZIP `validation-packages/06a6d5c8-4006-4a44-9fa5-9af599b08513/GuitarLab-validation.zip`은3613파일/40,286,155바이트·SHA `816124d33d8c713a35c6eafa229a363a905d68b3f82b11ba2574531b66a085e2`이며 전체SHA/CRC·같은 바이트 추출·실제PS5.1 종료0/독립Python3.12.15 검사가 성공했습니다(`public-assets-path-package-receipt-dd787686-1b8e-4a94-ac7e-b51ea02655e6.json`). 동일EXE/ZIP만 검사한 Defender도 모두0/지문 동일이고 NotSigned입니다(`public-assets-path-defender-06648ba2-158f-437e-9e41-4c95c3374187.json`). 앱/개인 자료/generic 포인터는 유지했고 위 새ZIP/원격 미실행은 이전 이력입니다. 이 source의 설치CI는 감시 경로에 빌드 모듈이 없어 시작되지 않았고 위 별도 감시 보완으로 실제 설치 회귀를 이어갑니다.

### 4. 미구현 및 알려진 문제

함께 진행한 파싱 worker 실험은 제품에 연결하지 않았습니다. Map 최적화 번들에서는 명시적 JS 복원112.8ms와 달리 실제 heartbeat 지연이324.6→364.7ms로 악화됐습니다. JSON 전송은409.6→253.6ms로 줄었지만 중간33,986,204문자/전체1312.4ms(동기419.3ms)·추가 worker약1.02MB와 복원/메모리 비용이 남았습니다. 두 경우 자체 악보의 UUID를 제외한 음정·시간·운지/박자·원본 바이트는 일치했지만 현재 장점만으로 기존 파서를 교체하지 않습니다. 영수증 `score-import-map-probe-20261026.json`/`score-import-json-probe-20261026.json`을 보존하며 개발환경의 단순 복원시간 감소만 제품 응답 개선으로 주장하지 않습니다. RSS/GC 통제·다른 악보/OS 범위도 미실행입니다.

### 5. 다음 작업 계획

이 경로 수정 소스를 Git에 보존하고 정확한 소스의 새 패키지/원격 기능·격리 설치 회귀를 확인합니다. worker 실험은 보류한 상태로 남기고 새로운 구현을 채택할 때는 전체 시간·메시지 복원/최대 지연·취소·원본/다른 형식 보존을 함께 검증합니다. 남은 고급 판정 정답/특화 모델 허가·별도 Windows10/11/서명·실제 사용자 수용은 기존 미완료 조건을 유지합니다.

## 선택 트랙 직렬화 전용 입력 후속 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26. 직전59e12d9의 선택 트랙 역직렬화/worker 개선에 남은 전체 중간Map 직렬화를 줄이는 후속입니다. 대상/전체 프론트·정적 검사/웹·Windows 빌드와 실제SVG 전후 관측을 완료했습니다. 새 독립ZIP/원격은 후속 결과로 구분하며 기본9개/부분5개 상태는 유지합니다.

### 2. 구현 및 변경 사항

docs/12에 먼저 직렬화 전용 얕은복사·부모/원본 불변 계약을 기록했습니다. `scoreDisplay.ts`에서 새 model.Score에 원래 메타데이터/선택트랙 참조만 복사해 공개 JsonConverter의 읽기 입력으로 사용합니다. 이 임시객체에 finish/addTrack/렌더/재생을 호출하지 않으며 실제 renderer에는 왕복한 깊은 복사본만 전달합니다. 전체트랙 Map 생성/필터/형식검사를 없애 코드량도 줄였습니다. 기존 표기3종·음표/박자 매핑은 유지하고 `scoreDisplay.test.ts`에 원래 Track.score/index 보존을 추가합니다. 새 의존성/IPC·저장/도메인 변경은 없습니다.

### 3. 테스트 결과

- `pnpm typecheck`/`pnpm lint`: **성공**. 대상 `pnpm exec vitest run src/features/score/scoreDisplay.test.ts src/features/score/ScoreViewport.test.tsx`: **13개/2파일 성공**,3.78초.128트랙/표기·원래 부모/인덱스·음표/반복/커서·두 번째 트랙 클릭을 포함합니다.
- 별도 `render-probe-20261026/index-v4.html`/probe-v4.js는59e12d9의 실제 이전모듈과 후속을 같은브라우저에서 비교하며 comparison/baselineCommit/variant·실제SVG 대기로 계측을 구분합니다. 전체프론트/포맷·Vite/Windows·새독립ZIP/원격은 아직 **미실행 또는 진행 중**이며 완료 결과를 다음 절에 추가합니다.
- 실제 Tauri 앱/사용자프로젝트·입력/REC·OS RSS/강제GC·다른OS 수용은 **미실행** — 현재 앱과 개인자료를 유지합니다. Rust/Python 전체 로컬 재검사는 해당 엔진 변경이 없어 **미실행**이며 원격/내장 결과와 구분합니다.
- 최종 `pnpm test`: **517개/112파일 성공**,37.58초(`selected-serialization-front-20261026.log`). `pnpm format:check`/`pnpm build`: **성공**,Vite51.01초·기존chunk 경고(`selected-serialization-build-20261026.log`). `cargo test … --all-features bundle_tests -- --nocapture` **4개 성공**,0.01초, `cargo build … --features custom-protocol` **Windows 성공**,13.43초·기존MSVC 링크/테스트 아이콘 안내입니다. `selected-serialization-{bundle,native-build}-20261026.log`를 보존합니다. 메타데이터 제목/아티스트·기본과 다른tempo95 보존 assertion을 보완한 대상13개도16.54초/실제검사1.37초에 재확인했습니다. 위 검사 전/진행 중은 이전 이력입니다.
- 실제SVG 관측: 같은Chromium156/1280×720/DPR1·256마디/2000음·선택0/기본lazy 조건에서59e12d9와 후속을 번갈아8회 측정했습니다. 128트랙3쌍의 표시복사 시간은 이전99.7/83.9/97.5ms·후속4.1/1.9/1.6ms, 관측 중앙값97.5→1.9ms입니다. 전체시각의 중앙값은837.0→670.1ms이며 최초fixture/파싱도 포함합니다. 1트랙 대조는275.3→278.6ms로 비슷했고 이 차이를 일반적인 단일트랙 개선으로 주장하지 않습니다.8회 모두SVG 생성/원본 불변을 확인했고 `selected-serialization-observed-20261026.json`에 기록했습니다. GC/CPU 격리·통계 수용이나 RSS 절감 주장은 없습니다.
- 이전 자동승인 검토 사용량 한도로 중단된 문서 정리/검증은 같은 승인 경로의 재개로 처리했습니다. 우회 실행 없이 이번 Windows 빌드·문서 변경이 승인됐으며 확인하지 못한 항목을 완료로 기록하지 않습니다. 새 직렬화의 현재 사용자 앱 재실행은 미실행입니다.
- 재개 후 같은 후속 코드의128번째 트랙도 실제SVG/프렛7 클릭→원본트랙128/MIDI71 연결을 확인했습니다. SVG5개/482자식·source 불변, 표시는 직렬화 입력의 원래 부모를 유지했습니다. `selected-serialization-last-track-click-20261026.json`을 보존합니다. 자동 종료된 검증 서버/탭은 별도 localhost1429 검증 환경만 다시 만들어 확인했고 사용자 GuitarLab은 재실행하지 않았습니다. `docs/21-QUICKSTART.md`에는 새 검색/정보수정·읽기 전용 저장 이력 사용법도 추가했습니다.
- 2026-10-26 원격 확정: main `05f1866b0bb9980a254b2b636a7c4a7091f62980`의 [Windows40248387433](https://github.com/BomJin2/GuitarLab/actions/runs/40248387433)/job121334739871는 정리까지 **전체 success**입니다. 실제517프론트/112파일(84.71초), 기본247Rust(56.16초)/확장251Rust(70.37초·각28개 기본 제외), 예제1+1·AI113(2.39초)/도구143(15.161초·제외 없음)·MSRV12.24초를 확인했고 `selected-serialization-ci-final-20261026.json`을 보존합니다.
- 같은 소스의 EXE41,232,384바이트·SHA `782d5b1ae6c25c02239ec3f87b8de05f5c0c65b596ebf6a3ea287da0be3b25ab`/고정runtime3393파일·64,095,466바이트 후보는 `selected-serialization-candidate-9e896a35-7f23-4e94-9322-5650cbb4b90b.json`입니다. ZIP `validation-packages/6aa8a39b-11b9-4786-8548-a53638b1a144/GuitarLab-validation.zip`은3613파일/40,286,156바이트·SHA `eccbeba825ed009ba8a5207c518f4124a44d42006cd74def983eec66450e349a`이며 전체SHA/CRC·동일바이트 추출/실제PS5.1 종료0·개발경로 제외 Python3.12.15 검사를 통과했습니다. `selected-serialization-package-receipt-dc60b929-0231-47df-986b-b43e71af8133.json`에 기록했습니다. 같은EXE/ZIP의 Defender4.18.26090.9/정의1.461.202.0·치료 없는 검사도 모두0/지문 동일입니다(`selected-serialization-defender-0e143b10-9a7b-4e2c-8aec-9f01cc7aba5b.json`). NotSigned/별도Windows·다른백신/사용자 앱 수용 미실행은 유지하며 generic 포인터/사용자 자료는 변경하지 않았습니다. 위 원격/새패키지 대기는 이전 이력입니다.

### 4. 미구현 및 알려진 문제

최초 악보 XML 파싱/정규화는 별도 비용으로 남습니다. 임시Score는 직렬화 입력에만 사용해야 하며 원래 트랙을 addTrack으로 옮기거나 shallow 객체를 renderer에 전달하지 않습니다. 이번 후속으로 전체 앱 무지연·메모리 절감/RSS·고급판정/별도Windows 품질을 주장하지 않습니다.

### 5. 다음 작업 계획

정확한 소스의 새 독립패키지/백신·원격 회귀를 마칩니다. 직전59e12d9의 새ZIP/원격 성공은 아래 절에 확정했고 남은 최초 파싱 지연은 별도 worker 검증/계약으로 다룹니다. 사용자의 현재 앱/개인 프로젝트로 자동 테스트하거나 입력/REC를 시작하지 않습니다.

다음 실험 재개 위치: `src-tauri/target/runtime-validation/score-import-probe-20261026/`의 별도 worker가 기존 XML 파서→Score 직렬화만 수행하고 메인에서 Score/lookup·정규화를 복원합니다. 자체7,567,955바이트/256마디/128트랙/2000음에서 동기 메인344.9ms·worker 복원93.7ms/lookup·정규화58.5ms(합152.2ms), worker 전체1063.2ms·파싱341.3ms/직렬화72.9ms를 관측했고 UUID를 제외한 음정·시간·운지/표기·원본바이트는 일치했습니다. 이 개발 서버 단일 관측만으로 제품에 연결하지 않습니다. 별도 production-1 번들에서 첫 로딩 비용/동등성을 확인한 뒤 새 계약·취소/오류 보호를 정의해야 하며 현재 worker 실험은 제품 기능으로 미구현입니다.

## 선택 트랙 표시 복사본과 실제 SVG 관측 — 2026-10-26

### 1. 작업 개요

작업일2026-10-26. 대형 문서에서 선택1트랙을 보여줄 때 전체128트랙을 다시 복사/worker에 전달하는 비용을 줄였습니다. 대상/전체 프론트·정적 검사/웹 빌드·내장/Windows 빌드와 별도 실제 브라우저 관측을 완료했습니다. 새 독립 패키지/원격은 후속 결과로 구분하고 전체 Phase8 수용은 미완료이며 기본9개/부분5개 상태를 유지합니다.

### 2. 구현 및 변경 사항

- 구현 전 docs/12에 표시 복사본/렌더 인덱스0·원본 객체/lookup·트랙별 표기 설정의 유지 계약을 기록했습니다. 설치된 alphaTab1.6.1의 공개 JsonConverter 타입과 실제 ScoreSerializer의 Map/트랙 구조를 확인했으며 새 의존성/IPC·저장 형식은 없습니다.
- `scoreDisplay.ts`: 직렬화된 tracks 중 선택 트랙만 역직렬화합니다. 원래 인덱스의 tuning/chord diagram/multibar-rest를 복사본의0으로 매핑하고 음표/박자는 원래 선택 트랙 객체에 연결합니다. 원본·전역 마디/템포/반복과 도메인 인덱스는 유지합니다. 전체 score의 최초 직렬화/파싱은 여전히 필요합니다.
- `ScoreViewport.tsx`: 표시 복사본의 명시적 renderTrackIndex를 사용하며 원래 lookup·커서/선택 경로를 유지합니다. UI 배치/디자인은 변경하지 않습니다. 두 파일의 기존 회귀에128트랙 중 마지막 트랙/표기·원본 불변과 실제 두 번째 트랙의 복사본0 렌더/원래 음표 클릭 연결을 추가했습니다.
- docs/04·08·09·12/진행표와 이 문서를 갱신합니다. 별도 `src-tauri/target/runtime-validation/render-probe-20261026/` 페이지는 자체 fixture만 사용하고 입력/재생/저장·현재 앱/개인 자료를 조작하지 않았습니다.

### 3. 테스트 결과

- `pnpm exec vitest run src/features/score/scoreDisplay.test.ts src/features/score/ScoreViewport.test.tsx`: **13개/2파일 성공**,3.62초. 새128트랙 검사는4마디/2000음으로 범위를 격리해528ms에 성공했습니다. 첫256마디 중복파싱 회귀는 jsdom 기본5초를 넘어 실패했고, 트랙 매핑에 필요한4마디로 한정했습니다. 256마디 스트레스는 기존 용량 회귀와 아래 실제 브라우저에서 별도 수행했습니다.
- `pnpm test`: **517개/112파일 성공**,35.20초. 로그 `selected-render-front-20261026.log`. `pnpm typecheck`/`pnpm lint`/`pnpm format:check` **성공**,`pnpm build` **성공**(Vite1분2초·기존500kB chunk 경고). 로그 `selected-render-build-20261026.log`. Rust/Python 엔진 변경은 없어 이번 로컬 전체 재검사는 **미실행**이며 직전 aa48866의 기본247/확장251Rust·AI113/도구143·MSRV 원격 전체 성공과 구분합니다.
- 실제 브라우저: Windows의 내장 Chromium156/1280×720/DPR1, 호스트1100px·256마디/전체2000음·선택 트랙0/TAB/worker/재생OFF. main aa48866의 기존 scoreDisplay를 별도 파일로 보존해 같은 페이지의 before/selectedOnly로 비교했습니다. 6회 모두 실제SVG 자식 생성/원문서 불변을 확인했고 영수증 `selected-render-observed-20261026.json`에 기록했습니다.

| 조건 | 이전 표시 복사 ms | 수정 표시 복사 ms | 이전 전체 관측 ms | 수정 전체 관측 ms |
|---|---:|---:|---:|---:|
|128트랙·기본 lazy|266.7|164.6|2600.9|1085.4|
|128트랙·전체 SVG|224.9|130.0|2607.7|1081.2|
|1트랙·기본 lazy 대조|16.0|14.1|323.2|290.9|

- 전체 관측은 fixture 생성/정규화 왕복·표시복사·layout·실제SVG 자식10개 이상/두 프레임까지 포함합니다. 128트랙 전체SVG는 전후 모두24 SVG/2958자식으로 동일했습니다. 기본lazy는 보이는 chunk가 관측 시점에 따라 달라5/3 SVG였으며 모든 마디의 동시 paint 완료를 보장하지 않습니다. source JSON 불변은6회 모두true입니다.
- 첫 계측의 postRenderFinished/두 프레임만으로는 실제SVG가 뒤늦게 붙어0개 판정 실패가 발생했습니다. MutationObserver로 실제SVG를 기다리게 보완했습니다. Vite가 watch 제외한 검증 폴더의 이전 모듈을 캐시해 결과variant가 누락된 중간 비교도 최종값에서 제외했습니다. 새 probe-v2.js/variant 확인 후 위6회만 채택했습니다. 예비 `render-baseline-20261026.json`은 PRELIMINARY_LAYOUT_ONLY로 보존하며 최종 비교에 사용하지 않습니다.
- JS heap은 관측 순서/GC 때문에128트랙 eager에서 이전451,063,942바이트·다음 수정714,925,259바이트였습니다. 이를 메모리 절감/누수 또는 프로세스 RSS로 해석하지 않습니다. 강제GC/별도 프로세스 RSS·통계적 반복은 **미실행**입니다. native/독립ZIP·원격은 아래 후속 결과로 구분합니다.
- 최종 `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture`: **4개 성공**,0.01초. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **Windows 성공**,12.62초·기존MSVC 링크/테스트 아이콘 안내. 로그 `selected-render-bundle-20261026.log`/`selected-render-native-build-20261026.log`를 보존하며 위 native 진행 중은 이전 시점입니다. 앱은 실행하지 않았습니다.

추가 실제브라우저 수용: 같은59e12d9 소스에서128번째 트랙을 렌더 인덱스0으로 보여주고 첫 프렛7을 실제 클릭했습니다. ‘원본 트랙128 · MIDI71 · 프렛7’로 원래 객체에 연결되고 source JSON은 유지됐습니다. alphaTab 내부string6은 도메인 고음1번 줄이며 검증 페이지의 내부 번호를 실제 기타6번 줄로 해석하지 않습니다. 영수증 `selected-render-last-track-click-20261026.json`, 페이지 `render-probe-20261026/index-v3.html`을 보존합니다. 도구의 일반status 선택자가 output의 암시적status까지 두 개를 찾은 오류는 명시적 ‘선택 음표 연결’로 읽어 해결했으며 제품 오류가 아닙니다.

2026-10-26 원격/패키지 확정: main `59e12d9db7f73debd6d457aeba34522df295113d`의 [Windows40229010879](https://github.com/BomJin2/GuitarLab/actions/runs/40229010879)/job121276515568는 **전체 success**입니다. 실제517프론트/112파일(61.43초), 기본247Rust(49.57초)/확장251Rust(48.93초·각28개 기본 제외), 예제1+1·AI113(2.11초)/도구143(16.958초·제외없음)·MSRV10.03초/정리를 확인했습니다. `selected-render-ci-final-20261026.json`을 보존합니다. 같은 소스/EXE41,232,384바이트·SHA `b7bf491e94a5592e688dc8aaed7bdb94cbaa5250d0c4181d6a40458eb53546d5`, 고정runtime3393파일/64,095,466바이트의 후보 `selected-render-candidate-500e9fa9-7ceb-48d1-a79f-b24511550be0.json`을 앱 실행 없이 만들었습니다. ZIP `validation-packages/1dec63f6-a494-4f51-bdda-18ad5c668859/GuitarLab-validation.zip`은3613파일/40,286,537바이트·SHA `167f2c9c5dc71faa310d011e087ab3e47e307bc17cff871c2f4d848aca2a40c2`이며 전체SHA/CRC·같은 바이트 추출·실제PS5.1 종료0/독립Python3.12.15를 확인했습니다. 영수증 `selected-render-package-receipt-c7936292-5aa0-4c98-8bdf-fb534bcbf683.json`. 이59e12d9 후보의 추가Defender는 미실행이고 다음 최종 소스 패키지에서 별도로 검사합니다. 사용자 앱/개인 자료/generic 포인터는 유지했습니다. 위 새ZIP/원격 대기는 이전 이력입니다.

### 4. 미구현 및 알려진 문제

128트랙의 최초 정규화/파싱은 약777~827ms로 여전히 주 스레드 비용이 남고, 이번 관측의 최대 heartbeat 지연도 수정본에서약871~899ms입니다. 이 변경을 전체 렌더 무지연·메모리 절감·출시 성능 수용으로 기록하지 않습니다. 한 PC/6회·개발 브라우저의 관측이며 실제 Tauri 앱/다른 장치·OS/GC 통제·RSS/긴 반복은 미실행입니다. 고급 판정 정답/특화 모델·서명/별도 Windows 조건은 그대로 남습니다.

### 5. 다음 작업 계획

Windows 내장/빌드·정확한 소스의 새 독립 패키지와 원격 회귀를 마칩니다. 이후 선택 트랙 표시를 바꾸는 기능에서 이 원본/객체 매핑 경계를 유지하고, 남은 주 스레드 파싱과 메모리/RSS는 별도의 계약·검증으로 다룹니다. 현재 사용자 앱/입력·REC/개인 자료/generic 포인터는 유지합니다.

## 대형 정규화 악보 회귀와 생성 용량 보호 — 2026-10-25

### 1. 작업 개요

작업 시작2026-10-25/후속 구현·자동 검증 완료2026-10-26. 단축키 수정의 원격 대기 중 긴 곡/대형 악보 수용 조건을 자체데이터로 점검했습니다. 허용된1·128트랙/256마디·2000음 왕복은 통과했으나 큰 박자 조합에서 기존8MiB보다 큰 파생문자열을 제한 없이 먼저 생성하는1개 실패를 재현했습니다. 생성 중 용량 보호/기존편집 보존과 전체프론트·Windows/독립ZIP·원격 회귀는 완료했습니다. 전체Phase8/별도Windows 수용과 구분합니다.

### 2. 구현 및 변경 사항

- 구현 전 docs/12에 출력8MiB/누적UTF-8·실패/원본보존 계약을 기록했습니다. docs/04·09와 로드맵/진행표를 갱신합니다.
- `normalizedNotation.ts`: 기존 출력과 순서를 유지하며 헤더/part-list·part·마디/종료 태그 조각을 실제UTF-8 바이트 예산 안에서만 보관합니다. 초과 조각은 push/전체join/alphaTab 파싱 전에 SCORE_XML_LIMIT로 거부하고 고정 한국어 안내를 공유합니다. 개별마디/문서 객체와 전체프로세스 메모리까지8MiB로 보장하지 않습니다.
- `useScoreEditing.ts`/`scoreExport.ts`: 같은 초과를 트랙/마디 축소 안내로 전달합니다. 기존 apply의 렌더 선검증을 유지해 실패 시 문서/history·선택/저장revision·원본을 바꾸지 않고 JSON/XML 출력은 파일 선택/IPC 전에 거부합니다. 새IPC/DB·라이브러리/출력 형식은 없습니다.
- `src/test/scoreCapacityFixture.ts`: 저작권 문제가 없는 기존 자체악보를 토대로1·128트랙/256마디/2000음과32/1 조합을 만드는 재사용 검사 데이터입니다. `scoreCapacity.test.ts`/`scoreExport.test.ts`/`useScoreEditing.test.tsx`에서 정상왕복/초과/불변·Undo/브리지 미호출과 안내를 검사합니다.

### 3. 테스트 결과

- 수정 전 최대4/4 정상범위2개 성공, 확장3개 성공(1.014초).1트랙 XML444,150바이트/파서왕복121.062ms,128트랙 XML7,567,955바이트/파서왕복792.916ms를 한 번 관측했습니다. fixture 준비/직렬화는 각각28.288/52.056ms입니다. 고정환경 단회 관측이며 p95/일반PC·화면SVG 성능이 아닙니다.
- 이후 큰박자128트랙/32/1의 예산 초과 거부는 **1실패/3미선택**, 기존 serializer가 오류 없이 반환해 실패를 재현했습니다. 새 누적예산으로 수정한 뒤 편집/구조·출력/용량 관련4파일 **25개 성공**,4.31초. 최종 shared fixture/오류안내·실제hook 연결 뒤3파일 **24개 성공**,4.37초입니다.
- 최종 Undo 보존 강화 뒤 `pnpm exec vitest run src/features/score/useScoreEditing.test.tsx -t '큰 파생 악보'`: **1개 성공/15미선택**,106ms. 추가된 fixture/검사와 타입/lint/포맷·전체프론트는 현재 검사 중입니다. 로그 `score-capacity-20261025.log`/`score-capacity-full-20261025.log`는 `src-tauri/target/runtime-validation/` 아래에 보존합니다.
- 이후 `pnpm typecheck`/`pnpm lint`/`pnpm format:check`와 `pnpm test`: **500개/107파일 성공**,48.92초. 로그 `score-capacity-full-20261025.log`로 확인했고 위 전체검사 중은 이전 시점입니다. 다음 Vite/내장·Windows 명령은 자동 승인 검토의 사용량 한도로 **미실행**이었으며 안전성 거절이 아니었습니다.2026-10-26 사용자 재개 요청 뒤 동일 승인 절차를 통과해 재실행 중입니다. 기존 UI/개인 데이터는 유지합니다.
- Windows 빌드·새ZIP/원격과 실제 화면SVG/프로세스RSS·Windows 키/Explorer·개인 파일/새OS는 **미실행** — 이 후속의 검사 결과와 앞선 단축키 source6a50564의 패키지/원격을 구분합니다. 사용자 앱/개인 자료/입력·REC/generic 포인터는 유지했습니다.

### 4. 미구현 및 알려진 문제

32/1 등 많은 쉼표가 생기는 조합은 마디/트랙 개수 각각이 허용값이어도 파생출력8MiB 초과로 거부될 수 있습니다. 문서를 자동 삭제/분할하거나 실제 지원을 보장하지 않습니다. 전체파서/렌더러의CPU/RSS 상한·압축CRC/진위·별도Windows/최종배포·고급 품질 보류는 유지합니다.

### 2026-10-26 최종 로컬 빌드

재개 후 `pnpm build` **성공**,Vite58.44초/기존 큰chunk 경고 유지. `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture` **4개 성공**,0.01초/컴파일35.02초이며 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol` **Windows 빌드 성공**,16.22초/기존MSVC 링크 안내입니다. 실행 파일40,905,216바이트·SHA `80bf84d605ec1118c3ce2ca0e607774221f3a3b7ee6e68b65aabd734a181a097`. 로그 `score-capacity-build-20261026.log`/`score-capacity-bundle-20261026.log`/`score-capacity-native-build-20261026.log`를 보존했습니다. 위 Windows 미실행은 전날 이력이고 실제 앱/개인 자료 조작·별도Windows/새ZIP/원격은 아직 미실행입니다. 전체Rust/Python의 로컬 재검사는 미실행 — 소스를 바꾸지 않았고 새 원격 회귀로 확인합니다.

### 5. 다음 작업 계획

이 후속의 전체검사/Vite·내장/Windows/새독립ZIP/원격은 아래 최종 결과로 확정했습니다. 다음은 실제 화면SVG/RSS·키/Explorer·별도OS와 독립적인 고급 정답/특화 모델 수용 조건입니다. 새 모델/개인 자료 전송·실제 데이터 교체나 합성파서 시간으로 이 조건을 대신하지 않습니다. 재개 위치/미실행을 유지하고 기존 정상 기능을 다시 구현하지 않습니다.

### 독립 패키지 완료·새 원격 — 2026-10-26

source `ef0c69d2e4317b76bf6ae541c787265e8a890690`를 main에push했습니다. [Windows40222832196](https://github.com/BomJin2/GuitarLab/actions/runs/40222832196)/job121257913173는 진행 중이며 최종 수용은 미확정입니다. 앞선6a50564 회귀는494프론트·240/244Rust·AI113/도구143·MSRV/정리 전체success로 확인했고 이번500개 소스와 구분합니다.

새 후보 `score-capacity-candidate-ac07388f-b347-46c0-8aef-eeabf95dcbd4.json`은 앱 미실행이며 고정3393runtime/64,095,466바이트·lock SHA `191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d`를 대조했습니다. ZIP `validation-packages/28828e22-5f77-4f77-a85a-248c3f7c0870/GuitarLab-validation.zip`은 **3613파일/40,220,680바이트·SHA `36f566dc923636d94eac6cb52c41ff3742e686ea51e589b6158bfbaa8d7065a4`**입니다. 전체SHA/CRC/목록과 동일지문 바이트의 새폴더 추출/재검사 및 실제 `powershell.exe -NoProfile -File Test-ValidationPackage.ps1` **exit0**, 개발PATH 제외/모델 없는 Python3.12.15 두 번이 성공했습니다. 영수증 `score-capacity-package-receipt-07fb6676-e57d-47f8-b0d2-9d743a1bae6b.json`/로그 `score-capacity-package-check-05ea927c-5a68-402d-ab9e-038e93d969e6.log`를 `src-tauri/target/runtime-validation/` 아래에 보존합니다. 원본 후보/generic 포인터·사용자앱/데이터는 불변이며 실제 키/Explorer·새OS/새설치/서명/최종출시 수용은 미실행입니다. 새Defender는 별도로 확인합니다.

### 현재PC 후보/ZIP Defender 검사 — 2026-10-26

동일한 새 후보EXE/ZIP 두 개만 설치된 MpCmdRun4.18.26090.9의 `-Scan -ScanType 3 -File <단일 산출물> -DisableRemediation`로 검사해 **각exit0/탐지 없음·검사 전후SHA 불변**을 확인했습니다. 영수증 `score-capacity-defender-e7541a3d-9e72-4ff3-a357-d3d94496dda8.json`은 정의1.461.194.0(2026-10-25 10:31:04KST)/엔진1.1.26090.9·실시간보호 활성/Authenticode `NotSigned`와 두 대상의 출력을 보존합니다. Defender 설정/제외·정의 업데이트는 변경하지 않았고 삭제·격리는 적용하지 않았습니다. 다른SHA의NSIS·다른백신/SmartScreen·서명/최종출시의 안전성 결과로 확대하지 않습니다. 위 새Defender 미실행은 검사 전 이력입니다.

### 원격 전체 최종 확정 — 2026-10-26

source `ef0c69d2e4317b76bf6ae541c787265e8a890690`의 [Windows40222832196](https://github.com/BomJin2/GuitarLab/actions/runs/40222832196)/job121257913173는 사후 정리까지 **전체 success**입니다. **500프론트/107파일·기본240Rust/43.57초·확장244Rust/85.53초**(각28개 환경 의존 기본 제외), 예제1+1·AI113/3.01초·개발 도구143/14.933초(제외 없음)·타입/lint/Vite/포맷·Clippy·최소Rust1.90 전체 컴파일11.75초를 확인했습니다. 원격 용량 사례의 XML바이트444,150/7,567,955와 단회파서왕복207.051/1239.945ms도 관측했으며 전체프로세스/RSS·화면SVG/실제입력 지연과 구분합니다.

REST run의 head_sha/completed/success와 job 최종결론을 다시 대조한 영수증은 `score-capacity-ci-final-498b0e1c-c6f8-4646-8281-5a8dfffa3e40.json`입니다. 로컬 산출물과 같은 `src-tauri/target/runtime-validation/` 아래에 보존합니다.

위 진행 중/새원격 미실행은 이전 시점의 이력입니다. 로컬Windows/새3613파일ZIP·실제PS5.1/독립Python·해당EXE/ZIP Defender까지 이 후속의 검증/문서화를 완료했습니다. 새설치/개인 자료/실제Windows 키·Explorer·별도Windows10/11·서명/최종출시와 고급 정답/특화 모델 조건은 미완료로 유지합니다. 결과 확정 문서는 중복CI를 피하도록 로컬 커밋으로 보존하고 다음 실제 코드 변경 push에 포함합니다. 현재사용자 앱/입력·REC/개인자료/generic 포인터는 불변입니다.

## 파일 끌어놓기 후속의 원격 기능·격리 설치 확정 — 2026-10-25

### 1. 작업 개요

완료일2026-10-25. 프로젝트 없는 파일 입력 후속 source `847296d5b4d28503eecdac97ba097f1f1d6b14cc`의 독립Windows 패키지와 원격 기능/실제Server 설치를 검증했습니다. 전체Phase8/별도Windows10/11·실제Explorer drop 수용은 미완료이며9개 기본/5개 부분 상태를 유지합니다.

### 2. 구현 및 변경 사항

제품/격리 설치의 main HTML5 입력 설정을 같은 타입으로 검사했고 기존CSP/원격·YouTube 권한은 유지했습니다. 변경 코드와 전체 파일 목록은 [Phase2](PHASE-02.md)의 최신 절을 따릅니다. root README·로드맵/진행표·남은 작업에 원격 최종 결과와 미실행 범위를 반영했으며 개인 자료/현재PC 앱·입력/REC·generic 실행 포인터를 바꾸지 않았습니다.

### 3. 테스트 결과

- [기능40185819117](https://github.com/BomJin2/GuitarLab/actions/runs/40185819117)/job121146256106: 사후 정리까지 **success**.492프론트/106파일·기본240Rust/42.56초·확장244Rust/47.51초(각28개 환경 의존 기본 제외), 예제1+1·AI113/2.41초·개발 도구143/14.964초(제외 없음), 타입/lint/Vite/포맷·Clippy·Rust1.90 전체 컴파일12.14초를 확인했습니다.
- [격리 설치40185819137](https://github.com/BomJin2/GuitarLab/actions/runs/40185819137)/job121146256206: 사후 정리까지 **success**. 실제 `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/Test-ValidationInstaller.ps1 -BuildProfile release`에서 별도 식별자 release 설치·새DB9/빈 보관/녹음 없음·3393runtime/고지 전체 지문·3583ms 시작 대기·정상종료0·제거 등록 해제·AppData/알 수 없는 파일 보존을 확인했습니다. 관리자CI 토큰/모델 미포함/`cleanWindowsValidated=false`를 그대로 기록합니다.
- 설치 영수증 `installer-tests/6038c2ce-d591-489f-93b3-b301040b6107/receipt.json`, 식별자 `com.guitarlab.validation.run828819d254224a77a8b26b48f9410397`, 설치기SHA `c8ff6ec9ed152484c8140d747fb8c6f859477f04e3e5112963e9a6d1f2cc5013`. 최적화 앱7분04초/독립 도구2분45초 빌드도 성공했습니다.
- 로컬 내장4개/Windows 빌드·3613파일ZIP/전체SHA·CRC·같은 바이트 추출·실제PS5.1/개발PATH 제외Python3.12.15 두 번도 **성공**입니다. `file-drop-candidate-e32c362c-6929-4770-a0a4-bf5faa7d14d2.json`/`file-drop-package-receipt-8df107fc-7c3c-4c1c-8099-adf702580b26.json`과 실행 명령/전체 지문은 Phase2에 보존했습니다. 경로는 각 작업 공간의 `src-tauri/target/runtime-validation/` 아래입니다.
- 실제 REST run 응답으로 두 workflow의 `head_sha=847296d5b4d28503eecdac97ba097f1f1d6b14cc`/completed/success를 다시 대조한 증거는 `file-drop-ci-final-ba2fd5f9-1b94-446c-aca9-c50138f82667.json`입니다. 생성한 후보/ZIP만 대상으로 설치된 MpCmdRun4.18.26090.9 도움말의 `-Scan -ScanType 3 -File <단일 산출물> -DisableRemediation`를 사용한 현재PC 검사도 각각exit0/`found no threats`였고 후보EXE/ZIP의 정확한 SHA가 유지됐습니다. 제품 보호/제외 설정·정의 업데이트는 변경하지 않았으며 자동 삭제/격리는 적용하지 않았습니다. 정의1.461.194.0(2026-10-25 10:31:04 KST), 엔진1.1.26090.9·실시간 보호 켜짐/Authenticode `NotSigned`를 기록한 영수증은 `file-drop-defender-b9ad88cb-a1cb-4500-8a84-c7aca31a692d.json`입니다. 다른SHA의 원격NSIS나 다른 백신/SmartScreen·서명/최종배포 안전성 결과로 일반화하지 않습니다.
- 발생 오류와 해결: 첫 프론트 대상 검사의 JSDOM URL API/cleanup 순서 및 기존 heading 가정 실패는 테스트 대역/정리 순서로 해결했고 최종대상30개/전체492개로 재확인했습니다. 원격 두 workflow는 실패가 없었습니다. 실제Explorer/개인 파일·별도Windows10/11은 **미실행** — 사용자 자료/앱 조작과 별도OS 환경 부재를 자동 회귀로 대체하지 않습니다.

### 4. 미구현 및 알려진 문제

열린 프로젝트의 파일drop 자산 저장, 실제Explorer 조작·모델 있는 별도Windows10/11/오프라인·장치/백신/서명·최종 법률/출시 수용은 남습니다. 서버 설치의 시작/정상종료 성공이 물리적 파일drop이나 실제 기타 검증은 아닙니다. 고급 점수/특화 두 기타 모델의 품질·이용 조건도 별도 보류입니다.

### 5. 다음 작업 계획

기존 기능을 다시 구현하지 않고 남은 독립적인 실제 참조/특화 가중치·별도Windows 수용 조건과 Explorer drop을 확인할 수 있는 환경부터 이어갑니다. 결과 확정 문서는 로컬 커밋으로 보존하고 다음 실제 코드 변경 push에 포함해 중복 전체CI를 피합니다. 실제 사용자 데이터 교체/삭제·고급 점수 활성화로 외부 수용 조건을 대신하지 않습니다.

2026-10-25 두 출력 후속 확정: main1874417의 [Windows40183110904](https://github.com/BomJin2/GuitarLab/actions/runs/40183110904)/job121138145977는485프론트·기본240/확장243Rust·AI113/도구143·MSRV/사후 정리 **전체 success**입니다. 원본 테이크 WAV 보존/악보 출력 오류 안내와 source6d48613의최종Windows 내장·새3613파일ZIP·실제PS5.1/독립Python 두 번을 포함합니다. 지문/실패 해결·미실행은 PHASE-04A/PHASE-05 최신 절을 따릅니다. 사용자 자료/기존 앱·generic 포인터는 불변이며 새 앱 저장 창·새 설치/별도Windows10/11·서명/전체 출시 수용으로 확대하지 않습니다.

2026-10-25 긴 녹음 후속 확정: main89bcf8e의 [Windows40123636305](https://github.com/BomJin2/GuitarLab/actions/runs/40123636305)/job120960317516는476프론트·기본236/확장239Rust·AI113/도구143·MSRV/사후 정리까지 **전체 success**입니다. source0495a61의Windows 내장 빌드/새3613파일ZIP·전체SHA/CRC·실제PS5.1·독립Python 두 번도 성공했으며 지문/영수증은 Phase7 최신 절을 따릅니다. 실제 앱/개인 장기 녹음·새 설치/별도Windows10/11은 미실행이고 전체Phase8/최종 출시 완료로 표시하지 않습니다. 아래474개 확정은 직전 이력입니다.

2026-10-25 최신 후속 확정: main b56ee1b의 [Windows40120378119](https://github.com/BomJin2/GuitarLab/actions/runs/40120378119)/job120950419156는474프론트·기본234/확장237Rust·AI113/도구143·MSRV/정리까지 **전체 success**입니다. 보관 용량 최종 경계와 골페 표기 보호를 포함합니다. source66be01d의 새3613파일ZIP/전체 지문·새 추출/실제PS5.1·독립Python2회도 성공했으며 후보/지문은 Phase7 최신 절을 따릅니다. 앱 재실행·실제 사용자 자료 용량/연주·새 설치/별도Windows10/11 수용은 미실행이고 전체Phase8/출시 완료로 표시하지 않습니다.

## 보관 프로젝트 용량 확인 — 2026-10-25

### 1. 작업 개요

완료일2026-10-25. 사용자 데이터 정리의 읽기 전용 수직 슬라이스로 휴지통의 명시적 용량 확인을 구현하고 자동 검증했습니다. **영구 삭제/실제 회수 공간 계산·전체 Phase8 완료는 아닙니다.** 사용자 프로젝트/입력·녹음·모델과 실행 중인 앱을 조작하지 않았습니다.

### 2. 구현 및 변경 사항

- `storage/project_trash_usage.rs`: 현재 projectId/trashId/revision에 해당하는 관리 폴더의 metadata만 제한 집계합니다. 관리 파일 수·논리 바이트·외부 참조 개수를 분리하고 참조 원본을 열지 않습니다. 미분류 파일도 포함하며 자동 삭제 대상으로 간주하지 않습니다. 없는 관리 폴더는0으로 표시합니다.
- 기존 저장 작업/녹음 idle 보호와 writer/DB transaction으로 보관 복원을 직렬화하고 취소를 전달합니다. 심볼릭 링크/Windows reparse·특수 항목·10000항목/16단계/30초 초과·읽기 실패는 부분 결과를 게시하지 않습니다. 파일 내용 읽기·새 의존성/DB migration은 없습니다.
- `commands/project_trash_api.rs`·app 등록/원격 권한 회귀: 기존 v1 ID 요청과 StorageJob을 재사용하는 `inspect_trashed_project_usage`를 추가했습니다. 임의 경로를 받지 않습니다.
- `projectTrash.ts`의 엄격한 응답 검증과 `useProjects.ts`의 취소/상태 관리를 연결하고 `ProjectTrashPanel.tsx`는 ‘용량 확인’ 버튼/결과만 표시합니다. 실제 회수 가능 공간이 아니라는 안내와 외부 참조 제외를 명시했습니다. 관련 오류 문구·모의 controller 두 곳/테스트를 함께 갱신했습니다. 계약은 구현 전에 docs/12에 기록했고 docs/07·09·로드맵/진행표도 갱신했습니다.

### 3. 테스트 결과

- `pnpm typecheck`/`pnpm lint`: **성공**. 처음 타입 검사는 ResultsPage/RecordingPanel의 모의 controller에 새 필드2개가 빠져 실패했고 `trashUsage:null`/모의 함수 추가 후 통과했습니다.
- `pnpm exec vitest run src/features/library/projectTrash.test.ts src/features/library/LibraryPage.test.tsx src/features/library/useProjects.test.tsx`: 첫 관련 **32개 성공**. `pnpm test` 전체 **469개/103파일 성공**,44.90초. 추가 취소/화면 해제 후 `useProjects.test.tsx` **23개 성공**,3.53초 및 타입 재검사 성공입니다. 전체471개를 로컬에서 재실행했다고 기록하지 않으며 새 원격 대상입니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml project_trash_usage -- --nocapture`: **4개 성공**,8.76초. 외부 참조·미분류/빈 프로젝트·시간/17단계·실제10001항목·revision/오래된 trash/취소·Windows junction/원본 보존을 자체 임시 자료로 검사했습니다. 최초 컴파일은 rusqlite가 u64 직접 읽기를 지원하지 않아 실패했고 범위 검증한 u32→u64 변환으로 수정했습니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: **성공**,22.13초. `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features`: **237개 성공/28개 기본 제외**,17.77초. 로그 `runtime-validation/trash-usage-rust-20261025.log`를 보존합니다.
- `cargo +1.90.0 check --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features`/`cargo fmt --check`: **성공**,18.10초. `pnpm build`: **성공**,Vite2분1초/기존 큰 chunk 경고 유지. `pnpm format:check`: **성공**이며 기존 ignore 문서/Python/Rust를 Prettier가 검사한 것은 아닙니다.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **Windows 내장 실행 파일 빌드 성공**,15.14초/40,792,064바이트·SHA `5fdda6efa409600012c0d466b9c23be60a212aadedead2d8ca261c1a014341d6`. MSVC 링크 산출물 안내 경고는 유지됩니다. 기존 앱 재실행/실제 사용자 자료 용량 확인/새 설치 수용: **미실행** — 임시 자료/자동 회귀와 컴파일·별도 패키지만 검사했고 사용자 자료는 건드리지 않았습니다.
- `scripts/package_validation.py trash-usage-candidate-31f811dc-870a-46cf-ac79-43402924cc6e.json`: ef9d343 후보의 **새3613파일 ZIP 생성·전체 지문/CRC·새 폴더 추출 성공**. `validation-packages/2867cab8-d373-44d7-b9cd-c29eaa3ee030/GuitarLab-validation.zip`은40,189,781바이트/SHA `034d7eabf94e64794d218304e941e8216c83ada92ad077467974b58a206f6025`입니다. 실제 `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <새 추출본>/Test-ValidationPackage.ps1` **exit0/독립Python3.12.15 두 번 성공**이며 모델/앱·사용자 데이터는 실행/변경하지 않았습니다. 영수증 `trash-usage-package-receipt-cd25d42b-f8f3-4080-8877-78888a4029ef.json`, 추출본 `trash-usage-roundtrip-1293cd49-7474-4bc4-bead-0bb239e27a9c/GuitarLab`을 보존합니다. 최초 직접 검사는 ZIP 안의 `GuitarLab/` 접두어를 빠뜨려 목록 조회에 실패했고 추출 전에 중단됐습니다. ZIP을 수정하지 않고 기존 `verify_archive`를 재사용해 검증한 동일 바이트를 새 폴더에 추출했습니다.
- 직전 `97d7dc7`의 [Windows 회귀40117525600](https://github.com/BomJin2/GuitarLab/actions/runs/40117525600)/job120941829930: **전체 success**,466프론트·기본230/확장233Rust·AI113/도구143·MSRV/정리까지 성공했습니다. 이번 용량 확인 변경은 별도 후속 회귀 전입니다.

### 4. 미구현 및 알려진 문제

논리 바이트에는 압축/클러스터·hard link 공유 공간/DB 공유 파일·외부 동시 수정이 반영되지 않습니다. 관측 당시의 관리 폴더 크기이며 지속 감시/회수 가능 공간 보장이 아닙니다. 10000항목/16단계·권한/연결 경계에서 실패할 수 있고 이를0바이트로 숨기지 않습니다. 영구 삭제/불완전 삭제 복구·실제 AppData 교체·서명/다른 Windows10/11 수용은 미구현/미완료입니다.

### 5. 다음 작업 계획

ef9d343의 [원격40118428965](https://github.com/BomJin2/GuitarLab/actions/runs/40118428965)/job120944549176는 **전체 success**입니다.471프론트/103파일·기본234개39.02초/확장237개40.39초(각28개 제외)·예제1+1개·AI113개/5.73초·도구143개/14.093초·Clippy/MSRV/정리까지 통과했습니다. 실제 앱/사용자 자료 용량 수용을 대체하지 않습니다.

결과 검토 중 마지막 metadata 호출이 늦게 반환되거나 직후 취소되는 경계도 게시 전에 다시 확인하도록 scan 마지막에 공통 검사4줄을 보완했습니다. OS 호출 자체를 강제 중단하는 하드 시간 제한은 아닙니다. 보완 뒤 확장Rust **237개/28개 제외·17.10초**,Clippy6.86초/MSRV5.40초/fmt·Windows 내장 재빌드4.79초가 성공했습니다. 새 실행 파일 SHA `7c21097565a9437a7a4361c822fac3b5308f5a4757a90a2f6098aca5324bf8d6`이며 위3613파일 ZIP은 보완 전 ef9d343 산출물로 구분합니다. 보완의 새 원격/ZIP 수용은 아직 미실행입니다.

210ee8b의 [후속40119510042](https://github.com/BomJin2/GuitarLab/actions/runs/40119510042)/job120947770359도 **전체 success**입니다.471프론트·기본234개38.60초/확장237개40.69초·AI113개3.45초/도구143개13.931초·MSRV/정리를 통과해 최종 반환 경계의 원격 수용을 확정했습니다. 이후66be01d 골페 보호 패키지에는 같은 보완을 포함했으며 실제3613파일/PS5.1·독립Python2회도 성공했습니다. 최신 지문과 앱 미실행 상태는 Phase7 최신 절을 따릅니다.

실제 데이터 정리의 후속은 현재 논리 크기 보고를 삭제 권한/대상 목록으로 재사용하지 않고 외부 참조/알 수 없는 자료 보존과 중단 복구·명시적 확인을 먼저 요구합니다. 골페 표기는 실제 파서3개 실패를 재현해 공통 조건 한 줄로 수정했습니다. pYIN/배음 교정 기각과 고급 점수 비활성·독립 정답 필요성은 유지합니다.

## 초기화 대기 수정의 양쪽 원격 수용 확정 — 2026-10-25

8e6e7fa의 [기능40114852674](https://github.com/BomJin2/GuitarLab/actions/runs/40114852674)/job120933920738와 [설치40114852830](https://github.com/BomJin2/GuitarLab/actions/runs/40114852830)/job120933920945가 사후 정리까지 **모두 success**입니다. 기능은466프론트/103파일·타입/lint/Vite/포맷·기본Rust230/39.14초·확장233/38.50초(각28제외)·Clippy·예제1+1·AI113/2.59초·도구138/54.118초·MSRV1.90/12.92초를 통과했습니다.

새 Windows Server 설치는 runtime3393개/고지·최적화NSIS·실제설치·새v9/빈 데이터·정상종료0·독립Python2회·등록 제거/DB와 알 수 없는 파일 보존을 확인했습니다. 시작 기록 관측 **3236ms**로 기존 고정3초보다 길었습니다. 설치기 SHA **61fdd9665b011357905a6720d6ff0af29e2bdeda991d1f14556fd08ee328431b**,격리 identifier run1761fb8bebfd4032880784a9663625ef·검사b729c119…이며 원격 관리자토큰=true/현재PC=false의 차이를 유지합니다. 제품 코드를 바꾸거나 시작 기록/성공을 위조하지 않고 검사 준비 조건을 바로잡은 슬라이스 완료입니다.

아래 미확정/이전 실패는 과정 이력으로 보존합니다. 전체Phase8·별도Windows10/11/실제 장치·최종서명/법률 검토 수용은 미완료입니다. 다음은 이미 기각한 배음 교정을 재튜닝하는 대신 기존 공개 자료에서 다른 단음 기준선의 적용 가능성을 확인하는 Phase7 연구이며, 새 모델/의존성 설치·고급 점수 활성화 없이 별도로 검토합니다.

## 실제 현재PC 설치 확인·원격 재검증 추적 — 2026-10-25

남은 고지 근거도 읽기 전용으로 확인했습니다. selectors0.38.0의 설치VCS는 servo/stylo의572ecba2d1600e7c3d490586692a209faf703baa/selectors이며 [같은 commit의 선언](https://raw.githubusercontent.com/servo/stylo/572ecba2d1600e7c3d490586692a209faf703baa/selectors/Cargo.toml)은 MPL-2.0입니다. 이미 동봉한 원본crate SHA8adfa1c2…/설치lib.rs의 전체 바이트가 같고 MPL 헤더 SHA7523df24…를 보존했습니다.4958바이트의 공식 고정 루트 목록/원본crate에는 별도 LICENSE/NOTICE가 없었습니다. selectors-source-audit-401c72cb…/report.json에 원문 지문을 기록했으며 standalone 고지/최종 검토를 임의로 해결 처리하지 않았습니다. 의존성/배포 고지 원문/패키지는 변경하지 않았고 소스 실행·새 설치는 미실행입니다.

8e6e7fa의 검사 수정 후 현재PC에서 기존 모델/소스 캐시를 사용해 새 release NSIS를 빌드했습니다.2분05초의 앱 컴파일/NSIS 묶음 성공 뒤 `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File scripts/Test-ValidationInstaller.ps1 -BuildProfile release`가 **성공**했습니다. 새 식별자 com.guitarlab.validation.rund7fa7764672245da8b49355a4325d7a3·AppData/프로세스/설치경로만 사용했고 실제 관리자 토큰=false였습니다.

시작 기록 대기1455ms·새v9/quick_check/빈 프로젝트·보관 목록/녹음 없음·runtime3393/모든고지·NSIS 표식 외본문 동등성·정상종료0·독립Python2회·제거 후DB/알 수 없는 파일/등록 제거까지 성공했습니다. installer-tests/d0fe3b87-4f52-4e1f-8630-c8ae01f45c5b/receipt.json과 installer-startup-local-20261025.log에 보존했습니다. 설치기 SHA **39031dab462ad6fde0f61a1d179ee1a53afceaa40335349e76ba0369ae715ccd**,설치본문 SHA **80dacbc35697d75868a10bd94fa6c04b6e5212e2d74b3b595687bd3623d47cf5**입니다. 제품 앱/기존 개인 데이터는 변경하지 않았습니다.

원격 [기능40114852674](https://github.com/BomJin2/GuitarLab/actions/runs/40114852674)/job120933920738와 [설치40114852830](https://github.com/BomJin2/GuitarLab/actions/runs/40114852830)/job120933920945는 조회 시 in_progress/단계 목록 공백이어서 **결론 미확정**입니다. 로컬 성공으로 이전 원격 실패를 덮어쓰지 않으며 두 원격의 실제 결과를 계속 확인합니다. 별도Windows10/11·장치/최종출시 수용은 미완료입니다.

## 후속 — 원격 설치 초기화 기록 대기 경계 (2026-10-25)

### 1. 작업 개요

확인/작업일2026-10-25. 중단 전 fbb7297의 원격 기능 회귀는 성공했으나 격리 설치는 시작 기록 부재로 실패했습니다. 창/파일 게시를 함께 관측하는 검사 수정·로컬 회귀를 완료했으며 **원격 재검증 전 해결 완료로 표시하지 않습니다**. 제품/사용자 앱·DB·모델/녹음 동작은 변경하지 않았고 전체Phase8은 미완료입니다.

### 2. 구현 및 변경 사항

Test-ValidationInstaller.ps1의 ‘3초 뒤 기록이 반드시 존재’ 가정을 제거했습니다. 새 Get-ValidationReadyJournal은 살아 있는 올바른 창과 정상APP_STARTED를 함께 확인하고 최대30초/200ms 간격으로 기다립니다. 파일 부재/일시적 공유·잠금32/33만 대기하고,종료/권한·다른I/O/손상JSON·잘못된버전/실패 이벤트는 즉시 실패합니다.16KiB/배열1~64개 경계를 확인하며 시간 초과 영수증을 기록하고 강제 종료/제거하지 않습니다. test_prepare_validation_installer.py에 실제PS5.1의 지연 게시·종료/잘못된 창·불응답·빈/초과/디렉터리/손상·Boolean/비배열·I/O 회귀를 추가했습니다. docs/12·09/로드맵·진행 문서를 갱신했습니다.

### 3. 테스트 결과

- fbb7297 [기능40095072468](https://github.com/BomJin2/GuitarLab/actions/runs/40095072468)/job120875486269: **전체 성공**.466프론트/103파일·타입/lint/Vite/포맷·기본Rust230/52.85초·확장233/85.79초(각28제외)·Clippy·예제1+1·AI113/2.64초·도구137/17.979초·MSRV1.90/12.48초·정리/캐시를 확인했습니다.
- 같은 [설치40095072485](https://github.com/BomJin2/GuitarLab/actions/runs/40095072485)/job120875486322: **실패**. 새Windows Server의 고정runtime3393개/고지SHA44dc6463…·최적화NSIS/실제 설치·본문표식 외동등성/모든설치파일은 성공했습니다. 창 응답/제목 확인 뒤 diagnostics/native-v1.json 부재로 실패했으며 영수증은 INSTALLATION_STARTED였습니다. DB 확인·정상종료/제거는 **미실행**입니다. 단순 지연인지 실제 게시 실패인지는 수정 후 원격 결과로 확인해야 합니다.
- `python -B -X utf8 -m unittest discover -s scripts -p test_prepare_validation_installer.py -v`: **7개 성공**,2.565초·파일경계 보강 뒤2.554초. 같은 번들Python3.12.15도 **7개/1.757초 성공**(최종 빈/초과 파일 추가 전). 전체도구 **138개 수행137성공/링크권한1제외**,11.817초(파일경계 추가 전); 이후 대상7개 보강 검사는 성공했습니다. 실제PS5.1에서 반복 부재 뒤 게시/공유32·잠금33은 대기,접근거부/기타오류·손상은 실패로 남습니다.
- 중단 전 최종 ZIP도 확정했습니다. validation-packages/a5333f69-284c-44d3-ab4e-f043d5013208/GuitarLab-validation.zip **3613파일/40,166,509바이트**,SHA **86c68508445e1c8ef3b515846d91242e594446a92069260d001fb914b6010105**입니다. fbb7297의 release/README 포함 전체SHA/CRC/새추출/실제PS5.1 exit0·독립Python2회가 성공했습니다. release-inputs-final-package-6637b22d…/추출 d994a086…에 보존했습니다. 앱 시작/모델 설치/사용자 데이터 변경은 하지 않았습니다.
- 수정 후 실제 원격 설치/프론트·Rust 재빌드/실장치: **미실행** — 우선 검사 도구만 수정했습니다. 새 설치 CI로 같은 실패가 재현되는지 확인하며 제품 초기화 기록을 위조하거나 검사 조건을 생략하지 않습니다.

### 4. 미구현 및 알려진 문제

파일이 계속 게시되지 않는 실제 오류를 대기로 숨기지 않습니다. 제한 시간 초과/실패는 그대로 실패이며 이전 설치·앱 데이터를 보존합니다. 별도Windows10/11·서명/최종 법률 검토/실제 장치 지연은 미수용입니다.

### 5. 다음 작업 계획

새 설치/전체 회귀를 실행해 창+APP_STARTED·새v9DB·정상종료/제거·독립runtime까지 확인합니다. 다시 실패하면 단계/영수증과 실제 파일 상태를 보강해 원인을 좁힙니다. 사용자에게 같은 기타/UI 테스트를 요청하지 않고 제품/개인 데이터는 유지합니다.

## 후속 — 배포 고지의 의존성 변경 거부·PS5.1 검사 복구 (2026-10-24)

### 1. 작업 개요

작업일2026-10-24. 현재 의존성/런타임과 오래된 고지 목록이 함께 배포되는 것을 막는 슬라이스입니다. 로컬 구현/검사 완료이며 새 원격 결과와 최종 ZIP은 후속 확정에 기록합니다. 앱/UI·오디오/모델·실제 사용자 데이터는 바꾸지 않았고 전체Phase8/최종 출시 수용은 미완료입니다.

### 2. 구현 및 변경 사항

- collect_release_inventory.py: 기존4개 manifest/lock의 제한된 UTF-8·CRLF→LF 지문을 고지 수집 결과에 묶습니다. package_validation.py의 공통 검사는 이4개와 실제 runtime lock이 다르거나 누락되면 신규ZIP을 거부합니다. prepare_validation_installer.py와 이를 호출하는 CI 준비도 같은 검사 후에만 새 설정/포인터를 만들고 dependencyInventorySha256을 기록합니다. 이전ZIP/설치기는 불변입니다.
- 현재 npm6개/Rust273개의 정확한 버전/선언조건과 원문·자산/소스archive5개를 새 오프라인 그래프로 대조했습니다. 기존282개 구성은 동일하고 runtime 고지14개도 현 lock과 같습니다. inventory에 남아 있던 이전 lock SHA da95bce0…를 실제 **191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d**로 갱신했습니다. 원문/런타임은 바꾸지 않았고 legalReviewCompleted=false입니다.
- Test-ValidationPackage.ps1: PS5.1의 부분 모듈 자동 로딩에서 Get-FileHash 함수가 없던 실패를 재현해 현재 PSHOME의 공식Utility 전체를 먼저 import합니다. 임시 모듈 환경 보정으로도 실패했으며 시스템/개인 설정을 바꾸는 우회는 채택하지 않았습니다. 실패/성공 추출 폴더/영수증은 모두 보존합니다.3개 테스트 파일·docs/12/09·release/README·진행 문서를 갱신했습니다.

### 3. 테스트 결과

- 새 `pnpm list --prod --depth Infinity --json`·`cargo metadata --locked --offline --all-features --filter-platform x86_64-pc-windows-msvc --format-version 1`: **성공**,npm6/Rust273·고지/자산/SHA·소스5개·Python고지14개 일치. runtime-validation/release-dependency-audit-58fa8120-b4e2-4cda-ba44-ca199573213a에 이전 목록과 대조/지문을 보존했습니다. 최종 inventory SHA **44dc6463f5c2c665a241d4c1b163f75458665f6e6c98c060124377f6e86b738d**입니다. 원문CRLF 형식은 유지했습니다.
- 수집5개/0.220초·ZIP13개/0.697초 성공 후 실제 저장소 일치 검사를 추가해 ZIP14개/0.661초·NSIS6개/1.438초 성공. NSIS는 고지 누락/의존성 변경 거부·출력/이전 포인터 보존·debug/release4회 독립 이름/경로와 고지SHA를 확인합니다. 번들Python3.12.15에서도 수집5개/0.165초·ZIP14개/0.669초·NSIS6개/1.192초 **성공**입니다.
- 최종 `python -B -X utf8 -m unittest discover -s scripts -p 'test_*.py'`: **137개 수행136성공/링크권한1제외**,9.649초. 일반Windows에서 DEMO만 사용했습니다. `git -c core.whitespace=cr-at-eol diff --check` 성공이며 원문 보존용 CRLF를 임의 변환하지 않습니다.
- 최초 ZIP ab2d0042…는 생성 성공 뒤 오래된 runtime 고지 지문을 발견해 보존하고 개선했습니다.633efebb…는 새 지문/CRC 검증 후 PS5.1 Get-FileHash 로딩에 실패했습니다. 자식 PSModulePath 보정 재시도도 실패했고 cb170e9a…를 보존했습니다. 기본 모듈 명시 후 새89fa75c6… ZIP **3613파일/40,166,130바이트**·SHA **5e767fb1a2497672d40660011ec5d770563a5ed04bb45af16cb0f09c44d48e41**의 전체검증/새추출/실제PS5.1 **exit0**·독립Python2회가 성공했습니다. 특별한 환경 보정은 사용하지 않았습니다. release-inputs-package-roundtrip-3aabff9f…/추출 dfe8768d…에 증거를 보존했습니다. 이후 release/README를 포함한 최종ZIP은 다음 확정에 기록합니다.
- 앱/프론트 재빌드·실장치/새 OS·새 설치기 설치/제거: **미실행** — 제품 코드는 불변이고 배포 준비/검증 경계만 수정했습니다. 별도Windows·최종 이용 조건/서명 수용을 주장하지 않습니다.

### 4. 미구현 및 알려진 문제

지문은 현재 고지/입력의 대응을 지키며 법률 검토를 대신하지 않습니다. metadata는 현재 그래프에서 새로 export해 대조해야 합니다. selectors 고유 고지 부재·모델/가중치/하위 vendor 최종 검토,별도Windows10/11·백신/서명과 실제 장치 지연 수용은 남습니다. 관측된 음정 후보는 계속 기각/미적용 상태입니다.

### 5. 다음 작업 계획

현재 고지/입력 검사를 새 원격/독립 설치 준비에서 재현하고 최종ZIP 영수증을 보존합니다. 오류가 있으면 실제 경로에서 원인을 해결하며 모델/사용자 파일·앱 재시작을 요구하지 않습니다. 전체Phase 완료 조건과 외부 환경/고급 품질 제약은 유지합니다.

## 원격 확정 — 후보 감사133개 포함 회귀 (2026-10-24)

cefb677의 [Windows40093777161](https://github.com/BomJin2/GuitarLab/actions/runs/40093777161)/job120871682101는 **전체 success**입니다.466프론트/103파일·타입/lint/Vite/포맷·기본Rust230개/44.81초·확장233개/44.35초(각28개 제외)·Clippy·예제1+1·AI113개/11.73초·도구133개/22.720초·MSRV1.90/12.52초와 정리/캐시를 통과했습니다.137개 배포 고지 후속은 별도 변경이며 새Windows/모델/장치 수용은 아닙니다.

## 원격 확정 — 배음 관측 도구128개 포함 회귀 (2026-10-24)

d16a2cb의 [Windows40078292641](https://github.com/BomJin2/GuitarLab/actions/runs/40078292641)/job120826303023는 **전체 success**입니다.466프론트/103파일·타입/lint/Vite/포맷·기본Rust230개/36.97초·확장233개/36.04초(각28개 제외)·Clippy·예제1+1·AI113개/1.78초·도구128개/12.211초·MSRV1.90/8.14초와 캐시/사후 정리를 통과했습니다. 새로운133개 감사 도구/새 표본 결과는 이 SHA 뒤의 후속입니다. 제품 앱/데이터는 유지하며 실장치·모델 opt-in/별도Windows 수용과 전체Phase8 완료는 주장하지 않습니다.

## 원격 확정 — 꾸밈음 보호466개 회귀 (2026-10-24)

1bbeb5d의 [Windows40076324332](https://github.com/BomJin2/GuitarLab/actions/runs/40076324332)/job120820331539는 **전체 success**입니다. 프론트466개/103파일·타입/lint/Vite/포맷·기본Rust230개/36.76초·확장233개/40.01초(각28개 기본제외)·Clippy/예제1+1·AI113개/2.74초·도구123개/12.494초·MSRV1.90/12.86초·캐시 복원/사후 정리가 성공했습니다. 현재 앱 PID34928/PTY81995·데이터/패키지 수용은 PHASE-07을 따릅니다. 이후 배음 관측 도구의128개 로컬/번들5개 성공은 별도 후속이며 이 SHA에 포함되지 않습니다. 실제 주법·새 Windows10/11 수용은 미실행입니다.

## 원격 확정 — 장식음 보호463개 회귀 (2026-10-24)

664f7af의 [Windows40075167130](https://github.com/BomJin2/GuitarLab/actions/runs/40075167130)/job120816843498은 **전체 success**입니다. 프론트463개/103파일·타입/lint/Vite/포맷·기본Rust230개/56.33초·확장233개/45.02초(각28개 기본제외)·Clippy/두 예제1+1·AI113개/5.48초·도구123개/29.144초·MSRV1.90/13.41초·캐시 복원/사후 정리를 확인했습니다. 새로운 단계/상한에서 모든 검사를 실행했고 검사를 생략하지 않았습니다. 이후 꾸밈음466개/새 Windows 후보는 별도 후속이며 실제 주법/모델 opt-in·새 Windows10/11 수용은 CI에서 미실행입니다.

## 원격 확정 — 단계 분리/감사 도구 전체 회귀 (2026-10-24)

675718a의 [Windows40073869598](https://github.com/BomJin2/GuitarLab/actions/runs/40073869598)/job120812949359는 **전체 success**입니다. 새 workflow 키1406df2c…의 cold cache에서 기본Clippy133초/기본Rust컴파일178초·230개/45.00초,분리된 확장Clippy22.82초/컴파일90초·233개/45.40초(각28개 기본제외),예제1+1·AI113개/2.82초·도구123개/19.183초·MSRV119초·프론트458개/103파일/타입·lint/Vite/포맷 및 사후 캐시 저장/정리까지 통과했습니다.10/10/5/5분 각 상한 안에서 모든 명령을 실행했고 검사 생략은 없습니다. 새 장식음463개/Windows 후보는 이 SHA 뒤의 별도 후속입니다. 실제 모델/공개 자료 opt-in·장치/새 Windows 검사는 CI에서 미실행이며 아래 원격 대기 문구는 이전 이력입니다.

## 원격 확정 — 공개 DI 수신·관측 후속 포함 (2026-10-24)

f0662a4의 [Windows40072729540](https://github.com/BomJin2/GuitarLab/actions/runs/40072729540)/job120809466730은 **전체 success**로07:15:37UTC에 종료했습니다. 프론트458개/103파일·타입/lint/Vite/포맷·기본Rust230개/52.16초·확장233개/88.97초(각28개 제외)·Clippy·예제1+1개·AI113개/2.80초·도구120개/16.955초·MSRV1.90/12.27초·캐시 복원/정리까지 통과했습니다. deferred_recording 테스트도 양쪽 성공입니다. 확장 컴파일76초/테스트88.97초 및 예제 컴파일51.95초로 단일 단계 소요가 늘었으며 실제 두 번째 교착으로 확정하지 않습니다. 결론 전 API의 진행 상태는 이력으로 구분합니다. 공개 자료/모델 opt-in·실장치/다른 Windows10/11 수용은 이 CI에서 미실행입니다. 다음 감사6678139·단계 분리cb66001의123도구/새 설정은 아직 이 SHA에 포함되지 않습니다.

## 후속 — 확장 CI 단계 분리·즉시 로그와 대기 상한 (2026-10-24)

### 1. 작업 개요

작업일2026-10-24. f0662a4 원격40072729540은 기본 회귀를 통과했지만 기존 단일 확장 단계가 다시 장시간 진행 중입니다. 정적 검사/라이브러리 검사/두 예제 중 어디가 지연되는지 쉽게 구분하고, 실패 관측의 출력이 전체 검사 종료까지 가려지지 않도록 개선합니다. 로컬 설정/명령 검증 완료, 새 원격 적용은 대기입니다.

### 2. 구현 및 변경 사항

.github/workflows/verify.yml의 같은4개 명령을 별도 순차 단계로 옮겼습니다. 확장Clippy/테스트는각10분,예제각5분의 상한을 두고 기존45분 job 상한은 유지합니다. 확장 테스트는 --nocapture/RUST_BACKTRACE=short를 사용해 중단 당시 테스트의 실제 실패 출력/스택도 남깁니다. 검사/--locked/특성·예제·실패 exit 기준을 삭제하거나 병렬화하지 않았으며 새 action/의존성/권한은 없습니다. workflow 지문을 포함하는 기존 캐시 키 정책상 다음 실행은 새 키가 될 수 있습니다. 제품 앱/패키지·자료/모델은 바꾸지 않습니다.

### 3. 테스트 결과

- `pnpm exec prettier --check .github/workflows/verify.yml`: **성공**,YAML 구문/포맷을 확인했습니다. 별도 PyYAML은 설치돼 있지 않아 추가하지 않았습니다.
- `RUST_BACKTRACE=short cargo test --locked --all-features --manifest-path src-tauri/Cargo.toml deferred_recording_keeps -- --nocapture`: **1개 성공**,1.65초. 의도적인 관측 실패의 panic/스택이 즉시 보이면서 catch_unwind 뒤 복구 가능 상태/원본 보존이 통과함을 확인했습니다. 로그의 ‘자체 관측 대기 실패 주입’은 이 성공 검사 안의 의도적 실패입니다.
- Clippy/전체Rust/MSRV/프론트 재실행: **미실행** — 명령 단계/출력 설정만 수정했고 직전233개/5.02초Clippy·MSRV와 성공한8d05c65 원격 검증을 재사용합니다. 모든 검사를 새 원격에서 다시 실행합니다.

### 4. 미구현 및 알려진 문제

현재 f0662a4의 지연 명령/원인은 완료 로그 전까지 미확인입니다. 분리/상한은 원인 수정을 대신하지 않으며 상한 초과는 성공이 아니라 실패로 기록합니다. 새 캐시 키의 첫 컴파일/실행기 부하에 따라 소요 시간은 달라집니다. 실제 기타/별도Windows·서명 수용은 여전히 미완료입니다.

### 5. 다음 작업 계획

기존 실행의 결론/로그를 확인한 뒤 감사 도구와 새 설정을 올려 별도 단계의 원격 전체 회귀를 확인합니다. 실패가 나면 정확한 단계/로그를 근거로 수정하며 검사를 생략하거나 제품 timeout을 완화하지 않습니다. 현재 앱/미저장 사용자 자료는 계속 유지합니다.

## 원격 확정 — 관측 실패 교착 수정 수용 (2026-10-24)

8d05c65의 [Windows40071836396](https://github.com/BomJin2/GuitarLab/actions/runs/40071836396)/job120806750717은 **전체 success**입니다. 프론트458개/103파일·타입/ESLint/Vite/Prettier·Rust fmt/Clippy·기본229개/50.44초·확장232개/39.38초(각27개 제외)·native예제1+1개·AI113개/2.17초·도구115개/16.219초·MSRV1.90/8.99초·캐시 복원/사후 정리까지 통과했습니다. 같은 deferred_recording 테스트가 기본/확장 양쪽에서 끝났습니다. 모델/공개파일 opt-in·실장치/별도Windows10/11은 미실행이며 후속EG-IPT 도구/관측 코드는 이 SHA에 포함되지 않습니다. 아래 원격 미확인/업로드 전 문구는 이전 이력입니다. 전체Phase8 완료를 뜻하지 않습니다.

## 후속 — Windows 녹음 회귀의 관측 실패 교착 해소 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 이전4a31712의 원격40053976117/job120752707206을 조회해45분 제한 취소를 확인했습니다. 기본 앱449개/기본Rust228개는 성공했고 확장 검사는 deferred_recording_keeps_early_pcm_and_never_marks_unmapped_audio_ready가60초 이상 실행 중이라는 마지막 기록을 남겼습니다. 실패 정리 슬라이스는 로컬 검증 완료이며 새 원격 전체 성공은 미확인입니다.

### 2. 구현 및 변경 사항

src-tauri/src/storage/recordings_tests.rs에서 sender를 scoped 작업 본문이 소유하도록 옮겼습니다. 기존에는3초 관측 대기의 panic 때 sender가 scope 밖에 남아 worker가 계속 기다리고 scope의 join도 끝나지 않을 수 있었습니다. 로그에 panic 원문이 없어 CI에서 정확히 어떤 관측 assert가 먼저 실패했는지는 확정하지 않습니다. 관측 대기는 느린 파일 I/O를 고려해30초로 제한하고, 의도적 관측 실패를 같은 테스트에 추가해 panic 회수·채널 단절/복구 가능한48000프레임을 확인합니다. 제품 녹음 timeout·worker·채점/DB/워크플로우 시간 제한은 변경하지 않았습니다. docs/09·08 및 진행 문서에 기록합니다.

### 3. 테스트 결과

- 최초 수명 수정 후 대상1개 **성공**,1.16초/컴파일33.59초. 실패 주입 포함 대상1개 **성공**,1.34초/컴파일14.44초.
- 정상 연결 READY192000프레임, 미연결 CLOCK_UNCERTAIN48000프레임, 관측 실패 INPUT_NOT_ACTIVE48000프레임 및 부분 WAV 보존을 확인했습니다.
- `cargo test --locked --all-features --manifest-path src-tauri/Cargo.toml`: **232개 성공·27개 기본 제외**,11.25초. 기존 자식 helper1개는 부모가 실제 실행합니다.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`·확장 all-targets/all-features Clippy `-D warnings`: **성공**,후자8.91초. 기존 MSVC 출력 경고 외 오류 없습니다.
- 제품 빌드/앱 재실행·프론트·실장치: **미실행** — cfg(test)와 문서뿐이며 기존 주법 보호 앱을 유지했습니다. 새 원격 결과는 후속 기록합니다.

### 4. 미구현 및 알려진 문제

원격 파일 I/O 지연 원인과 실패한 관측 assert 원문은 미확인입니다. 로컬 성공만으로 원격 수용을 완료하지 않습니다. 대기 시간을 늘려도 잘못된 시각/프레임·상태는 기존 assertion으로 실패합니다. 실제 앱/드라이버 교착 검증이나 전체 Phase8 완료는 아닙니다.

### 5. 다음 작업 계획

완료한 로컬 후속을 main에 업로드해 새 Windows 전체 회귀를 확인합니다. 앱/개인 데이터를 유지하며 별도로 Phase7 고정8개 EG-IPT 표본의 제한 수신·무결성 도구를 이어갑니다. source 라벨만으로 주법 판정/일반화 정확도를 주장하지 않습니다.

## 후속 — 합성 녹음 프로세스 종료 후 실제 파일 복구 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 기존 부분 파일/실패 주입 회귀를 보완해 실제 자식 프로세스가 WAV writer의 Drop/finish 없이 끝난 뒤 저장소 재열기·새 테이크 복구까지 검사했습니다. 이 회귀 후속은 완료이며 전원 차단/실제 앱·장치 크래시 수용이나 전체 Phase8 완료를 의미하지 않습니다. 현재 사용자 앱 PID30808/PTY82434·입력/개인 녹음은 그대로 유지했습니다.

### 2. 구현 및 변경 사항

- src-tauri/src/storage/recordings_tests.rs: 명시적 ignore child helper와 기본 회귀에서 실행하는 부모 검사1개를 추가했습니다. std Command/current_exe만 사용하고 Windows 콘솔을 만들지 않습니다. 외부 모델/라이브러리·shell 명령은 없습니다.
- 자식 입력은4096바이트 이하의 고정 배열/임시 fixture 이름·UUID·temp 상위·앱 데이터 폴더명·프로젝트/테이크 UUID·기존 checked_file 경계를 검증합니다. 실제 제품 AppData 경로를 받지 않습니다.
- 합성48000프레임을 flush하고1234프레임을 writer 버퍼에 남겨 process::exit(73)으로 종료합니다. 부모는10초 한도에서 자신이 시작한 자식만 회수하며 사용자 GuitarLab을 종료하지 않습니다.
- 부모는 미확정 헤더/실제 남은 prefix→새 ProjectStore 초기화/중단 표시→새 UUID READY 복구, PCM/길이·원본 part/원본 metadata/악보 revision 보존을 확인합니다. 제품 저장/복구 코드는 수정하지 않았습니다.
- docs/09와 진행 문서에 검사 범위·실패/미실행 및 재개 지점을 기록합니다.

### 3. 테스트 결과

- 최초 컴파일은 테스트의 assert_eq가 기존 RecordingState/RecordedTake에 없는 Debug/PartialEq를 요구해 실패했습니다. 제품 타입을 테스트 때문에 확장하지 않고 기존 코드처럼 상태 bool 비교/metadata 직렬화 비교로 수정했습니다.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml abrupt_process_exit -- --nocapture`: **부모1개 성공**,0.35초/컴파일11.64초. 부모가 별도 helper를 실제 실행했고 exit73과48000프레임만 남은 파일을 확인했습니다. helper의 ignore 표시는 미실행이 아니라 부모 전용 진입점입니다.
- `cargo fmt --check`: **성공**. all-targets/all-features `cargo clippy --locked --offline ... -- -D warnings`: **성공**,9.45초.
- `cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml`: **232개 성공/27개 기본 제외**,11.37초(컴파일17.15초).27개 중 이 helper1개는 위 부모가 명시적으로 실행했고 나머지26개는 기존 모델/자료/장치 opt-in 검사입니다.
- `cargo +1.90.0 check --locked --offline --all-targets --all-features ...`: **성공**,9.27초. 기존 linker/incremental 복사 경고 외 오류 없습니다. 전체 검사는 일반 Windows 환경의 자체 임시 fixture만 사용했습니다.
- 프론트 재검사/제품 앱 재빌드·재실행: **미실행** — 이번 변경은 cfg(test) 안의 Rust 회귀와 문서뿐입니다. 직전458개·주법 보호 앱/패키지 수용을 재사용하며 현재 앱을 새로 열지 않았습니다. 새 원격 전체 회귀는 업로드 전입니다.

### 4. 미구현 및 알려진 문제

마지막 사용자 공간 버퍼1234프레임은 보존되지 않는 것이 이번 검사에서 확인된 경계입니다. flush한 prefix의 프로세스 종료 뒤 보존만 확인하며 전원 상실/OS 캐시·파일 시스템 장애의 내구성이나 실제 CPAL callback/서비스 전체 크래시까지 보장하지 않습니다. 사용자의 실제 녹음이나 앱을 강제 종료하는 검사는 실행하지 않았습니다.

### 5. 다음 작업 계획

기존 실행 중인 Windows40053976117의 결론을 먼저 확인한 뒤 완료한 후속들을 push해 새 전체 회귀에 포함합니다. 이전 CI를 새 push로 취소하지 않도록 순서를 지킵니다. 이후 Phase7의 독립 주법 참조는 공식 출처/이용 조건·실제 주석 필드부터 확인하고, 품질 근거 없이 모델/고급 점수를 추가하지 않습니다. 별도Windows·서명/최종 배포 제약은 기존 남은 작업을 유지합니다.

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
## 전역 단축키 충돌 자동 회귀 후속 — 2026-10-24

## 1. 작업 개요

작업일2026-10-24. 사용자가 수면 중 직접 테스트를 요청하지 말라고 지정해 기존 고정 앱/실제 입력·REC·개인 데이터는 그대로 두고, Phase8 안정성의 자동 재현 가능한 키보드 경계만 보완합니다. 전체 Phase8과 미수용5개 단계의 완료를 의미하지 않습니다. 현재 빌드·최종 검증은 진행 중이며 확정 결과는 아래에 추가합니다.

## 2. 구현 및 변경 사항

- `src/features/player/TransportBar.tsx`: 악보에서 처리한 좌우 키의 전역5초 중복 탐색을 막고 Space/R 길게 누름·IME 조합 입력을 보호합니다. 일반 영역의 좌우 탐색/반복은 유지합니다. SVG 하위 요소도 버튼/링크/summary/구분선 보호에 포함합니다.
- `src/shared/keyboard.ts`와 테스트: 기존 DOM 기능으로 표준/커스텀 텍스트 입력·상속 contenteditable·명시적 false를 판별합니다. 외부 의존성을 추가하지 않았습니다.
- `src/app/App.tsx`와 테스트: 전역 화면 전환/도움말도 처리 완료·조합 입력·반복 키를 무시합니다.
- `src/features/player/TransportBar.test.tsx`, `src/features/score/ScoreViewport.test.tsx`: 격리 호출뿐 아니라 실제 악보 선택 핸들러와 transport를 함께 렌더링해 중복 탐색을 확인합니다.
- `docs/12`, `docs/09`, 진행 README/남은 작업: 이벤트 소유권·검사 범위·다음 재개 위치를 기록합니다. IPC/DB/악보·모델 버전과 제품 DSP는 유지합니다.

## 3. 테스트 결과

- 수정 전 transport 회귀8개 중 새5개 **실패**, 기존3개 성공으로 문제를 재현했습니다. 최초 테스트에서 비어 있는 엔진의 실제 seek를 spy가 호출해 부수 오류2개가 발생했습니다. 테스트의 명령 경계를 mock으로 명시한 뒤 다시 실행해 부수 오류 없이 같은5개 실패를 확인했습니다.
- 수정 후 `pnpm exec vitest run src/shared/keyboard.test.ts src/features/player/TransportBar.test.tsx src/app/App.test.tsx src/features/score/ScoreViewport.test.tsx`: **23개/4파일 성공**,4.68초.
- `pnpm test`: **444개/103파일 성공**,28.90초. 기존436개에8개 추가했습니다.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: **성공**.
- 최초 `pnpm build`: **실패**. 하위 pnpm이 기존 Corepack 경로를 사용해 latest 메타데이터를 네트워크로 조회하다 ENOTFOUND가 발생했습니다. 제품/의존성은 변경하지 않고 `$env:PATH="$env:APPDATA/npm;"+$env:PATH`로 설치된 고정 pnpm을 우선해 다시 실행 중입니다.
- 실제 Windows 앱 재시작/수동 키보드·기타 연주 검사: **미실행** — 사용자의 직접 테스트 없는 작업 지시에 따라 요청/실행하지 않았습니다. 기존 portable 후보를 새 기능 수용 완료로 바꾸지 않았습니다.

## 4. 미구현 및 알려진 문제

실제 WebView2/IME/접근성 보조 도구의 모든 키 조합을 자동 DOM 검사로 보증하지 않습니다. Shadow DOM 전용 커스텀 입력과 UI 전면 교체는 이번 범위가 아닙니다. 새 고정 실행 파일 적용/수동 수용·별도 Windows10/11·특화 모델/고급 인식 참조의 기존 제약은 유지합니다.

## 5. 다음 작업 계획

빌드와 최신 내장 자산 검사를 완료하고 검증한 소스를 Git에 보존한 뒤 Windows 회귀를 추적합니다. 사용자가 직접 확인할 때까지 기다리며 개발을 멈추거나 새 입력/녹음을 시작하지 않습니다. 자동 검사로 확인 가능한 독립적인 안정성 작업을 이어가되, 외부 조건이 필요한 단계는 미완료 상태를 유지합니다.

### 빌드 재검사

설치된 고정 pnpm을 PATH에서 우선한 `pnpm build`는 타입 검사 포함 **성공**, Vite74초/176모듈/main1,597.73kB·gzip426.53kB입니다. 기존500kB 번들 안내는 유지하며 단축키 수정과 무관한 리디자인/코드 분할은 하지 않았습니다. 최신dist를 포함한 native 번들 검사는 실행 중입니다.

### 최신 내장 자산 검사

`cargo test --locked --offline --all-features --manifest-path src-tauri/Cargo.toml bundle_tests`는 **3개 성공**(컴파일18.44초/테스트0.00초)입니다. 최신 프론트 진입점/JS와 허용 fixture·원격 권한 제한을 검사했습니다. 기존 incremental hardlink 실패→복사와 MSVC 라이브러리 생성 안내가 있었지만 빌드/테스트는 성공했습니다. 별도 실행 파일 빌드와 원격 전체 회귀는 다음으로 진행하며 앱은 실행하지 않습니다.

### 실행하지 않는 고정 Windows 후보/패키지 검사

- 소스 `3e0ada0`을 GitHub main에 보존했습니다. 새회귀는 [Windows40013246581](https://github.com/BomJin2/GuitarLab/actions/runs/40013246581)/job120618689178에서 진행 중입니다.
- 고정 LF 리소스 `c1f06f7b-fc00-4232-be25-f72e6bb1209c`의3393파일/64,095,466바이트를 현재 lock의 전체 지문과 대조했습니다. `pnpm tauri build --debug --no-bundle --ci --config src-tauri/target/runtime-validation/keyboard-00649c1a-9a3a-408f-83c5-4acb55aa6138/tauri.conf.json -- --locked --offline`는 **21.31초 성공**했습니다. EXE40,688,128바이트/SHA `46eae0bcbd47d78c3447b6020027b060d2e1e6953b82d2986d9c7d5f4cf23d4b`와 리소스를 새 portable/keyboard-00649c1a… 폴더에 복사/재검사했습니다. `keyboard-candidate.json`의 상태는 WINDOWS_BUILT_HASH_CHECKED_NOT_LAUNCHED이며 앱을 실행하지 않았습니다.
- 첫 ZIP은3613파일/39,983,874바이트/SHA `c78dd2b3e9df617786915d709c8b8c953f00fa34237f1aabbaa9c74d4a69cc9f`이고 ZIP/추출 전체 지문은 성공했지만 PowerShell5.1의 독립 Python 검사는 **실패(exit1)**했습니다. 구형 `manage_ai_model.exe`의 고정 inspect가 AI_RUNTIME_INTEGRITY를 반환했습니다. 해당 실패 ZIP/keyboard-package-roundtrip.json을 보존했으며 런타임 실행 성공으로 표시하지 않습니다.
- `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --example manage_ai_model`로 검증 도구도 같은 소스에서 다시 빌드해 **14.71초 성공**했습니다. 같은 후보 리소스의 inspect가 **Python3.12.15/두 모델 PACKAGE_MISSING·usable=false, exit0**으로 성공해 구형 lock을 내장한 도구와 새 LF 리소스 조합 문제를 확인했습니다. 기존 모델/실제 AppData를 읽거나 재설치하지 않았고 검사/지문을 완화하지 않았습니다. 재발 방지 절차를 `docs/13`에 추가했습니다.
- 재생성 ZIP은3613파일/39,981,202바이트/SHA `fb8524f766ad139329f6a60b08dadb175dbfec3a761222fc181a0d2399903ed6`, validation-packages/91a9bb08-17ff-4ac0-a87c-9b91044ef46d에 보존합니다. 새 추출/PowerShell 검사는 진행 중이며 현재 수용된 이전 `portable-candidate.json`은 유지합니다.

### 독립 패키지 재검사 확정

위 재생성 ZIP의 manifest/경로·전체 지문과 새 roundtrip-243d195f-070d-4576-81c3-a4340b9cb5ea 추출 파일 전체 지문은 **성공**했습니다. 기본 Windows PowerShell5.1의 `Test-ValidationPackage.ps1`도 **exit0 성공**했으며, PATH를 Windows/System32만 남긴 상태에서 독립 Python3.12.15를2회 실행해 두 모델 PACKAGE_MISSING 응답을 확인했습니다. 기록은 `keyboard-package-roundtrip-rebuilt.json`의 ZIP_AND_POWERSHELL51_CHECKED_NOT_LAUNCHED입니다. 새 앱 GUI/입력·REC는 실행하지 않았고 이 결과를 새PC/실제 모델 설치·Windows 키보드 수용으로 표시하지 않습니다. 이전 실패 영수증과 수용된 portable 후보도 그대로 보존했습니다.

### 원격 전체 회귀 확정과 재개 지점

소스 `3e0ada0`의 [Windows40013246581](https://github.com/BomJin2/GuitarLab/actions/runs/40013246581)/job120618689178은 **사후 정리 포함 전 단계 success**입니다. 정확한 기존 이미지/도구 키의 캐시 복원을 확인했지만 모든 검사를 다시 실행했습니다. 프론트 **444개/103파일**, 타입/lint/빌드/Prettier·cargo fmt/기본Clippy, 기본Rust **228개/39.09초**와 확장Clippy/all-features Rust **231개/37.91초**(각26개 제외), native synthetic **1개/0.15초**, AI pytest **113개/2.26초**, 개발 도구 unittest **108개/15.450초·OK**, MSRV1.90 all-targets/all-features **9.23초 성공**을 로그로 확인했습니다.

이 단축키 수정/자동 검증/문서화는2026-10-24 완료했습니다. 앞선 빌드/원격 대기 문구는 당시 진행 이력입니다. 전체 Phase8/남은5개 단계와 실제 GUI 수용은 미완료이며 기존 수용된 앱을 바꾸지 않았습니다. 다음 세션은 `keyboard-candidate.json`/성공한 `keyboard-package-roundtrip-rebuilt.json`과 이전 실패 영수증을 구분해 재사용하세요. 사용자 직접 테스트 없는 조건에서는 새 앱/입력·REC를 시작하지 않고, 기존 공개 참조의 미확정 단위·고급 점수 비활성·특화 가중치/별도Windows의 외부 조건을 유지합니다. 같은 임계값 가설/다운로드·구형 실행 파일과 새 리소스 조합 검사를 처음부터 반복하지 않습니다.
## 검증 도구·런타임 혼합 패키지 사전 차단 — 2026-10-24

## 1. 작업 개요

작업일2026-10-24. 앞선 실제 패키지 검사에서 발견한 ‘구형 검증 도구+새 LF 리소스’ 조합을 ZIP 작성 전에 자동 거부하는 안정성 후속입니다. 사용자에게 직접 테스트가 가능하다는 답변을 받아 기존 단축키 후보만 열었고 수용 결과는 대기 중입니다. 이 후속은 실행 중인 앱/UI 소스를 수정하거나 재시작하지 않습니다. 전체 Phase8 완료는 아니며 최종 원격/패키지 검사 전 상태는 아래 후속 기록으로 갱신합니다.

## 2. 구현 및 변경 사항

- `src-tauri/examples/manage_ai_model.rs`: 정확한 한 인수 build-info만 컴파일 시 원문 runtime lock SHA와 schema/tool 정보를 반환합니다. 입력 스레드·Python/자식 프로세스·AppData 접근보다 먼저 종료합니다. 기존 install/verify/download/inspect 경로는 유지합니다.
- `scripts/package_validation.py`: 고정 도구 파일 검증 뒤 build-info의5초/입력 없음·정상 종료/4KiB/UTF8·중복 없는 정확한3필드와 현재 lock SHA를 확인합니다. 실패하면 새 ZIP 폴더 생성 전 중단하며 검증을 우회하지 않습니다.
- `scripts/test_package_validation.py`: 정상 명령/계약과 구형/실패·잘못된 버전/tool/SHA·중복/알 수 없는 필드·비UTF8/한도·시간 초과, 실패 시 출력 없음/원본 바이트 보존4개 테스트를 추가했습니다.
- `.github/workflows/verify.yml`: native 빌드 정보 단위 검사도 Windows 회귀에 추가합니다. 기존 전체 검사는 유지하며 workflow 지문이 캐시 키에 포함돼 다음 실행은 새 키/캐시 없음일 수 있습니다.
- `docs/12`, `09`, `13`과 진행 문서: 개발 CLI 계약·재발 방지/검사·실행 앱과 재개 위치를 구분합니다. 신규 라이브러리/IPC·DB/모델/프론트 변경은 없습니다.

## 3. 테스트 결과

- `python -B -X utf8 -m unittest discover -s scripts -p test_package_validation.py`: 개발3.10.8 **11개 성공**,0.495초. 번들3.12.15도 작업공간 TMP/TEMP에서 **11개 성공**,0.475초.
- 최초 번들3.12 기본 sandbox Temp에서는11개 실행 중 파일 쓰기/정리 접근 오류21건이 발생했습니다. 프로젝트 임시 폴더를 TMP/TEMP로 지정해 해결했고 제품 코드/검증을 완화하지 않았습니다.
- 개발 도구 전체 `python -B -X utf8 -m unittest discover -s scripts -p test_*.py`: **112개 실행/111성공·링크 권한1개 제외**,9.319초. 기본 Windows Temp에 대한 알려진 sandbox 오탐을 피하려고 권한 검토를 통과한 테스트 프로세스에서 자체 임시 자료만 사용했습니다.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --example manage_ai_model`: **1개 성공**,0.04초(컴파일4.08초). 최초 Sha256::digest의 LowerHex 구현 가정은 설치된sha2 0.11.1에서 E0277로 실패해 기존 코드처럼 바이트별16진 표현으로 수정했습니다. 의존성을 추가하지 않았습니다.
- `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --example manage_ai_model`: **성공**,4.36초. 실제 최소 환경의 build-info/잘못된 추가 인수 거부·기존 패키지 도구 거부/현재 도구 허용도 **성공**했습니다. 최초 ad-hoc 검사의 오류 코드를 INVALID_REQUEST로 잘못 기대해 실패했고 기존 실제 INVALID_INPUT으로 바로잡았습니다. 제품 오류 코드는 변경하지 않았습니다. 영수증 manager-build-info-validation-b6be87e1-0a10-413a-8f48-02be361e2b5f.json에 기록했습니다.
- `cargo fmt --check`, all-targets/all-features `cargo clippy --locked --offline ... -- -D warnings`: **성공**,Clippy11.88초. `cargo +1.90.0 check --locked --offline --all-targets --all-features ...`: **성공**,13.10초. `pnpm format:check`: **성공**.
- 새 ZIP 실제 사전 검사/전체 지문/독립 실행·새 원격 전체 CI는 **미실행** — 다음 단계로 진행합니다. 프론트444개/실제 GUI/AI 모델 재분석은 **미실행** — 이번 후속에서 관련 소스를 바꾸지 않았으며 이전 CI 수용과 구분합니다.

## 4. 미구현 및 알려진 문제

빌드 정보는 서명이나 전체 소스 동일성 검증이 아니며 현재 runtime lock과 도구의 호환 경계만 확인합니다. 구형 도구는 같은 소스 재빌드가 필요합니다. 기존 전체 파일 지문/실제 Python·외부 Windows/최종 배포 검사는 유지합니다. source 기반의 정상 빌드 도구만 실행하며 임의 파일 실행 UI를 추가하지 않습니다.

## 5. 다음 작업 계획

사전 검사까지 포함한 새 검증 ZIP/독립 실행과 원격 전체 회귀를 확인하고 결과를 확정합니다. 현재 PID30248/PTY22831의 ‘GuitarLab · 단축키 충돌 수정’은 사용자 확인 중이므로 그대로 유지합니다. 실행 파일 SHA는46eae0bc…이며 실행 전 기존 DB9의 읽기 전용 snapshot을 keyboard-candidate.json에 연결했습니다. 사용자 입력/REC를 자동 시작하지 않고 수용 답변 후 해당 결과만 따로 기록합니다.

### 실제 사전 검사·패키지 확정

소스 `149ef37`의 실제 build-info 사전 검사를 포함한 `python -B -X utf8 scripts/package_validation.py src-tauri/target/runtime-validation/keyboard-candidate.json`이 **성공**했습니다. 새 ZIP은 validation-packages/9f460eef-daf2-45b8-ad98-b4afb433325f/GuitarLab-validation.zip,3613파일/40,161,473바이트/SHA `1154c8552250951d9ba2a9f3a1d04d9963d3d106673a9f42a400d2dc86ea6803`입니다. 새 roundtrip-a1b6ff29… 추출·전체 지문과 기본PowerShell5.1의 독립Python3.12.15 최소PATH2회가 **exit0 성공**했습니다. manager-preflight-package-roundtrip.json은 MANAGER_PREFLIGHT_ZIP_AND_POWERSHELL51_CHECKED이며 실행 중인 GUI를 교체하지 않았습니다.

추가 읽기 전용 비교는 실행 전 snapshot과 현재DB9의 **사용자 테이블15개 행수/전체 내용 지문 동일**을 확인했습니다(sqlite 내부 테이블 제외). 기본 sandbox는 실행 중 DB 열기에 실패했고 확장 읽기에서는 성공했으며 DB를 수정/복원하지 않았습니다. keyboard-startup-data-comparison.json에 기록했습니다. 모델/녹음 분석을 실행한 결과가 아니며 실제 단축키 사용자의 수용 답변은 여전히 대기입니다.

새 원격 회귀는 [Windows40051342400](https://github.com/BomJin2/GuitarLab/actions/runs/40051342400)/job120744487711에서 진행 중입니다. 소스의 UI·제품 코드 변경은 없으며 현재 앱/이전 ZIP의 수용 상태와 구분합니다.

### 원격 회귀 확정 — 2026-10-24

위149ef37의 Windows40051342400/job120744487711은 **사후 정리 포함 전 단계 success**입니다. 프론트444개/103파일·타입/lint/빌드/Prettier·cargo fmt/기본 및 확장Clippy, 기본Rust228개/42.20초와 all-features231개/66.93초(각26개 제외), onset native1개/0.17초·새 빌드 정보 native1개/0.03초, AI113개/2.54초·개발 도구112개/18.573초·OK, MSRV1.90 all-targets/all-features85초까지 로그로 확인했습니다. workflow 변경에 따른 새 정확한 캐시 키f3637e5b…는 miss 후 성공 저장됐으며 캐시를 이유로 검사를 생략하지 않았습니다.

이 패키지 사전 차단/자동 검증/문서화는 완료입니다. 전체 Phase8·서명/최종 배포/새 Windows 수용은 미완료이고 실제 단축키 사용자의 답변도 대기입니다. 현재 앱은 유지하며 위 검증 도구 변경을 적용하기 위한 앱 재시작은 필요하지 않습니다. 다음 재개는 PID30248/PTY22831·keyboard-candidate.json과 성공한 manager-preflight-package-roundtrip.json을 재사용하고, 사용자가 확인하지 않은 내용을 수용 완료로 기록하지 않습니다.

### 수동 검사 준비 상태·버튼 안내 정정 — 2026-10-24

- 작업 개요: 단축키 수용 검사는 보류입니다. 사용자는 재생 버튼이 ‘준비 중’으로 비활성이고 카피에 ‘합성 음원 불러오기’가 없다고 보고했습니다.
- 확인/변경: ScoreWorkspace는 프로젝트를 열지 않았을 때만 합성 도구를 표시합니다. 저장 프로젝트에서는 ProjectStatus의 ‘프로젝트 음원 선택’을 사용하도록 안내를 정정했습니다. TransportBar는 음원 길이가0인 상태도 ‘준비 중’으로 표시합니다. 이번에는 진행 문서만 수정했고 앱/UI·데이터는 변경하지 않았습니다.
- 검증: 관련 조건/버튼 코드를 읽고 public/fixtures/sine.wav가384044바이트로 존재함을 확인했습니다. 새 자동 검사·실제 음원 불러오기·단축키 수동 수용은 **미실행/답변 대기**입니다. 코드 변경이 없어 기존 전체 회귀를 반복하지 않았습니다.
- 알려진 문제: ‘준비 중’만으로 실제 로딩과 음원 미선택을 구분할 수 없습니다. 현재 응답은 단축키 충돌 해결을 확인할 수 있는 준비 조건을 만족하지 않습니다.
- 다음: ‘프로젝트 음원 선택’에서 포함된 sine.wav를 연 뒤 약4초 길이/재생 활성화, TAB 오른쪽 선택만 변경되고 재생 위치는 유지되는지 확인합니다. 확인 동안 앱/UI 소스를 유지하고 수용 결과를 추측해 기록하지 않습니다.
