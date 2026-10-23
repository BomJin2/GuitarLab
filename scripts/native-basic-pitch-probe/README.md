# Basic Pitch 네이티브 실행 실험

2026-10-20 후속: 별도 Rust1.90.0으로 고정 lock의 모든 target check 컴파일을 실제29.27초에 통과했습니다. 기본1.98은 유지하며1.90에서 모델 추론/장치 검사는 미실행입니다. 아래 실제1.90 미실행 문구는 이 검증 이전 이력입니다. 고정 EGSet12 실제8개 입력/24출력의 보호 계약 비교도 최대 차이1.3113e-6로 통과했고, 원시 완전 무음 불일치/약1.99초 문맥·추가 검출 한계는 그대로입니다. `--public-egset12`는 검증 폴더의 고정 public-inputs.json/8개 SHA 입력만 읽습니다.

현재 기본 개발 후보는 tract-onnx0.22.3/prost0.11.9이며 kstring2.0.2를 Cargo.lock에 고정합니다. 전이 kstring2.0.5의 Rust 최소1.96을 확인해 공식 MIT OR Apache-2.0/Rust1.73/yanked=false인2.0.2로 고정했습니다. 전체141개 metadata에서 Rust1.90 초과 요구/외부 라이선스 누락이 없고 설치 Rust1.98에서 합성7개 보호 계약·경계3개·Clippy를 통과했습니다. 실제 Rust1.90 컴파일은 별도 toolchain이 없어 미실행입니다. 아래0.23.8 기록은 먼저 비교한 후보의 이력이며 제품 의존성에는 어느 쪽도 추가하지 않았습니다.

## 2026-10-20 후속: 정규화 원인과 입력 보호

`--inspect`는 검증 모델의 연산 이름만 새 nodes.json에 기록합니다. `--trace-normalization`은 같은 모델의 정규화10개 중간 연산을 출력으로 노출한 개발 전용 파생 모델/합성 입력/결과를 새 폴더에 만듭니다. 원본은 변경하지 않습니다. 이 결과는 `trace_normalization.py <새 폴더>`를 기존 Basic Pitch 가상환경의 `-I -B -X utf8` 모드로 실행해 비교합니다.

무음의 Log 입력은 동일하지만 기준 엔진 출력이1.90735e-6 범위로 갈리는 것을 관측했습니다. 이어 최솟값 차감의7.62939e-6 차이가 정규화 나눗셈에서0~1로 증폭됐습니다. 이는 퇴화 입력에서 반올림 차이를 증폭하는 현상이며 특정 라이브러리의 최적화 오류라고 단정하지 않습니다. 원시 출력 동등성 실패 이력은 유지합니다.

`--guarded`는 별도 입력 보호 계약을 검사합니다. DC 제거 후 RMS<-65dBFS는 NO_SIGNAL, 절댓값>=0.995인 샘플 비율>=0.1%는 CLIPPED로 보고 모델을 실행하지 않습니다. 비정상 길이/비유한/범위 밖 입력은 거부합니다. 기본5개 합성 입력에 DC·클리핑을 추가해7개를 사용하며 `verify.py`가 게이트 결정을 독립 계산합니다. 제외4개/유효3개(9출력)의 합성 계약이 통과했으나 실제 기타 추가 검출 해결이나 실시간 채점 수용은 아닙니다. 이 gate는 개발 도구에만 있고 제품 분석기/점수는 바꾸지 않았습니다.

제품과 분리된 개발 검사입니다. Tauri 의존성·MSRV·앱 데이터·실시간 콜백을 바꾸지 않습니다. 검증된 기존 ONNX 한 파일과 무음/440Hz 사인파(세 음량)/440+660Hz 합성 입력만 사용합니다. 개인 녹음/네트워크/추가 모델 다운로드를 사용하지 않습니다.

- `tract-onnx =0.23.8`: MIT OR Apache-2.0, Rust 최소1.91. 설치된 Rust1.98에서 검증하며 제품 최소1.90과 구분합니다.
- Cargo.lock으로 전이 버전을 고정합니다. crates.io metadata129개(개발 프로젝트 포함)에서 라이선스 미표기 외부 패키지는 없고 MIT/Apache 선택 및 Unicode/Zlib 등의 허용 조합을 확인했습니다. 제품 배포 선정/고지 완료를 의미하지 않습니다.
- ONNX SHA-256: `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec`,230,444바이트.
- 입력 `[1,43844,1]`/22,050Hz, 출력 `[1,172,88]` 두 개와 `[1,172,264]` 한 개. 약1.99초 입력 문맥이며 처리 속도를 스트리밍 반응 지연으로 바꾸어 해석하지 않습니다.
- 결과 폴더는 프로젝트 `src-tauri/target/runtime-validation/` 아래 새 UUID 폴더로 미리 만듭니다. 산출물은 `create_new`/`open('x')`만 사용해 기존 결과를 덮어쓰지 않습니다.

```powershell
cargo test --locked --release --manifest-path scripts/native-basic-pitch-probe/Cargo.toml --target-dir src-tauri/target/native-basic-pitch-probe
cargo run --locked --release --manifest-path scripts/native-basic-pitch-probe/Cargo.toml --target-dir src-tauri/target/native-basic-pitch-probe -- <검증된-기존-nmp.onnx> <새-결과-폴더>
& ai/.venv-basic-pitch/Scripts/python.exe -I -B -X utf8 scripts/native-basic-pitch-probe/verify.py <같은-모델> <같은-결과-폴더>
```

첫 명령은 합성 입력 경계 검사입니다. 실제 모델 호환성은 두 번째 실행의 성공/실패와 로그를 확인해야 합니다. 세 번째는 동일 float32 입력의 기존 ONNX Runtime 출력과 비교하며 허용 오차는 절대1e-4/상대1e-3입니다. 첫 추론과 후속3회 시간을 별도로 남기지만 실시간 안정성·실제 기타 품질 수용을 대신하지 않습니다. Ctrl+C로 개발 프로세스를 중단할 수 있으며 제품에서는 실행하지 않습니다.

최적화 영향 분리 시 두 번째 실행의 마지막 인자로 `--without-optimizations`를 추가하고 별도의 새 결과 폴더를 사용합니다. 2026-10-20 두 모드 모두 무음에서 최대 차이0.208934로 전체 비교 실패입니다. 나머지4개 합성 입력/각3출력은 허용 오차 내에서 일치했지만 이 부분 성공을 전체 통과로 바꾸지 않습니다. 무음 차이의 근본 원인은 미규명이며 제품 채택·실시간 채점 연결은 보류합니다.
