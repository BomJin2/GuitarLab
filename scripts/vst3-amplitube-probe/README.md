# AmpliTube 5 VST3 처리 검사 (Phase 0 개발 전용)

설치된 AmpliTube 5 VST3를 이 앱이 쓸 방식(앱 안에서 직접 로드, mono 입력 → stereo 출력)으로 열어 합성 기타 DI를 오프라인 처리합니다. 제품 앱(`src-tauri`)의 `Cargo.toml`·`Cargo.lock`과 분리한 별도 Cargo 프로젝트입니다. 명세는 `docs/plugin/GuitarLab-AmpliTube5-Cakewalk-Style-VST3-Integration.md`, 결과는 `docs/progress/AMPLITUBE-05-PHASE-00.md`를 따릅니다.

```powershell
cargo build --release --manifest-path scripts/vst3-amplitube-probe/Cargo.toml
# 검색·로드·처리·상태 저장/복원 비교. 출력 폴더에 dry.wav·wet-*.wav·report.txt를 씁니다.
scripts/vst3-amplitube-probe/target/release/guitarlab-vst3-amplitube-probe.exe <출력 폴더>
# 로드·처리·해제 5회 반복과 잘못된 입력 오류 확인(메모리는 바깥에서 잽니다).
scripts/vst3-amplitube-probe/target/release/guitarlab-vst3-amplitube-probe.exe <출력 폴더> cycles
# Phase 3: 처리 스레드를 돌리며 에디터를 별도 창에 [초](기본 10)만큼 엽니다. 여는 시간·잠금 충돌을 출력합니다.
scripts/vst3-amplitube-probe/target/release/guitarlab-vst3-amplitube-probe.exe <출력 폴더> editor 14
```

- 실제 오디오 장치·사용자 데이터·AmpliTube 설정 파일은 쓰지 않습니다. 입력은 프로그램이 만든 합성 신호입니다.
- 진단용 환경 변수: `PROBE_SETTLE_MS`(처리 전 대기), `PROBE_RELOAD_FIRST=1`(처음 상태 다시 넣기), `PROBE_PRECREATE=1`(버릴 인스턴스 먼저 생성), `PROBE_QUERY_E=1`·`PROBE_EDITOR_E=1`(기준 인스턴스의 조회 조건 맞추기).
- 180초 안에 끝나지 않으면(예: 인증 창 대기) 이 검사 프로세스만 종료 코드 3으로 끝납니다.
