# AmpliTube VST3 Integration — Phase 00

- 작업 일자: 2026-11-07
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**(커밋·푸시는 사용자 요청 시에만).
- 이번 Phase 목표: 저장소 조사, 명세와 저장소 대조, 설치된 AmpliTube 5 VST3의 실제 로드·오디오 처리 PoC.
- 명세: `docs/plugin/GuitarLab-AmpliTube5-Cakewalk-Style-VST3-Integration.md`(§0.5 "저장소 대조 결과와 조정"을 이번에 추가).

## 결론

- **PASS(오프라인 처리)**: Windows 11 x64에서 실제 AmpliTube 5(5.10.4) VST3를 앱 안(in-process)으로 로드해 mono DI → stereo 출력으로 처리했습니다. 출력은 원음과 상관 0.02, 음량 약 7배로 실제 앰프 처리가 일어났습니다. 원음 WAV 지문은 처리 전후 같았습니다.
- **미검증**: 다른 톤(프리셋)으로 바꿨을 때의 처리 변화와 그 상태의 복원. AmpliTube의 파라미터는 이름 없는 자동화 슬롯이라 호스트에서 톤을 바꿀 수 없고, 에디터(Phase 3)나 사용자가 만든 다른 상태가 필요합니다.
- **새 위험 2건**(설계 영향): 인스턴스 두 개가 동시에 있으면 소리가 바뀜(O-1), 인스턴스당 메모리 약 950MB(O-2). 아래 "미완성·제약·리스크"를 보세요.
- 다음 Phase로 바로 넘어가지 않고 사용자 결정 3건(D1~D3)을 요청합니다.

## 저장소 인벤토리(명세 §0.5 요약)

| 영역 | 실제 구조 | 명세와의 차이 |
|---|---|---|
| 입력·판정 | Rust CPAL 입력(`src-tauri/src/audio/input.rs`), 실시간 판정은 DI 입력 사용 | 같음. 바꾸지 않음 |
| 모니터 | CPAL 입력 → 링 버퍼(0.1초) → CPAL 출력(`audio/monitor.rs`), "🎧 모니터 켜기"는 REC와 별개 | Input Monitor와 Record Arm 분리는 이미 있음. FX 끼울 자리는 없음 |
| 녹음 | `recording/`이 `projects/<id>/recordings/<take>/dry.wav`(mono)로 저장 | 이미 DI만 녹음. 오디오 마이그레이션 불필요 |
| 재생 | WebView `HTMLAudioElement`(`player/PlayerEngine.ts`, `performance/TakeMixPlayer.ts`) | 명세는 Rust 재생 가정 → **D2 결정 필요** |
| 믹스·내보내기 | Rust 오프라인 렌더(`src-tauri/src/mixer/`) | Processed Export·Freeze·Bounce를 붙일 자리 |
| DB | 앱 루트 `guitarlab.sqlite`(DB10) 하나 | 명세의 프로젝트별 `project.db` 아님 → 새 테이블은 DB11 |
| DAW 화면 | 보기 전용 타임라인, 하단 믹서에 M·S·음량 | 트랙별 Record Arm·Input Echo·FX 랙 없음 |
| 오디오 드라이버 | WASAPI 공유 모드(CPAL 기본) | ASIO는 SDK 라이선스·libclang 필요 → **D1 결정 필요** |

환경: VST3 6개 설치(AmpliTube 5, TONEX, TH3, Melodyne, SampleTank 4, UADx PolyMAX), ASIO 드라이버 `SSL ASIO Driver 1~4`, libclang 없음, rustc 1.98.0.

## 구현된 것

- `scripts/vst3-amplitube-probe/`(새, 별도 Cargo 프로젝트, 제품 의존성 불변): `vst3-host =0.11.0`(MIT, `default-features = false`)로 검색·로드·버스 협상·처리·상태 저장/복원·반복 로드/해제를 검사합니다. 사용법은 그 폴더의 README.
- `docs/plugin/…Integration.md`: §0.5 저장소 대조 절 추가, §6 저장 구조를 실제 구조로 교체, Phase 2를 2A(입력 모니터 wet)·2B(재생 wet, D2 뒤)로 분리.
- `.gitignore`: `scripts/vst3-amplitube-probe/target/` 제외(기존 probe와 같은 방식).

## 실제 실행한 명령과 결과

| 명령 | 결과 |
|---|---|
| `cargo build --release --manifest-path scripts/vst3-amplitube-probe/Cargo.toml` | PASS(경고 0) |
| `guitarlab-vst3-amplitube-probe.exe <출력>` | PASS. 검색 6개(7~11초), AmpliTube 로드 5.9~7.0초 |
| 같은 명령 + 진단 변수(`PROBE_SETTLE_MS=5000`, `PROBE_RELOAD_FIRST=1`, `PROBE_PRECREATE=1`, `PROBE_QUERY_E=1`, `PROBE_EDITOR_E=1`) | O-1 원인 좁히기(아래) |
| `guitarlab-vst3-amplitube-probe.exe <출력> cycles` + PowerShell 1초 간격 메모리 측정 | PASS. 5회 로드·처리·해제, 오류 3종 정상 거부 |
| `cargo fmt --check`, `cargo clippy --release -- -D warnings`(probe) | PASS(clippy 지적 2건 수정 뒤, 수정 후 재실행 결과 동일) |
| `pnpm verify:app` | PASS(프론트 848개, Rust 298개). 이 Phase는 제품 코드를 바꾸지 않음 |

검사 항목별 결과:

| 항목 | 결과 |
|---|---|
| AmpliTube 식별(T01) | `AmpliTube 5` · IK Multimedia · 5.10.4 · `Fx|Distortion` · class `56535441746235616D706C6974756265` · 버스 in1/out1 · GUI 있음 |
| 버스 협상(T14 일부) | 기본 stereo in/out → mono in·stereo out 요청 수락(`0x80000`/`0x3`) |
| 지연·꼬리 | latency 7샘플, tail 0 |
| 처리 | 원음 RMS 0.0386 → 출력 0.285(양 채널), 원음과 상관 0.021, 처음 3블록만 무음 |
| Bypass 파라미터 | 켜면 출력 = 원음(상관 1.000) **왼쪽만, 오른쪽 무음** → 호스트 쪽 우회에서 mono를 양쪽에 복제해야 함 |
| 상태 저장 | 10,254바이트 blob |
| 상태 복원 | 새 인스턴스에 넣은 결과와 새 인스턴스 기본값의 옥타브 대역(63Hz~8kHz) 차이 최대 0.5dB. 단, 둘 다 기본 프리셋이라 "다른 톤의 복원"은 미검증 |
| 원본 DI 무결성 | `dry.wav` 지문 처리 전후 같음(`35366fb8ba51d6d1`) |
| 반복 로드/해제 | 1회 7.0~7.9초, 메모리 최대 약 950MB → 해제 뒤 24~39MB(5회 동안 증가 약 15MB) |
| 오류 처리 | 없는 경로 `Plugin not found`, 선언 안 된 class `not declared`, 형식 오류 `must be exactly 32 hexadecimal characters` |
| 인증 창 | 뜨지 않음(이 PC에서 인증된 상태로 보임) |

청취용 샘플(git 제외 폴더): `scripts/vst3-amplitube-probe/target/samples/` — `dry.wav`, `wet-single-instance.wav`, `wet-two-instances.wav`, `wet-bypass-mono.wav`, `report.txt`.

## 원본 DI 데이터 무결성

- 이 Phase는 사용자 프로젝트·녹음을 읽거나 쓰지 않았습니다. 입력은 합성 신호입니다.
- 합성 `dry.wav`의 지문은 모든 처리 뒤에도 같았습니다.

## Windows + SSL + AmpliTube 5 실기기 검증

- AmpliTube 5 VST3 오프라인 처리: **검증**(이 PC, Windows 11 x64).
- SSL 장치 입출력·실시간 모니터·지연: **미실행**(이 Phase 범위 밖, Phase 1~2).
- AmpliTube 에디터 창: **미실행**(Phase 3, `vst3-host` 문서상 Windows 에디터는 런타임 미검증).
- 귀로 듣는 확인: **미실행** → `MANUAL-CHECKS.md` 15번.

## 미완성·제약·리스크

- **O-1 인스턴스 공존 시 소리 변화**: 같은 프로세스에 AmpliTube 인스턴스가 하나만 있으면 출력 RMS 0.2857(5회 모두 같음)이고, 두 개가 동시에 있으면 두 인스턴스 모두 저역이 약 10~12dB, 중고역이 3~5dB 작아집니다(각각은 매번 똑같이 재현). 처리 전 대기, 상태 다시 넣기, 버릴 인스턴스 먼저 생성, 파라미터·에디터 조회 조건을 맞춰도 바뀌지 않았습니다. AmpliTube 내부 공유 자원 때문으로 보이나 원인은 미확인입니다. 트랙마다 인스턴스를 두는 UC-4(LEAD/RHYTHM)와 Freeze/렌더 일치(오프라인 렌더용 인스턴스를 따로 만들면 소리가 달라질 수 있음)에 영향이 있습니다. 어느 쪽이 정상 톤인지는 귀로 확인해야 합니다.
- **O-2 메모리**: 인스턴스당 약 950MB, 로드 7~8초. 트랙마다 인스턴스를 두면 메모리가 크게 늘고, 화면 전환마다 다시 만들면 안 됩니다(명세 §5.2와 일치).
- **O-3 실시간 안전성**: `vst3-host`의 `Plugin::process_audio`는 레벨 계산에 `Mutex`를 잠급니다(`plugin.rs` 2083행 근처). 실시간 콜백 규칙(`src-tauri/AGENTS.md`)에 어긋나므로 Phase 2에서는 크레이트의 `RealtimePluginRunner`(문서상 잠금 없음, 할당 감사는 미완)를 검토하거나 저수준 경로를 씁니다.
- **O-4 우회**: 플러그인 Bypass는 mono 입력을 왼쪽에만 내보냅니다. 우회는 호스트가 처리하고 mono를 양쪽으로 복제합니다.
- 톤 변경(프리셋)의 처리 변화·복원은 미검증입니다(파라미터가 이름 없는 슬롯).

## 사용자 결정이 필요한 것

- **D1 ASIO**: ASIO SDK를 GPLv3로 쓸지(배포 바이너리가 GPLv3 조건), Steinberg 독점 라이선스로 쓸지, 당분간 WASAPI만 쓸지. SDK 수신은 약관 동의가 필요해 에이전트가 하지 않습니다. libclang(LLVM) 설치도 필요합니다.
- **D2 재생 경로**: 테이크 재생에 AmpliTube를 실시간으로 걸려면 지금 WebView가 하는 테이크 재생을 Rust 출력 엔진으로 옮겨야 합니다. 옮길지, 아니면 톤을 바꿀 때마다 자동으로 처리본을 렌더링해 WebView가 재생할지(톤 변경이 즉시 반영되지 않음).
- **D3 인스턴스 수**: O-1·O-2 때문에 첫 구현을 "기타 입력 하나 + AmpliTube 인스턴스 하나(모니터와 재생 공유)"로 시작할지, 명세대로 트랙별 인스턴스를 바로 갈지.

## 다음 단계와 재개 지점

- Phase 1(RAW DI 분기·입력 모니터 기반): 저장소에는 DI 분기 녹음과 모니터·REC 분리가 이미 있습니다. 남은 일은 모니터 경로에 FX 자리를 만들고(우선 dry 통과), 지연을 측정해 표시하는 것입니다. D1에 따라 장치 계층이 달라집니다.
- Phase 2A: 제품 크레이트에 `vst3-host`를 넣는 순간 의존성 고지·배포 고지 재수집, `docs/10` 검토가 필요합니다.
- 재개: D1~D3 답을 받은 뒤 `docs/12`에 계약을 먼저 쓰고 Phase 1을 시작합니다.
