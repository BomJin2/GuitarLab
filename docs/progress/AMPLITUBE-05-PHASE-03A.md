# AmpliTube VST3 Integration — Phase 03A(에디터 창)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 3의 "Windows native plugin editor 별도 윈도우 가능 여부 검증/구현"(명세 4.5의 1차 목표: `Open Plugin Editor` → 별도 네이티브 창).
- 사용자 결정(2026-11-07): Phase 3를 **편집 창부터** 시작. 상태 저장(형식 결정 필요)·FX 랙은 다음 단계입니다.

## 결론

- **PASS(에이전트 확인)**: 실제 AmpliTube 5.10.4 에디터(1140×700)가 별도 창에 그려지고, 처리 스레드가 도는 동안 열고 닫을 수 있습니다. 앱에서 버튼으로 열기·X로 닫기 감지·다시 열기·해제 시 창 닫힘·편집 창이 열린 채 앱 닫기(0.5초 정상 종료, 앱 오류 이벤트 없음)를 확인했습니다.
- **NOT RUN(사람 확인)**: 노브를 돌렸을 때 모니터 소리가 바로 바뀌는지, 여는 동안 끊김 체감, 다른 배율 모니터로 옮기기 → `MANUAL-CHECKS.md` 19번. 소리가 예상 없이 나지 않도록 에이전트는 실제 모니터를 켜지 않았습니다.

## 설계

- `vst3-host`의 `Plugin` 하나가 에디터(controller)와 처리(processor)를 함께 갖고 둘 다 `&mut`가 필요합니다. 2A의 `RealtimePluginRunner`는 플러그인을 소유해 DSP 스레드로 옮기므로 모니터 중에는 에디터를 열 수 없었습니다. 그래서 `Arc<Mutex<Plugin>>`로 공유하도록 바꿨습니다(러너의 명령 링은 쓰지 않았음).
- DSP 스레드는 잠금을 `try_lock`으로만 잡고, 못 잡은 블록은 무음으로 내보냅니다. `lock()`으로 기다리면 그만큼 결과 링이 밀려 **지연이 영구히 늘기** 때문입니다. 장치 callback은 여전히 잠금을 쓰지 않습니다.
- 에디터 창은 플러그인을 만든 소유 스레드가 만들고(OLE 초기화), 열린 동안 약 60Hz로 창 메시지·DPI·크기 요청을 처리합니다. 마지막 `Arc`는 소유 스레드에서만 놓습니다(`strong_count == 1`일 때만 정리, COM 해제 스레드 규칙). DSP 스레드는 참조를 먼저 놓은 뒤 사용 중 표시를 풉니다.
- 화면은 편집 창이 열린 동안 1초마다 상태를 읽어 사용자가 X로 닫은 것을 반영합니다.

## 구현된 기능과 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md` | "AmpliTube 에디터 창 v1"(명령 2개·`editorOpen`·스레드·무음 규칙), 2A 처리 경로 문구 갱신 |
| `src-tauri/src/plugins/mod.rs` | 공유 플러그인, 소유 스레드 메시지 루프·에디터 열기/닫기·X 감지, `open_editor`/`close_editor`, 해제 시 창 먼저 닫기 |
| `src-tauri/src/plugins/dsp.rs` | 러너 대신 공유 플러그인, `try_lock` 실패 블록 무음, 끝날 때 참조 먼저 놓기 |
| `src-tauri/src/commands/plugin_api.rs`, `app.rs` | `open_monitor_plugin_editor`(blocking 스레드), `close_monitor_plugin_editor` |
| `src-tauri/Cargo.toml` | 기존 `windows-sys` 0.61.2에 `Win32_System_Ole`·`Win32_UI_WindowsAndMessaging` 기능(새 crate 없음, `Cargo.lock` 불변) |
| `docs/release/dependency-inventory.json`, `docs/release/README.md` | `Cargo.toml` 입력·Rust metadata 지문만 갱신(다시 수집한 구성요소 286개 동일) |
| `src/features/practice/monitorPlugin.ts`, `useMonitorPlugin.ts`, `InputMonitor.tsx` | `editorOpen` 검사, API 2개, 오류 문구, "AmpliTube 편집 창 열기/닫기" 버튼과 안내 |
| `scripts/vst3-amplitube-probe` | `editor [초]` 모드(처리 스레드와 에디터 동시 실행 측정) |
| 테스트 | Rust: 상태 검사에 에디터 거부·멱등 추가, 설치 플러그인 검사(ignored)에 처리 중 에디터 열기 추가. TS: 계약 검사·명령 1개 |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| 검사 crate `editor 14`(처리 스레드 2.6ms 간격 + 에디터) | PASS: 로드 7.2초, 열기 3.1초(그동안 잠금 충돌 1023블록 = 무음), 열린 뒤 14초 동안 충돌 10블록, 가장 느린 블록 3.6ms, 창 캡처에 실제 AmpliTube 화면·입력 미터 움직임 |
| `cargo test --lib plugins -- --include-ignored` | PASS 3개(설치 AmpliTube: 처리 중 에디터 열기, 2초 처리 부족 0프레임) |
| `pnpm verify:app` | PASS(프론트 855개, Rust 306개) |
| `cargo clippy --locked --all-targets --all-features -- -D warnings` | PASS |
| `package_validation.verify_inventory_dependencies`, `python -m unittest discover -s scripts -p "test_*.py"` | PASS(skip 1) |
| 디버그 앱(내장 화면 빌드) + CDP·Win32 | PASS: 로드 전 열기 `PLUGIN_NOT_READY`, 모르는 필드 거부, 열기 2.0초, 다시 열기 멱등, 창 캡처, WM_CLOSE(X) 후 `editorOpen:false`, 버튼 열기 1.8초·X 뒤 버튼 복귀·다시 열기, 해제 시 창 사라짐·메모리 약 290MB로 반환, 편집 창 연 채 앱 닫기 0.5초 정상 종료, 콘솔 오류 0 |

## 원본 DI 데이터 무결성

- 이번 변경은 녹음·테이크·프로젝트 파일을 읽거나 쓰지 않습니다. 녹음 PCM·판정 입력은 계속 입력 callback에서 따로 복사한 DI입니다.

## 미완성·제약·리스크

- 편집 창을 여는 약 2~3초 동안 플러그인 잠금이 잡혀 모니터·AmpliTube 재생 소리가 무음이 됩니다(지연은 늘지 않음). 열린 뒤에도 프리셋을 바꾸는 순간 등에 짧게 끊길 수 있습니다.
- 톤 설정은 저장하지 않습니다. 해제하거나 앱을 닫으면 기본 톤으로 돌아갑니다(상태 blob 저장은 형식 결정이 필요한 다음 단계).
- 편집 창은 메인 창에 붙지 않은 별도 최상위 창이라 메인 창 뒤로 갈 수 있고, 메인 창을 최소화해도 함께 최소화되지 않습니다.
- 에디터에서 생기는 파라미터 편집 로그·호스트 알림(`take_parameter_edits`·`take_host_notifications`)은 읽지 않습니다. 쌓이는 상한이 있어 메모리는 늘지 않지만, AmpliTube가 `setDirty` 같은 요청을 거절로 받을 수 있습니다(동작 영향은 확인 못 함).
- 플러그인은 앱 안에서 실행되므로 AmpliTube 에디터가 멈추면 소유 스레드(로드·해제·편집 창)가 멈출 수 있습니다. 메인 화면과 DSP 스레드는 그 잠금을 기다리지 않습니다(모니터 시작만 잠금을 기다림).

## 다음 단계와 재개 지점

- Phase 3 나머지: AmpliTube 상태 blob 저장·복원(→ [03B](AMPLITUBE-05-PHASE-03B.md), 프로젝트별), FX 랙 UI, 누락·라이선스 안내.
