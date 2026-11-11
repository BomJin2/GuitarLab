# AmpliTube VST3 Integration — Phase 04D(Bounce 목록·삭제)

- 작업 일자: 2026-11-08
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 4C에서 만든 Bounce를 다시 믹스에 넣거나 지울 수 있게 합니다(설계 `docs/plugin/PHASE-04-DESIGN.md` §7, 계약 `docs/12` "Bounce 삭제·관리 v1").
- 사용자 결정(2026-11-08): 저장된 믹스가 쓰는 Bounce는 **삭제 거부**, 삭제는 **같은 자리 확인 후 영구 삭제**.

## 결론

- **PASS(자동)**:
  - 저장소: 저장된 믹스의 `RENDER` 레이어가 가리키면 `BOUNCE_IN_USE`로 거부하고 파일을 남김. 믹스에서 빼고 저장하면 행·파일을 지움. 두 번째 삭제는 `removed=false`(멱등), 이후 읽기는 `BOUNCE_NOT_FOUND`. 믹스 확인과 행 삭제는 한 IMMEDIATE 트랜잭션, 파일은 커밋 뒤 삭제.
  - 화면: 믹스 패널의 "Bounce 목록"에서 이미 믹스에 있는 줄은 "믹스에 넣기"가 꺼짐, "삭제" → 확인 문구 → "영구 삭제"에서만 삭제 호출, "취소"로 되돌림. 삭제 성공 시 목록을 다시 읽고 저장 전 화면 믹스에 있던 줄도 뺌, 거부 시 안내만 보이고 믹스는 그대로.
  - `pnpm verify:app` 통과(프론트 876·Rust 317), `cargo clippy --locked --all-targets --all-features -- -D warnings` 통과, `pnpm format:check` 통과.
- **NOT RUN(앱)**: 실제 앱에서 목록·삭제를 눌러 보는 확인은 하지 않았습니다(사용자 DB에 테스트 Bounce를 만들고 지워야 함). → `MANUAL-CHECKS.md` 27번.

## 변경 파일

| 파일 | 변경 |
| --- | --- |
| `src-tauri/src/storage/take_renders.rs` | `delete_take_bounce`(사용 중 거부, 멱등) + 테스트 |
| `src-tauri/src/commands/render_api.rs`, `src-tauri/src/app.rs` | `delete_take_bounce` 명령 등록 |
| `src/features/performance/BounceList.tsx`(+test) | Bounce 목록, 믹스에 넣기, 확인 후 영구 삭제 |
| `src/features/performance/freeze.ts`(+test) | `deleteBounce` API, `BOUNCE_IN_USE` 안내 |
| `src/features/performance/useProjectMix.ts`(+test) | `addBounceToMix`, `deleteBounce` |
| `src/features/performance/MixPanel.tsx`(+test fixture) | 목록 배치 |
| `docs/12-API-CONTRACTS.md`, `docs/plugin/PHASE-04-DESIGN.md` | 계약·설계 결정 |

## 미확인·후속

- 원본 테이크를 지우면 그 테이크의 Bounce가 어떻게 되는지는 기존 테이크 삭제 흐름(프로젝트 휴지통·정리)을 따르며 이번에 바꾸지 않았습니다.
