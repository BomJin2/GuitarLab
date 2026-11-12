# AmpliTube VST3 Integration — Phase 04A(Freeze / Unfreeze)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 4 "Freeze 캐시 렌더 + Unfreeze 원본 복원"(UC-5, 9.2, T10). 설계·결정은 `docs/plugin/PHASE-04-DESIGN.md`.
- 사용자 결정(2026-11-07): 오프라인 렌더, DB 12 승인, Unfreeze 시 캐시 삭제, Bounce는 믹스 새 레이어(4C), 순서 4A → 4B → 4C.

## 결론

- **PASS(실제 AmpliTube)**: 같은 DI를 오프라인 렌더와 실시간 DSP 경로로 처리하면 **상관 1.0000·레벨 차 0.00dB**(실시간 출력은 정확히 615프레임 = 첫 callback 480 + DSP 블록 128 + 플러그인 지연 7만큼 늦음), 오프라인 반복도 상관 1.0000. 렌더 중 모니터 시작은 `PLUGIN_IN_USE`, 샘플레이트 다르면 `PLUGIN_RATE_MISMATCH`.
- **PASS(앱, 사용자 데이터)**: DB 11 백업 뒤 새 빌드로 DB 12 migration. "응가"의 테이크를 화면에서 ❄ Freeze(2.5초) → 캐시 2,056,348바이트(DI 194,539프레임 + tail 62,499프레임, SHA 일치), 원본 DI SHA 불변, 줄에 ❄, 믹스 준비 성공 → Unfreeze로 행·파일 삭제, 버튼 복귀. 정리 뒤 기존 18개 표는 백업과 행 단위로 같고 `take_renders`는 비어 있음.
- **NOT RUN(사람 확인)**: Freeze된 테이크를 모니터 없이 재생했을 때 톤이 실시간과 같게 들리는지, 꼬리가 자연스러운지 → `MANUAL-CHECKS.md` 24번.

## 확인 중 발견(중요)

- **AmpliTube는 불러온 직후·톤을 바꾼 직후 약 1초 동안 결과가 다릅니다.** 로드 직후 오프라인 렌더는 RMS 0.955였고 0.6~1.0초 뒤부터 0.252로 고정됐습니다(캐비닛 IR 등을 비동기로 불러오는 것으로 보임). 처음 비교에서 오프라인·실시간 상관이 0.85로 나온 원인이었고, 실시간 뒤에 한 오프라인 렌더는 실시간과 같았습니다.
- 대응: 렌더 전에 짧은 탐침(110Hz 0.125초)을 250ms마다 처리해 RMS가 7번 연속(1.5초) 0.5dB 폭 안에 들면 정착으로 보고(2026-11-11 리뷰 R11-1로 세 번에서 강화)(최대 32회 약 8초, 그 뒤엔 그대로 진행해 계속 변하는 모듈레이션 톤도 막지 않음), 그 뒤 무음 1초로 탐침 잔향을 비운 다음 렌더합니다. 정착 대기 동안 편집 창 메시지를 돌립니다.
- 같은 이유로 실시간 모니터에서도 톤을 바꾼 직후 약 1초는 소리가 달라질 수 있습니다(플러그인 동작, 앱이 막을 수 없음).

## 구현

| 영역 | 내용 |
|---|---|
| 계약 | `docs/12` "테이크 Freeze v1", `docs/07` migration 012 |
| DB | `012-take-renders.sql`(DB 12): 메타데이터 JSON+SHA, 렌더에 쓴 톤 blob+SHA, 테이크당 FREEZE 하나(부분 유일 색인). 영구 삭제 표 목록에 추가, 기존 migration 테스트의 표 DROP·기대 버전 갱신 |
| 렌더 | `plugins/render.rs`: `render_offline`(무음 1초 → 지연 자르기 → tail -90dBFS 0.5초 또는 10초, 끝 무음 자름, 비유한값 0), `settle`, `stereo_wav`. `plugins/mod.rs`: 소유 스레드 `Render` 명령, `render_take`(진행률·취소, 렌더 중 모니터 시작·해제 `PLUGIN_BUSY`), 렌더 경로도 매 블록 출력 버퍼 비움 |
| 저장 | `storage/take_renders.rs`: 새 파일 저장 후 한 트랜잭션에서 이전 Freeze 교체(실패하면 새 파일만 지움), 읽을 때 크기·SHA·테이크 SHA(`FREEZE_STALE`) 검사, Unfreeze 행 삭제 후 파일 삭제, Freeze 톤 꺼내기 |
| 명령 | `list_take_freezes`, `freeze_take`(StorageJob), `read_take_freeze`(StorageJob binary), `unfreeze_take`, `restore_take_freeze_tone` |
| 믹스 렌더/내보내기 | Freeze된 TAKE 레이어는 캐시(stereo → 평균 mono, tail 포함), 결과 `frozenLayers` |
| 화면 | `freeze.ts`(API·검사·문구), `useProjectMix`(목록, 준비 때 캐시 읽기·`FREEZE_STALE/INVALID`면 그 레이어만 DI로 안내, Freeze된 줄은 "AmpliTube로 재생" 거부, Freeze/Unfreeze 뒤 다시 준비 안내), 하단 믹서 줄 ❄, 테이크 FX 랙의 ❄ Freeze·Unfreeze·"Freeze 때 톤 불러오기"(모니터가 켜져 있으면 Freeze 막음), 믹스 결과에 Freeze 레이어 수 |
| 테스트 | Rust: 렌더 3·정착 1·저장 1·믹스 1·실제 AmpliTube 비교 1(ignored). TS: `freeze.test.ts` 2, `useProjectMix`·`BottomMixer` 각 1, `mixing` 보강 |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --lib installed_amplitube_offline -- --include-ignored` | PASS(위 비교 수치, 테스트 약 55초) |
| `pnpm verify:app` | PASS(프론트 862개, Rust 314개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| 앱(내장 화면 빌드) + CDP·DB 직접 읽기 | PASS(위 결론) |

## 원본 DI 데이터 무결성

- Freeze는 `recording_bytes`(크기·SHA 검사)로 DI를 읽기만 하고, 캐시는 `renders/`의 새 파일입니다. 앱 확인에서 DI SHA가 테이크·렌더 기록과 같음을 확인했습니다.
- 사용자 데이터: 실제 DB는 11 → 12(사용자 승인). 확인용 Freeze는 Unfreeze로 지웠고, 테스트가 남긴 빈 `renders/` 폴더도 앱 종료 뒤 지웠습니다. 백업: `%APPDATA%\com.guitarlab.app.db11-backup-20261107`(10 백업은 `…db10-backup-20261107`).

## 미완성·제약·리스크

- 렌더는 인스턴스 하나를 쓰므로 모니터를 끄고 해야 하며, 렌더하는 동안(10분 테이크면 수십 초 예상) AmpliTube를 다른 데 쓸 수 없습니다.
- Freeze는 "그때 톤"으로 고정됩니다. 지금 톤을 바꿔도 캐시는 그대로이며(의도), 바꾼 톤으로 하려면 다시 Freeze합니다.
- 꼬리 길이는 기본 톤에서 약 1.3초였습니다(잡음이 -90dBFS 위로 남는 동안). 아주 조용한 톤이면 짧아집니다.
- 캐시는 stereo float32라 10분 테이크면 약 230MB입니다. 빈 `renders/` 폴더는 Unfreeze 뒤에도 남습니다(무해).
- Export Processed(4B)·Bounce(4C)는 다음 단계입니다.

- **(2026-11-11 리뷰 중 관찰)** 실제 AmpliTube 비교 검사(`installed_amplitube_offline_render_matches_realtime_path`)를 4번 돌려 3번은 상관 1.0000이었지만 1번은 같은 톤의 오프라인 렌더끼리도 상관 0.7755로 달랐습니다. 렌더 전 정착 확인이 플러그인의 비동기 로드를 가끔 놓칠 수 있다는 뜻이라, Freeze 결과가 드물게 다른 소리로 저장될 위험이 있습니다. 같은 날 리뷰 R11-1로 정착 판정을 7번 연속(1.5초)으로 강화했습니다. 이것으로 0.7755 사례가 사라졌는지는 실제 AmpliTube 반복 검사로 확인해야 합니다. 강화 후 13번(커밋 650b2b2 뒤 10번 추가) 모두 실시간 맞춤 615프레임·상관 1.0000·오프라인 반복 상관 1.0000이었습니다. 강화 전 실패율(4번 중 1번)이었다면 13번 연속 통과할 확률은 약 2.4%라 정착 강화가 효과가 있다고 봅니다. 다만 원인(플러그인 비동기 로드)을 직접 관찰한 것은 아니므로, 실제 Freeze 결과가 실시간과 다르게 들리면 MANUAL 24·25로 알려 주세요.

## 다음 단계와 재개 지점

- 4B: Freeze된 테이크를 처리된 소리 그대로 새 WAV로 내보내기(→ [04B](AMPLITUBE-05-PHASE-04B.md), 완료).
