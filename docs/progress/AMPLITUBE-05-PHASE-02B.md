# AmpliTube VST3 Integration — Phase 02B

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 녹음한 DI 테이크를 AmpliTube 톤으로 재생합니다(명세 Phase 2의 2B, UC-3 1~2·5).
- 사용자 결정(2026-11-07): **모니터 경로에 합치기**. Cakewalk의 한 트랙 FX처럼, 믹스의 TAKE 레이어 하나의 DI를 출력 callback에서 기타 입력 DI에 더해 같은 AmpliTube 인스턴스(D3)로 처리합니다. 반주·다른 레이어는 기존 WebView 재생 그대로입니다(믹스 전체를 Rust로 옮기는 안은 선택하지 않음).
- 같은 날 먼저 한 일: 배포 고지 보완(아래 "배포 고지").

## 결론

- **PASS(자동)**: Rust 재생 음성 단위 검사(선행 프레임·끝 정지·NaN 무시·이전 클립을 callback 밖에서 해제), 모니터 render 검사(입력 prefill 전에도 테이크가 들리고 입력 실패면 무음), 서비스 검사(DRY 모니터 거부·모니터 없음 거부), 프론트 검사(재생 레이어가 media 대신 모니터 명령을 보내고 배속·실패 때 원음으로 복귀, 패널 체크박스).
- 참고: 디버그 빌드는 `devUrl`(127.0.0.1:1420)을 여는데, 그 포트를 사용자의 다른 프로젝트(bomvox) 개발 서버가 쓰고 있어 처음에는 다른 앱 화면이 떴습니다. 그 서버는 건드리지 않고 내장 화면 빌드로 다시 확인했습니다.
- **NOT RUN(사람 확인)**: 실제로 듣기(톤·박자 맞음·2초마다 튐 없음·기타와 섞임) → `MANUAL-CHECKS.md` 18번. 소리가 예상 없이 나지 않도록 에이전트는 실제 모니터를 켜지 않았습니다.

## 구현된 기능과 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md` | "모니터 테이크 재생 v1": 명령 3개, 선행 프레임, callback 규칙, 음량·배속 규칙 |
| `src-tauri/src/audio/monitor_playback.rs`(새) | callback 쪽 `PlaybackVoice`(SPSC 명령 링·원자 위치·`Arc<[f32]>` 클립), 제어 쪽 `PlaybackControl`(제어 쪽이 클립 사본을 들고 있어 callback에서 해제 없음), 요청·응답 형식 |
| `src-tauri/src/audio/monitor.rs` | render가 삽입 앞에서 테이크 DI를 더함, 실행 중 모니터에 재생 제어, 선행 프레임 = `insertLatencyFrames`, `playback_rate`/`load_playback`/`set_playback`/`playback` |
| `src-tauri/src/audio/input.rs`, `audio/mod.rs` | AudioService 위임 |
| `src-tauri/src/commands/monitor_api.rs`, `app.rs` | `load_monitor_playback`(기존 `recording_bytes`로 크기·SHA 검사 후 읽기만, `mixer::pcm::decode`), `set_monitor_playback`, `get_monitor_playback` |
| `src/features/performance/monitorPlayback.ts`(새) | API·응답 검사·오류 문구 |
| `src/features/performance/TakeMixPlayer.ts` | `setWet`/`wetTakeId`, 재생 레이어는 media를 멈추고 재생·정지·탐색 때 명령, 2초마다 위치 비교 후 50ms 넘게 벌어지면 다시 맞춤, 1배가 아니거나 명령 실패면 원음 재생으로 복귀 |
| `src/features/performance/useProjectMix.ts`, `MixPanel.tsx` | `wetTakeId`/`setWetTake`, TAKE 레이어의 "AmpliTube로 재생" 체크와 안내 |
| 테스트 | Rust 4개(새 3 + 기존 서비스 검사 보강), TS: `TakeMixPlayer.test.ts` 1개, `monitorPlayback.test.ts` 1개, `MixPanel.test.tsx` 보강 |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --lib -- audio::monitor` | PASS 12개(+ignore 1) |
| `pnpm vitest run src/features/performance` | PASS 57개 |
| `pnpm verify:app` | PASS(프론트 854개, Rust 306개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| `python -m unittest discover -s scripts -p "test_*.py"`(배포 고지 뒤) | PASS(skip 1) |
| 디버그 앱(내장 화면 빌드 `--features tauri/custom-protocol`) + CDP: 명령 3개 | PASS: 빈 상태 조회, `takeId:null` 멱등, 모니터 꺼짐 `MONITOR_NOT_AMPLITUBE`, 클립 없음 `PLAYBACK_NOT_LOADED`, 모르는 필드·잘못된 ID 거부 |
| CDP: "응가" 연주 화면에서 테이크 레이어를 메모리에만 추가 → 준비 → 체크 → 레이어 제외(저장 없음) | PASS: 체크박스·안내 표시, 모니터 꺼짐 안내 후 체크 해제 유지, 원래 레이어 4개로 복귀, 콘솔 오류 0 |

## 원본 DI 데이터 무결성

- 테이크 파일은 기존 녹음 읽기 함수로 **읽기만** 하고(크기·SHA 검사), 디코딩한 PCM은 메모리에서만 씁니다. 녹음 PCM·판정 입력은 입력 callback에서 따로 복사하므로 재생 DI가 섞이지 않습니다.
- 선택은 화면 세션에만 두고 저장하지 않습니다.

## 배포 고지(같은 날, 2B 전에)

- `com-scrape-types` 0.1.1의 원문을 `.cargo_vcs_info.json`의 정확한 commit `33f1859f…`(coupler-rs/vst3-rs 루트 LICENSE-MIT·LICENSE-APACHE)에서 받아 새 영수증(`src-tauri/target/runtime-validation/upstream-notices-669d705a-…`)에 더하고 다시 수집했습니다(`release-notices-e85d81f3-…`, 289항목, 검토 필요 3개: selectors·GuitarLab·모델 — 이전과 같음).
- `docs/release`에 새 7개 항목·원문 3개를 기존 순서를 지키며 더하고 Cargo·metadata·영수증 지문을 갱신했습니다. `package_validation`의 의존성 지문·원문 크기/SHA 검사와 `scripts` unittest 전체(CI와 같은 명령)가 통과했습니다.
- 이전부터 있던 차이: runtime 리소스의 `notices/README.md`(VC 런타임 안내 추가본)가 목록의 이전 판과 다릅니다. 이번 범위가 아니라 갱신하지 않았습니다.

## 미완성·제약·리스크

- AmpliTube로 재생되는 테이크는 한 번에 하나이고, 입력 모니터를 AmpliTube로 켠 동안만 됩니다(D3, 사용자 선택). 모니터를 끄면 그 레이어는 원음 재생으로 돌아가고 안내가 뜹니다.
- 톤 뒤 음량은 모니터 음량 하나입니다. 레이어 gain은 AmpliTube 앞 크기를 바꿔 톤이 달라지므로 적용하지 않습니다(음소거·Solo·마스터 0은 정지로 적용).
- 1배 속도에서만 됩니다(Rust 재생에 음정 유지 시간 변환이 없음). 아니면 원음 재생으로 바꿉니다.
- 동기: 반주는 WebView, 테이크는 모니터 출력 장치라 시계가 다릅니다. 삽입 지연만 앞당겨 보정하고 2초마다 50ms 넘게 벌어지면 다시 맞춥니다(맞출 때 잠깐 튈 수 있음). WebView 출력 지연은 보정하지 않습니다.
- 레벨 미터는 이 레이어를 0으로 보여 줍니다. 테이크 샘플레이트가 모니터와 다르면 거부합니다(리샘플 없음).
- 다른 트랙에 다른 톤(UC-4)·상태 저장·에디터는 Phase 3 이후입니다.

## 다음 단계와 재개 지점

- Phase 3: 에디터 창(Windows는 `vst3-host` 문서상 런타임 미검증), 상태 blob 저장·복원, FX 랙 UI. → 에디터 창은 [03A](AMPLITUBE-05-PHASE-03A.md)에서 완료.
