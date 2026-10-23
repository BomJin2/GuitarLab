# 18. 배포용 AI 런타임 전환 검토 — 2026-10-18

> 2026-10-19 최신: 두 cp312 모델 설치/선택 다운로드와 release 독립 검증 ZIP의 최소 PATH/추출·지문/실제 모델 재사용 검사는 현재 PC에서 통과했습니다. 깨끗한 별도 Windows는 사용자 장비 부재로 **미실행**이며 DLL/WebView2·최종 installer/배포 완료로 표현하지 않습니다. 외부 검증을 기록하고 독립적인 Phase 6A URL 경로를 진행합니다. 상세는 [Phase 6 결과](progress/PHASE-06.md) 최신 절을 참조합니다.

> 2026-10-19 설치 전환 갱신: Basic Pitch 새 설치 UI를 사용자 수용했고 Demucs는 기존 캐시로 개발자가 직접 cp312 설치/실제 자체 분리·활성화를 완료했습니다. 두 모델 Python3.12.15/FILES_VERIFIED·동일 환경 재사용/자체 분석과 marker4개 보존을 직접 확인했습니다. fmt/확장 Clippy·Rust141개·실제 관리 회귀2개·CLI 잘못된 입력/취소 검사가 성공했고 같은 후보 앱PID6440을 다시 열었습니다. 승인된 설치는 사용자에게 반복 요구하지 않고 직접 처리합니다. Demucs 다운로드 UI·새 PC/installer·최종 고지/기타 품질은 후속이며 Phase 6 전체는 진행 중입니다. 최신 상태는 [진행 문서](progress/README.md)를 따릅니다. 아래 미실행/전환 대기는 당시 기록입니다.

**2026-10-19 최종 후보**: 최종 verify:app 프론트216개/Rust141개·Python103개·확장 Clippy·기존 실제 관리 회귀2개·내장 UI2개/독립 runtime1개와 Tauri Windows 빌드가 통과했습니다.3,392파일/64,092,710바이트의 실제 resource_dir와 독립 폴더를 lock 대조했고 새 후보 PID6628을 열었습니다. 기본 Python 환경 확인의 이전 사용자 수용과 별개로, 이번 모델 설치 버튼/새 활성 marker·재실행 재사용은 아직 미실행입니다. Demucs 선택 다운로드·깨끗한 Windows/installer·최종 재배포 고지 검증도 미완료이며 아래 초기 상태/미실행 기록은 이력입니다.

**2026-10-19 재개 결과**: cp312 두 모델의 새 격리 관리 설치/pip check/실제 자체 분석·분리/같은 환경 재사용/공개 카피·분리/취소·구형 marker 보존 통합1개가308.49초에 통과했습니다. 별도 불변 runtime의 실제 복사·재사용·중간 취소 정리·손상 거부/구형 marker 보존1개도65.14초에 성공했습니다. Python103개/3.71초 성공입니다. 긴 한글 경로의 DLL 로드 실패는 기존 절대 import 경로의 Windows 확장 표기 정규화로 해결했고 prefix/분석 결과는 변경하지 않습니다. 실제 사용자 앱 데이터의 새 활성 marker는 아직 만들지 않았으며 최종 전체 검사·새 후보/UI·새 PC는 미실행입니다. Phase 6 전체/릴리스 완료가 아니며 아래 검증 중/미구현 표기는 과거 이력입니다.

**19:18 Tauri 후보 수용**: 내장 UI/권한·최신 runtime 검사4개·Windows 후보 빌드·Tauri 복사 리소스 전체 lock 일치를 통과했습니다. 별도 portable 폴더에서 실행한 앱의 환경 확인에 Python3.12.15/로컬 worker 연결됨이 표시됨을 사용자 확인했습니다. 모델의 cp312 설치/활성화나 새 PC 배포 수용은 아닙니다. 다음은 앱 데이터의 불변 runtime 경로·구형 marker 보존/새 모델 설치 전환입니다.

**19:14 공개 worker·리소스 후보**: 정확한3.12.15와 고정 cp312 모델 계획을 공용 adapter에서 지원하고 실제 Rust JSONL 카피/분리·설치 확인·취소/실패/timeout을 통과했습니다. 기존 실제 관리 환경 회귀7개·Python96개·프론트216개/Rust139개·전체 feature Clippy가 성공했습니다.3,390파일/63,702,482바이트의 독립 런타임 리소스 후보와 파일 lock/변조 거부·Tauri resource_dir 검사 경로를 추가했고 첫 후보의 실제 로컬 환경 확인/실행 전후 파일 일치를 통과했습니다. 새 모델 기본 활성화/배포 완료가 아닙니다. 현재 최신 후보의 내장 UI/앱 빌드 검사를 진행하며 다음은 앱 데이터의 불변 runtime 경로·cp312 모델 설치/marker 전환입니다. 새 PC 검사는 미실행이고 현재 호스트에 WindowsSandbox.exe가 없습니다. 아래18:50 공용 worker 후속 표기는 당시 이력입니다.

런타임 고지 원문은 동일 공식 pgo full archive43,731,659바이트/SHA7780bf6a29f93e6d0e3b5bdbe8cf799b3e2a0638bdec921be5b0c3ca81e67313에서13개를 수집했습니다. Python/pip 고지도 함께 유지합니다. install-only에 PYTHON.json/빌드 자료가 없다는 [공식 archive 설명](https://docs.astral.sh/python-build-standalone/distributions/)에 따라 같은 빌드의 자료를 사용했습니다. 이는 고지 수집/파일 검증이며 모든 의존성·[Microsoft VC runtime 재배포 조건](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution)의 최종 검토/새 PC 릴리스 승인을 뜻하지 않습니다. Demucs 가중치는 후보에 포함하지 않습니다.

**18:50 최종 호환성 결과**: 별도 CPython3.12.15/pip26.2.1에서 두 고정 모델의 오프라인 설치/pip check·실제 자체 음원 기준 비교와 모듈/검색 경로 격리를 통과했습니다. Basic Pitch8음/운지·박자·검토 사유 및 시각/활성도 차이0, Demucs4초 두 stem의 최대 PCM/RMS 차이0입니다. Python 단위91개도 성공했습니다. 성공 job c2e7f346-335f-49e2-81d3-2a3375cccf5f의 두 새 환경과 snapshot은 검증용으로 보존하며 기존 앱 데이터 marker·프로젝트는 변경하지 않았습니다. **호환성 슬라이스 완료, nativeActivated:false·공용 cp312 worker/native/Sidecar·새 PC 검증은 아직 미완료**입니다. Torch의 가상 모듈2개는 정확한 구현 클래스와 허용 경로를 검증해 실제 파일과 구분합니다. 다음은 고정 profile의 공용 worker 연결과 배포 리소스/고지 검증입니다. 아래 중단/미실행/비교 중 표기는 당시 이력입니다.

**재개·검증 후보**: 사용자 재개 요청으로 승인한 별도 환경 검증을 시작합니다. 공식 Astral20261013의 CPython3.12.15 Windows x64 stripped archive22,019,610바이트/전체 SHA를 ai/models/python-3.12.15-windows-x64.json에 고정했습니다. 아직 릴리스 선정/배포 검증 완료가 아닙니다. 기존 Basic Pitch0.4.0 wheel은 Apache-2.0 LICENSE/NOTICE와 모든 추론 코드·가중치를 보존하고, 명시적인 로컬 버전0.4.0+guitarlab.onnx1의 ONNX 전용 메타데이터 패키징을 검증합니다. TensorFlow/플랫폼별 모델·개발 extras만 제외하고 필수 ONNX 의존성을 선언하며 RECORD/변경 고지를 다시 기록합니다. 원본0.4.0을 변경한 사실을 숨기거나 원본 캐시를 덮어쓰지 않습니다. 새 ABI wheel의 버전/호환성·용량과 실제 추론/분리를 검증한 뒤만 다음 통합을 판단합니다.

**사용자 결정**: 기존 환경·프로젝트를 보존하고 지원 중인 Python의 별도 배포용 AI 환경 전환 검증을 진행하는1번을 승인했습니다. 다만 사용량 소진으로 오늘은 중단하고 다음 재개 요청 후 실행합니다. 같은 방향 승인을 반복 요청하지 않습니다. 아직 새 런타임/패키지를 다운로드·설치하거나 기존 환경을 변경하지 않았습니다. 아래 전환 방향 확인 필요 설명은 이 결정 이전 검토 이력입니다.

## 확인한 문제

현재 개발/관리 모델 환경은 Python3.10.8과 cp310 Windows wheel에 고정되어 있습니다. Python 공식 PEP619에 따르면3.10은2026-10-01 지원 종료됐고3.10.22가 마지막 보안 릴리스입니다. 공식 Windows 바이너리의 마지막3.10.11도 현재 배포 런타임의 대안으로 채택하지 않습니다. 기존 로컬 개발 검증 성공과 새 PC에 배포 가능한 구성을 구분합니다.

근거: [Python3.10 공식 지원 일정](https://peps.python.org/pep-0619/), [2026-10-01 공식 릴리스 안내](https://blog.python.org/2026/10/python-31022-31117/).

Basic Pitch0.4.0의 공식 패키지 정의는 Windows/Python3.11 미만에서 ONNX Runtime,3.11 이상에서는 TensorFlow>=2.4.1,<2.15.1을 의존성으로 선언합니다. 따라서 Python 실행 파일만 바꾸면 현재 ONNX 전용 lock/pip check 계약을 유지할 수 없습니다. 다른 ABI wheel·의존성/모델 adapter의 별도 검증이 필요합니다. 기존 검증이 실패했다는 뜻은 아닙니다.

근거: [Basic Pitch0.4.0 공식 pyproject](https://raw.githubusercontent.com/spotify/basic-pitch/v0.4.0/pyproject.toml).

## 권고하는 다음 작업

1. 기존 Basic Pitch/Demucs 개발 환경·관리 marker·프로젝트/녹음은 보존합니다. 자동 업데이트나 기존 환경 삭제를 하지 않습니다.
2. 지원 중인 Python을 사용하는 별도 Windows 런타임 후보를 선정합니다. CPython 공식 소스와 재배포 가능한 standalone 빌드의 출처·버전·전체 SHA·라이선스/바이너리 의존성을 확인합니다. Astral python-build-standalone은 조사 후보이며 아직 선정·다운로드·실행하지 않았습니다. [공식 프로젝트 문서](https://docs.astral.sh/python-build-standalone/)
3. Basic Pitch의 ONNX 전용 실행을 유지할 수 있는 의존성/adapter 구성을 검토합니다. Python 버전만 바꾸거나 구버전 TensorFlow를 무검증으로 추가하지 않습니다. 필요하면 공식 코드 기반의 별도 adapter 변경과 라이선스 고지를 독립적으로 검토합니다.
4. 새 ABI별 wheel의 고정 다운로드 목록·용량/디스크 여유를 산출합니다. 기존 순수 Python wheel과 모델 가중치는 해시 확인 후 재사용하되 cp310 바이너리를 다른 ABI에서 사용하지 않습니다. 아직 새 다운로드 용량은 미산출이며 설치 계획 완료로 표시하지 않습니다.
5. 별도 환경에서 pip check→모델 해시→Basic Pitch 자체8음/Demucs 실제4초 분리→취소/실패/자식 종료·기존 데이터 보존→개발 Python이 없는 Windows 실행을 검증합니다. 통과 후 새 marker/마이그레이션/앱 설치 계약을 정의하고 기존 환경과 선택 전환합니다.

## 수용 조건 및 현재 상태

2026-10-18 재개 중간 결과: 런타임의 실제3,344파일/63,242,933바이트와3.12.15/pip26.2.1/OpenSSL3.5.9·격리 prefix를 확인했습니다. Python의-I가 PYTHONDONTWRITEBYTECODE 환경 변수도 무시하므로-B를 명시하는 방식으로 보완하고 새 UUID에 다시 풀어 실행 전후 archive 전체 파일 일치를 확인했습니다. 최초 검사 후보는 현재 선택하지 않으며 기존 환경을 지우지 않았습니다. ONNX 전용 wheel은2,249,897바이트/SHA53ca6709be7a4599d66df70d5e6618038f2ee5dfa7252eb2b1fda5570a00eed6이며 원본0.4.0과 버전을 구분합니다. 공식 메타데이터의 단순 cp310→cp312 파일명 대체가 soxr 안정 ABI wheel을 찾지 못해 실패했고, CPython/안정 ABI 호환 태그와 Requires-Python 검증으로 해결했습니다. 새68개 캐시의 전체 SHA 확인·16개 약712MiB 다운로드/52개 재사용은 성공했습니다. 기존 모든 버전은 유지하며 새 setuptools75.3.2를 고정합니다. 현재 두 새 환경의 오프라인 설치/pip check 후 실제 결과 비교 중이고 Python 전체90개 성공입니다. 최종 결과/앱 native 전환·Sidecar·새 PC 검증은 아직 미완료입니다.

새 PC에서 개발 Python/저장소 경로에 의존하지 않고 오프라인 worker가 실행돼야 합니다. 모델 자동 다운로드 금지·출처/해시·단계 진행/취소/복구·정량 품질 한계 안내를 유지합니다. Demucs 가중치의 연구용 안내와 모델 배포물 제외도 유지합니다.

현재는 공식 문서와 기존 고정 계획의 충돌만 확인했습니다. 새 런타임 다운로드/설치·새 ABI 의존성 확정·AI 정확도 회귀·독립 Sidecar/새 PC 실행은 모두 **미실행**입니다. AGENTS.md의 중요한 의존성/보안 문제 중단 규칙에 따라 기존3.10을 그대로 독립 배포하는 작업은 보류하고 전환 방향을 확인합니다. 이 검토는 Phase 6 완료를 뜻하지 않습니다.
