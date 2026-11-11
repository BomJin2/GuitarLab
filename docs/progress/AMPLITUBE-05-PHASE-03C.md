# AmpliTube VST3 Integration — Phase 03C(누락·인증 안내)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 3 "누락 플러그인, 라이선스, 에디터 미지원에 대한 친절한 UI"와 9.3(실패 대응)·9.4(제휴 표기 금지).
- 사용자 선택(2026-11-07): Phase 3 남은 것 중 **누락·라이선스 안내** 먼저.

## 결론

- **PASS(자동·앱)**: 상태별 안내 함수 검사, 앱에서 READY·프로젝트 열림 상태의 안내 표시(인증 안내·저장한 톤 없음·상표/비제휴 고지, 중복 없음), 콘솔 오류 0.
- **NOT RUN**: 실제 미설치·미인증 상태. 이 PC는 AmpliTube가 설치·인증돼 있어 재현하지 않았습니다(제품을 지우거나 인증을 풀지 않음). 해당 안내는 단위 검사로만 확인했습니다.

## 설계

- VST3에는 플러그인 인증 상태를 묻는 표준 방법이 없습니다. 그래서 앱은 인증 여부를 표시하지 않고, READY를 "불러옴"으로만 설명합니다(명세 "사용 가능으로 거짓 표시 금지").
- 미인증 AmpliTube는 불러오는 중에 인증·등록 창을 띄울 수 있고, 그 동안 소유 스레드가 멈춰 앱에서 취소할 수 없습니다. 그래서 불러오기가 45초를 넘으면 그 창을 찾아 끝내라고 안내합니다(앱 기본 로드는 약 7~16초).
- 안내는 순수 함수 `pluginNotices(state, tone, loadingSeconds)` 하나로 모아 단위 검사합니다. API·저장 형식 변경은 없습니다.

| 상황 | 안내 |
|---|---|
| 없음·불러오기 실패·버스 미지원 | 기존 오류 문구 + "AmpliTube 없이도 모니터·녹음·재생은 원음(DI)으로 그대로 됩니다" |
| 불러오기 45초 초과 | 인증·등록 창이 다른 창 뒤·작업 표시줄에 있을 수 있음, 앱에서 취소 불가 |
| READY | 인증 여부는 앱이 알 수 없음, 소리 없음·주기적 끊김·인증 안내 보이면 IK Product Manager 확인 |
| 저장한 톤이 있는데 READY 아님 | 톤은 지우지 않고 보존, 불러온 뒤 적용 |
| 저장 버전 ≠ 지금 버전 | AmpliTube가 변환하거나 거부할 수 있음 |
| 톤 저장·불러오기 실패 | 저장해 둔 톤은 그대로 보존 |
| 항상 | AmpliTube·IK Multimedia는 각 소유자의 상표, GuitarLab은 제휴하지 않으며 설치·인증된 제품을 불러올 뿐 배포하지 않음(접힌 안내의 같은 뜻 문장은 중복이라 뺌) |

에디터 미지원은 기존 `PLUGIN_EDITOR_UNSUPPORTED` 문구를 그대로 씁니다. 명세의 generic parameter UI 대체는 AmpliTube가 에디터를 제공하므로 하지 않았습니다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `docs/12-API-CONTRACTS.md` | "AmpliTube 누락·인증 안내 v1" |
| `src/features/practice/monitorPlugin.ts` | `pluginNotices`, `pluginOwnershipNotice`, `SLOW_LOAD_SECONDS`, 상태 실패 문구 보강 |
| `src/features/practice/useMonitorPlugin.ts` | 불러오는 동안 경과 초(`loadingSeconds`) |
| `src/features/practice/InputMonitor.tsx` | 안내 목록·고지 표시, 접힌 안내의 중복 비제휴 문장 제거 |
| `src/features/practice/monitorPlugin.test.ts` | 상태별 안내 검사 1개 |

## 실제 실행한 빌드/테스트 명령

| 명령 | 결과 |
|---|---|
| `pnpm vitest run src/features/practice src/app` | PASS 138개 |
| `pnpm verify:app` | PASS(프론트 857개, Rust 307개) |
| 디버그 앱(내장 화면 빌드) + CDP | PASS: 위 READY·프로젝트 열림 안내, 버튼, 콘솔 오류 0. 앱은 메인 창 WM_CLOSE로 정상 종료 |

## 원본 DI 데이터 무결성

- 화면 문구만 바꿨습니다. 저장·녹음·재생 경로는 그대로입니다.

## 미완성·제약·리스크

- 미인증일 때 AmpliTube가 실제로 어떻게 동작하는지(창, 무음, 주기적 잡음)는 이 PC에서 확인하지 못했습니다. 안내 문구는 일반적인 경우를 기준으로 썼습니다.
- 불러오기 중 인증 창 때문에 멈추면 앱에서 취소할 수 없습니다(소유 스레드가 플러그인 안에서 기다림). 앱을 닫으려면 그 창을 먼저 끝내야 할 수 있습니다.

## 다음 단계와 재개 지점

- Phase 3 남은 것: FX 랙 UI(→ [03D](AMPLITUBE-05-PHASE-03D.md)), Score ↔ DAW 전환 중 엔진 유지 점검.
