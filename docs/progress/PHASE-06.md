# Phase 6 — AI 기타 카피 및 stem 분리

## release 독립 검증 ZIP 및 외부 환경 보류 — 2026-10-19

### 작업 개요

Phase 6의 선택 다운로드와 지원 Python 배포 후보를 현재 PC에서 검증했습니다. 이 슬라이스의 로컬 검증·문서화 완료 날짜는2026-10-19입니다. **Phase 6 전체는 진행 중**이며 별도 Windows 검증은 장비 부재로 보류합니다.

### 구현 및 변경 사항

- `src-tauri/src/ai/managed.rs`: 번들 release에서 활성 모델이 없으면 AI_MODEL_MISSING을 반환하고 개발 Python으로 폴백하지 않습니다. 기존 debug/구형 marker는 유지합니다.
- `src-tauri/examples/manage_ai_model.rs`: 고정 리소스 폴더만 검사하는 inspect를 추가했습니다. 네트워크·설치·개인 파일 읽기를 수행하지 않습니다.
- `scripts/Test-StandaloneRuntime.ps1`: 개발 경로를 제외하고 exe SHA/기본 worker3.12.15·미설치 상태를 두 번 검사합니다. PowerShell5.1 하위 프로세스의 Get-FileHash 자동 로드 실패는 .NET SHA256/FileStream으로 해결했습니다. 지문 불일치/리소스 누락 거부2개도 성공했습니다.
- release 앱/점검 도구·3393개 고정 런타임 리소스/고지·한국어 안내/검사 스크립트를 새 UUID ZIP에 넣었습니다. 모델 가중치/환경/사용자 프로젝트·녹음은 제외했습니다. 이전 후보를 삭제하지 않았습니다.

### 테스트 결과

- 앞 절의 최종 verify:app 프론트218개/Rust142개·Python111개·실제 HTTPS1개/기존 관리 회귀2개·번들2개 성공을 유지합니다. 새 release 보호 변경 뒤 Rust142개/5.96초·확장 Clippy4.80초·fmt도 성공했습니다.
- `pnpm tauri build --no-bundle --config …015be5d3…conf.json`: **성공**, release native2분39초. `cargo build --release --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --example manage_ai_model`: **성공1분13초**. 앱19,495,424바이트/점검 도구3,154,944바이트입니다.
- release 첫 실행 모델 누락/개발 폴백 거부 검사: **성공1개/0.05초**. 실제 release 점검 도구의 Basic Pitch/Demucs 재설치 요청은 모두 **ALREADY_ACTIVE**, 동일 UUID/자체 분석 통과였습니다. 기존/신규 marker4개 SHA도 불변입니다.
- PowerShell5.1 최소 PATH/독립 worker 두 번 검사: **성공**. ZIP3398파일 전체 지문 대조/새 폴더 추출 후 같은 점검: **성공**, `zip-roundtrip.json`의 cleanWindowsValidated는 false입니다. ZIP33,574,653바이트/SHA0780fddcf19972bfa76e37f1a923f601401e3fbfcafd9d26f741df9fb744086e입니다.
- release 후보 portable/28368825-8ce3-4ffd-aa4c-25acae07c0e7를 PID4392로 실행했으며 제한된 재조회에는 보이지 않았으나 권한 밖 조회에서는 실제 실행/응답 중이었음을 확인했습니다. 제한된 조회의 미검출을 종료로 해석하지 않습니다. GUI 새 기능 수동 조작은 **미실행**이고 자동 UI/native 검증과 구분합니다.
- 정적 DLL 의존성 조회: **성공**. Numba/PyTorch가 MSVCP140.dll·VCRUNTIME을 요구하고 현재 PC에는 존재합니다. OS 수준 격리 없이 개발 경로만 제외한 검사이므로 별도 OS의 DLL 충족을 증명하지 않습니다.

### 미구현 및 알려진 문제

깨끗한 별도 Windows의 WebView2/VC++ 재배포 전제·모델 설치/실행은 **미실행**입니다. 사용자가 현재 PC만 사용할 수 있다고 확인했고 Sandbox/VM 도구도 없어 보류합니다. OS 기능/가상머신 설치는 하지 않습니다. 정식 installer/최종 배포 고지·실제 기타 정량 품질·완전 오프라인 OS 검증도 미실행입니다. 검증 ZIP을 정식 배포 완료로 표현하지 않습니다.

### 다음 작업 계획

자동 진행 규칙에 따라 외부 OS 검증은 남기고 독립적인 Phase 6A URL 직접 열기부터 구현합니다. Phase 6 완료 체크는 유지하지 않으며 외부 장비가 생기면 ZIP 점검 및 실제 두 모델/DLL 검사를 재개합니다. 현재 검증 산출물/기존 설치·프로젝트는 보존합니다.

## Demucs 선택 다운로드 — 구현/실제 전송 검증(2026-10-19)

### 작업 개요

Phase 6에 남은 Demucs 명시적 다운로드를 기존 Basic Pitch 경로에 추가했습니다. 구현과 실제 전송 검증 날짜는2026-10-19이며 전체 회귀/새 후보 반영은 진행 중입니다. Phase 6 전체는 미완료입니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`: 먼저 기존 v1 요청·7필드 캐시 결과의 Demucs 확장과 고정 총량/동의/HTTPS/취소 정책을 정의했습니다. DB·분석 결과 형식은 변경하지 않았습니다.
- `ai/guitarlab_ai/demucs_cache.py`(신규)·`model_cache.py`·`worker.py`: 고정 ABI별31/32개 wheel+2개 모델을 명시적 요청에서만 받습니다. 원래 설치·가중치·캐시/marker를 덮어쓰지 않으며 다운로드는 설치/추론을 실행하지 않습니다.
- `runtime_packages.py`: 기존 바이트 제한/해시/배타적 게시·취소 정리를 재사용하고 고정 Hugging Face commit2개 resolve URL·동일 config 캐시·실제 확인한 us.aws.cdn.hf.co/xet-bridge-us HTTPS 경로만 허용합니다. 서명 쿼리 값은 로그에 출력하지 않습니다.
- `src-tauri/src/ai/model_cache.rs`·`mod.rs`·`commands/ai_api.rs`: 요청 모델별 프로필·응답 모델/버전/수량·총량/재사용 수 검증, 기존 동의/REC 거부·UUID 임시 파일 정리를 유지합니다. Basic Pitch의 기존 공개 함수도 유지합니다.
- `src/features/transcription/modelCache.ts`·`useModelDownload.ts`·`ModelDownloadPanel.tsx`: 기존 패널에 모델 선택·선택 변경 시 동의/결과 초기화·진행 중 잠금·연구용/용량·설치 여유 안내를 추가했습니다. 비즈니스 로직은 서비스/worker에 유지하며 취소 후 native 정리 완료를 기다립니다. `ModelSetupPanel.tsx`·`modelInstallation.ts`의 이전 미지원/용량 안내도 정정했습니다.
- `src-tauri/examples/manage_ai_model.rs`: 승인된 다운로드도 같은 native 경로에서 직접 실행하도록 download 동작을 추가했습니다. 새 승인을 생략하거나 자동 다운로드를 실행하는 기능은 아닙니다.
- 관련 프론트/Python/Rust 테스트를 갱신하고 실제 고정 가중치 전송·전체 재사용/취소의 명시적 ignored 검사를 추가했습니다.

### 테스트 결과

- Python 전체 `pytest ai/tests -q`: **성공111개/3.04초**. 두 서명 계획/허용 URL·잘못된 redirect/토큰 비노출·DEMO 전송·진행 상한/재사용·손상/네트워크 실패/디스크 부족/취소·완성 캐시 보존을 확인했습니다. DEMO 바이트는 실제 분석 결과가 아닙니다.
- 프론트 타입 검사/다운로드 UI·계약 Vitest: **성공6개/1.71초**. 동의 전 실행 금지·모델 변경 시 동의/결과 초기화·진행 잠금/취소·정확한 모델/총량을 검사했습니다.
- 고정 두 모델 URL의 실제 HEAD: **성공**, 가중치54,885,744바이트의 us.aws.cdn.hf.co와 설정21바이트의 동일 commit 캐시 경로를 확인했습니다. 서명 값/개인 데이터는 출력하지 않았습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml actual_demucs_download_weights_reuses_offline_and_cancels_without_install -- --ignored --nocapture`: **성공1개/17.81초**(컴파일20.77초). 격리 fixture에서32개 wheel만 수정 없이 hard link 재사용하고 **가중치2개54,885,765바이트를 실제 HTTPS로 수신**, SHA/JSONL·34개/708,033,316바이트/reused32·최대22개 단조 진행·재사용34·native 진행 중 취소/현재 UUID 정리/가중치 SHA 보존·환경 미생성을 확인했습니다. 사용자 원본·기존 설치를 건드리지 않았고 테스트 fixture는 정리됐습니다. 로그 `demucs-download-proof.log`입니다.
- 새 리소스 후보015be5d3-5cf5-4976-8d04-5ecb3cca1334: **생성 성공3,393파일/64,095,996바이트**. 아직 실행 앱에 반영하지 않았으며 전체 lock을 갱신한 후 native를 컴파일했습니다.
- 전체 `pnpm verify:app`: **성공**, 프론트218개/12.46초·빌드16.55초·표준 Clippy3.36초·Rust142개/5.81초(환경 의존16개 기본 제외)·타입/린트/포맷을 통과했습니다.
- 확장 Clippy(all-targets/all-features): **성공6.03초**, 내장 UI/권한2개 **성공**(테스트 실행 파일에 아이콘 리소스가 없다는 Tauri 진단은 남으며 두 검증은 통과), 실제 관리 카피/구형 모델 보존2개 **성공16.10초**입니다.
- 새 debug Windows 후보 빌드: **성공**, 프론트17.12초/native24.10초. 실제 Tauri 리소스와 새 복사본3,393파일/64,095,996바이트의 전체 lock 일치·독립 native 캐시 재검증 **성공**(Basic42개 재사용42, Demucs34개 재사용34). 기존/신규 marker4개 SHA도 불변입니다.
- 개발 Python 폴백을 차단하는 별도 `pnpm tauri build --no-bundle --config …015be5d3…conf.json` release 후보: **성공**, native2분39초. release용 점검 도구/첫 실행 회귀·최종 ZIP/추출·새 앱 반영은 이어서 진행합니다.
- Windows PowerShell5.1 최소 PATH 자동 점검 **첫 후보 성공**, 이후 Python에서 시작한 하위 PowerShell의 실패 검증은 Get-FileHash 미인식으로 **실패**했습니다. 모듈 자동 로딩에 의존하지 않는 .NET SHA-256으로 수정했고 잘못된 지문/리소스 누락 거부2개는 **성공**했습니다. 최종 release ZIP의 전체 재검증을 진행합니다. 두 실패 메시지 확인 시도는 검사 코드의 원인 확인 이전 이력이며 앱/원본 손상은 없었습니다.
- 실제 새 패널 수동 수용·깨끗한 새 PC/installer: **미실행**. 수동 버튼 확인을 설치 작업의 선행 조건으로 요구하지 않습니다.

### 미구현 및 알려진 문제

현재 앱은 이전 두 모델 설치 후보를 유지합니다. 새 Demucs 다운로드 UI가 현재 앱에서 보인다고 주장하지 않습니다. 고정 CDN 호스트/경로가 바뀌면 안전하게 다운로드 오류로 처리하며 임의 서버로 폴백하지 않습니다. 전체 약676MiB 신규 네트워크 수신은 이번 검사에서 미실행(기존 검증 wheel 재사용·가중치2개만 실제 수신)이며, 패키지 전송의 기존 검사와 구별합니다. 연구용 모델 안내·가중치 앱 번들 제외/새 PC 및 재배포 고지 미완료를 유지합니다.

### 다음 작업 계획

전체 회귀/번들 무결성 검사 뒤 새 후보를 빌드하고 직접 캐시 재검증·기존 모델/프로젝트 보존을 확인합니다. 이후 Phase 6의 독립 배포/첫 실행·오프라인 조건을 검토합니다. 승인된 설치·자동 검사는 개발자가 직접 수행하며 불필요한 반복 수동 검사를 요청하지 않습니다.


## 승인된 모델 직접 설치 및 Basic Pitch UI 수용 — 2026-10-19

### 작업 개요

사용자가 Basic Pitch 새 설치 버튼의 ‘설치·활성화 완료 · 자체8음 분석 통과’를 확인했습니다. 승인된 설치를 반복해서 사용자에게 맡기지 않도록 개발자가 같은 native 설치 로직으로 Demucs를 직접 설치했습니다. 설치/자체 분리 검증은2026-10-19 완료했으며 전체 Phase 6은 진행 중입니다.

### 구현 및 변경 사항

- `src-tauri/examples/manage_ai_model.rs`: 기존 native 설치/파일 확인을 호출하는 개발 도구입니다. 모델 enum·install/verify·절대 리소스 경로를 확인하고 고정 앱 데이터만 사용합니다. 네트워크 다운로드나 새 설치 알고리즘을 추가하지 않았습니다. 기존 timeout·SHA·pip check·자체 분석·실패/취소 정리를 재사용하고 stdin 입력으로 취소할 수 있습니다. 결과/진행은 경로를 제외한 JSON입니다.
- `src-tauri/src/ai/setup.rs`·`managed.rs`: 환경 의존 회귀 테스트가 설치된 cp312 프로필과 구형 프로필을 명시적으로 구별하도록 보완했습니다. 이전 설치의 재검증 테스트는 구형 프로필을 선택하고, 현재 관리 모델 카피 테스트는 새 marker가 있으면 검증된 리소스를 전달합니다. 제품 설치·분석 동작은 변경하지 않았습니다.
- `docs/13-ENV-AND-RELEASE.md`: 승인된 설치를 직접 처리하는 실행/취소 절차와 UI 수용 검사와의 구별을 기록했습니다. 신규 다운로드/버전 교체 승인을 의미하지 않습니다.

### 테스트 결과

- Basic Pitch 설치 버튼: **사용자 수용 성공**. 새 marker 환경 bad9e29c-3cf0-4449-b03f-0e836dae7c58/SHA2885864ded8773792c529cd3abed8d3fcde2f834c79db952543c6ff9ded4af67입니다.
- `cargo run --locked --manifest-path src-tauri/Cargo.toml --example manage_ai_model -- install htdemucs_6s <후보 ai-runtime>`: **성공**, INSTALLED·OWNED_STEM_SPLIT_PASSED·환경0409167a-a8f6-4d87-ab7f-b4fb4afa0772/SHAc0e35ab8ed7fac014f80da2774e6524d3243823986c56e4e8c22018b3a420283입니다. 기존34개 캐시만 사용하며 네트워크 다운로드0입니다. 로그 `demucs-cp312-install.log`에 기록했습니다.
- 같은 개발 도구 `verify basic-pitch`: **성공**, Python3.12.15/Basic Pitch0.4.0/FILES_VERIFIED입니다.
- 잘못된 action/model/상대 리소스 경로 실행: **성공3개**, 모두 INVALID_INPUT로 설치 전에 거부했습니다.
- 최초 도구 Clippy: **성공1.22초**. 최종 fmt/확장 Clippy **성공4.73초**, Rust 기본 **성공141개/5.71초·환경 의존15개 제외**, `cargo test ... actual_managed -- --ignored --nocapture` **성공2개/16.49초**입니다. 현재 cp312 관리 환경의 실제8음 카피와 구형 두 모델의 원래 marker/환경 재검증을 구별해 확인했습니다.
- 이전 두 사용자 marker SHA·사용자가 설치한 새 Basic Pitch marker SHA: **보존 확인 성공**. 새 Demucs marker와 검증 기록은 `active-model-preservation.json`에 저장했습니다.
- `manage_ai_model verify htdemucs_6s`: **성공**, Python3.12.15/Demucs4.1.0/FILES_VERIFIED입니다. 두 모델 각각 `install` 재실행은 **성공 ALREADY_ACTIVE**·동일 environmentId·자체 분석 통과이며 새 환경을 중복 생성하지 않았습니다. 재사용 뒤 기존/신규 marker4개 전체 SHA 불변을 확인했습니다.
- 실제 `cancel` 표준 입력으로 파일 검증 취소: **성공 CANCELED**. 설치/개인 음원 변경 없이 개발 도구의 native 취소 경로를 확인했습니다.
- 같은 독립 후보 앱 재실행: **성공 PID6440/제목 GuitarLab · Python runtime 검증 후보/Responding:true**. 실행 파일/리소스와 기존 프로젝트/녹음은 변경하지 않았으며 portable-candidate.json에 새 PID/nativeModelsActivated:true를 반영했습니다.
- 프론트/전체 Python 검사의 이번 재실행: **미실행**, UI/Python/계약·리소스 변경이 없으며 직전216개/103개 성공을 유지합니다.

### 미구현 및 알려진 문제

이번 Demucs 설치는 native 직접 실행이며 새 UI 버튼 수용과 구별합니다. Demucs 선택 다운로드 UI·깨끗한 Windows/installer·최종 재배포 고지는 미완료입니다. 실제 사용자 음원/정량 기타 품질 검사는 미실행이며 자체 음원만 사용했습니다. 원래 앱 후보와 기존 모델/프로젝트/녹음을 보존합니다.

### 다음 작업 계획

두 모델의 직접 설치/검증·새 프로세스 재사용과 앱 복귀를 마쳤습니다. 다음은 Phase 6의 Demucs 선택 다운로드와 독립 배포 후속입니다. 승인된 설치·재검증은 개발자가 직접 수행하고 실제 청취/연주가 필요한 검사만 사용자에게 요청합니다.



## cp312 관리 설치 후보·자동 검증 완료 — 2026-10-19

### 작업 개요

목표는 지원 Python에서 별도 모델 설치·활성화·실제 분석과 기존 환경 보존을 확인하는 것입니다. 두 모델 native 통합/최종 회귀·Windows 후보 빌드·독립 실행은2026-10-19 완료했습니다. 새 앱의 모델 설치 UI 수용은 미실행/사용자 확인 대기이며 **Phase 6 전체 완료 날짜는 미정**입니다.

### 구현 및 변경 사항

- `src-tauri/src/ai/setup.rs`: 실제 통합 테스트의 임시 실패 fixture 보존/무제한 시작 진단을 제거했습니다. 제품 설치·시간 제한·취소 처리 경로는 유지합니다.
- `src-tauri/src/ai/bundled.rs`: 현재 UUID 임시 복사본만 삭제할 때 canonical 부모 경로도 확인합니다. 불변 runtime 재사용·손상 거부/기존 marker 보존을 실제로 검사합니다.
- `src-tauri/src/ai/managed.rs`: 두 모델 모두 cp312 marker 우선 선택·구형 marker 불변·새 marker 손상 시 폴백 금지 회귀를 보강했습니다.
- 기존 구현의 `runtime_paths.py`/launcher 파일 식별 비교가 긴 한글 경로의 실제 두 모델 설치·분석 검증에서도 동작함을 확인했습니다. 이전 오류 이력은 아래에 보존합니다.

### 테스트 결과

- `cargo test --locked --manifest-path src-tauri/Cargo.toml actual_portable_models_install_reuse_transcribe_separate_and_cancel_without_legacy_changes -- --ignored --nocapture`: **성공1개/308.49초**. Basic Pitch42개 캐시(원본 재패키징/reused41)·두 모델 오프라인 설치/pip check/자체8음·4초176400프레임 분리/동일 환경 재사용·재검증/프로젝트 실제 카피·분리/신규 설치 취소/기존 marker·원본 보존입니다. 테스트용 격리 앱 데이터이며 실제 사용자 설치를 변경하지 않습니다. 로그는 `src-tauri/target/runtime-validation/portable-install-proof.log`입니다.
- `ai/.venv/Scripts/python.exe -X utf8 -m pytest ai/tests -q`: **성공103개/3.71초**.
- `cargo test ... actual_persistent_runtime_copy_reuses_cleans_cancel_and_preserves_legacy -- --ignored --nocapture`: **성공1개/65.14초**. 실제 복사·취소 정리·동일 경로 재사용·기존 runtime 손상 거부 및 구형 marker 보존입니다.
- 첫 `pnpm verify:app`: 프론트216개/24.70초·타입/린트/빌드20.48초·포맷 성공 후 Clippy 불필요한 참조1건으로 **실패**했습니다. `current_dir(root)`로 수정 후 fmt·모든 대상/feature Clippy7.47초·Rust141개/5.54초(15개 환경 의존 제외)가 **성공**했습니다. 재실행 `pnpm verify:app`은 **성공**(프론트216개/11.99초·빌드15.87초·표준 Clippy3.82초·Rust141개/5.73초)했습니다. 새 Windows 후보 빌드는 아래와 같이 성공했고 모델 설치 UI 수용은 미실행입니다.
- `cargo test ... actual_managed -- --ignored --nocapture`: **성공2개/37.97초**, 기존 실제 관리 카피·두 모델 재검증/marker 불변입니다. 기존 두 사용자 marker SHA도 이전 값과 일치하며 새 cp312 marker는 아직 없습니다.
- 오류 진단에서 남긴2개 fixture는 영수증·canonical TEMP 부모·UUID·정확한 DEMO marker2개 확인 뒤 정리했습니다. 기존 사용자 데이터/target snapshot은 삭제하지 않았습니다.

- 후보 설정의 custom-protocol `bundle_tests`: **성공2개/0.00초**(컴파일29.60초), UI entry/script·공식 fixture 허용 목록·로컬 listen/unlisten 허용/발신·원격·다른 창 거부입니다.
- 같은 후보의 `actual_bundled_runtime_inspects_without_development_python_or_models`: **성공1개/5.09초**(컴파일8.18초), 최소 PATH·-I/-B·실행 전후 전체 파일 일치를 확인했습니다.

- `pnpm tauri build --debug --no-bundle --config src-tauri/target/runtime-validation/bundle-7a152c07-bdfc-444c-ac54-7cebecb0f819.conf.json`: **성공**, 프론트16.47초/native31.40초. 알려진 alphaTab 큰 청크 경고와 Windows linker 정보 경고는 남으며 오류는 없습니다.
- Tauri 실제 복사 리소스와 새 독립 폴더의 전체 lock 대조: **성공3,392파일/64,092,710바이트**. 새 실행 파일26,248,704바이트를 `portable/d6de79d6-f759-4a16-ab58-5a665af222d2`에 복사했고 PID6628로 실행했습니다. 실행 정보는 `portable-candidate.json`에 저장했습니다. 앱 응답 상태는 별도 조회하며 실제 설치 버튼 성공을 실행만으로 주장하지 않습니다.

### 미구현 및 알려진 문제

실제 앱 데이터의 cp312 모델 활성화/새 UI 수용은 미실행입니다. Demucs 다운로드 UI·새 PC/개발 Python 없는 깨끗한 OS·installer/최종 재배포 고지 검증도 남아 있습니다. 이번 성공은 자체 합성 음원이며 실제 기타 정량 품질을 보장하지 않습니다. 이전 GUI PID13492는 현재 조회되지 않았습니다.

### 다음 작업 계획

현재 후보의 환경 설정에서 Basic Pitch 설치/재검증 → Demucs 설치/재검증 결과를 사용자 확인합니다. 이후 모델별 설치 확인의 Python3.12.15·재실행 재사용과 Demucs 선택 다운로드/독립 배포의 남은 조건을 순서대로 진행합니다. 확인 동안 원본 소스와 실행 후보를 유지하며 기존 모델/프로젝트/녹음을 보존합니다.


## cp312 불변 runtime·관리 설치 — 구현 중(2026-10-18 19:54)

20:21 추가: 시작 검사는 파일 식별 비교로 통과했습니다. 다음 Basic Pitch 단계는 pip install/check까지 성공한 뒤 DLL import에서 실패했습니다. 이전 성공 환경과 _typeconv DLL SHA가 같고 시스템 VC DLL이 존재함을 확인했고, 실제 오류 ‘파일 이름이나 확장명이 너무 깁니다’를 재현했습니다. 인터프리터를 확장 경로로 실행하거나 bootstrap의 기존 sys.path를 Windows 확장 경로로 정규화하면 동일 환경의 자체 분석이 통과합니다. sys.prefix를 위조하지 않습니다. 공용 runtime_paths.py와 모델 파일 포함 검사의 동일 NT 경로 비교·테스트를 추가해 Python103개/2.98초가 성공했습니다. 최신7a152c07 후보(3,392파일/64,092,710바이트)의 전체 native 두 모델 설치/카피/분리/취소는 재검사 중입니다. 실패 진단에서 이번 테스트가 만든 일부 DEMO fixture만 보존했으며 실제 사용자 모델 marker는 변경하지 않았습니다. 검사 통과 후 해당 신규 진단 fixture를 명시적 경로 검증해 정리할 계획입니다.

### 작업 개요

19:18에 사용자 수용한 런타임 환경 확인을 다음 모델 설치 단계로 확장하고 있습니다. 완료 날짜는 **미정**, 전체 상태는 **구현/검증 중**입니다. 기존 앱/프로젝트/구형 marker는 유지하며 아직 실제 사용자 앱 데이터에 새 모델을 활성화하지 않았습니다.

### 구현 및 변경 사항

- bundled.rs의 앱 데이터 runtime은 새 UUID staging 복사·fsync·전체 해시 후 고정 cpython-3.12.15-20261013-r1 경로에 게시합니다. 재사용 검증/여유 공간/취소·이번 staging만 정리하며 손상 기존 runtime은 보존·거부합니다. model venv의 base는 이 불변 경로입니다.
- Python install_managed.py와 native setup/managed/installation은 별도 cp312 계획/42·32개 고정 패키지·새 marker 이름/기존7필드 및 자체8음/4초 검증을 사용하도록 연결 중입니다. 이전 marker를 덮어쓰지 않습니다. 새 marker가 있으면 해당 환경을 먼저 검사합니다.
- 카피/분리/모델 확인은 Tauri에서 얻은 리소스를 명시적으로 전달하는 경로를 추가하고 기존 Rust 호출 경로도 보존합니다. GUI에 핵심 로직을 넣지 않습니다. 새 worker는 고정 base 경로·격리 실행을 확인하며 모델별 NumBa 캐시도 앱 데이터의 별도 UUID에 둡니다.
- Basic Pitch 다운로드의 기존7필드 결과를41개/144,366,287바이트 또는42개/146,364,006바이트의 정확한 쌍으로 검증합니다. 기본 앱에는 모델/fork를 넣지 않으며 사용자 동의 후 공식 원본758,279바이트를 받고 고정 recipe로 fork를 생성합니다. 메타데이터 재구성은 표준 라이브러리만 사용하며 원본 코드/모델/LICENSE/NOTICE와 고정 fork SHA를 보존합니다. 진행률은5% 단위·최대22개로 제한하고 최종 해시/게시 뒤만100%입니다.
- 설치/다운로드 안내는 로컬 런타임/모델별 설치와 새 PC 검증 상태를 구별하도록 최소 문구만 갱신했습니다. 이전 후보 복사본/실행 앱은 변경하지 않습니다.

### 테스트 결과

- `pytest -q`: **성공101개/3.05초**(기존3.10 테스트 실행기). 새 cp312 marker/legacy 보존·준비·잘못된 Python 패치·작업 폴더 정리·프로토콜 메시지 상한을 포함합니다.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: **성공216개/62파일·22.87초**. 최종 Rust/번들 전체 검사는 통합 오류 수정 후 다시 수행합니다.
- 새 기본 Python3.12.15로 공식 원본을 표준 라이브러리만 사용해 재구성: **성공2,249,897바이트/기존 fork SHA 일치**입니다.
- `python -m guitarlab_ai.runtime_packages --import-model-cache`: **성공**. 기존 검증 파일의 로컬 복사만 수행했고 Basic42개/146,364,006바이트·Demucs34개/708,033,316바이트/각 downloadedFiles:0입니다. 모델 환경 설치/활성화는 아닙니다.
- 새 원본 복사본의 metadata/cache 재현: **성공**, 긴 경로·한글 경로와 최소 시스템 PATH의 실제 worker JSONL에서도42개/reused41을 반환했습니다. 네트워크 없이 자체 원본 캐시를 사용합니다.
- native `actual_portable_models_install_reuse_transcribe_separate_and_cancel_without_legacy_changes`: **첫 실행 실패**, 시작 단계 AI_WORKER_FAILED입니다. 별도 빈 입력 시작 검사에서 launcher assertion 실패를 재현했습니다. 경로 문자열 비교를 파일 식별 비교로 보완하고 재검사 중입니다. 실제 설치·재사용/카피·분리/취소가 전부 통과했다고 기록하지 않습니다.
- 최신 리소스 후보 bbcabe9e-e06d-4882-ae0c-0fe4fdaf36f4는3,391파일/64,091,905바이트이며 현재 앱에서 실행한 후보와 다릅니다. 이전76a40643 후보64,091,738바이트는 수정 전 이력입니다.

### 미구현 및 알려진 문제

새 native 설치 통합은 검증 중이며 실제 사용자 앱의 설치/새 모델 전환은 미실행입니다. Demucs 다운로드 UI·새 PC/깨끗한 Windows·최종 재배포 고지/installer는 미완료입니다. 현재 GUI는19:18 수용 후보(PID13492)이며 새 기능이 적용됐다고 안내하지 않습니다.

### 다음 작업 계획

시작 검증 오류를 해결하고 격리 두 모델 설치/pip check/자체 추론·같은 환경 재사용·실제 카피/분리·구형 marker 보존·취소 정리를 검증합니다. 불변 runtime 재사용/손상 거부 검사·전체 타입/린트/빌드/포맷/Rust·Python 검사 뒤 별도 후보를 적용합니다. 그 전에는 현재 앱이나 원본 데이터의 자동 전환/삭제를 하지 않습니다.

## cp312 공개 worker·Windows 런타임 리소스 후보 — 2026-10-18

### 작업 개요

사용자 재개 요청에 따라 지원 Python 전환 검증을 이어갔습니다. 완료 날짜는2026-10-18이며 공개 worker 연결은 검증을 마쳤습니다. 별도 런타임 리소스 후보도 생성·직접 실행했습니다. **기존 앱 모델은 유지하며 Phase 6 전체/새 PC 배포 완료는 아닙니다.** 아래18:50까지의 공용 worker 미구현 문구는 이전 이력입니다.

### 구현 및 변경 사항

- `ai/guitarlab_ai/model_integrity.py`·`separation/demucs.py`: 공개 adapter가 기존3.10 계획 또는 정확한3.12.15의 고정 SHA 프로필을 선택합니다. 모든 패키지 버전/모델 해시를 확인하고 다른 Python 패치·변조 계획을 거부합니다. 기존 Basic Pitch 계획에는 modelId가 없으므로 새 필드를 강제해 기존 설치를 깨뜨리지 않습니다.
- `src-tauri/src/ai/installation.rs`·`src/features/transcription/modelInstallation.ts`와 검사: 설치 확인5필드/모델 알고리즘 버전은 유지하고 pythonVersion에 정확한3.12.15만 추가 허용합니다. Basic Pitch 패키지 로컬 버전과 모델 버전을 혼동하지 않습니다.
- `src-tauri/src/ai/runtime_worker_tests.rs`·`ai/tests/test_runtime_model_profile.py`: 새 snapshot/최소 시스템 PATH·-I/-B/UTF-8로 실제 공개 JSONL worker의 설치 확인·8음/운지·분리 PCM·손상 입력·진행 중 취소·timeout을 검증합니다. 기존 개발/관리 worker와 자체 오프라인 설치/재사용/취소도 회귀 검사했습니다.
- `ai/guitarlab_ai/runtime_bundle.py`·`ai/models/runtime-bundle-lock.json`·`ai/tests/test_runtime_bundle.py`: 고정 Python·worker·고정 계획·고지만 새 UUID 폴더에 준비합니다. 기존 모델 환경/가중치·개인 파일은 포함하지 않습니다. 전체3,390파일/63,702,482바이트의 경로/크기/SHA를 빌드 lock에 기록합니다. 명시적 후보용 Tauri 설정도 생성합니다. 첫 후보3,390파일/63,702,156바이트는 당시 생성기 버전 이력이며 현재 후보는82f5a0f2-a525-48c4-85e1-2febfde9ceb3입니다.
- `src-tauri/src/ai/bundled.rs`·`mod.rs`·`commands/ai_api.rs`: Tauri resource_dir의 고정 ai-runtime만 사용해 전체 파일을 검사하고 번들 Python을 실행합니다. 경로 이탈/링크·추가/누락/동일 크기 변조·사전 취소를 거부합니다. 리소스가 없는 일반 개발 빌드의 기존 경로와 모델 marker는 유지합니다. 릴리스의 개발 Python 폴백은 없습니다.
- `AiRuntimePanel.tsx`·관련 검사·`runtime.ts`: ‘로컬 worker 연결됨’과 런타임 무결성 오류를 표시합니다. 신규 UI 레이아웃/디자인 작업 없이 기존 명령·상태 표시를 사용합니다.
- docs/12·18/로드맵·진행 상태 및 README를 갱신합니다. Git 작업·사용자 녹음/프로젝트 수정·오디오 전송은 하지 않았습니다.

### 테스트 결과

- ai에서 `.venv/Scripts/python.exe -X utf8 -m pytest -q`: **성공96개/최종4.47초**. 테스트 실행기는 기존3.10이며 실제 새3.12 모델 실행은 아래 native 검사입니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml actual_cp312_public_workers_verify_transcribe_separate_cancel_and_timeout -- --ignored --nocapture`: **성공1개/32.48초**. 공개 adapter/worker가 실제 두 모델을 검증·추론하고 Rust가 음표/운지/시간·WAV/해시를 검증했습니다. 취소 후 결과 파일 없음·원본 불변·timeout 종료도 확인했습니다. 검증 자료는 성공 호환성 job의 worker-UUID 하위이며 앱에서 활성화하지 않았습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml actual_ -- --ignored --nocapture`: **성공7개/93.95초**. 기존 개발 worker/모델 파일 확인·관리 실제 카피·Basic Pitch/Demucs 격리 오프라인 설치/재사용/취소·기존 두 marker 재검증·cp312 공개 worker를 포함합니다. 이 명령에 포함되지 않는 real_model/real_demucs 이름 검사는 이번에는 재실행하지 않았습니다.
- `pnpm verify:app`: **성공**, 타입·린트·프론트216개/62파일·빌드14.17초·포맷·cargo fmt/Clippy·Rust139개/제외13개·Rust doc-test 성공입니다. 미실행 ignored 검사를 일반 검사 성공 수에 더하지 않습니다. 기본 alphaTab 번들 크기 안내는 유지되며 에러가 아닙니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: **성공21.00초**.
- ai에서 `.venv/Scripts/python.exe -X utf8 -m guitarlab_ai.runtime_bundle --prepare --refresh-lock`: **성공**. 공식 동일 pgo full archive43,731,659바이트/SHA7780bf6a29f93e6d0e3b5bdbe8cf799b3e2a0638bdec921be5b0c3ca81e67313를 검증하고13개 라이선스 원문을 보존했습니다. 기본 Python/pip 고지도 runtime 내부에 유지합니다. 리소스 생성에는 기존 개발 Python을 사용했으며 생성 후 실행은 번들 Python만 사용합니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml ai::bundled -- --include-ignored --nocapture`: **성공2개/8.09초**(첫 후보). 시스템 PATH만으로 새 Python3.12.15의 JSONL 환경 확인·모델 PACKAGE_MISSING/usable:false·실행 전후 전체 파일 불변, 파일 변조/누락/추가·사전 취소를 확인했습니다. 최신 후보의 custom-protocol 내장 UI/권한·번들 재검사는 이어서 기록합니다.
- 최신 후보에서 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle -- --include-ignored --nocapture`: **성공4개/7.34초**(컴파일30.69초). 실제 내장 UI/사용자 산출물 제외·이벤트 권한과 최신 runtime 전체 파일 검사/독립 실행을 포함합니다. 테스트 실행 파일에 GUI 아이콘 리소스가 없다는 메시지가2회 나왔으나 검사는 성공했습니다. 실제 앱 아이콘/시작 결과는 후보 빌드 기록과 구분합니다.
- 기존 앱 데이터 Basic Pitch/Demucs marker 해시는 각각a260a3a2318e338e3b3eee29bacdeb74b002a1ab61c52be209fdd0f83341780e/726e301e573497bc875de396fc8c4712db91635564eb545c6b402e47a4f20eea로 유지됐습니다.
- 오류: 설치된 sha2 0.11의 digest 배열이 LowerHex를 구현하지 않아 첫 native 빌드가 **실패**했습니다. 프로젝트 기존 hex 변환을 재사용해 해결했습니다. 루트에서 Python 모듈 명령을 실행해 import가 **실패**한 건 올바른 ai 작업 디렉터리에서 재실행해 해결했습니다. 변경하지 않은 linker 정보 메시지는 컴파일 경고 이력으로 기록하며 검사 실패는 아닙니다.
- 실제 Tauri 후보 앱 UI·새 PC/깨끗한 Windows 오프라인 설치는 **미실행**, 아직 후보 앱 빌드/실행과 별도 PC 검증을 마치지 않았습니다. 현재 호스트에는 WindowsSandbox.exe가 없습니다.

### 미구현 및 알려진 문제

새 리소스 후보는 기본 런타임 환경 확인만 연결합니다. 앱의 cp312 모델 다운로드/설치·영속 runtime 경로/관리 marker 마이그레이션·모델 실행 선택 전환은 미구현이며 기존3.10 환경을 바꾸지 않습니다. 새 PC/오프라인 배포와 Microsoft VC runtime/의존성 전체의 최종 재배포 고지 검토도 미완료입니다. Demucs 가중치는 포함하지 않았고 연구용 안내는 유지합니다. 합성 음원 성공을 실제 기타/일반 곡 정확도 검증으로 확대하지 않습니다.

### 다음 작업 계획

최신 리소스 후보와 내장 UI/권한 검사를 마친 뒤 Tauri 후보를 빌드해 실제 resource_dir 실행을 확인합니다. 그다음 고정 runtime을 앱 데이터의 불변 경로에 준비하고 cp312 모델 설치/활성화·구형 marker 보존/선택 전환 계약을 별도 슬라이스로 구현합니다. 설치된 venv는 base Python 절대 경로를 참조하므로 이미 만든 환경을 옮기거나 앱 업데이트로 base 경로를 바꾸면 안 됩니다. 새 PC 검증 전 Sidecar/Phase 6 완료 표시를 하지 않습니다.

### 후보 앱 수용 추가 — 2026-10-18 19:18

- `pnpm tauri build --debug --no-bundle --config src-tauri/target/runtime-validation/bundle-82f5a0f2-a525-48c4-85e1-2febfde9ceb3.conf.json`: **성공**, 프론트14.21초/native36.83초입니다. installer를 만든 것은 아닙니다.
- Tauri가 복사한 ai-runtime 전체를 Python inventory와 빌드 lock으로 대조해 **3,390파일/63,702,482바이트 일치**를 확인했습니다. 실행 파일+해당 리소스만 새 portable UUID 폴더에 복사해 **후보 GUI 실행/응답(PID13492)**을 확인했습니다. 기존 앱 프로세스가 없는 상태에서 실행했으며 기존 창을 강제 종료하지 않았습니다.
- 사용자 **수용 성공**: ‘환경 설정→AI 환경 확인’에 **Python3.12.15 · 로컬 worker 연결됨**이 표시됩니다. 새 기본 런타임의 PACKAGE_MISSING은 설치 전 상태이며 기존 관리 모델은 계속 유지합니다.
- 위 ‘실제 Tauri 후보 앱 UI 미실행’은 수용 전 이력으로 대체됩니다. 새 PC/깨끗한 Windows·cp312 관리 모델 설치 전환은 계속 미실행/미구현입니다. 다음 작업은 앱 데이터의 불변 runtime과 새 모델 환경/별도 marker입니다.

## 지원 Python3.12 별도 환경·실제 기준 비교 — 2026-10-18

### 작업 개요

사용자가 승인한1번으로 재개해 기존 환경/프로젝트를 보존하면서 지원 Python 기반 AI 호환성을 검증했습니다. 완료 날짜는2026-10-18이며 **별도 호환성 슬라이스 완료, 앱 native 활성화/독립 Sidecar·Phase 6 전체는 미완료**입니다. 새 환경은 개발 검증 폴더에 격리했고 기존 앱 데이터 marker를 바꾸지 않았습니다.

### 구현 및 변경 사항

- `ai/models/python-3.12.15-windows-x64.json`·`runtime_archive.py`: 공식 Astral20261013의 CPython3.12.15 Windows x64 stripped archive22,019,610바이트/전체 SHA를 고정했습니다. 일반 파일만 새 폴더에 풀고 경로 이탈/ADS·장치명/링크·중복·크기/파일 수를 거부합니다. 실행 전후3,344파일/63,242,933바이트를 원본 archive와 전부 비교합니다. 런타임3.12.15/pip26.2.1/OpenSSL3.5.9·독립 prefix를 확인했고 기존 Python 실행 경로를 사용하지 않습니다.
- `onnx_wheel.py`·관련 검사: 원본 Basic Pitch0.4.0의 코드/모델36파일·LICENSE/NOTICE를 바이트 그대로 보존하고 ONNX 전용 의존성·명시적 로컬 버전0.4.0+guitarlab.onnx1·변경 고지/WHEEL/RECORD를 다시 생성합니다. 원본 캐시를 덮어쓰지 않습니다. 새 wheel2,249,897바이트/SHA53ca6709be7a4599d66df70d5e6618038f2ee5dfa7252eb2b1fda5570a00eed6입니다. TensorFlow를 무검증 추가하거나 원본 버전으로 위장하지 않습니다.
- `cp312_plan.py`·새 cp312 모델 manifest2개: 기존 패키지 버전을 유지하고 CPython/안정 ABI 태그·Requires-Python·공식 PyPI/PyTorch CPU URL/SHA로 선택했습니다. Basic Pitch42개/Demucs32개, 중복 제거68개/775,707,515바이트입니다. resampy의 암묵적 pkg_resources에 필요한 setuptools75.3.2를 명시합니다.
- `runtime_packages.py`: 고정 계획 지문·HTTPS 허용 호스트/redirect·바이트/전체 SHA·여유 공간·실제 진행/취소/part 정리·기존 캐시 재사용을 구현했습니다.52개 재사용(기존 캐시51개 복사+로컬 fork1개),16개/746,526,892바이트(약712MiB)를 받아 검증했습니다. 모델 가중치는 재다운로드하지 않습니다.
- `runtime_compatibility.py`·`runtime_probe.py`: 고정 새 캐시로 별도 두 환경을 오프라인 설치/pip check하고 최소 PATH·-I/-B·복사한 소스/자체 fixture snapshot·격리 작업 디렉터리에서 실제 분석합니다. NumBa/Torch 임시 캐시도 작업 폴더에 제한합니다. 기존3.10 개발 환경과 음표/시각/활성도·정량화/운지/검토 사유와 두 stem의 실제 float PCM 차이를 비교합니다. 모든 실제 모듈/검색 경로가 새 runtime·환경·snapshot/지정 임시 폴더 아래인지 검사합니다. Torch 가상 모듈2개는 정확한 구현 클래스·실제 소스 경로까지 확인합니다.
- `transcription/basic_pitch.py`·`separation/demucs.py`: 기존 공개 adapter/worker 계약을 유지하고 분석 코어와 검증된 모델 resolver를 분리했습니다. `install_managed.py`의 기존 프로세스 관리에 개발 검증용 작업 디렉터리/최소 환경 전달을 추가했으며 기존 기본 동작은 유지합니다.
- 새 테스트5개 파일과 docs/12·18/진행 문서를 갱신했습니다. 외부 설치 스크립트/sdist 실행·오디오 업로드·기존 환경 삭제·앱 데이터 전환은 없습니다.

### 테스트 결과

- `ai/.venv/Scripts/python.exe -X utf8 -m pytest -q`(ai에서 실행): **성공91개/2.32초**. 기존 계약/취소/원본 보존과 압축 경로/링크·변조/추가 파일·로컬 fork 재현성/보존·ABI/URL/해시/다운로드·실제 비교 허용 범위를 검사했습니다. 이 단위 검사는 기존3.10 테스트 환경에서 실행했으며 전체 pytest를3.12에서 실행한 것으로 기록하지 않습니다.
- 공식 런타임 다운로드/전체 SHA·새 폴더 압축 해제/독립 실행/전체 파일 대조: **성공**. 메타데이터는 고정 release/자산 digest로 확인했고 라이선스·배포물 고지의 최종 검증은 아직 미완료입니다.
- ai에서 `.venv/Scripts/python.exe -X utf8 -m guitarlab_ai.runtime_packages --stage`: **성공68개/775,707,515바이트**, 다운로드16개/복사51개/기존 로컬 fork 재사용1개·전체 SHA 일치입니다.
- ai에서 `.venv/Scripts/python.exe -X utf8 -m guitarlab_ai.runtime_compatibility --validate`: **최종 성공,COMPATIBILITY_PASSED**. 새 두 환경 모두 오프라인 pip check·전체 고정 버전/모델 SHA·자체 음원 분석과 prefix/모듈 경로 격리를 통과했습니다. Basic Pitch 실제8음·운지/박자/검토 사유가 동일하며 onset/offset/활성도 최대 차이 각각0입니다. Demucs 두 stem은44,100Hz/stereo/176,400프레임(4초), 최대 PCM 차이/RMS 차이 모두0입니다. 실제 기타·일반 음악 품질 평가는 아닙니다.
- 첫 계획은 soxr의 안정 ABI wheel을 단순 파일명 치환으로 찾지 못해 **실패**했고, 실제 호환 태그 기반 선택으로 해결했습니다. 첫 런타임 실행에서-I가 바이트코드 환경 변수도 무시하는 것을 확인해-B를 명시하고 새 폴더에 다시 풀어 전체 파일 대조를 통과했습니다.
- 첫 전체 비교는 Basic Pitch를 통과한 뒤 Torch의 실제 파일이 없는 가상 모듈torch.ops/torch.classes를 잘못 경로 이탈로 판단해 **실패**했습니다. 해당 고정 버전 소스/실제 객체를 확인하고 두 가상 모듈의 정확한 구현 클래스·허용 설치 경로만 인정하도록 수정했습니다. 실패한 새 작업 폴더는 자식 종료 후 경로 검증해 정리했고 기존 환경/캐시는 보존했습니다. 수정 후 최종 비교와 모듈/검색 경로 격리 모두 성공했습니다.
- 성공 검증 job은 c2e7f346-335f-49e2-81d3-2a3375cccf5f입니다. 새 Basic Pitch 환경29f9d983-ce91-44f2-ad53-d7a8cff3b495는438,964,131바이트/7,739파일, Demucs3d51e09c-7eff-4c00-a089-167e35b823e6는3,323,541,038바이트/15,950파일입니다. 환경은 옮기거나 앱에서 활성화하지 않았습니다(nativeActivated:false).
- 기존 Basic Pitch/Demucs 앱 데이터 marker SHA는 각각a260a3a2318e338e3b3eee29bacdeb74b002a1ab61c52be209fdd0f83341780e/726e301e573497bc875de396fc8c4712db91635564eb545c6b402e47a4f20eea로 이전과 일치합니다. 실제 원본 wheel36파일/LICENSE/NOTICE 보존도 재확인했습니다.
- TypeScript/프론트·Rust 전체 재검사·Windows 앱 빌드/수동 UI 재검사는 **미실행**, 이번 슬라이스는 Python 개발 검증 도구/코어 resolver 경계만 변경했습니다. 직전 프론트216개/Rust138개/번들2개 성공 기록과 구분합니다. 새 PC/독립 Tauri Sidecar 검사는 **미실행**입니다.

### 미구현 및 알려진 문제

새 환경은 workspace의 검증용이며 native 앱의 기본 모델 환경이 아닙니다. 새 버전의 공용 worker/설치 profile·런타임 배포 리소스/라이선스 고지·앱 데이터 마이그레이션·Tauri/새 PC 오프라인 실행은 아직 미완료입니다. 기존3.10 환경은 보존하지만 지원 종료 상태를 배포 완료로 간주하지 않습니다. 모델 가중치 연구용 안내/배포물 제외와 실제 곡/기타 정량 품질 미검증도 유지합니다.

### 다음 작업 계획

다음은 고정 cp312 profile을 공용 모델 검증/worker에 연결하고 실제 JSONL·실패/취소/timeout 회귀를 확인합니다. 이후 런타임 리소스 고지/재배포 조건을 검증한 뒤 immutable 앱 데이터 경로와 native 배포 경로를 연결합니다. 기존 환경을 임의 삭제/자동 교체하거나 다음 Phase를 앞당기지 않습니다.

**2026-10-18 사용자 결정·중단**: 지원 중인 Python의 별도 배포용 AI 환경으로 전환 검증하는1번을 승인했으며 사용량 소진으로 실행은 다음에 이어가기로 했습니다. 기존 환경/프로젝트는 유지하고 같은 전환 방향 승인을 재요청하지 않습니다. 오늘 완료한 두 모델 관리 설치/실제 검증/실행·문서화 결과는 아래와 같습니다. 새 런타임 다운로드/설치·새 ABI 계획/Sidecar 검사는 미실행이며 Phase 6 전체는 미완료입니다. 재개 요청 전 추가 개발/검사/앱 조작을 하지 않습니다. 다음 시작점은 docs/18의 별도 런타임·ONNX 호환 구성 검토입니다. 아래 확인 대기 문구는 승인 전 이력입니다.

## Demucs 관리 설치·활성화 및 두 모델 앱 선택 — 2026-10-18

### 작업 개요

2026-10-18, Phase 6의 Demucs 관리 설치 슬라이스를 구현하고 실제 검증했습니다. 기존 승인 로컬 캐시만 사용했으며 새 네트워크 다운로드/개인 음원 분석은 없습니다. Basic Pitch와 공통 설치·취소·정리 절차를 사용하고 두 모델의 환경/marker는 독립적입니다. Phase 6 전체/독립 배포는 미완료입니다.

### 구현 및 변경 사항

- `ai/guitarlab_ai/install_managed.py`·`cache_demucs.py`·`worker.py`: 두 고정 모델의 계획/marker/검증 종류만 선택하도록 확장했습니다. Demucs는 별도 UUID 환경에31개 wheel+기존 해시 검증 bootstrap을 오프라인 설치하고, 모델2개를 검증해 복사합니다. pip check/모든 고정 버전·모델 SHA·자체4초 음원의 실제 GUITAR_FULL/ACCOMPANIMENT·프레임/채널/입력 해시 검증을 통과해야 활성화합니다. 자체 검증 산출물은 경로 확인한 임시 폴더에서 정리합니다.
- `src-tauri/src/ai/installation.rs`·`managed.rs`·`setup.rs`·`mod.rs`·`separation.rs`·`commands/ai_api.rs`: 모델별 고정 계획을 공유하고 설치 요청/응답·7필드 marker의 교차 모델 혼용을 거부합니다. Demucs 파일 확인/분리도 유효한 앱 데이터 marker를 우선 사용하며, marker가 없을 때만 기존 개발 환경을 유지합니다. 손상 marker는 오류로 표시합니다. 정상 창 닫기/취소·새 환경 정리 guard와 기존 marker 보존을 유지합니다.
- `src/features/transcription/modelSetup.ts`·`useModelSetup.ts`·`ModelSetupPanel.tsx` 및 관련 검사: 기존 설치 서비스/상태/UI 경계를 유지하면서 두 모델 선택·1GiB/4GiB 설치 여유·모델별 실제 검증 결과·연구용 안내를 표시합니다. 모델 전환 시 이전 결과를 지우고 실행 중 전환을 제한합니다. Demucs 다운로드 UI는 구현하지 않았다고 명시합니다.
- Python 두 모델 설치/marker 독립성 검사·native 교차 모델 marker/응답 검사·두 실제 오프라인 설치/재사용/취소 공통 검사와 실제 관리 환경 재검증을 추가했습니다. docs/12에 확장 계약을 먼저 기록했고 아래 기존 미구현 문구는 이력입니다.

### 테스트 결과

- ai에서 `.venv/Scripts/python.exe -s -u -m guitarlab_ai.install_managed --model htdemucs_6s --install`: **성공**, INSTALLED/OWNED_STEM_SPLIT_PASSED·새 UUID012a4ef8-08d3-44f5-86b9-a1c2d253518d입니다. 환경 실측3,325,310,044바이트/15,767파일(약3.10GiB, 디스크 할당량과 다름)입니다. Basic Pitch 기존 UUID와 marker SHA a260a3a2318e338e3b3eee29bacdeb74b002a1ab61c52be209fdd0f83341780e는 유지했습니다.
- `pnpm verify:app`: **성공**, 타입/ESLint·프론트216개/62파일·Vite build/Prettier·cargo fmt/Clippy·Rust138개/기본 제외11개·binary/doc-tests입니다. Rust 실행7.43초입니다.
- ai에서 `.venv/Scripts/python.exe -m pytest -q`: **성공68개/3.07초**. DEMO 설치 자료와 실제 모델 검증 결과는 구분합니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml ai::setup::tests::actual_ -- --ignored --nocapture --test-threads=1`: **성공3개/166.70초**. 두 모델 각각 격리 실제 새 설치→자체 분석/분리→활성화/재사용·marker 보존→pip 중간 취소/새 환경 정리·캐시 보존을 통과했습니다. 실제 앱 데이터의 두 관리 환경도 native 경로로 재검증해 같은 marker/환경을 유지했습니다. 새 설치 검사의 임시 폴더는 안전 경로 확인 후 정리했습니다.
- 처음 실제 검사 실행은 전체 Rust 검사와 같은 테스트 exe를 링크하려다 LNK1104 파일 잠금으로 **실패**했습니다. 전체 검사 종료 후 같은 명령을 단독 실행해 위3개 성공으로 해결했습니다. 제품 앱을 강제 종료하거나 산출물을 삭제하지 않았습니다. 이후 cargo 검사는 순차 실행합니다.
- 확장 Clippy/기존 실제 worker/번들·Windows 실행 갱신 결과는 아래 최종 실행 갱신에 기록합니다. 두 모델 설치 UI 사용자 수동 재검사는 **미실행**, 렌더/API/실제 native 설치를 자동 검증하고 같은 조작을 재요청하지 않습니다. 새 PC 독립 릴리스는 **미실행**입니다.

### 미구현 및 알려진 문제

최종 추가 검사(2026-10-18): 확장 `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` **성공3.47초**. `cargo test --locked --manifest-path src-tauri/Cargo.toml ai:: -- --ignored --skip actual_offline_setup --skip actual_demucs_offline_setup --skip actual_managed_models_reverify --nocapture` **성공5개/13.69초**. 내장 UI `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture` **성공2개/컴파일20.63초**입니다. 기존 테스트 exe 아이콘/MSVC 안내는 남으며 실패가 아닙니다.

Windows 실행 갱신(2026-10-18 14:33): 활성 녹음0개와 AI 자식 작업 없음 재확인 후 PID32912를 정상 종료했습니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` **성공9.72초**, exe25,404,928바이트/14:33:46·새PID33664/14:33:48/제목GuitarLab/HasExited=false로 실행했습니다. 강제 종료/개인 음원 분석·REC 자동 시작은 없으며 앱의 실제 수동 UI 재검사는 미실행으로 유지합니다.

Demucs 네트워크 다운로드 UI·독립 Windows Sidecar/새 PC 실행·OS 강제 종료 후 과거 임시 환경 정리는 미완료입니다. 공식 배포 문서 조사에서 현재 Python3.10 지원 종료와 Basic Pitch3.11 이상 의존성 변경을 확인했습니다. 기존3.10 개발 환경을 새 독립 배포 런타임으로 그대로 채택하지 않습니다. [런타임 전환 검토](../18-AI-RUNTIME-MIGRATION.md)에 근거·권고/수용 조건·미실행 범위를 기록했습니다. 자체 합성 음원 성공은 실제 곡의 분리/카피 정량 품질을 뜻하지 않습니다.

### 다음 작업 계획

기존 환경/프로젝트를 보존하고 지원 중인 Python의 별도 배포용 AI 런타임·ONNX 호환 구성을 검증하는 방향을 확인합니다. 중요한 의존성/보안 문제 중단 규칙에 따라 새 런타임을 무검증 다운로드·자동 교체하지 않습니다. Phase 6 전체 완료/다음 Phase 착수로 표시하지 않습니다.

## Demucs 기존 파일의 관리 캐시 이관 — 2026-10-18

### 작업 개요

2026-10-18, Phase 6의 Demucs 관리 설치를 위해 이미 승인/설치한 로컬 파일을 재사용합니다. 캐시 이관 슬라이스를 완료했으며 환경 설치/Phase 6 전체 완료가 아닙니다.

### 구현 및 변경 사항

`ai/guitarlab_ai/cache_demucs.py`는 고정 manifest 지문·31개 wheel/2개 모델의 크기/전체 SHA를 확인해 앱 데이터 ai/downloads/demucs-4.1.0-htdemucs-6s-windows-cp310에 복사합니다. 새 UUID 작업 폴더의 단일 part/fsync/덮어쓰기 없는 게시·검증 캐시 재사용·취소/실패 시 현재 part/빈 작업 폴더 정리를 적용합니다. 개인 음원 읽기·네트워크·설치/모델 실행은 없습니다. `ai/tests/test_cache_demucs.py`에 원본/캐시 보존·취소/손상·재사용과 계획 지문 검사를 추가하고 docs/12에 계약을 먼저 기록했습니다.

### 테스트 결과

- ai에서 `.venv/Scripts/python.exe -m pytest -q`: **성공67개/1.65초**.
- `.venv/Scripts/python.exe -s -u -m guitarlab_ai.cache_demucs --import-cache`: **성공8.36초**, CACHE_VERIFIED·33개/707,117,623바이트·재사용0개. 기존 다운로드/모델과 사용자 데이터는 변경하지 않았습니다.
- 프론트/Rust 재검사는 **미실행**, 이 슬라이스는 Python 개발 캐시 도구만 변경했고 직전215개/137개 성공을 유지합니다. 새 IPC/UI가 없으므로 앱 재실행도 **미실행/불필요**입니다.

### 미구현 및 알려진 문제

Demucs 관리 환경 설치/활성화와 앱 설치 UI 연결은 다음 작업이며 캐시 완료를 설치 완료로 표시하지 않습니다. 독립 Sidecar/새 PC 검증과 OS 강제 종료 복구도 미완료입니다. 연구용 안내/모델 배포물 제외는 유지합니다.

### 다음 작업 계획

기존 Basic Pitch 설치 절차를 두 고정 모델의 공통 실행 구조로 확장해 오프라인 설치·실제 분리 검증·활성화/기존 환경 보존을 연결합니다. 고정 모델 외 임의 프로세스나 경로는 허용하지 않습니다.

## Basic Pitch 앱 설치 관리·진행·취소 — 2026-10-18

### 작업 개요

Phase 6의 다음 수직 슬라이스로 기존 개발 설치 도구를 앱의 제한된 설치 job에 연결했습니다. 완료 날짜는2026-10-18이며 Basic Pitch 설치 관리 슬라이스는 자동 검증을 마쳤습니다. Phase 6 전체는 진행 중입니다. 기존 설치 환경은 재사용하며 같은 설치 승인·수동 조작을 반복 요청하지 않습니다. 아래 이전 설치 버튼 미구현 설명은 당시 이력입니다.

### 구현 및 변경 사항

- `src-tauri/src/ai/setup.rs`: 준비→고정 pip 직접 자식의 오프라인 설치/의존성 검사→새 환경의 실제 자체8음 분석→활성화 순서로 실행합니다. 준비/검증/게시 Python worker는 하위 프로세스를 만들지 않습니다. 직접 자식은 숨김·출력 제한·시간 제한·취소 후 kill/wait를 적용합니다. 기존 활성 환경은 재설치 없이 실제 분석으로 재검증합니다. 실패/취소 시 이번 새 UUID만 정리하고 이미 게시된 활성 환경은 보존합니다.
- `commands/ai_api.rs`·`ai/mod.rs`·`app.rs`: `install_ai_model`의 고정 schemaVersion/modelId만 허용하며 경로/URL/명령/다른 모델·REC 중 실행·중복 파일 작업을 거부합니다. 설치 중 정상 창 닫기를 막고 취소/완료 대기를 안내합니다. 설치 guard는 오류 때도 해제됩니다.
- `ai/guitarlab_ai/install_managed.py`·`worker.py`: CLI와 앱이 준비/활성화/정리를 공유합니다. native가 정한 UUID·정확한 JSONL 단계/응답 필드를 검증하며, 해시 검증된 setuptools bootstrap 복사본으로 오프라인 설치합니다. 고정41개 manifest/기존 marker·분석/DB 계약은 유지하며 새 의존성·다운로드는 없습니다.
- `src/features/transcription/modelSetup.ts`·`useModelSetup.ts`·`ModelSetupPanel.tsx`: 설치 서비스·상태 제어·최소 UI를 분리했습니다. ‘Basic Pitch 설치 / 재검증’ 버튼·단계 진행·취소·설치/기존 환경 재사용·오류를 표시합니다. `AiRuntimePanel.tsx`·`ModelDownloadPanel.tsx`·`runtime.ts`의 안내도 갱신했습니다.
- `src/features/library/projects.ts`: 설치에 한해 취소 후 native 정리의 terminal 상태를 기다리는 옵션을 추가했습니다. 기존 호출의 즉시 취소 방식은 유지합니다. 새 hook은 정리 오류를 숨기지 않고, 취소 직전에 활성화가 끝난 성공도 보존합니다. `src/shared/logger.ts`에는 경로 없는 설치 이벤트 진단 코드만 추가했습니다.
- Python 설치/worker 검사, Rust 설치·요청/응답·guard 및 실제 오프라인 통합 검사, 프론트 API/버튼/진행·취소/정리 오류·화면 이탈 검사를 추가했습니다. API 계약·로드맵·환경/진행 문서를 갱신했으며 기존 기능 삭제는 없습니다.

### 테스트 결과

- `pnpm verify:app`: **성공**. TypeScript·ESLint·프론트215개/62파일·Vite build·Prettier·cargo fmt/Clippy·Rust137개/기본 제외9개·binary/doc-tests를 통과했습니다. Rust 실행6.21초입니다.
- `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`(ai에서 `-m pytest -q`): **성공63개/1.60초**. 준비 단계의 하위 프로세스 없음·취소 정리·활성 환경 보존·엄격한 설치 JSONL 입력을 포함합니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml ai::setup::tests::actual_offline_setup -- --ignored --nocapture`: **성공1개/61.35초**. 캐시41개를 격리 임시 앱 데이터에 복사해 실제 오프라인 설치→pip check→자체8음→활성화→같은 환경 재검증/marker 보존을 확인했습니다. 별도 임시 환경에서는 pip 실행 중150ms 후 취소→자식 종료/새 UUID 정리·캐시41개 보존까지 확인했습니다. 테스트 폴더는 경로 확인 후 정리했고 기존 실제 활성 환경은 바꾸지 않았습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml ai:: -- --ignored --skip actual_offline_setup --nocapture`: **성공5개/14.44초**. 기존 개발/관리 Basic Pitch·Demucs·실패/시간 제한/취소·실제 분리 기타8음 카피 회귀를 통과했습니다. 기본 제외9개 모두를 실행한 것은 아닙니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공6.04초**. Python 하위 프로세스가 남지 않은 것도 실행 후 읽기 전용 조회로 확인했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**, 컴파일26.38초. 내장 UI·이벤트 권한/사용자 산출물 제외를 확인했습니다. 기존 테스트 exe 아이콘/MSVC 안내는 실패가 아닙니다.
- 최초 타입 검사에서 단계 배열의 undefined 가능성과 새 진단 코드 누락을 발견해 경계 처리/허용 코드 추가로 해결했습니다. 수정 파일1개 포맷 실패도 Prettier 적용 후 전체 검사 통과로 해결했습니다. 제한 환경의 Rust 저장 검사45개 실패는 파일 권한 제한이 원인이었고 허용된 환경의 동일 코드 전체 검사가 통과했습니다. 기존 큰 JS 청크 안내는 남습니다.
- Windows 실행 반영 결과는 아래 실행 갱신에 기록합니다. 새 설치 버튼의 사용자 수동 검사는 **미실행**, API/렌더/실제 native 설치 자동 검증으로 확인하며 반복 조작을 재요청하지 않습니다. 새 PC/릴리스 검사는 독립 Sidecar가 없어 **미실행**입니다.

### 미구현 및 알려진 문제

실행 갱신(2026-10-18 14:16): 읽기 전용 DB의 활성 녹음0개와 Python 하위 작업 없음 확인 후 PID33880을 정상 종료했습니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`은 **성공9.65초**입니다. 실행 파일25,398,272바이트/14:16:03·새PID32912/14:16:05/제목GuitarLab/창 핸들 있음/HasExited=false를 확인했습니다. 기존 활성 환경 f5d44a7c-818a-43d4-a58c-00d563e89c28와 marker SHA a260a3a2318e338e3b3eee29bacdeb74b002a1ab61c52be209fdd0f83341780e는 유지합니다. 앱을 강제 종료하거나 입력/REC·개인 음원 분석을 시작하지 않았습니다.

Demucs 앱 데이터 관리 설치·선택 다운로드 UI, 독립 Windows Python Sidecar·새 PC 설치/오프라인 검증은 미구현/미실행입니다. 현재 설치는 개발 Python3.10/pip22.2.2/worker 소스에 의존합니다. OS 강제 종료 때 남은 과거 임시 환경의 자동 복구/정리는 후속이며 정상 창 닫기는 설치 중 제한합니다. 합성8음 성공은 실제 기타의 정량 품질을 뜻하지 않습니다. 기존 모델 연구용 안내/배포물 제외와 녹음·정밀 동기 제약을 유지합니다.

### 다음 작업 계획

Phase 6을 유지하며 Demucs 관리 환경과 독립 Windows worker의 배포 범위·다운로드 용량/오프라인 실행을 이어갑니다. 미검증 릴리스를 완료 처리하거나 다음 Phase를 앞당기지 않습니다. 사용자 프로젝트·기존 모델 환경/캐시는 보존합니다.

## Basic Pitch 앱 데이터 설치·검증·활성화 — 2026-10-18

### 작업 개요

사용자가 실제 다운로드41개 표시를 확인하고 직접 설치 진행을 요청했습니다. 별도 확인/조작을 다시 요청하지 않고 기존 캐시만으로 앱 데이터에 Basic Pitch0.4.0 환경을 설치했습니다. 의존성·파일 해시·자체8음 분석을 통과한 환경만 활성화합니다. 기존 개발 환경/사용자 프로젝트·녹음은 보존합니다. 이 설치는 현재 PC의 개발 도구/소스 기반이며 Phase 6 전체와 독립 Sidecar는 미완료입니다.

### 구현 및 변경 사항

- `ai/guitarlab_ai/install_managed.py`: 기존 캐시41개/고정 manifest/여유 공간 확인→새 UUID의 venv 생성→오프라인 hash lock 설치→pip check→자체8음 추론→설치 영수증/활성 marker 게시를 구현했습니다. 고정 subprocess/숨김 창·시간 제한/취소·종료 wait·출력 제한을 적용합니다. 실패는 새 UUID 경로를 확인한 뒤 그 환경만 정리하며 기존 marker/캐시를 덮어쓰지 않습니다. 재실행은 활성 환경을 검증해 재사용합니다.
- `ai/models/requirements-basic-pitch-bootstrap-cp310.lock`: resampy의 암묵적 pkg_resources를 위해 Python3.10.8 ensurepip 번들의 setuptools63.2.0을 고정했습니다.1,228,000바이트/전체 SHA 확인·Requires-Python>=3.7·내부 MIT LICENSE를 확인했고 추가 다운로드하지 않았습니다. 기존41개 다운로드 manifest/해시는 변경하지 않습니다.
- `src-tauri/src/ai/managed.rs`·`ai/mod.rs`·`transcription.rs`·`installation.rs`·`commands/ai_api.rs`: Basic Pitch의 분석/검증은 앱 데이터 marker를 우선 사용합니다. 정확한7필드·계약 버전/모델/manifest/seed 해시/자체 검증·UUID/디렉터리/실행 파일을 확인합니다. marker가 없을 때만 기존 개발 환경을 사용하고 손상/누락 환경은 오류로 표시합니다. 새 임의 경로/설치 IPC나 shell 권한은 추가하지 않았습니다.
- `ModelDownloadPanel.tsx`·`ModelInstallationPanel.tsx` 및 기존 관련 렌더 검사: 다운로드 결과가 현재 설치 상태를 단정하지 않도록 수정하고 앱 데이터 환경 우선 검증을 안내합니다. 실제 환경 설치를 했는데도 ‘설치하지 않았다’고 표시하는 문구를 제거했습니다. 설치/카피 비즈니스 로직은 UI 밖에 유지합니다.
- `ai/tests/test_install_managed.py`·native marker/실제 관리 worker 검사: 설치 고정 argv/재사용·실패/취소의 원본 보존·안전한 정리 범위·하위 프로세스 timeout/취소 종료, 잘못된 marker/경로와 실제 새 환경의8음 분석을 추가했습니다.
- `docs/00`·`docs/12`에 구현 전 결정/marker 계약을 기록했습니다. README·진행/환경/모델/보안/로드맵 문서를 실제 결과로 갱신합니다.

### 테스트 결과

- 사용자 실제 다운로드: **성공,41개/다운로드 파일 확인 표시**. 읽기 전용 재확인에서41개/144,366,287바이트·전체 SHA 일치 및83.87GiB 여유를 확인했습니다.
- 최초 두 설치 시도: **실패**. 오프라인 설치와 pip check는 통과했으나 자체 추론에서 pkg_resources가 없었습니다. 모두 활성화하지 않고 해당 새 환경을 정리했습니다. 기존 환경의 동일 자체 검사는 성공했고, 진단을 경로 없는 오류 코드/예외 종류/모듈 이름으로 보완해 resampy.filters의 암묵적 의존성을 확인했습니다.
- bootstrap 보완 후 `.venv/Scripts/python.exe -s -u -m guitarlab_ai.install_managed --install`(ai 디렉터리): **성공**. 추가 다운로드 없이41개 wheel+검증된 setuptools를 설치하고 pip check/모델 해시·자체8음 [64,67,69,71] 두 차례 반복을 통과했습니다. INSTALLED/OWNED_8_NOTES_PASSED·환경 UUID f5d44a7c-818a-43d4-a58c-00d563e89c28로 활성화했습니다.
- 같은 설치 명령 재실행: **성공,ALREADY_ACTIVE**. 같은 환경을 재검증해 재사용했고 활성 marker의 SHA가 이전과 일치했습니다. 환경 실측442,492,196바이트/7,600파일(약422MiB, 디스크 할당량과 다름), 기존 다운로드41개 SHA도 그대로 확인했습니다.
- 최종 Python `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`: **성공60개/1.30초**. 설치 도구6개 검사는 실제 모델과 분리된 DEMO/테스트 subprocess로 수행합니다. 실제 설치/추론 결과는 위 실측과 구분합니다.
- 최종 `pnpm verify:app`: **성공**, 타입/ESLint·프론트209개/60파일·빌드/Prettier·cargo fmt/표준 Clippy·Rust134개/기본 제외8개·binary/doc-tests. Rust 실행5.68초. 기존 큰 JS 청크/MSVC 안내 외 새 실패는 없습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --ignored --nocapture`: **성공5개/13.19초**. 실제 관리 환경의 Python 경로가 앱 데이터 아래인지 확인하고 그 worker의 자체8음 추론을 검증했습니다. 기존 개발/두 모델·취소/실패 회귀도 통과했습니다. 기본 제외8개 전체를 실행한 것은 아닙니다.
- 확장 Clippy `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공2.49초**. `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**, 컴파일12.19초. 기존 테스트 exe 아이콘 리소스/MSVC 안내는 남으며 실패하지 않았습니다.
- 활성 녹음0개/별도 하위 분석 없음 확인 후 PID35196을 정상 종료했습니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공3.05초**, exe25,237,504바이트/13:55:55·새PID33880/2026-10-18 13:55:57/제목GuitarLab/HasExited=false. 강제 종료·REC/분석 자동 시작 없이 반영했습니다.
- 새 관리 환경 UI의 사용자 수동 재검사는 **미실행**, 같은 화면의 렌더/네이티브 실제 추론 자동 검증을 우선하고 불필요한 조작을 재요청하지 않았습니다. 새 PC/설치형 릴리스 검사는 **미실행**, 독립 Sidecar가 아직 없습니다.

### 미구현 및 알려진 문제

앱 내 설치 버튼/설치 job IPC·Demucs 앱 데이터 환경 설치·독립 Python Sidecar/새 PC 설치·OS 오프라인 검사는 미구현/미실행입니다. 현재 설치는 기존 Python3.10.8/pip22.2.2/worker 소스와 자체 fixture에 의존합니다. 모델 검증은 고정 패키지 버전/모델 해시이며 설치된 모든 Python 소스의 전체 무결성을 별도로 보장하지 않습니다. 자체 합성8음 성공은 실제 곡/기타의 정확도 평가가 아닙니다. Demucs의 연구용 안내/배포물 제외도 유지합니다.

### 다음 작업 계획

관리 worker/내장 UI 검증과 실행 파일 반영을 마쳤습니다. 별도 사용자 설치 승인이나 같은 수동 UI 검사를 반복 요청하지 않습니다. 다음은 설치 도구를 제한된 job/앱 관리 동작으로 연결하고, Demucs의 관리 환경 및 Windows Sidecar 범위를 이어갑니다.

## Basic Pitch 선택 다운로드 캐시 후보 — 2026-10-18

### 작업 개요

선택 설치의 다운로드 단계를 구현했습니다. 명시적으로 동의한 Basic Pitch0.4.0의 고정41개 wheel만 앱 데이터에 받고, 설치/분석과 구분합니다. 기존 개발 모델 환경·프로젝트·초안은 변경하지 않습니다. 자동 검증은 완료 범위와 아래 진행 결과를 구분하며, 실제138MiB 네트워크 다운로드/UI 수용은 아직 미실행입니다. Phase 6 전체는 진행 중입니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`: 구현 전 명시적 downloadConsent/허용 모델·캐시/작업 경로·정확한 결과·취소/실패 보존 정책을 정의했습니다. DB/분석 결과 계약은 변경하지 않습니다.
- `ai/guitarlab_ai/model_cache.py`: 고정 manifest의 정규화 JSON SHA를 먼저 검증하고, 지정 HTTPS 호스트/URL의 파일만 받습니다. 프록시 자동 사용/외부 리다이렉트·임의 버전 탐색·압축 해제/실행은 하지 않습니다. 누락 파일 합계+64MiB 여유를 확인하고 실제 수신/검증 바이트의5% 단위 진행을 전송합니다. 크기·전체 SHA/fsync 후 기존 목적지를 덮어쓰지 않는 방식으로 게시하며 이미 검증된 파일은 재사용합니다.
- `ai/guitarlab_ai/worker.py`: download_model의 엄격한 입력/진행 stage·실패/취소를 연결했습니다. 기존 세 분석/조회 action과 선택 모델 검증을 유지합니다. 수신 오류/HTTP 단절은 경로 없는 오류 코드로 변환합니다.
- `src-tauri/src/ai/model_cache.rs`·`ai/mod.rs`: 앱 데이터 경로 검증·고정 실행/30분 제한·공통 진행 전달·정확한 응답 검증을 연결했습니다. worker 중단/종료 후 현재 UUID의 download.part만 정리하고 빈 작업 폴더를 지웁니다. 완료 캐시는 삭제하지 않습니다. 작업 종료 전 임시 파일의 핸들이 닫히도록 기존 자식 wait 정책을 재사용합니다.
- `commands/ai_api.rs`·`app.rs`: download_ai_model은 명시적 true 동의·Basic Pitch만 받고 시작 시 REC 중 거부합니다. 프론트가 임의 경로/URL을 보낼 수 없습니다. 기존 installation/transcription/separation의 공통 worker 호출에는 진행 무시 콜백을 연결해 기존 동작을 유지했습니다.
- `src/features/transcription/modelCache.ts`·`useModelDownload.ts`·`ModelDownloadPanel.tsx`·`AiRuntimePanel.tsx`·`runtime.ts`: 도메인/API·상태·최소 UI를 분리했습니다. 기본 꺼짐 동의·명시적 다운로드/취소·실제 진행·캐시 성공과 설치 미완료/오류를 표시합니다. 재시도에는 다시 동의해야 하고 화면 이탈/취소 후 늦은 성공을 폐기합니다.
- `ai/tests/test_model_cache.py`·`modelCache.test.ts`·`ModelDownloadPanel.test.tsx` 및 native 계약 검사를 추가했습니다. 진행/환경/모델 안내·로드맵/README에 실제 모델 검증 수용과 이번 캐시 단계를 반영합니다.

### 테스트 결과

- 관련 Vitest3파일/6개 및 `pnpm typecheck`: **성공**. 동의 전 native 호출 없음·고정 요청/응답·진행·취소/늦은 응답·재동의·화면 이탈/오류를 확인했습니다.
- 최초 제한 환경의 Python 검사: **실패1개/성공53개**. 임시 download.part→DEMO wheel 게시의 os.rename에서 WinError5가 발생했습니다. 짧은 traceback으로 접근 거부 위치를 확인했고, 허용된 환경에서 전체54개가 통과했습니다. 이후 HTTP 응답 단절 처리를 보완하고 같은 전체 검사를 다시 실행했습니다.
- 최종 `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`: **성공54개/0.94초**. 네트워크 대신 DEMO 바이트/오류를 주입해 원본 보존·재사용·손상/길이/HTTP 단절·취소/공간 부족·경로/URL·게시 충돌을 검사했습니다. 실제 모델 wheel을 다운로드한 검사와 구분합니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --nocapture`: **성공17개/기본 제외4개/2.23초**. 새 캐시 응답 계약과 기존 AI 저장 경로를 확인했습니다.
- 최종 `pnpm verify:app`: **성공**. 타입/ESLint·프론트209개/60파일·빌드/Prettier·cargo fmt/표준 Clippy·Rust133개/기본 제외7개·binary/doc-tests. Rust 실행6.31초. 기존 큰 JS 청크/MSVC 안내 외 새 실패는 없습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --ignored --nocapture`: **성공4개/13.16초**. 기존 실제 모델 파일 검증·개발 worker 실패/timeout/취소·원본8음·분리 기타8음 보존 회귀입니다. 새 다운로드를 성공한 것으로 해석하지 않습니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공4.10초**. 내장 UI의 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**, 컴파일21.52초. 기존 테스트 exe 아이콘 리소스/MSVC 안내는 남으며 실패하지 않았습니다.
- 활성 녹음0개/별도 분석 작업 없음 확인 후 PID33152를 정상 종료했습니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공8.96초**. exe25,204,736바이트/13:38:59·새PID35196/2026-10-18 13:39:00/제목GuitarLab/HasExited=false입니다. 다운로드·입력/REC를 자동 시작하지 않았습니다.
- 실제138MiB 네트워크 다운로드·캐시 재사용 UI는 **미실행, 사용자 확인 대기**입니다. 사용자 조작 전까지 앱/소스를 유지하고 자동 다운로드하지 않습니다.

### 미구현 및 알려진 문제

캐시 확인은 설치 완료/분석 가능 표시가 아닙니다. 실제 가상환경 설치/활성화·Demucs 선택 다운로드·릴리스 Sidecar는 미구현입니다. 현재는 개발 Python worker가 필요하고 시스템 프록시가 필수인 환경은 지원하지 않습니다. HTTP Range로 부분 파일을 이어 받지 않으며 검증 완료 파일만 재사용합니다. 손상된 기존 캐시를 자동 삭제/교체하는 복구 UI는 미구현입니다. 비정상 앱/OS 종료 뒤 남은 과거 작업 임시 파일의 정리는 후속이며, 이번 정상 실패/명시적 취소는 현재 파일만 정리합니다. 고정 manifest가 변경되면 지문/계약을 함께 검토해야 합니다.

### 다음 작업 계획

검증된 새 앱의 환경 설정에서 명시적 동의/다운로드 후41개 파일 확인 표시를 확인하고, 필요하면 재동의/재시도의41개 재사용을 검증합니다. 사용자 검사 동안 앱/소스를 유지합니다. 이후 캐시를 입력으로 하는 앱 데이터의 별도 환경 설치/검증·안전한 활성화, Windows Sidecar를 같은 Phase에서 이어갑니다.

## 두 모델 설치 파일 확인 실제 수용 — 2026-10-18

### 작업 개요

사용자가 환경 설정에서 Basic Pitch와 Demucs 각각의 ‘설치 파일 확인됨’ 표시를 확인했습니다. 파일 검증 슬라이스를 완료했으며 Phase 6 전체는 진행 중입니다.

### 구현 및 변경 사항

수용 결과를 진행 문서에 기록합니다. 이 확인만으로 제품 코드·모델·사용자 파일을 변경하지 않습니다.

### 테스트 결과

- 실제 새 UI의 두 모델 선택/설치 파일 확인: **성공, 사용자 확인 ‘잘 보임’**.
- 이 수용 기록의 자동 검사 재실행: **미실행**, 문서 기록만 필요합니다. 직전 프론트205개/Rust131개·Python46개·실제 worker4개·번들2개 성공을 유지합니다. 다음 다운로드 기능의 검증과 구분합니다.

### 미구현 및 알려진 문제

파일 확인은 추론/DLL·정확도·배포 허가 검사가 아닙니다. 선택 설치기/Sidecar는 계속 미완료입니다.

### 다음 작업 계획

고정 Basic Pitch 파일의 명시적 선택 다운로드·전체 해시 검증·안전한 캐시·취소/재시도를 구현합니다. 기존 설치 환경을 유지하고 다운로드 캐시를 설치 완료로 표시하지 않습니다.

## 선택 모델 설치 파일 확인 — 2026-10-18

### 작업 개요

선택 설치 관리의 선행 단계로, 테스트 worker와 실제 분석 모델 환경을 구분하는 기능을 구현했습니다. 별도 Basic Pitch/Demucs 환경의 고정 패키지 버전·모델 파일 전체 해시를 명시적으로 확인합니다. 파일 검증 경로는 자동 검사를 통과했고 실제 새 UI 확인은 대기입니다. Phase 6 전체와 앱 내 설치기/Sidecar는 미완료입니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`: 구현 전 verify_ai_model/JSONL verify_model의 허용 ID·정확한 응답·오류/취소·파일 확인의 의미를 정의했습니다. 기존 분석·초안·DB v5는 변경하지 않습니다.
- `ai/guitarlab_ai/installation.py`·`worker.py`: 기존 adapter의 패키지/모델 무결성 검사를 재사용합니다. 추론 라이브러리 로드·음원 읽기·설치/다운로드 없이 FILES_VERIFIED만 반환합니다. 미설치/버전/무결성 오류는 기존 코드로 전달하고 취소 시 성공을 내보내지 않습니다.
- `src-tauri/src/ai/installation.rs`·`ai/mod.rs`·`commands/ai_api.rs`·`app.rs`: 두 고정 환경만 실행하는 명령을 추가했습니다. ID/응답 필드/버전/진행·10초 제한·취소 후 자식 종료·REC 중 거부를 적용합니다. 임의 경로/URL/명령은 받지 않습니다.
- `src/features/transcription/modelInstallation.ts`·`useModelInstallation.ts`·`ModelInstallationPanel.tsx`: 도메인/서비스·상태 제어·최소 UI를 분리했습니다. 명시적 모델 선택/파일 확인·취소·오류를 표시하고 소스 변경/실패/취소 후 이전 성공 배지를 지웁니다. 화면 이탈 뒤 늦은 결과도 폐기합니다.
- `AiRuntimePanel.tsx`·`runtime.ts`: 기존 테스트 환경 조회와 별도 모델 확인을 구분하고 미설치/버전/해시 오류 안내를 추가했습니다. 이미 구현된 믹서 연결을 미구현이라고 하던 과거 안내도 수정했습니다. 신규 UI는 기존 panel/token을 사용하며 별도 디자인 작업을 하지 않았습니다.
- `ai/tests/test_installation.py`·`modelInstallation.test.ts`·`ModelInstallationPanel.test.tsx` 및 native 검사를 추가했습니다. README·`docs/06`·`docs/13`·`ai/models/README.md`·로드맵·진행 상태에 저장 기타 초안의 재실행 수용과 이번 범위를 반영합니다.

### 테스트 결과

- 관련 Vitest4파일/7개 및 `pnpm typecheck`: **성공**. 자동 실행 없음·허용 ID 요청/정확한 응답·검증 실패/모델 변경의 이전 성공 폐기·취소/화면 이탈의 늦은 응답 폐기를 확인했습니다.
- `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`: **성공46개/1.47초**. verifier 선택·추론 로드 금지·실패/취소·새 action의 잘못된 입력을 포함합니다.
- 최초 제한 환경의 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --nocapture`: **실패**,3개 성공/12개 임시 저장 검사 STORAGE_ERROR/4개 제외. 같은 제품 코드로 허용된 실행 환경의 전체 검사를 다시 실행했고 해당 저장 검사도 통과했습니다. 파일 접근 제한에 따른 실행 환경 차이로 기록하며 테스트 실패를 숨기거나 제품 검증을 생략하지 않았습니다.
- 최종 `pnpm verify:app`: **성공**. 타입/ESLint·프론트205개/58파일·빌드/Prettier·cargo fmt/표준 Clippy·Rust131개/기본 제외7개·binary/doc-tests. Rust 실행5.65초. 기존 큰 JS 청크/MSVC library 생성 안내가 있으며 새 실패는 없습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --ignored --nocapture`: **성공4개/13.65초**. 승인된 두 실제 모델 환경의 파일 검증·취소 및 기존 실제 개발 worker/원본8음·분리 기타8음/보존 경로를 확인했습니다. 자체 합성 음원만 사용하고 새 모델을 다운로드하지 않았습니다. 기본 제외7개 전부를 실행한 것은 아닙니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공5.69초**.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**, 컴파일26.63초. 내장 UI/자체 fixture 허용 목록·사용자 출력물 제외·종료 안내 권한을 확인했습니다. 기존 테스트 exe 아이콘 리소스/MSVC 안내가 있으며 실패하지 않았습니다.
- 읽기 전용 DB의 활성 녹음0개·별도 하위 작업 없음 확인 후 PID24220을 `CloseMainWindow()`로 정상 종료했습니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공9.57초**. exe25,022,976바이트/13:26:17, 새PID33152/2026-10-18 13:26:19/제목GuitarLab/HasExited=false로 실행했습니다. 강제 종료·입력 캡처·분석 자동 시작은 하지 않았습니다.
- 실제 새 설치 파일 확인 UI의 수용은 **미실행, 사용자 확인 대기**입니다. 두 모델의 명시적 검증 결과를 확인하는 동안 앱/소스를 유지합니다.

### 미구현 및 알려진 문제

FILES_VERIFIED는 설치 파일 확인이며 추론 실행/DLL 호환성·정확도·재배포 허가를 보장하지 않습니다. 패키지 메타데이터와 모델 파일 해시를 검사하며 설치된 모든 Python 소스의 무결성을 새로 검증하는 기능은 아닙니다. 고정 다운로드 용량/필요 여유 공간은 설치 계획이며 실제 디스크 할당량과 다릅니다. 자동 설치·새 다운로드·릴리스 Sidecar·깨끗한 PC 검사는 미구현/미실행입니다. Demucs 가중치의 연구용 안내/배포물 제외를 유지합니다.

### 다음 작업 계획

검사된 내장 UI를 앱에 적용하고 환경 설정에서 Basic Pitch와 Demucs 각각 ‘선택 모델 설치 확인’의 결과를 확인합니다. 사용자 확인 동안 앱/소스를 유지합니다. 이후 앱 데이터 경로의 선택 설치기 및 Windows Sidecar 전략을 같은 Phase에서 이어갑니다.

## 저장 기타 초안 앱 재실행 복원 수용 — 2026-10-18

### 작업 개요

사용자가 재분석 없이 ‘AI 초안 · 8음 · Basic Pitch 0.4.0 · 로컬 초안 보존됨’, ‘입력: 저장 전체 기타’와 기존8음 표가 복원됨을 확인했습니다. 저장 기타 카피 입력 슬라이스의 실제 분석/앱 재실행 복원 확인을 마쳤습니다. Phase 6 전체는 진행 중입니다.

### 구현 및 변경 사항

수용 결과를 진행 문서/로드맵/루트 README에 반영합니다. 기존 제품 코드·원본·초안·모델 환경은 이 수용 기록으로 변경하지 않습니다.

### 테스트 결과

- 앱 재실행 후 선택 입력의 저장 초안 불러오기: **성공, 사용자 확인**. 입력 stem UUID가 표시되고 첫 활성도0.642 및 전체8음/운지가 이전 표와 일치합니다. 모델 재분석 없이 확인했습니다.
- 이 수용 기록을 위한 자동 검사/빌드 재실행: **미실행**, 문서 변경만 필요합니다. 직전202개 프론트/128개 Rust·실제 worker3개·번들2개 성공을 유지합니다. 다음 모델 검증 기능의 검사는 별도로 기록합니다.

### 미구현 및 알려진 문제

실제 기타 정량 품질·과거 분리 set 직접 선택·선택 설치기·Sidecar는 미완료입니다. 합성 음원의 결과를 실제 곡 정확도로 일반화하지 않습니다.

### 다음 작업 계획

테스트 환경과 실제 모델 환경을 구분해 고정 패키지/모델 파일을 확인하는 최소 관리 UI를 구현합니다. 다운로드/설치 완료로 표시하지 않고 설치 계획·용량·제약을 안내합니다. 이후 선택 설치기와 Sidecar 범위를 이어갑니다.

## 저장 전체 기타 카피 실제 8음 수용 — 2026-10-18

### 작업 개요

저장된 최신 전체 기타를 선택한 실제 UI 분석에서 사용자가 8음 결과 표를 확인했습니다. 이 수직 슬라이스의 분석 경로는 수용했으며 앱 재실행 후 저장 초안 복원은 확인 대기입니다. Phase 6 전체는 진행 중입니다.

### 구현 및 변경 사항

제품 코드와 저장 형식은 변경하지 않았습니다. 이 문서, `docs/progress/README.md`, 루트 `README.md`에 실제 분석 수용과 다음 확인 위치를 기록했습니다. 사용자 표의 MIDI는64·67·69·71의 두 차례 반복이며 활성도는0.642·0.445·0.525·0.492·0.562·0.438·0.465·0.587입니다. 첫 운지는2번 줄5프렛입니다.

### 테스트 결과

- 사용자 실제 UI의 저장 전체 기타 분석: **성공,8음**. 낮은 모델 활성도·여러 운지 후보와 일부 박자 정리 오차가 표시됐습니다.
- 읽기 전용 저장 메타데이터 확인: **성공**. 최신 초안의 stemId 존재·요청 문맥 일치·저장 GUITAR_FULL의 SHA와 입력 SHA 일치·8음 및 활성도 일치를 확인했습니다. 사용자 녹음 오디오는 읽지 않았습니다. 활성 녹음은0개였습니다.
- 진행 중인 별도 하위 작업이 없는 PID33776을 `CloseMainWindow()`로 정상 종료하고 동일한 실행 파일을 `Start-Process`로 다시 열었습니다: **성공**, PID24220/2026-10-18 13:17:05/제목GuitarLab/HasExited=false. 강제 종료나 재빌드는 하지 않았습니다.
- 재실행 후 UI의 저장 초안 복원: **미실행, 사용자 확인 대기**. 새 분석 없이 같은 소스를 선택해 저장 초안을 불러옵니다.
- 이번 타입/빌드/자동 테스트 재실행: **미실행**, 문서 기록과 동일 실행 파일 재실행만 수행했습니다. 직전 프론트202개/Rust128개·실제 worker3개·번들2개 성공 기록을 유지합니다.

### 미구현 및 알려진 문제

활성도는 정확도 확률이 아니며 자체 합성 음원의 8음 결과를 실제 기타 분리·카피 품질 평가로 간주하지 않습니다. 과거 분리 set 선택·설치 UI/Sidecar·실제 기타 정량 품질은 후속입니다. 모델 연구용 안내와 배포물 제외를 유지합니다.

### 다음 작업 계획

다시 열린 앱의 같은 자체 테스트 프로젝트에서 입력을 ‘저장된 최신 전체 기타’로 선택하고 ‘저장된 AI 초안 불러오기’로8음과 첫 활성도0.642가 유지되는지 확인합니다. 확인 동안 앱/소스를 유지합니다. 원본 초안 적용/되돌리기/저장 복원은 기존 실제 검사와 새 입력의 자동 계약 검사 결과를 유지하며, 미확인 조합을 실제 수용으로 기록하지 않습니다.

## 개발 재개·0.5× REC 수용·저장 기타 카피 후보 — 2026-10-18

### 작업 개요

사용자가 보류한 녹음 검사 결과 ‘READY · 8.02초 · 384,847프레임 · 누락0 · peak1.000, 녹음 재생도 들림’을 제공해 자동 개발을 재개했습니다. 읽기 전용 저장 메타데이터는48kHz/INPUT_ONLY/USER_INPUT/READY·transport.rate=0.5였습니다. 실제 수용은0.5×이며 이전 안내의1× 성공으로 기록하지 않습니다. 사용자 녹음 WAV를 읽거나 분석하지 않았습니다. Phase 6 전체는 미완료입니다.

같은 Phase의 다음 수직 슬라이스로 저장된 최신 전체 기타 stem을 명시적으로 Basic Pitch 입력으로 선택하고 원본과 독립 문맥에서 초안을 보존/복원하는 후보를 구현했습니다. 기존 원본/녹음/악보·DB v5·Python 추론 계약은 유지합니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`: 구현 전 선택 stemId/정확한 출처·응답 필드/원본 문맥 호환·최신 선택과 과거 set 제한·빈 검출 정책을 추가했습니다.
- `src-tauri/src/ai/transcription.rs`: 선택 stemId의 UUID를 검증하고 GUITAR_FULL만 별도 input.wav snapshot으로 전달합니다. 원본 경로는 기존대로 유지합니다. 원본 응답은 기존10필드, stem 응답에만 stemId를 추가하며 inputSha256은 실제 입력 stem WAV의 해시입니다. 빈 검출/실패/취소 후 이전 초안을 덮어쓰지 않습니다.
- `ai/stem_store.rs`: 같은 프로젝트/부모 자산의 GUITAR_FULL 역할을 확인한 뒤 기존 불변 set/WAV 전체 검증을 재사용합니다. 잔여 반주를 기타로 분석하지 않습니다.
- `ai/drafts.rs`: stemId=None은 직렬화에서 생략해 기존 문맥/hash를 보존합니다. 선택 stem은 별도 문맥에 보존하며 복원 시 역할/출처·파일 해시/실제 길이와 결과 duration을 검증합니다. 모델 재실행은 없지만 파일 누락/손상은 거부합니다. 기존004 테이블을 재사용합니다.
- `commands/ai_api.rs`: 초안 복원도 녹음 중 거부해 새 stem 파일 검증이 REC와 겹치지 않도록 했습니다.
- `src/features/transcription/transcription.ts`·`useTranscription.ts`·`AiDraftPanel.tsx`: 원본/저장된 최신 전체 기타 선택과 명시적 분석/복원을 연결했습니다. 요청과 응답의 stem UUID/필드 구성을 검증하고 입력 출처를 표시합니다. 소스 변경은 이전 초안/검토 상태·늦은 결과를 무효화합니다. 저장된 분리가 없거나 검출이 비면 안내하며 원본으로 자동 폴백하지 않습니다.
- 관련 native/프론트 검사와 별도 실제 모델 통합 검사를 추가했습니다. 테스트 DEMO와 자체 fixture는 제품 분석 결과와 분리합니다.

### 테스트 결과 및 실행 환경

- 사용자 실제 STEM 반주 중 녹음/새 테이크 청취: **성공,0.5×**.1× 실제 장치 재검사·재생 음소거/일시정지 수동 검사는 **미실행**이며 이전 자동 검증과 구분합니다.
- 타입 검사/관련 프론트23개/6파일: **성공**. 선택 전 조회/모델 미실행, 기타 UUID 분석/복원 전달·원본으로 전환 시 이전 결과 폐기, 입력/응답 불일치·추가 필드 거부, 분리 없음/빈 검출·프로젝트 전환의 늦은 입력 폐기를 확인했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --nocapture`: **성공14개/기본 제외3개/2.56초**. 원본·stem 초안 독립 보존/정확한 문맥 재열기·역할/해시/길이/다른 원본·취소 거부, 기존 문맥과 WAV 보존을 포함합니다. 이후 잔여 반주의 초안 없는 복원 요청도 거부하도록 보강해 전체 검사에서 재검증합니다.
- 확장 Clippy: **성공7.41초**. 별도 실제 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --ignored --nocapture`: **성공3개/16.88초**. 자체 음원의 실제 분리 기타에서8음을 검출하고 해당 stem UUID/입력 해시·별도 저장/모델 없는 복원·원본 문맥 분리까지 통과했습니다. 기타 stem은 합성 분리 결과이며 실제 기타 분리 품질/F1 평가가 아닙니다.
- 개발 앱을 사용자가 tauri dev로 실행한 상태라 native 수정 중 자동 재시작/일시 cargo 잠금이 발생했습니다. 최초 조회PID33852 뒤 개발 재빌드PID29836을 확인했습니다. 읽기 전용 DB의 활성 녹음0개 확인 후 PID29836을 정상 종료해 개발 watcher/cargo도 종료됐습니다. 강제 종료하지 않았습니다. 새 수동 검사에는 소스 감시 없는 custom-protocol 실행 파일을 사용합니다.
- 최종 `pnpm verify:app`: **성공**. 타입/ESLint·프론트202개/56파일·프로덕션 빌드·Prettier/cargo fmt·표준 Clippy·Rust128개/기본 제외6개·binary/doc-tests를 통과했습니다. Rust 검사6.08초. 별도 실제 모델 검사3개는 위 명령으로 실행했으며 기본 제외 항목 전체를 실행했다고 주장하지 않습니다. 새 실패는 없고 기존 큰 JS 청크/MSVC library 생성 안내가 남습니다.
- 최신 `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**, 컴파일24.62초. 내장 UI/script·자체 fixture 허용 목록/사용자 출력물 제외·종료 안내 권한을 확인했습니다. 테스트 exe 아이콘 경고는 기존과 같으며 실패하지 않았습니다.
- 실행 중 앱0개 확인 후 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공10.32초**. exe24,912,896바이트/13:11:49, 새PID33776/2026-10-18 13:11:50/제목GuitarLab/HasExited=false로 실행했습니다. 소스 감시·입력/REC·모델 분석을 자동 시작하지 않았습니다.
- 실제 UI 선택/분석/복원·앱 재실행 수용과 Python 단위 재실행은 **미실행**입니다. Python 소스/모델 환경은 변경하지 않아 직전42개 성공을 유지합니다. 사용자에게 기존 자체 테스트 프로젝트의 입력 선택/초안 표시부터 확인하도록 요청하고 그동안 앱/소스를 유지합니다.

### 미구현 및 알려진 제약

UI는 저장된 최신 전체 기타만 선택하며 과거 set 직접 선택은 미구현입니다. 새 분리 set을 만들면 최신 입력과 복원 문맥이 달라집니다. 이전 초안은 보존하지만 자동 폴백하지 않습니다. 분리 stem이 누락/손상되면 저장된 해당 초안 복원을 거부합니다. 활성도는 정확도 확률이 아니며 합성 분리의8음 결과를 실제 기타 품질로 확대하지 않습니다.

설치 UI/Sidecar·실제 기타 정량 품질·녹음 당시 STEM 믹스 snapshot·샘플 정밀 동기는 후속입니다. 모델 연구용 안내·Git/배포물 제외를 유지하고 새 다운로드는 하지 않았습니다.

### 다음 작업 계획

최종 검사 후 custom-protocol 후보를 열고 기존 자체 테스트 프로젝트에서 AI 분석 입력 ‘저장된 최신 전체 기타’→명시적 카피의 실제 초안을 확인합니다. 이어 선택한 소스의 저장 초안 복원/검토 적용·Undo/Redo와 앱 재실행 복원을 확인하고 남은 Phase 6 범위로 진행합니다. 사용자 확인 요청 뒤 앱/소스를 유지합니다.

## 사용자 요청으로 일시중지 — 2026-10-17

### 작업 개요

사용량이 적어 내일 테스트부터 재개하겠다는 사용자 요청에 따라 자동 개발을 중단했습니다. Phase 6은 미완료이며 재개 요청 전 추가 개발/검사/앱 조작을 수행하지 않습니다.

### 구현 및 변경 사항

중지 상태와 다음 검사 위치를 `docs/progress/README.md` 및 이 문서에 기록했습니다. 제품 코드·데이터·의존성은 변경하지 않았으며 앱/입력/REC를 도구로 조작하지 않았습니다.

### 테스트 결과

- 마지막 실제 수용: STEM 믹스 준비 후 하단 재생의 테스트 소리가 들림.
- STEM 반주 중 SSL Input1 REC/READY·길이·누락/새 테이크 청취: **미실행/사용자 요청으로 내일 연기**. 요청만 했으며 결과를 받지 못했습니다.
- 이번 자동 검사/빌드: **미실행**, 일시중지 기록만 작성했습니다. 직전 프론트198개/Rust127개·확장 Clippy/번들2개/Windows 빌드 성공을 유지합니다. Python42개/실제 worker3개는 이전 슬라이스 기록입니다.

### 미구현 및 알려진 제약

직전 절의 기능 제한과 미실행 검사를 유지합니다. 현재 앱/입력/녹음 상태는 새로 확인하지 않았으므로 마지막PID21400 기록을 현재 실행 보장으로 해석하지 않습니다.

### 다음 작업 계획

사용자 재개 요청 후 문서와 실제 앱 상태를 확인하고 같은 저장 프로젝트에서 SSL Input1 입력 시작→연주1×/반복 끄기/로컬 반주 정렬 켜기→믹스 준비→정지 상태 REC로 시작합니다. 줄 한두 번을 튕긴 뒤 자동 종료 또는 STOP·저장 후 READY/길이/누락과 새 테이크의 기타 소리를 확인합니다. 아직 이 확인을 통과했다고 기록하거나 다음 Phase로 넘어가지 않습니다.

## STEM 하단 연주 재생 실제 청취 수용 — 2026-10-17

### 작업 개요

사용자가 같은 프로젝트의 ‘오버더빙 믹스 준비→하단 ▶ 재생’ 요청에 ‘들림’이라고 답했습니다. 저장 STEM의 명시적 준비와 실제 연주 시간축 재생을 확인했습니다. Phase 6 전체는 진행 중입니다.

### 구현 및 변경 사항

제품 코드·계약·의존성 변경은 없습니다. 진행 문서/README/로드맵에 실제 청취 수용과 다음 REC 검사 위치를 갱신했습니다. 현재 앱PID21400과 사용자 데이터는 유지합니다.

### 테스트 결과

- 새 앱의 저장 STEM 준비·하단 재생 청취: **성공/사용자 확인**. 끊김·오류에 대한 별도 수치는 받지 않았으므로 무결점 재생이나 정량 동기 정확도를 보장하지 않습니다.
- 자동 검사/빌드 재실행: **미실행**, 문서 갱신만 수행했습니다. 직전 프론트198개/Rust127개·확장 Clippy·번들2개 성공을 유지합니다. Python42개/실제 worker3개는 이전 슬라이스 성공 기록입니다.
- 같은 STEM 반주를 들으며 실제 SSL Input1의 REC/저장·독립 테이크 청취, 실제 음소거·일시정지/재개 조작, 새 재생 경로의 앱 재실행 후 준비는 **미실행**입니다. 기존 자동 재생/녹음 검사를 실제 장치 확인으로 확대하지 않습니다.

### 미구현 및 알려진 제약

샘플 정밀 동기·녹음 시점 STEM 믹스 전체 snapshot·stem 카피 입력/설치 UI/Sidecar는 후속입니다. 현재 REC는 선택 입력만 기록하고 STEM을 테이크 ID로 전달하지 않습니다. 모델 연구용 안내와 배포물 제외는 유지합니다.

### 다음 작업 계획

SSL Input1 입력을 시작하고 같은 저장 프로젝트의 연주 화면에서1×/반복 끄기/로컬 반주 정렬 켜기·믹스 준비 후 정지 상태 REC를 눌러 짧은 단음을 녹음합니다. 자동 종료 또는 STOP 후 READY/길이/누락과 새 테이크 청취를 확인합니다. 사용자는 숙련된 연주 없이 줄을 한두 번 튕기면 됩니다. 확인 동안 앱/소스를 유지합니다.

## 출력 믹스 재실행 수용·STEM 연주 재생 후보 — 2026-10-17

### 작업 개요

사용자가 저장 STEM 2행/전체70%·각50%의 앱 재실행 복원과 재렌더 청취가 안내대로 동작한다고 확인했습니다. 출력 믹스 구성/청취·새 WAV·설정 재실행 수용을 마쳤습니다. 다음 수직 슬라이스로 STEM을 하단 기준 반주의 시간축에 따라 재생하도록 연결했습니다. Phase 6 전체는 진행 중이며 새 연주 재생 후보의 실제 앱 검사는 미실행입니다.

### 구현 및 변경 사항

- `docs/12-API-CONTRACTS.md`: 구현 전에 read_project_stem의 버전/범위·binary 계약, TAKE/STEM 구분/예산·기준 clock·REC 기록 범위와 한계를 추가했습니다. DB v5/MixDocument/Python 형식은 유지합니다.
- `src-tauri/src/ai/stem_store.rs`·`mixer/render.rs`: 정확한 불변 stem ID 조회에 선택적 기대 원본 asset 검사를 추가했습니다. 출력 믹스는 기존처럼 프로젝트의 임의 저장 stem을 사용하고 연주 준비는 현재 기준 원본과 일치하는 것만 읽습니다. 최신 set으로 대체하지 않고 기존 해시/파일/샘플 검증을 재사용합니다.
- `commands/mixer_api.rs`·`app.rs`: read_project_stem을 허용 목록에 추가하고 UUID/버전/알 수 없는 필드 거부, REC 중 거부·StorageJob 진행/취소·한 번의 binary 전달을 연결했습니다. 임의 파일 경로·실행 인자를 받지 않으며 모델을 실행하지 않습니다.
- `src/features/performance/mixing.ts`·`useProjectMix.ts`: 응답의 프로젝트/원본/stem ID·필드/크기·binary 길이를 재검증하고 준비에서 정확한 UUID를 읽습니다. 같은64MiB 재생 파일 예산/취소·늦은 응답 폐기를 사용합니다. 실제 TAKE만 referenceTakeIds에 전달하며 STEM을 녹음 테이크로 위장하지 않습니다.
- `TakeMixPlayer.ts`: 입력을 TAKE 또는 STEM으로 구분하며 기존 다중 media의 메타데이터 로드/오류·drift/seek·volume/rate·pause/loop/count-in·URL 정리를 공유했습니다. STEM은 원본0ms+레이어 offset과 main.rate를 따르고 TAKE의 기존 정렬/배속 공식을 유지합니다. 원본 media와 clock은 교체하지 않으며 원본 반주 레이어가 없으면 음량만0으로 둡니다.
- `MixPanel.tsx`: STEM의 준비 버튼 제한을 해제하고 현재 재생 범위를 안내했습니다. 기존 소스/녹음 중 잠금과 출력 기능은 유지합니다. 관련4개 프론트 테스트 파일과 native 명령/저장 검사를 갱신했습니다.

### 테스트 결과

- 타입 검사: 성공. `vitest run src/features/performance`: 성공18개/4파일. 새 경계 검사는 잘못된 프로젝트/원본/stem 응답·binary 길이/추가 필드·취소, 실제 파일 UUID 준비/테이크 참조 분리·늦은 준비 폐기를 포함합니다. 재생 어댑터는 혼합 TAKE/STEM의 서로 다른 시각/배속·반복/음소거/Solo·원본 음량 복원·누락/중복/외부 프로젝트 거부·재생 실패 시 주 반주 중단을 확인했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib stem -- --nocapture`: 성공6개/1.22초. 기존5개와 새 명령 요청 경계1개, 정확한 원본 asset의 읽기 성공/다른 asset 거부를 포함합니다. 확장 `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: 성공5.02초.
- 최종 `pnpm verify:app`: **성공**. 타입/ESLint·프론트198개/56파일·프로덕션 빌드·Prettier/cargo fmt·표준 Clippy·Rust127개/기본 제외6개·binary/doc-tests가 통과했습니다. Rust 검사5.60초. 이번 검사에서 실패한 항목은 없으며 큰 JS 청크/MSVC library 생성 안내는 기존과 같습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**, 컴파일25.77초. 최신 내장 index/script·자체 fixture만 포함/사용자 산출물 제외·종료 안내 권한을 확인했습니다. 테스트 exe 아이콘 리소스 경고는 있었으나 실패하지 않았습니다.
- Python 단위 및 별도 실제 AI worker 재실행: **미실행**, Python 코드/모델 환경/추론 프로토콜은 변경하지 않았습니다. 직전42개 Python/실제 worker3개 성공을 유지하며 이번 새 자산 연결 검증은 위 native6개/전체127개로 확인했습니다. 새 연주 재생/REC의 실제 SSL 장치 확인도 **미실행**입니다.
- Windows 적용 전 읽기 전용 DB에서 활성 녹음0개/저장 STEM 믹스1개, 별도 분석 worker 없음을 확인했습니다. 기존PID34840 정상 종료/프로세스 해제 성공 후 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공11.22초**. exe24,899,584바이트/22:21:41, 새PID21400/22:21:43/제목GuitarLab/HasExited=false로 열었습니다. 입력·REC·모델 분석·재생은 자동 실행하지 않았습니다.

### 미구현 및 알려진 제약

청취는 WebView 다중 media의 논리 시각 동기이며 샘플 단위 정밀 동기를 보장하지 않습니다. 기존 지속 drift 보정 정책을 유지합니다. 새 REC는 InputOnly이며 청취한 STEM을 파일에 섞지 않습니다. referenceTakeIds에는 TAKE만 기록하고 STEM 믹스의 녹음 시점 전체 snapshot은 아직 저장하지 않으므로 완전한 청취 환경 재현은 미구현입니다.

기준 원본 media가 재생 가능해야 합니다. 다른 원본의 stem을 같은 악보 시간축에 임의로 연결하지 않습니다. 설치 UI/Sidecar·분리 stem 기반 카피 입력·실제 기타 정량 품질은 후속이며 모델 연구용 안내/배포 제외를 유지합니다.

### 다음 작업 계획

최종 검사 후 현재 앱의 작업 종료를 확인해 정상 종료/새 후보 적용을 진행합니다. 저장된 같은 프로젝트의 ‘오버더빙 믹스 준비→하단 재생’ 청취와 음량/음소거·일시정지/재개를 먼저 확인하고 이후 입력 녹음과 재실행 복원을 확인합니다. 사용자 테스트 요청 뒤 앱/소스를 유지합니다.

## STEM 믹스 새 WAV 수용·설정 재실행 확인 대기 — 2026-10-17 22:10

### 작업 개요

사용자가 ‘믹스 설정 저장→새 WAV 내보내기→외부 플레이어 청취’ 요청에 ‘잘 들림’이라고 답했습니다. 실제 새 파일 선택/출력·외부 청취 수용을 기록하며 같은 믹스의 앱 재실행 복원을 준비했습니다. Phase 6 전체는 진행 중입니다.

### 구현 및 변경 사항

제품 코드·계약·의존성 변경은 없습니다. 진행 문서/README/로드맵의 수용 결과와 재개 위치를 갱신했습니다. 사용자 WAV 파일을 직접 열거나 수정하지 않았으며 같은 실행 파일을 빌드 없이 다시 실행했습니다.

### 테스트 결과

- 새 WAV 출력·외부 플레이어 재생: **성공/사용자 확인**. 합성 테스트 소리이며 실제 기타 분리 품질 평가와 구분합니다.
- 사용자 DB 읽기 전용 조회: 저장 STEM 믹스1개/레이어2개, 전체 gain0.7·각 gain0.5·mute/solo=false·offset0ms, 활성 녹음0개 확인. 별도 분석 worker도 없음을 확인한 뒤 기존PID33080의 정상 종료/프로세스 해제에 성공했습니다. 강제 종료하지 않았습니다.
- 동일 exe 재실행: 새PID34840/22:10:34/제목GuitarLab/HasExited=false 확인. 모델·입력·REC·재생은 자동 시작하지 않았습니다.
- 자동 검사/빌드 재실행: **미실행**, 제품 소스 변경 없이 문서 갱신과 재실행만 진행했습니다. 직전 프론트194개/Rust126개·실제 worker3개/번들2개·Python42개 성공 기록을 유지합니다.

### 미구현 및 알려진 문제

실제 앱 재실행 후 STEM 설정 표시/재렌더 청취는 **미실행/사용자 확인 대기**입니다. 재열기 직후 역할 이름을 별도 조회하지 않아 ‘저장 분리 음원·ID’로 표시되는 것은 현재 한계이며 ID를 바꾸지는 않습니다. 실시간 stem 오버더빙/카피 입력·설치 UI/Sidecar는 후속입니다.

### 다음 작업 계획

같은 프로젝트의 연주 화면에서 새 분리 구성 없이 저장 분리 레이어2개/전체70%·각50% 복원을 확인하고 ‘출력 믹스 만들기→출력 미리 듣기’를 확인합니다. 응답 전 앱/소스를 유지하고 성공 후 같은 Phase의 실시간 stem 재생 연결로 이어갑니다.

## 분리 출력 믹스 실제 청취 수용 — 2026-10-17

### 작업 개요

사용자가 새 앱에서 ‘분리 2개만으로 출력 믹스 구성→출력 믹스 만들기→출력 미리 듣기’ 요청에 ‘들림’이라고 답했습니다. 저장된 stem의 출력 믹스 구성/렌더/실제 청취 수용을 기록합니다. Phase 6 전체는 진행 중입니다.

### 구현 및 변경 사항

제품 코드·계약·의존성 변경은 없습니다. 진행 문서와 루트 README·로드맵에 실제 청취 결과와 다음 검사 위치를 갱신했습니다. 기존 사용자 파일·프로젝트·믹스 설정은 도구로 변경하지 않았습니다.

### 테스트 결과

- 실제 앱의 저장 stem 출력 믹스 구성·렌더·청취: **성공/사용자 확인**. 자체 합성 테스트 소리이며 실제 기타 분리 품질 검증으로 확대하지 않습니다.
- 자동 검사 재실행: **미실행**, 문서만 갱신했으므로 직전 프론트194개/Rust126개·실제 worker3개/번들2개 성공 기록을 유지합니다. Python 소스 변경 없이 직전42개 성공도 유지합니다.
- 같은 STEM 믹스의 실제 설정 저장·앱 재실행 복원/새 WAV 파일 선택·외부 플레이어 청취: **미실행/확인 대기**입니다. 실제 native 자동 WAV 출력 검사와 구분합니다.

### 미구현 및 알려진 제약

STEM은 현재 출력용이며 실시간 연주/REC 오버더빙 연결은 후속입니다. mono 출력·선형 리샘플링·모델 연구용 안내와 배포물 제외를 유지합니다. 새 오류는 보고되지 않았지만 미실행 경로까지 정상이라고 주장하지 않습니다.

### 다음 작업 계획

현재 믹스에서 ‘믹스 설정 저장’과 새 이름 WAV 내보내기/외부 플레이어 청취를 확인합니다. 저장 성공 후 동일 실행 파일을 정상 종료/다시 열어 저장된 STEM UUID와 설정·재렌더를 확인합니다. 응답 전 앱/소스는 유지합니다.

## 분리 저장 재실행 수용·출력 믹스 연결 후보 — 2026-10-17

### 작업 개요

사용자가 앱 재실행 후 같은 프로젝트의 ‘저장된 분리 결과 불러오기’·잔여 반주 청취 요청에 ‘들림’이라고 답했습니다. 분리 결과의 최초 저장/조회·재실행 복원 수용을 마쳤습니다. 다음 수직 슬라이스로 저장 AudioStem을 출력 믹스에 연결했습니다. Phase 6 전체는 진행 중이며 새 믹스 후보의 실제 앱 검사는 아직 미실행입니다.

### 구현 및 변경 파일

- `docs/12-API-CONTRACTS.md`: 구현 전에 STEM kind/정확한 불변 UUID 조회·기존 v1 보존/출력 전용 범위와 실시간 준비 거부 계약을 추가했습니다. 기존 DB v5/Python 계약은 유지합니다.
- `src-tauri/src/ai/stem_store.rs`: 최신 set 조회와 정확한 set 조회의 검증을 공유합니다. 프로젝트·stem ID에서 소속 set/원본 metadata를 찾아 이전 UUID의 WAV를 읽으며, 새 분리 결과로 치환하지 않습니다. 기존 set JSON/원본 metadata/두 stem 행·WAV 샘플·해시 검증을 재사용합니다.
- `src-tauri/src/mixer/model.rs`·`render.rs`·`store.rs`, `commands/mixer_api.rs`: STEM 레이어의 저장/렌더/내보내기를 연결하고 검증 단계에도 취소 신호를 전달합니다. 기존48kHz mono float32/채널 평균·선형 리샘플링/음량·음소거·Solo·오프셋·limiter/출력 정책을 유지합니다. 기존 TAKE/LOCAL_ASSET 파일과 동작은 변경하지 않습니다.
- `src/features/performance/mixing.ts`·`useProjectMix.ts`·`MixPanel.tsx`: 명시적으로 저장 분리 결과만 조회해 두 STEM으로 편집 중 믹스를 구성합니다. 이전 편집 레이어를 교체하지만 원래 저장 믹스는 ‘믹스 설정 저장’ 전까지 유지합니다. 음원 이름/식별자·출력 전용 안내, 진행/취소·늦은 응답 폐기, 기존 실시간 오버더빙 준비 거부를 연결했습니다. 모델을 자동 재실행하거나 REC/재생을 자동 시작하지 않습니다.
- 동일 폴더의 `mixing.test.ts`·`useProjectMix.test.tsx`·`MixPanel.test.tsx`와 native stem/mixer 검사를 확장했습니다. `ai/separation.rs`의 별도 실제 모델 검사에 실제 저장 stem의 믹스/새 WAV 출력·동일 경로 충돌 거부를 추가했습니다. 테스트의 합성 WAV/metadata는 테스트 DEMO이며 제품 결과로 표시하지 않습니다.

### 테스트 결과 및 오류 해결

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai::stem_store -- --nocapture`: 성공5개/1.38초. 새 검사는 이전 ID 참조 유지/새 set 추가 후 저장 믹스 재열기,44.1k stereo→48k mono·gain/mute/Solo/offset·취소/다른 프로젝트/손상 거부·원본 불변을 검증합니다. 실제 분리 품질 검사가 아닙니다.
- 관련 프론트 `vitest run src/features/performance`: 성공14개. 저장 결과 조회만 실행/분석 미호출·교체만으로 자동 저장 안 함/명시적 저장·렌더, 출력 전용 믹스의 실시간 준비 차단, 조회 중 화면 이탈의 늦은 응답 폐기와 기존 오버더빙 회귀를 확인했습니다.
- 최초 프론트 검사1개는 일반 Error가 isRecord 경로로 들어가 code가 undefined가 되어 정확한 안내를 잃는 기존 공통 변환 문제를 드러냈습니다. 문자열 code가 있는 경우만 우선하고 Error.message로 이어지도록 수정한 뒤 통과했습니다.
- 최초 확장 Clippy는 테스트의 고정4바이트 chunks_exact_mut 지적으로 실패했습니다. as_chunks_mut::<4>로 수정했습니다. 첫 verify:app은 타입/린트·194개 프론트·프로덕션 빌드까지 성공했으나 테스트 파일1개의 Prettier에서 중단해 포맷을 수정했습니다. 최종 `pnpm verify:app`은 타입/ESLint·194개 프론트/56파일·프로덕션 빌드·Prettier/cargo fmt·표준 Clippy·Rust126개/기본 제외6개·binary/doc-tests까지 성공했습니다. Rust 검사6.88초, 기존 alphaTab 큰 청크 및 MSVC library 생성 안내는 있었으나 실패하지 않았습니다. 실제 모델 검사 추가 후 확장 Clippy도4.11초로 성공했습니다. 실제 worker/번들 검사는 진행 중이며 아래 후속 기록으로 갱신합니다.
- 후속 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --ignored --nocapture`: **성공3개/10.29초**. 실제 Demucs→불변 보존/새 저장소 복원→STEM 믹스192,000프레임/4초·제한 전 peak0.1~0.2/제한0프레임→테스트 전용 새 WAV의 바이트 일치와 같은 경로 덮어쓰기 거부까지 확인했습니다. 기존 Basic Pitch/worker 실패·취소 회귀도 통과했습니다. 자체 fixture만 사용했으며 사용자 파일을 분석하거나 추가 다운로드하지 않았습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**, 컴파일28.70초. 최신 내장 UI/script·허용 fixture와 사용자 출력물 제외·종료 안내 권한을 확인했습니다. 테스트 exe 아이콘 리소스 경고는 기존과 같고 실패하지 않았습니다.
- Python 단위 검사 재실행·새 앱 실제 믹스·설정 저장/재실행·새 WAV 수동 출력은 **미실행**입니다. Python 소스/모델 환경은 변경하지 않았으며 기존42개 성공을 유지합니다. 위 실제 native 자동 WAV 출력과 수동 파일 선택/청취를 구분합니다.
- Windows 적용 전 읽기 전용 DB의 활성 녹음0개/분리 set1개·Python worker 없음을 확인했습니다. 기존PID13176의 정상 종료 요청/프로세스 해제 성공 후 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공12.19초**. exe24,808,960바이트/22:00:07, 새PID33080/22:00:33/제목GuitarLab/HasExited=false로 열었습니다. 입력·모니터·REC·분석은 자동 실행하지 않았습니다.

### 미구현 및 알려진 제약

이번 연결은 출력 믹스 미리 듣기/설정 저장/새 WAV 출력용입니다. STEM 포함 믹스의 연주 중 다중 재생·REC 오버더빙 연결은 후속이며 준비 버튼을 비활성화하고 서비스에서도 거부합니다. stereo 보존·고품질 리샘플링·샘플 정밀 동기화는 구현하지 않았습니다. 복원한 이전 set의 역할 이름을 별도 조회하지 않았다면 ‘저장 분리 음원·ID’로 표시하며 ID는 유지됩니다.

모델 설치 UI/Sidecar·stem 기반 AI 카피·실제 기타 정량 품질·장애 주입은 후속입니다. 모델 연구용 안내와 Git/배포물 제외는 유지합니다.

### 다음 작업 계획

최종 검사 후 검증된 후보를 실제 앱에 적용하고 ‘연주→분리 2개만으로 출력 믹스 구성→출력 믹스 만들기→출력 미리 듣기’를 확인합니다. 이어 명시적 설정 저장/재실행 복원·새 WAV 출력을 검증하고 같은 Phase의 실시간 재생/stem 기반 카피 연결로 진행합니다. 수동 확인 요청 뒤에는 앱/소스를 유지합니다.

## 분리 결과 저장·조회 청취 수용, 앱 재실행 확인 대기 — 2026-10-17 21:48

### 작업 개요

사용자가 재분리 후 ‘저장된 분리 결과 불러오기’와 잔여 반주 청취 요청에 ‘들림’이라고 답했습니다. 같은 실행의 저장/조회·청취 수용을 기록합니다. Phase 6 전체는 진행 중이며 앱 재실행 복원 수용은 아직 미실행입니다.

### 구현 및 변경 사항

제품 코드·데이터 계약·의존성 변경은 없습니다. `docs/progress/PHASE-06.md`·`docs/progress/README.md`와 루트 `README.md`·`docs/08-IMPLEMENTATION-ROADMAP.md`에 실제 수용 결과와 다음 검사 위치를 갱신했습니다. 기존 원본·악보·테이크·분리 WAV를 변경하지 않았습니다.

### 테스트 결과

- 사용자 실제 UI: 저장된 결과 조회 후 잔여 반주 청취 **성공**. 실제 기타 품질 수용으로 확대하지 않습니다.
- 사용자 DB 읽기 전용 조회: v5/분리 set1개/stem2개/활성 녹음0개 **확인**. 최초 재실행 점검에서는 하위 프로세스를 모두 작업으로 취급해 중단했지만, 실제 조회 결과는 정상 WebView2 프로세스뿐이었습니다. 별도 Python 분석 worker는 없음을 확인한 뒤 정상 종료를 진행했습니다.
- 실제 기존PID2584에 CloseMainWindow=true/WaitForExit=true **성공**, 강제 종료 없이 프로세스 해제. 새 빌드 없이 동일 exe를 다시 실행해 새PID13176/21:48:07/제목GuitarLab/HasExited=false를 확인했습니다. 입력·REC·분석은 자동 시작하지 않았습니다.
- 자동 검사 재실행은 **미실행**: 이번 작업은 문서 갱신과 완료된 앱의 재실행만 수행했습니다. 직전 프론트191개/표준 Rust125개·번들 포함127개/실제 worker3개·Python42개 성공 기록을 유지합니다.

### 미구현 및 알려진 문제

앱 재실행 후 UI의 모델 재실행 없는 조회·청취는 **미실행/사용자 확인 대기**입니다. 믹서/stem 카피 연결·설치 UI·Sidecar·실제 기타 정량 품질도 후속입니다. 모델 연구용 안내와 Git/배포물 제외는 유지합니다.

### 다음 작업 계획

새 앱에서 같은 프로젝트를 열고 ‘저장된 분리 결과 불러오기’만 눌러 두 플레이어·잔여 반주 청취를 확인합니다. 재분리 버튼은 필요 없습니다. 확인 동안 앱/소스를 유지하고, 수용 후 같은 Phase의 믹서/stem 카피 연결로 이어갑니다.

## 저장 후보 Windows 적용·종료 지연 수정 — 2026-10-17 21:38

### 작업 개요 및 구현

분리 결과 영구 보존/재열기 후보를 실제 Windows 개발 앱에 적용했습니다. Phase 6 진행 중이며 저장 기능의 실제 UI 수용과 앱 재실행 복원은 아직 확인 대기입니다. 기존 문서와 데이터는 유지했습니다.

사용자가 기존 창을 닫았다고 답한 뒤 PID19936의 창 핸들0/제목 없음·자식 프로세스 없음과 읽기 전용 DB의 활성 녹음0개/v4를 확인했습니다. 해당 식별자·시작 시각·실행 경로를 다시 검사한 뒤 창 없이 남은 프로세스만 종료해 파일 잠금을 해제했습니다. 새 빌드의 입력/녹음/분석을 시작하지 않은 검사 앱에서도 정상 닫기 후 프로세스 잔류를 재현했습니다.

`src-tauri/src/app.rs`에서 주 창 `Destroyed` 시 `app_handle().exit(0)`으로 Tauri 종료 수명주기를 명시적으로 요청하도록 수정했습니다. 녹음 중 CloseRequested 차단은 유지하며 임의 타이머나 강제 프로세스 종료를 제품 코드에 추가하지 않았습니다. 설치된 Tauri2.12.3/tauri-runtime-wry2.12.1 소스의 종료 API와 이벤트 계약을 확인했습니다. 내부 런타임의 잔류 원인까지 확정한 것은 아니며 주 창 종료 후 앱 종료 조건을 명시한 수정입니다.

### 실행 검증 및 결과

- 수정 전 첫 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: 성공13.20초. 검사 앱PID26892는 실제 제목GuitarLab 창이 준비된 뒤 CloseMainWindow를 요청해도10초 뒤 창 핸들0/프로세스 잔류였습니다. 검사 앱에서 사용자 작업은 시작하지 않았으며 이후 그 잔류 프로세스만 정리했습니다.
- 수정 후 `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`·`cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: 성공, Clippy4.32초.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib`: 성공127개/기본 제외6개/5.94초. 기존125개와 번들2개를 함께 실행했습니다. Python/프론트 소스는 변경하지 않아 이 추가 수정 후 재실행은 미실행이며 직전191개 프론트/42개 Python 성공 기록을 유지합니다.
- 수정 후 같은 Windows build 명령: 성공18.06초. exe24,796,160바이트/21:37:41. MSVC 라이브러리 생성 안내 경고는 있었으나 실패하지 않았습니다.
- 실제 창 준비 후 정상 종료 검사: 새PID15432에서 CloseMainWindow=true/WaitForExit=true로 프로세스 해제 성공. 사용자 검사용 새PID2584/21:38:01/제목GuitarLab/창 핸들 존재/HasExited=false로 다시 열었습니다. 입력·모니터·REC·분석은 자동 시작하지 않았습니다.
- 새 앱 실행 후 사용자 DB를 읽기 전용으로 확인해 user_version5/분리 set0개/활성 녹음0개를 확인했습니다. 실제 사용자 DB 마이그레이션은 적용됐지만 아직 새 분리를 요청하지 않았으므로 저장된 분리 결과는 없습니다. 이전v4 실행 파일로 되돌려 열지 않습니다.

### 알려진 제약 및 다음 작업

실제 사용자 프로젝트의 새 저장/조회·앱 재실행 복원, 녹음 중 닫기 차단의 실제 장치 재검사, 분석 중 창 닫기·종료 지연의 모든 조건 검사는 **미실행**입니다. 기존 자동 녹음 보호 검사를 통과한 사실을 실제 녹음 중 종료 검증으로 확대하지 않습니다. 자동 검사에서 실제 모델 저장/새 저장소 재열기는 성공했지만 UI 수용과 구분합니다.

같은 자체 sine 프로젝트를 새 앱에서 한 번 재분리해 ‘분리 결과를 프로젝트에 저장했습니다’를 확인하고 ‘저장된 분리 결과 불러오기’로 재생 여부를 확인합니다. 이후 앱 재실행 복원을 확인한 뒤 동일 Phase의 믹서/stem 카피 연결을 진행합니다. 이 확인 동안 앱/소스는 유지합니다.

## Demucs 미리 듣기 실제 수용·저장 슬라이스 착수 — 2026-10-17

사용자가 새 앱에서 전체 기타는 들리지 않고 잔여 반주는 테스트 소리가 잘 들린다고 확인했습니다. 자체 sine 입력의 실제 출력 peak기타0.000641/잔여0.179132와 일치하는 청취 수용으로 기록합니다. 두 플레이어/로컬 실제 실행 경로를 확인했으며 실제 기타 분리 정량 품질이나 일반 곡의 성공을 의미하지 않습니다. 이번 응답만으로 전체 Phase 6을 완료 처리하지 않습니다.

다음 수직 슬라이스는 별도 AudioStem 식별자·SQLite 추가005와 불변 WAV 보존, 모델 재실행 없는 저장 결과 재열기입니다. 기존 원본/악보 revision·테이크·보정과 Python 프로토콜은 유지합니다. 새 계약을 먼저 기록하고 정상/실패/취소·손상/다른 프로젝트·기존 v4 보존/재열기 검사를 추가합니다. 현재 앱PID19936을 종료/재실행하지 않고 후보 소스만 준비하며, 기존 메모리 미리보기를 저장된 결과로 소급 기록하지 않습니다.

## 분리 결과 영구 보존·재열기 후보 — 2026-10-17

### 작업 개요

앞선 실제 미리 듣기 수용 후 같은 Phase의 다음 슬라이스를 구현했습니다. 목표는 실제 분리한 전체 기타/잔여 반주를 원본·악보·녹음과 독립적으로 보존하고 앱 재실행 이후 재분석 없이 읽는 것입니다. 후보 구현과 부분 자동 검증을 마쳤고 전체 검사/새 Windows 수용은 진행 중입니다. 전체 Phase 6 완료가 아니며 완료 날짜는 없습니다.

### 구현 및 주요 파일

- 신규 `storage/migrations/005-audio-stems.sql`: 독립 set/stem 테이블과 프로젝트/원본 자산·set 복합 FK/역할 UNIQUE·JSON/WAV 상한을 추가했습니다. DB를5로 올리고 기존001~004는 변경하지 않았습니다.
- 신규 `ai/stem_store.rs`: 실제 native 검증 결과만 새 UUID 두 파일로 보존하며 파일 fsync→set/두 행 transaction 공개 순서를 사용합니다. 프로젝트20개 상한, 새 디스크 여유 검사·커밋 전 취소/DB 실패 정리를 제공합니다. metadata JSON과 해시·원본/모델 provenance를 보존하고, 최신 결과의 행/파일/샘플·해시/peak를 검증해 모델 없이 재열기합니다. 공개 JS 임의 저장 명령은 없습니다.
- `ai/separation.rs`·`ai/mod.rs`: 실제 분석 성공 전에 새 저장을 완료하도록 연결했습니다. 기존 출력 검증/상한·작업 폴더 정리와 WAV 검사 함수를 재사용하고 Python 결과 계약은 유지합니다. 실제 모델 통합 검사에 저장 후 새 ProjectStore의 동일 데이터/binary 복원을 추가했습니다.
- `commands/ai_api.rs`·`app.rs`: 기존 StorageJobs·녹음 중 거부를 재사용한 restore_project_separation을 등록했습니다. 빈 결과는 null이며 존재하면 같은 단발 binary 경로로 두 WAV를 제공합니다.
- `storage/database.rs`·기존 projects/recordings/mixer/AI draft 검사: 추가005와 최신v5/미래v6 거부, 실제 v2/v3 fixture에서 새 테이블을 먼저 제외하도록 갱신했습니다. 기존 데이터 보존 검증은 유지합니다.
- 프론트 `separation.ts`·`useSeparation.ts`·`StemSeparationPanel.tsx`·fixture/계약/UI 검사: 필수 stemSetId/createdAtMs·각 stem.id 검증, 명시적 저장 결과 조회/빈 결과/오류·취소와 늦은 응답 폐기를 연결했습니다. 재분리·재열기 공통 binary 검증과 Blob URL 수명을 재사용합니다. 성공은 로컬 저장됨을 표시하고 모델 재실행 없는 조회 버튼을 제공합니다.
- `transcription.ts`·`AiRuntimePanel.tsx`: 보존20개 상한 오류와 별도 설치/기능 범위 안내를 갱신했습니다. 기존 악보/PlayerEngine/채점·녹음·믹서 동작과 Python 소스는 바꾸지 않았습니다. docs/12의 새 계약은 구현 전에 기록했습니다.

### 테스트 결과와 오류 해결

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai::stem_store -- --nocapture`: **성공4개/1.16초**. 모델/원본 오디오 재읽기 없는 최신 복원·새 ID/이전 파일 보존, 미리 취소/잘못된 metadata·다른 프로젝트/두 번째 stem INSERT 실패 rollback/새 파일 정리, JSON hash/행/NaN WAV·UUID 경로 위조/손상 최신 폴백 금지, v4→v5/이전 초안·자산 유지/20개 상한·40개 stem 행 보존을 검사했습니다. 작은 WAV는 테스트 DEMO이며 실제 분리 품질 자료가 아닙니다.
- 타입 검사: **성공**. `pnpm exec vitest run src/features/transcription`에 해당하는 로컬 Vitest 실행: **성공19개/6파일**. 새 조회의 null/손상 envelope·모델 재분석 미호출·두 플레이어와 URL 회수, 기존 초안/환경 회귀를 포함합니다.
- 최초 Rust 컴파일은 rusqlite0.40.2의 u64 ToSql/FromSql 미지원으로 실패했습니다. 기존 저장 규칙처럼 i64로 checked 변환하고 읽은 값도 범위 검증된 예상 크기와 비교해 해결했습니다. 타입 캐스팅으로 오류를 숨기지 않았습니다.
- 확장 Clippy: **성공5.82초**. 실제 AI worker 회귀3개: **성공8.11초**. 새 Demucs 실제 분석→영구 저장→새 ProjectStore의 동일 metadata/binary 재열기·취소 정리와 기존 Basic Pitch/worker를 확인했습니다. 첫 전체 검사에서는 프론트191개/타입·린트/빌드·포맷/표준 Clippy가 성공했으나 기존 v2 믹서 검사의 최종 버전 예상값4가 남아 Rust124개 성공/1개 실패였습니다. 해당 예상값을5로 갱신한 뒤 최종 `pnpm verify:app`이 타입/ESLint·프론트191개/56파일·production build·Prettier·cargo fmt/표준 Clippy·Rust125개/기본 제외6개·binary/doc-tests까지 모두 성공했습니다. 최신 custom-protocol bundle_tests도2개/28.10초로 통과했습니다. 기존 큰 JS 청크·MSVC library 생성/테스트 exe 아이콘 경고는 유지하며 실패는 없습니다.
- Python 단위 재실행: **미실행**, Python 소스/프로토콜/모델 환경은 바꾸지 않았습니다. 직전42개 성공을 유지하며 native 실제 모델 검사는 새 저장 연결을 포함해 다시 실행합니다.

### 미구현 및 알려진 제약

최신 set 하나만 조회합니다. 이전 결과 선택·삭제·복구·강제 종료 orphan 자동 정리·프로젝트 ZIP·믹서 연결·stem 기반 카피는 후속입니다. 커밋 후 늦은 취소는 저장 결과가 남을 수 있어 재열기로 확인하도록 안내합니다. 원본과 손상된 이전 결과를 자동 삭제/덮어쓰지 않습니다. 현재 앱PID19936은 저장 기능 이전 버전이며 해당 메모리 결과를 새 DB에 소급 저장하지 않습니다. 새 앱에서 한 번 재분리해야 보존됩니다.

실제 사용자 프로젝트의 새 저장/재열기·앱 재실행 복원, 디스크 부족 실장치 주입·강제 프로세스 종료/전원 장애는 **미실행**입니다. 고정 합성 fixture와 원자성 자동 검사를 실제 기타 품질이나 임의 장애의 복구 보증으로 확대하지 않습니다. 모델 연구용 안내/배포물 제외·설치 UI/릴리스 Sidecar 미구현은 유지합니다.

### 다음 작업 계획

최종 검사를 마친 뒤 완료된 기존 미리 듣기 테스트 창을 정상 종료/새 후보로 전환하고, 자체 fixture의 재분리→저장됨→저장된 결과 불러오기/재생을 사용자 확인합니다. 확인 동안 앱/소스를 유지합니다. 저장 수용 이후 재실행 복원과 동일 Phase의 mixer/stem 카피 연결로 진행합니다.

## 사용자 승인 후 Demucs 설치·분리 미리보기 후보 — 2026-10-17

### 작업 개요

사용자가 오픈소스 공개 계획을 알리고 Demucs 사용을 명시적으로 요청했습니다. 약675MiB 다운로드·별도 개발 설치를 진행하고, 전체 기타/잔여 반주를 카피 화면에서 미리 듣는 첫 수직 슬라이스를 구현했습니다. 연구용 가중치 안내는 유지하며 코드 공개를 가중치 허가 변경으로 간주하지 않습니다. 전체 Phase 6은 진행 중이고 완료 날짜는 없습니다. 아래 설치 보류/미다운로드 기록은 당시 이력입니다.

### 구현 및 주요 변경 파일

- `.gitignore`: 별도 `ai/.venv-demucs`를 제외해 모델/런타임이 Git에 포함되지 않게 했습니다. 기존 Basic Pitch/테스트 환경은 변경하지 않았습니다.
- `ai/guitarlab_ai/separation/wav.py`·`demucs.py`:64MiB/60초 이하 기본 RIFF PCM16/float32 mono/stereo 입력을 검증하고 고정31개 패키지/2개 모델 파일의 무결성을 확인합니다. 허용 HTDemucs 클래스·로컬 safetensors만 로드하며 자동 다운로드/get_model·legacy pickle 폴백이 없습니다. CPU최대4스레드/shifts0·기본 분할로 전체 기타와 resampled 원본에서 추정 기타를 뺀 residual을 출력합니다.
- `model_integrity.py`: 기존 Basic Pitch의8MiB 기본 상한을 유지하면서 명시적인 파일 크기 상한 인자를 추가했습니다. Demucs만64MiB 상한을 사용합니다.
- `separation/job.py`·`worker.py`: JSONL v1의 separate 액션과 고정 입력 필드·진행/취소·16KiB 결과 manifest를 연결했습니다. 실패/취소 시 새로 만든 출력만 정리하며 원본을 바꾸지 않습니다.
- `src-tauri/src/ai/separation.rs`: 같은 프로젝트의 ORIGINAL WAV만 검증 snapshot으로 복사합니다. 별도 모델 worker·300초 timeout/1초 취소 회수, 예상 경로·입력/출력 해시/모델 provenance·프레임·모든 유한 샘플·실제 peak를 검증한 뒤 binary 두 WAV를 기존 StorageJob에 단발 반환합니다. 성공/실패/취소 후 자신의 작업 파일만 정리합니다.
- `ai/mod.rs`: private Action enum으로 inspect/transcribe/separate의 모델/결과 경로·stage를 구분하고 JSONL 상한을64줄/합계256KiB로 유지합니다. 환경 선택 공통 함수는 고정된 내부 경로만 사용합니다. release Sidecar 미구현 정책은 유지합니다.
- `commands/ai_api.rs`·`app.rs`: 녹음 중 거부·기존 작업 중복 방지/취소를 따르는 separate_project_audio를 등록했습니다. `mixer/mod.rs`는 기존 검증된 PCM 디코더를 crate 내부에서 재사용할 수 있게 했으며 믹스/오디오 계산은 변경하지 않았습니다.
- `src/features/transcription/separation.ts`·`useSeparation.ts`: 엄격한 결과 계약/binary 길이·분할, 오류/취소/프로젝트 변경·늦은 응답 방어, Blob URL 생성/회수를 UI와 분리했습니다. 원곡 PlayerEngine·악보/채점·테이크를 변경하지 않습니다.
- `StemSeparationPanel.tsx`·`ScoreWorkspace.tsx`·`AiRuntimePanel.tsx`: 카피 화면의 명시적 분리 버튼/진행·취소/두 개 기본 audio controls와 AI 추정/소실/미지원 안내를 추가했습니다. 기본 worker 환경과 별도 두 모델 환경을 구분합니다. 디자인 작업이나 새 라이브러리는 추가하지 않았습니다.
- Python 테스트2파일·프론트 계약/UI 테스트2파일/전용 fixture, native 검증/실제 모델 검사를 추가했습니다. docs/12의 신규 계약을 구현 전에 작성했고 기존 저장 스키마/마이그레이션은 바꾸지 않았습니다. README·docs/00/06/10/13·모델/진행 문서를 갱신합니다.

### 실행 검증 및 오류 해결

- 고정31개 wheel·2개 모델 다운로드: **성공**, 크기/전체 SHA-256 모두 일치. 합계707,117,623바이트·674.36MiB. 공식 공급 URL만 사용했고 사용자 음원 전송은 없습니다. 별도 환경에서 offline/no-index/no-deps/require-hashes/only-binary 설치 및 `ai/.venv-demucs/Scripts/python.exe -m pip check`: **성공**, No broken requirements found. 설치 환경 실측3,411,866,320바이트(약3.18GiB)와 별도 wheel 캐시652,231,858바이트입니다. 개발 작업용 스크립트/영수증은 ignored `src-tauri/target`에 있으며 제품 설치 UI가 아닙니다.
- 자체 실제 CPU 검사: **성공**. public/fixtures/sine.wav4초를 작업 사본으로만 분석해44.1kHz stereo176,400프레임의 두 WAV를 만들었습니다. 첫 분리5.735초, 합산한 두 결과와 resampled 원본의 최대 절대 오차1.49e-8, 출력 peak기타0.000641/잔여반주0.179132입니다. sine은 실제 기타가 아니므로 기타 stem의 낮은 에너지를 누락 버그/품질 성공으로 해석하지 않습니다. 원본 SHA 불변·추론 중 취소/출력 정리를 통과했고 socket connect/urlopen 차단 상태로 실행했습니다. OS 방화벽 수준 검증은 아닙니다.
- `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`: **성공42개/0.95초**. 포맷/실제 chunk 길이·과대/손상 입력·기존 출력 보존/취소·별도 모델 미설치/상한·액션/작업 manifest 실패/원본 유지 회귀를 포함합니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai::separation::tests::real_demucs_worker_preview_keeps_original_and_cleans_success_and_cancel -- --ignored --nocapture`: **성공1개/7.58초**. Rust→실제 worker→두 WAV의 재검증/binary·원본/작업 정리, 취소 후5초 이내 회수까지 확인했습니다. 개인 프로젝트/테이크와 입력 장치는 사용하지 않았습니다.
- 제한 환경 첫 Rust 검사: hard-link가 허용되지 않아 기존 저장 fixture의 import4개가 실패했습니다. 제품 검증을 완화하지 않고 동일 검사에 필요한 실행 권한으로 재실행해 AI8개 성공/3개 기본 제외를 확인했습니다.
- TypeScript의 nullable preview 캡처 오류를 지역 상수로 수정했습니다. JSDOM에 없는 createObjectURL로 UI 검사2개가 실패해 테스트에만 URL 생성/회수 stub을 넣고 두 검사 성공을 확인했습니다. 실제 미디어 청취로 대신 주장하지 않습니다.
- 전체 검사의 ESLint ref 정리 경고는 기존 useTranscription처럼 mounted/generation을 분리해 해결했습니다. Rust1.98 Clippy의 chunks_exact_to_as_chunks 요청은 고정4바이트 배열 순회로 해결했고 `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공**입니다.
- 최종 `pnpm verify:app`: **성공**. 타입·ESLint·프론트189개/56파일·production build(main약1,436.26kB)·Prettier·cargo fmt/표준 Clippy·Rust121개/기본 제외6개·binary/doc-tests까지 통과했습니다. 이전 두 실패 실행과 수정 내용을 위에 구분했습니다. 기존 alphaTab 큰 청크 경고는 남았고 빌드는 성공했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --ignored --nocapture`: **성공3개/12.64초**. 기존 개발 worker의 실패/timeout/취소와 Basic Pitch 실제8음/보존/복원, 새 Demucs 실제 분리/검증/취소/정리를 모두 다시 확인했습니다. 기본 제외 테스트를 전부 실행했다고 주장하지 않으며 실제 오디오 장치용3개는 이번 범위에서 미실행입니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests -- --nocapture`: **성공2개**. 내장 UI/script·자체 fixture 허용 목록/사용자 출력물 제외와 종료 안내 권한을 확인했습니다. 테스트 실행 파일의 기본 아이콘 리소스 경고와 MSVC 라이브러리 생성 경고는 출력됐지만 실패는 없습니다.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공9.89초**. exe24,539,648바이트/21:11:12. 기존 GuitarLab 프로세스0개를 확인한 뒤 빌드했고 강제 종료/기존 창 조작은 없었습니다. 2026-10-17 21:12:03 새PID19936/창 제목GuitarLab/HasExited=false를 확인했습니다. 별도 CMD 창을 여는 실행 래퍼를 사용하지 않았고 입력/모니터/REC/분석은 자동 시작하지 않았습니다.
- 실제 Windows 두 플레이어 표시/잔여 반주 청취·수동 취소: **미실행/사용자 확인 대기**. 자체 sine은 기타 녹음이 아니므로 기타 추정이 거의 무음인 상태를 실패로 안내하지 않습니다. 실제 사용자는 기존 자체 fixture 프로젝트의 카피 화면에서 명시적으로 분리한 뒤 두 플레이어와 잔여 반주만 먼저 확인합니다. 요청 뒤 앱/소스를 유지합니다.

### 미구현·알려진 제약

결과는 메모리 미리보기이며 화면/프로젝트 전환·앱 종료 시 소실됩니다. 영구 AudioStem 저장/재열기·프로젝트 믹서 연결·기타 stem→Basic Pitch 연결은 후속입니다. WAVEX/RF64/압축 입력·Lead/Rhythm 분리·설치 UI·릴리스 Sidecar는 미구현입니다. 최대60초 입력의 시간/메모리·실제 기타 혼합곡의 분리 품질·정량 지연·OS 방화벽 오프라인/60초 긴 작업 취소는 **미실행**입니다. 자동 fixture 성공을 실제 사용자 청취나 일반 곡 품질로 확대하지 않습니다. peak>1은 limiter 없이 보존하므로 청취 시 clipping 가능성이 있습니다.

가중치 연구용 제한과 일반 사용/재배포 허가 미확정은 유지합니다. Git/앱 번들에 가중치/가상환경을 포함하지 않았으며, 자체 연구 검증과 배포 허가를 구분합니다. 앱 메타데이터만으로 기존 기본 환경의 audio-separator가 설치됐다고 표시하지 않습니다.

### 다음 작업 계획

최종 전체/실제 worker 회귀·번들 검사 후 Windows 실행 파일을 적용하고 카피 화면의 두 플레이어/취소를 간단히 사용자 확인합니다. 사용자 검사 중 앱/소스는 유지합니다. 수용 뒤 같은 Phase의 영구 stem 저장·검증된 재열기/믹서·카피 입력 연결을 한 슬라이스씩 진행하고 설치 UI·릴리스 전략을 검증합니다. Phase 7로 건너뛰지 않습니다.

## 전체 기타 분리 후보 검토·다운로드 계획 — 2026-10-17

### 작업 개요

Basic Pitch 적용본과 원래8음 초안의 실제 앱 재실행 복원 수용을 기록한 뒤, 같은 Phase의 전체 기타 분리 의존성을 검토했습니다. 다운로드 계획과 정적 회귀 검사는 완료했으나 모델 가중치의 연구용 제한으로 제품 선정/설치는 보류했습니다. Phase 6 전체는 진행 중이며 완료 날짜는 없습니다.

### 구현 및 변경 파일

- `ai/models/demucs-4.1.0-htdemucs-6s-windows-cp310.json`: 공식 메타데이터에서 수집한31개 CPU wheel과2개 모델 파일의 고정 버전/출처/전체 SHA-256/크기·원본 Requires-Dist를 기록했습니다. 합계707,117,623바이트(674.36MiB), 별도 `.venv-demucs`·여유4GiB 계획입니다. 아직 다운로드/설치하지 않았으므로 verified=false/INSTALLATION_UNVERIFIED입니다.
- `ai/models/requirements-demucs-windows-cp310.lock`·`README.md`: 정확한 wheel 해시와 검증 절차·미설치/미실행·배포 보류를 문서화했습니다. 기존 Basic Pitch lock/설치 환경을 바꾸지 않았습니다.
- `ai/tests/test_separator_model_plan.py`:31개 lock/manifest 일치, CPython3.10/Windows 태그, marker별 의존성 폐쇄·버전 충족, 공식 출처·해시 형식·용량 합계·양자화 의존성 제외·연구용 제한 회귀1개를 추가했습니다. 네트워크나 모델 로드를 사용하지 않는 검사입니다.
- `ai/pyproject.toml`: 이미 분석이 가능한 상태에 맞게 패키지 설명의 ‘모델 분석 미구현’을 수정했습니다. 모델 의존성은 기본 설치에 추가하지 않았습니다.
- `README.md`·`docs/00`·`06`·`08`·`10`·진행 문서: 실제 저장/재실행 수용 결과와 분리 후보/라이선스 결정·다음 작업을 갱신했습니다. 기존 이력은 보존하고 완료 체크를 추가하지 않았습니다. IPC/저장 스키마·기존 제품 실행 파일은 변경하지 않았습니다.

### 테스트 결과와 확인 오류

- `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`: **성공37개/0.74초**. 기존 worker/취소·후처리·Basic Pitch 어댑터와 새 다운로드 계획 검사를 포함합니다. 실제 모델 추론을 실행한 결과가 아닙니다.
- 공식 PyPI/저장소 메타데이터 조회: 성공. 패키지 본문/가중치는 받지 않았습니다. 첫 읽기 전용 조회는 자동 승인 검토의 사용량 한도로 실행되지 않았고, 사용자 재개 요청 뒤 같은 조회가 성공했습니다. 위험 판정 거절이나 앱 실패와 구분합니다.
- sphn0.2.1의 예상v0.2.1 태그는404여서 출시 시점 공식 Cargo.toml 커밋을 조회했습니다. 버전0.2.1과 LICENSE의 Apache-2.0을 확인하고 해당 고정 커밋을 출처로 남겼습니다. exceptiongroup LICENSE의 콘솔 cp949 출력 실패는 메타데이터/문서 손상이 아니며 비ASCII 본문 출력 없이 공식 MIT classifier로 확인했습니다.
- `pnpm verify:app`·확장 Clippy·번들/Windows 빌드 재실행: **미실행**. 이번에는 프론트/Rust 제품 코드를 바꾸지 않았으며 직전184개 프론트/118개 Rust·기본 제외5개·실제 모델 보존/취소1개·번들2개 및 exe 빌드 성공을 유지합니다.
- 새 `ai/models/README.md`·Demucs manifest의 Prettier3.6.2 포맷/검사: **성공**. 기본 pnpm 경로의 Corepack이 pnpm/latest 조회를 시도하다 ENOTFOUND로 실패해 설치된 Node/로컬 Prettier 절대 경로로 실행했습니다. 기존 `.prettierignore`는 ai/docs 전체를 제외하므로 새 두 파일은 `--ignore-path .gitignore`를 명시해 실제로 검사했습니다. 나머지 기존 문서의 Prettier 검사는 제외 상태이며 성공으로 세지 않습니다. 포맷용 옵션만 조정했고 프로젝트 ignore/패키지 버전은 바꾸지 않았습니다.
- Demucs pip 설치·pip check·실제 분리/음질·CPU 시간/메모리·취소·오프라인 검사: **미실행**. 새 모델 다운로드 요청 동의 전이며 기존 Basic Pitch 설치 승인은 이 모델에 적용하지 않습니다.

### 알려진 제약과 선정 결과

audio-separator0.30.2의 Windows 필수 diffq-fixed0.2.4는 CC-BY-NC-4.0이라 이 조합을 제외했습니다. 공식 Demucs4.1.0 추론 전용은 양자화/학습 extra 없이 별도 후보로 계획했습니다. 그러나 저자는 가중치가 MIT 대상이 아니며 연구 용도로 제공된다고 안내했습니다. 새 safetensors 배포의 별도 상용 허가도 확인하지 못했으므로 **제품 채택·상용 재배포는 보류**합니다. 사용자가 동의해 자체 fixture 연구 검증을 하더라도 배포 허가로 해석하지 않습니다. lameenc LGPL-3.0-or-later와 바이너리 내부 라이브러리 고지도 출시 전 검토가 필요합니다.

메타데이터 기반 의존성 해석이 실제 설치/호환성 성공을 보장하지 않습니다. safetensors 전체 해시는 공식 파일 메타데이터의 값이며 로컬 다운로드 대조는 아직 하지 않았습니다. guitar는 전체 기타이며 Lead/Rhythm 지원을 의미하지 않습니다. 분리 어댑터·파생 stem 저장/미리듣기·설치 UI·릴리스 Sidecar·실제 기타 정량 품질은 미구현/미검증입니다.

### 다음 작업 계획

1. 연구용 모델 검증을 진행할지, 제품 허가가 명확한 다른 모델을 먼저 찾을지 사용자 결정을 받습니다. 다운로드 승인 요청 시 약675MiB/여유4GiB·별도 환경·자체 음원만 사용한다는 범위를 함께 알립니다.
2. 연구 검증 승인 시 고정 목록의 크기/SHA 확인→별도 환경 설치/pip check→허용 클래스만 로드해 자체 fixture CPU 분리를 검사합니다. 기존 Python 환경과 원본/테이크는 유지합니다.
3. 결과를 확인한 다음에만 docs/12의 stem 계약과 어댑터/취소/영구 저장·미리듣기를 순차 구현합니다. 상용 모델 허가가 해결되지 않으면 이를 기록하고 모델 중립 코드로 진행 가능한 범위를 검토합니다. Phase 7로 건너뛰지 않습니다.

## 실제 앱 재실행 복원 완료 — 2026-10-17

사용자가 새PID7996 앱에서 같은 프로젝트의 첫2번 줄/5프렛과 ‘저장된 AI 초안 불러오기’의8음 표가 유지됨을 확인했습니다. 실제 분석→검토/적용→Undo/Redo→프로젝트 저장/재열기→정상 앱 종료/재실행→적용본 및 별도 AI 초안 복원까지 이번 슬라이스 수용을 마쳤습니다. Basic Pitch 기본6줄 단성 경로에 한하며 전체 Phase 6 완료가 아닙니다.

이번 턴에는 제품 기능 변경/새 빌드 없이 문서/로드맵을 갱신했습니다. 자동 검사 재실행은 미실행(제품 코드 변경 없음)이며 직전184개 프론트/118개 Rust·실제 모델 보존/취소1개·번들2개 성공을 유지합니다. 추가 실행 상태 조회 한 번은 자동 승인 검토 시간 초과로 실행되지 않았고, 같은 읽기 전용 조회를 한 번 재시도해 PID7996/14:00:37/창 제목GuitarLab/동일 exe 경로를 확인했습니다. 이는 앱 오류/데이터 실패와 구분합니다.

다음 작업은 선택적 모델 설치와 전체 기타 stem 분리의 모델/런타임 선정입니다. 기존 Basic Pitch 설치 승인에 다른 모델 다운로드를 포함하지 않으며 현재는 공식 메타데이터/라이선스만 조회합니다. 현재 앱/프로젝트/테이크와 설치된 두 Python 환경은 유지합니다. 새로운 모델·stem 분리·Sidecar·실제 기타 품질은 아직 미구현/미검증입니다.

## 실제 프로젝트 저장/재열기·원래 초안 복원 수용 — 2026-10-17

사용자가 ‘프로젝트 저장→프로젝트 다시 열기’의 첫2번 줄/5프렛 유지와 ‘저장된 AI 초안 불러오기’의8음 표 복원에 ‘보임, 잘 됨’으로 답했습니다. 새 모델 분석 없이 저장된 분석을 다시 표시하는 실제 경로와 적용본의 새 리비전 저장/재열기를 확인했습니다.

저장 확인 후 기존PID21332를 CloseMainWindow로 정상 종료하고 같은 실행 파일을 빌드 없이 재실행했습니다. 종료 차단 시 중단하는 절차를 유지했고 강제 종료하지 않았습니다. 새PID7996/2026-10-17 14:00:37 실행. 남은 검사는 새 앱에서 같은 프로젝트의 적용본/원래8음 초안이 계속 복원되는지입니다. 실제 앱 재실행 후 복원 수용은 아직 미실행/사용자 확인 대기입니다. 제품 소스/실행 파일 변경과 테스트 재실행은 없으며 직전 자동 검증 결과를 유지합니다.

## 실제 초안 적용·Undo/Redo 수용 — 2026-10-17

사용자가 새 앱의 자체 프로젝트에서 AI 카피→검토 체크→선택 트랙 적용, 첫 권장 운지2번 줄/5프렛과 되돌리기·다시 실행 확인 요청에 ‘잘 됨’으로 답했습니다. 실제 분석 표 확인에 이어 현재 악보 적용/기존 편집 history 연결을 확인했습니다. docs/08의 Basic Pitch→정량화→운지→초안 항목만 완료 표시했으며 전체 Phase 6 완료로 확대하지 않습니다.

다음은 현재 적용본의 ‘프로젝트 저장→프로젝트 다시 열기’에서2번 줄/5프렛 유지와 ‘저장된 AI 초안 불러오기’의8음 복원입니다. 실제 저장/재열기·원래 초안 복원과 앱 재실행 복원은 아직 미실행/사용자 확인 대기입니다. 현재PID21332와 원본 소스는 유지하고 새 빌드·재실행을 하지 않았습니다. 이번에는 진행 문서/로드맵만 수정했으므로 타입/빌드/테스트 재실행은 미실행이며 직전184개 프론트/118개 Rust·실제 모델 보존/취소1개·번들2개 성공을 유지합니다. stem 분리·설치 UI·Sidecar·실제 기타 품질은 여전히 미구현/미검증입니다.

## 보존/적용 후보 Windows 적용 — 2026-10-17 13:55

- 최신 `bundle_tests`: 성공2개. 내장 UI/script·허용 자체 자료·개인 출력물 제외와 종료 안내 권한을 유지했습니다. 안내 한 문장 수정 뒤 관련 UI2개/타입/production build도 성공했고 새 main약1,430.97kB입니다.
- 이전PID30008/정확한 실행 경로를 확인하고 완료된 분석 미리보기 창을 CloseMainWindow로 정상 종료했습니다. 사전에 새 저장 기능 이전의 메모리 초안은 같은 자체 음원을 한 번 다시 분석해야 보존됨을 안내했습니다. 강제 종료·개인 파일 열람/분석 없음.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: 성공28.25초. exe24,349,184바이트/13:55:30, 새PID21332/13:55:50 실행. 창 제목/실행 유지와 실제 사용자 UI 수용은 후속 기록에서 구분합니다.
- 새 UI 수용은 **미실행/확인 대기**입니다. 첫 단계는 기존 자체 fixture 프로젝트→카피→AI 카피→검토 체크→선택 트랙 적용, 첫 권장2번 줄/5프렛과 Undo/Redo만 확인합니다. 이어 프로젝트 저장/다시 열기 및 ‘저장된 AI 초안 불러오기’와 실제 재실행 복원을 진행합니다. 사용자 확인 동안 파일/앱을 유지합니다.

## 초안 보존·복원·명시적 적용 후보 — 2026-10-17

### 작업 개요

실제8음 분석 표 수용 후 같은 Phase의 다음 슬라이스를 구현했습니다. 목표는 실제 분석 원문/문맥을 기존 악보와 분리해 보존하고, 사용자가 검토 체크한 지원 단성 초안만 기존 편집기로 적용하는 것입니다. 후보 구현/자동 검증은 완료했고 새 Windows 수용은 아직 미실행/적용 대기입니다. Phase 6 전체는 진행 중이며 완료 날짜는 없습니다. 아래 이전 ‘영구 초안/적용 미구현’ 설명은 당시 이력입니다.

### 구현·수정 파일 및 이유

- 신규 `src-tauri/src/storage/migrations/004-ai-drafts.sql`·`ai/drafts.rs`: 불변 분석 행/프로젝트 자산 복합 FK·문맥/결과 SHA-256·최신 문맥 인덱스를 추가했습니다. 모델 실행 여부와 독립적인 복원을 제공하고 원본/다른 설정의 결과와 혼동하지 않게 합니다. 프로젝트100개/결과2MiB/문맥64KiB, 중복ID/다른 자산·손상·취소·저장 실패를 명시적으로 거부합니다. 저장된 초안을 자동 삭제/덮어쓰지 않습니다.
- `storage/database.rs`: 기존001~003을 수정하지 않고004를 원자 적용해 user_version4로 올립니다. 기존 v1/v2/v3 자료 보존과 미래v5 거부를 검사했습니다. 이전v3 실행 파일을 새DB의 복원 도구로 쓰지 않습니다.
- `ai/transcription.rs`·`ai/mod.rs`: 실제 검증된 모델 결과를 공개 성공 전에 native 내부에서만 보존합니다. JS가 임의 음표를 AI 결과로 저장하는 명령은 없습니다. 실제 모델 통합 검사에 SQL 보존·재읽기를 추가했습니다.
- `commands/ai_api.rs`·`app.rs`: 버전 있는 TranscribeRequest와 기존 StorageJob으로 restore_transcription_draft를 등록했습니다. 동일 프로젝트/asset·튜닝·앵커/grid가 일치하는 최신 결과 또는 null만 반환하며 새 추론/다운로드·오디오 읽기를 하지 않습니다.
- `src/features/transcription/transcription.ts`·`useTranscription.ts`·`AiDraftPanel.tsx`: 복원 응답 검증·조회/빈 결과·오류/취소·늦은 응답 방어를 연결했습니다. 실제 분석/복원 결과를 ‘로컬 초안 보존됨’으로 표시합니다. 검토 체크 전에는 적용하지 않고 미지원 렌더는 적용 버튼도 비활성입니다. 트랙 이름/역할을 바꾸지 않도록 미리보기 사본의 불필요한 이름 변경을 제거했습니다.
- `src/features/score/useScoreEditing.ts`·`ScoreWorkspace.tsx`: 새 문서 교체 명령은 기존 렌더 검증/일시정지·epoch·history를 재사용합니다. 적용 성공 후 편집이 열리고 Undo/Redo가 동작하며 다른 트랙/원본 바이트·저장 리비전은 유지됩니다. 프로젝트 저장은 기존 새 불변 revision 경로입니다. 적용 실패/녹음 잠금이면 현재 문서와 history를 바꾸지 않습니다.
- `AiRuntimePanel.tsx`: 초안 적용 미구현이라는 오래된 안내를 제거했습니다. 기본 검사 환경과 별도 모델 환경의 구분은 유지합니다.
- `storage/projects_tests.rs`·`recordings_tests.rs`·`mixer/tests.rs`: 예상 최신 migration 버전과 정상 v2 fixture의 테이블 배치를 갱신했습니다. AI source=ai 편집본의 새 revision 재열기와 원본/이전 revision 불변을 기존 저장 검사에 보강했습니다.
- `transcription.test.ts`·`AiDraftPanel.test.tsx`·`useScoreEditing.test.tsx`: 모델 호출 없는 초안 복원/빈·손상 envelope, 검토 전 적용 금지·실제 editor 적용/Undo/Redo, 다른 트랙/이전 리비전/원본 유지·미지원 거부·잠금 회귀를 추가했습니다.
- `README.md`·`docs/06`·`07`·`12`·`13`·진행 문서를 갱신했습니다. docs/12의 새 저장/적용 계약은 구현 전에 작성했으며 ScoreDocument v1/Python JSONL v1과 기존 파일 포맷은 변경하지 않았습니다.

### 실행한 검증과 오류 해결

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib`: 성공118개/기본 제외5개. 새 초안 검사3개는 모델 없는 재열기/문맥 차이·최신 선택/이전 행 유지, 취소/다른 프로젝트·위조 입력 SHA·손상·DB 실패 주입, v3→v4/자산 보존·100개 한도를 검증합니다. 기존 녹음·믹스·프로젝트 전체 회귀도 통과했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai::transcription::tests::real_model_eight_synthetic_notes_keep_original_and_cleanup_job -- --ignored --nocapture`: 성공1개/6.10초. 자체4초8음의 실제 모델 분석→검증→SQLite 보존/재읽기, 원본/작업 정리와 실제 실행 중 취소를 검사했습니다. 사용자 오디오/녹음은 사용하지 않았습니다.
- `pnpm exec vitest run src/features/score/useScoreEditing.test.tsx src/features/transcription`: 성공15개/5파일. 최초 다중 트랙 테스트는 원본 alphaTab에 없는 트랙을 import 문서에만 추가해 안전 거부됐습니다. 제품 검증을 완화하지 않고 테스트 사본을 올바른 NORMALIZED 두 트랙 문서로 변경했고 같은 검사를 통과했습니다. 실제 alphaTab 미리보기와 원본 유지 검사도 유지합니다.
- `pnpm verify:app`: 성공. 타입/ESLint·184개 프론트/54파일·production build(main약1,430.98kB)·Prettier·cargo fmt/표준 Clippy·118개 Rust/기본 제외5개·binary/doc-tests. 실제 Python·장치가 필요한 기본 제외와 자동 단위 검사 수를 구분합니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: 성공. 이후 안내 한 문장 수정만 있었으며 최신 프론트/번들 검사는 적용 기록에서 갱신합니다.
- Python 단위 재실행: **미실행**, 이번 슬라이스는 Python 소스를 변경하지 않았습니다. 직전36개 성공을 유지하며 위 실제 native 모델 통합 검사는 다시 실행했습니다. 새 장치/USB·녹음·외부 WAV 청취: **미실행**, 이번 범위는 저장/악보 적용이고 입력/PCM 경로를 변경하지 않았습니다.
- 실제 Windows 적용·모델 재실행 없는 초안 복원·사용자 프로젝트 저장/재열기: **미실행/다음 수용 검사**. 자동 검사 성공을 실제 앱 수용으로 대신 기록하지 않습니다.

### 미구현·제약과 다음 작업

현재는 같은 문맥의 최신 초안 한 개만 UI로 읽습니다. 이전 초안 선택/삭제·승인/검토 이력·적용 revision과 초안 UUID 영구 연결·직접 초안 운지 선택/화음 렌더/고급 주법 편집은 후속입니다. 원래 분석은 AI_DRAFT로 보존하고 적용본의 음표 source=ai는 정확성 보증이 아닙니다. 적용본을 이후 수동 수정하면 기존 규칙대로 manual이 될 수 있으며 원래 activation/검토 사유는 보존된 초안에서 확인합니다.

전체 기타/accompaniment stem 분리·선택 설치 UI·release Sidecar와 실제 기타 정량 품질은 아직 미구현/미검증입니다. 다음은 자체 fixture로 적용→Undo/Redo→프로젝트 저장/재열기와 별도 초안 복원을 실제 Windows에서 확인한 뒤 같은 Phase의 남은 기능을 진행합니다. 새 모델 다운로드는 이번 승인 범위를 넘겨 자동 실행하지 않습니다.

## 실제 분석 표 수용·다음 슬라이스 착수 — 2026-10-17

사용자가 새 앱에서8개의 실제 분석 표를 제공했습니다. MIDI64/67/69/71 반복과 onset11.6/487.6/998.5/1497.7/1998.2/2485.8/2996.7/3507.5ms·활성도0.612~0.660·운지/검토 사유가 native 실제 fixture와 일치합니다. 표/실제 분석 경로는 확인했고 TAB 시각 자체는 명시적 답변이 없어 별도로 미확인입니다. 다음은004 초안 보존/같은 문맥 복원과 명시적 선택 트랙 적용·기존 Undo/Redo/새 프로젝트 리비전 연결입니다. 완료된 분석을 반복 구현하지 않고 기존 앱은 다음 검증된 후보 전까지 유지합니다.

## 1. 작업 개요

- 시작일: 2026-10-17. 완료 날짜: 미완료. 상태: 진행 중.
- Phase 5의 실제 사용자 수용/최종 회귀/한국어 완료 문서와 로드맵을 검토한 뒤 착수했습니다.
- 첫 슬라이스는 Python dev worker와 Rust JSONL 경계, 취소/timeout/프로세스 회수, 설정 화면의 미설치/미검증 상태 확인입니다. 모델을 실행하거나 사용자 음원을 읽는 기능은 아직 없습니다.

## 2. 구현 및 변경 사항

- docs/12에 `inspect_ai_runtime` 및 inspect-only JSONL v1 계약/제한을 구현 전에 추가했습니다. TS/Rust/Python 버전은1이고 DB/기존 프로젝트/테이크를 변경하지 않습니다.
- 신규 `ai/guitarlab_ai/runtime.py`·`worker.py`: importlib.metadata로 두 패키지 설치 정보만 확인합니다. 64KiB 줄 상한/UTF-8·UUID·알 수 없는 필드·중복 JSON 키·비정상 수치 검증, 한 작업/취소/부모 stdin 종료·진단 원문 마스킹을 구현했습니다. stdout은 JSONL 전용입니다.
- 신규 `src-tauri/src/ai/mod.rs`: 저장소의 프로젝트 가상환경만 사용하며 임의 실행 경로/인자는 받지 않습니다. debug 개발 환경 전용,10초 제한·취소 요청 후1초 제한·kill/wait·stdout reader 회수,16메시지/256KiB 출력 상한과 버전/ID/진행 순서/완료 중복/미검증 모델 상태 검증을 제공합니다. Windows 자식 콘솔을 생성하지 않습니다. stderr 원문은 수집/전송하지 않습니다.
- 신규 `commands/ai_api.rs`와 등록 `commands/mod.rs`·`app.rs`·`lib.rs`: 버전 있는 제한된 환경 확인 명령, 기존 StorageJob의 조회/취소/중복 작업 방지, 녹음 중 거부. 사용자 오디오/경로를 IPC로 받지 않습니다.
- 신규 `src/features/transcription/runtime.ts`·`useAiRuntime.ts`·`AiRuntimePanel.tsx`: UI와 API/검증/비동기 상태를 분리하고 설정 화면 버튼에서만 실행합니다. 미설치와 ‘패키지는 있으나 가중치/호환성 미검증’을 구분하며 항상 분석 사용 불가로 표시합니다. 취소/늦은 응답/화면 이탈·오류/재시도를 처리하고 기존 공통 panel/토큰을 사용합니다.
- `SettingsPage.tsx`에서 이미 구현한 SQLite 저장을 미구현이라고 표시하던 오래된 안내를 제거하고 실제 환경 확인 패널로 교체했습니다. 새 라이브러리·모델/가중치·lockfile 변경은 없습니다.

## 3. 테스트 결과

- `ai/.venv/Scripts/python.exe -m pytest ai/tests -q --tb=short`: **성공17개**. 잘못된 JSON/버전/UUID/키·과대/잘린 줄·미지원 action, 메타데이터 상태/취소·오류 마스킹·실제 worker JSONL/부모 종료를 검사했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai::tests`: **성공1개·개발 환경 검사1개 기본 제외**.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai::tests::actual_dev_worker_and_failure_timeout_cancel_are_bounded -- --ignored --nocapture`: **성공1개**. 실제 프로젝트 Python3.10.8 worker, 미설치 상태, 과대/손상 stdout·비정상 종료·500ms 테스트 timeout·실행 중 취소/회수를 검사했습니다. 이 검사는 Python 가상환경 없는 환경에서 기본 제외되며 이번에는 별도로 실행했습니다.
- 새 프론트 어댑터/설정 UI4개: **성공**. 임의 경로 없이 제한 명령 요청, 위조 사용 가능/누락/중복 모델 거부, 버튼 전 미호출·취소/늦은 완료/재시도·timeout/화면 이탈을 검사했습니다.
- 발생 오류: 큰 입력을 pytest 기본 매개변수 ID로 사용해 Windows 테스트 설정에서 오류2개가 발생했습니다. 입력을 줄이지 않고 ID만 짧게 지정해17개를 재통과했습니다. TS 응답의 packageVersion이 unknown으로 남던 타입 오류는 별도 명시적 문자열/null 검증으로 해결했습니다.
- 전체 `pnpm verify:app`: **성공**. TypeScript·ESLint·프론트175개/52파일·production build(main1,421.13kB)·Prettier·cargo fmt/표준 Clippy·Rust114개/기본 제외4개·binary/doc-tests. 기본 제외는 기존 장치2개/독립 WAV1개와 개발 Python1개이며 Python 검사는 위 별도 명령으로 성공했습니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: **성공**. 최신 custom-protocol `bundle_tests`: **성공2개**, 사용자 출력물 제외 포함.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: **성공**. 앱 프로세스 없음 확인 후 빌드했고 exe23,951,872바이트/2026-10-17 13:06:06, 새PID12908/13:07:05/창 제목GuitarLab 실행을 확인했습니다. 입력/모니터/녹음 자동 시작 없음. 실제 설정 UI 환경 확인은 **미실행/사용자 확인 대기**입니다.

## 4. 미구현 및 알려진 문제

- 실제 transcribe/separate, 모델 설치/다운로드/선택, 가중치 manifest/해시 검사, 원본→stem/음표 분석, 모델 결과와 정량화/운지의 연결·AI_DRAFT 검토/승인/저장은 미구현입니다. 아래 순수 후처리 구현을 실제 음원 분석 완료로 표시하지 않습니다.
- 릴리스 Sidecar/설치 패키징·다른 PC·Python3.11/3.12 호환성은 미검증입니다. release는 AI_RUNTIME_UNAVAILABLE로 실패하며 현재 개발 가상환경을 배포 기능처럼 사용하지 않습니다.
- 설치 메타데이터 존재가 모델 무결성/분리 품질/라이선스 확인을 뜻하지 않습니다. 패키지가 있어도 UNVERIFIED/usable=false로 반환하고 모델을 import하지 않습니다.
- 실제 사용자 오디오 분석,1분 기타 평가/F1/onset 분포·stem 청취/성능/용량 측정은 **미실행**입니다. 원본/개인 녹음/출력 파일을 읽거나 네트워크로 보내지 않았습니다.

## 5. 다음 작업 계획

1. 전체 회귀·번들/Windows 후보 적용을 마치고 설정의 실제 Python 연결/미설치 표시를 확인합니다.
2. 수동 시간 앵커 기반 정량화와 운지 후보의 순수 도메인을 자체 입력으로 검증합니다. fixture 결과를 실제 음원 분석으로 노출하지 않습니다.
3. 모델/런타임/가중치 출처·고정 버전/해시·용량/라이선스 확인 후 선택적 설치와 실제 adapter를 구현합니다. 설치/다운로드는 사용자가 명시적으로 요청할 때만 합니다.

## 공식 자료 확인 — 2026-10-17

- [Spotify Basic Pitch](https://github.com/spotify/basic-pitch)와 [공식 pyproject](https://github.com/spotify/basic-pitch/blob/main/pyproject.toml)에서0.4.0 코드·Windows/Python3.8~3.11 표기와 Python3.11 미만 Windows의 ONNX 조건을 확인했습니다. 코드 Apache-2.0은 [공식 라이선스](https://github.com/spotify/basic-pitch/blob/main/LICENSE)를 참조하며 개별 가중치/전이 의존성 배포 허가는 아직 선정하지 않았습니다.
- [audio-separator 공식 프로젝트](https://github.com/nomadkaraoke/python-audio-separator)를 후보 자료로 확인했으며 버전/가중치를 설치 대상으로 확정하지 않았습니다. 전체 기타와 Lead/Rhythm 분리는 독립 요구로 유지합니다.
- 현재 설치된 Python은3.10.8·pytest8.3.5이고 두 AI 패키지는 미설치입니다. 새 외부 패키지는 사용하지 않았으며 모델별 실제 호환/품질 검증은 후속입니다.

## 정량화·운지 후보 순수 후처리 — 2026-10-17

실제 설정 확인: 사용자가 환경 설정의 Python3.10.8 worker 연결·두 패키지 미설치/분석 사용 불가 표시에 ‘뜸’으로 답했습니다. 실제 Tauri 명령→Python 연결/상태 표시까지 확인했으며 실제 모델 추론 성공으로 확대하지 않습니다. 앱PID12908을 재실행하지 않고 모델 설치 사전 검토를 이어갑니다.

- docs/12에 입력 시각·신뢰도·수동 앵커·지원 grid/범위·검토 결과 계약을 먼저 추가했습니다. 새 `ai/guitarlab_ai/transcription/draft.py`는 불변 DetectedNote와 사용자 시각 앵커로 ms→tick 구간별 매핑을 수행합니다. 고정 BPM을 추정하지 않고 원래 onset/offset/pitch/confidence를 유지하며 정량화한 시작/길이와 검토 사유를 반환합니다.
- 새 `ai/guitarlab_ai/fingering/__init__.py`는 튜닝/프렛 내 모든 후보와 단성 연속 구간의 이동 비용 기반 권장 후보를 계산합니다. 음정을 옥타브 이동하거나 버리지 않습니다. 여러 운지는 모호성, 저신뢰·양자화 이동·시간 중첩/화음·음역 밖은 검토 사유이며 화음/범위 밖에는 운지를 자동 확정하지 않습니다. 최대2,000음/10분·grid60/120/240/480/960·튜닝6줄/최대36프렛 및 취소를 검사합니다.
- 새 `ai/tests/test_draft.py`12개를 포함한 `ai/.venv/Scripts/python.exe -m pytest ai/tests -q --tb=short`: **성공29개**. 자체4초 관측 음표8개/입력 불변·결정성·템포 변화/인트로500ms·다성/정량화 중첩·저신뢰/음역 밖 보류·Drop D/운지 후보 피치 보존·잘못된 수치/앵커/grid/길이·취소를 검증했습니다. 음원에서 해당 음표를 검출한 검사가 아니며 fixture 결과를 실제 분석처럼 UI에 노출하지 않습니다.
- 이 후처리는 아직 모델 adapter/worker 분석 action·ScoreDocument 저장/검토 UI에 연결하지 않았습니다. 실제 음악의 정확도/자동 템포/복잡한 주법 편집 지원을 달성했다고 주장하지 않습니다. 새 Python 순수 함수만 추가했으므로 이후 프론트/Rust 재검사는 **미실행**이며 직전 전체 성공 결과를 유지합니다.
- 다음은 설정의 실제 dev worker 연결/미설치 표시 확인과 모델 배포 manifest/선택적 설치·실제 분석 adapter 구현입니다. 앱 응답을 기다리는 동안 앱을 종료하거나 재실행하지 않습니다.

## Basic Pitch 선택 설치 사전 검증 — 2026-10-17

- 실제 설정 확인은 사용자 ‘뜸’으로 완료됐습니다. 앱을 종료/재실행하지 않고 다음 모델 설치 계획을 준비했습니다.
- 새 `ai/models/basic-pitch-0.4.0-windows-cp310.json`과 `requirements-basic-pitch-windows-cp310.lock`: Basic Pitch0.4.0·ONNX Runtime1.23.2·NumPy1.26.4 등 Windows x64/Python3.10용41개 wheel의 정확한 버전·파일 URL·SHA-256·크기·라이선스/공식 메타데이터 출처를 기록했습니다. 설치 상태는 INSTALLATION_UNVERIFIED입니다.
- Basic Pitch 본체를 제외한40개 고정 런타임 의존성에 `pip install --dry-run --ignore-installed --only-binary=:all: --report ...`를 실행했습니다. **성공**, 실제 설치/소스 빌드 스크립트 실행 없이 resolver 호환 계획을 얻었습니다. pip 버전에 따라 일반 라이브러리 wheel이 로컬 캐시에 다운로드됐습니다. Basic Pitch 본체/모델 파일은 이 명령에 포함하지 않았고 아직 다운로드하지 않았습니다.
- 공식 PyPI 특정 버전 JSON과 resolver URL/해시를 대조했습니다.41개 배포 파일 합계144,366,287바이트(137.68MiB), 본체758,279바이트. 설치 후 디스크 사용량은 **미측정**이며 설치 전 최소1GiB 여유를 확인하는 계획입니다. 현재 A드라이브 여유는 약240GiB이고 별도 ai/.venv-basic-pitch 경로는 존재하지 않습니다. 현재 ai/.venv는 변경하지 않습니다.
- 최신 ONNX Runtime1.31.0은 Python>=3.11이어서 현재3.10 환경에 그대로 선정하지 않고1.23.2의 cp310 wheel을 확인했습니다. 일부 공식 최신 릴리스 전체 메타데이터는2MB 상한에서 잘려 JSON 오류가 났습니다. 무제한 읽기로 우회하지 않고 특정 버전 endpoint/4MB 상한으로 조회 범위를 좁혔습니다. 구버전 pip 보고서의 archive_info.hash 형식도 명시적으로 처리해 계획을 생성했습니다.
- 라이선스는 공식 metadata/Spotify LICENSE를 확인했습니다. soxr는LGPL-2.1-or-later, certifi는MPL-2.0이고 수치 라이브러리의 동봉 바이너리 고지도 출시 검토에 포함해야 합니다. 이번 계획은 로컬 개발 검증용이며 상용 배포/가중치 재배포 고지 완료를 뜻하지 않습니다. Basic Pitch 모델 파일은 승인 후 고정 wheel 무결성과 내부 모델 RECORD/내용 해시를 확인한 뒤에만 로드합니다.
- 새 `ai/tests/test_model_plan.py`: manifest/잠금 일치·41개 버전/해시·wheel tag와 cp310 호환·공식 HTTPS 호스트·용량 합계·라이선스 항목 검사를 추가했습니다. `ai/.venv/Scripts/python.exe -m pytest ai/tests -q --tb=short`: **성공30개**.
- 다음 실제 작업은 별도 ai/.venv-basic-pitch를 생성하고 고정 잠금 파일을 `--require-hashes --only-binary=:all:`로 설치하는 것입니다. docs/10의 사용자 요청 시 모델 다운로드 규칙에 따라 명시적 동의를 요청합니다. 응답 전 모델 다운로드/설치·실제 추론을 실행하지 않습니다. 이후 자체 합법 fixture 추론→초안/검토 연결을 검증하며 사용자 음원을 자동 사용하지 않습니다.

## 승인된 모델 설치·실제 WAV 초안 후보 — 2026-10-17

### 작업 개요와 진행 상태

사용자가 ‘다운로드·설치하고 검증 진행’으로 Basic Pitch0.4.0과 고정 의존성의 별도 개발 설치를 승인했습니다. 위 설치 대기/추론 미구현 문장은 이전 이력입니다. 이번 슬라이스는 실제 모델→정량화/운지→분리된 AI_DRAFT 미리보기까지이며 현재 악보 적용/영구 저장은 다음 작업입니다. Phase 6 전체 완료 날짜는 아직 없고 진행 중입니다.

### 구현 및 주요 변경 파일

- `.gitignore`: 새 `ai/.venv-basic-pitch` 바이너리 환경을 저장소에서 제외했습니다. `eslint.config.js`·`vite.config.ts`: Python 가상환경 내부 타사 JS/테스트를 프론트 소스로 검사하지 않도록 제외했습니다. 실제 앱 소스 검사는 유지합니다.
- `ai/models/basic-pitch-0.4.0-windows-cp310.json`: 고정 Basic Pitch wheel758,279바이트/SHA-256 `738adb503aae7fdfc7d1e1511aa0ce35052315f260a19531ef4c356708425db0`를 먼저 확인한 뒤 내부 ONNX 모델230,444바이트/SHA-256 `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`를 modelFiles에 기록했습니다. 설치 파일의 변경 가능한 RECORD만 신뢰하지 않습니다. manifest 상태는 배포 계획이며 이 PC 설치 결과와 구분합니다.
- `ai/guitarlab_ai/model_integrity.py`: Python 버전/41개 패키지 버전/허용된 모델 경로·크기/내용 해시를 로드 전에 확인하고 미설치·불일치·손상을 구분합니다.
- `transcription/basic_pitch.py`·`job.py`:60초/64MiB 이하 PCM16·float32 mono/stereo WAV를 검증하고 ONNX CPU로 실제 note events를 추출합니다. telemetry 비활성, 타사 출력 폐기, 취소 확인, 원래 ms/pitch/활성도 보존 및 모델 결과 검증을 수행합니다. 새 작업 폴더의 notes.json만 작성하며 원본에는 쓰지 않습니다. MP3·URL·분리 모델·예측을 실제 정답으로 위장하는 경로는 없습니다.
- `ipc/control.py`·`worker.py`: action transcribe 계약과 엄격한 앵커/튜닝/grid 입력, 단계 진행/고정 오류·취소를 추가했습니다. 추론은 메인 스레드, 취소 입력은 Windows PeekNamedPipe로 데이터가 있을 때만 읽습니다. 잘린 제어 메시지는 다음 조각을 기다리고 최대 줄 길이를 제한합니다.
- `src-tauri/src/ai/mod.rs`·신규 `ai/transcription.rs`: 기존 bounded worker 실행을 재사용하고 별도 고정 가상환경/180초 분석 한도/취소 후1초 종료를 연결했습니다. 같은 프로젝트의 ORIGINAL asset만 해시 검증 후 작업 사본으로 복사하고 결과 경로/2MiB 상한/음정·운지·시간/grid/검토 사유를 재검증합니다. 성공·실패·취소 후 자신이 만든 두 임시 파일과 빈 작업 폴더만 정리합니다. 기존 SQLite/revision/테이크에는 쓰지 않습니다.
- `src-tauri/src/commands/ai_api.rs`·`app.rs`: `transcribe_project_audio`를 등록하고 녹음 중 거부/StorageJob 조회·취소·중복 방지를 적용했습니다. JS에서 임의 경로나 실행 인자를 받지 않습니다.
- 신규 `src/features/transcription/transcription.ts`·`useTranscription.ts`·`AiDraftPanel.tsx`, `score/ScoreWorkspace.tsx`: 엄격한 응답 디코더/서비스·범위별 비동기 상태·최소 UI를 분리했습니다. 명시적 클릭 시만 분석하고 자산/악보/트랙 변경 및 화면 이탈 시 취소·늦은 결과 폐기를 수행합니다. 원래 관측 음표·활성도/검토 사유와 실제 alphaTab 별도 TAB를 표시합니다. 미지원 화음/음가는 원본 대신 표/이유로 남깁니다. 현재 악보/채점 대상은 바꾸지 않습니다.
- `AiRuntimePanel.tsx`: 기본 테스트 worker의 설치 목록과 별도 카피 모델 환경이 다름을 설명합니다. 기본 환경의 PACKAGE_MISSING 표시는 새 분석 환경의 설치 실패를 의미하지 않습니다.
- 신규 검사 `ai/tests/test_basic_pitch_adapter.py`·`test_transcription_job.py`·`test_control.py`, `src/features/transcription/transcription.test.ts`·`AiDraftPanel.test.tsx`, 테스트 전용 `src/test/transcriptionFixture.ts` 및 Rust 통합 검사를 추가했습니다. 테스트 가짜 결과는 테스트 파일에서만 사용합니다.
- `docs/12`에 명령/모델 로드/초안 미리보기 계약을 구현 전에 추가했고 `README.md`·`docs/06`·`docs/13`·진행 문서에 현재 지원/미완료 범위를 갱신했습니다. 기존 문서 이력은 보존합니다.

### 설치 및 테스트 결과

1. `ai/.venv/Scripts/python.exe -m venv ai/.venv-basic-pitch`: 성공. 기존 경로가 없고 여유1GiB 이상임을 확인한 후 생성했으며 기존 테스트 환경은 유지했습니다.
2. `ai/.venv-basic-pitch/Scripts/python.exe -I -m pip --isolated install --index-url https://pypi.org/simple --disable-pip-version-check --no-input --require-hashes --only-binary=:all: --no-deps --report src-tauri/target/basic-pitch-installed.json -r ai/models/requirements-basic-pitch-windows-cp310.lock`: 성공41개. 소스 설치 스크립트 없이 고정 wheel만 설치했습니다. 다운로드 계획137.68MiB, 실제 설치 후 파일 길이 합계533,834,435바이트/14,086파일(약509.1MiB, 파일시스템 할당량과 다름)입니다.
3. `ai/.venv-basic-pitch/Scripts/python.exe -I -m pip --isolated check`: 성공, No broken requirements found. Basic Pitch0.4.0/NumPy1.26.4/ONNX Runtime1.23.2/Python3.10.8 조합입니다.
4. 단독 실제 adapter probe: 성공. 자체 `sine.wav`4초/48kHz/8음에서 MIDI `[64,67,69,71,64,67,69,71]`를 검출했습니다. 첫 실행23.578초, 원본 SHA-256 `7d519e32205014966c602feab05b5cae21e57ef66c60576781880013f2e8d386` 불변. 테스트 프로세스에서 socket.connect를 거부해 추가 연결 없이 실행했으나 OS 수준 완전 오프라인 검증과 구분합니다. 원래 onset/offset/activation을 보존한 probe는 무시되는 target에만 생성했습니다.
5. `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib ai:: -- --ignored --nocapture`: 성공2개. 실제 native→worker→모델→정량화/운지→엄격한 결과 검증/반환·원본 보존/임시 정리 및 실제 실행 중 취소/5초 이내 반환을 확인했습니다. 별도 dev worker의 오류/과대 stdout/부모 종료/시간 초과/취소 회귀도 포함합니다. 최종 합계6.41초, 단일 실제 성공 재검사는5.38초였습니다. 이는 fixture 검증이며 실제 기타 품질 측정이 아닙니다.
6. `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`: 성공36개. 모델 손상/경로·버전 경계, 이벤트 디코드, 초기 취소, 작업 결과 보존·충돌, 분할 취소 파이프·정리와 기존 정량화/운지/JSONL 회귀를 포함합니다. 모델 추론은 기본 Python 단위 검사와 위 별도 native 실제 검사로 구분합니다.
7. `pnpm verify:app`: 최종 성공. 타입/ESLint·프론트181개/54파일·production build·Prettier·cargo fmt/표준 Clippy·Rust115개/기본 제외5개·binary/doc-tests. 추가 프론트6개는 다른 자산/위조 운지·저신뢰 누락/알 수 없는 필드 거부, 실제 alphaTab 미리보기와 원본/문서 불변, 명시적 실행·취소/늦은 결과/자산 전환·모델 누락을 검증합니다. 기본 제외5개 중 개발 worker/실제 모델2개는 위 별도 명령으로 실행했고 장치 열거2개/독립 WAV 생성1개는 이번 미실행입니다(하드웨어/녹음 변경 없음).
8. `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: 성공. 최신 custom-protocol 번들/Windows 후보 빌드·실제 앱 미리보기는 이 기록 시점 확인 중이며 아래 후속 기록에서 갱신합니다.

### 발생 오류와 해결

- 실제 Rust worker 분석이 두 번180초 시간 초과됐습니다. faulthandler로 NumPy C 확장 create_module과 동시에 대기 중인 stdin read를 확인했습니다. 메인 스레드로 추론을 옮기는 것만으로는 해결되지 않았습니다. Windows 빈 파이프의 blocking read를 피하도록 가용 바이트 조회/짧은 대기로 변경한 뒤 같은 native 실제 모델 검사가5.38초에 통과했습니다. [NumPy 원본 이슈](https://github.com/numpy/numpy/issues/24290), [PeekNamedPipe 공식 문서](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-peeknamedpipe)를 참조했습니다. 첫 실패를 추론 성공으로 기록하지 않습니다.
- 새 Python 환경의 sklearn/urllib3 JS가 프로젝트 ESLint 대상으로 포함돼13개 오류가 발생했습니다. 타사 코드를 고치지 않고 Python 가상환경만 검사 대상에서 제외했습니다. effect cleanup의 불필요한 세대 증가에 대한 경고도 제거하고 기존 mounted/새 범위 세대 검사로 늦은 응답 방어를 유지했습니다. 이후 전체 검사는 경고 제한을 유지한 채 통과했습니다.
- alphaTab 큰 번들 경고(main약1,429.51kB)와 MSVC 라이브러리 생성 안내는 빌드 성공과 함께 발생한 기존 제한입니다. 이번 기능을 위해 기존 악보 엔진/정상 입력·녹음 코드를 재작성하지 않았습니다.

### 미구현·미실행 및 다음 작업

- AI 초안은 검토 전용 메모리 상태입니다. 현재 문서 적용/Undo·Redo·새 리비전 저장·영구 초안/승인 상태는 미구현입니다. 앱/화면 종료 시 초안이 소실됨을 UI에 표시합니다. 실제 Windows 미리보기 버튼 검사는 새 앱 적용 뒤 사용자 확인 대기입니다.
- 전체 기타/accompaniment stem 분리와 모델 설치 UI·audio-separator 모델/가중치 선정은 미구현입니다. 전체 음원에서 타 악기 음도 검출될 수 있으며 Lead/Rhythm 분리로 주장하지 않습니다. 추가 모델 다운로드는 승인 범위에 포함하지 않습니다.
- 실제1분 기타 F1/onset/허위 음표·혼합곡/왜곡/고급 주법 품질·CPU/메모리 피크·새 PC/완전 오프라인/최소 Rust1.90 검사는 미실행입니다. 사용자 음원/기타 녹음/출력물을 자동 분석하지 않았습니다.
- 코드 Apache-2.0과 wheel LICENSE/NOTICE 존재, 전이 의존성 고지는 확인했으나 전체 바이너리/가중치의 상용 재배포 법적 검토·installer 고지는 미완료입니다. release Sidecar는 미구현이며 개발 환경 성공을 배포 완료로 표현하지 않습니다.
- 다음은 간단한 자체 WAV 실제 미리보기 수용 후 초안 검토/명시적 적용·영구 보존입니다. 기존 수동 편집/불변 원본·새 리비전/채점 epoch 경계를 재사용하고 노트/초안 provenance를 저장 형식과 분리해 정의합니다. 이후 전체 기타 stem·선택 설치/Sidecar를 검증하며 Phase 6 전체 완료 전 다음 Phase로 넘어가지 않습니다.

## 새 후보 Windows 적용 — 2026-10-17 13:40

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`: 성공2개. 내장 최신 index/script·허용된 자체 fixture만 포함, 개인 출력물 제외와 녹음 종료 안내 수신 권한을 확인했습니다.
- 이전PID12908/13:07:05/정확한 실행 경로를 조회한 뒤 사용자 허용 범위에서 CloseMainWindow로 정상 종료했습니다. 녹음 차단을 우회하거나 강제 종료하지 않았습니다. 진행 중 사용자 수동 검사는 없었습니다.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab`: 성공25.92초. exe24,186,368바이트/13:39:59, 새PID30008/13:40:09 실행. 기본 입력/모니터/녹음·AI 분석을 자동 시작하지 않습니다.
- 실제 사용자 미리보기 UI: **미실행/확인 대기**. 기존 자체 악보/사인파 프로젝트에서 ‘카피→프로젝트 WAV를 AI 카피’를 눌러 AI 초안8음·TAB/관측 표 또는 오류 문구만 확인하도록 안내합니다. 기타 연주가 필요 없는 검사입니다. 응답 전 소스 수정·앱 재실행을 멈추며 다음 재개자는 이 실제 수용 결과부터 확인합니다.

## 저장 후보 적용 중 정상 종료 대기 — 2026-10-17

완료된 미리 듣기 테스트 창을 정상 종료하고 새 저장 후보로 바꾸겠다고 안내한 뒤 기존PID19936/정확한 exe 경로를 확인해 CloseMainWindow를 요청했습니다. WaitForExit5초 안에 종료되지 않아 해당 셸은 빌드 이전에 중단했습니다. 추가 종료 요청 없이5초 기다려 조회했지만 PID19936/창 제목GuitarLab/Responding=true/HasExited=false로 남았습니다. 강제 종료하지 않았습니다. 녹음 종료 차단 또는 대화상자 때문인지는 아직 확인되지 않았으며 단정하지 않습니다.

새 Windows exe 빌드/실행·새 마이그레이션의 실제 사용자 DB 적용·실제 저장/재열기 수용은 **미실행**입니다. 기존 v4 앱은 유지되고 모든 후보 소스/계약/자동 검사/문서는 저장했습니다. 사용자가 녹음 중이면 STOP·저장하고 열린 대화상자를 처리한 뒤 창을 닫았음을 알려주면, 프로세스 종료 확인→custom-protocol build→새 앱 실행→한 번 재분리/저장·재열기 수용을 이어갑니다. 응답 전 추가 앱 조작/원본 소스 변경은 하지 않습니다.


## 2026-10-20 공개 실제 기타의 기존 Basic Pitch 품질 보충

Phase7의 주석 자료 준비와 함께 이미 설치된 개발 Basic Pitch0.4.0/Python3.10.8을 오프라인/네트워크 차단으로 재사용해 공개 GuitarSet4개만 분석했습니다. 기존 모델/제품cp312/앱·사용자 자료를 변경하거나 새 모델을 받지 않았습니다. 전체 파일 문맥의 안정1782개 참조 시각에서TP2442/검출2828/참조2801·micro F1 0.86765, 같은 안정400ms28개 참조의 사후 음고 집합은34/36/37·F1 0.9315입니다. 마이크/반자동 참조·2명4개·전환 구간 제외/무음 예측 한계가 있으며 노트 onset/주법/실시간 지연·모든 카피 정확도 수용이 아닙니다. 제품 관리cp312와 실제 기타 동등성/새 PC는 이번 미실행입니다. 원본SHA 전후·새 결과 보존/모델 무결성 확인과 도구4개 검사 성공. 로그/실제 artifacts/지표와 원본 목록은 PHASE-07 최신 ‘공개 실제 기타 기준선’ 절에 기록했습니다. Phase6 전체 완료나 실시간 Python 허용으로 해석하지 않습니다.


### Basic Pitch 표본 독립성 보충 — 2026-10-20

설치된 Basic Pitch0.4.0 공식 `constants.py`의 DATASET_SAMPLING_FREQUENCY에 GuitarSet이 명시돼 있음을 확인했습니다. 선택한4개 파일의 학습/검증/시험 split은 확인하지 않았으므로, 이번 모델 결과는 **독립적인 일반화 성능/미학습 시험 성적이 아닙니다**. 공개 자료/어댑터 동작의 좁은 회귀·호환성 기준선으로만 사용합니다. 향후 품질 수용에는 학습과 분리된 출처가 확인된 자료/실제 장치·주법 참조가 필요하며 현재 고급 채점 보류를 유지합니다.

### release 실제 모델 격리 회귀 착수 — 2026-10-22

최신 빈 악보 포함 release 내부 설치·종료 코드0/제거와 독립Python/ZIP 검사가 끝나 현재PC에서 추가로 가능한 실제 모델 경로를 검증합니다. 이미 승인된 캐시77파일/855,155,601바이트(두cp312 프로필과 원본Basic Pitch wheel1개)의 전체 크기/SHA·임시 드라이브4GiB 이상 여유를 먼저 확인했습니다. release-ai-cache-preflight.json에 기록했으며 새 다운로드/기존 설치 변경은 없습니다.

`cargo test --release --locked --offline --all-features --manifest-path src-tauri/Cargo.toml ai::setup::tests::actual_portable_models_install_reuse_transcribe_separate_and_cancel_without_legacy_changes -- --ignored --exact --nocapture`를 실행 중입니다. 고정캐시 복사본/새 임시root에서 두모델 새설치·실제 자체검사/재사용·복사 캐시만 정리 후 추론·취소를 확인합니다. 원래 캐시/marker/사용자 악보·녹음은 작업 대상이 아닙니다. 성공은 아직 선기록하지 않으며 별도Windows/실제 기타 정량 품질을 대신하지 않습니다. 현재 사용자앱PID27900/PTY4579는 유지하며 로그는 runtime-validation/release-managed-offline.log입니다.

### release 실제 모델 격리 회귀 완료

위 실제 통합1개277.14초 성공입니다. Python3.12.15의 새 격리 환경에서 Basic Pitch0.4.0/Demucs4.1.0의 오프라인 고정패키지 설치/의존성 검사·자체 검증·관리 환경 조회와 같은환경 재사용을 확인했습니다. 복사한 캐시만 정리한 뒤에도 실제 프로젝트 경유8음 카피/176,400프레임(44.1kHz·4초) 두stem 분리가 통과했고 원본은 동일했습니다. 새 환경의 설치 취소 정리와 legacy marker 모사 값 보존도 확인했습니다.

원래 사용자 캐시77개/855,155,601바이트는 사후 전체 크기/SHA도 동일했습니다. 실제 제품v9/16개 테이블과 모델4marker는 앞선 사용자 빈 악보 저장 이후 기준과 동일했고 앱PID27900/PTY4579를 유지했습니다. 사용자 캐시/기존 모델 삭제·재다운로드나 개인 오디오 분석은 하지 않았습니다. evidence는 release-managed-offline.log/SHAe187b165703fc081e07102ff44b7c849e5225f972bc8aad12971899f842b8e21 및 release-managed-offline-receipt.json의 RELEASE_PORTABLE_MANAGED_MODELS_VERIFIED입니다.

이 성공은 현재PC의 release native 서비스/번들 리소스 경로에서 실행한 자체fixture 통합이며 설치 앱의 모델 버튼을 사람이 눌렀다는 뜻이나 실제 기타 품질/다른Windows DLL·WebView2 수용이 아닙니다. 전체 AI Python pytest 재실행은 worker/모델 변경이 없어 **미실행**입니다. 기본 release230개/26개 제외 결과와 이번 명시적 ignored1개 실행을 구분합니다. Phase6의 별도Windows 수용은 사용 가능한 장비/VM이 없어 계속 **미실행**, Phase6B 특화 분리/Phase7 고급 점수는 별도 미완료입니다. 현재 독립 실행과 실제 모델 설치/분석 경로의 이번 회귀는 완료이며 외부 조건이 확보되면 해당 수용부터 이어갑니다.
