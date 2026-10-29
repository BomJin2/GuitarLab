# Phase7 — 코드·고급 주법 판정

## 후속 — 긴 녹음 마지막 구간의 실제 UI 수용 (2026-10-29)

### 1. 작업 개요

완료일2026-10-29. 기존 긴 녹음 구간 분석의 실제 Windows UI 경계를 확인했습니다. **끝 구간의 무음 처리 수용 완료**이며 음정/주법 정답 정확도·고급 점수 및 Phase7 전체 완료는 아닙니다.

### 2. 구현 및 변경 사항

제품 코드는 바꾸지 않았습니다. d68487a 기반 고정 후보c80b9de0/기존 A 테이크를 유지했고 사용자에게600초이면 단음 음정 변화1초·시작599000ms로 분석을 요청했습니다. 변경 문서는 이번 Phase7 결과와 Phase4A/8·전체 진행/남은 작업입니다. 개인 오디오/DB를 agent가 읽지 않았으며 새로운 REC/입력·모델/네트워크 분석은 하지 않았습니다.

### 3. 테스트 결과

사용자는 ‘실험적 단음 궤적이며 정답 판정이 아닙니다’,‘깨끗한 단음 전용입니다…’,‘음정 변화만으로 벤딩·슬라이드·레가토를 구분하지 않습니다.점수에는 반영하지 않습니다’,‘음량이 너무 작거나 무음입니다’를 전달했습니다. 현재 표시 어댑터의 `LOW_LEVEL` 안내에 해당하며 **분석 결과/무음 보호 사용자 확인 성공**입니다. 시작/끝 시각·coverage/변화cents 수치는 별도로 전달받지 않아 만들지 않습니다. 선택 테이크는 직전115,200,058바이트 출력 수용과 연결하되 takeID/파일을 직접 조회하지 않습니다.

기존 자체600초 WAV 끝부분의 유음/무결성·경계/취소는 자동 검사로 확인했고 이번은 실제 사용자 녹음의 조용한 구간 UI 수용입니다. 문서만 바뀌므로 프론트/Rust/Python 전체 재실행은 **미실행(동일 제품 소스)**이며 d68487a의 전체 원격 성공을 유지합니다. 문서의 문자/LF·Git diff/Markdown 파싱은 별도 확인합니다.

### 4. 미구현 및 알려진 문제

실제 F0/주법 정확도·독립 정답·오검출 감점률은 **미실행/미완료**입니다. 무음 구간의 안내를 실제 연주 정답 성공으로 세지 않습니다. 요청한599초 구간의 실제 숫자 원문/전체 native 응답·성능/RSS는 추가 측정하지 않았습니다. 고급 실시간 점수는 비활성을 유지합니다.

### 5. 다음 작업 계획

수용/한계를 Git에 확정하고 고급 판정은 독립 참조가 확보된 뒤 재개합니다. 사용자 수동 확인을 같은 무음/기타 연주로 반복하지 않습니다. 사용자는 다음 독립 Phase8 범위를 ‘휴지통에 보관한 프로젝트만 영구 삭제·일반 프로젝트/외부 원본 보존·삭제 직전 별도 확인’으로 선택했습니다. 해당 계약과 자체 실패/중단·재시작 검증부터 진행하며 지금 사용자 자료를 삭제하지 않습니다.

## 후속 — 사후 구간 분석 작업 수명 (2026-10-27)

선택 녹음/파일 속성·분석 구간/방식이 바뀌거나 화면을 이탈하면 이전 실행/취소 명령과 결과·오류/진행을 재사용하지 않도록 보완했습니다. 시작값/방식 변경과 같은 이벤트의 이전 분석도 차단하며 실제 서비스 종료까지 중복 잠금을 유지합니다. 스펙트럼/단음 변화 알고리즘과 실시간 점수는 변경하지 않습니다. 변경 파일·재현10개 실패와 신규16개/대상26개 성공·미실행/후속 검증은 [Phase4A 첫 절](PHASE-04A.md)의5개 항목을 공동 작업 기록으로 따릅니다. fb7b0a6의 전체662프론트/원격 기본252·확장256Rust·AI113/도구143·MSRV와 독립 패키지/보안까지 성공을 확인했습니다. 독립 정답/실제 주법·오검출 감점 수용은 계속 미완료입니다.

## 후속 — 긴 녹음의 제한 메모리 구간 분석 (2026-10-25)

### 1. 작업 개요

완료일2026-10-25. 최대10분/256MiB 녹음의 끝부분도 기존400ms 스펙트럼/1초 음정 변화 진단에 사용할 수 있도록 분석 전용30초/16MiB 제한을 대체했습니다. 전체 파일 무결성 검사를 유지하면서 읽기 메모리를 제한하는 기능 슬라이스이며 실제 코드/주법 인식 정확도·전체 Phase7 완료는 아닙니다. 기존 사용자 녹음·앱은 건드리지 않았습니다.

### 2. 구현 및 변경 사항

- `storage/recording_window.rs`: 현재 소유권/보관 상태·READY/누락·불변 WAV 메타데이터를 확인한 뒤 같은 열린 파일의 정확한 헤더/길이·전체 SHA256을 검사합니다.64KiB 단위로 읽으며 필요한 최대1초의 f32만 수집하고 청크/최종 반환에서 취소를 확인합니다. 선택 구간 밖 변조도 거부합니다. 기존 전체 녹음 재생용 `recording_bytes`는 유지했습니다.
- `recording/wave.rs`: 기존 정규 헤더 생성만 내부 공유합니다. `judgement/recorded_pitches.rs`는 기존 녹음 한도/새 읽기를 재사용하고 DSP·판정 알고리즘은 유지합니다. 요청v1/스펙트럼 결과v1·궤적 결과v2/DB와 Python 계약 형식은 바꾸지 않았으며 구현 전에 docs/12에 확장 범위를 기록했습니다.
- `recordedPitches.ts`/`recordedPitchTrack.ts`: 최대 시작 시각600000ms·실제 남은400ms/1000ms·샘플레이트/파일 크기를 검증합니다. 패널은 전체 무결성 검사 후 선택 구간만 분석한다는 안내를 표시하고 핵심 읽기/분석을 UI에 넣지 않았습니다.
- native/프론트 회귀와 docs/05·09·17·로드맵/진행표·남은 작업을 갱신했습니다. 새 라이브러리/모델 설치나 개인 오디오 전송은 없습니다.

### 3. 테스트 결과

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features judgement::recorded_pitches -- --nocapture`: **7개 성공**,5.24초. 실제 자체 DEMO WAV는8kHz/4,800,000프레임·600초/19,200,058바이트이며 끝1초를130.8128Hz로 구성했습니다.599초의400ms/1초 분석·전체 해시/진행률·청크 및 마지막 취소·선택 구간 밖 손상·오래된 메타데이터/콜백 오류·잘못된 헤더/읽기 중 파일 증가 거부를 확인했습니다. 기존31초 거부 기대는 한도 확장에 맞춰 바꿨으며 길이가 다른 메타데이터는 계속 거부합니다.
- `pnpm typecheck`/대상 Vitest3파일: **14개 성공**,2.92초. 긴 녹음의 끝 경계/192kHz 바이트 한도·응답 디코딩을 확인했습니다. `pnpm lint`/`pnpm test`/`pnpm format:check`: **성공**,전체 **476개/103파일**,35.51초. Prettier 대상에서 제외된 Markdown/Python/Rust를 포맷했다고 주장하지 않습니다.
- `cargo fmt --check`/`cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: **성공**(Clippy6.77초). 전체 `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features`: **239개 성공/28개 기본 제외**,23.48초. 이 최종 검사에는64KiB 경계 양쪽을 걸치는8000샘플이 원본과 정확히 일치하는 추가 확인도 포함됩니다. `cargo +1.90.0 check --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features`: **성공**,8.75초.
- `pnpm build`: **성공**,Vite1분17초/기존 큰 chunk 경고 유지. 내장 `bundle_tests`: **3개 성공**,0.00초/컴파일10.82초. 기본 icon resource 조회 경고2회는 검사 문맥에서 유지하며 실제 창 아이콘은 확인하지 않았습니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **Windows 내장 빌드 성공**,11.43초/40,804,864바이트/SHA `27b59d5c20e3a528af9d5bfc0ce450dd80a8020e8588f4a648cda28b619b2140`. 기존 MSVC 링크 산출물 경고를 유지합니다.
- 로그는 `src-tauri/target/runtime-validation/long-take-frontend-20261025.log`, `long-take-rust-20261025.log`, `long-take-build-20261025.log`에 보존했습니다. 새 독립 ZIP/원격 CI·실제 앱/기타 입력/개인 장기 녹음 검사는 **미실행** — ZIP/원격은 다음 검증 단계이며 합성 임시 자료만 사용했습니다. Python/AI 코드는 변경하지 않았고 별도 로컬 전체 AI/도구 반복 검사는 미실행입니다.

후속 패키지 검사도 **완료**했습니다. source `0495a61bc4338e7d13a09f78a8f99a2e0ff0b327`의 `long-take-candidate-59484bb2-971f-4ff6-aaf9-468f834f91e7.json`은 **WINDOWS_BUILT_NOT_LAUNCHED**입니다. 기존 고정 runtime3393파일/64,095,466바이트와 lock SHA `191c1e801af4226a83ef2a3956a929470e7badc0a9c069766c10b74fb164aa2d`를 대조해 새 폴더에만 보존했습니다. ZIP `validation-packages/d04ec7da-8ae2-4a0c-92b1-f913fe5f8ebb/GuitarLab-validation.zip`은 **3613파일/40,199,906바이트·SHA `42081230a6cab417577b2358d710cda6b0242f496595355814a8631f7901d297`**입니다. 기존 `package_validation.py`/`verify_archive`의 전체 SHA·CRC/목록을 확인하고 같은 지문의 바이트를 새 `long-take-roundtrip-b3f4790d-c7ef-42f9-bd09-3ed5fb077e47`에 추출했습니다. 실제 `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File Test-ValidationPackage.ps1`은 **exit0**, 개발 경로 제외 후 독립 Python3.12.15/모델 미설치 점검 두 번도 성공했습니다. 영수증 `long-take-package-receipt-557b09e7-f1c2-4cec-b758-e7d96fa810bb.json`/로그 `long-take-package-check-73e1c193-a735-468b-b221-24ccef7fbbe7.log`를 보존합니다. 위 ZIP 미실행은 소스 커밋 당시 이력이며 실제 앱·기타/개인 자료·새 설치 검사는 계속 미실행입니다. generic portable-candidate/기존 후보는 변경하지 않았습니다.

### 4. 미구현 및 알려진 문제

무결성을 위해 최대256MiB 전체를 읽으므로 느린 디스크에서는 대기가 생깁니다. 선택 PCM 최대192000샘플/768000바이트와64KiB 버퍼는 **읽기 경로의 할당 상한**이며 분석기/전체 프로세스의 실측 최고 메모리가 아닙니다. 진행률은 읽은 전체 바이트입니다.400ms/1초의 후보 품질·배음/옥타브 한계와 기존 고급 점수 비활성은 그대로입니다. 일반 재생의 전체 파일 버퍼 정책은 이 변경 범위가 아닙니다.

### 5. 다음 작업 계획

코드/패키지 기록을 main `89bcf8e9d280be43bd0d3a33eb46799271dab7fb`까지 업로드했고 [Windows40123636305](https://github.com/BomJin2/GuitarLab/actions/runs/40123636305)/job120960317516는 **전체 success**입니다.476프론트/103파일·기본236개47.30초/확장239개42.01초(각28개 기본 제외)·예제1+1·AI113개5.77초·도구143개42.461초(제외 없음)·Clippy/MSRV1.90(12.56초)/사후 정리까지 통과했습니다. Python/AI를 변경하지 않았지만 원격 전체 검사에서도 회귀 없음을 확인했습니다. 최종 결과 문서는 중복 CI를 피하려고 로컬 커밋에 기록하고 다음 실제 변경 push에 함께 포함합니다.

제한 메모리 분석 슬라이스는 문서/패키지/원격까지 완료입니다. 실제 앱/장치 조작을 반복 요청하지 않습니다. 별도 Windows10/11·독립 정답/허위 감점률·검증된 특화 가중치가 필요한 남은 수용 조건은 유지하고 이 개선으로 전체 Phase7을 완료 표시하지 않습니다. 현재 없는 외부 조건을 합성 검사·같은 관측 자료의 재튜닝으로 대체하지 않습니다.

## 후속 — 골페 표기의 일반 피킹 채점 누락 보호 (2026-10-25)

### 1. 작업 개요

완료일2026-10-25. 기존 미지원 표기의 안전 처리 감사에서 골페 박자가 일반 피킹으로 통과하는3개 회귀를 재현하고 공통 조건 한 곳을 보완했습니다. 표기 보호의 구현/자동 검사·독립 패키지/문서화 슬라이스 완료이며 실제 골페 인식/점수·전체 Phase7 완료는 아닙니다. 사용자 기타 입력·녹음·프로젝트와 제품 DSP를 변경하지 않았습니다.

### 2. 구현 및 변경 사항

- 설치된 alphaTab1.6.1의 d.ts `Beat.golpe`/`GolpeType.None·Thumb·Finger` 및 실제 AlphaTex `glpf`/`glpt` 파서·GP7 exporter/importer를 확인했습니다. [공식1.4 도입 기록](https://alphatab.net/docs/releases/release1_4)의 표기 지원 설명을 참고하되 실제 호환성은 설치된1.6.1 코드/왕복으로 확인했습니다. 새 라이브러리/모델·다운로드는 없습니다.
- `alphaTabAdapter.ts`의 기존 `hasUnsupportedTechnique`에 `note.beat.golpe !== model.GolpeType.None` 조건 한 줄을 추가했습니다. normalize/구형 원본 metadata 복원과 반복 occurrence가 같은 경로를 재사용하며 기존 감점 제외/편집 소실 거부로 전달합니다.
- `alphaTabAdapter.test.ts`에 실제 두 파서 표기와 골페 반복/구형 복원 사례를 추가했습니다. 정상 인접 피킹·원본 GP 바이트·구형 JSON/ID·싱크 참조를 보존합니다. 구현 전에 docs/12의 기존 v1 계약 적용 범위를 기록했고 docs/05·09·로드맵/진행표를 갱신합니다. IPC/DB·판정 버전/기존 기록은 바꾸지 않습니다.

### 3. 테스트 결과

- 수정 전 `pnpm exec vitest run src/features/score/alphaTabAdapter.test.ts`: **3실패/23성공**,2.84초. 손가락/엄지 표기 두 경우와 반복 구형 복원에서 `UNSUPPORTED`가 누락됐습니다. 원래 실패 로그 `runtime-validation/golpe-before-20261025.log`를 보존합니다.
- 공통 조건 수정 후 `pnpm typecheck`/`pnpm lint`/`pnpm test`/`pnpm format:check`: **성공**,전체 **474개/103파일**,41.55초. 실제 파서/GP7 왕복·내부 JSON과 편집 거부·반복/구형 복원 회귀가 포함됩니다. 결과 `golpe-after-20261025.log`를 보존합니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features unsupported -- --nocapture`: **6개 성공**,0.64초. 미지원 onset의 인접 음 누출 방지/동시음·감점 제외/중단 우선·시도 재열기/원본 metadata 보존5개와 같은 검색어의 mixer 경계1개입니다. Rust 코드는 이 슬라이스에서 변경하지 않았으며 전체 native 반복 검사는 **미실행**입니다. 직전210ee8b 보완의 로컬237개/Clippy/MSRV 성공과 ef9d343의 전체 원격 성공은 Phase8을 따릅니다.
- `pnpm build`: **성공**,Vite1분30초/기존 큰 chunk 경고 유지. `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features bundle_tests -- --nocapture`: **내장3개 성공**,0.01초/컴파일12.94초. 내장 문맥 검사에서 기본 icon resource 조회 경고2회가 출력됐으며 실제 제품 창 아이콘 확인은 미실행입니다. `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **Windows 내장 빌드 성공**,12.86초/40,792,064바이트·SHA `af244e7b55ec49115567b6bd4195f3dfe7ed286c47046af7cd8780c89d0274b8`입니다. MSVC 링크 산출물 안내 경고는 유지합니다.
- `scripts/package_validation.py`/기존 `verify_archive`·동일 바이트 새 폴더 추출과 실제 Windows PowerShell5.1 `-File Test-ValidationPackage.ps1`: **전체3613파일 지문/CRC·독립Python3.12.15 두 번 exit0 성공**. source66be01d 후보 `golpe-support-candidate-cd6c1905-d8ae-4705-b4a9-aa2c5782a9e6.json`은 앱 미실행 상태이며 generic portable-candidate/이전 앱 영수증을 바꾸지 않았습니다. 새 ZIP `validation-packages/24cff694-6a95-4819-9714-0f88b18a1b3e/GuitarLab-validation.zip`은40,188,876바이트/SHA `6605d44100a1a979344f3a802647a3068dbae7b87121a6c776edc6affc50231d`입니다. `golpe-package-receipt-d7eb163b-2932-4f0a-8972-497775e622c9.json`/추출본 `golpe-roundtrip-65d69de5-bf0d-48b5-bc6f-dc2f921420f4/GuitarLab`에 검사를 보존했습니다. 보관 용량의 최종 반환 경계 보완도 같은 실행 파일에 포함됩니다.
- 실제 기타/수동 골페 연주·앱 재실행/사용자 자료 변경은 **미실행** — 표기 보호의 자동 검사이며 주법 검출 실험이 아닙니다. 현재 제품 DSP/원본·데이터를 바꾸지 않았습니다.

### 4. 미구현 및 알려진 문제

악보에 표기되지 않은 몸통 타격을 입력에서 검출하지 못합니다. 이 변경은 명시된 미지원 표기의 안전 처리이며 모든 기타 주법/모든 악보 형식 지원이나 실제 허위 감점률 수용을 보장하지 않습니다. pYIN/배음 교정 미채택·고급 실시간 점수 비활성·독립적인 연속 정답 필요성을 유지합니다.

### 5. 다음 작업 계획

66be01d와 패키지 기록을 포함한 main b56ee1b의 [Windows40120378119](https://github.com/BomJin2/GuitarLab/actions/runs/40120378119)/job120950419156는 **전체 success**입니다.474프론트/103파일·기본234개48.07초/확장237개40.10초(각28개 기본 제외)·예제1+1·AI113개2.34초·도구143개50.146초·Clippy/MSRV/캐시·정리까지 통과해 이 슬라이스의 원격 수용도 확정했습니다. 새 앱/실제 연주·새 설치 수용으로 확대하지 않습니다.

수동 기타 확인을 반복 요청하지 않고 별도 Windows10/11·특화 가중치/실제 고급 품질처럼 현재 외부 조건이 없는 항목은 완료로 바꾸지 않습니다. 현재 보호/패키지 슬라이스는 완료이며 실제 고급 점수 수용은 독립 참조/허위 감점률 근거 전까지 보류합니다. 다음 실제 변경에서 이번 결과 확정의 로컬 문서 커밋을 함께 업로드합니다.

## 후속 — pYIN 오프라인 비교 완료·제품 미채택 (2026-10-25)

### 1. 작업 개요

완료일 2026-10-25. 이미 관측한 공개 GuitarSet 두 묶음에서 기존 native YIN과 librosa pYIN을 비교하는 개발 전용 슬라이스를 완료했습니다. 독립 정답 평가나 실시간 엔진 교체가 아니며 **전체 Phase7·고급 채점 품질 수용은 미완료**입니다. 사용자 입력·녹음·프로젝트와 제품 DSP는 변경하지 않았습니다.

### 2. 구현 및 변경 사항

- `scripts/benchmark_pyin_observed.py`와 대상 테스트를 추가했습니다. 고정 공개 입력 5개 SHA/경로·크기·파라미터·버전, 각 91창/3458점, 원본 전후 보존과 실패/취소의 새 UUID 기록을 검사합니다. 네트워크 호출을 차단하고 자체 DEMO 후 소스를 고정한 뒤 공개 파형을 분석했습니다.
- 기존 개발 환경 Python3.10.8/librosa0.11.0·NumPy1.26.4·SciPy1.15.3·Numba0.68.0을 사용했습니다. 새 설치/다운로드·제품 의존성 추가는 없습니다. [설치 버전 공식 pYIN API](https://librosa.org/doc/0.11.0/generated/librosa.pyin.html)의 기본값과 고정 fmin70/fmax1500·center=false를 사용하며 `voicedProbability`를 native 주기성/정답 확률로 대체하지 않습니다.
- 원래 1초/44.1kHz PCM의 DC 제거·3표본 평균/f32, 14.7kHz/1024점/hop367과 공통 저음량·클리핑·음역 게이트를 유지했습니다. 원시 F0/발음 여부·확률과 게이트 후 후보를 별도로 남겼습니다. Viterbi는 이후 프레임을 사용하므로 스트리밍과 동등하지 않습니다.
- 계약을 먼저 `docs/12`에 기록했고 로드맵/검사 전략·진행표/남은 작업을 갱신했습니다. IPC/DB/UI·Rust 검출기 SHA `98c6258fc339d97fed1500e829415e88ff8c8a87a4d8aa903b1f8330e0d75b33`는 불변입니다.

### 3. 테스트 결과

- `ai/.venv/Scripts/python.exe -B -X utf8 -m unittest discover -s scripts -p test_benchmark_pyin_observed.py`: **5개 성공**, 0.166초. 전처리/분모·미검출/확률 분리/잘못된 입력·지문/취소·실패와 네트워크 함수 복원을 검사했습니다. 번들 Python3.12.15의 같은 5개도 **성공**, 0.140초입니다.
- 일반 Windows에서 `ai/.venv/Scripts/python.exe -B -X utf8 -m unittest discover -s scripts -p 'test_*.py'`: **143개 수행·142성공/링크권한 1개 제외**, 11.742초. 로그 `runtime-validation/pyin-baseline-143-tests-20261025.log`를 보존했습니다.
- 합성 C3 DEMO는 38/38개 후보·최대 7.508cents 오차로 **성공**했습니다. 첫 cold import/JIT는 32.165초, 실제 비교의 warm import/첫 호출은 4.958초였으며 실시간 지연이 아닙니다.
- 실제 명령 `ai/.venv-basic-pitch/Scripts/python.exe -B -X utf8 scripts/benchmark_pyin_observed.py src-tauri/target/runtime-validation/pyin-baseline-ba548fb3-0ded-4eea-89a4-6a0db5fb03d6/plan.json`: **완료**, 원본/계획·제품 소스 전후 일치. 결과 조회 전에 계획 SHA `7d7de359832b6ae771267cd60684c6f248f69f53c3787d23d374dc75415c83b6`와 도구 SHA `f60155191a9bc058437f22a1088f3aeef46507713ad5d0fddfc4f78a76e3f547`, librosa pitch.py SHA `f45cc429f9daa2276d750fa4f100641eae45991daf6e70050073088b86516b87`를 고정했습니다.

| 동일 분모/관측 | 기존 묶음 | 추가 묶음 |
|---|---:|---:|
| 창/전체 지점 |91/3458|91/3458|
| 단음/주석상 무음/불확실/다성 |838/474/1374/772|1426/931/981/120|
| 단음 50cents 이내 기존→pYIN |629→701|1181→1324|
| 단음 미검출 기존→pYIN |161→15|185→27|
| 새 적중/기존 적중 상실 |94/22|154/11|
| 주석상 무음 후보 기존→pYIN |118→372|121→245|

결과는 같은 폴더의 `pyin-observations-a95a74d8-8c89-421c-b3e2-8a82e8db5ed8.json`(SHA `d5ff2d573f8176ea3dc3db44f857dd40671ee8d15c33b851183d7ad99dabe63e`)에 모든 지점을 남겼습니다. 사후 문맥 감사 `pyin-audit-b8dc4df0-d599-44f5-8505-fb36e45612fd.json`에서 17개 참조가 모두 같은 단음인 문맥의 새 적중은 37/46, 기존 적중 상실은 11/6개였습니다. 주석상 무음의 새 후보는 255/128개이며 그중 17개 참조가 모두 무음인 문맥은 166/78개입니다. 기존 단음 미검출에서 새 잘못된 음정은 74/36개였습니다. 문맥 분류는 자동 주석의 사후 분석이며 실제 오채점률이 아닙니다.

각 1초창의 오프라인 추론+비교 시간은 기존 묶음 중앙값0.916초/p95 0.960초, 추가 묶음0.919초/p95 0.974초입니다. native DSP 비용과 측정 구간이 달라 실시간 비용비/왕복 지연으로 비교하지 않습니다.

초기 단위 테스트의 미검출 기대값은 다성 지점까지 단음 미검출에 포함한 오류여서 2→1로 수정했습니다. 도구의 집계/기준은 변경하지 않았습니다. 첫 사후 감사는 상대 root 경로가 안전 경로 검사에 거부됐고 절대 root로 같은 읽기 전용 감사를 실행했습니다. 원래 관측/소스는 재작성하지 않았습니다.

프론트 타입/빌드·Rust·실제 기타/앱 재실행: **미실행** — 개발 도구/문서만 추가했으며 제품 변경이 없습니다. 직전 8e6e7fa의 466프론트·230/233Rust·AI113/도구138·MSRV/격리 설치 원격 성공은 Phase8을 따릅니다. 새 도구의 원격 검사는 업로드 후 별도로 확인합니다.

### 4. 미구현 및 알려진 문제

같은 자동 주석/이미 관측한 자료의 비교이며 독립 수작업 정답이 아닙니다. 적중/coverage 증가에도 기존 적중 33개 상실과 무음 후보 증가가 있어 **제품 미채택**입니다. 확률 보정·실시간 연산·장치 지연/허위 감점률은 미검증이며 같은 자료에 확률 문턱을 맞춰 채택하지 않습니다. 모델 학습 split/음표 창 문맥·주석 오류의 한계도 유지합니다.

### 5. 다음 작업 계획

도구/기록을 Git에 반영하고 새 원격 회귀를 확인합니다. Phase7의 독립적인 연속 참조·확률/비용 검증 조건을 유지하며 고급 점수를 활성화하지 않습니다. 독립 진행 가능한 Phase8 데이터 보호의 남은 범위를 확인하고 실제 사용자 자료의 삭제/교체 없이 합성 임시 자료부터 검증합니다.

## 후속 — 새 표본의 배음 교정 기각/감사 도구 (2026-10-24)

### 1. 작업 개요

완료일2026-10-24. 사후 가설을 제품 밖에서 사전 고정/검증·기각하는 슬라이스를 완료했습니다. **후보 제품 미적용/전체Phase7 미완료**이며 꾸밈음 보호 앱 PID34928/PTY81995·사용자DB/입력/REC는 유지했습니다.

### 2. 구현 및 변경 사항

docs/12에 먼저 등록한 후보는 원래 잔차0.15 보존,실패한 경우에만 잔차0.4와 Hann 홀수/짝수power비≥0.04를 요구합니다. runtime-validation/goertzel-candidate-0004f82b-0b2a-4fca-b5bb-dd8e2d892717에 방법/소스·기각 조건·순수Matcher/IPC/기존DSP tests·실행 파일/실패 로그를 보존했습니다. 제품DSP SHA98c6258f…는 불변이며 candidate.rs SHA **340db96b37e928e773e2d86dd8b8475c82617660e2ba7672b91edc64b832392e**,probe-frozen.exe SHA **8930b24c538a1997b70171609a5d49f1de59911bc9a74de1c0b8877395a0e5c0**입니다.

음원/결과 수신 전 고른02_BN1-129-Eb_solo·03_Jazz1-130-D_solo·04_Rock1-130-A_solo·05_Funk1-114-Ab_solo만 공식CC BY4.0 ZIP에서 받았습니다. 수신5,751,210바이트/원본8개10,100,340바이트·CRC/개별SHA·저자/출처를 보존했고 전체ZIP MD5는 미검증입니다. 원본은 fixtures/external/guitarset-v1.1.0/d4896e4b-86f7-4572-8e01-057eb154f9f7,manifest SHA **e9fbbd255bb16c277698b26191b6557e5d7792f83c9e39f4651f7e0e5e689b04**입니다. 앱/배포물/Git에 넣지 않습니다.

scripts/audit_octave_candidate.py·test_audit_octave_candidate.py는 추론 없이 전 지점/누락/무음·불확실·다성을 재집계합니다. 기존 경로/중복JSON키 검사를 재사용하고 SHA·분모/순서·Boolean/NaN·합계/상태를 검증하며 실패/취소도 새UUID에 기록합니다. 네트워크/외부 실행·개인 오디오를 사용하지 않습니다. docs/09·08·진행 문서도 갱신했습니다.

### 3. 테스트 결과

- 별도 `cargo test --locked --offline --manifest-path src-tauri/target/runtime-validation/goertzel-candidate-0004f82b-0b2a-4fca-b5bb-dd8e2d892717/Cargo.toml --target-dir src-tauri/target`: **24개 성공**,포맷 전10.09초/후10.19초. 양쪽 기존DSP10개씩·IPC1개·계수/잘못된 입력/6샘플레이트 합성3개입니다. 실제Matcher를 사용하는 미확정 타격 회귀도 포함합니다.
- Goertzel/직접Hann **687창 일치**: 최대 계수차2.97e-15/power비차2.40e-14,허용1e-8 이내. 기존3458점/단음838점은629적중 유지·퇴행0/개선0이며 변경3개는 다성 창입니다. controls-8f99592a…에 보존했습니다. AGPT337이벤트 baseline 시각/음정/주기성이 원래 native JSON과 완전 일치했고 미확정94→94/타격·방출 시각·하모닉스 출력은 불변입니다. 후보의 조건부 팜뮤트4변경은 독립 정답이 아니며 agpt-exact-7cf1aca3…에 기록했습니다.
- 새 자료는 continuous-note-mask-v1 그대로91창/3458점·단음1426/무음931/불확실981/다성120을 후보 출력 조회 전에 고정했습니다. 단음 적중1181→1182/누락185→180/기존 적중 퇴행0이지만 **누락→잘못된 단음4·불확실 새 후보1·무음 새 후보1**로 사전 기준 **REJECTED_HELDOUT_REGRESSION**입니다. heldout-results-f4ca9dd9… SHA **88fe72b8bcde5b2b30366487aafebf4bfdc2f75c38dd90d6aa954c0dd0a6812c**,감사6f2367d4… SHA **d85313b30832ddc55a0e270b9f0aa1a6a86b4348da26f6b97ab5319a116cb45b**가 같은 분모/기각을 재현했습니다.
- 감사 대상5개/0.086초·번들Python3.12.15 대상5개/0.040초 성공. 전체 `python -B -X utf8 -m unittest discover -s scripts -p 'test_*.py'`: 일반Windows **133개 수행132성공/링크권한1제외**,8.903초. 최초 제한 환경의 전체11오류/번들3오류는 Temp/rename 권한 문제였고 동일 검사를 일반Windows에서 통과했습니다.
- 최초 Tauri rlib 연결은 일반Windows에서도 CRT 링크에 실패해 로그를 보존하고 실제Matcher/IPC의 순수 코드만 사용했습니다. 임시CRT 지정은 채택하지 않았습니다. 하이픈 파일명 import 오류는 명시적 파일 로딩으로 수정했고 후보/기준은 불변입니다. 최초 다운로드 호출은 승인 검토 사용량 한도로 미실행이었고 재개 후 같은 승인 절차로 수신했습니다.
- p95비용 수용/제품 재빌드·프론트 타입 검사/실장치·실시간 점수: **미실행** — 품질 기각으로 비용/채택 단계에 들어가지 않았고 제품 코드는 불변입니다. CLI 소요를 DSP p95로 기록하지 않습니다. 직전d16a2cb의 전체 원격 성공은 PHASE-08을 따릅니다.

### 4. 미구현 및 알려진 문제

새 파일도 같은 코퍼스의 자동 주석이므로 독립 수작업 정답 수용은 아닙니다. 중심 참조/전체 창 문맥 차이를 이유로 사전 무음 기각 조건을 완화하지 않습니다. 높은 주기성도 정답을 보장하지 않습니다. 이제 관측한4파일에 수치를 맞춰 독립 평가로 재사용하지 않습니다. 실제 코드/주법·허위 감점률 수용은 미완료입니다.

### 5. 다음 작업 계획

기존 제품 검출기/고급 점수 비활성·보류를 유지합니다. 같은 후보 재튜닝 대신 반례/자료·소스 지문을 보존하고133개 후속 업로드/원격 회귀를 확인합니다. 독립적으로 진행 가능한 Phase8 배포·고지/데이터 보호 검증을 계속하며 별도Windows/모델·실장치 수용을 임의로 완료 처리하지 않습니다.

## 후속 — 옥타브 후보의 배음 증거 관측 도구 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 기각한 잔차 비율0.4를 다시 적용하지 않고 기존 신호의 배음 계수를 별도로 관측했습니다. 도구/고정 분모·교차Python 재현 슬라이스 완료이며 새로운 기본음 교정 규칙이나 실제 점수/품질 수용은 아닙니다. 앱 PID34928/PTY81995·제품 DSP를 유지했습니다.

### 2. 구현 및 변경 사항

- scripts/audit_harmonic_evidence.py·test_audit_harmonic_evidence.py: 기존 읽기/PCM·17지점 문맥 검사를 재사용하고 전체1초 DC 제거/3표본 평균·4표본f32 누적 평균을 재구성합니다. baseline 관측 주파수의0.5/1/1.5/2/2.5/3배 Hann 계수와 홀수/짝수 계열 power비만 기록합니다. 기본음/성부·확률/새 confidence를 추정하지 않습니다.
- docs/12에 측정 전 정책을 기록하고 harmonic-evidence-c38e3f0a-190f-4257-a6bd-76ce968d702b/plan.json에5개 입력경로/크기/고정SHA·계수 목록·분모·threshold=null을 먼저 고정했습니다. 공개 자료/제품DSP 외 경로·변조/잘못된 입력은 거부하고 실패/취소의 새 상태 JSON·기존 자료를 보존합니다. 새 라이브러리/모델·네트워크 분석/제품 음정 변경은 없습니다.
- 원래 GuitarSet3458점/단일 중심 참조838점 전체를 보존하고 후보677개/미검출161개,기존50cents 안629개/초과48개를 분리합니다. AGPT의 이전 가설 변경10곳(팜뮤트4/하모닉스6)은 별도로 관측하며 이전 candidate의 값은 정답으로 쓰지 않습니다.

### 3. 테스트 결과

- 최초 합성/경로4개 **성공**,0.109초; f32 상쇄 순서/계획 불변·실패/취소 보강 후 대상 **5개 성공**,0.112초. 합성375Hz 및187.5/562.5Hz의 알려진 계수·일반/강한2차 배음·DC/유효 창·NaN/잘못된 입력·허용 경로/SHA/임계값 거부·원본 보존을 검사했습니다.
- 전체 도구 `python -B -X utf8 -m unittest discover -s scripts -p 'test_*.py'`: **128개 수행/127성공·링크권한1제외**,10.129초. 번들Python3.12.15 대상 **5개 성공**,0.073초. 일반 Windows의 자체 DEMO만 사용했습니다.
- 실제 CLI `scripts/audit_harmonic_evidence.py src-tauri/target/runtime-validation/harmonic-evidence-c38e3f0a-190f-4257-a6bd-76ce968d702b/plan.json`: 개발3.10.8/번들3.12.15에서 **모두 성공**. 3458/838/677/161/629/48 분모와 원본/주석·파생파일/제품DSP SHA를 유지했습니다. 새 파생677개+AGPT10개를 관측했고 교정/분류는 하지 않았습니다.
- 첫 결과 harmonic-observations-da1be431… SHA **41668d4833fdc831395a86be381ee621b33c70b8bb16f8608d7c8f927a530088**,번들81be3b6e… SHA **faf3cec9988c0ad9bd07e815e7fe5c72f583d4d108dbc99982920b3edd4dc8cf**입니다. cross-python-6d8dac0d…의687곳/모든6계수·비율은 최대차 **4.55e-13**으로1e-9 허용 안에서 일치했습니다. 파일은 등록 계획과 같은 폴더에 보존합니다.
- 홀수/짝수 power비:기존 적중629개 -64.33~-14.86dB/중앙 -35.71dB,초과48개 -43.39~-9.72dB/중앙 -26.46dB로 분포가 겹칩니다. 전체 창 단음 문맥은 각각485/18개이며 나머지 후보에는 불확실/음정 전환/다성 문맥이 포함됩니다. 이전 비율 가설이 퇴행시킨10개는 -31.92~-14.86dB였습니다. 팜뮤트4곳은 -13.83~-13.02dB였으나 작은 기존 표본의 분리/차이를 일반화 성능으로 해석하지 않습니다.
- 최초 사후 집계는 이전 candidate가 미검출(null)로 변한 사례를 숫자로 뺄 수 없어 TypeError였습니다. 도구 측정은 성공 상태였고 집계에서 null도 퇴행으로 포함해 이전10개를 재확인했습니다. 제품/측정 기준은 바꾸지 않았습니다.
- 프론트/Rust·Windows 재빌드/실장치: **미실행** — 개발 도구/문서만 추가했고 제품DSP/현재 앱은 그대로입니다. 최신1bbeb5d의466개 원격 성공은 PHASE-08을 따르며 새 도구는 후속 원격 대상입니다.

### 4. 미구현 및 알려진 문제

계수는 기본음/실제 성부·confidence 정답이 아닙니다. 표본/문맥을 이미 본 사후 분석이며 기타 녹음별 다른 샘플레이트/물리 창 길이의 차이도 있습니다. 어떤 새 경계가 안전한지 독립 자료 없이 판단하지 않고, 같은4개에 맞춘 수치 조정/제품 적용을 하지 않았습니다.

### 5. 다음 작업 계획

[공식 GuitarSet 설명](https://guitarset.weebly.com/)의6연주자 구성·[알려진 주석 오류](https://github.com/marl/GuitarSet#nb-see-open-issues-for-known-errors)를 확인했습니다. 기존00/01과 다른02_BN1-129-Eb_solo·03_Jazz1-130-D_solo·04_Rock1-130-A_solo·05_Funk1-114-Ab_solo를 결과/음원 수신 전에 고정했습니다. 공식metadata/주석목록33666바이트만 조회했고 heldout-selection.json의 audioDownloaded/thresholdRegistered=false입니다. 다음은 후보/기각 기준을 먼저 등록하고 별도 새UUID에 이4개만 받아 대조하는 단계입니다. 새 모델/개인 입력·고급 점수 활성화는 없습니다.

## 후속 — 명시적 꾸밈음의 일반 피킹 채점/편집 소실 방지 (2026-10-24)

### 1. 작업 개요

작업일2026-10-24. 장식음 후속의 같은 경계에서 on-beat·마디 안 before-beat grace가 일반 피킹으로 통과하는2개 회귀를 재현했습니다. 코드/자동 검증 완료이며 Windows 적용은 다음 확정 절에 기록합니다. 실제 꾸밈음 인식/전체 Phase7은 미완료입니다.

### 2. 구현 및 변경 사항

alphaTabAdapter.ts에 Beat.graceType!==None 조건1개를 추가했습니다. alphaTabAdapter.test.ts는 on-beat 실제 파서/GP왕복 사례와 내부 before-beat의840tick·구형 원본/ID/앵커·편집 거부/GP원본 불변을 추가했습니다. 첫 마디 전 음수 -120tick의 기존 도메인 거부도 확인합니다. 이미 적용한 장식음 보호/원본·일반 음표/PCM·입력/REC/DB/IPC는 유지합니다. docs/12 계약을 먼저 기록하고 docs/04·05·09 및 진행 문서를 갱신했습니다.

### 3. 테스트 결과

- 변경 전 실제 파서 **23개 중2개 실패/21개 성공**,on-beat와 내부 before-beat의 미지원 누락을 재현했습니다. 음수 시작 거부는 기존대로 성공했습니다.
- 조건1개 추가 후 관련 alphaTabAdapter/scoreJson/practice **30개 성공**,2.64초. GP7 binary 실제 왕복·원본/구형metadata 보존을 포함합니다.
- `pnpm typecheck`·`pnpm lint`·`pnpm test`: **성공**,전체466개/103파일·28.21초. `pnpm build`: **성공**,74초/176모듈·기존500kB 청크 경고. `pnpm format:check`: **성공**.
- native 감점 제외6개는 직전 장식음 후속0.60초 성공 결과를 재사용해 **재실행 미실행**입니다. 같은 UNSUPPORTED 계약의 프론트 조건뿐이며 새 내장 검사/Windows 빌드·패키지/적용은 다음입니다. 실제 꾸밈음 연주·독립 주법 정답/점수 품질은 **미실행**입니다.

### 4. 미구현 및 알려진 문제

첫 마디 앞의 음수 시작 before-beat는 지원하지 않고 기존 도메인에서 거부합니다. 원래 시각을0으로 바꿔 수용하거나 음표를 몰래 지우지 않습니다. 과거 정규화 편집에서 잃은 grace 표기는 추측해 복원하지 않습니다. 마디 안 유효 시각 grace의 보류가 실제 PCM에서 꾸밈음을 검출한다는 의미는 아닙니다.

### 5. 다음 작업 계획

새 내장/Windows·독립 패키지를 검증해 기존 정상 종료 경로로 적용하고 DB내용 보존을 확인합니다. 같은 수동 검사를 반복 요청하지 않고 원격466개를 확인합니다. 실제 주법 품질/특화 가중치·새 Windows의 외부 제약은 유지합니다.

### Windows·독립 패키지 적용 확정

구현 커밋 **b6a14fa**의 custom-protocol 내장 검사 **3개/0.01초 성공**(컴파일12.97초) 및 고정 설정의 Windows debug/no-bundle 빌드 **15.80초 성공**입니다. EXE40,689,152바이트/SHA **fdb463871ddf767570803cb91a225babadbe914cc9bbe76303fa69d3d7eaf8a4**를 새 portable/grace-support-76176131-5880-4616-9072-6247bfd5954f에 보존했습니다. 기존 identifier/MSVC 출력 경고 외 오류는 없습니다. 원본/복사 runtime3393개·64,095,466바이트를 고정lock과 대조했습니다.

새 ZIP f05eb312…/3613파일·40,165,715바이트/SHA **aa0b7400071a73bc96b03cde49b82b4f32c55a2ab4271fb7e85610a39f7545ff**를 전체지문/CRC·새추출 후 실제 PowerShell5.1의 전체 파일과 개발 PATH 없는 독립Python3.12.15 두 번 실행까지 **exit0**으로 확인했습니다. grace-package-roundtrip.json에 성공을 기록했습니다.

이전 PID32076/PTY61414는 CloseMainWindow 정상 종료 **exit0/forced=false**였습니다. 새 **PID34928/PTY81995·‘GuitarLab · 꾸밈음 보호’**가 READY/응답 중이며 입력/REC를 자동 시작하지 않았습니다. 읽기 전용 snapshot/시작 후 **DB9/15사용자테이블의 전체 행 지문 동일**을 grace-startup-data-comparison.json에 보존했습니다. 실제 DB를 복원하지 않았고 grace-support-candidate.json/현재 portable-candidate.json과 이전 포인터·앱을 보존했습니다.

이 보호 슬라이스/문서화는 완료입니다. 실제 사용자 grace import/연주·고급 점수 품질/새 Windows 수용은 **미실행**이며 파서/실행/데이터 보존 자동 검사와 구분합니다.466개를 포함한 새 원격은 다음 확정 결과로 기록하고 현재 앱은 유지합니다.

## 후속 — 네 종류 장식음의 채점/편집 보호 누락 수정 (2026-10-24)

### 1. 작업 개요

작업일2026-10-24. 독립적인 안전 경계 확인 중 alphaTab1.6.1의 turn/역turn·상/하 mordent가 일반 피킹으로 정규화되고 기본 편집에서 소실될 수 있는 누락을 발견했습니다. 코드/프론트 자동 검증 완료이며 Windows 빌드·적용은 후속 기록합니다. 실제 장식음 검출/정답 수용은 아닙니다.

### 2. 구현 및 변경 사항

alphaTabAdapter.ts의 공통 hasUnsupportedTechnique에 Note.ornament!==None 조건1개를 추가했습니다. alphaTabAdapter.test.ts의 실제 파서/GP7 binary 왕복 사례를4개 늘리고 장식음 반복/구형 원본 복원1개를 추가해 기존 회귀를 재사용합니다. 기존 UNSUPPORTED→감점 제외·기본 편집/출력 거부를 사용하며 원본/ID·타이밍/싱크·일반 피킹은 유지합니다. docs/12 계약을 먼저 작성하고 docs/04·05·09/진행 문서에 경계를 기록했습니다. 새 의존성/DB·IPC/입력·REC 변경은 없습니다.

### 3. 테스트 결과

- 최초 fixture는 Note 장식을 Beat 효과 구문에 넣어4개 파싱 오류,기존 원본 복원1개 실제 실패였습니다. 설치된 파서의 Note 효과 구문을 확인해 fixture만 수정했습니다.
- 제품 수정 전 올바른 파서 입력으로 **20개 중5개 실패/15개 성공**:네 장식의 UNSUPPORTED 누락 및 반복/구형 복원 누락을 재현했습니다.
- 조건1개 추가 뒤 `pnpm exec vitest run src/features/score/alphaTabAdapter.test.ts src/features/score/scoreJson.test.ts src/features/practice/practice.test.ts`: **27개 성공**,2.54초. 실제 GP7 binary 왕복에서도 표기/원본이 유지됨을 확인했습니다.
- `pnpm typecheck`·`pnpm lint`·`pnpm test`: **성공**,전체463개/103파일·28.39초. `pnpm build`: **성공**,73초/176모듈·기존500kB 청크 경고. `pnpm format:check`: **성공**.
- native 감점 제외/내장 검사·Windows 빌드/적용: **진행 중**. 사용자 실제 장식음 연주/고급 점수 품질은 **미실행**이며 파서 왕복으로 대신하지 않습니다. 아래 확정 절에 실제 결과를 추가합니다.

### 4. 미구현 및 알려진 문제

장식을 실제 PCM에서 검출하거나 기본 편집기로 작성하는 기능은 없습니다. 과거 NORMALIZED 편집본/출력에서 이미 사라진 표기는 자동 복원하지 않습니다. 이전 점수는 다시 계산하지 않고 구형 원본 보완은 기존 새 revision 안내를 유지합니다. 전체 Phase7은 미완료입니다.

### 5. 다음 작업 계획

native/Windows·새 독립 패키지를 검증한 뒤 현재 앱을 정상 종료 경로로 전환합니다. 미저장 확인창은 우회하지 않습니다. 새 원격에463개 회귀를 포함하고, 독립 정답/특화모델·별도Windows 수용의 외부 제약은 유지합니다.

### Windows·패키지 적용 확정

구현 커밋 **01a1d80**의 `cargo test ... unsupported`는 **6개 성공/0.60초**,내장 custom-protocol bundle_tests는 **3개 성공/0.12초**(각컴파일11.35/11.19초)입니다. 새 고정 설정의 `pnpm tauri build --debug --no-bundle --ci --config ... -- --locked --offline`는 **21.02초 성공**했습니다. 기존 MSVC 출력/identifier 권고 외 오류 없습니다. 고정runtime3393파일/64,095,466바이트를 원본/새 복사본에서 lock SHA191c1e80…와 대조했습니다.

EXE40,689,152바이트/SHA **f591465cecbac97b6257c92cb9aed07baa3f5bac1bf5d1715a7a3e555ec910c3**를 새 portable/ornament-support-9f18e333-c130-465c-843f-7a2a485b2e7f에 보존했습니다. 패키지 CLI 최초 --candidate 옵션은 실제 위치 인수 계약과 달라 거부됐고 같은 준비 파일을 재생성/삭제하지 않고 올바른 위치 인수로 해결했습니다. 새 ZIP59d1d77b…/3613파일/40,165,787바이트/SHA **0b1aca8799944542fb7e197851a2a246e37825e5eb340ca7ad7e8010b29f5ecc**의 전체지문/CRC·새 추출을 검증했습니다. 실제 WindowsPowerShell5.1 전체파일 지문·개발 PATH 없는 독립Python3.12.15 두 번 실행도 **exit0**입니다.

이전 PID30808/PTY82434는 CloseMainWindow 정상 종료 **exit0/forced=false**였습니다. 새 **PID32076/PTY61414·‘GuitarLab · 장식음 보호’**가 READY/응답 중이며 실제 입력/REC는 켜지 않았습니다. 전환 전 읽기 전용 SQLite snapshot과 시작 후 **DB9/15사용자테이블의 모든 행 지문 동일**을 ornament-startup-data-comparison.json에 기록했고 복원하지 않았습니다. ornament-support-candidate.json·ornament-package-roundtrip.json/현재 portable-candidate.json을 연결했으며 이전 포인터/실행파일은 보존했습니다.

이 안전 수정 슬라이스/문서화는 완료입니다. 실제 사용자의 장식음 import/연주 검사는 **미실행**이며 자동 실제 파서/GP 왕복과 구분합니다. 전체Phase7·실제 장식음 인식/고급 점수·새 Windows 수용은 미완료입니다.463개를 포함한 새 원격 회귀/Git 후속은 다음 기록을 따릅니다.

## 후속 — 주기적 변화 보류 조건의 고정 사후 감사 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 직전31창 중 비브라토 라벨/coverage90% 이상3창의 보류 조건을 기존 산출물에서 재현했습니다. 개발 감사 슬라이스 완료이며 주법 검출 성공/일반화 수용이나 제품 변경은 아닙니다. 입력 관측SHA를 고정하고 사후 선택임을 결과에 표시합니다.

### 2. 구현 및 변경 사항

scripts/audit_egipt_periodicity.py·test_audit_egipt_periodicity.py는 기존 원본/모델을 다시 분석하지 않고 고정 관측 점을 읽어3~9Hz·0.1Hz 탐색의 최적fit/깊이·주기 수와 선형 경향을 대조합니다. 제한 경로/UUID·512KiB/고정SHA와 유효 시각·음정/주기성·연속성을 검사하고 기존 파일을 덮어쓰지 않습니다. 경향 조건에서 이미 보류된 뒤 감사가 계산한 곡선은 제품이 반환한 후보가 아님을 표시합니다. docs/12 계약을 먼저 추가했고 docs/09·08 및 진행 문서를 갱신했습니다. README 표의 한글 오자도 수정했습니다.

### 3. 테스트 결과

- 최초 합성검사 **1실패/2성공**:200cents 깊이의6Hz 신호가 깊이 검사 전에80cents 점 간 점프 제한에 걸렸습니다. 테스트 신호만4Hz로 바꿔 깊이 조건을 분리했습니다. 제품/감사 임계값은 바꾸지 않았습니다.
- `python -B -X utf8 -m unittest discover -s scripts -p test_audit_egipt_periodicity.py -v`: **3개 성공**,0.042초. 합성6Hz/80cents·경향/깊이·상수·저신뢰/누락/시각/NaN/연속성·고정SHA·새UUID·입력 원본 보존을 확인했습니다.
- 음수0.5ms/점 공백 경계 보강 후 전체 도구 `... -m unittest discover -s scripts -p 'test_*.py'`: **123개 수행/122성공·링크권한1제외**,9.198초. 번들Python3.12.15 대상 **3개 성공**,0.040초. 일반 Windows 환경의 자체 DEMO만 사용했습니다.
- 실제 CLI `scripts/audit_egipt_periodicity.py fixtures/external/egipt-15205644/95fc57f4-ddd8-4504-9f1f-2dd6bb1c3fbe/pitch-observations-265c2c14-27b6-401d-b037-859f4adcd6ae.json`: **성공**,새 periodicity-audit-a82ee10e-ed16-476c-a8a0-88cdd2c4a3a8.json, SHA256 **673a2f9f01ef8bdab0c037c0e51ce7705b273c845e1677d09312fb538699cf5b**. 원래 임시 감사4fa38976…의3창 수치와 일치합니다.
- 빠른0초:최적5.4Hz/fit0.53198/깊이48.68cents/4.86주기·경향5.01cents로 fit0.85 조건 미충족. 느린0초:경향75.75cents/최적3Hz·fit0.08212/깊이10.16/2.775주기; 느린1초:경향60.68cents/최적3.8Hz·fit0.12507/깊이15.86/3.515주기로 경향/fit/깊이 등 다중 미충족입니다.
- 제품 빌드/프론트·Rust 재검사/실장치: **미실행** — 개발Python 감사/문서만 추가했고 직전233개Rust/현재 수용 앱을 유지했습니다. f0662a4 원격은 이 감사 이전이며 아직 전체 결론은 미확인입니다.

### 4. 미구현 및 알려진 문제

낮은 fit가 검출된 F0의 오류인지 실제 비주기적 연주/창 경계인지 독립 정답 없이 분리하지 못했습니다. 현재 조건을 해제/확장하면 어떤 허위 후보가 늘어나는지도 미측정입니다. 본 결과로 임계값을 낮추거나 실제 비브라토/고급 점수를 활성화하지 않습니다. 파일명 라벨과 사후3창은 독립 held-out 평가가 아닙니다.

### 5. 다음 작업 계획

새 원격 전체 검사 완료 후 도구/기록을 업로드하고 후속 원격을 확인합니다. 실제 주법 지원은 독립적인 연속F0/주법 시작·끝 정답과 허위 후보 분모/비교군을 확보한 뒤 진행합니다. 별도Windows10/11 수용·두 기타 특화 가중치 조건은 기존 의존성 보류를 유지합니다. 해결되지 않은 외부 조건을 완료로 표시하거나 같은 고정 실패 창에 맞춰 수치를 재조정하지 않습니다.

## 후속 — 고정 EG-IPT31창의 기존 음정 변화 관측 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 수신 다음 독립 슬라이스로 원본을 바꾸지 않고 완전1초 창의 현재 엔진 동작을 기록했습니다. 관측/회귀 완료이며 실제 벤딩/비브라토 정답 수용·고급 점수 지원은 미완료입니다. 파일명 라벨은 구간별 연속F0 정답이 아니므로 맞춤률/정확도를 계산하지 않았습니다.

### 2. 구현 및 변경 사항

- src-tauri/src/audio/egipt_benchmark.rs: cfg(test) 전용 PCM24 mono96kHz 경계 검사/고정 manifest SHA·계획·원본8개SHA/크기·원본 전후 불변,0초부터 겹치지 않는1초 관측/부분·짧은 파일 제외·새 UUID JSON 보존을 추가했습니다. PCM은2^23 비율을 유지해 f32로 바꾸며 gain/padding·외부 리샘플링/배속을 하지 않습니다.
- 기존 technique_benchmark.rs의 제한 경로/파일 읽기 helper만 테스트 간 재사용하고 audio/mod.rs에 cfg(test) 모듈을 연결했습니다. 제품 analyze_pitch_track의96kHz 경로/내부 블록 평균·보류 기준은 그대로입니다. 새 의존성/IPC·DB/UI 변경이 없습니다.
- docs/12의 관측 계약을 구현 전에 기록하고 docs/09·08·진행/남은 작업에 결과와 제약을 반영합니다.

### 3. 테스트 결과

- `cargo test --locked --manifest-path src-tauri/Cargo.toml pcm24_keeps_exact_polarity`: **1개 성공**,PCM24 극성/정확한 비율·잘못된 fmt/속도/채널/길이·중복data·잘린 입력 거부를 확인했습니다. 컴파일17.86초.
- 고정 GUITARLAB_EGIPT_SAMPLE manifest를 지정한 `cargo test ... public_egipt_pitch_motion_observations -- --ignored --exact audio::egipt_benchmark::public_egipt_pitch_motion_observations --nocapture`: **1개 성공/10.07초**,31창 관측 처리 합계9171.9ms입니다. 실시간 성능/왕복 지연 수치가 아닙니다.
- 결과: 같은 수신 폴더의 pitch-observations-265c2c14-27b6-401d-b037-859f4adcd6ae.json, SHA256 **a524f4f17a1477046364832dbd3ed378c02c3dd3d2a26400619da9c74b86625e**. Steady22/Unverified7/Rising1/Falling1. 일반음6번줄17창은 모두 유지,1번줄8창 중유지5/보류3입니다. 반음 파일 첫1초는 각각+128.62/-134.43cents·coverage97.37%였으나 실제 연주 정답 오차로 해석하지 않습니다.
- vibrato-fast 첫창은coverage97.37%·최소주기성0.9714·범위74.91cents, slow 첫두창은coverage100%/최소0.9524~0.9763·범위55.45~60.19cents이나 모두 NON_MONOTONIC_OR_AMBIGUOUS입니다. slow 마지막창은 LOW_LEVEL입니다. 이름에 맞게 결과/임계값을 바꾸지 않았습니다.
- 온음 상/하행2파일은1초 미만이라 제외했습니다. 전체 미사용 부분409998프레임(짧은2파일 포함)을 결과에 보존했습니다.
- 확장Clippy 최초 **실패**: 상수 chunks_exact 사용 지적. 의미가 같은 as_chunks로 바꾼 뒤 **성공/5.02초**. `cargo fmt --check` **성공**,전체확장 `cargo test --locked --all-features ...` **233개 성공/28개 기본 제외·11.19초**,`cargo +1.90.0 check --locked --all-targets --all-features ...` **성공/12.16초**.28개 중 본 공개관측1개와 기존자식helper1개는 명시 실행했습니다. 숫자 순회 변경 외 분석 알고리즘은 바꾸지 않아 실제 관측은 반복하지 않았습니다.
- 프론트/제품 앱 빌드·실장치: **미실행** — 테스트 모듈/문서뿐이며 이전 Windows 수용 앱을 그대로 유지했습니다. 최신 관측 코드 원격은 별도 기록합니다.

### 4. 미구현 및 알려진 문제

현재 관측기는 이 실제 vibrato 파일의 유효 세 창도 주기적 변화로 수용하지 않았습니다. 보류가 곧 해당 연주가 틀렸다는 의미는 아니며 연속 음정/주법 정답 부재와 한 연주자 조건 때문에 검출 실패율/허위 감점률을 산정하지 않습니다. 작은 신호/짧은 온음 파일을 정규화·padding해 강제로 맞추지 않습니다. 실제 코드/주법 점수·모든 주법/외부환경 수용은 미완료입니다.

### 5. 다음 작업 계획

새 도구/관측 회귀를 원격에 포함하고, 보류3창의 시간·주기성/주파수 구간·경향 조건을 고정 산출물에서 감사합니다. 결과를 본 뒤 표본/임계값을 바꿔 제품 지원으로 채택하지 않습니다. 독립 정답이 확보되면 별도 평가 표본/수용 기준으로 검증하며 특화 가중치/새 Windows 제약은 유지합니다.

## 후속 — EG-IPT 출처 검토와 고정 DI8개 제한 수신 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 공식 출처의 주법 파일 라벨이 있는 별도 공개 자료에서 고정 표본만 받았습니다. 수신 도구/무결성 슬라이스 완료이며 모델·주법 검출/실제 채점·품질 수용은 아닙니다. 사용자 앱 PID30808/PTY82434·개인 자료/기존 DSP는 유지했습니다.

### 2. 구현 및 변경 사항

- fixtures/egipt-technique-sample-v1.json: 음원/검출 결과를 보기 전에 HB-bridge/DI 일반음2·반음 상/하행2·온음 상/하행2·빠른/느린 vibrato2를 조건별 사전순 첫 파일로 고정했습니다. 목록에 온음6번/1번줄 조건이 없어 **분석 전에** 실제2번줄로 정정했습니다. 파일명의1s/6s는 초가 아닌 줄 번호입니다.
- scripts/fetch_egipt_sample.py·test_fetch_egipt_sample.py: 오프라인 기본값·공식metadata/32MiB·180초·고정 목록 분할·파일 선언/CRC/PCM24 mono96kHz/프레임·새 UUID/취소/기존 자료 보존을 검사합니다. stdlib/기존 RangeReader·경로 검사만 재사용했습니다.
- [공식 레코드15205644](https://zenodo.org/records/15205644)의 version1/open/CC BY4.0과 ZIP23,757,983,313바이트/선언MD5를 확인했습니다. [NIME2025 논문](https://nime.org/proceedings/2025/nime2025_14.pdf) §3.3·4.1을 읽고3~4쪽을 렌더해 파일명/평가 구성을 확인했습니다. 추가 연주자 자료·모델/외부 코드는 받거나 실행하지 않았습니다.
- 최초 중앙 목록 수신은 기존8MiB 한도로98바이트 후 거부됐습니다. 전역 제한을 풀지 않고 고정 목록16,780,188바이트만 분할해 총16,780,286바이트/56.08초 metadata 검토를 마쳤습니다. ZIP105043항목 중 WAV52317개로 공식 설명52320개와3개 차이는 미해결로 보존합니다.
- docs/12·09·08/진행 문서에 계약·검사를 기록합니다. 자료는 Git/배포물에서 제외합니다.

### 3. 테스트 결과

- 개발Python3.10 `python -B -X utf8 -m unittest discover -s scripts -p test_fetch_egipt_sample.py -v`: **5개 성공**,0.113초. 오프라인 기본값·계획SHA·조건·목록 분할/요청·합계/시간 제한·PCM 형식·비파괴 저장/실패/취소를 확인했습니다. 공통 HTTP206/범위/주소/CRC 실패 회귀도 유지합니다.
- 전체 `... -m unittest discover -s scripts -p 'test_*.py'`: **120개 수행/119성공·링크권한1제외**,9.984초,일반 Windows.
- 번들Python3.12.15 대상5개: 샌드박스 임시폴더 WinError3/5로 **오류5개** 후 같은 코드를 일반 Windows에서 **5개 성공**,0.068초. 보호/경로 검사를 완화하지 않았습니다.
- 실제 `python -B -X utf8 scripts/fetch_egipt_sample.py --download-samples`: **8개 성공**. 원본10,224,558/압축8,269,007바이트, 범위 수신25,050,330바이트. 전체ZIP/MD5 검증은 하지 않았습니다.
- 실제 manifest: fixtures/external/egipt-15205644/95fc57f4-ddd8-4504-9f1f-2dd6bb1c3fbe/manifest.json, SHA256 **71e721ef7039c65d944a34770ebbf116d0838c3fee8304fd60c8a6f2371c03ff**,state DI_FILES_VERIFIED_NOT_ANALYZED. 공식metadata SHA c9612c0d…/계획6da7035d…/검토catalog0014c0e2…를 연결했습니다. 논문1,405,754바이트/SHA a9dc7cf0…와 검토 산출물은 src-tauri/target/runtime-validation/egipt-source-review-1411a03f-a501-4484-8149-cf990da426b4에 보존했습니다.
- 프론트/제품 앱 재빌드·실장치·음정/주법 분석: **미실행** — 개발 도구/자료만 바뀌었습니다. 새 원격40071836396은 도구 이전8d05c65의 검사이며 성공은 미확인입니다.

### 4. 미구현 및 알려진 문제

연속 F0·주법 시작/끝의 정답 필드는 검증하지 못했습니다. 파일 라벨은 각1초 구간의 정답이나 줄 검출을 뜻하지 않습니다. 일반음17.7879/8.4474초, 반음 상/하행1.5851/1.3648초, 온음0.7971/0.7585초, vibrato1.5289/3.0012초입니다. 온음2개는 현재1초 분석기보다 짧아 padding/배속 변경 없이 제외해야 합니다. 8개/한 연주자·기타·DI 관측을 전체자료 정확도로 일반화하지 않습니다.

### 5. 다음 작업 계획

결과를 보기 전에0초부터 겹치지 않는 완전1초 창만 고정하고 나머지 부분/짧은2파일을 제외 수치로 보존합니다. 비점수 음정 변화 관측기로 coverage/보류/변화량만 기록하며 모델/DSP/실시간 점수는 유지합니다. CI 교착 수정의 원격 수용과 독립 Windows/주법 정답 품질도 별도로 이어갑니다.

## 후속 — 박자 단위 미지원 주법의 감점 제외 누락 수정 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 설치된 alphaTab1.6.1에서 Note의 왼손 태핑과 별개인 Beat의 태핑/슬랩/팝·dead slap·페이드/volume swell·rasgueado가 일반 피킹으로 정규화되던 누락을 발견했습니다. 해당 표기만 기존 UNSUPPORTED 경로에 연결하는 안정성 수정을 구현·자동 검증하고 Windows에 적용했습니다. 실제 주법 검출이나 코드/고급 실시간 채점 지원은 추가하지 않습니다.

### 2. 구현 및 변경 사항

- src/features/score/alphaTabAdapter.ts: 공통 hasUnsupportedTechnique에 Beat.tap/slap/pop/deadSlapped·fade/hasRasgueado6개 조건을 추가했습니다. 기존 Note 효과·일반 피킹·음정/시각/운지·DSP/입력/REC는 유지합니다.
- alphaTabAdapter.test.ts: 실제 AlphaTex 파서의8개 효과와 반복/구형 metadata 비파괴 복원9개를 추가했습니다. 같은8개를 Gp7Exporter로 실제 바이너리로 만든 뒤 제품 importScore 경로로 다시 읽어도 flags가 남고 원본 바이트가 유지됨을 확인합니다.
- 기존 PracticeTarget.unsupported→native NOT_SCORED/UNSUPPORTED·구형 원본 보완/새 revision 저장, 미지원 표기를 지워버리는 기본 편집/출력 거부를 재사용합니다. DB/IPC·저장 과거 점수는 변경하지 않습니다.
- docs/05·09·12와 진행 문서: 지원 범위·검사·미실행 상태를 기록합니다. 새 라이브러리나 모델/원음 다운로드는 없습니다.

### 3. 테스트 결과

- 변경 전 실제 파서 회귀 **15개 중9개 실패/6개 성공**으로 각 효과/반복 보류 누락을 재현했습니다.
- 수정 뒤 관련 프론트6파일 **70개 성공**,3.07초. 전체 `pnpm test`: **458개/103파일 성공**,33.33초. 실제 GP 바이너리 왕복 보강 뒤 대상15개도2.36초 **성공**했습니다.
- `pnpm lint`, `pnpm format:check`, `pnpm build`(타입 포함): **성공**. Vite77초/176모듈, 기존500kB 청크 경고는 유지됩니다. 테스트의 GP exporter 보강 뒤 타입/해당 파일 lint·포맷은 아래 확정 절에 기록합니다.
- `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml unsupported -- --nocapture`: **6개 성공**,0.81초. 기본 도구 환경에서는 임시 원본 import의 STORAGE_ERROR로3개 실패했고 같은 검사를 일반 Windows 환경에서 재실행해 통과했습니다. 저장/안전 코드를 완화하지 않았으며 실제 사용자 DB는 사용하지 않습니다.
- 새 내장 프론트/Windows 실행 파일 빌드·앱 전환: **성공**,아래 확정 절을 따릅니다. 실제 기타 주법 입력·새 악보의 사용자가 직접 import하는 수용·고급 점수 품질/전체Rust·AI 재분석은 **미실행**이며 자동 GP 파서 왕복과 구분합니다.

### 4. 미구현 및 알려진 문제

원본에 해당 주법 표기가 있어야 감점 제외됩니다. 실제 PCM에서 태핑/슬랩/페이드를 식별하거나 모든 악보 형식·악보에 쓰이지 않은 효과를 검증한 기능은 아닙니다. 과거 저장 점수는 다시 계산하지 않으며 이전 metadata를 보완한 문서는 기존 안내에 따라 새 버전으로 저장해야 합니다. 새로운 효과가 있는 원본의 기본 편집은 표기 소실 방지를 위해 거부되며 원본 보기/재생은 유지합니다.

### 5. 다음 작업 계획

기존 수용 앱과 사용자 내용을 보호하면서 새 고정 Windows 빌드/패키지·원격 회귀를 마무리합니다. 사용자에게 같은 수동 검사를 반복 요청하지 않고 자동 실제 GP/기존 native 보류·저장 회귀를 우선 재사용합니다. 이후 남은 실제 주법/독립 정답·외부 환경 수용은 기존 계획을 유지하며 임의로 고급 점수를 활성화하지 않습니다.

### 빌드 확정

실제 GP 바이너리 왕복 보강 뒤 `pnpm typecheck`·대상ESLint/Prettier도 **성공**했습니다. 최신 dist를 사용한 `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests`는 **3개 성공**,컴파일17.02초이며 새 고정 설정의 `pnpm tauri build --debug --no-bundle --ci --config ... -- --locked --offline`도 **22.10초 성공**입니다. 기존 linker/incremental 복사·identifier 권고 외 새 빌드 오류는 없습니다. 실제 앱 전환·새 패키지와 원격 회귀는 다음 확정 결과로 구분합니다.

### Windows 적용·패키지 확정

기존 PID37656/PTY67859는 정상 종료 요청 후 exit0으로 종료했습니다. 새 **PID30808/PTY82434·‘GuitarLab · 미지원 주법 보호’**가 READY/응답 중이며 강제 종료·실제 입력/REC 시작은 없습니다. EXE40,689,152바이트/SHA `af6ffa40704304701186540cf2951a3b7cbee8f9562efb6e71400d0d94791097`,runtime3393개/64,095,466바이트의 복사 전후 지문을 확인했습니다. 실행 전 읽기 전용 DB9 snapshot과 실행 후 사용자테이블15개 행/내용 지문 동일을 beat-support-startup-data-comparison.json에 기록했으며 복원하지 않았습니다.

새 ZIP은 validation-packages/0ef20b47-3540-4e3a-967a-5d0f218562f1/GuitarLab-validation.zip,3613파일/40,161,792바이트/SHA `f1b310575ec637b51b414732a94036ef8bc6ca4f9f5be3daf2d28a2cc7cf1656`입니다. 사전 빌드 정보·전체ZIP 지문/CRC·새추출/일반 Windows PowerShell5.1의 독립Python3.12.15 두 번 실행 **exit0 성공**입니다. beat-support-package-roundtrip.json을 보존했습니다.

현재 portable-candidate.json은 새 beat-support-candidate.json에 연결하고 이전 수용 영수증도 별도 보존했습니다. 상태는 WINDOWS_RUNNING_AUTOMATED_GUARD_VALIDATED이며 manualGuitarTechniqueValidated=false를 명시합니다. 같은 수동 검사를 반복 요청하지 않았고 실제 고급 주법 품질 수용을 주장하지 않습니다. 이 보호 후속은 완료이며 다음은 Phase8의 실제 프로세스 중단 시 합성 녹음 복구 검증입니다. 현재 사용자 앱을 강제 종료하거나 실제 녹음/개인 파일로 검사하지 않습니다.

## 후속 — 저자 참조 범위 감사를 개발 도구로 재현 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 앞선 임시 분석의 저자 평가 범위를 고정 원문 검증·전체 타격 보존·자동 검사와 함께 재현 가능하게 만들었습니다. 이 개발 검증 슬라이스는 완료이며 실제 음정 정답/독립 holdout·고급 점수 수용은 계속 미완료입니다. 사용자 앱 PID37656/PTY67859·입력/REC·제품 DSP는 유지했습니다.

### 2. 구현 및 변경 사항

- scripts/audit_agpt_reference_scope.py: 기존 표본 계획/원문 검증·CSV shape/참조 변환 함수를 재사용합니다. 정확한 TaskA 노트북36,290바이트/SHA62e8990a…·메타데이터 수신 버전/UUID·CSV4개 SHA를 확인한 뒤 새 UUID 결과만 기록합니다. 외부 코드는 실행하지 않습니다.
- 파일명 조건을 먼저 적용하고 원문 정수108 상한을 확인합니다. 비정수/결측은 추측 변환 없이 RAW_PITCH_UNRESOLVED로 보존하며 pandas 버전별 결측/형변환 동등성을 주장하지 않습니다. 원문의 음정/타격281개와 모든 제외 분모·출처 지문이 결과에 남습니다. 음정 정확도/정답 수용·실제 앱 채점은 false입니다.
- scripts/test_audit_agpt_reference_scope.py: 경계/우선순위·유효/잘못된 원문·분모/불변·고정 출처/경로·입력 실패 시 출력 없음/재실행 새 파일·기존 결과/원본 보존을 DEMO로 검사합니다.
- docs/12·09와 진행 문서: 계약/재현/미실행 범위를 기록합니다. 신규 라이브러리·네트워크·모델·제품 IPC/DB/프론트 변경은 없습니다.

### 3. 테스트 결과

- `ai/.venv/Scripts/python.exe -B -X utf8 -m unittest discover -s scripts -p test_audit_agpt_reference_scope.py`: **3개 성공**,0.098초. 번들Python3.12.15도 작업공간 TMP/TEMP에서 **3개 성공**,0.071초.
- 개발 도구 전체 `python -B -X utf8 -m unittest discover -s scripts -p test_*.py`: **115개 실행/114성공·링크 권한1개 제외**,일반 Windows 환경3.632초. 기본 도구 환경에서는 백업의 os.link가 WinError5로9개 오류/1개 제외였으며 동일 검사를 재실행해 해결했습니다. 제품 보호/백업 코드를 완화하지 않았습니다.
- 실제 `audit_agpt_reference_scope.py <기존 공개CSV UUID> <보존한 TaskA 원문>`: **성공**,281=159포함+114상한제외+8파일명제외. 새 결과 author-pitch-scope-580c2a78-bbf4-4beb-9f3e-0c62ae21f45c.json의8파일별 개수/상태·포함 원문 값 집합이 이전 임시 감사와 일치하고 전체281개 행이 보존됨을 확인했습니다. 첫 실행 결과도 별도 파일로 남겼습니다.
- 프론트/Rust/모델 재분석·앱 재실행: **미실행** — 이번 도구는 제품 코드를 바꾸지 않습니다. 새 원격115개 회귀는 아직 실행 전이며 직전449개 프론트 수정의 원격 CI와 구분합니다.

### 4. 미구현 및 알려진 문제

저자 포함 범위를 재현한 것이 실제 정답 품질이나 자동 음정 보정을 수용한 근거는 아닙니다.114개/결측8개를 다른 음정으로 바꾸지 않았습니다. 고정 참조 밖의 전체 데이터·다른 pandas 처리까지 재현하지 않으며 실제 벤딩/비브라토·허위 감점률/독립 참조 검증은 남아 있습니다.

### 5. 다음 작업 계획

이제 임시 수작업 분모를 다시 계산하지 않고 이 도구/지문을 재사용합니다. 지원하지 않는 주법의 import→채점 보류 경로를 설치된 alphaTab 모델/기존 계약과 대조하고, 누락을 재현할 수 있는 범위만 보완합니다. 품질 근거 없이 주법 검출·고급 실시간 점수를 켜지 않습니다. 실제 주법 참조/별도Windows·특화 모델 조건은 기존 남은 작업을 유지합니다.

## 후속 — 검출 창 재현·옥타브 조건 가설 기각 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 선언값보다 약1옥타브 높았던 팜뮤트4곳의 계산을 재현하고 작은 조건 변경을 별도 복사본에서 대조했습니다. 원인 관측/가설 검증 슬라이스 완료이며 **후보는 제품 적용 기각**입니다. 기존 입력/튜너/단음 판정 코드를 변경하지 않았습니다.

### 2. 구현 및 변경 사항

제품 소스 수정은 없습니다. docs/12에 재현/전체 분모·기각 기준을 먼저 기록했습니다. 공개 PCM에서 방출 시점의 실제4096프레임/4프레임 f32 누적 평균1024점을 재구성하고 기존 순수 spectral_pair를 재사용했습니다. 기존 DSP 전체를 baseline/한 잔차 비율0.15→0.4만 바꾼 candidate 복사본으로 별도 target UUID에 보존했습니다. 자체 Rust CLI를 std만으로 컴파일했으며 모델/네트워크·실제 입력/녹음은 쓰지 않았습니다. 원문/기존 보고서·코드 파일은 유지합니다.

### 3. 테스트 결과

- 공개 원문/파생 SHA·범위 확인 뒤4곳과 같은 파일의 대조2곳을 재현했습니다. f32 차분/보간을 포함한6곳 모두 기존 native MIDI와 **오차0**입니다. 원본 신호의 관측/선언 주파수 계수비는4곳에서+16.425~+21.453dB였고4프레임 평균 후 변화 최대0.0041dB입니다. 이것만으로 실제 기본음 정답을 확정하지 않습니다.
- 첫 골의 보간 잔차0.09352~0.13701, 두 배 lag의 잔차0.02389~0.03652였으며 기존0.15 비율 조건은 모두 통과하지 않았습니다. 결과 declared-window-observations-9263add7-2b70-48b5-a8db-ca05a538c715.json은 보조 주석 audit 폴더에 보존합니다.
- 두 소스 복사본의 실제8파일 실행 **성공**. baseline337개 전체의 공격/방출·음정·주기성은 기존 native와 일치했습니다(수치 허용1e-9). candidate도337개/같은 시각·미확정 분모를 유지했지만 총10개 음정을 바꿨습니다. 조건부 팜뮤트의4곳은 선언값 쪽으로 내려갔고, 단위가 미확정인 하모닉스6곳도 변해 그 구간의 개선을 주장하지 않습니다.
- 사전에 보존한 다른 GuitarSet91창/3458지점을 같은1초 DC·3프레임 평균/주기성·음역 필터로 대조했습니다. baseline은 **3458지점 전부** 기존 보고서와1e-9 이내 일치했습니다. source4개/주석·파생91파일 SHA와 원래838/772/474/1374 분모도 유지했습니다.

| GuitarSet 단음838지점 | 기존 | 후보0.4 |
|---|---:|---:|
| 음정 후보 |677|680|
| 주석50cents 이내 |629|619|
| 주석50cents 초과 |48|61|
| 누락 |161|158|

기존 적중10개가 퇴행했고 개선0개, 전체3458지점 중19개 출력이 변했습니다. 따라서4곳만 보고 조건을 완화하는 가설을 **기각**했습니다. 실제 주법/독립 정답 수용이 아닌 보존된 공개 주석 대조이며 새로운 점수/정답을 만들지 않았습니다.

- 개발 산출물/소스 지문·기각 영수증은 src-tauri/target/runtime-validation/agpt-octave-ratio-8de4be48-69b2-420f-8b29-c56679c98437에 보존합니다. comparison-3077acb0…와 guitarset-comparison-4c937d3e…를 SHA로 연결합니다. 원본 dsp.rs의 현재 SHA도 baseline 복사본과 같습니다. scratch 소스/실행 파일은 Git/배포물에서 제외합니다.
- 컴파일 두 번·정상/후보8파일과91창 실행 및 원본 일치/분모 assert **성공**. 별도 모델·실장치·제품 UI/음정 정확도 수용은 **미실행**입니다. 가설 코드가 제품 검사에 포함된 것처럼 기록하지 않습니다. 실제 제품/개발 도구108개의 최신 Windows40008147793은 별도 전체 success입니다.

### 4. 미구현 및 알려진 문제

배음/일시적 기본음 약화와 라벨 정확성을 분리한 참조는 아직 부족합니다. 전역 비율 하나를 이 표본에 맞춰 바꾸는 방법으로 정상 단음 성능을 보존할 수 없었습니다. 고급 주법/실제 오감점·정밀 지연·독립 정답/연주자 수용을 보장하지 않으며 고급 점수 비활성을 유지합니다.

### 5. 다음 작업 계획

비율0.4를 제품에 반영하거나 같은 자료에서 숫자만 반복 조정하지 않습니다. 다음 판정 연구는 신호 문맥/기본음 증거를 분리하고 독립적인 실제 음정/주법 참조를 확인하는 단계부터 시작합니다. 필요 자료/별도 Windows·특화 모델 조건은 REMAINING-WORK.md를 유지합니다. 현재의 원문 대조/반례·기각 영수증은 다음 세션에서 재사용할 수 있습니다.

## 후속 — 별도 음정 주석 원문 대조·조건부 관측 (2026-10-24)

### 1. 작업 개요

확인일2026-10-24. 서버 timeout2회 뒤 세 번째 제한 수신은 성공했습니다. 원문 대조/조건부 관측 기록은 완료했지만 음정 단위/실제 정답 해석과 Phase7 수용은 계속 미완료입니다. 아래 ‘원문 수신 대기’는 이전 이력입니다.

### 2. 구현 및 변경 사항

제품 코드/기존 타격 평가기는 변경하지 않았습니다. 공식 ZIP의 README와 작은 pitch_labels.zip만 기존 제한 RangeReader/read_member로 받아 출처/지문/CRC·원본을 새 UUID에 보존했습니다. 외부 Python/모델·오디오를 받거나 실행하지 않았습니다. docs/12에 별도 선언값 관측의281/159/122 분모·가정/한계 계약을 추가했습니다.

### 3. 테스트 결과

- 세 번째 제한 수신 **성공/223635바이트**, README3997/SHA3cf8b2076df72d11cd7c5d604e51aa60b3c4990e8fcd6ee398bafb5a36e42f9c, pitch ZIP354811/SHA4558abb1fde662dd17bd7bbc7feaa256e2a5caee442f12e2fce5c45e1d91fc98·두 전체 member CRC를 확인했습니다. 전체 외부 ZIP MD5는 미검증/ETag null입니다. fixtures/external/agpt-reference-10159492/607254c0-c811-4430-b50f-88e011df38db에 보존합니다.
- 내부498개 목록에서 고정8파일의 선언 경로만 조회했습니다. 첫 대조는 별도 주석 경로의 빈 문자열을 잘못된 경로로 거부해 **실패**했고6e63f935… 폴더의 부분 원문/실패 영수증을 보존했습니다. 빈 선언은 임의 파일로 추정하지 않고 ‘주석 없음’으로 분리해 새 e4ef7b2b-d305-4d86-a83d-ae67c65ed6d0/audit.json으로 대조했습니다.
- 해당7파일/273행의 CRC/개별SHA·정확한3열/행수/원문 pitch 문자열·정수 타격 샘플 대비2샘플 이내 시각 대조 **성공/불일치0/최대1샘플 차이**입니다. 나머지 팜뮤트1파일8음은 경로가 비어 있고 CSV도 None이며 그대로 누락으로 유지했습니다. 하모닉스 원문 midi_pitch에도440/494/659·110/123/165가 있어 CSV 변환에서만 생긴 현상이 아님을 확인했습니다. Hz로 변환하지 않았습니다.
- 원문 선언값이 MIDI 정수 범위인 팜뮤트3파일만의 **사후 조건부 관측**을 별도 declared-label-diagnostics-845f61c9-1205-4748-b222-f77e396d7ec8.json에 보존했습니다. 원래50ms 시간 대응/281 전체 참조를 바꾸지 않았고,159 조건부 참조/하모닉스 단위 미확정114/누락8·3파일의 모든207검출을 구분합니다. 원문/타격 평가/검출 보고서 SHA가 연결됩니다.

| 원문 선언값을 MIDI로 가정한 팜뮤트 | 참조 | 음정 관측 | 관측 없음 | 선언값±50cents | 선언값 차이 초과 |
|---|---:|---:|---:|---:|---:|
| guitar0 / 줄6 |63|62|1|58|4|
| guitar6 / 줄1 |48|22|26|22|0|
| guitar6 / 줄6 |48|48|0|48|0|
| 합계 |159|132|27|128|4|

4곳은 선언44/45에 관측56/57 부근으로 약1192~1213cents 높았습니다. 이 숫자는 정답 수용된 pitch accuracy가 아니며 referenceInterpretationAccepted/actualAppJudgements/independentHeldOutEvaluation은 모두 false입니다. 조건부132개만의 높은 비율을 전체 성능으로 쓰지 않습니다. 기존 타격 보고서의 pitchEvaluationEnabled=false도 유지합니다.

- README 원문은6명/7악기라고 쓰지만 본문의 반복 횟수 설명에는7번째 연주자가 등장합니다. 논문/CSV와의 인원/단위 설명 차이를 확인했을 뿐 ID를 임의 교정하거나 독립 연주자 split을 확정하지 않았습니다.
- 이 후속은 지문/경계 assert가 포함된 읽기 전용 조사이며 제품 회귀를 다시 실행한 것은 아닙니다. 실장치/독립 음정 정답·실제 오감점/주법 인식 검사는 **미실행**입니다. 수정된 개발 평가기108개 전체는 별도 원격40008147793에서 검증 중입니다.

### 4. 미구현 및 알려진 문제

원문끼리 일치한다고 잘못된 단위를 해결한 것이 아닙니다. MIDI 범위 안의 하모닉스110/123도 그 값만 보고 실제 MIDI 정답으로 채택하지 않습니다. 조건부4곳의 실제 기본음·배음/감쇠와 선언값의 정확성은 아직 분리 검증하지 않았습니다. 고급 점수/자동 옥타브 수정은 비활성으로 유지합니다.

### 5. 다음 작업 계획

위4곳의 실제 파형/기존 검출 창을 대조해 원인을 좁힙니다. 작은 보조 원문은 확보됐으므로 무조건 재다운로드할 필요는 없습니다. 의미가 확인되지 않은 주석·나머지 누락을 추측으로 채우지 않고 전체 분모/원본·이전 결과를 보존합니다. 캐시 재사용/전체 CI와 재개 문서도 마무리합니다.

## 후속 — JSON 불리언/정수 계약 혼동 수정 (2026-10-24)

### 1. 작업 개요

작업 완료일2026-10-24. 개발 평가기에서 true/false를 정수1/0과 같다고 처리하던 계약 경계 오류를 수정했습니다. 제품 검출/점수·원본 정답 해석의 변경은 아닙니다.

### 2. 구현 및 변경 사항

`evaluate_agpt_onsets.py`의 입력 schemaVersion/tailPaddingFrames·참조 상태 개수를 실제 JSON 정수로 확인하고 양수 개수만 허용합니다. native 예제의 u8/u32와 같은 타입 경계를 유지합니다. docs/12 계약을 갱신하고 기존 평가 테스트에 버전/프레임/개수5가지 재현을 추가했습니다.

### 3. 테스트 결과

수정 전 테스트1개의5개 하위 사례 모두 **실패/오류 재현**(ValueError가 발생하지 않음), 수정 후 대상6개 **성공/0.003초**입니다. `python -B -X utf8 -m unittest discover -s scripts -p "test_*.py"`는 **108개 수행/107성공·링크권한1제외/8.459초**이며 배포Python3.12.15의 대상6개도0.003초 성공입니다.

실제 고정 공개 자료 재평가 **성공**. 새 onset-evaluation-4d88b12f-38c4-466e-b013-1c91280300a1.json은 이전 schema2/27bfe065…와 바이트가 같습니다. 모든281참조/337검출/타격/추가·미확정 분모를 바꾸지 않았습니다. 새 제품 앱/모델·사용자 녹음/장치 검사는 **미실행** — 개발 평가 입력 검증만 변경했기 때문입니다. 원격 후속 회귀는 다음 push에서 확인합니다.

### 4. 미구현 및 알려진 문제

음정 원문 의미·독립 주법 참조/실제 허위 감점률은 계속 미확보이며 계약 수정으로 정확도가 좋아졌다고 주장하지 않습니다. 고급 점수는 비활성입니다.

### 5. 다음 작업 계획

첫 캐시 저장이 포함된 원격 검사를 마치고 이번 수정/안내 문서를 push해 같은 캐시 복원과108개를 포함한 전체 회귀를 확인합니다. 이후 참조 의미 확인/특화 모델/별도 Windows의 수용 조건을 유지합니다.

**원격 기준선 최종 — 2026-10-24**: 25cc728의 [Windows40002809031](https://github.com/BomJin2/GuitarLab/actions/runs/40002809031)/job120583013796는 사후 정리까지 전 단계 success입니다. 프론트436/102파일·기본Rust228(26제외)/48.12초·확장231(26제외)/47.54초·새 synthetic1개/0.35초·AI113/3.68초·도구105/21.459초·최소Rust1.90 전체targets/features2분27초를 확인했습니다. 실행기2.338.0이며 아래 진행 중 문구는 이력입니다. 후속 schema2/107개 도구와 새 캐시는 다음 push에 포함되므로 이 실행으로 선승인하지 않습니다.

## 후속 — 음정 참조 단위/저자 설명 확인 시도 (2026-10-24)

### 1. 작업 개요

확인 날짜2026-10-24. 타격 기준선과 독립적으로 source의 음정 단위 불일치 원인을 확인했습니다. 조사 기록/보호 정책은 완료했지만 참조 문제 해결은 **미완료/외부 자료 확인 대기**입니다.

### 2. 구현 및 변경 사항

제품 코드는 변경하지 않았습니다. `docs/00`에 원문 보존·음정 해석 보류 결정을 추가했고 앞선 메타데이터 조사에서 ‘논문6명’으로 적은 부분을 정정했습니다. 공식 논문 서론은7명/6악기, 본문/표5는7악기이며 CSV의7개 player_id만으로 독립 holdout을 보장하지 않습니다. 줄 번호도 논문 문구와 CSV 개방현 값이 달라 원문을 자동 교환하지 않습니다.

### 3. 테스트 결과

- [저자 논문](https://domenicostefani.com/publications/2024AM-preciseonset.pdf) 3.4절은 pitch_midi를 MIDI 번호로 설명하지만 지문 고정 전체 CSV32592행에서 범위 밖 값1774개를 실제 관측했습니다. 이를 Hz라고 확정하거나 변환하지 않았습니다. 전체 범위 밖 행 수는 같은 원문 CSV의 숫자 열 조건 관측이며 실제 음정 정확도 측정이 아닙니다.
- 공식 ZIP의12개 중앙 목록 제한 읽기 **성공/1497바이트**: 별도 pitch_labels.zip354811/압축220528바이트와 README3997/압축1504바이트의 존재/선언CRC를 확인했습니다. 내용을 확인한 것은 아닙니다. 저자의 [공식 저장소](https://github.com/CIMIL/AG-PT-set_AM24_accompanying-material)의 dataset에는 README/빈 init뿐이며 단위 정정을 확인하지 못했습니다. 외부 코드를 실행하지 않았습니다.
- README/작은 pitch_labels ZIP만1MiB 한도로 읽으려던 시도2회 **실패**: 공식 범위 응답의25초 읽기 시간 초과입니다. 두 번째는 Python zipfile이 원래 TimeoutError를 BadZipFile로 감쌌으며 ZIP 손상으로 확정하지 않습니다. 새 UUID f741afb0-bb51-49de-9263-3d4347717579/9500ee48-a986-4b84-b91c-e05acebc3b95의 실패 manifest를 fixtures/external/agpt-reference-10159492에 보존했습니다. 두 시도 모두 원문 파일 수0, 기존8개 WAV/CSV/평가 결과는 보존했습니다.
- `cargo +1.90.0 check --locked --all-targets --all-features --manifest-path src-tauri/Cargo.toml` **성공/12.96초**. 새 native 예제도 최소 버전에서 컴파일됩니다. 입력 worker/모니터의 비유한 샘플 보호는 기존 코드에서 읽어 확인했고 추가 변경은 하지 않았습니다.
- 실제 배포용 고정 Python3.12.15에서도 전체 도구107개 **106성공·링크권한1제외/8.993초**를 확인했습니다. 개발 Python3.10.8의8.415초 결과와 별도이며 모델/런타임 원문은 변경하지 않았습니다.
- 실제 음정 참조 해석/새 주법 점수·별도 Windows 수용은 **미실행**입니다. 추가 자료 수신 실패를 원문 음정이 맞거나 틀리다는 판정으로 바꾸지 않습니다.

### 4. 미구현 및 알려진 문제

정확한 음정/주법 참조·실제 허위 감점률과 특화 분리 모델 이용 조건/품질·별도 Windows10/11 검사는 해결되지 않았습니다. 검증 가능한 범위를 넘어 실제 지원이나 완료를 주장하지 않습니다. 현재 고급 점수 비활성과 원본/기존 모델 유지 정책을 계속 적용합니다.

### 5. 다음 작업 계획

원격 전체 회귀와 Git 정리를 완료하고 타격 기준선/추가 이벤트 감사를 보존합니다. 다음 재개 시 동일한 작은 주석 원문/저자 설명부터 확인하고, 단위/실제 발음과 대응 관계를 검증하기 전 음정 평가를 재개하지 않습니다. 단계별 남은 조건은 REMAINING-WORK.md를 따릅니다.

## 후속 — 추가 타격 이벤트의 대응 문맥 분해 (2026-10-24)

### 1. 작업 개요

작업 완료 날짜2026-10-24. 같은281참조/337검출의50ms 대응을 바꾸지 않고 추가56개의 음정 후보/참조창 문맥을 분해했습니다. 개발 관측 슬라이스 완료이며 새 주법 판정·실제 오감점률 수용은 아닙니다.

### 2. 구현 및 변경 사항

`evaluate_agpt_onsets.py`의 schema2/eventAudit50ms에 대응/추가 각각의 후보 있음·미확정과 각 추가의 최근접 참조/원래 대응 검출/차이·50ms 창 내부 여부를 보존합니다. 후보가 있어도 원래 대응을 교체하지 않으며 source/native/기존 schema1 결과를 덮어쓰지 않습니다. 새 테스트2개는 후보 있음에 따른 사후 재대응 금지·최근접 동률·정확한50ms 경계/빈 검출을 확인합니다. docs/12에 먼저 계약을 추가했습니다.

### 3. 테스트 결과

- 대상5개 **성공/0.002초**. 전체 `python -B -X utf8 -m unittest discover -s scripts -p "test_*.py"`: **107개 수행/106성공·링크 권한1제외/8.415초**입니다.
- 실제 동일 원문/CSV/native 보고서의 평가 **성공**, schema1의 모든5개 tolerance 수치/분모는 그대로입니다. 새 결과 `onset-evaluation-27bfe065-fed6-49d9-a69b-2004285b4128.json`을 같은 공개 benchmark 폴더에 추가했습니다.
- 대응281개=음정 후보242+미확정39, 추가56개=음정 후보1+미확정55입니다. 추가 중 참조의±50ms 안13/밖43이며 창 안이어도 참조가 이미 다른 검출과 대응되어 추가일 수 있습니다.
- 추가가 가장 많은 g0/6번줄 팜뮤트는43개(후보1/미확정42)입니다. 후보1개(24,050ms)는 참조24,024.5ms와25.5ms 차이지만 이미 더 가까운 미확정 검출24,000ms가 대응되어 있습니다. 이를 새 가짜 음이나 실제 틀린 연주로 확정하지 않습니다. 기존 native 제품 코드의 저신뢰/음정 없음 UNVERIFIED 분기를 읽어 확인했으며 이번 결과가 실제 채점 리플레이를 실행한 것은 아닙니다.
- 새 프론트/모델·제품 앱/실장치 재검사는 **미실행** — 평가기만 변경했습니다. 직전 코드25cc728의 [Windows40002809031](https://github.com/BomJin2/GuitarLab/actions/runs/40002809031)은 진행 중이며 본 후속을 아직 포함하지 않습니다.

### 4. 미구현 및 알려진 문제

55개 미확정이라고 해서 모두 올바르게 제외되는 실제 채점률을 보장하지 않습니다. 39개 실제 참조도 음정 미확정이며 참조의 pitch_midi 해석이 보류돼 음정/주법 수용으로 전환할 근거가 없습니다. 파형의 재상승/잔향/손잡음과 주석 누락 중 실제 원인은 이번 대응 감사로 확정하지 못했습니다. 전체 Phase7은 미완료입니다.

### 5. 다음 작업 계획

전체 회귀 CI와 현재 개발 도구를 보존합니다. 제품 검출 임계값/고급 점수는 바꾸지 않고, 독립 참조 품질과 분리해 검증할 수 있는 로컬 타격 관측 기능/오류 처리를 이어갑니다.

## 후속 — 고정 실제 타격 기준선·참조 음정 보호 (2026-10-24)

### 1. 작업 개요

작업 완료 날짜2026-10-24. 사전 고정한 공개 AG-PT-set 8개/281타격을 기존 native Detector로 측정하는 개발 전용 슬라이스를 완료했습니다. 제품 판정 엔진 개선/주법 채점 수용·Phase7 전체 완료는 아닙니다. 실제 결과를 보고 표본이나 임계값을 바꾸지 않았습니다.

### 2. 구현 및 변경 사항

- `scripts/prepare_agpt_onset_benchmark.py`: CSV4개/WAV8개의 고정 SHA와 수신 영수증을 재검증하고 PCM24/2^23만 float32로 변환합니다. gain·리샘플링·앞뒤 padding 없이 새 UUID에 보존합니다. 정수 타격 샘플과 원문 초 문자열·참조 수/중복/범위를 검사합니다.
- 실제 음정 열에 None8개·MIDI 범위 밖76개(440 등)를 발견했습니다. 범위 안197개도 정답 해석을 검증하지 않았으므로 **281개 전체를 타격 전용**으로 유지하고 raw 문자열/상태를 보존합니다. filename/자동 검출로 채우거나 음정 정확도를 계산하지 않습니다.
- `src-tauri/examples/benchmark_agpt_onsets.rs`: 공개 폴더/계획/원문/파생 SHA·schema를 확인하는 개발 CLI입니다. 기존 Detector/기본−50dBFS에 연속 PCM만 전달하고 공격/방출 샘플·음정 후보 또는 null·불연속·처리 시간을 별도 기록합니다. 제품 입력·UI·IPC·DB·모델·점수는 변경하지 않습니다.
- `scripts/evaluate_agpt_onsets.py`, 기존 `evaluate_guitarset_onsets.py`: 기존 최대 대응을 재사용해 타격 전용 일대일 대응과 전체 분모/추가·미확정·방출 지연을 기록합니다. 각 개발 도구의 경계 검사와 synthetic native 검사1개/CI 호출을 추가했습니다. SHA 고정 계획 원문의 자동 포맷을 막는 정확한 파일1개만 `.prettierignore`에 추가했습니다.

### 3. 테스트 결과

- `python -B -X utf8 -m unittest discover -s scripts -p "test_*.py"`: **105개 수행/104성공·링크 권한1개 제외/8.795초**. 새 catalog6·수신4·준비4·기존 대응 추가2·평가3을 포함합니다. 실제 데이터 없는 DEMO도 지문·경로/한도/실패·취소/기존 원문 보존을 검사합니다.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml` **성공**. 대상 example Clippy `-D warnings` **성공/1.21초**·native synthetic1개 **성공/0.28초**. 최초 sha2 digest의 LowerHex 미지원은 byte별 hex 변환으로, Clippy의 새 chunks 경고는 설치Rust/MSRV가 지원하는 as_chunks로 수정했습니다.
- 실제 준비/`cargo run --release --locked --manifest-path src-tauri/Cargo.toml --example benchmark_agpt_onsets -- <benchmark.json>`/평가 **모두 성공**. 고정8개/281참조·337검출/불연속0을 보존했습니다. 입력302.42초의 순수 처리 합계775.8173ms는 오프라인 처리량이며 장치/IPC 지연이 아닙니다.
- 실제 산출물은 공개 수신 UUID 아래 `onset-benchmark-dd73d90b-7477-49fe-b494-a1e6e56e9159`의 benchmark.json, detections-c233b695-53ef-40b7-93cf-a871b4527652.json, onset-evaluation-a9a97111-ebd2-4f6c-a5b5-d4b30b3ec4b0.json입니다. 원문과 결과 SHA를 연결하며 Git/배포물에서 제외합니다. source manifest SHA6d965d5e…/metadata manifest SHAf0ea7165…/계획 SHA82356f0f…입니다.

| 타격 허용오차 | 대응/281참조 | 추가/337검출 | precision | recall | F1 |
|---|---:|---:|---:|---:|---:|
| 5ms |97|240|0.2878|0.3452|0.3139|
| 10ms |187|150|0.5549|0.6655|0.6052|
| 25ms |237|100|0.7033|0.8434|0.7670|
| 50ms |281|56|0.8338|1.0000|0.9094|
| 120ms |281|56|0.8338|1.0000|0.9094|

50ms 대응의 signed 중앙−7.292ms/절대 중앙7.583ms/p95 35.083ms입니다. 모든337결과의 own attack→방출 중앙100.646ms/p95 213.979ms는 별도 알고리즘 지연입니다. 음정 후보243개/미확정94개를 모두 포함했습니다. 모든 표본의 첫4096/끝10080프레임 참조는0개여서 초기/끝 경계 recall을 검증한 것은 아닙니다. 대응은 최대 개수이며 전체 오차 최소화를 보장하지 않습니다.

- 이번 변경의 새 원격 CI/전체 프론트·모델·사용자 실제 입력 검사는 **미실행**입니다. 직전089e7ba의 원격39971696949 전 단계 success와 구분합니다. 제품/AI 코드가 바뀌지 않아 해당 로컬 반복은 하지 않았고 새 code push CI에서 전체 회귀를 확인합니다.

### 4. 미구현 및 알려진 문제

타격 대응만으로 음정/주법·실제 채점 정확도나 허위 감점률을 계산하지 않습니다. 추가56개가 모두 제품의 오감점이라는 뜻도 아닙니다. Native는 음정 미확정 타격도 출력하며 기존 제품은 저신뢰를 별도로 처리합니다. 독립 연주자/학습 holdout·왜곡 전기기타/SSL 실제 지연·연속 F0/주석 없는4기법은 미검증입니다. 전체/내부 ZIP MD5/CRC는 미검증이며 선택8개만 전체 SHA/CRC를 확인했습니다. 비선택 soundhole 파일1개의 CSV/ZIP 크기 차이와 음정 원문 해석은 해결되지 않았습니다. 고급 실시간 점수는 계속 비활성입니다.

### 5. 다음 작업 계획

추가56개의 대응/음정 미확정 문맥을 원래281/337분모 그대로 대조합니다. 후처리로 분모를 숨기거나 이 표본에 맞춰 제품 임계값을 바꾸지 않습니다. 새 CI를 확인하고 독립 참조 부족·별도 Windows·특화 모델 이용 조건은 각각 남은 수용 조건으로 유지합니다.

## 후속 — 고정 소량 WAV 수신·형식 검증 (2026-10-24 완료)

### 1. 작업 개요

10-23에 소량 표본 기준을 고정했고10-24에 실제 수신/형식을 검증합니다. 결과를 보며 표본을 바꾸지 않고 기존 검출기 평가용 원문을 준비하는 슬라이스입니다. 8개 수신/형식 검증을 완료했습니다. 아래 당시 중간 결과는 이력이며 실제 타격 기준선은 위 최신 절에서 별도로 기록합니다.

### 2. 구현 및 변경 사항

`fixtures/agpt-onset-sample-v1.json`에8개/기타0·6/기법4·5/줄1·6·타격 참조281개·원문/압축 크기/CSV SHA/CRC/예상 프레임 수를 고정했습니다. 계획5052바이트/SHA82356f0f7f764c066a6a15b85d976521c76327a1d492dcb95702b56839dc427e를 개발 코드에서 확인합니다. 데이터의 파일명·지문/출처만 Git에 보존하며 실제 WAV/사용자 파일을 배포하지 않습니다.

`scripts/fetch_agpt_audio_sample.py`는 작업 여유512MiB·부분 수신40MiB/파일12MiB/원문합계64MiB·경로/중복·CRC/고정SHA·실제 mono/PCM24/48kHz/프레임과 본문 길이를 검증한 뒤 새 UUID에만 보존합니다. 저작자/출처·CC BY4.0 고지를 먼저 씁니다. 실패/취소는 상태 영수증과 이미 검증한 파일을 보존하며 새 표본으로 대체하거나 원문 gain을 정규화하지 않습니다. 외부 Python/모델을 실행하거나 사용자 입력을 캡처하지 않습니다. 계약은 docs/12에 먼저 기록했습니다.

### 3. 테스트 결과

- 대상4개 **성공/0.127초**. 지문/경로/중복/한도, CRC/SHA/프레임·채널·PCM폭, 기존 목적지 보존, DEMO8개 완료/중간취소·기존 자료/검증 파일 보존을 확인했습니다.
- 전체 도구96개 **95성공/링크권한1제외/8.702초**. 부모 프로젝트/개인 자료·실장치를 쓰지 않는 임시 DEMO 검사입니다.
- 실제8개 수신/개별 전체CRC·고정SHA·PCM24/mono/48kHz/14,516,234프레임 **성공**. 부분 수신34,409,229바이트·원문43,550,792바이트/302.42초이며 d16bec1f-a3bb-465c-91b6-731365fd0d3c에 보존했습니다. manifest SHA6d965d5e70f9e1bfb13c36a047217f2ad3931da4c99f2e324261141da9b8b707입니다. 전체/내부ZIP CRC·MD5 확인, 실제 onset/음정 평가·AI/장치 검사는 아직 **미실행**입니다.
- 직전 CSV 소스089e7ba의 [원격39971696949](https://github.com/BomJin2/GuitarLab/actions/runs/39971696949)/job120475761747는 프론트436개·기본228/확장231Rust(각26제외)·AI113/1.81초·도구86/14.322초·최소Rust1.90/1분37초와 사후 정리까지 **전 단계 success**입니다. 이번 새 도구의 원격 CI를 대신하지 않습니다.
- 이번 후속의 프론트/Rust 빌드·모델/사용자 수동 검사는 **미실행** — 제품 코드를 바꾸지 않았으며 실제 검출기는 다음 단계에서 별도로 평가합니다.

### 4. 미구현 및 알려진 문제

원래 메타데이터에 주석 없는 벤딩/해머링/스타카토/비브라토·연속 F0 정답 부족, 초/샘플 열의 최대1.2샘플 차이, 연주자ID/학습 split 독립성 미확정은 유지합니다. acoustic pickup 표본의 결과를 왜곡 전기기타/SSL 지연이나 일반 주법 지원으로 확대하지 않습니다. 고급 점수는 비활성입니다.

### 5. 다음 작업 계획

8개 검증과 원문 지문 재검사를 마치고, PCM24를 gain 정규화 없이 별도 float32 파생 입력으로 준비해 기존 검출기의 타격 시각/미검출/추가 검출과 음정 보류를 평가합니다. 감점/실시간 코드·주법 엔진을 먼저 바꾸지 않으며 전체 Phase7 완료로 표시하지 않습니다.

## 후속 — 내부 오디오ZIP의 제한 목록 읽기와 표본 계획 (2026-10-23)

### 1. 작업 개요

작업 날짜2026-10-23. 다음 오디오 평가를 준비하면서 전체6.7GB를 받지 않고 내부 파일 목록을 안전하게 읽습니다. 목록/표본 사전 계획 검증이며 WAV 추출·주법/타격 판정 수용은 아닙니다.

### 2. 구현 및 변경 사항

`scripts/agpt_audio_catalog.py`에 고정 stored 멤버의 중앙/로컬 헤더·이름/플래그·크기/범위를 확인하는 제한 뷰를 추가했습니다. seek를 원본 HTTP 위치로 매핑하고 내부ZIP 전체를 읽어 건너뛰지 않습니다. 부모 RangeReader의 총2MiB 한도/정확한HTTP206을 재사용하고 새 UUID 목록 영수증만 씁니다. WAV 추출·외부 코드/모델 실행·앱/개인 파일 변경은 없습니다. docs/12의 개발 계약을 먼저 기록했습니다.

### 3. 테스트 결과

- 경계/실제 모의 중첩 ZIP·반복 실행 보존6개 **성공/0.076초**.1MiB 앞선 멤버를 건너뛰어 뒤 파일을 읽어도 수신이2KiB 미만임을 확인했습니다. 압축/암호화/이름·헤더/길이/범위/잘린 응답을 거부합니다. 최초 경계 테스트의100바이트 크기 감소는 ZIP의 끝 목록만 줄여 실제 멤버 밖 조건이 아니어서 가정이 실패했고, 멤버 끝−1의 정확한 경계로 테스트를 바로잡았습니다.
- 실제 공식 내부 목록 **성공**: 총183,179바이트 수신/1141파일·WAV추출false, agpt-audio-catalog-7959c80d-de13-4daa-b812-edd97e33408d.json/SHA3acafb97…입니다. ETag는 null, 전체/내부ZIP CRC·MD5는 미검증입니다.
- CSV1141개와 내부 목록의 파일명 집합/중복은 일치했습니다. **전체 크기 일치 가정은 실패**: soundholepick_mf_MicRos_20230202의 string1 파일1개가 CSV7,603,110/ZIP8,148,702바이트로 다릅니다. 확인 전 해당 파일을 자동 분석하지 않고 차이를 보존합니다. 원인이 메타데이터 오류인지 실제 파일 변경인지는 미확정입니다.
- 오디오 결과를 보기 전에 guitar_id0/6 × 기법ID4/5(하모닉스/팜뮤트) × 줄1/6,≤60초/12MiB/8~128개 주석/각 조합 사전순 첫 파일을 선택했습니다. 선택8개 모두 CSV/ZIP 크기 일치·총43,550,792바이트/압축34,225,201바이트·타격 참조281개이며 위 불일치 파일은 이 사전 기법 조건에 속하지 않습니다. 선택 파일이 불일치하면 다음 파일로 몰래 바꾸지 않고 거부합니다. agpt-sample-plan-be6bb6a9-b6d0-450c-942b-143e6f2caa9d.json에 기준/파일명/크기/원본SHA를 보존했습니다.
- 전체 도구 재검사/이번 소스의 새 원격 CI는 아직 **미실행**이며 후속 기록합니다. 기존 CSV 소스089e7ba의 원격39971696949도 별도 추적합니다. 프론트/Rust·AI/장치 재검사는 **미실행** — 해당 제품 코드는 바꾸지 않았습니다.

### 4. 미구현 및 알려진 문제

WAV payload 전체의 크기/SHA/형식·실제 타격 검출 평가는 아직 **미실행**입니다. 범위 읽기/중앙 목록의 CRC 선언만으로 파일 무결성을 보장하지 않습니다. 같은 데이터의 자동 주석과 실제 주법 정답을 혼동하지 않으며 연주자 ID/학습 split 독립성도 미확정입니다. 고급 점수는 계속 비활성입니다.

### 5. 다음 작업 계획

정해진8개만 압축 약32.7MiB/원본 약41.6MiB 범위에서 CRC와 CSV의 고정SHA를 확인해 새 폴더에 보존하고 PCM/WAV 형식을 검증합니다. 전체ZIP/모델은 받지 않으며 파일/정답 변경이나 실패 표본 자동 교체 없이 문제를 기록합니다. 이후 기존 검출기를 바꾸기 전에 타격 검출/음정 관측의 분모와 지연 오차를 고정 평가합니다.

## 후속 — 정밀 onset 참조의 CSV 확보·형식 확인 (2026-10-23)

### 1. 작업 개요

작업 완료 날짜2026-10-23. 앞선 정밀 타격 시점 후보 AG-PT-set의 공식6.7GB 원본에서 작은 메타데이터만 선택해 실제 주석 범위를 확인했습니다. 개발 데이터 준비 슬라이스 완료이며 오디오/검출 정확도·실시간 주법 채점/전체Phase7 완료가 아닙니다.

### 2. 구현 및 변경 사항

`scripts/fetch_agpt_metadata.py`는 공식 record10159492/CC BY4.0·ZIP6,749,621,615바이트/선언 MD5를 확인하고 고정 CSV4개만 선택합니다. 기존 RangeReader/read_member를 재사용해 HTTP206/정확한 범위·부분 수신2MiB 한도·고정 크기/압축크기/CRC/개별SHA·UTF-8/CSV 행 구조를 검사합니다. 원문·출처/조건/개별SHA/헤더·행 수/수신량/ETag 유무·실패/취소 상태를 새 UUID 폴더에 보존하며 기존 파일을 지우거나 바꾸지 않습니다. 공식 ZIP의 Python 코드와 음원/모델은 읽거나 실행하지 않습니다.

검사6개는 고정 레코드/주소/허가·중복 항목·64KiB 응답·CRC/SHA/압축방식·CSV 인용 줄바꿈/중복헤더/열수/UTF-8/행한도·취소/실패와 기존 자료 보존을 다룹니다. docs/12에 계약을 먼저 기록했습니다. 제품/UI/IPC·입력·점수·모델을 변경하지 않았습니다.

### 3. 테스트 결과

- 최초 경계6개 **성공/0.091초**·전체도구86개 수행 **85성공/링크권한1제외/9.502초**. 고정SHA/행한도 추가 후 대상6개도 **성공/0.079초**이며 최종 전체 재검사는 후속 기록합니다.
- 공식 API7,337바이트·ZIP 중앙목록1,497바이트의 읽기 **성공**. 내부 audio.zip은 ZIP_STORED임을 목록에서만 확인했으며 오디오 내용은 받지 않았습니다.
- 첫 실제 CSV 수신 **성공**: 부분 수신468,363바이트/원문합계4,455,550바이트, 기법12행/파일1141행/악기7행/음표32,592행. 원문은 fixtures/external/agpt-10159492/cf7d4a54-08a7-40b8-b49e-90290c2da277에 지문/출처와 보존했습니다. 고정SHA 추가 후 새 UUID의 두 번째 수신도 검증 중입니다. ETag는 실제 응답에 없어 null이며 전체 ZIP MD5는 미검증입니다.
- 로컬 SHA 전수 재검사·참조 관계/중복/시간 사전 점검:32,592행은809개 파일에 대응하고 미참조 파일332개, 같은 파일/샘플 키 중복0입니다. 8개 주석 기법의 분모는1950/1968/2167/1943/2092/7588/7227/7657이며 나머지4개 기법은0행입니다. agpt-reference-preflight-fb443af2-5380-40f4-ba26-87c11dc00197.json에 보존했습니다.
- ‘초 값×48kHz와 샘플 값 차이≤1샘플’ 사전 가정은 **실패**:96행이1샘플을 넘고 전체 범위−0.24~+1.20샘플(최대0.025ms)입니다. 단위/양자화 차이의 원인은 확정하지 않았고 원문 두 값을 보존합니다. 이 관측을 검출기 오류나 실제 정답 시각 보증으로 바꾸지 않습니다.
- 프론트/Rust·실제 모델·장치/사용자 조작 재검사는 **미실행** — 이번 후속은 개발 데이터 도구만 변경했습니다. 직전 제품 d17d2b4의 전체 회귀/독립 설치 성공과 구분합니다.

### 4. 미구현 및 알려진 문제

[공식 데이터](https://zenodo.org/records/10159492)와 [저자 논문](https://domenicostefani.com/publications/2024AM-preciseonset.pdf)은8개 기법의 onset 주석을 설명합니다. 실제 CSV의 벤딩/해머링/스타카토/비브라토에는 주석이 없고 연속 F0 곡선도 확인하지 않았습니다. 주석 파일의7개 player_id 값을7명의 독립 연주자로 단정하지 않습니다. 정정: 논문 서론은7명/6악기로 설명하지만 본문/악기 표는7악기이므로 과거의 ‘논문6명’ 서술을 취소합니다. CSV ID와 학습/시험 독립성은 별도로 확인해야 합니다. CSV의 실제 개방현 매핑은1=64(E4)~6=40(E2)이며 논문의 줄 번호 설명만으로 반대로 바꾸지 않습니다. 자동 frequency_aubiopitch 값을 독립 정답으로 사용하지 않습니다.

오디오 원본 SHA/WAV/실제 onset·음정 품질·SSL 장치 지연은 아직 **미실행/미측정**입니다. 읽은 메타데이터/전송 CRC·개별SHA가 전체6.7GB ZIP의 MD5 검증을 뜻하지 않습니다. 고급 점수는 계속 비활성입니다.

### 5. 다음 작업 계획

새 SHA 경로의 실제 재수신·전체 도구 회귀와 문서/Git 정리를 마칩니다. 이후 주석이 있는 팜뮤트/하모닉스 등 제한된 타격 참조의 작은 고정 오디오 표본을 사전에 정하고, 내부 stored ZIP의 선택 읽기/메타데이터 WAV SHA 대응을 검증합니다. 전체 오디오/모델을 자동 수신하거나 주석 없는 주법을 정답처럼 평가하지 않습니다.

### 최종 실행 결과

고정SHA 검증 경로로 두 번째 수신 b35fc059-ffea-4d7d-b0cc-a8486cbad8e3도 **성공**, 네 CSV 원문 전체와 manifest는 첫 수신과 바이트가 같습니다. 부분 수신도468,363바이트로 같습니다. 최종 전체도구86개 **85성공/링크권한1제외/9.175초**와 대상6개/0.079초를 확인했습니다. 새 제품 빌드/AI·오디오 평가는 실행하지 않았습니다. 다음은 내부 ZIP의 중앙 목록을 안전하게 읽는 경계와 사전 고정 표본 준비입니다.

## 후속 — 오류 창의 원본/평균 축소 주파수 계수 대조 (2026-10-23)

### 1. 작업 개요

작업 완료 날짜2026-10-23. 바로 아래 문맥 감사에서 주석상 단음이 유지된18곳을 포함한 기존 오류48곳의 파형 성분을 확인했습니다. 개발 전용 측정/관측 완료이며 검출기 개선·주법 정답·실시간 점수 수용은 아닙니다.

### 2. 구현 및 변경 사항

`audit_guitarset_pitch_windows.py`에 명시적 `--signal`을 추가하고 개발 결과를 schema2/window-signal UUID 파일로 구분했습니다. 오류가 있는 원본 f32 조각만 제한된 경로/크기·SHA/유한성 검증 후 읽고, 원본3072점/3프레임 평균1024점의 참조·검출 주파수 Hann 창 계수·비율dB와 raw RMS/peak를 보존합니다. 수치 바닥 비율은null이며 confidence/실제 성부 판정으로 바꾸지 않습니다. 각 비교 창의 DC를 제거하는 계수 측정이므로 native의 전체1초 DC 처리/음정 선택과 계산 동등성을 주장하지 않습니다.

같은 테스트 파일에 알려진 저음/참조 혼합·DC/무음·입력/음역 경계·PCM 크기/변조/NaN 거부4개를 추가했습니다. 제품 코드·UI/녹음/모델/원본·이전 보고서는 변경하지 않았습니다.

### 3. 테스트 결과

- 대상8개/0.056초 **성공**, 전체 scripts74개 수행/8.491초:73성공·링크 권한1제외입니다. 새 4개와 기존 4개를 합친 개수이며 제외를 성공으로 세지 않습니다.
- 실제 `...audit_guitarset_pitch_windows.py <benchmark.json> <기존native보고서> --signal` **성공**. 전체3458/단음838/기존 오류48 등 문맥별 요약은 이전 감사와 같습니다.
- 보존 결과는 공개 GuitarSet 폴더의 `benchmark-fd65afb7-fb38-4270-9ca0-500ab9bd5537/window-signal-b0bbc30e-a383-4e49-a280-7ea9c9142bf6.json`입니다(Git/배포물 제외). 조각 SHA와 기존 보고서/원본 지문을 연결했으며 새 네트워크 요청/모델 실행은 없습니다.

| 주석상 단음 문맥의 오류 | 지점 수 | 원본의 검출/참조 계수비 범위dB |
|---|---:|---:|
| BN solo · 약1옥타브 낮음 |7|−4.422~+1.663|
| Jazz solo · 약19반음 낮음 |10|−11.232~+0.102|
| Funk comp · 약1옥타브 낮음 |1|−15.290|

이18곳의 원본/평균 축소 후 계수비 차이 최대는0.009691dB였습니다. 첫 BN 오류 창은 참조196.34Hz/검출98.253Hz에서 원본 계수0.011419/0.013829로 낮은 쪽 성분도 관측됐습니다. 이번 좁은 측정만으로 평균 축소가 모든 낮은 음정 오류를 만든다고 볼 수 없으며 실제 저음 성부·잔향·주석 누락/오류 중 원인을 확정하지 않습니다.

### 4. 미구현 및 알려진 문제

유한 Hann 창의 누설과 가까운 음/배음을 분리하지 않았습니다. 분석 계수는 모델 신뢰도나 실제 연주의 정답이 아니며 sample-accurate 주법/허위 감점률·일반화 성능은 미측정입니다. 실제 기타/DI의 독립 연속 정답이 부족해 자동 옥타브 보정이나 고급 채점을 활성화하지 않습니다. 제품/프론트/Rust/새Windows 앱 재검사는 제품 코드 변경이 없어 이번 범위에서 **미실행**입니다. 현재 사용자의 수용 앱을 유지합니다.

### 5. 다음 작업 계획

고급 판정 수용에는 자동 주석과 분리된 실제 음정/주법 정답 자료가 계속 필요합니다. 확보되지 않은 정답을 만들어 점수를 연결하지 않으며 이 의존성과 독립적인 Phase8 최신 설치 패키지/실행·제거 검증을 이어갑니다. 남은 단계/조건은 REMAINING-WORK.md와 진행README를 따릅니다.

## 후속 — 큰 음정 오류의 분석 창 주석 문맥 대조 (2026-10-23)

### 1. 작업 개요

작업 완료 날짜2026-10-23. 기존 오류48곳의 다음 원인 분리로, 같은 원본4개/고정91창/3458지점을 재사용해 중심뿐 아니라 분석 창 전체의 주석 문맥을 대조했습니다. 개발 전용 감사 도구/실제 관측 완료이며 검출 성능 개선·실시간 주법 채점 수용이나 전체 Phase7 완료를 뜻하지 않습니다.

### 2. 구현 및 변경 사항

- docs/12에 개발 결과 schema1과 SHA/고정 분모·분류 계약을 먼저 정의했습니다.
- `scripts/audit_guitarset_pitch_windows.py`: 기존 native schema2/benchmark/원본 지문을 연결해 검증합니다. 실제1024점 축소 창을 원본3072프레임(약69.66ms)·같은25ms hop/중심으로 재구성하고 고정17지점에서 연속 참조를 조회합니다. 참조 공백·무성·다성·다른 단음의 존재를 별도로 보존하며 창 순서/중복·시각/참조 불일치·비유한 후보를 거부합니다.
- 모든 단음 참조838지점을 대조군으로 집계하고 후보677/적중629/큰 오류48/누락161을 유지합니다. 오류만 골라 높은 정확도로 보고하지 않습니다. 새 UUID 결과만 생성하고 원본/기존 보고서·검출기/제품 점수/모델·UI를 바꾸지 않습니다.
- `test_audit_guitarset_pitch_windows.py`: 실제 샘플 범위·중심, 불확정과 무음 구분, 복합 문맥/50cents 경계, 누락/중복/잘못된 보고서 검증4개를 추가했습니다. `REMAINING-WORK.md`에는14단계 중9개 기본 범위 완료/5개 부분 상태와 남은 외부 조건을 정리했습니다.

### 3. 테스트 결과

- 신규 unittest4개/0.004초 **성공**. `python -B -X utf8 -m unittest discover -s scripts -p "test_*.py"`:70개 수행/9.802초,69개 성공·링크 권한 의존1개 제외입니다. 제외를 성공으로 세지 않습니다.
- 실제 감사2회 **성공**. 전체3458=단음838+다성772+주석상무음474+불확정1374를 원래 분모대로 확인했습니다. 원본8개 지문/benchmark·native보고서 지문을 전후 대조했습니다.
- 결과 `benchmark-fd65afb7-fb38-4270-9ca0-500ab9bd5537/window-context-28ee3fbc-ccbd-4260-bd22-057d7eb65f83.json`은 기존 공개 GuitarSet 폴더에 보존합니다(Git/배포물 제외). 최초 window-context-838b9f37… 결과도 덮어쓰지 않았습니다.

| 분석 창 주석 문맥 | 단음 참조 | 후보 |50cents 이내|초과 오류|누락|
|---|---:|---:|---:|---:|---:|
| 창 전체의 고정 주석이 중심±50cents 이내 단음 |570|503|485|18|67|
| 일부 주석 불확정 |225|149|124|25|76|
| 다른 단음 음정 존재 |42|24|19|5|18|
| 다성 참조 존재 |1|1|1|0|0|

큰 오류48곳 중18곳은 창 전체 고정 조회에서 단음이 유지되는 주석이었습니다. 이18곳은 한 옥타브 낮음8곳·약19반음 낮음10곳입니다. 중심 앞뒤 음 전환만으로 모든 오류를 설명할 수 없다는 관측이며 실제 저음 성부/잔향·배음·주석 누락 중 원인을 확정한 것은 아닙니다. 조건부503개만의 성적을 전체 단음 검출 성적으로 사용하지 않습니다.

### 4. 미구현 및 알려진 문제

고정17지점의 자동 주석은 창의 모든 실제 신호/성부를 보증하지 않습니다. 새 ground truth·DI/왜곡/주법 이름·허위 감점률은 미확보/미측정입니다. FFT 성분/검출기의 후보 선택 원인 대조는 후속입니다. 앱/프론트/Rust·모델 추론 재검사는 제품 코드가 변하지 않아 이번 슬라이스에서 **미실행**이며 현재 수용 앱을 유지합니다. 새 라이브러리/모델·대규모 자료 수신은 없습니다.

### 5. 다음 작업 계획

위18곳의 원본 창 파형에서 참조/검출 주파수 성분과 native 후보 선택을 대조합니다. 데이터에 맞춘 일괄 옥타브 보정/점수 연결을 하지 않고 원래 대조군·실패 분모를 유지합니다. 직전 화면 유지 수정 CI 최종도 별도로 확인하고 이번 개발 도구 변경과 구분해 Git에 보존합니다.

## AG-PT-set 공식 라이선스 메타데이터 확인 — 2026-10-23

### 1. 작업 개요

작업 날짜2026-10-23. 기존 공개 자료 검토 중 라이선스 표시를 확인하지 못했던 부분만 공식 메타데이터로 보완했습니다. 이 읽기 전용 조사는 완료했으며 주법 정확도/허위 감점률 수용과 전체 Phase7은 미완료입니다.

### 2. 구현 및 변경 사항

[Zenodo 공식 레코드 API](https://zenodo.org/api/records/10159492)의 record10159492/DOI10.5281/zenodo.10159492에서 license.id=`cc-by-4.0`, access_right=`open`을 확인했습니다. 제한된 JSON7337바이트만 읽어 개발 검증 receipt에 보존했습니다. 레코드의 라이선스 이름 확인이며 데이터별 주석 품질을 검증한 결과가 아닙니다. 제품 코드·모델·점수 정책은 변경하지 않았습니다.

### 3. 테스트 결과

- 공식 API JSON의 레코드 ID/DOI·라이선스·공개 상태 읽기 **성공**. 근거는 target/runtime-validation/agpt-license-metadata-20261023.json입니다.
- 오디오·주석·모델 다운로드/실제 분석은 **미실행** — 이번에는 메타데이터만 확인했습니다.
- 앱/자동 회귀 재검사는 **미실행** — 제품 코드 변경이 없습니다.

### 4. 미구현 및 알려진 문제

[저자 논문](https://domenicostefani.com/publications/2024AM-preciseonset.pdf)의 주석 범위 제한은 유지합니다. pitch_labels라는 파일명이나 라이선스 확인만으로 연속 F0 정답이 있다고 판단하지 않습니다. bending/hammer-on/staccato/vibrato의 정답 부족은 해소되지 않았으며 실시간 고급 채점은 계속 비활성입니다. 아래2026-10-22의 라이선스 미확인 설명은 당시 조사 이력입니다.

### 5. 다음 작업 계획

정밀 onset 참조로 활용할지와 연속 음정/주법 참조 요구를 분리해 후속 범위를 정합니다. 대용량 자료를 자동 수신하거나 이 확인만으로 로드맵 완료 표시를 변경하지 않습니다.

## 실제 DI 주법 파일 관측 — 2026-10-21 진행 중

### 작업 개요

공식 Guitar-TECHS의 두 연주자/벤딩·비브라토 DI4개로 기존1초 음정 추적기의 관측 범위를 확인합니다. 연속 음정 정답이 없어 주법 정확도·깊이/속도 오차/허위감점률 검증으로 간주하지 않습니다. 제품 채점은 변경하지 않으며 전체 Phase7은 미완료입니다.

### 구현 및 변경 사항

- `scripts/guitar_techs_audio_probe.py`/test: 고정4개 이름·압축/원본 크기, 기존 공식 metadata 검증/HTTP206·ETag·CRC/개별SHA와 새 UUID 보존, 여유1GiB 확인을 추가했습니다. 명시적 `--download`만 수신하며 모델·개인 녹음을 사용하지 않습니다. 준비 시 원본 전후 지문을 확인하고, 크기/채널을 제한한 PCM16/24/32를 정규화 gain 없이 별도 float32 창에 변환합니다.
- `fetch_guitarset_sample.py`의 기존8MiB 요청 상한/기본15MiB 누적 상한을 유지하면서 고정 DI를 위한 명시적96MiB/ZIP 누적 예산만 허용했습니다. 검증 가능한 최대256MiB이며 전체 ZIP 응답/리다이렉트는 계속 거부합니다.
- `audio/technique_benchmark.rs`는 cfg(test) 전용입니다. 고정48창/경로·시각/지문을 검사해 raw motion·coverage·관측 cents/주기 변화·처리 시간·경고만 새 JSON에 기록합니다. 정답 주법 필드를 받거나 제품 점수/라이브 경로에 연결하지 않습니다.
- docs/09에 결과를 보기 전 선택 정책(1·6·…·56초/각1초)을 기록했습니다. [공식 레코드](https://zenodo.org/records/14963133)의≤100ms 정렬 오차와 이전 MIDI의 연속 pitchwheel 부재를 한계로 유지합니다.

### 테스트 결과

관련 Python20개/0.017초 성공, 개발 도구 전체46개 중45개/6.761초 성공·실제 링크 권한1개 제외입니다. 최초 전체 실행의8개 오류는 샌드박스 임시 파일 hardlink 액세스 거부였으며 같은 자체 fixture를 일반 Windows 권한에서 재검사했습니다. 원래 백업 게시 방식/덮어쓰기 보호는 바꾸지 않았습니다. 공개 자료 수신/준비·실제 native48창은 진행 중 또는 미실행이므로 아직 성공으로 기록하지 않습니다.

### 미구현 및 알려진 문제

공개 파일의 주법 이름은 각1초의 정답이 아니며, 무음/다른 변화·배음 혼동이 포함될 수 있습니다. 연속 정답 곡선·주법 분류/허위감점률·실시간 지연·사용자 장치 수용은 미실행/미측정입니다. 새 UI/모델 설치·개인 자료 분석은 없습니다.

### 다음 작업 계획

수신된4개 원본의 지문/형식을 확인하고 고정48창을 명시 실행합니다. 보류/실패를 분모에서 숨기지 않고 관측 결과를 기록한 뒤 고급 점수 적용 가능성과 남은 정답 자료 요구를 판단합니다. 기존 캐시 관리 앱은 유지합니다.

### 실제 DI48창 관측 완료

공식 ZIP의 고정4개/384,792,534바이트를 CRC·개별SHA로 확인했습니다. P1의 HTTP 범위 수신86,973,768바이트·P2 75,190,067바이트이며 전체 ZIP MD5를 검증한 것으로 기록하지 않습니다. `fixtures/external/guitar-techs-14963133/84500af8-5318-4d8b-8a0d-cd39bf8813c4/manifest.json`/귀속 문서를 보존했습니다. 원본은 변경하지 않았고 stereo는 사전 정책의 산술평균으로 별도 mono 창을 만들었습니다. 고정48창 준비/원본 전후SHA 성공, native 명시1개/14.09초 성공입니다. 조각은 `probe-4c794fdc-fb5e-4c05-8aeb-6d9249721039`, 결과는 `observations-869b3808-3711-4f5d-b9d6-7e57c29648d0.json`입니다.

| 원본 파일 범주 | 창 수 | 유지 | 상승 | 하강 | 주기 변화 | 보류 | 평균 coverage |
|---|---:|---:|---:|---:|---:|---:|---:|
| P1 Bendings DI |12|1|0|1|0|10|0.6886|
| P1 Vibrato DI |12|8|0|0|0|4|0.8202|
| P2 Bendings DI |12|1|1|0|0|10|0.3969|
| P2 Vibrato DI |12|9|0|0|0|3|0.8575|

전체48창에서 유지19/상승1/하강1/주기 변화0/보류27입니다. coverage는 유효 후보가 나온 지점의 비율이며 연주 정확도가 아닙니다. 보류에는 LOW_COVERAGE18창·LOW_LEVEL3창·NON_MONOTONIC_OR_AMBIGUOUS6창이 포함됩니다. 개별 디버그 처리 시간은2.28~364.62ms/중앙311.97ms이며1초 수집·파일/장치/왕복 지연을 포함하지 않습니다. 주기 변화0을 ‘실제 비브라토가 없었다’거나 ‘오류율100%’로 해석할 수 없습니다. 파일 이름이 각 창의 연속 음정 정답은 아니고 첫56초만 선택했으므로 민감도/깊이·속도 오차·허위감점률은 계속 미측정입니다. 결과를 보고 임계값/창을 바꾸지 않았습니다.

새 관측 도구 포함 확장 Clippy8.25초·Rust211개/11.40초·Rust1.90 check6.63초가 성공했습니다. 첫 Clippy의 나머지 연산 권고를 표준 is_multiple_of로 수정했고 최소1.90 호환을 실제 확인했습니다. 처음 샌드박스 전체 Rust 검사141개 성공/70개 실패는 자체 파일 hardlink 거부·import 저장 실패였으며 일반 Windows 권한에서211개가 모두 통과했습니다. 보호 정책/오디오 알고리즘을 완화하지 않았습니다. 이후 단일 앱 보호를 추가한 전체 회귀의 최신 수치는 PHASE-08을 따릅니다.

이 관측 슬라이스는 완료입니다. **실제 주법 정답 곡선·허위감점률/멀티피치 품질 조건이 남아 고급 실시간 점수/Phase7 전체는 미완료**입니다. 다음은 정답 궤적 확보/참조 정렬 검증이며, 독립적인 데이터 충돌 방지·릴리스 품질 작업을 계속합니다. 새 공개 자료를 제품에 포함하거나 개인 녹음으로 검증을 대체하지 않았습니다.

## Rust 최소 버전 실제 컴파일 후속 — 2026-10-20

별도 공식Rust1.90.0 최소 도구체인을 설치하고 기본1.98을 유지했습니다. 제품 `cargo +1.90.0 check --locked --offline --all-targets --all-features --manifest-path src-tauri/Cargo.toml --target-dir src-tauri/target/msrv-190`가1분14초, probe의 `--all-targets --manifest-path scripts/native-basic-pitch-probe/Cargo.toml`가29.27초에 성공했습니다. 아래의 ‘Rust1.90 실제 컴파일 미실행’은 이전 이력이며 현재는 두 후보 모두 실제 컴파일을 확인했습니다. 제품/실험의 Cargo.lock·MSRV1.90/모델/입력 보호 기준은 변경하지 않았습니다.

이는 check 프로필의 컴파일이며 Rust1.90으로 실제 장치/모델 추론을 재실행한 것은 아닙니다. 기존1.98의 모델 비교/합성·실제 샘플 검증과 구분합니다. 별도 도구체인 설치의 새로운 오류는 없었으며 `msrv-190-product-receipt.json`, `msrv-190-probe-receipt.json`과 해당로그에 잠금 파일 SHA/실행 범위를 기록했습니다. 실시간 다성 점수/주법 품질 미완료를 바꾸지 않고 독립 Phase8 작업을 계속합니다.

## 외부 전기기타 참조 검증 — 2026-10-20

### 작업 개요

- 검증일:2026-10-20. 앞선 GuitarSet의 학습 자료 중복 한계를 구분하고 공개 전기기타의 고정2개 표본으로 음표·시각 기준선을 추가했습니다. 이 검증 슬라이스는 실행했고 Phase7 전체/실제 고급 채점은 미완료입니다. 앱PID1768은 유지하며 개발을 계속합니다.

### 구현 및 변경 사항

- `scripts/fetch_guitar_techs_sample.py`·test: 고정 Zenodo14963133/CC BY4.0의6개 ZIP 중앙 목록과 MIDI8개만 선택적 Range/CRC·로컬SHA 확인합니다. 전체 ZIP MD5를 검사했다고 표시하지 않습니다. MIDI8개에는 pitchwheel 이벤트가 없어 연속 음정 변화 정답으로 사용하지 않으며 큰 DI WAV는 다운로드하지 않았습니다.
- `scripts/fetch_egset12_sample.py`·test: Zenodo11406378/CC BY4.0의 번호01/12를 분석 전에 고정하고 WAV/JAMS4개 전체15,442,646바이트의 공식MD5/크기와SHA를 검사했습니다. 가중치/개인 오디오/다른 표본은 받지 않았으며 외부 자료는 Git/앱 번들에서 제외합니다.
- `scripts/benchmark_egset12.py`·test:24bit stereo를 별도 float32 mono WAV/264개 PCM 조각으로 만들고 원본 지문을 재확인합니다. 정수 note_midi만 참조하며 구간 경계 전후30ms와 전환을 제외합니다. 연속 cents/주기적 변화의 정답으로 취급하지 않습니다. 기존 adapter의 PCM24 입력 제한을 임의로 확대하지 않았습니다.
- `src-tauri/src/audio/guitarset_benchmark.rs`: cfg(test) 도구에서 고정 EGSet12/48kHz·음표 구간 정책만 추가 허용합니다. 기존44.1kHz/GuitarSet 프로필·제품 IPC/실시간 엔진·DB는 유지합니다. `scripts/native-basic-pitch-probe`는 별도 고정8개 실제 입력의 동일 텐서 비교를 추가하며 제품 의존성으로 넣지 않습니다.

### 테스트 결과와 오류 해결

- stdlib 개발 검사 전체22개 성공: `ai/.venv/Scripts/python.exe -B -X utf8 -m unittest discover -s scripts -p 'test_*.py'`. 파일 정보/경로/지문·24bit 부호/두 채널 평균/짧은 전환·unison/무음 참조 경계를 검사합니다.
- `benchmark_egset12.py prepare <manifest>` 성공: TRACK53개/SPECTRUM211개=264개, 원본4개 불변. 공식 설명과 달리01번 두 채널에 최대약0.040 차이가 관측돼 동일 채널이라고 가정하지 않고 평균/차이를 기록했습니다.12번 채널 차이는0입니다.
- 기존 개발 Basic Pitch0.4.0 전체 파일 분석 성공(네트워크 차단). 총 참조174개/검출206개,50ms에서167개 대응/F1 0.87895,120·180ms에서169개/F1 0.88947·참조 미대응5개/추가 검출37개.01/12 각각120ms 조건의 대응 시각 절대 오차95백분위18.06/19.62ms입니다. 최대 일대일 대응은 총 시각 오차의 전역 최소 해를 보장하지 않습니다. 이 수치는 앱 MISS/장치 보정/실시간 오채점률이 아닙니다. 최초 준비 포함23.13초/다음0.357초는 전체 파일 배치 시간입니다.
- `GUITARLAB_GUITARSET_BENCHMARK=<EGSet12 benchmark.json> cargo test --locked --manifest-path src-tauri/Cargo.toml public_guitarset_reference_benchmark -- --ignored --nocapture` 성공:264개/24.10초. 안정 단음485점 중476개 후보/50cents 이내476개, 누락 포함98.14%; 안정 무음293점 중10개 후보, 안정 다성423점 중1개 단일 후보. 정수 주석 대비 관측값이며 연주 음정 오차의 정밀 정답이 아닙니다.400ms 전체211개 중 안정32개만 비교(전환179개 제외),참조66/후보66/일치59·F1 0.89394. 그중 무음8개는 모두 후보 없음이고 유음24개는 모두01번입니다. 유리한 제외/분모를 숨기지 않습니다.
- 별도 native 입력은 기존 SciPy의147/320 polyphase 변환을 사용해 양쪽 모델에 같은43844개 float32/22,050Hz를 줍니다. 두 표본의 시작0/2/4/6초로8개를 사전 고정하며 공식 모델의 스트리밍 정렬/반응 지연 검사와 구분합니다. 실제 텐서 동등성 최종 결과는 후속 절을 따릅니다.
- 개발 probe의 첫 실행은 cargo test만 실행해 이전 바이너리가 새 플래그를 거부했습니다. cargo build --locked --release로 실행 파일을 갱신한 뒤 재실행했습니다. 경로 이탈/지문 변조 거부 포함 개발 Rust4개 검사는 성공했습니다.

### 미구현 및 알려진 문제

- EGSet12는1명/앰프 마이크2개 표본이며 넓은 연주자·장치·왜곡/DI 분포나 학습 비중복을 증명하지 못합니다. 주석은 정수 음표/구간이며 연속 비브라토·벤딩 깊이/속도 정답이 아닙니다. Guitar-TECHS MIDI 역시 연속 pitchwheel이 없습니다.
- 실제 주법 후보의 진단 UI 수용/정답 대비 주기적 변화·실시간 허위 감점률/별도 Windows는 **미실행**입니다. 해당 자료·장치·수동 검증이 없으며 합성 검사로 대체하지 않습니다.
- Python 제품 adapter/프론트/IPC를 바꾸지 않아 이번 자료 도구만으로 제품 기능/채점 지원이 늘었다고 표현하지 않습니다. 현재 고급 악보의 UNSUPPORTED 감점 제외와 모니터 기본OFF를 유지합니다.

### 다음 작업 계획

- 실제8개 입력/24개 출력의 native 텐서 동등성은 통과했습니다(최대 절대 차이1.3113e-6, 허용 절대1e-4/상대1e-3). 모두 입력 보호 ANALYZE였고 같은 입력을4회씩 실행했습니다. 준비56.14ms/각 추론55.60~58.88ms이나 약1.99초 입력 문맥/출력 note 후처리·스레드·장치 안정성은 별개이며 실시간 채점 허용 지연으로 해석하지 않습니다. 결과는 `egset12-native-inputs-5757dfac-4b6f-4640-874f-7945f16cbb7b/comparison.json`의 PUBLIC_GUARDED_CONTRACT입니다. 원시 완전 무음의 불일치 이력은 유지합니다.
- MSRV 유지 후보의 실제 Rust1.90 컴파일/장치 회귀는 별도 환경이 없어 미실행이며, 설치된1.98에서의 검사만 보고합니다. 단음 회귀를 마무리합니다. 관측된 추가 검출/정답 부재는 기록하고 해당 모델을 즉시 실시간 점수로 연결하지 않습니다.
- 해결되지 않은 고급 채점 품질과 독립적인 안정성/데이터 보호 작업은 자동 진행 규칙에 따라 계속하며, 이전 Phase의 전체 완료로 위장하지 않습니다.

### 산출물

- EGSet12 원본: `fixtures/external/egset12-11406378/0cc73358-898c-46fa-be0b-5b036f9a0b28/manifest.json`.
- 파생 평가: 위 폴더의 `benchmark-c9d6294b-3a0c-47b8-9eb1-12deff5b26e9/egset12.json`, `basic-pitch-29926fe4-57f0-411a-80a5-a77bbc0505e9/results.json`, `results-d65e4ab8-1ea4-4811-9dd4-cce32008918e.json`.
- Guitar-TECHS: `fixtures/external/guitar-techs-14963133/1616949c-faf8-4f09-a2ce-36c1a7049ef9/manifest.json`(MIDI_VERIFIED/audioPresent=false).
- 다운로드/검사 로그와 고정8개 입력: `src-tauri/target/runtime-validation/egset12-*.log`, `external-helper-tests.log`, `egset12-native-inputs-5757dfac-4b6f-4640-874f-7945f16cbb7b/`.

## 단음 주기적 변화 진단 v2 — 2026-10-20

### 작업 개요

- 완료일:2026-10-20. 저장한1초 단음 궤적에서 제한된 주기적 변화의 속도·관측 깊이/반복 수·적합도를 계산하고 기존 진단에 표시합니다. 자동 검사/Windows 적용 완료이며 실제 기타의 주법 확인·전체Phase7 완료와 구분합니다. 자동 진행을 계속합니다.

### 구현 및 변경 사항

- `src-tauri/src/audio/pitch_track/oscillation.rs`: UI/입력 콜백과 분리된 순수 최소제곱 관측 함수. 충분한 유효율·주기성/시간 간격/급격한 도약 제외, 선형 추세 제거 후3~9Hz/0.1Hz 격자의 최고 사인 적합에서 깊이35~150cents/설명비율>=0.85/관측3회 이상만 반환합니다. 선형 추세의 창 누적 변화가50cents를 넘으면 제외합니다.
- `audio/pitch_track.rs`·tests: 기존 유지/상승·하강 조건을 우선하고 나머지 곡선에서만 OSCILLATING 후보를 검토합니다. 원래 YIN/실시간 단음 detector·Matcher/점수는 바꾸지 않았습니다. 강한/불확정 변화는 계속 보류합니다.
- `judgement/recorded_pitches.rs`·tests: 같은 소유권/SHA/READY/범위/누락/취소 경로를 유지하고 결과만v2/16필드·oscillation/null로 확장합니다. 저장/DB/Python 및 요청/StorageJob v1은 그대로입니다.
- `recordedPitchTrack.ts`·test: v1/15필드 읽기 호환, v2/16필드의 모션·중첩 수치·유효 시간/주기성·선형 추세·반복 수 검증을 추가했습니다. `RecordedPitchesPanel.tsx`·test와 test fixture는 최소 결과 문구와 ‘주법 확인/정답 확률이 아님’, 깊이 과소 관측 한계를 표시합니다. 핵심 계산은 컴포넌트에 두지 않았습니다.
- docs/12 계약 선행 수정 후 docs/02·05/진행 문서를 갱신했습니다. 외부 제품 의존성/모델/데이터 형식 마이그레이션은 없습니다.

### 테스트 결과와 오류 해결

- 최초 프론트 계약 검사7개 성공/1개 실패: 주기의 시작·끝 위상 때문에 순 변화가50cents를 넘는 정상 주기 곡선을 거부했습니다. 이를 임의 허용치 확대로 숨기지 않고 선형 추세 누적 변화 기준으로 바로잡아 native/decoder/계약을 일치시켰고 위상4개/지속 상승+주기 곡선 거부를 추가 검사했습니다.
- 순수/PCM 궤적 대상7개 성공/환경 의존 처리 시간1개 기본 제외. 실제 합성6Hz/peak-to-peak80cents의44.1/48/96kHz에서6.0Hz, 관측 깊이65.87/68.33/68.33cents·적합도약0.993을 확인했습니다. 깊이 과소 관측을 UI에 명시했습니다. 음량만 흔들리는 tremolo는 STEADY, 기존 강한 변화·도약/무음/잡음/클리핑·취소는 보류/거부입니다. 실제 기타 주법 검증은 아닙니다.
- 녹음 서비스5개 성공(새 합성 READY 테이크→v2/OSCILLATING 포함), 기존 원본/메타데이터·악보 보존/소유권·누락·손상·취소 회귀 유지. 프론트 계약/UI8개·타입 성공입니다.
- `pnpm verify:app`: **프론트318개/80파일·타입/린트·빌드24.28초·전체 포맷·Rust193개/11.09초·기본20개 제외·표준Clippy 성공**. 로그 `oscillation-verify-app.log`.
- `cargo clippy --locked --all-targets --all-features ... -- -D warnings`, `cargo test --locked --all-features ...`: **확장Clippy/전체196개·10.94초/20개 기본 제외 성공**. 내장 UI/원격 IPC 거부3개 포함, 로그 `oscillation-native-final.log`. 제외20개를 실행한 것으로 기록하지 않습니다.
- `pnpm tauri build --debug --no-bundle --config <새설정>`: Windows29.65초 성공. native linker의 import library 생성 안내 warning/기존 Vite chunk 크기·macOS 식별자 안내는 성공을 막지 않았고 Windows 기능 오류로 처리하지 않았습니다.
- runtime3393파일/64,095,996바이트를 SHA 확인해 새 portable8e4e12a3-4711-4d7c-82f1-120b909acbc2로 복사했습니다. 기존PID33060의 정확한 경로·활성녹음0/AI 자식 작업 없음을 확인하고 DB 백업 뒤 정상 종료했습니다. 새 **PID1768** 후보 실행/응답 및 실제v8 DB15개 테이블 행/내용SHA·모델 활성 marker4개 보존을 확인했습니다. 강제 종료/원본 덮어쓰기는 없습니다. 정확한 exe SHA/크기·창 정보는 `oscillation-candidate.json`, `portable-candidate.json`에 보존합니다.
- 전체 AI pytest·별도 Windows·실제 기타 주기적 변화 수용: **미실행**. Python 제품은 변경하지 않았고 별도 PC/전문가 주법 참조가 없습니다. 기존 사용자 단음 유지 표시 수용과 구분합니다.

### 미구현 및 알려진 문제

실제 비브라토·벤딩·슬라이드/레가토 주법 구분·감점/채점은 미구현입니다. 이 지표는 단음 궤적의 관측이며 옥타브/배음 혼동·왜곡/잡음·짧은 관측창·깊이 과소 관측 한계가 있습니다. 고급 모델의 실제 추가 검출/누락·onset/학습 외 자료 검증도 아직 부족합니다. 현재 앱의 녹음/프로젝트·보정/모니터 기본 꺼짐은 유지합니다.

### 다음 작업 계획

공개 학습 자료와 시점/출처가 분리되는 실제 전기기타/DI·주법 자료를 소량 검증해 단음/화음·주기적 변화 진단의 범위를 측정합니다. 새 가중치를 받거나 사용자 녹음을 자동 캡처/전송하지 않고 출처·허용 조건·원본 지문/사전 표본 선택·실패/제외를 기록합니다. 실제 수용 조건 전에는 고급 점수를 연결하지 않고 진행 가능한 기능/안정성 개발을 계속합니다.

## 재개: 퇴화 입력 원인·MSRV 유지·onset 측정 — 2026-10-20

### 작업 개요

- 사용자의 자동 진행 재요청을 적용해 검증 실패를 전체 작업 중단으로 처리하지 않고 원인 분석과 독립적인 측정을 계속했습니다. 이번 실험/측정 슬라이스 완료일은2026-10-20이며 고급 실시간 채점/Phase7 전체는 아직 미완료입니다.

### 구현 및 변경 사항

- 개발 probe에 정규화 연산 목록/중간값 비교와 별도 `--guarded` 입력 보호 계약을 추가했습니다. `signal_gate.rs`는 DC 제거 RMS<-65dBFS/클리핑0.1% 이상 입력을 모델 실행 전에 제외하고 비유한/범위/길이를 거부합니다. 원시 출력 비교 실패를 통과로 바꾸지 않습니다.
- 기본 개발 후보를 tract0.22.3/prost0.11.9로 바꾸고 Cargo.lock의 kstring을2.0.2로 고정했습니다. 공식 crates.io에서 kstring2.0.2의 MIT OR Apache-2.0/Rust1.73·yanked=false와2.0.4/5의 Rust1.96 요구를 확인했습니다. 제품 Cargo/MSRV·AI 설치 환경·앱은 변경하지 않았습니다.
- `scripts/evaluate_guitarset_onsets.py`, `test_evaluate_guitarset_onsets.py`: 기존 공개4개/6줄 note_midi 참조와 이미 보존한 전체 파일 예측만 재사용합니다. 같은 음의10ms 이내 unison 중복을 합치고50cents/50·120·180ms에서 최대 일대일 대응·조건부 시각 차이/누락·추가 이벤트를 계산합니다. 모델 재실행/개인 녹음 접근/새 가중치 다운로드가 없습니다.
- 변경 문서는 docs/09 사전 평가 조건, 개발 probe README와 progress입니다. 원본 파일/기존 결과를 덮어쓰지 않았습니다.

### 테스트 결과와 오류 해결

- 정규화10개 중간 연산 비교 성공. `tract-normalization-latest.txt`가 가리키는 새 폴더에 trace.json/개발 파생 ONNX/SHA/trace-comparison.json을 보존했습니다. 무음 Log 입력은 정확히 같은1e-10이지만 기준 ONNX Runtime 출력은 -23.0258522~-23.0258503으로 갈립니다. 최소값 차감 뒤7.62939e-6 범위가 나눗셈에서0~1로 증폭됩니다. native 정규화는0이며 Where에서0/0을0으로 처리합니다. **특정 최적화 오류라고 단정할 근거는 없고 퇴화 입력에서 수치 반올림을 증폭하는 문제**로 확인했습니다.
- 합성7개 보호 계약: tract0.23.8 및0.22.3 모두 성공. 무음/매우 작은 음량/DC는 NO_SIGNAL, 클리핑은 CLIPPED로 제외4개·모델 실행0회; 유효3개/9출력은 참조와 최대8.35e-7 차이 이내입니다. runtime-validation의 `tract-guarded-latest.txt`, `tract-0223-guarded-latest.txt`와 각 comparison.json에 보존했습니다. 무음의 원시 비교 실패 이력은 그대로입니다.
- MSRV 후보 준비 중 PowerShell 문자열 인용, 구형 protobuf 버전 누락, 고정 crate의 오프라인 캐시 부재를 수정했습니다. 처음 metadata에서 kstring2.0.5의 Rust1.96 요구가 확인됐고2.0.2를 고정한 뒤141개 전체에서1.90 초과 metadata가 없습니다. 실제 빌드는 설치 Rust1.98에서1분35초 성공했습니다. Rust1.90 실제 컴파일은 **미실행**(별도 toolchain 없음)입니다.
- 최신 기본 개발 probe: `cargo test --locked --release ...`3개 성공, fmt·`cargo clippy --locked --release --all-targets ... -- -D warnings` 성공18.58초(`tract-0223-clippy.log`). source/helper와 같은 입력의 실제 검증을 구분합니다.
- onset 경계3개 성공, 공개 원본8개 크기/SHA 확인 후 실제 재집계 성공. 참조773개/예측582개에서50ms 대응466개(F1 0.68782),120ms483개(F1 0.71292),180ms487개(F1 0.71882)입니다.120ms 조건의 미대응 참조290개/추가 예측99개, 대응된 쌍에 한정한 시각 차이 중앙값-7.43ms/절대p95 108.03ms입니다. 이 분포는 장치 지연·모든 이벤트 오차·실제 앱 감점률이 아닙니다. 결과 `onset-evaluation-df07055c-2e2f-4f79-a6c6-93a1feef2c61.json`(기존 공개 benchmark 폴더).
- 제품 코드/프론트·native·AI 환경이 바뀌지 않아 이번 제품 전체 검사/Windows 재빌드는 **미실행**, 앞선316개 프론트/192개 Rust·현재 사용자 수용 앱을 유지합니다. 별도 Windows/실제 DI 주법 참조도 미실행입니다.

### 미구현 및 알려진 문제

공개 표본/참조는 반자동이고 학습 split도 확인하지 못했습니다. 입력 보호가 신호 있는 구간의 추가 음/누락을 해결한 것은 아닙니다. native 제품 추론/재샘플링·연속 window/onset 판정·실시간 코드/주법 점수는 계속 미구현입니다. 따라서 실험 성공을 실제 채점 지원으로 기록하지 않습니다.

### 다음 작업 계획

단음 궤적에서 관측 가능한 주기적 음정 변화 지표를 별도 순수 함수로 추가하고, 불확실한 곡선은 보류하는 진단을 구현합니다. 벤딩/슬라이드/비브라토라는 주법의 실제 분류나 점수와 구분하며 기존 단음 채점/기록은 유지합니다. 고급 모델 품질·독립 참조 검증도 남겨 두고 진행 가능한 기능·안정성 작업을 계속합니다.

## 네이티브 모델/짧은 문맥 검증 — 2026-10-20

### 작업 개요

- 완료일:2026-10-20. 공개 기준선의 전체 문맥 이점과 네이티브 실행 가능성을 제품과 분리해 검사했습니다. **실험 도구와 측정 슬라이스는 완료**, 결과가 수용 조건을 통과하지 못해 고급 실시간 점수 적용/Phase7 전체는 보류·미완료입니다.
- 사용자 단음 궤적 표시 수용(유효94.7%/-0.6cents/주기성0.987)은 유지합니다. 현재 PID33060 앱을 종료·재실행하거나 개인 녹음을 추가 분석하지 않았습니다.

### 구현 및 변경 사항

- `scripts/native-basic-pitch-probe/{Cargo.toml,Cargo.lock,src/main.rs,verify.py,README.md}`: 별도 Cargo workspace·고정 tract-onnx0.23.8로 모델 SHA/크기·출력 규격/유한성을 검사하고 무음/세 음량440Hz/440+660Hz 합성 입력을 각4회 실행합니다. 같은 float32 입력을 기존 ONNX Runtime1.23.2와 비교하며 모든 결과는 새 UUID 폴더/새 파일만 사용합니다. `--without-optimizations`로 최적화 영향도 분리했습니다. 원시 차이를 임의 임계값으로 통과시키지 않습니다.
- 외부 버전/허용 조건: 공식 docs.rs/crates.io의 tract-onnx0.23.8, MIT OR Apache-2.0·Rust 최소1.91·yanked=false 확인. metadata129개(자체 프로젝트 포함)/전이128개에서 외부 라이선스 누락 없음, MIT/Apache 선택 가능 조합·Unicode/Zlib 조건을 확인했습니다. 설치 Rust1.98에서 개발 도구만 빌드하며 제품 MSRV1.90/Cargo.toml·lockfile은 변경하지 않았습니다. registry에0.23.9가 표시돼도 이를 설치/검증한 것으로 기록하지 않습니다.
- 모델은 기존 승인된 Basic Pitch0.4.0의230,444바이트/SHA `2c3c1d144bfa61ad236e92e169c13535c880469a12a047d4e73451f2c059a0ec` ONNX를 재사용했습니다. 새 가중치/AI 패키지 설치는 없습니다. 개발용 Rust crate 소스는 수신했습니다.
- `scripts/benchmark_basic_pitch_short_windows.py`, `test_benchmark_basic_pitch_short_windows.py`: 기존 고정 안정28개/400ms를 모두 별도 WAV로 만들어 기존 개발 어댑터 기본 설정으로 분석·중앙 시각 집합 비교합니다. 기존 최대 일대일50cents 대응/지표 함수를 재사용합니다. 원본8개/조각SHA·범위/크기·참조를 확인하고 네트워크를 차단합니다. 빈 결과/실패를 감추지 않으며 원본·기존 결과는 변경하지 않습니다.
- `.gitignore`: 개발 probe의 기본 target 제외. docs/00·09·08/progress는 사전 조건·실행 결과·의존성 보류와 재개 위치를 기록합니다. 앱 IPC/SQLite/프론트/오디오 콜백·점수는 변경하지 않았습니다.

### 테스트 결과

- `cargo metadata --manifest-path scripts/native-basic-pitch-probe/Cargo.toml --format-version 1`: 성공, `src-tauri/target/runtime-validation/tract-metadata.json`에 버전/라이선스 보존.
- `cargo build --locked --release --manifest-path scripts/native-basic-pitch-probe/Cargo.toml --target-dir src-tauri/target/native-basic-pitch-probe`: 최초 실패. 새 API의 macro import/`to_plain_array_view`와 SHA2 0.11의 hex 처리를 고친 뒤 성공(후속 빌드2.28초). `tract-build.log`/`tract-build-fixed.log`에 실패·해결을 구분합니다.
- `cargo test --locked --release --manifest-path scripts/native-basic-pitch-probe/Cargo.toml --target-dir src-tauri/target/native-basic-pitch-probe`: 최신1개 성공. `cargo fmt --check ...`·`cargo clippy --locked --release --all-targets ... -- -D warnings`: 성공(Clippy26.79초, tract-clippy.log).
- 실제 모델 실행: 성공. 최초2입력 `tract-probe-aaba02d9-41c7-4630-9643-46bd720d52b4`; 확장5입력 최적화 `tract-optimized-53017c68-4d12-41a8-a825-e75ed2396052`, 비최적화 `tract-typed-18b60c63-747a-48b2-8019-f3dd937cd60a`(모두 runtime-validation 하위).
- `ai/.venv-basic-pitch/Scripts/python.exe -I -B -X utf8 scripts/native-basic-pitch-probe/verify.py <기존ONNX> <각새결과>`: **전체 동등성 실패**. 절대1e-4/상대1e-3 기준이며 두 모드 모두 무음 최대 오차0.20893362(onset),0.00342447(note),0.02030101(contour). 비무음4개/각3출력은 최대 오차9.24e-7 이하로 성공했습니다. 최적화를 꺼도 무음 차이가 같으므로 원인을 최적화 하나로 단정하지 않습니다. 각 폴더 comparison.json/native.json/log에 보존합니다.
- 최적화 준비64.41ms/추론48.10~59.03ms, 비최적화 준비18.72ms/추론239.65~278.92ms. 각 입력4회뿐이며 모델 문맥43,844샘플/22,050Hz(약1.988초) 수집·실시간 queue/스케줄링·리샘플링/후처리 지연을 포함하지 않습니다. 실제 기기 실시간 p95를 의미하지 않습니다.
- 짧은 문맥 실행: 최초 `-I`의 도구 import 경로 누락과 조각의 `cases/` 하위 경로 누락을 수정했습니다. `.../basic-pitch-short-final.log`의 최종28개 분석은 성공/어댑터 오류0개입니다. 원본 SHA 확인은 초기 실행 후 별도로도8개 모두 통과했고 이후 실행 전에 확인하도록 보강했습니다. 지표가 바뀌지 않아 모델 추론은 불필요하게 반복하지 않았습니다.
- 실제 결과: `fixtures/external/guitarset-v1.1.0/e77d8f2d-9fa0-4e8e-a67b-454c6cacaa7f/benchmark-b831b6dd-5472-4754-9d88-d3dd7880cb99/basic-pitch-short-2ac90233-fcd9-4385-a85e-6f724f3be38c/results.json`. TP34/검출43/참조37 → precision0.79070/recall0.91892/F1 **0.85**. 전체 문맥의34/36/37·F1 0.93151보다 추가 후보가 늘었습니다. 참조상 무음3개 모두 후보가 나왔습니다. 원시 녹음 RMS는 -55.44/-54.79/-34.68dBFS여서 기존 -65dBFS 게이트만으로 이 문제가 해결된다고 주장할 수 없습니다.
- 짧은 문맥 최초18,364.86ms/후속126.05~152.31ms(기존 개발 Python3.10.8). 로딩/JIT/입력 변환/추론을 분리하지 않았고400ms 수집 대기도 포함하지 않습니다. 운영 cp312/네이티브의 실제 기타 성능으로 환산하지 않습니다.
- 개발 도구 경계2개(공개 원본 변조, 조각 해시/경로/참조/길이) 성공. 기존 관련11개와 합계13개 검사 결과는 최종 점검 절을 따릅니다. 모델 비교 실패를 도구 unit test 성공으로 덮지 않습니다.
- 최종 점검: `ai/.venv/Scripts/python.exe -B -X utf8 -c <4개 unittest 모듈 실행>`으로 fetch4/prepare3/기존 모델 지표4/짧은 창 경계2, 총13개/0.045초 성공. 신규 Python3개 AST 구문 검사와 `pnpm format:check`도 성공했습니다. 개발 probe 재실행의 기존 산출물 덮어쓰기 거부·전 파일SHA 동일 및 잘못된 모델 거부·새 산출물0개, 실제 음수 경로2개도 통과했습니다. 현재 앱PID33060은 같은 portable482122ef 경로/응답 True로 확인했고 재실행하지 않았습니다.
- 이번 제품 TypeScript/프론트 전체·제품 Rust 전체/Windows 재빌드·전체 AI pytest는 **미실행**: 제품 코드/의존성을 변경하지 않아 직전 프론트316개/제품Rust192개·확장Clippy/앱 실행 결과를 유지합니다. 별도 깨끗한 Windows는 장치 부재로 미실행입니다.

### 미구현 및 알려진 문제

- 완전 무음의 native/reference 출력 차이 원인은 미규명입니다. 새 의존성의 제품 채택/MSRV 변경·실시간 고급 점수 연결을 보류합니다.
- 짧은 문맥의 추가 검출/실제 onset 시간·허위감점률·DI/왜곡/주법별 정답은 미해결/미측정입니다. 참조가 반자동인 좁은4개/2명 자료이며 무음은 참조상 무음입니다. GuitarSet은 Basic Pitch 학습 자료이고 선택 표본 split은 미확인이라 독립적인 일반화 성능을 뜻하지 않습니다.
- 현재의 정적 단음 보호/실험적 사후 진단이 화음·벤딩·슬라이드·레가토 채점 지원을 의미하지 않습니다. 기존 녹음/보정/모니터 기본 꺼짐을 유지합니다.

### 다음 작업 계획

무음 차이를 최소 ONNX 연산으로 재현하거나 호환 가능한 대체 native runtime을 검증한 뒤 제품 의존성을 선정해야 합니다. 학습과 분리된 기타/주법 참조와 onset·허위감점률 수용을 함께 통과하기 전에는 고급 점수를 연결하지 않습니다. 중요한 runtime/품질 의존성 문제로 Phase7 제품 적용은 중단·보류하며 로드맵 체크박스는 미완료로 둡니다. 새 모델의 다운로드/설치가 필요해지면 실제 버전·허용 조건·용량을 먼저 확인하고 기존 선택 다운로드 규칙을 적용합니다. Phase8 완료/배포 준비로 확대하지 않습니다.

**현재 — 2026-10-20 PCM 진단 실제 수용 / 미지원 주법 보호 검증 중**: 사용자 선택 테이크에서 E4/333.23Hz/+18.8cents/상대 강도1.000 및 실험/배음 경고 표시를 확인했습니다. 실제 정답 음 정확도·코드 채점 성공으로 간주하지 않습니다. 원본 악보의 주법을 감점 제외 metadata로 이어주고 기존 원본 재열기·편집 소실 방지·기록 보존을 보강 중입니다. 아래 수용 대기는 이전 이력입니다. 전체Phase7은 아직 미완료입니다.

**최신 — 2026-10-20 저장 테이크 PCM 후보 진단 적용**: 선택한 짧은 READY 테이크의400ms를 FFT로 분석하는 별도 native job·엄격한 프론트 계약/취소·최소 화면을 구현했습니다. 전체 프론트309개·타입/린트/빌드/포맷, Rust179개·확장 Clippy와 합성 PCM/성능7개·번들3개/Windows43.18초가 성공했습니다. 새PID14004/응답과 기존 DB·모델 보존도 확인했습니다. 옥타브/오픈 보이싱의 좁은 합성 recall0.60으로 실시간 코드 채점은 계속 비활성입니다. 실제 사용자 테이크 수용은 미실행/응답 대기이며 그동안 앱/소스를 유지합니다. 아래 최초 음정 집합 비교 단계는 이전 이력입니다. 전체Phase7은 진행 중입니다.

## 작업 개요

- 작업일: 2026-10-20.
- 목표: 실제 PCM 다성 검출에 연결하기 전, 코드 음정 후보를 비교하는 순수 평가 엔진을 기존 단음 Matcher와 분리해 검증합니다.
- 전체 상태: **진행 중**. 내부 음정 집합 비교 첫 슬라이스이며 실시간 코드 인식/점수·고급 주법 완료가 아닙니다.
- 선행 상태: 사용자 기타 파일·전체 기타 분리는 수용 완료입니다. 특화 Lead/Rhythm AI는 가중치 허가/품질 의존성 보류, 별도 Windows 배포 검사는 사용 장비 부재로 미실행입니다. docs/00 결정에 따라 독립적인 판정 엔진 작업만 진행합니다.

## 구현 및 변경 사항

- `src-tauri/src/judgement/chord.rs`: 목표2~6음/검출0~6개·유한 범위·신뢰도·허용 오차 검증, 저신뢰/중복 보류, 최대 일대일 대응/동률 최소 오차, 상태·대응 수/평균 절대 cents·최소 신뢰도 반환.
- `src-tauri/src/judgement/chord/tests.rs`: 조옮김/후보 순서, 탐욕적 대응의 반례, 오차 최소화, 음 누락/추가/옥타브, 저신뢰·후보 없음·중복, 같은 목표 음고,6음·범위 경계와 잘못된 입력 검사8개.
- `src-tauri/src/judgement/mod.rs`: 별도 모듈 공개만 추가. 기존 단음 Matcher·CPAL/DSP·Tauri 명령·프론트 점수/저장 형식은 변경하지 않았습니다.
- docs/00·05·09·12: 범위/내부 계약·검증 계획을 기록했습니다. 외부 라이브러리는 추가하지 않았습니다.

## 테스트 결과

- `cargo fmt --manifest-path src-tauri/Cargo.toml`: 성공.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml judgement::chord`:8개 성공(0.00초, 컴파일20.87초). 이 값은 검출된 음정 후보의 자체 검사이며 기타 오디오 테스트가 아닙니다.
- 전체 Rust/확장 Clippy·내장 번들/Windows 검사: 진행 중이며 후속 결과에 기록합니다.

## 미구현 및 알려진 문제

- PCM→다성 pitch 검출, 코드 onset/스트럼 시간 범위, epoch/재시도·점수·결과 저장, 실제 기타 코드/왜곡 품질과 허위 감점률: **미구현/미측정**.
- 벤딩·슬라이드·해머링/풀링·뮤트 판정과 별도 지원 범위 metadata: **미구현**.
- 이번 엔진은 동일 MIDI를 한 음고로 취급합니다. 서로 다른 줄의 같은 음과 실제 프렛을 구분하지 않습니다. 신뢰도0.85와 중복10cents 기준은 초기 정책이며 실제 모델 품질 보장이 아닙니다.
- 기존 실시간 채점은 계속 단음 PoC입니다. 이 모듈은 UI에 노출/연결하지 않으며 기존 화음 UNSUPPORTED 처리를 유지합니다.
- 실제 사용자 오디오/장치 시험은 **미실행**입니다. 비교 함수가 받는 다성 검출기가 아직 연결되지 않아 정상 실연주 기능으로 시험할 수 없습니다.

## 다음 작업 계획

다성 검출기의 고정 PCM fixture·배음/옥타브 혼동·저신뢰·성능 평가부터 진행합니다. 단음/화음 구분 품질을 검증한 뒤에만 기존 캡처 worker와 별도 명시적 실험 경로를 연결합니다. 실제 기타 검증 전 기존 채점 경로를 교체하지 않습니다. 이후 시간축/스트럼·재시도/중단과 미지원 주법을 계약에 따라 연결하고 실제 허위 감점률을 측정해야 Phase7 완료를 검토할 수 있습니다.

## 전체 검사 갱신 — 2026-10-20

- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: 성공.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: 성공(8.88초).
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`:171개 성공/7.93초, 환경 의존16개 제외. 기존 단음 DSP/Matcher·녹음/장치 오류·저장·믹서·AI 계약 회귀 포함, binary/doc-tests도 성공입니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests`:3개 성공(0.00초, 컴파일23.34초).
- 동시 작업한 분리 폴백의 `pnpm typecheck`/`pnpm lint`·전체302개/77파일(22.01초)·프론트 빌드32.50초도 성공했습니다. 위 Rust 검사와 프론트 검사는 실행 결과를 구분합니다.
- 로그: `src-tauri/target/runtime-validation/chord-kernel-tests.log`, `chord-kernel-native.log`, `part-fallback-full-front.log`, `part-fallback-build.log`, `part-fallback-bundle.log`.
- Python 제품·의존성·runtime/모델이 바뀌지 않아 Python 전체 검사는 **미실행**입니다. 실제 코드 오디오 검출·사용자 고급 주법/허위 감점률은 여전히 **미실행/미측정**입니다.

## Windows 빌드·실행 보존 — 2026-10-20

새 폴백 UI와 함께 Windows 빌드25.37초·실행PID20376/Responding=true를 확인했습니다. 실행 전 실제v8 DB를 백업하고 재실행 전후15개 테이블 행 수·내용 SHA와 모델 활성 marker4개가 동일함을 검증했습니다. 모니터 기본 꺼짐은 유지합니다. 실행 경로/로그/영수증은 PHASE-06B의 같은 날짜 최종 절을 참조합니다. 전체 Prettier도 통과했습니다. 내부 코드 비교 엔진은 공개 모듈만 추가했고 실시간 코드 채점을 활성화하지 않았습니다. Phase7 전체 항목은 미완료이며 기존 단음 엔진을 유지합니다.

## 저장 테이크400ms PCM 후보 진단 — 2026-10-20

### 작업 개요

Phase7의 다음 슬라이스로 PCM에서 여러 음정 후보를 구하는 초기 FFT 기준선과 ‘녹음 다시 듣기’의 선택 구간 진단을 구현했습니다. 순수 음정 집합 비교 다음 단계이며 기존 단음 튜너/Matcher·실시간 점수는 유지합니다. 전체Phase7은 **진행 중**이고 실제 코드/주법 채점 완료가 아닙니다.

### 구현 및 변경 사항

- `src-tauri/src/audio/polyphonic.rs`·`polyphonic/tests.rs`:400ms mono PCM/유한값·샘플레이트 검증, DC 제거/Hann창·FFT/log-peak 보간·초기 배음 억제, 후보 최대6개/상대 진폭, 무음·잡음·클리핑·복잡한 다성 보류, 취소와 합성 정확도/처리 시간 검사입니다. 음정 후보 신뢰도를 위조하지 않고 salience를 별도로 반환합니다.
- `src-tauri/src/judgement/recorded_pitches.rs`·`recorded_pitches/tests.rs`: UUID/같은 프로젝트/READY·누락·한도·선택 구간/원본 SHA 검증과 읽기 전용 분석입니다.30초/16MiB 이하 테이크의400ms를 분석하고 원본 WAV/메타데이터·악보를 수정하지 않습니다.
- `src-tauri/src/commands/recording_api.rs`, `app.rs`, `lib.rs`: `analyze_recording_pitches`를 기존 StorageJobs의 진행·취소·오류 경로에 연결하고 활성 REC 차단·원격 origin 거부 회귀를 추가했습니다. 임의 파일 경로/시스템·YouTube 캡처/업로드는 추가하지 않았습니다.
- `src/features/recordings/recordedPitches.ts`·`useRecordedPitches.ts`·`RecordedPitchesPanel.tsx`, `RecordingsPage.tsx`: 명시적 구간 분석·입력/문맥·취소 상태와 엄격한12필드 decoder, 늦은 응답 폐기, 후보·필수 한계 안내를 분리했습니다. 관련 테스트2파일·공유 자체 결과 fixture를 추가했습니다.
- `src/shared/pitch.ts`, `src/features/practice/tuner.ts`: 음 이름/Hz/cents의 순수 변환만 재사용합니다. 기존 튜너 신뢰도 기준/방향 규칙은 유지하고 기존4개 튜너 회귀를 통과했습니다.
- `src-tauri/Cargo.toml`·`Cargo.lock`: RustFFT6.4.1과 추가 전이5개를 고정했습니다. 설치 manifest의 MIT OR Apache-2.0과 Rust 요구사항/현재 빌드를 확인했습니다. 모델·Python 환경은 바꾸지 않았습니다.
- docs/02·09·10·12: 최소 UI·검사 계획·의존성 고지/구간 계약·샘플 경계를 먼저 정리했습니다.

### 테스트 결과와 발생 오류

- 최초 PCM 검사:4개 성공/1개 실패/성능1개 제외. 옥타브 성부의12차 배음이 별도 음으로 잡혔습니다. 탐색 음역에 맞춰 배음 억제 범위를32차까지 확대하고 높은 실제 성부가 누락될 수 있음을 항상 표시하도록 유지했습니다. 이 수정이 옥타브 성부 복원을 해결했다는 뜻은 아닙니다.
- 후속 `cargo test --locked --manifest-path src-tauri/Cargo.toml audio::polyphonic -- --include-ignored --nocapture`:7개 성공/0.66초(성능/품질 측정 포함).
- 고정 합성 close triads9회: TP27/검출27/목표27, precision1.0000·recall1.0000·F1 1.0000. octave/open voicings9회: TP27/검출27/목표45, precision1.0000·recall0.6000·F1 0.7500. 좁은 합성 셋 결과이며 실제 기타 성능/일반화 보장이 아닙니다.
- 최종48kHz/400ms/3음25회 디버그 처리 시간: p50 17.891ms / p95 22.006ms / max22.271ms. 이전 독립 실행 p95 18.900ms와 구분합니다.400ms 데이터 수집·디스크/UI·입출력 왕복 지연은 포함하지 않습니다.
- 선택 테이크 임시 DB/파일 검사2개 성공/0.50초 후 계약 추가 검사를 포함한 전체 Rust179개 성공/7.91초, 기본 제외18개(환경 의존16개+명시적 성능/품질2개)입니다. 성능/품질2개는 위 별도 실행에서 성공했습니다.
- 프론트 대상11개/3파일·2.44초 성공. 전체 프론트309개/79파일·14.57초, 타입/전체 ESLint·프론트 빌드21.28초·전체 Prettier 성공입니다.
- 최초 `pnpm verify:app`은 프론트/빌드/포맷까지 통과한 뒤 Clippy의 고정 chunks_exact 지적으로 실패했습니다. as_chunks::<4>로 바꾼 뒤 확장 all-targets/all-features Clippy12.62초와 전체 Rust 회귀를 별도 성공했습니다. 실패한 최초 명령 전체를 통과로 기록하지 않습니다.
- 앞선 재개 전 Rust 명령은 자동 승인 검토의 사용량 한도로 **미실행**이었습니다(안전성 거절 아님). 사용자 재개 후 정상 실행한 결과가 위 후속 검사입니다.
- 로그: `polyphonic-tests.log`, `polyphonic-tests-final.log`, `recorded-pitches-tests.log`, `polyphonic-front.log`, `polyphonic-verify-app.log`, `polyphonic-native-final.log`, `polyphonic-metrics-final.log`(src-tauri/target/runtime-validation 아래).
- 내장 번들/Windows 빌드·실제 후보 적용: 진행 중이며 후속 절에 기록합니다.

### 미구현 및 알려진 문제

옥타브/배음 겹침에서 합성 recall도0.60에 그쳐 **현재 후보를 코드 채점에 연결하지 않습니다**. 낮은 기본음·상대적으로 작은 음/왜곡·잡음·실제 스트럼은 추가 검증이 필요합니다.400ms 창이므로 저지연 코드 onset 검출이나 실시간 타이밍/주법 판정 기능이 아닙니다. salience를 확률/기존0.85 신뢰도로 변환하지 않습니다. 분석 결과 영속 저장·긴 테이크/다중 구간 일괄 처리·실시간 화음 채점은 미구현입니다. 기존 화음 UNSUPPORTED 정책은 유지합니다.

실제 사용자 테이크의 버튼/상태/후보 수용은 **미실행**, 실제 코드 정답·왜곡 정확도/허위 감점률은 **미측정**입니다. Python 제품/runtime/모델 미변경으로 Python 전체 재검사는 **미실행**입니다. 새 PC 설치도 장비 부재로 미실행입니다.

### 다음 작업 계획

Windows 후보를 반영하고 사용자가 명시적으로 선택한 기존 짧은 READY 테이크의 구간 분석/오류·취소를 확인합니다. 이어 독립적인 실제 기타 자료와 배음-옥타브 성부 구분 방법을 비교하고 누락/허위 후보·지연을 측정합니다. 실측 품질이 확보되기 전 단음 채점/원본·기록을 교체하지 않습니다. 벤딩/슬라이드·해머링/풀링·뮤트 지원과 시간축/재시도·주법의 안전한 미지원 계약도 남아 있습니다.

## PCM 진단 Windows 적용 / 실제 확인 대기 — 2026-10-20

- 내장 번들3개/0.11초(컴파일41.54초) 성공, 새 명령의 원격 origin IPC 거부도 포함합니다. Windows 내장 UI/native build43.18초 성공입니다.
- 고정 runtime3393개/64,095,996바이트의 전체 크기·SHA, 새 exe39,130,112바이트/SHA db7188ffb8cffb25db10f03762d15600680c981d8dfe8d33e803989da25df6b1을 확인했습니다. 디버그 실행 파일 크기이며 릴리스 크기는 미측정입니다.
- 활성 REC0/AI·설치 worker 없음과 실제 DB 백업 후 기존PID20376을 정상 종료했습니다. 새PID14004/Responding=true/‘GuitarLab · 녹음 음정 진단’을 실행했고 실제v8의15개 테이블 행 수/내용 SHA·모델 marker4개 보존을 확인했습니다. 강제 종료/입력·REC·개인 테이크 자동 분석은 하지 않았습니다.
- 실행 파일은 `src-tauri/target/runtime-validation/portable/240b00ad-399a-4d20-9039-dd521587bcf9/GuitarLab.exe`입니다. 빌드 로그는 `polyphonic-bundle.log`, `polyphonic-windows.log`, 실행/보존 영수증은 `polyphonic-candidate.json`, `polyphonic-db-before.json`, `polyphonic-db-after.json`입니다.
- 사용자에게 기존 짧은 READY 테이크의 A 선택→시작1000ms→‘선택 구간 음정 분석’ 결과/오류만 확인하도록 요청합니다. 새 연주·녹음은 필요 없습니다. **실제 사용자 테이크/버튼 수용은 미실행·응답 대기**, 그동안 앱과 제품 소스는 유지합니다.
- 이 후보는 스펙트럼 기준선의 한계 확인 도구입니다. 합성 recall0.60으로 드러난 옥타브/성부 누락을 해결하기 전 실시간 코드 점수와 연결하지 않습니다. Phase7 전체는 미완료입니다.

## 실제 선택 테이크 진단 수용 — 2026-10-20

사용자가 새 앱에서 직접 선택한 테이크의1000ms 구간 분석을 실행해 ‘E4 ·333.23Hz ·18.8cents ·상대 강도1.000’과 실험/옥타브 모호성/배음 억제 경고가 표시됨을 확인했습니다. 실제 native→job→검증→UI 경로의 수용이며 원래 연주한 정답 음/코드와 비교한 정확도 검증은 아닙니다. 개인 파형을 자동 조회·분석하지 않았고 사용자가 보낸 표시 내용만 기록했습니다. 실행 영수증의 manualAnalysisValidated=true를 갱신했습니다.

저장 테이크 구간 진단 슬라이스는 수용 완료, 전체Phase7은 미완료입니다. 이어 미지원 주법이 단음으로 오감점되지 않도록 원본 악보의 지원 표식·네이티브 제외·보존/재실행 회귀를 진행합니다. 실제 코드·고급 주법 판정과 정량 품질은 별도로 남습니다.

## 미지원 주법 오감점 보호 슬라이스 — 2026-10-20

### 작업 개요

- 완료일:2026-10-20. 원본 표기에서 지원 미검증인 음이 일반 단음으로 채점되거나 기본 편집으로 주법을 잃는 문제를 보호했습니다. 이 보호 슬라이스는 구현/자동 검사/Windows 반영 완료이며 전체Phase7은 진행 중입니다.
- 실제 사용자 테이크의 앞선 E4 진단 결과/한계 안내는 수용됐습니다. 주법 검출·실제 음정 정답 정확도 수용과 구분합니다.

### 구현 및 변경 사항

- `src/entities/score.ts`, `scoreValidation.ts`: 이전 형식과 호환되는 선택 `judgementSupport: UNSUPPORTED`와 엄격한 enum 검사.
- `src/features/score/alphaTabAdapter.ts`: 설치1.6.1의 note/beat 효과14종(벤딩/지속 벤딩·슬라이드 시작/끝/도착·해머링/풀링 시작/도착·팜뮤트·데드노트·하모닉·음표/박자 비브라토·트릴·와미·트레몰로)을 보수적으로 제외합니다. 효과 검사14회에는 슬라이드 시작을 별도 복원 검사로 다루며 모든 악보 포맷의 전수 검증은 아닙니다.
- `src/features/library/useProjects.ts`: 원본 렌더의 예전 문서를 재열 때 원본 위치와 맞춘 표식만 메모리 문서에 보완하고 기존 ID/앵커/역할·savedRevision을 보존합니다. 보완된 문서는 명시적 프로젝트 저장을 안내하고 기존 revision을 자동 수정하지 않습니다. 기본 악보는 불필요한 저장 필요 상태로 바꾸지 않습니다.
- `src/features/score/normalizedNotation.ts`: 기본 편집/MusicXML 정규화가 해당 주법을 버리지 않도록 보존 불가 오류로 종료합니다. 원본 보기/재생과 JSON metadata 보존은 유지합니다.
- `src/features/practice/practice.ts`, `ScorePanel.tsx`: 선택 목표에 미지원 flag를 전달하고 감점 제외 범위를 안내합니다.
- `src-tauri/src/storage/project_model.rs`, `practice_records.rs`: enum 저장/구형 누락 수용·잘못된 값 거부, 악보와 다른 target flag의 기록 거부, 새 기록 버전monophonic-poc-v2. 이전 기록은 수정/재계산하지 않습니다.
- `src-tauri/src/judgement/mod.rs`, `practice.rs`: UNSUPPORTED/0점·분모 제외·중단 SKIPPED 우선, 가까운 미지원 목표 입력의 인접 정음/오음 오귀속 방지. 전체 목표 재탐색을 늘리지 않고 기존 시간창 후보에서 처리합니다. 콜백/입력 검출기/보정은 변경하지 않았습니다.
- `src-tauri/src/audio/dsp.rs`, `storage/projects_tests.rs` 및 프론트4개 검사 파일: 기존 생성 지점/fixture와 새 정상·오류·보존 검사를 갱신했습니다.
- docs/00·05·09·12·08 및 progress의 현재 상태를 갱신했습니다. 의존성/DB migration/모델 설치 변경은 없습니다.

### 테스트 결과와 오류 해결

- `pnpm typecheck`: 성공.
- 대상4파일23개 프론트 검사: 성공/2.67초. 실제 자체 MusicXML 벤딩→이전 저장본 재열기→미지원 복원/저장 필요 상태와 변하지 않는 원본·ID/앵커를 확인했습니다.
- 최초 효과 검사 실패: bendType만 지정한 불완전 fixture의 bend point 누락, 목적지 없는 slide의 MIDI 생성 실패, 잘못 배치한 AlphaTex palm-mute 구문을 차례로 확인했습니다. 설치 라이브러리의 실제 getter/포인트 계약에 맞춰 fixture를 수정하고 효과 단위 검사는 이미 생성한 lookup을 사용했습니다. 실제 import 검사는 별도 MusicXML 벤딩으로 유지했습니다. 이 실패를 제품 실행 성공으로 기록하지 않습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml unsupported -- --nocapture`:6개 성공/0.57초. 정음/오음/중복·0.5/1/1.5배속·인접 목표·중단·실제 SQLite 저장/재열기/flag 위조를 확인했습니다. 기존 믹스 검사가 필터에 포함됩니다.
- `pnpm verify:app`: 전체 성공. 프론트313개/79파일15.73초·타입/린트·production build22.62초·전체 포맷/표준 Clippy·Rust183개7.74초, 기본 제외18개. 로그 `technique-guard-verify-app.log`.
- 이후 전체 목표를 두 번 탐색하지 않도록 같은 시간창 후보를 재사용하는 수정 뒤 `cargo fmt`, `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features`: 성공. Rust186개7.72초/제외18개이며 내장 번들/원격IPC 보호3개를 포함합니다. 로그 `technique-guard-native-final.log`.
- `pnpm tauri build --debug --no-bundle --config <technique-guard 설정>`: Windows 성공/native35.95초. 새 exe39,156,736바이트/SHA f56af19772344445180943668b0050fcbce03c2de92a9ce5286bd52ae1a36402.
- 고정 runtime3393개/64,095,996바이트의 정확한 파일 목록·크기/전체SHA 확인. 활성REC0/AI worker 없음·DB 백업 후 기존PID14004를 정상 종료하고 새PID27316/응답·창 제목 ‘GuitarLab · 주법 감점 보호’를 확인했습니다. 강제 종료/사용자 자료 자동 재저장은 하지 않았습니다.
- 실제v8 DB15개 테이블의 내용/행수SHA와4개 모델 marker가 전부 그대로입니다. `technique-guard-db-before.json`, `technique-guard-db-after.json`, `technique-guard-candidate.json`/`portable-candidate.json`을 보존합니다.
- 주법 악보의 새 Windows UI 수동 조작·실제 기타 주법/허위 감점률: **미실행**. 이번 결과는 실제 parser/순수 matcher/Attempt/임시 SQLite의 자동 보호 검사입니다. Python 제품 변경이 없어 Python 전체 재검사는 **미실행**이며 앞선 성공을 유지합니다. 별도 깨끗한 Windows도 장비 부재로 **미실행**입니다.

### 미구현 및 알려진 문제

- 실제 주법 검출기가 아닙니다. 표기 없는 주법·파서가 읽지 않는 효과·모든 포맷을 보장하지 않습니다. 태핑/고스트 등 이번 목록 외 효과의 정책 확대도 남습니다.
- 음정 곡선만으로 벤딩/슬라이드·다른 줄/프렛을 구분할 수 없습니다. 코드 PCM 품질은 앞선 옥타브 보이싱 recall0.60으로 미흡하며 실시간 코드 채점 비활성을 유지합니다.
- 새 metadata가 들어간 revision은 구형 앱에서 거부될 수 있습니다. 원본·이전 revision은 남고 기존 앱에서 새 형식을 저장하지 않습니다.
- 큰 Vite chunk 및 macOS용 식별자 권장 경고/정상 MSVC 생성 안내는 기존과 같으며 Windows 빌드는 성공했습니다.

### 다음 작업

현재 단음 검출기를 재사용하는 오프라인 음정 궤적의 고정 PCM/유효 비율·상승/하강/보류 분석을 분리 구현합니다. 실제 주법 분류·점수와 연결하지 않고 먼저 합성 기준선/취소·범위 검증을 수행합니다. 실제 기타 정답 자료·허위 감점률과 새 PC/정식 패키지는 별도 미완료로 유지합니다.

## 단음 음정 궤적 진단 슬라이스 — 2026-10-20

### 작업 개요

- 작업일:2026-10-20. 고급 주법 평가에 앞서 선택 녹음의 실제 단음 음정 변화만 관측하는 기능입니다.
- 상태: 구현/대상 검사 완료, 전체 회귀·새 Windows 반영/실제 사용자 화면 검사는 진행 중입니다. Phase7 전체는 미완료이며 주법 실제 분류·실시간 코드 점수를 활성화하지 않습니다.

### 구현 및 변경 사항

- `src-tauri/src/audio/pitch_track.rs`, `pitch_track/tests.rs`, `audio/mod.rs`:1초8~192kHz·유한값/클리핑·DC/음량 검증, 제한적 블록 평균/기존 차분 단음 검출기·1024창/25ms hop·최대40개 시각/음정·유효 비율/처음·끝3점 변화량·유지/상승/하강/보류와 취소. 기존 dsp 검출/콜백은 바꾸지 않았습니다.
- `src-tauri/src/judgement/recorded_pitches.rs`/tests: 기존400ms와 새1초가 같은 소유권/READY·누락/크기·SHA 읽기 검증을 공유하고 서로 다른 엄격한 결과를 반환합니다. 원본·메타데이터/점수·DB를 변경하지 않습니다.
- `src-tauri/src/commands/recording_api.rs`, `app.rs`, `lib.rs`: 새 `analyze_recording_pitch_track` job·REC 활성 차단/진행·취소와 원격 origin 접근 거부 검사 목록을 연결했습니다.
- `src/features/recordings/recordedPitchTrack.ts`/test, `src/test/recordedPitchTrackFixture.ts`:15필드/현재 테이크·구간/창 위치·null 결합·coverage/중앙값 변화량/최소 주기성/필수 경고를 검증합니다. private 경로나 binary는 받지 않습니다.
- `recordedPitches.ts`, `useRecordedPitches.ts`, `RecordedPitchesPanel.tsx`/test: 기존400ms 기본값을 유지하면서1초 방식 선택·명시적 실행·현재 결과 비우기·진행 중 선택 잠금/취소 종료 대기·후보/한계와 접힌 지점 목록을 추가했습니다. 비즈니스 로직과 IPC decoder는 UI 밖에 유지합니다.
- `alphaTabAdapter.ts`/test: 태핑/고스트도 미지원 metadata로 보호합니다. 앞선 보호 슬라이스의 해당 미구현 표기는 이 후속으로 대체하되 모든 효과/악보 형식의 전수 검증을 뜻하지 않습니다.
- docs/00·02·05·09·12·08 및 progress를 갱신합니다. 추가 의존성·Python 모델·DB migration은 없습니다.

### 테스트 결과와 오류 해결

- 최초 내부4개:3개 성공/1개 실패. 취소 오류 기대값을 JOB_CANCELED로 잘못 작성했고 실제 공통 계약 CANCELED에 맞게 수정했습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml audio::pitch_track -- --include-ignored --nocapture`:5개 성공/8.57초. 합성 상승/하강6회 유효 비율1.0000, 최대 오차1.0920/2.7993/1.0569/2.8055/1.0574/2.8059cents였습니다. 실제 기타 오차가 아닌 고정 깨끗한 합성 파형 결과입니다. 이후 기본 유지음 검사는 순음/배음을 모두 검사하도록 확대했습니다.
- 같은 코드의48kHz/1초25회 디버그 처리 p50 336.923ms / p95 372.124ms / max376.276ms.1초 수집/파일/UI/IO·왕복 지연 제외이며 실시간 주법 처리 성능으로 주장하지 않습니다.
- 서비스 컴파일2회 실패: AppError의 오류 문자열이 static 계약인데 동적format 문자열을 전달한 타입/수명 오류입니다.400ms/1초 각각의 정적 한국어 안내로 수정하고 공통 오류 타입은 변경하지 않았습니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml judgement::recorded_pitches -- --nocapture`:4개 성공/0.88초. 자체 WAV→1초 추적/RISING·원본/metadata·소유권·구간/취소·누락/SHA 보존과 기존 스펙트럼 회귀를 확인했습니다.
- `pnpm test ...recordedPitchTrack.test.ts ...recordedPitches.test.ts ...RecordedPitchesPanel.test.tsx`:10개 성공/2.50초. 태핑/고스트를 포함한 adapter6개/타입 검사도 성공입니다.
- 확장 `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`: 성공/10.22초. 전체 verify:app과 새 번들/Windows는 진행 중이며 최종 결과 후 기록합니다.

### 미구현 및 알려진 문제

- 실제 벤딩/슬라이드/레가토를 구분하는 기능이 아니며 화음/왜곡·주기적 배음의 거짓 단음·다른 줄/프렛을 정확히 분류하지 못할 수 있습니다. 현재 단음 전용/실험/주법 분류 아님 경고를 필수로 표시합니다.
- 다운샘플은 단음 기본음용 제한된 평균 방식입니다. 고역/왜곡까지 정량 품질을 확대할 때는 필터 리샘플러 평가가 필요합니다. 내부 허용 후보는 MIDI39.5~88.5입니다.
- 실제 기타 정답 음정 궤적·허위 주법/감점률·새 화면 수용 및 별도 깨끗한 Windows: **미실행/미측정**. 사용자가 선택해 실행하기 전 개인 오디오는 자동 분석하지 않습니다.

### 다음 작업

전체 회귀·내장 명령 보호/Windows 반영·기존 DB/모델 보존을 마친 뒤, 저장한 테이크에서1초 분석 결과/한계·취소의 실제 표시를 확인합니다. 실제 품질 검증 전 코드/고급 주법 점수와 연결하지 않고 모호한 대상은 계속 감점 제외합니다.

### 단음 궤적 최종 자동 검사/Windows 적용 — 2026-10-20

- `pnpm verify:app`: 전체 성공. 프론트316개/80파일15.78초·타입/린트·production build22.28초·전체 포맷/기본 Clippy·Rust188개10.80초/기본 제외19개입니다. 로그 `pitch-track-verify-app.log`.
- 최종 `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`:5.21초 성공. `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features`:191개10.99초/제외19개(16개 환경 의존·FFT 측정2개·궤적 측정1개), 내장 UI/원격IPC 보호3개 포함 성공. 제외된 측정3개는 앞서 명시적으로 실행한 로그가 있으며 나머지 환경 검사를 이번에 실행한 것으로 표시하지 않습니다.
- `pnpm tauri build --debug --no-bundle --config <pitch-track 설정>`: native32.13초 성공. 실행 파일39,300,608바이트/SHA86564340a29c2a22c87434c11f162fe11b618463956a3421f96db401e4d866a7, 고정 runtime3393개/64,095,996바이트의 정확한 파일/크기·SHA를 확인했습니다.
- 활성REC0/AI worker 없음·실제DB 백업 후 이전PID27316을 정상 종료하고 새PID33060/응답·‘GuitarLab · 단음 음정 변화’를 확인했습니다. portable/482122ef-1ebf-4df3-bc4b-f5ff3e44ab29, `pitch-track-candidate.json`/`portable-candidate.json`을 보존합니다.
- 실제v8 DB15개 테이블 내용/행 수·모델 marker4개 SHA가 전부 그대로입니다. 원본/기록 자동 변경과 강제 종료는 하지 않았습니다.
- 새1초 방식의 실제 사용자 화면 수용은 **미실행/대기**입니다. 기존 테이크 선택→단음 변화 방식→1000ms 분석으로 확인하며 응답 전 현재 앱을 재실행하지 않습니다. Python 제품 변경이 없어 이번 Python 전체 재검사는 **미실행**, 별도 Windows도 장비 부재로 **미실행**입니다. 기존 Vite 크기/.app 식별자 권장·MSVC 생성 안내는 유지되며 Windows 빌드는 성공했습니다.
- 자동 검사/앱 적용은 완료지만 실제 기타 정답 궤적·주법 분류/허위 감점률은 미측정입니다. Phase7 전체 완료로 표시하지 않습니다. 다음으로 공개 실제 기타 자료의 출처/주석·조건을 확인하되 개인 녹음 자동 분석/업로드는 하지 않습니다.

### 실제 선택 테이크1초 궤적 수용 — 2026-10-20

사용자가 `음정 유지 후보 ·1000.0~2000.0ms ·유효 구간94.7% / 순 음정 변화-0.6cents ·최소 주기성0.987` 표시를 확인했습니다. 새1초 명령→선택 WAV/decoder→화면 수용을 완료합니다.94.7%는 창별 유효 후보 비율이며 연주 정확도/정답률이 아닙니다. 실제 기준 음정/주법을 확인한 평가와 구분합니다. 기존400ms 다성 후보/새 단음 궤적 진단 슬라이스는 수용됐지만 실제 코드/주법 점수와 정량 품질·Phase7 전체는 미완료입니다. 다음은 공식 공개 GuitarSet1.1.0의 출처/조건·소규모 참조 샘플 보존과 정량 평가입니다. 실제 개인 WAV는 자동 분석하지 않습니다.

## 공개 실제 기타 기준선/기존 오프라인 모델 비교 — 2026-10-20

### 작업 개요

- 완료일:2026-10-20. 합성 파형의 낮은 오차를 실제 기타 품질로 오인하지 않도록4개 공개 어쿠스틱 마이크 녹음/참조를 검증 전용으로 비교했습니다.
- 이 평가 도구 슬라이스는 완료입니다. 결과는 고급 실시간 채점 수용을 통과하지 못했으며 Phase7 전체는 미완료입니다. 현재 사용자 수용 앱PID33060/기존 단음·모니터 기본 꺼짐을 변경하지 않았습니다.

### 구현 및 변경 사항

- `scripts/fetch_guitarset_sample.py`/`test_fetch_guitarset_sample.py`: 공식GuitarSet1.1.0/cc-by-4.0 metadata/버전·공개 ZIP 크기/MD5 metadata 확인, 범위206/Content-Range/ETag·파일8MiB/묶음15MiB 제한, 고정 사전 조건별4개/주석8파일만 CRC 후 새UUID 폴더에 추출하고 개별SHA/귀속/실패 상태를 남깁니다. 실행 기본값은 목록 확인이고 명시적 `--download-samples`만 수신합니다. 전체 ZIP MD5를 직접 검증한 것으로 기록하지 않습니다.
- `scripts/prepare_guitarset_benchmark.py`/test: 원본8개 SHA 확인→별도 float32 조각/참조 생성. 정수초마다1초 TRACK91개·250ms마다400ms SPECTRUM362개, 총453개/41,595,120바이트입니다. 원본 WAV/JAMS는 변경하지 않습니다. voiced/frequency 상충·전환/음역 밖·50cents 넘는 변화는 참조 불확정으로 제외하고 집계합니다.
- `src-tauri/src/audio/guitarset_benchmark.rs`, `audio/mod.rs`: cfg(test) 전용 명시적 평가. 실제 기존 분석 함수의 raw 후보를 최대 일대일50cents로 비교하고 유효/제외 수·조건부 오차·false 단음 후보/참조 무음 후보·시간을 새JSON에 보존합니다. salience를 confidence로 위조하지 않습니다. 제품 명령/콜백/모델/점수는 바꾸지 않았습니다.
- `scripts/benchmark_basic_pitch_guitarset.py`/test: 이미 승인·설치된 기존 개발 Basic Pitch0.4.0/검증 ONNX를 그대로 재사용하고 공개 원본4개만 오프라인 비교합니다. socket/connect/urlopen 차단·지역 캐시·원본SHA 전후 확인·새 결과, 모델 activation은 확률/실시간 confidence가 아닙니다. 같은400ms 안정 창 비교도 원래 note event 결과에서 재계산해 추론을 반복하지 않았습니다.
- `.gitignore`: `fixtures/external/` 제외. 원본/조각/모델 비교 데이터는 Git·앱 배포물에 포함하지 않습니다. 새 의존성·패키지/모델 다운로드·사용자 녹음 분석/업로드는 없습니다.
- docs/09·10·08 및 progress에 출처·고정 계획·실행 결과와 한계를 기록합니다. 공식 [데이터 레코드](https://zenodo.org/records/3371780), [타이밍 오류](https://github.com/marl/GuitarSet/issues/5), [중복 음 오류](https://github.com/marl/GuitarSet/issues/4)를 참조했습니다.

### 테스트 결과와 오류 해결

- 순수 Python 도구 검사: fetch4개+참조3개+모델 지표4개, 총11개 성공. `ai/.venv/Scripts/python.exe -X utf8 scripts/test_....py`로 각각 실행했습니다. 전체 AI 제품 pytest는 변경이 없어 이번 **미실행**이며 기존 결과를 유지합니다.
- `scripts/fetch_guitarset_sample.py --download-samples`: 성공. 공식 ZIP 총량 약696MB 전체 대신 실제 범위 수신5,935,368바이트로8개 원본CRC/크기·개별SHA와 귀속을 확인했습니다. 저장 `fixtures/external/guitarset-v1.1.0/e77d8f2d-9fa0-4e8e-a67b-454c6cacaa7f/manifest.json`.
- 최초 주석 확인은 pitch_contour.data를 list로 잘못 읽어 실패했고 실제 column dictionary와 note_midi list 구조를 확인했습니다. 최초 참조 준비는 voiced=true/frequency=0의 상충 값으로 실패했습니다. 이 값을 무음/검출 오답으로 숨기지 않고 불확정 참조로 제외해 원본별41/29개(총70개)를 기록하는 정책을 결과 측정 전에 고정했습니다. 실패한 준비 조각은 완료 benchmark.json이 없고 평가에 사용하지 않습니다.
- `scripts/prepare_guitarset_benchmark.py <manifest>`: 성공. `benchmark-b831b6dd-5472-4754-9d88-d3dd7880cb99/benchmark.json`에 고정453개/해시·참조를 보존했습니다.
- `GUITARLAB_GUITARSET_BENCHMARK=<benchmark.json> cargo test --locked --manifest-path src-tauri/Cargo.toml audio::guitarset_benchmark -- --include-ignored --nocapture`:2개/40.36초 성공. 결과 `results-52ba583f-7147-4da2-acfc-00ee193b568f.json`, 로그 `guitarset-benchmark.log`. ‘성공’은 실행/계약 성공이며 검출 품질 수용이 아닙니다.
- 지표의0개 적중/분모 존재 F1과 참조·검출 모두 없음의null을 구분하는 경계 계산을 수정/검사했습니다. 이번 실제4개 결과는 해당 오표시 상황이 없어 기존 수치가 바뀌지 않으며 PCM453개를 불필요하게 반복 평가하지 않았습니다.
- 최종 fmt/확장 Clippy8.62초·전체 feature Rust192개10.81초/기본 제외20개 성공(번들/원격IPC3개 포함). 로그 `guitarset-native-final.log`. 공개 평가1개는 별도 명시 실행됐고 나머지 제외 검사를 실행한 것으로 표시하지 않습니다. 프론트/제품 코드는 변하지 않아 이번 전체 프론트/Windows 재빌드는 **미실행**, 직전316개/Windows 적용 성공을 유지합니다.
- `ai/.venv-basic-pitch/Scripts/python.exe -I -B -X utf8 scripts/benchmark_basic_pitch_guitarset.py <benchmark>`: 기존 Python3.10.8 개발 프로필/Basic Pitch0.4.0의 실제4개 추론 성공. 제품의 관리 cp312 환경은 바꾸지 않았으며 해당 프로필과 실제 기타 결과 동등성/성능은 이번 **미실행**입니다. 새 모델 설치가 아닙니다.
- 모델 결과 `basic-pitch-65a897c0-0653-46dd-9ece-de69404eb3c5/results.json`, 같은400ms 참조 지표 재계산 `recomputed-frame-metrics-95e175c7-c460-414c-adcd-701fdb85c549.json`과 원본 보고서SHA를 보존했습니다. 첫 파일25,259.47ms/후속332.88·342.37·374.85ms이며 로딩/JIT/실제 추론별 시간은 분리 측정하지 않았습니다.22~25초 전체 파일의 사후 처리 시간이지 스트리밍 지연/반응 시간이 아닙니다.

### 정량 결과

평가 가능한 안정 참조만 다룹니다.4개/2명/어쿠스틱 마이크·7/17지점 검사라는 좁은 표본이며 자동 주석 자체의 오류·잔향/마이크와 픽업 차이를 고려해야 합니다.

| 실제 PCM 표본 | 안정400ms 창 | 스펙트럼 TP/검출/참조 | precision/recall/F1 | 단음 후보 오차 중앙값/p95 cents |
| --- | ---: | --- | --- | --- |
| 00_BN1-129-Eb_solo |13|9/17/17|0.5294/0.5294/0.5294|1.80/13.73(269후보)|
| 01_Jazz1-130-D_solo |12|8/20/10|0.4000/0.8000/0.5333|2.43/1900.85(335후보)|
| 00_Rock1-130-A_comp |2|2/5/10|0.4000/0.2000/0.2667|안정 단음 참조 없음|
| 01_Funk1-114-Ab_comp |1|0/0/0|자료 없음|2406.86/2789.20(4후보)|

- TRACK3458개 창 지점 중 불안정/지원 밖 참조1676개 제외. 안정 단음731개에서 후보608개·50cents 내570개: 후보 coverage83.17%, 후보가 있을 때 일치율93.75%, 누락 포함 적중률77.98%입니다. 이 ‘일치율’은 전체 기타 연주 정확도가 아닙니다.
- 안정 다성 참조589개 중134개에서 단음 후보가 나왔습니다. 단음 confidence0.90만으로 화음 검증을 통과한 것으로 볼 수 없습니다. 안정 무음 참조462개 중118개에서도 후보가 나왔으며 잔향/참조 미검출 한계를 포함합니다. 현재 고급 점수에 연결하지 않습니다.
- SPECTRUM362개 창 중334개를 참조 불안정으로 제외해28개만 비교 가능했습니다(무음3개 포함). 총TP19/검출42/참조37, precision0.4524·recall0.5135·F1 0.4810입니다. 제외된 대부분의 전환 창까지 검증했다고 주장하지 않습니다.
- 같은28개400ms 참조에서 Basic Pitch는TP34/검출36/참조37·F1 0.9315입니다. 다만 **전체22~25초 문맥을 보고 얻은 사후 note events**이며400ms만 보는 FFT와 같은 계산 조건/스트리밍 검사가 아닙니다.
- Basic Pitch의 TRACK 안정1782개 참조 시각 전체:TP2442/검출2828/참조2801, micro F1 0.86765. 단음731개 F1 0.91961·다성589개 F1 0.87288, 무음462개에는 예측117개가 남았습니다. 노트 onset/offset 정확도·주법 분류/허위 감점률 수치가 아닙니다.

### 미구현 및 알려진 문제

- FFT 후보/현재 차분 단음 추적을 실제 고급 채점으로 승격하기에는 옥타브급/큰 음정 오차·다성 혼동/추가·누락이 큽니다. 안전한 미지원 처리와 실험 진단 범위를 유지합니다.
- Basic Pitch는 더 높은 사후 음고 집합 지표를 보였지만 현재 계약상 Python은 오프라인 전용입니다. 이를 실시간 리듬 판정 의존성으로 연결하지 않습니다. 모델의 필요한 문맥·onset 오차·실행 변동/네이티브 runtime 호환성은 미검증입니다.
- 실제 벤딩/슬라이드/레가토 주법 정답 annotation·DI/SSL·왜곡/사용자 장치의 허위 감점률·새 PC 설치: **미실행/미측정**. 단음/기본 기능 수용을 취소하거나 실제 기타 모델 전체 성공으로 과장하지 않습니다.

### 다음 작업

이미 검증한 모델을 새로 받지 않고, 별도 실험에서 짧은 문맥/네이티브 추론 호환성·성능을 확인할 수 있는지 먼저 검토합니다. 검출 품질/판정 지연 조건을 충족하기 전 Python 실시간 의존성이나 새 고급 점수는 추가하지 않습니다. 중요한 runtime/모델 호환성 문제는 근거와 선택지를 문서화하고 Phase7 완료를 보류합니다.


### Basic Pitch 표본 독립성 보충 — 2026-10-20

설치된 Basic Pitch0.4.0 공식 `constants.py`의 DATASET_SAMPLING_FREQUENCY에 GuitarSet이 명시돼 있음을 확인했습니다. 선택한4개 파일의 학습/검증/시험 split은 확인하지 않았으므로, 이번 모델 결과는 **독립적인 일반화 성능/미학습 시험 성적이 아닙니다**. 공개 자료/어댑터 동작의 좁은 회귀·호환성 기준선으로만 사용합니다. 향후 품질 수용에는 학습과 분리된 출처가 확인된 자료/실제 장치·주법 참조가 필요하며 현재 고급 채점 보류를 유지합니다.


## 연속 음정 참조 평가 — 2026-10-21 진행 중

### 작업 개요

기존 stable-window-v1은 전환/50cents 넘는 변화가 제외되어 음정 변화 품질의 충분한 근거가 아니었습니다. 이미 받은 GuitarSet1.1.0/4개/2명 자료를 그대로 재사용해 고정 정수초1초창91개·중심3458지점의 별도 사후 평가를 준비했습니다. 앱의 판정/녹음/모델·실시간 콜백·UI는 변경하지 않으며 Phase7 전체는 미완료입니다. 현재 사용자 앱PID22032/미저장 편집도 유지합니다.

### 구현·변경 파일

- docs/12 계약을 먼저 추가하고 prepare_guitarset_benchmark.py의 명시적 --continuous 모드로 원본을 바꾸지 않는 새 UUID 조각/참조를 생성합니다. 기존 stable 모드와 EGSet12 평가는 유지합니다.
- 첫 continuous-center-v1은6줄 각각3.5ms 이내 주석을 요구했습니다. 실제3458지점 중3413개 제외·단음0개여서 품질을 측정할 수 없었습니다. 원본을 확인하니 pitch_contour가 발음 구간만 있는 희소 자료였고, 단순 누락을 무음으로 가정하지 않는 후속 정책을 계약에 기록했습니다. 최초 결과는 삭제/재작성하지 않았습니다.
- continuous-note-mask-v1은 data_source0~5가 일치하는 note_midi 구간을 발음 여부에만 사용하고, 실제 연속 F0는 pitch_contour에서 가져옵니다. 음표 시작/끝30ms 이내·발음 중 F0 누락/무성·미발음 구간 유성 F0·상충/범위 밖은 제외합니다. MIDI 값으로 F0를 양자화하거나 대체하지 않습니다. 이 자동 마스크도 실제 무음/주법의 절대 정답이 아닙니다.
- test_prepare_guitarset_benchmark.py는 변화 보존·6줄/순서·주석 공백/상충/범위·마스크 경계/겹침을 검사합니다. 새 라이브러리/모델/오디오 다운로드·개인 오디오 분석은 없습니다.
- native cfg(test)의 guitarset_benchmark.rs만 두 새 정책을 엄격히 수용하고 TRACK 제한을 검사합니다. 새 결과 schema2는 monoReferencePoints/polyReferencePoints/unvoicedReferencePoints/excludedReferencePoints로 분모를 구분합니다. 기존 생성 보고서/제품 IPC·DB는 바꾸지 않습니다.

### 실행 검증·오류와 해결

Python 참조7개0.004초·기존 Basic Pitch 지표4개/onset3개는 성공했습니다. 원본8파일 SHA 전후 동일, 실제 새91개 PCM16,052,400바이트·각38지점과 고정 정책을 확인했습니다. 최초 strict 실제 native2개32.15초 실행은 성공했지만 단음 분모0으로 품질 평가에는 사용할 수 없었습니다. 후속 마스크의 참조 분모는 단음838/다성772/주석상 무음474/불확정1374개로, 검출 결과와 독립적으로 먼저 집계했습니다. 후속 실제 native 평가·전체Rust/Clippy/MSRV는 실행 중입니다. 프론트/Windows/AI worker는 이번 변경이 없어 추가 재검사 **미실행**이며 직전359개/Windows21.77초·실제 악보 취소 수용 결과를 유지합니다.

자료 폴더: 최초 benchmark-0cb7f0e8-6cc6-4de8-89ee-d0b28b7dda9b/results-5d4cc4b9-5459-473b-965e-8aac9dcc3bbe.json, 후속 benchmark-fd65afb7-fb38-4270-9ca0-500ab9bd5537/benchmark.json. 두 폴더 모두 기존 fixtures/external/guitarset-v1.1.0/e77d8f2d-9fa0-4e8e-a67b-454c6cacaa7f 아래의 무시된 평가 자료이며 앱/배포물에 넣지 않습니다.

### 미구현·한계와 다음 작업

단음 중심 시각이어도 분석 창 앞뒤 음/잔향이 섞일 수 있습니다. GuitarSet 자동 주석의 알려진 오류와 모델 학습 split 불명확성을 유지하며 주법 이름·벤딩/비브라토 깊이/주기·실제 허위 감점률·실시간 지연의 검증으로 해석하지 않습니다. 실제 결과/실패 분모를 기록한 뒤 검출 개선의 근거로 사용하며 실시간 고급 점수는 계속 비활성입니다. 근거: [GuitarSet 공식 레코드/알려진 오류](https://zenodo.org/records/3371780).

### 다른 공개 주법 자료의 metadata 조사

이 조사는 공식 설명/저장소 읽기만 실행했고 음원 수신/주법 실험은 **미실행**입니다. 추가 설치/대규모 다운로드를 하지 않았습니다.

| 후보 | 확인한 범위와 현재 판단 |
| --- | --- |
| [AG-PT-set](https://zenodo.org/records/10159492) | 기타12주법이나 정밀 onset 주석은1~8번에 한정됩니다. bending9/vibrato12의 연속 정답이 있다고 간주하지 않습니다. 전체6.7GB는 받지 않았습니다. |
| [Vibrato Dataset](https://zenodo.org/records/1016050) | 공식 악기 목록은 flute/violin/cello/bassoon/alto-sax이며 기타가 없습니다. 기타 주법 수용 자료로 사용하지 않았습니다. 소프트웨어 AGPLv3 안내를 데이터 전체의 확정 라이선스로 바꾸어 해석하지 않습니다. |
| [skx300/vibrato_dataset](https://github.com/skx300/vibrato_dataset) | Areas_and_parameters는 erhu/violin이며 Yin.csv는 pYIN 추정입니다. 이를 수동 연속 정답으로 사용하지 않았고 Areas_only의 기타 적합성도 미확인입니다. |
| [IDMT-SMT-Guitar](https://www.idmt.fraunhofer.de/en/publications/datasets/guitar.html) | subset1에 주법/24bit·XML 설명이 있으나 연속 음정 정답 범위는 추가 확인이 필요합니다. 평가용 CC BY-NC-ND4.0 안내를 기록하고 제품/테스트 배포물에 포함하지 않았습니다. |


### 연속 참조 실제 실행 완료/수용 한계

`--continuous` 준비 후 `GUITARLAB_GUITARSET_BENCHMARK=<benchmark-fd65…/benchmark.json> cargo test --locked --manifest-path src-tauri/Cargo.toml --all-features audio::guitarset_benchmark -- --include-ignored --nocapture`는2개32.62초 성공했습니다. 결과 results-9f676b1a-b511-4e72-b2f5-5bec525eb025.json을 원본과 별도 저장했고 이후 원본8개 SHA도 동일합니다. 이는 실행/참조 계약 성공이며 고급 판정 품질 수용이 아닙니다.

| 표본 | 단음 참조/후보/50cents 적중 | 누락 포함 적중률 | 후보 조건부 오차 중앙값/p95 cents | 다성에 단음 후보 | 주석상 무음에 후보 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 00_BN1-129-Eb_solo |344/294/286|83.14%|1.847/20.457|120/249|19/33|
| 01_Jazz1-130-D_solo |468/379/343|73.29%|2.580/1900.625|10/18|15/117|
| 00_Rock1-130-A_comp |0/0/0|null|null|25/370|0/0|
| 01_Funk1-114-Ab_comp |26/4/0|0%|2401.991/2786.547|15/135|84/324|

총3458지점 중 제외1374/단음838/다성772/주석상 무음474입니다. 단음 후보677/적중629로 coverage80.79%·누락 포함75.06%·후보가 있을 때만92.91%입니다. 다성170/772와 주석상 무음118/474에서도 단음 후보가 나왔습니다. 후자를 실제 무음 오검출률/허위 감점률로 단정하지 않습니다. 중심 주석의 자동 마스크·실제 앞뒤 음/잔향·주석 오류와 analysis 창 차이를 분리하지 못했기 때문입니다. 처리 시간은1초당 디버그 관측 약332~353ms 중앙값이며1초 수집/입출력·실시간 왕복 지연이 아닙니다. 코드/주법 점수는 연결하지 않습니다.

최종 전체 feature Rust226개11.62초/26개 제외·Clippy6.34초·MSRV1.90 전체 target/features5.63초/fmt도 성공했습니다. scripts 전체62개는 기본 샌드박스에서 임시 백업 os.link의WinError5 때문에10개 오류/링크1개 제외였고, 제품 보호 코드를 완화하지 않고 같은 검사를 Windows 권한으로 재실행해61개7.803초 성공/링크 권한1개 제외를 확인했습니다. 실제 링크 검사를 성공으로 바꾸어 기록하지 않습니다. 프론트/UI/제품 바이너리의 추가 변경·재실행은 없으며 현재 악보 편집을 유지합니다.

이번 개발 전용 참조 슬라이스는 구현/검사/기록 완료입니다. Phase7 전체·벤딩/비브라토 실제 주법/일반화·실시간 고급 점수는 미완료이며 다음은 오차가 큰 구간과 입력 표현/분석 창의 원인을 분리하는 단계입니다. 표본/참조를 결과에 맞춰 골라 점수를 높이지 않고 기존 고정 계획과 실패 분모를 보존합니다.


### 오차 지점 보존/원인 분리 첫 관측

기존 평가의 요약만으로는 큰 오차 위치를 다시 확인하기 어려워, native 개발 결과 schema2에 모든 TRACK의38개 참조/미검출/주기성/경고를 함께 보존했습니다. 미분석 지점과 불확정null·주석상 무음[]·누락 포함 분모를 구분하는 자체 무음 경계1개를 추가했습니다. 제품 검출기/점수는 변경하지 않았습니다.

실제91창을 상세 출력으로 다시 실행해3개31.97초 성공, 결과 results-2ee5dbda-0e75-4426-8c0b-f811e6cc48a1.json의 모든3458개 참조를 입력과 대조했습니다. 첫 Python 직접 비교는 JSON 부동소수점 왕복의 최대7.1054e-15 MIDI 차이 때문에 실패했습니다. 참조 길이/null/배열 형태가 정확히 같음을 먼저 확인하고 절대1e-12 MIDI 오차만 허용해 비교했습니다. 요약 결과는 처리 시간 외 직전 보고서와 정확히 같습니다. 레코드/참조를 맞춰 고친 것은 아닙니다.

단음 후보677개 중50cents 넘는48개는 산술상 옥타브/배수 근처12개·3배 주파수 비율 근처29개·기타7개입니다. 분류는 절대 오차가1200·2400·3600cents 또는1200*log2(3)에서50cents 이내인지 순서대로 확인한 개발 진단이며 원인/주법 라벨이 아닙니다. 오류 지점의 주기성은0.9000~0.9671로, 높은 주기성이 실제 정답을 보장하지 않음을 확인했습니다. 경고는 LOW_COVERAGE46개·NON_MONOTONIC_OR_AMBIGUOUS2개로 모두 기존 보류 진단 구간입니다. 배음/잔향/주석 시간 오차 중 어느 원인인지 확정하거나 이 비율을 이용해 피치를 자동 보정하지 않았습니다. 전체 오류48개와 원래 보고서SHA를 error-audit-9965e914-f547-4240-91a0-2e9506733e35.json에 보존했습니다.

최종 Rust227개11.95초/26개 제외·Clippy6.27초·MSRV1.90 전체 target/features5.30초/fmt, 코드 포맷 명령 성공입니다(문서는 기존 ignore 대상). 현재 앱의 판정/미저장 편집을 바꾸는 적용은 없고 새 프론트·Windows/UI 검사는 **미실행**입니다. 정확한 실제 주법/전기기타DI 연속 정답과 실시간 고급 점수 수용은 여전히 미완료입니다. 이후에는 모델/주기성만으로 정답 판정을 늘리기보다 오차의 실제 창/신호 혼합 원인을 확인합니다.


### 최적화 회귀 갱신

release 전체228개/Clippy와 공개 평가3개0.62초를 통과했습니다. 같은91창의3458개 참조/후보/주기성 상세 및 요약(처리 시간 제외)은 debug와 정확히 같습니다. 각1초 PCM 계산 중앙값은5.31~5.58ms/p95 6.49~7.46ms이며 입력 수집·파일/IPC·실시간 왕복 지연과 다릅니다. 원본8개 SHA 동일·두 보고서 SHA/비교를 runtime-validation/release-guitarset-comparison.json에 보존했습니다. 빠른 계산을 실제 주법 정답/품질 수용으로 해석하지 않습니다. 현재 앱의 고급 채점·개인 녹음은 바꾸지 않습니다.
## 추가 주법 참조의 주석 범위 재확인 — 2026-10-22

### 1. 작업 개요

작업 날짜2026-10-22. 실제 주법의 연속 정답을 확보하기 위한 read-only 자료 조사이며 검출/점수 구현이나 품질 수용이 아닙니다. 사용자 이름 편집 검증 앱/소스는 그대로 유지했습니다.

### 2. 확인/문서 변경

[공식 ZIP 미리보기](https://zenodo.org/records/10159492/preview/aGPTset_z.zip?include_deleted=0)에는 audio.zip6.7GB 외 onset_labels.zip457.6kB·pitch_labels.zip354.8kB와 note_labels.csv가 나옵니다. 그러나 파일명이 pitch_labels라는 이유로 연속 F0 정답이라고 판단하지 않습니다. [저자 논문 §3.3~3.4/표3](https://domenicostefani.com/publications/2024AM-preciseonset.pdf)은 note 단위 MIDI·onset·줄/주법 metadata와1~8번 주석을 설명하며 bending/hammer-on/staccato/vibrato는 주석 수0입니다. **현재 판단**: 연속 궤적 정확도/벤딩·비브라토 허위 감점률 수용 자료로 바로 사용할 근거가 부족합니다. [공식 레코드](https://zenodo.org/records/10159492)와 기존 조사 이력을 유지합니다.

### 3. 검사 결과/오류

공식 웹 설명/ZIP 목록·저자 논문 확인은 **성공**. Zenodo API/export 및 GitHub 하위 폴더는 이번 web 도구에서 접근 실패했으며 명시적인 데이터 이용 조건도 이 응답으로 확정하지 않았습니다. 원본 음원·주석 다운로드/파싱·새 주법 실험은 **미실행**입니다. 제품 코드 변경이 없어 별도의 프론트/Rust/성능 검사를 반복하지 않았습니다.

### 4. 미구현/제약

원음/주석을 직접 검증하지 않았고 표의 정수 MIDI 주석을 연속 음정/주법 정답으로 확대하지 않습니다. 추가 다운로드/모델 학습·개인 녹음 분석이나 고급 점수 활성화는 없습니다. Phase7의 실제 주법/허위 감점률·학습 중복과 독립성 미검증 상태를 유지합니다.

### 5. 다음 작업

연속 음정/주법 평가와 onset/정수 MIDI 평가를 구분하고, 실제 필드·이용 조건이 확인된 참조만 선택 수신합니다. 대규모6.7GB 수신이나 논문 실험 환경 설치를 자동 진행하지 않으며, 기존 공개 GuitarSet/DI의 보류/오류 분모도 보존합니다.

## 저자 평가 코드의 참조 범위 확인 — 2026-10-24

## 1. 작업 개요

완료일2026-10-24. 기존 AG-PT-set 음정 단위 보류를 검토하기 위해 저자의 고정 평가 원문과 데이터 로더만 읽었습니다. 참조 사용 범위의 출처 확인은 완료했지만 **실제 정답 품질/고급 채점 수용은 미완료**입니다. 제품 DSP·기존 타격 평가/281개 분모·튜너 임계값·고급 점수 비활성을 유지합니다.

## 2. 구현 및 변경 사항

- 공식 [저자 저장소의 고정 커밋](https://github.com/CIMIL/AG-PT-set_AM24_accompanying-material/tree/fb7ea0b2d06162c3fc21c8480b6e65d236c0d46f)에서 README/TaskA 음정 평가 노트북/공통 유틸리티/데이터 위치 안내4개 원문68,191바이트를 읽었습니다. Git blob SHA1와 크기·별도 SHA256을 확인하고 앱/Git 배포물에서 제외한 runtime-validation/agpt-author-pitch-audit-a99d3e0d-9340-451e-bdfb-90980fec794a에 보존했습니다. 외부 코드/노트북 실행·의존성/모델 설치는 없습니다.
- [TaskA 원문](https://github.com/CIMIL/AG-PT-set_AM24_accompanying-material/blob/fb7ea0b2d06162c3fc21c8480b6e65d236c0d46f/am24-taskA-pitchdetection.ipynb)의 필터는 파일명이 pitched를 포함하고 impro를 포함하지 않는 노트 중 결측을 제외하고 정수 변환값108 미만만 선택합니다. 참조 열은 직접 MIDI 값으로 사용하며 모델의 Hz 출력만 MIDI로 바꿉니다. 단위가 불명확한 참조를 Hz로 자동 보정하는 코드는 확인하지 못했습니다.
- 이 노트북이 호출하는 데이터 로더도 공식 ZIP의 정확한 작은 member만 읽었습니다. 원문15,635바이트/압축3,545바이트·CRC90be3daa/SHA `bc9022b22da8bf0ad159e0e6a39e09efdc28c435c8d687980969644931842a6a`를 확인했습니다. 로더의 import 함수는 원문 CSV를 문자열로 읽고 결측/색인만 처리하며 음정 단위를 변환하지 않습니다. 전체 ZIP MD5를 새로 확인한 것은 아닙니다.
- 고정8파일/281참조에 같은 범위를 자체 표준 라이브러리 코드로 대조했습니다. 저자 범위에 **159개 포함**,108 상한에 **114개 제외**,파일명 조건에 **8개 제외**로 이전 팜뮤트3파일의 조건부159개와 일치했습니다. 원문 값/시각/모든 제외 분모를 보존했으며 기존197개 범위 안 값 전체를 정답으로 수용하지 않습니다. 이 사후 범위 확인은 독립 holdout이 아닙니다.
- 문서 변경은 `docs/00`/로드맵/검사·진행 문서이며 제품 코드·IPC/DB·기존 결과 JSON은 변경하지 않았습니다. 새 원문과 AST/범위 감사 결과만 별도 보존합니다.

## 3. 테스트 결과

- Git 고정 커밋의4개 blob SHA1/크기/개별 SHA256: **성공**. TaskA36,290바이트/SHA `62e8990af578e7778dbf55650ec71ff9821b0a74c4fc3ad7692031a670f07f71`를 고정했습니다. 첫 web 도구의 저장소 페이지는 fetch 오류였으나 공개 GitHub API/고정 raw 경로로 같은 commit과 전체 파일 목록을 확인했습니다.
- 공식 ZIP 소스 목록 Range1,497바이트, 로더 member Range5,116바이트 수신/제한256KiB·크기/CRC·SHA: **성공**. 오디오/전체 ZIP/가중치를 수신하지 않았으며 loader는 `.txt` 원문으로만 보존했습니다.
- 고정 plan 원문SHA82356f0f…/CSV원문SHA75502d20…와32,592행·선택파일별 주석 수 확인,281=159+114+8·파일명 조건 통과 후 값의 결측/정수 변환 미확정0 검사: **성공**. 원래 파일명 제외8개의 None은 기존 원문에 남깁니다. 결과는 `author-taskA-scope-1a396084-9471-4377-b612-a30421689915.json`이며 groundTruthQualityAccepted=false/posthocScopeAudit=true/independentHeldOutEvaluation=false입니다.
- 노트북의 AST는 파싱만 했으며 실행하지 않았습니다. 현재 고정 원문의 파일 반복문 안에서 참조/예측 결과 배열을 다시 비우는 위치도 확인했습니다(cell4/파일 loop 내75·76행). 이는 집계 범위 추가 검토가 필요하다는 정적 관측입니다. 실제 실행/당시 논문 환경을 재현하지 않았으므로 논문 수치가 틀렸다고 단정하지 않습니다. `notebook-aggregation-static-review.json`에 paperMetricsReproduced=false로 보존했습니다.
- 저자 노트북/외부 모델 실행·새 음정 정확도/실제 주법 수용·프론트/제품 재빌드: **미실행** — 코드 읽기/원문 대조만 수행했고 제품을 바꾸지 않았습니다. 앞선128/132 선언값 내 관측을 전체 실제 정확도로 확대하지 않습니다.

## 4. 미구현 및 알려진 문제

저자가 실제 평가에 쓴 MIDI 범위의 근거는 보강됐지만 상한 밖 원문의 단위 원인/독립적인 음정 정답 품질은 해결하지 못했습니다.114개 하모닉스·8개 별도 파일은 조용히 삭제하거나 pitch가 있는 음으로 대체하지 않습니다. 노트북의 공개 원문과 과거 실행 출력/집계 범위 일치도 재현 전에는 확정할 수 없습니다. 기존 옥타브 비율0.4 가설 기각과 실제 주법·허위 감점률 검증 필요성은 유지합니다.

## 5. 다음 작업 계획

저자 필터를 제품 검증기나 기존 타격 평가에 즉시 적용하지 않습니다.159개는 ‘저자가 MIDI로 취급한 선언값’이라는 근거와 사후 선택 조건을 함께 유지하며, 같은 파형/주석의 신호 문맥·독립 정답을 확인한 뒤 다음 음정 평가 계약을 별도로 정의합니다. 원문 전체를 다시 받거나 자동 Hz 변환·새 임계값 조정부터 반복하지 않습니다. 새 모델 다운로드/개인 녹음 분석/고급 채점 활성화는 별도 근거 없이는 진행하지 않습니다.
