# AmpliTube VST3 Integration — Phase 03E(화면 전환 중 유지 점검)

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 이번 Phase 목표: 명세 Phase 3 "Score ↔ DAW 전환 중 state/engine/stream 유지".
- 코드 변경 없음(점검만).

## 결론

- **PASS(앱)**: 실제 입력·모니터·AmpliTube를 켠 채 작업 공간(악보/편집 ↔ DAW/편곡)과 모든 탭(연습·연주·카피·내 녹음·결과·라이브러리)을 13번 오가도 아래 값이 **한 번도 바뀌지 않았습니다**.
  - 입력 stream 세대 3(다시 열리지 않음), 모니터 세션 1·RUNNING, 삽입 AMPLITUBE, Bypass 켜짐, 삽입 부족 0프레임, AmpliTube READY·사용 중·편집 창 열림.
  - 화면: 하단 믹서 "입력 FX" 적용 표시, 랙 Bypass 눌림, 입력 모니터 패널 "모니터에 적용 중"·"모니터 켜짐".
- 이유: 모니터·AmpliTube 상태는 Rust 서비스가 들고 있고, 화면 쪽 훅도 03D부터 App에서 한 번만 만들어 탭·보기 전환으로 사라지지 않습니다.

## 점검 방법(소리 없이)

- 모니터는 **음량 0**, 출력은 SSL의 가상 출력(Output 3/4 Virtual)으로 켰습니다. AmpliTube 로드 → 화면 새로 읽기 → 입력(Input 1) 시작 → 모니터(AMPLITUBE) → Bypass → 편집 창 순서. 끝난 뒤 편집 창 닫기·모니터·입력 끄기·AmpliTube 해제, 앱 정상 종료, DB 17개 표가 백업과 같음을 확인했습니다.

## 확인 중 발견

- **기본 입력 장치 "Input(SSL 2 MKII)"(2ch)**: 시작하면 480프레임(첫 버퍼 하나)만 받고 2초 동안 샘플이 오지 않아 `AUDIO_DEVICE_UNAVAILABLE`로 멈췄습니다. 같은 장치의 "Input 1"(mono)은 정상입니다. 입력 worker의 "2초 무입력" 판정이 원인이며, 장치(다른 프로그램 점유·Windows 형식/개인정보 설정) 문제인지 앱 문제인지는 아직 모릅니다 → `MANUAL-CHECKS.md` 23번.
- 하단 믹서는 작업 공간 탭에서만 그려지므로(`AppShell`의 `workspace && mixer`) 카피 등 다른 탭에 다녀오면 펼쳤던 FX 랙·믹서 펼침 상태는 처음으로 돌아갑니다(소리·엔진 상태와 무관, 기존 동작과 같음).
- 편집 창을 IPC로 직접 연 경우에는 화면 훅이 열렸다는 것을 모르고 버튼이 "열기"로 남습니다. 화면에서 연 경우는 같은 훅이 갱신돼 문제 없습니다(사용자 경로 아님).

## 다음 단계와 재개 지점

- Phase 3 완료(청취 확인은 MANUAL-CHECKS 17~22). Phase 4: Freeze/Bounce/Export(처리된 소리 파일 만들기, 저장 형식 결정 필요).
