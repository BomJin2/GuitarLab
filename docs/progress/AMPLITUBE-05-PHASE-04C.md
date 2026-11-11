# AmpliTube VST3 Integration — Phase 04C(Bounce to New Track)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 4 "Bounce to New Track"(UC-5, 9.2, T11). 사용자 결정: 믹스 새 레이어 `RENDER`, 순서 4A → 4B → **4C**.

## 결론

- **PASS(자동)**: 저장소(BOUNCE 행은 Freeze와 따로 쌓이고 Unfreeze 뒤에도 보존, 프로젝트당 20개 한도·한도 초과 시 파일 남지 않음, Freeze id로는 읽지 않음), 믹스 렌더(RENDER 레이어가 원본 테이크 시작 시각에 Bounce 파일을 두고, 없는 id는 `BOUNCE_NOT_FOUND`, JSON 종류 이름 `RENDER`), 화면(Bounce 뒤 RENDER 레이어를 원본 다음에 넣고 원본 줄 음소거, 준비 때 원본 테이크 시간축으로 재생, 모니터가 켜져 있으면 Freeze 없는 Bounce는 막고 Freeze된 테이크는 허용).
- **PASS(앱, 사용자 데이터)**: "응가"의 테이크로 지금 톤 Bounce(2.0초) → "Bounce · 새 테이크" 줄 추가·원본 줄 음소거, Freeze 뒤 Bounce(1.7초)는 **Freeze 캐시와 SHA가 같음**(들리는 그대로 복사), RENDER 두 줄이 든 믹스 준비 성공. 같은 톤으로 다시 렌더해도 SHA가 같았습니다(결정적). 확인 뒤 믹스는 저장하지 않았고 테스트 행 4개·파일·빈 `renders/`를 지워 DB 18개 표가 DB 11 백업과 같음.
- **NOT RUN(사람 확인)**: Bounce 트랙이 실시간과 같은 톤으로 들리고 박자가 맞는지 → `MANUAL-CHECKS.md` 25번.

## 확인 중 발견

- 처음 앱 확인 스크립트가 Bounce 줄이 보이자마자(아직 작업 중이라 버튼이 꺼져 있을 때) Freeze를 눌러 Freeze가 되지 않았고, 그 뒤 Bounce가 복사가 아닌 새 렌더로 진행됐습니다. 앱 문제가 아니라 확인 순서 문제였고, 작업이 끝난 뒤 다시 해 복사 경로를 확인했습니다.
- 첫 렌더 결과는 그 뒤 렌더보다 1프레임 길고 SHA가 달랐습니다(tail 끝 판정이 1프레임 차이). 이후 같은 톤 렌더는 서로 같았습니다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md` | "Bounce to New Track v1" |
| `src-tauri/src/storage/take_renders.rs` | `take_bounces`·`renders_of`, `save_take_bounce`(20개 한도, 새 파일·새 행), `read_take_bounce`(크기·SHA) |
| `src-tauri/src/commands/render_api.rs`, `app.rs` | 렌더 공통 `render_take_now`, `bounce_take`(Freeze면 캐시·톤 복사), `list_take_bounces`, `read_take_bounce` |
| `src-tauri/src/mixer/model.rs`, `render.rs` | `LayerKind::Render`, 원본 테이크 시작 시각·배속 검사 |
| `src/features/performance/mixing.ts`, `freeze.ts`, `TakeMixPlayer.ts`, `useProjectMix.ts`, `mixLabels.ts`, `FxRack.tsx`, `BottomMixer.tsx`, `src/features/daw/useDawTracks.ts` | RENDER 종류, Bounce API·문구, `source` 테이크 시간축 재생, `bounceTake`(레이어 삽입·원본 음소거·8개 한도), 이름 "Bounce · 테이크", "새 트랙으로 Bounce" 버튼, DAW 파형 읽기 |
| 테스트 | Rust 저장소 보강·믹스 1, TS `useProjectMix`·`mixing` 각 1, `BottomMixer` 보강, fixture |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `cargo test --lib -- mixer storage::take_renders` | PASS 13개 |
| `pnpm verify:app` | PASS(프론트 864개, Rust 315개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| 앱(내장 화면 빌드) + CDP + DB 직접 읽기 | PASS(위 결론) |

## 원본 DI 데이터 무결성

- Bounce는 DI·Freeze 캐시를 읽기만 하고 `renders/`에 새 파일을 만듭니다. 원본 테이크 줄은 믹스에서 음소거만 하며(화면 상태, 저장은 사용자) 파일은 바꾸지 않습니다.

## 미완성·제약·리스크

- (작성 당시) Bounce 삭제 명령이 없었습니다. 2026-11-08 4D에서 Bounce 목록·확인 후 영구 삭제를 추가했습니다([04D](AMPLITUBE-05-PHASE-04D.md)).
- RENDER 레이어에는 FX 버튼이 없습니다(이미 처리된 소리, 이중 적용 방지). "AmpliTube로 재생"도 TAKE에만 있습니다.
- RENDER 레이어가 든 믹스 설정은 이전 앱이 거부합니다.
- 믹스 레이어 8개 한도면 Bounce 파일은 저장되지만 믹스에 넣지 못하고 안내합니다.

## 다음 단계와 재개 지점

- Phase 4 남은 것: LEAD/RHYTHM 독립 톤·오버더빙 청취 확인(사람), Phase 5(회귀·성능·배포 점검).
