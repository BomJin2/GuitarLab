# Phase 4B — 오버더빙과 로컬 믹스 출력

## 후속 — 프로젝트 전환의 믹스 문맥 보호 (2026-10-27)

### 1. 작업 개요

작업·검증 완료일 2026-10-27. 프로젝트/기준 반주/저장 악보 revision 변경의 첫 반환에 이전 믹스가 노출되고 이전 조회·저장 함수가 다시 사용되는 경계를 수정했습니다. 대상32개·624프론트/타입/lint/포맷·웹/Windows 빌드·Git/원격·독립 패키지 검증을 완료했습니다. 기존 Phase4B 기본 수용과 이번 후속의 실제 앱 미실행은 구분합니다.

### 2. 구현 및 변경 사항

- 먼저 `docs/12-API-CONTRACTS.md`에 문맥별 데이터/명령 수명과 기존 파일/취소 정책 불변을 기록했습니다. 새 IPC/DB/모델·녹음/믹스 형식은 추가하지 않습니다.
- `useProjectMix.ts`: 프로젝트/반주/revision 문맥을 구분하고 첫 반환부터 이전 믹스·테이크/분리/사용자 목록·준비/REC 참조·오류/진행/통계를 숨깁니다. layout 수명에서 이전 작업/재생 준비를 정리하고 기존 자동 설정 조회는 유지합니다.
- 이전 문맥이나 화면 이탈 뒤 조회·수정/파일 작업·취소·공개 clear 명령을 차단하며 현재 활성 조건을 저장 시 다시 확인합니다. 다른 프로젝트의 믹스 편집·조회 결과/테이크 목록을 거부하고 프로젝트 해제 때 분리 목록도 초기화합니다. 이미 native에 요청한 저장의 rollback을 보장하는 변경은 아닙니다.
- `useProjectMix.test.tsx`:11개 회귀를 추가했습니다. 기존 프로젝트 전환 테스트가 새 프로젝트에도 이전 프로젝트 테이크를 반환하던 fixture는 실제로 가능한 빈 새 프로젝트/목록으로 수정했습니다. 원본/레이어 음량·mute/solo·기존 재생/REC/출력과 UI 구조는 유지합니다.

### 3. 테스트 결과

- 최초 `pnpm exec vitest run src/features/performance/useProjectMix.test.tsx`: **7개 실패/11개 성공**,3.86초. 프로젝트/반주/revision 첫 반환·같은 프로젝트 복귀·이탈 뒤 실행·외부 프로젝트 편집·현재 잠금 우회를 재현했습니다. 로그 `mix-context-red-20261027.log`.
- 초기 수정의 대상1개 실패는 새 소유권 검사에 걸린 기존 외부 프로젝트 테이크 fixture였으며 이를 올바른 새 프로젝트 목록으로 수정해 **28개 성공**,3.95초입니다. 이어 이전 취소/외부 조회·해제 목록 회귀를 보강했습니다.
- 최종 `pnpm exec vitest run src/features/performance/useProjectMix.test.tsx src/features/performance/MixPanel.test.tsx src/features/performance/TakeMixPlayer.test.ts`: **32개/3파일 성공**,5.62초. 현재 준비/REC 참조·취소 후 실제 종료·출력/명시적 저장·REC 중 소스 잠금과 청취 음량 조절도 유지됩니다.
- `pnpm typecheck`, `pnpm lint`: **성공**. `pnpm test`: **624개/119파일 성공**,56.53초. `pnpm format:check`: **성공**. `pnpm build`: **성공**,Vite2분22초/기존 큰 chunk 안내. `cargo test --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol bundle_tests`: **4개 성공**. `cargo build --locked --offline --manifest-path src-tauri/Cargo.toml --features custom-protocol`: **성공**,16.94초/기존 MSVC 링크 안내입니다. Git/새 원격·독립 패키지 검사는 후속이며 로그 `mix-context-…-20261027.log`에 보존합니다.
- 소스 `1586e90b839a6193c4edb62e78c280cd615b4504`를 main에 push했습니다. 새 독립 ZIP3,613파일/40,293,961바이트·CRC/SHA·실제 PS5.1/최소 PATH Python3.12.15 두 번이 성공했고 앱은 실행하지 않았습니다. [Windows40498741556](https://github.com/BomJin2/GuitarLab/actions/runs/40498741556)/job122170750934은 진행 중입니다. 지문/영수증·보안 검사와 미실행은 [Phase8 첫 절](PHASE-08.md)을 따릅니다.
- 최종 실제 원격 로그를 확인해 사후 정리까지 **전체 성공**으로 확정했습니다. 프론트624/119파일(91.12초), 기본Rust252/확장256(76.94/55.36초·각29개 기본 제외), 예제1+1·AI113(2.46초)/도구143(20.577초)·Clippy/MSRV1.90 성공입니다. 같은 소스의 EXE/ZIP Defender도 위협 없음/지문 불변으로 성공했습니다. 위 진행 중은 확정 전 이력이며 이후 제품 소스/의존성 변경 없이 결과 문서만 확정합니다.
- 실제 새 GUI·개인 믹스/청취·오버더빙 REC·별도 OS는 **미실행** — 합성 fixture/모의 파일 API를 사용하며 사용자 앱/녹음·개인 DB/파일을 조작하지 않았습니다. 새 모델 설치/분석·네트워크 음원 전송도 없습니다. 전체 native/Python 로컬 재실행은 **미실행** — 기존 검증 엔진과 동일하며 새 소스의 원격 회귀와 구분합니다.

### 4. 미구현 및 알려진 문제

이미 보낸 native 저장/설정 읽기를 새로 rollback/강제 취소하는 정책은 추가하지 않습니다. 기존 읽기의 늦은 응답 적용을 막고 진행 중 파일 작업은 기존 AbortSignal/종료 대기를 사용합니다. 같은 문맥의 수동 재조회 실패 시 기존 믹스를 보존하며 원본 take/WAV·저장 믹스를 자동 삭제하지 않습니다. 실제 장치/별도 OS·장기 동기/고급 판정 품질 수용은 별도입니다.

### 5. 다음 작업 계획

이 후속의 전체/빌드·Git/원격·독립 ZIP 검증과 문서화를 완료했습니다. 다음 실제 GUI/장치·별도 OS·독립 주법 품질/배포 범위 수용은 진행 요약의 남은 조건을 따릅니다. 같은 소스의 성공 검사를 반복하거나 개인 파일로 검증을 대신하지 않으며 현재 원본/저장 믹스는 유지합니다.

## 1. 작업 개요

- 시작일/완료 날짜: 2026-10-15. 상태: 완료(아래 최종 검증 범위와 제약 포함). 단계별 후보 기록은 이력으로 보존합니다.
- 이전 Phase 4A의 자동 검사·실제 녹음/복구·재실행 복원 및 문서 완료를 검토했습니다.
- 목표: 이전 테이크를 들으며 새 입력만 별도 파일로 녹음하고, 비파괴 gain/mute/solo/정렬과 로컬 WAV 믹스 출력을 제공합니다.

## 2. 구현 및 변경 사항

최종 결과: 별도 InputOnly 오버더빙·정지 REC 준비/clock 지연 연결·믹스/새 WAV 출력·설정 복원을 구현하고 자동 및 실제 검사로 확인했습니다. 이 절의 ‘후보/미실행’은 최초 구현 당시 기록이며 최신 결과는 문서 끝의 최종 완료 기록을 따릅니다.

- 최종 후보: 로컬 take/반주 레이어 gain/mute/solo/추가 offset/masterGain·명시적 설정 저장, 별도 참조 재생을 이용한 InputOnly 오버더빙, 출력 WAV 만들기/미리 듣기·사용 권한 확인 후 새 파일 저장을 구현했습니다. 실제 Windows 청취/내보내기는 아직 미실행입니다.
- native 새 파일: `src-tauri/src/mixer/{mod,model,pcm,render,store,export,tests}.rs`, `commands/mixer_api.rs`, `storage/migrations/003-mixer.sql`. 도메인 검증·제한된 WAV 디코드/믹스·원본 보존 저장·작업 취소·추가 설정 저장을 분리합니다.
- native 수정: `{lib,app}.rs`, `commands/mod.rs` 등록; `storage/database.rs` 추가003만 적용; `recording/{model,service}.rs`·`storage/recordings.rs`에서 선택적 referenceTakeIds를 검증/기록합니다. `storage/{mod,recordings_tests,projects_tests}.rs`는 기존 fixture 재사용·버전3/미래4 거부·이전1/2 데이터 보존 검사 목적입니다.
- 프론트 새 파일: `features/performance/{mixing,TakeMixPlayer,useProjectMix}.ts`, `MixPanel.tsx`와4개 테스트 파일. 주 PlayerEngine을 교체하지 않는 media 어댑터/프로젝트별 컨트롤러/순수 상태 UI를 분리합니다. 설정만 읽어서는 재생하지 않으며 사용자가 준비/재생/REC를 각각 실행합니다.
- 프론트 수정: `app/App.tsx` 연결, `recordings/{recordings.ts,RecordingPanel.tsx,RecordingsPage.tsx}` 및 계약/패널 테스트. 준비되지 않은 참조/믹스 파일 작업 중에는 REC를 차단하며 무반주 REC에는 참조ID를 전달하지 않습니다. REC 중 소스/offset/출력을 잠그되 청취 gain/mute/solo는 허용합니다.
- 이전 확장 lint 정리: `audio/monitor.rs`의 테스트 chunks_exact→as_chunks 및 `judgement/practice.rs`·`storage/projects_tests.rs`의 err().expect→expect_err. 제품 오디오/판정 로직은 바꾸지 않았고 전체 회귀 검사로 확인했습니다.
- 문서: README, docs/00·07·08·12·17, 진행 README/PHASE-04A/04B. 새 라이브러리/의존성/lockfile 변경 없음. 기존 저장된 오디오를 assistant가 열거나 전송하지 않았으며 테스트 입력은 자체 합성 자료입니다.

## 3. 테스트 결과

- `pnpm verify:app`: 성공(종료 코드0), 타입/ESLint·프론트142개/43파일·production build·Prettier·cargo fmt·표준 Clippy·Rust106개/기본 제외3개·binary/doc-tests. main chunk1,392.41kB 경고는 유지합니다.
- 그 뒤 제품 변경 없이 출력 동의/REC 잠금 UI 검사1개 추가: `pnpm typecheck`, `pnpm lint`, `pnpm test`143개/44파일, `pnpm format:check` 성공. 제품 소스가 같아 production build 재실행은 미실행이며 직전 결과를 사용합니다.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: 최종 성공.4A에서 기록한 기존8개 lint를 이번 Phase에서 정리했습니다.
- 추가 v2→v3 기존 테이크 보존 테스트 후 `cargo test --locked --manifest-path src-tauri/Cargo.toml`107개/기본 제외3개·binary/doc-tests 성공, fmt/확장 Clippy 최종 성공. 기존 v2 테이크의 metadata_json/WAV bytes가003 추가 후 그대로인 것을 검사했습니다. 제품 소스가 동일한 테스트 추가이며 번들/프론트 재빌드는 미실행입니다.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`: 번들 index/JavaScript 내장1개 성공.
- native 믹스7개 검사: 두 독립 테이크/참조 관계와 원본 바이트 보존, mute/solo/gain/양·음 offset·출력 제한 프레임, 설정 저장/재열기/손상 해시, 취소·기존 파일 거부, PCM16 stereo 평균/float NaN·입력 예산 거부,24kHz 반주+두 테이크를48kHz192,000프레임/4초로 출력, 이전 metadata/request 기본빈배열·잘못된 참조 거부 및 v2 데이터 보존을 실제 임시 파일/SQLite로 확인했습니다. 개인 녹음은 사용하지 않았습니다.
- 프론트 신규9개 및 기존 REC/계약 검사 보강: 별도 media의 seek/rate/pause/solo·원곡/bytes 불변·실패 시 기준 반주 중지, 명시적 준비·화면 이탈 취소/늦은 응답 폐기·프로젝트 교체, 파일 출력 동의/녹음 중 잠금, 비정상 계약 거부. HTMLMediaElement 재생은 테스트 대역이며 실제 소리 검사와 구분합니다.
- 해결한 오류: native 테스트 JSON Value 변환/상수 mut 참조·배열 참조 비교, TS unknown 비교/미사용 변수, 프로젝트 해제 후 prepared가 남던 상태를 수정했습니다. 마지막 문제는 먼저 회귀 테스트가 실패한 뒤 상태 초기화·화면 이탈 후 지연 준비 차단을 보완해 통과했습니다. 이전 요청 종료 상태의 mix와 stale preview도 초기화합니다.
- Windows 제품 exe 빌드/새 앱 실제 실행·실제 오버더빙/solo·mute 청취·저장 창/파일 출력·설정 재실행: **미실행** — 실행 중4A 앱을 사용자 대신 닫지 않고 종료 응답을 기다립니다. 실제 디스크 채우기/강제 종료·다중 출력 장치 지연 측정·Python 검사는 **미실행** — 이번 범위 밖이며 기존 입력 안전성 검사와 구분합니다.

## 4. 미구현 및 알려진 문제

- 초기 후보 당시 신규 Windows 검사는 대기 중이었으며 아래 최종 기록에서 녹음/믹스 청취·WAV 출력·설정 복원을 확인했습니다. 실제 solo 청취·정량 지연 측정은 미실행이며 자동 solo 검증과 구분합니다. YouTube/시스템 출력 캡처·오디오 추출 경로는 없습니다.
- WAV 출력은1× 정렬 또는 무반주 테이크·PCM16/float32 mono/stereo WAV 반주로 제한합니다. 배속 녹음/MP3 출력, stereo 보존/pan/clip, 고품질 리샘플링/피치 보존 변환은 미구현이며 오류/안내로 노출합니다.
- 출력은48kHz mono float32, 입력 디코드 합계64MiB·최대8레이어(오버더빙 참조 최대7개)·출력10분/256MiB. 출력 제한 전 peak와 제한 프레임을 보여주며 원본에 limiter를 적용하지 않습니다.
- 청취용 다중 HTML media는 main 시간축을 따릅니다. 초기80ms 즉시 재탐색은 끊김 수정 후 실제 시간160ms 초과 편차500ms 지속/탐색 간격1초 조건으로 바뀌었습니다. sample-accurate/실제 왕복 지연을 보장하지 않습니다. 오버더빙은 같은 저장 리비전·반주에 연결된 READY만 준비합니다. 무반주는0ms 수동 정렬이며 반주 offset 재생 UI는0ms 고정입니다.
- export는 새 경로에만 완성 파일을 공개하며 hard link를 지원하는 파일 시스템이 필요합니다. 실패/취소는 자신이 만든 임시 파일만 정리하고 기존 파일은 보존합니다. 강제 종료 뒤 export 임시 파일 자동 정리/파일 내보내기 이력은 미구현입니다.
- 믹스 설정은 명시적으로 저장/다시 읽으며 현재 새로 읽기는 미저장 믹스 변경을 대체합니다. 원본 take/WAV/리비전은 변경하지 않습니다.

## 5. 다음 작업 계획

최종 다음 작업은 Phase 5 수동 TAB 편집입니다. 아래 순서는 Phase 4B 초기 수용 검사 계획의 이력입니다.

1. 사용자 기존 창 종료 확인 후 제품 exe 빌드/실행(자동 입력/모니터/REC 없음).
2. 기존 take 참조 청취→다른 목표 트랙 선택→새 InputOnly REC/독립 테이크 보존과 실제 mute/solo를 확인합니다. 파일 출력용은1×로 새 녹음하거나 무반주 테이크를 사용합니다.
3. 새 WAV 저장·실제 청취, 믹스 설정 재열기를 확인하고 완료 문서/로드맵을 갱신합니다. 실제 확인 전 완료 표시를 하지 않습니다.
4. 4B 완료 후 자동으로 Phase 5 수동 TAB 편집의 계약/불변 revision/Undo·Redo·내보내기를 진행합니다.

## Windows 제품 적용·기존 데이터 보존 — 2026-10-15 19:30

- 사용자가 ‘닫았음’으로 답했고 실제 GuitarLab 프로세스 없음 확인 후 `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 성공. exe23,479,808바이트/19:29:36, 자체 PE 검사에서 서브시스템2(GUI)입니다. 새PID37144/19:30:06/창 제목GuitarLab으로 실행했습니다. 입력·모니터·REC는 자동 시작하지 않았습니다.
- 앱을 열기 전 읽기 전용 DB의 user_version2/17개 테이크 metadata_json SHA-256·저장 해시를 보관했습니다. 새 앱 시작 뒤 version3과 동일17개/모든 메타데이터 해시 불변·무결성 일치를 확인했습니다. 개인 WAV/원시 PCM은 읽거나 전송하지 않았으며 실제 파일 바이트 비교와 구분합니다. v2 테이크 WAV 바이트 보존은 위 자체 fixture 테스트 범위입니다.
- 위3절의 Windows 제품 빌드/실행 ‘미실행’은 이 적용 전 이력입니다. 실제 신규 청취/오버더빙/파일 선택·export/설정 재열기는 여전히 미실행입니다. 다음은 저장한 ‘복원 확인’ 테이크를 로컬 믹스에 추가·준비한 뒤 하단 반주와 함께 청취하며 해당 테이크의 mute/해제를 확인합니다. 사용자 요청 이후 파일·앱을 유지합니다.

## 믹스 청취 끊김 보고·보정 수정 — 2026-10-15

- 사용자 확인: 믹스 재생/해당 테이크 음소거·해제는 동작하지만 기타가 끊겨 들립니다. 같은 테이크 단독 재생은 정상이며 ‘믹스에서만 끊김’으로 추가 확인했습니다. 실제 품질 통과/Phase 완료로 기록하지 않습니다.
- 코드 원인 후보: main의 매 프레임 갱신마다 같은 playbackRate/volume을 다시 쓰고, 단일80ms 편차만으로 currentTime 탐색을 반복했습니다.120ms의 일정한 media 위치 차이를 주는1.2초 회귀 검사에서 수정 전60회 탐색이 발생해 실패했습니다. 이는 과도한 탐색 재현이며 사용자 장치의 실제 끊김 원인 전체를 실측 확정한 것은 아닙니다.
- 수정 파일: `src/features/performance/{TakeMixPlayer.ts,TakeMixPlayer.test.ts}`. 같은 음량/배속은 다시 쓰지 않고, 시작·명시적 epoch/offset은 즉시 정렬하되1ms 이하 동일 위치 쓰기를 생략합니다. 연속 재생은 실제 재생 시간 기준160ms 초과 편차가500ms 지속되고 직전 탐색 후1초 이상일 때만 자동 보정합니다. play 준비/탐색 중 중복 자동 보정을 막고 짧은 시각 차이는 그대로 재생합니다. 외부 DTO/입력 캡처/원본 WAV/SQLite/Rust는 변경하지 않았습니다.
- 회귀 검사2개 추가: 연속60회 갱신에서 짧은 편차에 탐색/동일 배속 쓰기0회; 큰 편차의 지속 시간·재보정 간격·탐색 중 억제 및 명시적 seek/offset 즉시 정렬을 확인했습니다. 처음 큰 편차 검사는 play Promise가 완료되기 전에 검사해 실패했고 테스트가 play 후 다음 작업 시점까지 기다리도록 고쳐 실제 연속 재생 분기를 검증했습니다.
- 전체 검사 중 기존 대용량 바이트 deep equality가 병렬 실행에서5초 제한을 넘어1개 실패했습니다. 모든 바이트를 typed array every로 비교하도록 바꿔 무결성 검사 범위를 유지했고 해당 파일5개 검사 약64ms·전체145개/44파일 성공으로 확인했습니다. timeout 값을 늘리거나 검사를 제거하지 않았습니다.
- 실행 성공: `pnpm typecheck`, `pnpm lint`, `pnpm test`145개/44파일, `pnpm build`, `pnpm format:check`; `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`1개. main chunk1,392.94kB 경고 유지. Rust 전체 재검사는 **미실행** — native 제품 소스/계약/의존성이 같으며 직전107개·제외3개 성공 이력을 유지합니다.
- 참고: [MDN currentTime](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime)은 값 변경이 탐색을 수행하며 읽은 재생 위치는 갱신 주기에 따른 근삿값임을 설명합니다. [MDN playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate)도 확인했습니다. 새 라이브러리는 없습니다.
- 수정 Windows exe 적용·실제 청취 재확인은 **미실행**입니다. 기존PID37144를 유지하며 사용자가 닫은 뒤 빌드/재실행합니다. 샘플 단위 정렬이나160ms 실제 품질 달성을 보장하지 않습니다. 다음 순서는 끊김 재확인→실제 새 InputOnly 오버더빙/solo·mute→1× WAV 출력/설정 재열기이며 그 전4B는 진행 중입니다.

### 끊김 보정 Windows 적용 — 2026-10-15 19:43

사용자 ‘닫음’ 후 실제 프로세스 없음 확인, `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 종료 코드0. exe23,479,808바이트/19:43:04, 새PID33380/19:43:20으로 실행했습니다. MSVC 라이브러리 생성 안내 경고는 유지합니다. 입력·모니터·REC를 자동 시작하거나 사용자 파일을 수정하지 않았습니다. 위 ‘exe 적용 미실행’은 적용 전 이력이며 **실제 청취 개선은 아직 미확인**입니다. 동일 ‘복원 확인’ 테이크의 믹스 준비→반주 재생에서 끊김만 재확인하고 이후 새 오버더빙·파일 출력을 진행합니다. 요청 이후 파일과 앱을 유지합니다.

### 끊김 개선 실제 확인·독립 오버더빙 검증 준비 — 2026-10-15

- 사용자 ‘끊김 없이 들림’으로 수정 앱의 동일 테이크 믹스 청취 개선을 확인했습니다. 이 장치/시나리오에서 확인한 결과이며 여러 장치의 지연 분포/장시간 안정성까지 확대하지 않습니다. 앞선 실제 믹스 재생·mute/해제도 확인됐습니다.
- 다음 안내를 위해 저장된 테이크 메타데이터/해당 악보 리비전에서 트랙 개수와 이름만 읽었습니다. 현재 프로젝트는 Guitar 1 하나이며 다른 악보 트랙은 없습니다. 개인 WAV/PCM은 읽지 않았습니다. 실제 다음 검사는 같은 악보 트랙에서 참조를 들으며 새 독립 입력 테이크를 기록합니다. 실제 Lead→Rhythm 선택 검사를 이 프로젝트에서 수행했다고 주장하지 않습니다.
- 부족한 다른 트랙 관계 검사1개를 `src-tauri/src/mixer/tests.rs`에 추가했습니다. 자체 두 트랙 리비전에서 Lead 입력4,800프레임을 보존하고, Lead 참조ID를 가진 Rhythm 입력2,400프레임을 다른ID/WAV로 저장·재열기하여 두 대상 트랙/참조 관계/원본 바이트 불변을 검증했습니다. 해당 검사1개와 확장 Clippy 성공, fmt 적용. 제품 소스/의존성은 바뀌지 않아 앱/번들 재빌드는 미실행입니다. 앞선 실제 사용자 청취와 합성 저장 검사는 구분합니다.
- 다음은1×·반복 끄기로 기존 테이크 믹스를 준비→반주 재생·clock 안정→명시적 REC→짧은 기타 연주/STOP→새 READY·이전 테이크 보존 확인입니다.1× 새 테이크를 후속 WAV 출력에서 사용합니다. 실제 새 오버더빙/파일 export/solo·설정 재열기는 아직 미실행이며 Phase 4B 진행 중입니다. 요청 후 파일·앱을 유지합니다.

추가 검사 후 `cargo test --locked --manifest-path src-tauri/Cargo.toml`108개/기본 제외3개·binary/doc-tests 성공입니다. 최신 프론트145개·번들1개는 이전 제품 검사 이력이며 이번 테스트 전용 변경으로 재실행하지 않았습니다. 앱PID33380/제품 소스/의존성/계약/사용자 데이터는 동일하게 유지합니다.

## 실제 새 테이크 저장·재생 전 REC 개선 — 2026-10-15

- 사용자 결과: READY5.42초/260,250프레임/누락0/peak0.962. 기존 ‘복원 확인’을 참조하는 별도ID e90e96c5-4458-42bf-b812-dc72f19aab90이 READY/오류null로 저장됐음을 읽기 전용 메타데이터에서 확인했습니다. referenceTakeIds는60af7e3d-b5c7-4850-a084-66b34d321904이며 기존 행도 READY/291,698프레임으로 남았습니다. 실제 transport.rate는0.5이며 사용자에게 안내했던1× 성공으로 기록하지 않습니다. 개인 WAV/PCM은 읽거나 전송하지 않았습니다.
- 사용자 ‘rec는 여전히 바로 킬 수 없는데’를 따라 기존 재생/clock 준비 후 REC 정책을 변경했습니다. 정지 REC는3초 준비→native 기록 준비→반주 재생 순서이고, 재생 중에는 현재 위치에서 clock을 지연 연결할 수 있습니다. 입력/보정/악보 저장·반주·믹스 준비/반복 끄기 검증은 유지합니다. 준비 중 조작 잠금과 별도의 준비 취소·공통 카운트인 접근을 보장하도록 연결했습니다.
- 계약 선행 변경: docs/12에 선택적 deferTransport(default false), 로컬 transport 필수·최대5초 ARMING·첫 샘플 signed 시각 연결·음수 songStartMs 하한-60,000·취소/실패/원본 보존을 명시했습니다. Rust/프론트가 같은v1 계약을 사용하고 Python/SQLite/이전 테이크 버전은 변경하지 않았습니다. 단음 채점의 기존 clock 조건도 완화하지 않습니다.
- 수정 파일: `src/features/recordings/{recordings.ts,useRecording.ts,RecordingPanel.tsx}` 및 관련3개 테스트, `features/player/PlayerEngine.ts`(재생 직전 준비 callback), `app/{App,AppShell}.tsx`·`features/score/ScoreWorkspace.tsx`(카운트인/취소를 잠금 밖에서 공통 표시); native `recording/{model,service}.rs`·`storage/recordings_tests.rs`; docs/00·12·17 및 진행 문서. 새 의존성/원본/마이그레이션 변경 없음.
- 프론트4개 검사 추가:3초 전 start 미호출·native ACK 후 PLAY·중복 REC 차단·동일 epoch 전달, 준비 취소/만료 timer 미재생, 취소 후 늦게 열린 take 중단, 반주 재생 실패의 중단/보존·잠금 해제. 기존 REC 패널 검사를 정지 REC/clock 준비 전 직접 REC와 무반주 제외에 맞게 갱신했습니다. 숫자·원형 UI는 기존 공통 컴포넌트를 재사용합니다.
- native2개 검사 추가: 최초 capture timestamp로 역산/보정1회 적용, 연결 전 INPUT 오류/5초 timeout·연결 후 drift/clock 오류 거부; 실제 임시 입력 queue/WAV/SQLite에서 clock 준비 전 표본도 포함해192,000프레임/4초/첫 marker0.75를 보존하는지 검사했습니다. 연결 전 STOP은 READY로 위장하지 않고48,000프레임의 RECOVERABLE_ERROR/CLOCK_UNCERTAIN 원본을 보존했습니다. deferTransport와 음수 시각의 정상·잘못된 입력 경계도 보강했습니다.
- 발생 오류와 해결: scoped 테스트 스레드의 Fixture move를 저장소 참조 전달로 수정, native 중첩if를 의미 동일하게 정리, 준비 취소 ref 정리를 effect 수명에 맞게 캡처해 ESLint 경고를 해결했습니다. 오류 후 검사를 다시 실행했으며 무시/경고 비활성화를 하지 않았습니다.
- 최종 `pnpm verify:app` 성공: TypeScript/ESLint·프론트149개/44파일·production build·Prettier·cargo fmt/표준 Clippy·Rust110개/기본 제외3개·binary/doc-tests. 확장 `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` 성공, custom-protocol 번들1개 성공. main chunk1,394.82kB 및 MSVC 라이브러리 생성 안내 경고 유지.
- 기존 앱은 자동 종료하지 않았으며 Get-Process와 별도 CIM 조회에서 GuitarLab 프로세스가 없는 것을 확인했습니다. 따라서 불필요한 종료 요청 없이 새 exe 빌드·실행을 진행합니다. 이 문서 작성 시 새 Windows 적용·직접 REC/준비 취소·실제 선행 구간과 첫 음 확인은 **미실행**입니다. 적용 후 사용자 직접 검사 동안 파일·앱을 유지합니다.4B는 WAV export/solo·설정 재열기도 남아 미완료입니다.

### 재생 전 REC Windows 적용 — 2026-10-15 22:19

`cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 종료 코드0. 실행 중 앱이 없음을 재확인한 뒤 exe23,485,440바이트/22:16:34를 새PID32856/22:19:04로 실행했습니다. 위 ‘Windows 적용 미실행’은 적용 전 이력입니다. 입력·모니터·REC는 자동 시작하지 않았으며 직접 REC/준비 취소·실제 첫 음 청취는 여전히 **미실행**입니다. 다음 한 가지 검사는 저장 프로젝트/SSL 입력·믹스 준비 후 정지 상태의 REC→3초 준비→자동 재생/녹음→STOP 결과입니다. 수동 요청 이후 파일과 앱을 유지합니다.

### REC 비활성 보정 조건·종료 안내 권한 진단 — 2026-10-15

- 사용자 보고: 정지 상태 REC가 비활성이고 실제 사유는 ‘현재 입력 장치와 모니터 환경의 보정값을 저장하거나 다시 읽어주세요.’입니다. ‘보정값 다시 읽기’ 후에도 현재 설정 프로필 없음이며, 목록 맨 위 Input 2가 보인다고 답했습니다. 선택된 실제 입력 전체 진단은 아직 받지 못했으므로 지연 연결 코드 실패나 정확한 설정 차이로 단정하지 않습니다.
- 기존 보정 파일을 읽기 전용으로 확인했습니다. revision6,45.82ms·MANUAL,48,000Hz/f32/1채널/channelIndex0/협상480/HEADPHONES입니다. 장치 식별자·개인 PCM은 출력/열람하지 않았고 보정 파일을 수정하거나 다른 장치에 복사하지 않았습니다. 실제 열거 결과는 SSL Input 2, SSL Input 1, NVIDIA Broadcast, SSL stereo Input 네 개입니다. 사용자에게 입력 중단→새로고침→Input 1 명시 선택/시작 후 프로필·정지 REC 확인을 요청했습니다. 결과는 아직 **미실행/확인 대기**입니다.
- 동시에 ‘창 닫기 안내 연결 실패’를 확인했습니다. `src-tauri/capabilities/default.json`의 빈 permissions가 core event 수신을 막는 것을 실제 `generate_context!()` RuntimeAuthority 검사로 재현했습니다(수정 전 실패). docs/12 계약을 먼저 보완한 뒤 로컬 main에 listen/unlisten 두 권한만 추가했습니다. emit/emit_to·원격 origin·다른 창 권한은 추가하지 않았고 native 종료 차단/STOP/저장은 그대로입니다.
- 변경 파일: `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`의 번들 권한 회귀 검사, docs/12 및 진행 문서. 새 의존성·DTO/SQLite·보정값·캡처/프론트 코드 변경은 없습니다. 설치된 Tauri2.12.3의 RuntimeAuthority API/생성 ACL과 [공식 core 권한 문서](https://v2.tauri.app/reference/acl/core-permissions/)를 확인했습니다.
- 성공: `cargo fmt --check --manifest-path src-tauri/Cargo.toml`; `cargo test --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --lib bundle_tests`2개; `cargo test --locked --manifest-path src-tauri/Cargo.toml`110개/기본 제외3개·binary/doc-tests; `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`; 별도 `cargo test --locked --manifest-path src-tauri/Cargo.toml audio::input::tests::enumerate_connected_input_devices -- --ignored --nocapture`1개(캡처 없음). MSVC 라이브러리 생성 안내 유지. 수정 전 실패 검사에서 테스트 exe 아이콘 리소스 안내도 출력됐고, 권한 수정 후 번들2개는 성공했습니다.
- 프론트 검사 재실행: **미실행** — 프론트 소스가 동일해 직전149개/타입·린트·빌드/포맷 성공을 유지합니다. 권한 수정 exe 빌드/실제 안내 연결·3초 직접 REC 성공: **미실행** — 기존PID32856 앱을 그대로 유지하며 먼저 Input 1/보정 조건을 확인합니다. Phase 4B는 계속 진행 중이며 출력/solo·설정 재열기도 남습니다.

### 믹스 준비 후 REC 활성 실제 확인 — 2026-10-15

사용자가 Input 1 선택 안내 후 ‘오버더빙 믹스 준비 했을 때 REC는 활성화’를 확인했습니다. 모니터 큐960프레임·출력 부족0·큐 초과/지연 조정0·출력 버퍼480이며, 이 표시는 모니터 버퍼 진단으로 녹음 누락/전체 왕복 지연 검증과 다릅니다. 현재 화면의 REC 선행 조건 충족은 확인했지만 보정값 숫자/선택 장치 이름을 다시 받지는 않았습니다. 정지 REC 클릭→3초 준비→자동 녹음/반주 시작→STOP 결과는 아직 **미실행/확인 대기**입니다. 제품 코드·실행 파일 변경과 검사 재실행은 **미실행** — 이번 변경은 결과 문서 갱신뿐이며 직전 자동 검사 이력을 유지합니다. 수동 요청 이후 파일과 앱을 유지합니다.

### 정지 REC 실행 응답 — 2026-10-15

사용자가 직접 REC 검사에 ‘녹음 되는거 같음’으로 답했습니다. 녹음 시작의 잠정 확인으로 기록하며3초 표시·자동 반주 시작·최종 READY/길이/누락·새 테이크 청취를 개별 통과로 기록하지 않습니다. 다음은 STOP·녹음 저장 뒤 상태 한 줄 확인입니다. 코드/실행 파일 수정·재실행 및 자동 검사 재실행은 **미실행** — 사용자 검사 중 기존 앱을 유지하며 이번 변경은 결과 문서뿐입니다. 직전 자동 검사 이력은 유지하고 Phase 4B는 계속 진행 중입니다. 요청 이후 파일·앱을 유지합니다.

### 정지 REC 이후 독립1× 테이크 READY 확인 — 2026-10-15

- 사용자 STOP 후 상태: READY3.80초/182,354프레임/누락0/peak0.598. 읽기 전용 DB에서 새ID4cbc5577-a813-4bdb-926c-d60699b189fd,48kHz·transport.rate1·오류null, referenceTakeIds=[60af7e3d-b5c7-4850-a084-66b34d321904]를 확인했습니다. songStartMs=-172.4844는 native 개방→반주 시작 전 입력/적용 보정이 포함된 기록이며 선행 PCM을 버리지 않습니다. 실제 장치 절대 지연 측정값으로 취급하지 않습니다.
- 직전 새ID76974e26-6c2c-49b9-9177-fc9161c0902c도READY196,091프레임/48kHz/rate1/같은 참조/오류null로 저장돼 있습니다. 개인 WAV/PCM은 읽지 않았고 메타데이터만 확인했습니다. 3초 표시/자동 반주/첫 음의 개별 청취 품질 확인과 구분합니다.
- 다음은 최신3.80초1× 테이크를 믹스에 추가하고 기존0.5× 레이어를 음소거해 반주와 출력 미리 듣기를 검사합니다. 이후 solo/새 WAV 내보내기·믹스 설정 재실행 복원과 pending 이벤트 권한 적용을 진행합니다. 실제 출력·청취는 **미실행/확인 대기**입니다.
- 제품 코드/실행 파일 변경·자동 검사 재실행은 **미실행** — 이번 변경은 실제 결과 문서 갱신뿐이며 직전 검사 이력을 유지합니다. 수동 요청 이후 파일·앱을 유지하며4B 완료로 표시하지 않습니다.

### 출력 믹스 미리 듣기 응답 — 2026-10-15

최신3.80초1× 테이크 추가·기존0.5× 레이어 음소거·출력 믹스 만들기/미리 듣기 요청에 사용자가 ‘들리는거 같음’으로 답했습니다. 청취 잠정 확인이며 sample-accurate 동기나 정량적 음질 통과로 확대하지 않습니다. 다음은 사용 권한 확인 후 새 WAV 파일로 내보내고 같은 소리가 재생되는지 확인합니다. 실제 solo/설정 재실행 복원은 아직 **미실행**이며 자동 gain/mute/solo/offset 검사와 구분합니다. 코드 변경·검사 재실행은 **미실행** — 문서만 갱신했고 수동 요청 이후 파일·앱을 유지합니다.

### 새 WAV 내보내기·실제 청취 성공 — 2026-10-15

- 사용자가 앱의 ‘새 WAV 파일로 내보냈습니다. 원본은 변경하지 않았습니다.’ 안내, 새 파일 생성, 외부 플레이어에서 방금 연주한 기타 소리가 잘 들림을 확인했습니다. 최신1× 테이크의 실제 파일 출력/청취 성공이며 sample-accurate 동기·모든 포맷/배속 지원 검증으로 확대하지 않습니다. 개인 출력 WAV/PCM을 assistant가 읽거나 전송하지 않았습니다.
- 남은 작업은 현재 믹스 설정 저장·재실행 복원과 이미 자동 검사한 종료 안내 권한 수정의 제품 적용입니다. 실제 solo 청취는 **미실행**이며 기존 자동 solo/mute/offset/원본 보존 검사와 구분합니다. 기존 앱PID32856을 직접 종료하지 않습니다.
- 사용자 기타 숙련도는 입문 수준이며, 이후 수동 검사는 연주 실력과 무관한 짧은 단음과 적은 조작으로 나누어 안내합니다. 새로운 기능 요구사항이나 연주 품질 통과 조건으로 임의 확대하지 않습니다.
- 변경 파일은 진행 README/이 문서뿐입니다. 코드 수정·자동 검사 재실행은 **미실행** — 직전 프론트149개/Rust110개·제외3개·번들2개 등 성공 이력을 유지합니다. 설정 재실행 확인 전4B 진행 중이며 요청 후 파일·앱을 유지합니다.

### 최종 수정 적용·저장 데이터 재실행 비교 — 2026-10-15 22:43

- 사용자 ‘저장하고 닫음’ 확인 후 실제 GuitarLab 프로세스 없음을 확인했습니다. 저장 믹스는 masterGain0.7, 로컬 반주 gain0.5, 최신3.80초1× 테이크 gain0.7의 두 레이어이며 모두mute/solo=false·offset0입니다. 원본 ‘복원 확인’ 테이크는 별도 보존됩니다.
- `src/features/performance/useProjectMix.ts`의 준비 완료 안내를 정지 REC→3초→반주/녹음 시작으로 정리하고 기존 `useProjectMix.test.tsx`에 문구 검증을 추가했습니다. DTO/보정/오디오 경로/저장 형식은 바꾸지 않았습니다.
- 최종 `pnpm verify:app` 성공: TypeScript·ESLint·프론트149개/44파일·production build(main1,394.84kB)·Prettier·cargo fmt/표준 Clippy·Rust110개/제외3개·binary/doc-tests. 최종 custom-protocol 번들2개 성공. 앞선 확장 Clippy 이후 native 제품/검사 소스는 같아 확장 검사 반복은 **미실행**이며 직전 성공 결과를 유지합니다. 기존 큰 chunk와 MSVC 라이브러리 생성 안내 경고는 유지됩니다.
- `cargo build --locked --manifest-path src-tauri/Cargo.toml --features custom-protocol --bin guitarlab` 성공. exe24,214,016바이트/22:43:30, 새PID23848/22:43:46/창 제목GuitarLab으로 실행했습니다. 종료 안내의 local main listen/unlisten 권한 수정이 포함됩니다. 입력·모니터·REC 자동 시작 없음.
- 재실행 전후 읽기 전용 SQLite 비교에서 저장 믹스 설정·해시와22개 전체 테이크 메타데이터/해시가 동일하고 저장 SHA-256이 모두 일치했습니다. 개인 WAV/PCM은 읽지 않았으며 실제 원본 바이트 불변 자동 fixture 검사와 구분합니다.
- 실제 UI 믹스 복원·종료 안내 연결 오류 해소는 **미실행/확인 대기**입니다. 같은 프로젝트를 열어 두 레이어와 음량 복원·오류 유무만 확인하며 요청 후 파일과 앱을 유지합니다. Phase 4B는 아직 진행 중입니다.

## 최종 완료 기록 — 2026-10-15

- 재실행 후 사용자는 설정이 복원된 것으로 답했고 종료 안내 연결 오류 문구는 찾지 못했다고 답했습니다. 각 슬라이더의 수치를 개별 재확인한 것으로 확대하지 않으며, 실제 화면 응답과 저장 믹스/22개 테이크 메타데이터 전체 동일·해시 무결성 검사를 함께 근거로 기록합니다.
- 수용 조건: 실제 별도1× 테이크 READY3.80초/182,354프레임/누락0·기존 참조 보존, 믹스 청취/음소거·끊김 개선, 새 WAV 생성/외부 플레이어의 기타 청취, 믹스 저장/앱 재실행 복원을 확인했습니다. 다른 Lead/Rhythm 트랙의 독립 저장·solo/mute/gain/offset·원본 WAV 바이트 불변·취소/충돌/마이그레이션은 자체 합성 자동 검사로 확인했습니다. 현재 실제 프로젝트의 단일 악보 트랙과 구분합니다.
- 최종 검증: verify:app 프론트149개/44파일·native110개/제외3개·타입/린트/production build/포맷/표준 Clippy 성공, 최신 번들2개·Windows custom-protocol 빌드/실행 성공. 확장 Clippy는 native 최종 소스에서 앞서 성공했고 그 뒤 프론트 안내만 바뀌었습니다. 실제 solo 청취/출력 정밀 동기 측정·다중 장치 장시간 검사는 **미실행**이며 후속 품질 범위로 남깁니다. Python 검사는 **미실행** — 이번 범위에서 Python을 변경하지 않았습니다.
- 알려진 제한은 위4절의1×/무반주 테이크·지원 WAV/48kHz mono·64MiB 입력/8레이어·출력10분/256MiB·hard link 지원 파일 시스템·고품질 시간 변환 미구현을 따릅니다. 실패/미지원 기능을 성공으로 기록하지 않습니다.
- 완료 문서·로드맵/진행 표를 갱신하고 사용자 자동 개발 지침에 따라 Phase 5의 불변 편집/Undo·Redo·렌더/저장·내보내기 계약부터 진행합니다. 현재PID23848 앱을 직접 종료하지 않습니다.
