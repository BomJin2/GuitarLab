# AmpliTube VST3 Integration — Phase 01

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: RAW DI 분기·입력 모니터 기반. 모니터 출력 경로에 FX 자리를 만들고(우선 dry 통과), 지연 구성 추정을 보여 줍니다.
- 사용자 결정(2026-11-07): **D1** 우선 WASAPI로 진행(ASIO는 지연이 부족할 때 다시 결정), **D2** 테이크 재생을 Rust 출력으로 옮김(Phase 2B), **D3** AmpliTube 인스턴스 하나로 시작(모니터와 재생이 공유).

## 결론

- **PASS(자동 검사)**: 모니터 출력이 블록 단위 삽입 처리(`MonitorInsert`)를 거치게 바꿨고, 처음 삽입 `DRY`는 기존 출력과 샘플 단위로 같습니다(기존 모니터 테스트 6개가 수정 없이 통과).
- 명세 Phase 1 항목 중 이미 저장소에 있던 것: DI 분기 녹음(`recordings/<take>/dry.wav`, 입력 callback에서 녹음 큐와 모니터 링으로 따로 복사), Input Monitor와 REC의 독립(모니터 켜기는 녹음을 시작하지 않음), 판정 입력은 DI. 이번에 바꾸지 않았습니다.
- **남김**: "트랙별 FX 라우팅·master를 단일 엔진에 연결"은 D2(테이크 재생의 Rust 이전)와 묶여 Phase 2B로 옮깁니다. 귀로 듣는 dry 모니터 확인은 `MANUAL-CHECKS.md` 16번입니다.

## 구현된 기능과 변경 파일

| 파일 | 변경 | 이유 |
|---|---|---|
| `docs/12-API-CONTRACTS.md` | "모니터 삽입 처리 v1" 계약 추가(선택 스냅샷 필드 포함) | 계약 먼저 |
| `src-tauri/src/audio/monitor.rs` | `MonitorInsert` trait·`DryInsert`, 미리 할당한 1024프레임 블록 버퍼, 삽입 뒤 음량·클램프, mono 장치는 좌우 평균, 스냅샷 `insert`·`queueTargetFrames`·`insertLatencyFrames`, 테스트 2개 | VST3를 끼울 자리(Phase 2A) |
| `src/features/practice/monitoring.ts` | 선택 필드 타입·검사, `monitorLatencyEstimateMs` | 구버전 응답 호환 |
| `src/features/practice/InputMonitor.tsx` | "모니터 지연 구성 추정 약 N ms" 안내(실제 왕복 아님을 함께 표시) | 명세 §4.2·§8-8 |
| `src/features/practice/monitoring.test.ts` | 선택 필드 유무·범위·추정 계산 테스트 1개 | |
| `docs/plugin/…Integration.md` | §0.5에 D1~D3 결정 기록 | |

실시간 규칙: 출력 callback 안에서는 할당·잠금·I/O가 없습니다. 블록 버퍼는 시작 때 만들고, 삽입은 `Box<dyn MonitorInsert>`를 시작 때 넣습니다.

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --locked --manifest-path src-tauri/Cargo.toml audio::monitor` | PASS 8개(1개 장치 열거용 ignore). 새 테스트 중 1개는 처음에 큐 상한(2,880프레임)을 넘는 입력을 써서 실패 → 테스트 수치만 고침 |
| `pnpm vitest run src/features/practice` | PASS 78개 |
| `pnpm verify:app` | PASS(프론트 849개, Rust 300개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| 디버그 앱 재빌드 + CDP로 `get_input_monitor` 조회(모니터·입력 시작 안 함) | PASS: `insert:"DRY"`, `queueTargetFrames:0`, `insertLatencyFrames:0`, 콘솔 오류 0 |

## PASS / FAIL / NOT RUN

- 블록 삽입·dry 동일성·mono/stereo 출력·유한하지 않은 값 무음: PASS(자동).
- 실제 장치로 모니터 켜기·dry 소리·지연 추정 표시: **NOT RUN**(입력 캡처·스피커 출력을 에이전트가 켜지 않음) → MANUAL-CHECKS 16.
- 명세 T02·T03·T04(모니터/REC 조합): 기존 구현 그대로, 이번에 새로 실기기 검증하지 않음.

## 원본 DI 데이터 무결성

- 녹음 경로(`recording/`)와 입력 callback은 바꾸지 않았습니다. 삽입 처리는 모니터 출력 링을 읽는 쪽에서만 일어나 녹음 PCM에 닿지 않습니다.
- 사용자 프로젝트·녹음은 읽거나 쓰지 않았습니다.

## 미완성·제약·리스크

- 지연 표시는 **구성 추정**입니다(큐 목표 20ms + 출력 버퍼 + 삽입 지연). 입력 버퍼·WASAPI 공유 모드·장치 변환은 빠져 있어 실제로 들리는 지연은 더 깁니다. 실제 왕복 측정은 루프백 배선이 필요합니다.
- 현재 큐 목표 20ms는 기타를 치며 듣기에 크게 느껴질 수 있습니다. 줄이면 출력 부족(끊김)이 늘 수 있어, AmpliTube를 넣은 뒤 측정으로 정합니다.

## 다음 단계와 재개 지점

- Phase 2A: 제품 크레이트에 `vst3-host`를 넣고(의존성 고지·배포 고지 재수집, `docs/10` 검토), AmpliTube 인스턴스 하나를 작업 스레드에서 로드해 `MonitorInsert`로 꽂습니다. 실시간 경로는 O-3(`process_audio`의 Mutex) 때문에 크레이트의 잠금 없는 경로를 먼저 검토합니다.
