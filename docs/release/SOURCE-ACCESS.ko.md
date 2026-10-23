# MPL 구성요소 소스 접근 안내

2026-10-21 검토용 자료입니다. GuitarLab 자체 소스의 MIT 선택과 별개로 아래 외부 소스에는 MPL-2.0이 적용됩니다. 최종 배포 검토 완료를 의미하지 않습니다.

[Mozilla MPL-2.0 3.1~3.4](https://www.mozilla.org/en-US/MPL/2.0/)의 소스 접근·고지 보존 항목을 확인하기 위한 자료입니다. 기존 원문 고지는 THIRD_PARTY_NOTICES.md와 notices/에 보존하며 번역하거나 바꾸지 않습니다.

| 구성요소 | 버전 | 소스를 얻는 방법 |
| --- | --- | --- |
| cssparser | 0.37.0 | [동봉 원본 crate](sources/cssparser-0.37.0.crate) · [공식 동일 버전](https://static.crates.io/crates/cssparser/cssparser-0.37.0.crate) |
| cssparser-macros | 0.7.1 | [동봉 원본 crate](sources/cssparser-macros-0.7.1.crate) · [공식 동일 버전](https://static.crates.io/crates/cssparser-macros/cssparser-macros-0.7.1.crate) |
| dtoa-short | 0.3.5 | [동봉 원본 crate](sources/dtoa-short-0.3.5.crate) · [공식 동일 버전](https://static.crates.io/crates/dtoa-short/dtoa-short-0.3.5.crate) |
| option-ext | 0.2.0 | [동봉 원본 crate](sources/option-ext-0.2.0.crate) · [공식 동일 버전](https://static.crates.io/crates/option-ext/option-ext-0.2.0.crate) |
| selectors | 0.38.0 | [동봉 원본 crate](sources/selectors-0.38.0.crate) · [공식 동일 버전](https://static.crates.io/crates/selectors/selectors-0.38.0.crate) |
| @coderline/alphatab | 1.6.1 | [정확한 Git commit 소스](https://github.com/CoderLine/alphaTab/tree/4f78524781ce9441cba1267d45a983c6ac92b977) · 인터넷 필요 |

## 확인한 범위

Rust 5개의 원본 .crate는 Cargo.lock SHA256과 같으며 설치 registry 소스의 66개 파일이 해당 원본과 같습니다. 동봉 archive는 추출/수정하지 않았습니다. 정확한 출처·크기·SHA와 검토 상태는 [SOURCE-ACCESS.json](SOURCE-ACCESS.json)에 있습니다.

alphaTab은 공식 npm 1.6.1 메타데이터의 tarball integrity와 pnpm-lock이 같고 gitHead 4f78524781ce9441cba1267d45a983c6ac92b977의 공개 GitHub 트리를 확인했습니다. 위 링크는 이동하는 최신 브랜치가 아닌 이 commit입니다. 전체 alphaTab 소스 archive를 이 패키지에 동봉한 것은 아니며 소스를 얻으려면 인터넷이 필요합니다.

selectors 0.38.0의 원본 archive에는 별도 LICENSE 파일이 없어 그대로 보존합니다. 프로젝트가 해당 고지를 새로 만들어 upstream 원문이라고 표시하지 않습니다. 표준 MPL 원문은 [기존 동봉 원문](notices/de981130586154b6ce2cf91528b9291789192d62234d0d7e6e41d085b8e1d351.txt)에 있으며 upstream 고유 고지 부재는 별도 검토 사항입니다.

이는 해당 버전 원본을 찾는 경로와 지문 확인입니다. 최종 실행 파일의 전체 조건·가공물/하위 vendor·모델 가중치 조건을 모두 검토했다거나 수정 소스 제공 의무가 없다고 판단한 것이 아닙니다. 모델과 가중치는 동봉하지 않습니다. 별도 변경을 가하면 변경한 부분과 그 소스 제공도 다시 확인해야 합니다.
