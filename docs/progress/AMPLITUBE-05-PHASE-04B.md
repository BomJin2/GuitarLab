# AmpliTube VST3 Integration — Phase 04B(처리된 소리 내보내기)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 4 "Dry DI Export vs Processed Export 분리"(T12). 설계는 `docs/plugin/PHASE-04-DESIGN.md`, 순서는 사용자 결정 4A → **4B** → 4C.

## 결론

- **PASS(자동)**: 저장소 검사에서 Freeze 캐시를 앱 밖 새 파일로 바이트 그대로 내보내고, 같은 경로 다시 쓰기는 `EXPORT_DESTINATION_EXISTS`, 앱 데이터 폴더 안은 `INVALID_INPUT`. 화면 검사에서 Freeze된 줄에만 버튼이 있고 누르면 내보내기를 부름.
- **PASS(앱)**: 화면에서 Freeze → "처리된 소리 WAV로 내보내기" → 네이티브 저장 창에 작업 폴더 경로 입력 → 2,056,348바이트 파일이 **캐시와 바이트 단위로 같음**(IEEE float stereo, SHA 일치), 화면 안내 "새 WAV로 내보냈습니다(2.0MB…)". 확인 뒤 Unfreeze·레이어 제외·빈 `renders/`·내보낸 테스트 파일 정리, DB 18개 표는 DB 11 백업과 같음.
- 원본 DI 내보내기는 기존 "내 녹음" 화면의 `export_recording` 그대로입니다(분리 유지).

## 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md` | "처리된 소리 내보내기 v1" |
| `src-tauri/src/storage/take_renders.rs` | `export_take_freeze`(경로 검사 → 캐시 검사 읽기 → 새 파일 원자적 저장), `FreezeExport`, 검사 보강 |
| `src-tauri/src/commands/render_api.rs`, `app.rs` | `export_take_freeze`(PICKING, 녹음 중 거부, 저장 창) |
| `src/features/performance/freeze.ts` | `freezeApi.export`, 오류 문구(덮어쓰기·녹음 중·공간·앱 폴더) |
| `src/features/performance/useProjectMix.ts`, `FxRack.tsx`, `BottomMixer.tsx` | `exportFreeze`, Freeze된 줄의 "처리된 소리 WAV로 내보내기" |
| 테스트 | Rust 저장소 검사 보강, TS `BottomMixer`·`freeze`·`MixPanel` fixture |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --lib storage::take_renders` | PASS |
| `pnpm verify:app` | PASS(프론트 862개, Rust 314개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| 앱(내장 화면 빌드) + CDP + 저장 창 키 입력 | PASS(위 결론) |

## 원본 DI 데이터 무결성

- 내보내기는 캐시를 읽기만 하고 새 파일만 만듭니다. DI·캐시·DB는 바꾸지 않습니다.

## 미완성·제약·리스크

- Freeze된 테이크만 내보낼 수 있습니다(Freeze 없이 바로 처리해 내보내기는 4C Bounce 또는 Freeze 후 내보내기).
- 결과는 테이크 샘플레이트 stereo float32입니다(PCM16 등 형식 선택 없음). 믹스 전체 내보내기는 기존 48kHz mono이며 Freeze 레이어를 포함합니다(4A).

## 다음 단계와 재개 지점

- 4C: Bounce to New Track(→ [04C](AMPLITUBE-05-PHASE-04C.md), 완료).
