# 배포 고지 준비 자료

2026-10-20 기준 설치된 버전의 고지 원문을 수집한 **검토용 산출물**입니다. 최종 배포 허가·라이선스 의무 충족이나 전체 Phase8 완료를 의미하지 않습니다. 원문은 번역/수정하지 않고 바이트 그대로 보존합니다.

- [구성요소별 고지](THIRD_PARTY_NOTICES.md): npm 배포 의존성5개, Windows Rust normal/build 의존성273개, 폰트/음색2개와 번들 Python 고지1개, 총281개 항목입니다. 프론트 dev-only/설치하지 않은 모델 환경은 이 목록의 범위가 아닙니다.
- [지문·출처와 검토 상태](dependency-inventory.json): 각 고지의 SHA/크기와 해당되는 정확한 upstream Git commit/공식 URL을 보존합니다. 로컬 사용자/registry 절대 경로나 개인 음원/DB를 포함하지 않습니다.
- `notices/`: 중복을 내용SHA로 합친199개 원문 파일입니다. 생성 당시 모든 참조와 크기·지문을 재검사했습니다. 고지는 완성 실행 파일과 함께 제공하는 패키지에 연결할 예정이며 현재 실행 앱에 별도 고지 UI를 추가하지 않았습니다.
- [설치기 도구 고지](INSTALLER-TOOLS.json): 2026-10-21 추가한 NSIS3.11/zlib stub과 nsis-tauri-utils0.5.3의 원문·정확한 upstream commit/실제 바이너리 SHA입니다. 위 앱 의존성281개/원문199개와 별도 범위이며 추가 원문도 notices/에 보존합니다. Tauri CLI2.12.2가 공식 다운로드/지문 확인한 도구이고 플러그인의 workspace MIT or Apache-2.0 상속을 확인했습니다. 최초 단순 문자열 검사는 workspace 표기를 인식하지 못해 수정했습니다. 이 수집을 하위 vendor 전체 검토 완료로 간주하지 않습니다.

## 확인 범위와 남은 작업

2026-10-21 소스 접근 보완: [버전별 소스 안내](SOURCE-ACCESS.ko.md)와 [지문·원본 위치](SOURCE-ACCESS.json)를 추가했습니다. MPL-2.0 선언6개 중 Rust5개는 Cargo.lock 지문과 같은 원본 crate150,290바이트를 sources/에 보존했고 설치된 소스66파일과도 같습니다. alphaTab1.6.1은 npm 잠금 integrity와 일치하는 공식 메타데이터의 정확한 Git commit 트리를 확인해 연결합니다. alphaTab 전체 소스 archive는 동봉하지 않아 해당 링크는 인터넷이 필요합니다. 새 ZIP 생성은 이 안내/5개 archive를 함께 넣고 버전/경로·지문·전체 검토 미완료 상태를 검사합니다. 이전 ZIP/설치기를 소급 변경하지 않으며 selectors 고유 고지 부재·전체 최종 검토는 계속 미완료입니다.

설치한 alphaTab1.6.1의 MPL-2.0, React19.3.0/scheduler0.28.0의 MIT, Tauri API2.12.3의 Apache-2.0 OR MIT 선언과 동봉 원문을 수집했습니다. Cargo는 `--locked --offline --all-features --filter-platform x86_64-pc-windows-msvc` 그래프에서 normal/build만 추적했습니다. 선언 조건은 원문 그대로 기록하며 복수 조건 중 특정 조건을 자동 선택하지 않습니다.

로컬 crate에 원문이 없는8개 중7개는 각 배포본 `.cargo_vcs_info.json`의 정확한 commit/공식 저장소에서 보완했습니다. `selectors0.38.0`은 선언 MPL-2.0이지만 해당 commit 루트에도 원문이 없었으며 [upstream 이슈](https://github.com/servo/stylo/issues/317)에 같은 문제가 기록돼 있습니다. 표준 MPL-2.0 원문은 alphaTab 항목의 [변경 없는 원문](notices/de981130586154b6ce2cf91528b9291789192d62234d0d7e6e41d085b8e1d351.txt)에 이미 포함합니다. 이를 selectors 고유 고지가 수집됐다고 표시하지 않습니다. 배포 시 해당 소스를 수령자가 얻는 방법과 고지 유지도 확인해야 합니다. [Mozilla MPL2.0 3.1~3.4](https://www.mozilla.org/en-US/MPL/2.0/)

Bravura8개 파일과 SONiVOX4개 파일은 설치한 alphaTab1.6.1의 dist와 전부 바이트가 같음을 확인했습니다. Bravura의 OFL1.1/저작권자 고지와 SONiVOX 동봉 Apache 선언·README를 수집했고 실제 자산 SHA를 기록했습니다. alphaTab 배포자는 동봉 SONiVOX의 조건을 Apache로 안내합니다. [공식 설치 안내](https://www.alphatab.net/docs/getting-started/installation-web/)

CPython3.12.15 및 동봉 라이브러리의 기존14개 고지는 불변 runtime lock의 SHA/크기와 대조해 연결했습니다. 선택 다운로드 모델/가중치와 관리 가상환경은 이 패키지 수집 범위에 포함하지 않습니다. Demucs 연구용 안내·모델 배포 제외 및 사용자 opt-in은 [보안·라이선스 문서](../10-SECURITY-LICENSE.md)를 계속 따릅니다.

2026-10-21 사용자가 GuitarLab 자체 소스에 MIT를 선택했습니다. 루트 [LICENSE](../../LICENSE)와 npm/Rust/Python 메타데이터에 반영합니다. 제3자 원문·음원·폰트·모델 가중치의 조건을 MIT로 바꾸지 않습니다. 모델별 고지/소스 접근 안내·최종 패키지 포함·새PC 검증이 남아 `legalReviewCompleted:false`를 유지합니다.

## 재현

```powershell
pnpm list --prod --depth Infinity --json > src-tauri/target/runtime-validation/release-prod-dependencies.json
cargo metadata --locked --offline --all-features --filter-platform x86_64-pc-windows-msvc --format-version 1 --manifest-path src-tauri/Cargo.toml > src-tauri/target/runtime-validation/release-rust-metadata.json
```

`scripts/collect_release_inventory.py`는 위 두 JSON을 입력받아 새 UUID 폴더에만 씁니다. `--upstream-sources`는 로컬에 보존한 정확한 commit/URL·SHA 확인 영수증, `--include-assets`는 고정 alphaTab1.6.1 자산 비교, `--runtime-resources`는 검증한 runtime 리소스 폴더를 받습니다. 기본 동작에서 네트워크 요청·새 패키지 설치·사용자 데이터 읽기/쓰기는 없습니다. 원본 고지를 수신하는 별도 단계는 공개 공식 저장소의 문서만 읽고 코드를 실행하지 않습니다.
## 압축 악보 전처리 의존성 고지 추가 — 2026-10-22

fflate0.8.3 한 개를 정확한 버전으로 추가했습니다. 공식 버전의 ESM/브라우저 exports·TypeScript5.7+ 타입 수정과 MIT 원문을 확인했고 install script 없이 설치했습니다. [버전 package.json](https://github.com/101arrowz/fflate/blob/v0.8.3/package.json), [변경 이력](https://github.com/101arrowz/fflate/blob/v0.8.3/CHANGELOG.md), [원문 LICENSE](https://github.com/101arrowz/fflate/blob/v0.8.3/LICENSE).

전체 배포 목록은282개이며 새 원문1069바이트/SHA `0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551`를 notices/에 보존했습니다. 이전 npm 구성/버전 집합에 fflate만 추가됐음을 검증하고 npm 목록 SHA/THIRD_PARTY_NOTICES를 갱신했으며 Rust·자산·runtime/기존 고지·MPL6개 원본과 최종 검토 미완료 상태는 유지합니다. 아래281개는 이전 수집 이력입니다.

