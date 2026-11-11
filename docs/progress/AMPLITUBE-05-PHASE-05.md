# AmpliTube VST3 Integration — Phase 05(안정화·릴리스 준비 점검)

- 작업 일자: 2026-11-08
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 5와 11절 테스트 시나리오 T01~T18의 실제 상태를 한 곳에 정리하고, 자동으로 할 수 있는 점검을 실행합니다. 통과 기준: 검증된 범위·제약·미지원을 문서에 명확히 표시.

## 결론

- **발견·수정(중요)**: Phase 3B·4A에서 앱 DB를 11·12로 올리면서 **백업·복원 쪽 허용 버전(8·9·10)을 넓히지 않아, 실제 앱의 로컬 백업이 `BACKUP_DATABASE_VERSION`으로 거부되는 상태**였습니다(사용자 실제 DB는 이미 12). CI와 같은 `scripts` unittest에서 37개가 실패해 찾았고, 백업 스크립트·복원 예약 상태 검사(Rust·Python·화면)의 허용 버전을 8~12로 넓혔습니다. 실제 번들 Python worker로 백업 2개·복원 예약/복구 2개 ignored 검사를 포함해 통과했습니다.
- **측정**: AmpliTube 5.10.4, 48kHz·128프레임 블록 7,500개 처리 시간 평균 0.126ms·p50 0.119·p99 0.199·p99.9 0.290·최대 0.455ms(블록 주기 2.667ms, **평균 부하 4.7%**). 1초 테이크 오프라인 렌더(정착 확인 포함) 1.1초.
- **릴리스 점검**: 제품 release 빌드(내장 화면) 성공, 선언 최소 Rust 1.90 컴파일 성공, 배포 고지 의존성 지문 일치(이번 Phase 4에서 의존성 변경 없음). 설치기·서명·새 PC 검증은 하지 않았습니다.
- **설명서**: `docs/21-QUICKSTART.md`에 "7. AmpliTube 5로 톤 입히기"(설치·인증, SSL 2 MKII 입력·MIX 노브·샘플레이트, 모니터·편집 창·Bypass·톤 저장, Freeze·내보내기·Bounce 표, 안내 문구 뜻)와 문제 해결 2줄을 더했습니다.

## 실행한 점검

| 명령 | 결과 |
|---|---|
| `pnpm verify:app` | PASS(프론트 864개, Rust 315개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| `cargo test --locked --all-features`(CI 확장) | PASS 319개 |
| `cargo test --example benchmark_agpt_onsets` / `--example manage_ai_model`(CI) | PASS 각 1개 |
| `python -m unittest discover -s scripts -p "test_*.py"`(CI) | 처음 **37개 오류**(DB 버전) → 수정 후 PASS 193개(skip 1) |
| `GUITARLAB_BACKUP_RESOURCES=<target/debug> cargo test … storage::backup storage::restore_requests storage::restore_state -- --include-ignored` | PASS 12개(실제 번들 worker 4개 포함). 처음 복원 예약 1개가 Rust 쪽 허용 버전 때문에 실패 → 수정 후 통과 |
| `cargo +1.90.0 check --locked --all-targets --all-features`(CI) | PASS |
| `cargo build --release --locked --features tauri/custom-protocol` | PASS(125초) |
| `cargo test --lib installed_amplitube_block_timing_at_48k -- --include-ignored` | PASS(위 측정) |
| `package_validation.verify_inventory_dependencies` | PASS |
| `python -m pytest ai/tests`(CI) | **NOT RUN**: 이 PC 기본 Python에 pytest가 없고 `ai/` 코드는 바꾸지 않음(원격 CI가 실행) |

## 테스트 시나리오 T01~T18 상태

자동 = 코드·단위·실제 AmpliTube ignored 검사, 앱 = 에이전트가 실제 앱을 조작해 확인, 사람 = `MANUAL-CHECKS.md` 청취·실기기.

| ID | 시나리오 | 상태 | 근거 |
|---|---|---|---|
| T01 | AmpliTube VST3 검색 | 자동·앱 PASS | 이름·제조사·Fx 범주 식별 검사, 실제 로드(02A·03A) |
| T02 | 모니터 ON·REC OFF | 자동 PASS(신호), 사람 남음(17) | DSP 경로 처리 출력 확인, REC는 별도 명령 |
| T03 | REC ON·모니터 OFF | 기존 PASS | 기존 InputOnly 녹음 검사(AmpliTube와 무관) |
| T04 | REC·모니터 동시 | 설계·자동 PASS, 사람 남음(17) | 녹음·판정은 입력 callback에서 DI 복사, 삽입은 출력 callback 뒤 |
| T05 | 프리셋 A→B | 앱 PASS(화면), 사람 남음(19·20) | 편집 창 앰프 전환·복원(03B), DI SHA 불변(04A) |
| T06 | 저장/불러오기 | 앱 PASS | 앱 재시작 뒤 프로젝트 톤 복원(03B) |
| T07 | AmpliTube 누락 | 자동 PASS, 실제 미설치 **미실행** | 원음 유지 안내(03C), 제품을 지우지 않음 |
| T08 | LEAD+RHYTHM 오버더빙 | DI 독립 기존 PASS, 톤 분리는 사람 남음(24·25) | Freeze/Bounce로 테이크별 톤 |
| T09 | Score/DAW 전환 | 앱 PASS | 13회 전환 중 입력·모니터·플러그인 불변(03E) |
| T10 | Freeze/Unfreeze | 자동·앱 PASS, 사람 남음(24) | 오프라인=실시간 상관 1.0000(04A) |
| T11 | Bounce | 자동·앱 PASS, 사람 남음(25) | Freeze 복사 SHA 일치(04C) |
| T12 | 처리된 소리 내보내기 | 자동·앱 PASS | 캐시와 바이트 동일, tail 포함, Freeze 줄은 실시간 적용 막음(04B) |
| T13 | 48k 64/128/256/512 | **부분**: 내부 128블록 처리 시간만 측정 | WASAPI 공유 모드(D1)라 장치 버퍼를 앱이 고르지 않음. ASIO는 사용자 결정 전 미지원 |
| T14 | mono DI → stereo | 자동 PASS | 1in/2out 버스 확인, Bypass 좌우 동일, 렌더 stereo |
| T15 | 네이티브 편집 창 | 앱 PASS, 노브 조작 청취는 사람(19) | 실제 AmpliTube 화면·X 닫기·앱 종료(03A) |
| T16 | 강제 중지·디스크 부족 | 기존 녹음 복구·`DISK_SPACE_LOW` 검사 PASS, AmpliTube 크래시 **미실행** | 플러그인은 앱 안에서 실행(크래시 시 앱도 종료 가능, 문서화) |
| T17 | 채널·장치 분리 | 기존 오류 처리 검사 PASS, 실제 분리 **미실행** | 점검 중 기본 2ch SSL 입력 중단 발견(MANUAL 23) |
| T18 | 판정 + wet 모니터 | 설계·자동 PASS, 사람 남음(17) | 판정 입력은 DI, 삽입·Bypass와 독립 |

## 후속 조사(2026-11-08): 기본 2ch SSL 입력 멈춤

- 03E에서 본 "Input(SSL 2 MKII)" 2ch가 480프레임 뒤 멈춘 현상을 다시 조사했습니다. 앱에서 7번(AmpliTube 로드 전·후·해제 뒤, Input 1과 번갈아)과 앱과 같은 cpal 0.18.2·기본 설정·raw stream으로 만든 단독 진단 프로그램(작업 폴더, 저장소에 넣지 않음)에서 모두 정상이었습니다(4초 callback 400개·192,000프레임, stream 오류 없음, 기본 형식 F32 2ch 48kHz 480프레임).
- 재현되지 않아 입력 경로는 바꾸지 않았습니다. 일시적 장치 상태(다른 프로그램의 배타 모드 등)로 봅니다(MANUAL 23 갱신).
- 이어서 사용자 요청("구분 넣기")으로 **입력 오류 원인 구분**을 넣었습니다(`docs/12` "입력 오류 원인 구분 v1"). 실패 플래그에 원인(1 stream 오류·2 2초 무입력·3 내부 경로)을 처음 것만 남기고, 무입력은 새 코드 `AUDIO_INPUT_STALLED`, 나머지는 기존 `AUDIO_DEVICE_UNAVAILABLE`로 보냅니다. 입력 패널은 무입력이면 "다른 프로그램이 장치를 단독으로 쓰는지·Windows 단독 제어 설정"을, 그 밖에는 "연결·전원"을 안내합니다. 변경: `src-tauri/src/audio/input.rs`(`mark_failed`·`failure_code`·검사), `src/features/practice/audioInput.ts`(`inputFailureMessage`)·`InputPanel.tsx`·검사. `pnpm verify:app` 프론트 865·Rust 315, clippy 통과. 실제 무입력 상황은 다시 생길 때만 확인할 수 있습니다(MANUAL 23).

## 미지원·제약(최종)

- 플러그인은 AmpliTube 5 하나, 인스턴스 하나(D3). 트랙별 실시간 다른 톤은 Freeze/Bounce로 대신합니다.
- 오디오는 WASAPI 공유 모드(D1), ASIO 미지원. 실시간 AmpliTube 테이크 재생은 1배속·한 테이크.
- 플러그인 격리(별도 프로세스) 없음: AmpliTube가 멈추거나 죽으면 앱도 영향을 받습니다.
- 인증 여부는 앱이 알 수 없습니다(VST3에 표준 방법 없음).
- DB 12 앱 데이터는 이전 앱이 열지 않습니다. (Bounce 삭제는 2026-11-08 4D에서 추가: [04D](AMPLITUBE-05-PHASE-04D.md).)
- 설치기·코드 서명·새 PC 설치 검증, 법무 검토(`legalReviewCompleted:false`)는 하지 않았습니다.

## 원본 DI 데이터 무결성

- 이번 Phase는 사용자 데이터를 바꾸지 않았습니다(테스트는 자체 임시 폴더, 측정은 합성 신호). 백업 수정은 읽기 허용 범위만 넓혔고 백업 형식은 그대로입니다.

## 다음 단계

- 사람 확인: `MANUAL-CHECKS.md` 15~25번(특히 17·18·19·24·25 청취, 23 입력 장치).
- 커밋: 이번 세션의 큰 미커밋 변경(Phase 2B~5)은 사용자 요청 시 리뷰 루프로 커밋합니다.
