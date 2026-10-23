# 13. Windows 개발 환경 · 실행 · 패키징

## 두 모델 관리 환경 및 배포 런타임 의존성 — 2026-10-18

Basic Pitch와 Demucs는 앱 데이터의 별도 UUID 환경/7필드 marker로 관리합니다. 앱 설치 선택은 고정된 두 모델만 허용하며 기존 환경은 재검증해 재사용합니다. Demucs는 로컬 이관 캐시33개/707,117,623바이트와 고정 setuptools로 오프라인 설치했습니다. 새 환경 실제 크기는3,325,310,044바이트/15,767파일이며 자체4초 분리·native의 관리 환경 선택/재사용/취소를 확인했습니다. 기존 개발 환경/Basic Pitch marker는 유지합니다. Demucs 네트워크 다운로드 UI는 아직 없습니다.

Python3.10은 공식적으로2026-10-01 지원 종료됐으므로 현재 개발 환경을 독립 배포용으로 그대로 번들하지 않습니다. Basic Pitch0.4.0은 Python3.11 이상에서 TensorFlow 의존성 조건도 달라 단순 실행 파일 교체가 불가합니다. 근거와 별도 지원 런타임/ONNX 호환 검증 순서·미실행 범위는 [docs/18](18-AI-RUNTIME-MIGRATION.md)를 따릅니다. 기존 환경은 보존하며 새 런타임을 자동 교체하지 않았습니다. 아래 이전 미구현 설명은 당시 이력입니다.

## 앱 내 Basic Pitch 설치 관리 — 2026-10-18

환경 설정의 ‘Basic Pitch 설치 / 재검증’은 기존 검증 캐시를 사용해 별도 앱 데이터 환경에 오프라인 설치하고 실제 자체8음 검증 후 활성화합니다. 기존 활성 환경이 있으면 같은 환경을 재검증합니다. 새 설치는1GiB 여유를 확인하며 추가 다운로드/관리자 권한은 요구하지 않습니다. 취소 후 직접 자식 종료와 새 환경 정리를 기다리고 오류도 표시합니다. 설치 중 정상 창 닫기는 제한하며 완료/취소 정리 후 종료합니다. CLI도 같은 준비/활성화/정리 코드를 사용합니다. 격리 실제 설치·재사용·pip 중간 취소를 검증했으며 개발 Python/pip/worker 소스 의존과 Demucs 관리·독립 Sidecar/새 PC 미검증 제약은 유지합니다. 아래 설치 버튼 미구현 설명은 이전 이력입니다.

## 앱 데이터 Basic Pitch 환경 — 2026-10-18

사용자의 직접 설치 요청에 따라 기존 캐시41개를 재검증하고 앱 데이터 ai/environments/basic-pitch-0.4.0-cp310/새 UUID에 별도 환경을 설치했습니다. 오프라인 설치/pip check·고정 버전/모델 해시·자체8음 추론 후만 ai/basic-pitch-active.json을 게시합니다. native는 이 marker를 우선 사용하며 marker가 없는 프로젝트 환경은 기존 개발 모델과 호환합니다. 손상된 marker는 개발 환경으로 폴백하지 않습니다.

개발 설치 명령(ai 디렉터리): `.venv/Scripts/python.exe -s -u -m guitarlab_ai.install_managed --install`. 기존 활성 환경은 검증해 재사용하고, 실패/취소 시 현재 새 환경만 경로 확인 후 정리합니다. CLI는 임의 shell/다운로드를 실행하지 않습니다. 환경은 옮기지 않습니다. 실제 설치 크기는 약422MiB이며 디스크 할당량과 구분합니다.

resampy가 pkg_resources를 암묵적으로 사용하므로 현재 Python3.10.8 ensurepip에 포함된 setuptools63.2.0을 추가 다운로드 없이 고정 bootstrap으로 설치합니다. 별도 lock의 SHA/크기와 번들 MIT LICENSE·Python>=3.7 요구를 확인했습니다. 기존41개 manifest와 분석 모델의 버전은 변경하지 않습니다. 이 환경도 Python 기본 설치/개발 worker 소스에 의존하므로 독립 Sidecar/새 PC 배포 검증은 아직 완료되지 않았습니다.

## 선택 설치 파일 다운로드 단계 — 2026-10-18

Basic Pitch0.4.0의41개/144,366,287바이트만 명시적 동의 후 앱 데이터 ai/downloads/basic-pitch-0.4.0-windows-cp310에 캐시합니다. 검증된 캐시는 재사용하며 손상된 기존 파일을 덮어쓰지 않습니다. 현재 누락 파일의 합계+64MiB 여유를 확인합니다. 기존1GiB 표기는 향후 환경 설치 여유를 포함한 계획값입니다. 개발 환경/프로젝트를 변경하거나 패키지를 실행하지 않습니다.

고정 manifest의 정규화 SHA는55a4a2252034be7389673313f35b36ea7cfd49c54984b0827bd6b29699218c2a입니다. HTTPS files.pythonhosted.org만 사용하고 프록시/외부 리다이렉트는 허용하지 않습니다. 선택 다운로드 UI는 실제 가상환경 설치나 릴리스 Sidecar를 대신하지 않습니다. 실제 네트워크/앱 수용 여부는 진행 문서의 최신 상태를 따릅니다.

## 선택 모델 설치 파일 확인 — 2026-10-18

기존 ‘AI 환경 확인’은 테스트용 ai/.venv의 메타데이터 조회입니다. 카피/분리는 별도 ai/.venv-basic-pitch/ai/.venv-demucs를 사용하므로 테스트 환경의 미설치 표시가 실제 분석 모델의 미설치를 뜻하지 않습니다. 새 ‘선택 모델 설치 확인’은 해당 모델 환경에서 기존 adapter의 전체 고정 패키지 버전·모델 SHA 검증을 재사용합니다. FILES_VERIFIED는 설치 파일 확인이며 모델 로드/DLL 실행/정확도/배포 허가 검증 결과가 아닙니다.

다운로드 계획은 Basic Pitch 약138MiB/여유1GiB, Demucs 약675MiB/여유4GiB입니다. 용량은 고정 manifest의 다운로드 합계와 여유 공간 계획이며 실제 설치 크기와 구분합니다. 이 검사는 음원 읽기·설치·다운로드를 하지 않으며 앱 내 설치기/릴리스 Sidecar는 여전히 미구현입니다. 실제 검사/앱 수용 여부는 PHASE-06.md의 최신 기록을 따릅니다.

> 2026-10-17 추가: 사용자 승인으로 Basic Pitch와 별도 Demucs4.1.0 CPU 환경을 설치했습니다. Demucs는 ai/.venv-demucs의 Python3.10.8·고정31개 패키지와 해당 환경 models/htdemucs_6s의 검증된 safetensors만 사용합니다. 실제 자체 음원 분리·native 출력 검증/취소는 성공했고 Python42개 검사를 통과했습니다. 앱 설치 UI/릴리스 Sidecar와 일반 사용자 배포 허가 확인은 미완료입니다. 아래 첫 worker 설명/미구현은 당시 이력입니다.
> 2026-10-17 개발 worker: debug 앱의 ‘환경 설정 → AI 환경 확인’은 저장소 ai/.venv의 Python으로 고정된 guitarlab_ai.worker 모듈만 실행합니다. 환경이 없으면 AI_RUNTIME_UNAVAILABLE로 실패하며 shell 문자열/임의 경로를 받지 않습니다. 첫 action은 패키지 메타데이터 조회만 지원합니다. release Sidecar는 미구현이며 개발 Python 환경을 설치형 배포라고 간주하지 않습니다. 테스트는 `ai/.venv/Scripts/python.exe -m pytest ai/tests -q`로 실행합니다. Python3.10.8에서29개 통과, 모델 호환/설치 검사는 별도 미실행입니다.

## 초기 설치 (Windows 10/11 x64)

- VS Code + Codex; Git; Node.js LTS; pnpm; Rust stable 및 Cargo; Python 3.11/3.12 중 AI 의존성과 호환되는 버전.
- Visual Studio 2022 Build Tools의 **C++를 사용한 데스크톱 개발**, MSVC C++ 빌드 도구, Windows SDK.
- WebView2 Runtime (Windows 버전/환경에 따라 기본 포함 여부 확인).
- 오디오 테스트용: 헤드폰, 마이크 또는 USB 오디오 인터페이스; 가능하면 ASIO/WASAPI 환경 및 기본 녹음 장치 설정 확인. CPAL의 실제 host/backend 지원은 OS/버전별 확인.

## 버전 관리

- Node 및 pnpm `packageManager` / lockfile 기록.
- Cargo.lock 버전 고정, Python lockfile(`uv` 또는 pip-tools) 사용.
- AI 모델 가중치는 별도의 manifest에 모델 ID, sha256, 출처, 라이선스, 용량, 호환 플랫폼 기록.
- 다운로드/설치 전에 타사 의존성 라이선스 검증.

## 개발 진입점 (Phase 0 이후 생성할 스크립트)

```powershell
# 앱 개발
pnpm install
pnpm tauri dev

# frontend 검사
pnpm typecheck
pnpm lint
pnpm test
pnpm build

# rust 검사
cargo test --manifest-path src-tauri/Cargo.toml

# python 검사: 환경구축 후
python -m pytest ai/tests
```

> `pnpm tauri dev`는 Phase 0에서 `@tauri-apps/cli` 설정과 package script가 생성된 다음 사용 가능합니다. **현재 ZIP에는 실행 코드나 lockfile이 없습니다.**

## Sidecar 개발/배포 전략

1. 개발 초기: Rust가 관리하는 Python 가상환경 실행 또는 테스트 mock 분석 adapter를 통해 IPC PoC.
2. 패키징: PyInstaller 등으로 Windows x64 Python 분석 바이너리 패키징. DLL/모델 의존성과 시작 시간 점검.
3. `tauri.conf.json`의 `bundle.externalBin` 경로 및 대상 target triple 접미사 규칙을 정확히 적용.
4. Sidecar는 Tauri shell plugin의 세밀한 capability만 부여. 가능하면 Rust가 제한된 job interface로 통제.
5. **모델 가중치의 설치형 배포 가능성/용량/인터넷 다운로드 권한**은 실행 바이너리와 별개로 검토.
6. pyinstaller 빌드 실패나 패키징 라이브러리 미호환 발생 시 해당 Phase의 미완료 항목으로 남깁니다.

## 설치형 앱 빌드

- 우선 Tauri Windows installer 생성(WiX/MSI 또는 NSIS: 공식 문서의 지원 방식 확인).
- 테스트: 설치→실행→오디오 장치 접근→앱 데이터 생성→프로젝트 import→연습 결과 저장→프로그램 종료/삭제.
- 디지털 서명/스마트스크린 경고/악성코드 오탐은 실제 배포 전 별도 검토.
- 마이크 이용 및 모델 다운로드 권한을 사용자 UI에서 사전 고지.

## 배포 체크리스트

- [ ] 깨끗한 Windows 개발환경에서 앱 구동.
- [ ] 깨끗한 사용자 환경에 설치 테스트.
- [ ] 특정 사용자명/절대 경로에 의존하지 않음.
- [ ] 인터넷 끊겨도 기본 기능/설치한 모델 정상 작동.
- [ ] Sidecar stdout/encoding/권한/오류·취소 처리 정상.
- [ ] 사용자 데이터 백업·복원·삭제 설명 제공.
- [ ] 타사 라이선스·음원/악보 저작권 고지 제공.

## 문제 발생 시 우선 확인

- `cargo` 인식 불가 → Rust stable 설치 및 PATH 확인.
- MSVC linker 오류 → VS 2022 Build Tools, Windows SDK 설치 확인.
- WebView2 미설치 → Runtime 설치/OS 환경 확인.
- Sidecar 실행 실패 → target triple, 파일명, 실행 권한, capability, bundled dependency 확인.
- 녹음 입력 없음 → Windows 개인 정보/마이크 권한, 기본 입력 장치, sample rate 지원 확인.

## 공식 참고

- https://v2.tauri.app/start/prerequisites/
- https://v2.tauri.app/develop/sidecar/
- https://v2.tauri.app/distribute/

## Phase 0 검증 환경 (2026-10-13)

위 ZIP 안내는 최초 문서 배포 상태를 설명합니다. 현재 `package.json`, `pnpm-lock.yaml`, `src-tauri/Cargo.lock`, Python 테스트 의존성 잠금 파일이 추가되었으며 개발 진입점이 동작합니다. 검증 환경은 Node 20.15.1, pnpm 9.14.3, Rust/Cargo 1.98.0, Python 3.10.8입니다.

Python 모델은 설치하지 않았습니다. `ai/requirements-test.lock`는 Python 3.10 Windows 테스트 환경의 전이 의존성까지 고정합니다. AI 기능 구현 전 Python 3.11/3.12에서 모델 호환성을 별도로 검증하세요. 설치형 번들은 `bundle.active=false`로 비활성화되어 있습니다.

## Phase 6 승인된 Basic Pitch 개발 환경 — 2026-10-17

위 모델 미설치 안내는 Phase 0 당시 기록입니다. 사용자 ‘다운로드·설치하고 검증 진행’ 승인으로 `ai/.venv-basic-pitch`에 Python3.10.8용 Basic Pitch0.4.0과 고정 의존성41개를 설치했습니다. `ai/.venv` 테스트 환경과 분리하며 앱/설치 프로그램이 자동 다운로드하지 않습니다. 별도 모델 환경과 NumPy1.26.4·ONNX Runtime1.23.2의 실제 CPU 추론을 검증했습니다. Python3.11/3.12와 다른 PC는 미검증입니다.

고정 설치 파일은 `ai/models/requirements-basic-pitch-windows-cp310.lock`, 출처/용량/해시 계획은 같은 폴더의 JSON입니다. 이미 생성된 가상환경은 덮어쓰지 않습니다. 승인된 개발 설치 명령은 다음과 같으며 새로운 모델/버전은 별도 검토 대상입니다.

```powershell
ai/.venv/Scripts/python.exe -m venv ai/.venv-basic-pitch
ai/.venv-basic-pitch/Scripts/python.exe -I -m pip --isolated install --index-url https://pypi.org/simple --disable-pip-version-check --no-input --require-hashes --only-binary=:all: --no-deps -r ai/models/requirements-basic-pitch-windows-cp310.lock
ai/.venv-basic-pitch/Scripts/python.exe -I -m pip --isolated check
```

배포 파일 합계137.68MiB, 설치 직후 파일 크기 합계533,834,435바이트(약509.1MiB/14,086파일, 디스크 할당량과 다름)입니다. manifest의 INSTALLATION_UNVERIFIED는 배포 계획의 초기 상태이며 현재 PC 설치 기록은 PHASE-06.md로 관리합니다. 설치 여부만으로 어떤 사용자 음원에서도 정확하게 분석된다고 주장하지 않습니다. 개발 Rust는 고정된 두 환경만 실행하며 release의 새 분석은 아직 AI_RUNTIME_UNAVAILABLE입니다. 이미 보존한 초안 복원은 모델을 실행하지 않는 별도 저장 경로입니다. sidecar/설치 UI·재배포 라이선스 고지·완전 오프라인 새 PC 설치는 미완료입니다.

Windows에서는 빈 stdin에 대한 보조 스레드 blocking read와 OpenBLAS DLL 초기화가 교착할 수 있습니다. 취소 파이프를 PeekNamedPipe로 확인하고 들어온 바이트만 읽어 우회했으며 실제 Rust worker 경로로 회귀 검증했습니다. [NumPy 원본 이슈](https://github.com/numpy/numpy/issues/24290), [Windows 파이프 API](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-peeknamedpipe).


## 승인된 모델 직접 설치·검증 도구 — 2026-10-19

`src-tauri/examples/manage_ai_model.rs`는 사용자에게 이미 승인받은 설치를 개발자가 직접 수행하기 위한 도구입니다. 앱을 정상 종료한 뒤 사용하며 새 다운로드·새 버전 선정·기존 환경 교체를 승인하는 수단이 아닙니다. 사용자에게 버튼 조작을 설치 작업의 전제 조건으로 반복 요구하지 않습니다. UI 수용과 실제 소리/장치 검사는 자동 검사와 구별해 기록합니다.

실행 형식은 `cargo run --locked --manifest-path src-tauri/Cargo.toml --example manage_ai_model -- install|verify|download basic-pitch|htdemucs_6s <검증된 후보 ai-runtime 절대 경로>`입니다. 실제 경로는 `src-tauri/target/runtime-validation/portable-candidate.json`의 portablePath 아래 ai-runtime을 사용합니다. 앱과 같은 native `install_with_resources`/`verify_with_resources`를 호출하며 전체 리소스/캐시 SHA·오프라인 pip check·자체 음원·별도 marker·시간 제한·취소/신규 환경 정리를 그대로 적용합니다. 개인 음원/프로젝트를 분석하지 않습니다.

진행과 최종 결과는 경로를 제외한 JSONL로 출력합니다. 표준 입력에 `cancel` 한 줄을 보내면 native의 취소·정리를 기다립니다. 앱이 종료되지 않으면 다른 설치를 시작하지 않습니다. CLI는 개발 도구이고 제품 IPC/JSONL/저장 형식에는 변경이 없습니다.

2026-10-19 다운로드 확장: 명시적으로 승인된 경우에만 `download`로 같은 native 캐시 경로를 실행합니다. 이 작업은 설치/음원 분석을 하지 않습니다. Demucs는 고정 버전 패키지와 연구용 가중치 안내를 확인한 명시적 동의가 필요하며, 기존 설치 승인을 새로운 모델/버전의 무제한 다운로드 승인으로 사용하지 않습니다.


## 개발 도구 없는 런타임 점검 후보 — 2026-10-19

2026-10-21 개발 실행 보완: `scripts/Run-ValidationCandidate.ps1 -ReceiptPath <현재 검증 영수증>`은 입력이 열린 PTY에서만 실행합니다. 실제 Process를 유지하며 `status`와 `close` 한 줄만 받습니다. close는 정상 창 닫기 요청이며 녹음/파일 작업 차단·미저장 확인을 우회하지 않습니다. 검증된 workspace 후보 경로/허용 exe/지문만 받으며 임의 shell·강제 종료를 제공하지 않습니다. 관리 CLI의 install/download/verify도 앱과 같은 AppData 잠금을 먼저 얻으므로 앱 실행 중 INSTANCE_ALREADY_RUNNING이면 정상 종료를 기다립니다. 사용자 데이터를 쓰지 않는 inspect만 예외입니다.

`manage_ai_model inspect <후보 폴더 절대 경로>`는 앱과 같은 native 전체 lock·Python3.12.15/JSONL 확인을 수행합니다. ai-runtime이 없는 폴더는 미리 거부하고 설치/다운로드/앱 데이터 작업을 하지 않습니다. `scripts/Test-StandaloneRuntime.ps1`은 검증 패키지에 복사해 사용하며 exe 지문·최소 PATH·PYTHONHOME/PYTHONPATH 제외·두 차례 환경 확인 뒤 원래 변수를 복원합니다. 모델 미설치는 기본 runtime에서 정상입니다. UTF-8 BOM으로 Windows PowerShell5.1을 지원하고 해시는 .NET SHA256을 사용합니다.

별도 release 빌드에서는 개발 Python 폴백을 차단하고 새 모델 미설치를 AI_MODEL_MISSING으로 구별합니다. 이것이 깨끗한 OS/공식 릴리스/서명·최종 라이선스 검토가 완료됐다는 뜻은 아닙니다. [Tauri 공식 Windows 문서](https://v2.tauri.app/distribute/windows-installer/)에 따라 WebView2/설치 프로그램의 배포 조건을 별도 확인하며 현재 ZIP은 WebView2나 모델을 자동 설치하지 않습니다. 기존 Phase 8의 최종 설치 프로그램 검증은 아직 시작하지 않았습니다.


## Phase8 회귀/검증 패키지 준비 — 2026-10-20

현재 소스는 Rust1.90.0 all-targets/all-features check를 실제 통과했고 기본 개발1.98을 유지합니다. Windows GitHub 회귀 파일은 공식action3개를 고정 commit으로 준비했으며 실제 GitHub 실행은 미실행입니다. 기본 CI 검사 Python3.13.16은 공식 Windows x64 배포와 pytest 지원을 확인한 선택으로, 제품/모델 번들3.12.15를 바꾸지 않습니다. 기존 ai/requirements-test.lock를 재사용합니다.

`scripts/package_validation.py <현재 후보JSON>`은 검증된 exe/동일 runtime·관리 CLI/제3자 고지를 신규 ZIP에만 묶습니다. `Test-ValidationPackage.ps1`는 추출한 모든 파일 지문/추가·누락·링크를 확인한 뒤 개발 PATH 없이 기본 Python을 두 번 실행합니다. 앱 실행/모델 설치/사용자 데이터 변경은 수행하지 않습니다. 현재 PC 성공을 새PC 성공으로 바꾸지 않으며 자체LICENSE·모델 조건/고지·최종installer·백신/코드서명은 별도 미완료입니다. 최신 artifact/해시/미실행 범위는 progress/PHASE-08.md를 확인하세요.


## 2026-10-21 백업 안내와 자체 라이선스

앱의 백업·검사·새 폴더 복원 미리보기 사용법은 [백업 안내](19-BACKUP-AND-RECOVERY.md)를 따릅니다. 실제 AppData 교체/새PC 복원은 미지원입니다. 사용자가 자체 MIT를 선택해 루트 LICENSE와 npm/Cargo/Python 메타데이터에 반영했고 검증 ZIP에도 포함합니다. 제3자/모델 조건 및 새PC·최종installer 검토는 계속 별도입니다.


## 2026-10-21 분리된 내부 NSIS 설치 후보

`src-tauri/tauri.validation.conf.json`은 최종 릴리스 설정이 아닙니다. 제품명 GuitarLab Validation/식별자 com.guitarlab.validation/실행 파일 guitarlab-validation.exe로 제품과 분리합니다. NSIS가 실행 파일명으로 프로그램을 확인할 수 있으므로 식별자만 바꾸지 않고 실행 파일명도 바꿉니다. currentUser 설치, Korean/English·MIT와 고지/백업 안내·고정 기본 runtime만 묶고 모델/사용자 자료는 넣지 않습니다. 설치/제거 검사는 새 테스트 경로에서만 수행하며 현재 제품 앱을 종료 대상으로 삼지 않습니다.

검증 설정의 WebView2 모드는 skip이며 현재 PC에 이미 있는 WebView2가 전제입니다. WebView2가 없는 새PC/완전 오프라인 runtime 설치·서명/최종배포 수용으로 표시하지 않습니다. [Tauri Windows 공식 안내](https://v2.tauri.app/distribute/windows-installer/)와 설치 CLI2.12.2 schema를 확인했습니다. 압축은 zlib이며 [NSIS 공식 조건](https://nsis.sourceforge.io/Docs/AppendixI.html)을 참조합니다. 설치기 추가 도구/플러그인의 실제 버전·고지/지문은 빌드 결과와 함께 확인합니다.

재현은 `pnpm build` 뒤 `ai/.venv/Scripts/python.exe -B -X utf8 scripts/prepare_validation_installer.py`입니다. 고정 runtime 전체 SHA를 검사하고 새 UUID의 config/plan만 만듭니다. 반환 config로 `pnpm tauri build --debug --config <configPath>`를 실행합니다. 직접 템플릿만 넘기면 runtime 리소스가 빠지므로 생성한 config를 사용합니다. 빌드는 설치를 자동 수행하지 않습니다. 실제 실행 결과는 PHASE-08을 따릅니다.
