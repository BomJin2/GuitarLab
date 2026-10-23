# 선택적 AI 개발 환경 계획

2026-10-18 두 모델 관리 설치 완료: Demucs 기존 wheel31개/모델2개를 전체 SHA 확인 후 앱 데이터 캐시로 복사하고 별도 UUID 환경에 오프라인 설치·실제4초 분리 후 활성화했습니다. 기존 Basic Pitch 환경을 보존하며 앱 설치 선택/실제 설치·재사용·취소를 검증했습니다. Demucs 네트워크 다운로드 UI·독립 Sidecar는 미구현입니다. Python3.10 지원 종료에 따른 배포 런타임 전환 검토는 ../../docs/18-AI-RUNTIME-MIGRATION.md를 따릅니다. 모델 가중치는 Git/앱 번들에 포함하지 않습니다. 아래 이전 관리 설치 미구현은 이력입니다.

2026-10-18 앱 설치 관리 갱신: Basic Pitch의 ‘설치 / 재검증’ 버튼을 제한된 native job에 연결했습니다. 기존41개 검증 캐시와 고정 setuptools bootstrap으로 오프라인 설치하며 실제 자체8음 분석 후만 활성화합니다. 기존 환경 재사용·취소 시 새 환경 정리/캐시 보존을 격리 실제 설치로 검증했습니다. 새 네트워크 다운로드는 없으며 Demucs 관리 설치와 독립 Sidecar는 미완료입니다. 아래 이전 앱 설치 미구현 설명은 당시 이력입니다.

이 폴더는 고정 버전·공식 다운로드 출처·SHA-256·용량을 기록합니다. manifest의 INSTALLATION_UNVERIFIED는 계획 단계 상태이며 실제 설치·실행 여부는 `../../docs/progress/PHASE-06.md`가 기준입니다. 앱 자동 설치 UI나 릴리스 번들 목록이 아닙니다.

2026-10-18: 앱에 별도 모델 환경의 ‘선택 모델 설치 확인’을 추가합니다. 고정 버전과 모델 파일 해시만 검사하며 파일 확인을 모델 실행/정확도 검증으로 표시하지 않습니다. 이 기능은 설치기·다운로드 기능이 아닙니다. 현재 PC의 실제 검사와 UI 수용 상태는 진행 문서가 기준입니다.

같은 날 두 모델의 실제 파일 확인 UI를 사용자 확인했습니다. 다음 별도 Basic Pitch 선택 다운로드 UI는 고정41개 wheel을 앱 데이터에 캐시하고 전체 해시/용량·취소/재시도를 처리합니다. 개발 가상환경을 바꾸거나 wheel을 설치/실행하지 않습니다. 현재 실제 전체 네트워크 다운로드 수용은 미실행이며 진행 문서의 최신 결과로 갱신합니다. Demucs 선택 다운로드는 아직 구현하지 않았습니다.

이후 사용자가 실제41개 다운로드 확인과 직접 설치를 요청했습니다. install_managed 도구로 앱 데이터 별도 환경에 오프라인 설치·pip check·모델/자체8음 검증·활성화 및 같은 환경 재사용을 확인했습니다. resampy의 암묵적 pkg_resources를 위해 현재 Python ensurepip 번들의 setuptools63.2.0(1,228,000바이트, MIT)을 bootstrap lock으로 고정했습니다. 추가 네트워크 다운로드는 없으며 기존41개 캐시/manifest와 두 개발 환경은 유지합니다. 앱 내 설치 버튼/독립 Sidecar는 미구현입니다. 앞선 수용 대기/설치 미구현은 당시 이력이며 최신 결과는 PHASE-06.md를 따릅니다.

## Basic Pitch

사용자가 승인한0.4.0/ONNX CPU 환경은 `.venv-basic-pitch`에 설치하고 자체8음 분석 및 실제 앱 복원까지 확인했습니다. 기존41개 wheel lock과 모델 무결성 검증을 유지합니다.

## Demucs 전체 기타 분리 연구 후보

| 항목           | 고정 계획                                                                       |
| -------------- | ------------------------------------------------------------------------------- |
| 환경           | Windows x64·Python3.10·별도 `.venv-demucs`                                      |
| 추론           | Demucs4.1.0·Torch2.8.0+cpu·NumPy1.26.4                                          |
| 패키지         | 31개 wheel·652,231,858바이트                                                    |
| 모델           | 공식 adefossez/HTDemucs-6s, revision `3c5ee475be622df764938de97e4281a7b07ffa58` |
| 가중치         | 5c90dfd2.safetensors·54,885,744바이트                                           |
| 모델 설정      | htdemucs_6s.yaml·21바이트                                                       |
| 합계           | 707,117,623바이트·674.36MiB                                                     |
| 필요 여유 공간 | 4GiB(캐시·설치 여유를 포함한 계획값, 별도 설치 크기는 아래 실측 기록 참조)      |
| 지원 후보      | drums/bass/other/vocals/guitar/piano, 전체 기타이며 Lead/Rhythm 미지원          |
| 현재 상태      | 사용자 승인 후 개발 설치·실제 자체 fixture 검증 완료, 재배포 허가 미확정        |

가중치 SHA-256은 `d2a1745f0744721f6b8ca5bf469b67c651ea5ed1b52998cab033b2158609d411`입니다. 공식 모델 저장소의 파일 메타데이터로 기록한 값이며 승인 후 실제 다운로드 파일과 대조해 일치했습니다.

`audio-separator`0.30.2의 필수 Windows diffq-fixed0.2.4가 CC-BY-NC-4.0이라 해당 조합을 제외했습니다. Demucs 추론 전용 계획은 학습/양자화 extras와 diffq를 포함하지 않습니다. 다만 **[저자가 가중치는 MIT 대상이 아니며 연구 용도로 제공한다고 안내](https://github.com/facebookresearch/demucs/issues/327)**했으므로 이 계획도 상용 제품 채택/재배포 허가가 아닙니다. 현재 모델 카드의 별도 상용 허가는 확인되지 않았습니다. 연구 검증을 하더라도 기존 Basic Pitch 승인과 별도로 동의를 받습니다.

lameenc의 LGPL-3.0-or-later 및 모든 wheel 내부 라이브러리/고지는 배포 전에 추가 검토합니다. sphn0.2.1의 PyPI 라이선스 필드가 없어 출시 시점 공식 커밋 `d67f408f41efb028ed5fcc0a4f8cd60ded7f1190`의 Apache-2.0 LICENSE를 출처로 기록했습니다. 기타 누락 필드도 해당 버전 공식 LICENSE/classifier로 보완했습니다. metadata 기반 버전/marker/wheel 태그 검사를 실제 pip 설치·런타임 호환성 검사로 대신하지 않습니다.

승인 후에는 목록의 파일만 받아 크기/전체 해시를 확인하고, 별도 환경에서 고정 lock을 offline/no-index/no-deps/require-hashes/only-binary로 설치해 `pip check`와 실제 자체 fixture 추론을 검사할 계획입니다. 자동 네트워크 모델 탐색이나 legacy `.th`/pickle 로드 폴백은 사용하지 않습니다. 현재 설치 스크립트와 분리 어댑터는 미구현입니다.

계획 회귀: `ai/.venv/Scripts/python.exe -m pytest ai/tests/test_separator_model_plan.py -q`. 모델이나 패키지를 다운로드하지 않고 의존성 폐쇄·버전·대상 태그·lock 일치·해시 형식/출처·용량·연구용 게이트를 검사합니다.

공식 근거: [Demucs4.1.0](https://pypi.org/project/demucs/4.1.0/), [추론 의존성](https://github.com/adefossez/demucs/blob/main/pyproject.toml), [모델 저장소](https://huggingface.co/adefossez/HTDemucs-6s), [PyTorch CPU index](https://download.pytorch.org/whl/cpu/torch/), [diffq-fixed](https://pypi.org/project/diffq-fixed/0.2.4/).

## 승인 설치·실행 결과 — 2026-10-17

사용자가 Demucs 사용을 요청해 고정31개 wheel과2개 모델 파일을 받았습니다. 크기/전체 해시가 일치하고 별도 환경의 offline/no-index/no-deps/require-hashes/only-binary 설치와 `pip check`를 통과했습니다. 설치 환경은 모델 포함3,411,866,320바이트(약3.18GiB)이고 wheel 캐시는652,231,858바이트입니다. 개발 작업용 설치/검사 스크립트와 영수증은 ignored target 아래에 있으며, 제품용 설치 UI/설치기는 미구현입니다. 위 미설치 계획 설명은 이력입니다.

`guitarlab_ai/separation/demucs.py`는 고정 패키지 버전/로컬 모델 무결성을 확인하고 허용 클래스만 로드합니다. 실제 자체4초 분리5.735초·socket connect/urlopen 차단 검사와 Rust→worker 출력 검증/취소/정리를 통과했습니다. 이는 OS 방화벽 검증이나 실제 기타 분리 품질 평가가 아닙니다. 모델/가상환경은 Git과 앱 번들에 포함하지 않습니다. manifest는 고정 계획으로 보존하고 실제 실행 상태는 진행 문서로 구분합니다.
