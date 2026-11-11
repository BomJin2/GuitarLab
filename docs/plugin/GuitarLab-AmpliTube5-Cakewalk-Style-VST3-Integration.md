# GuitarLab — AmpliTube 5 / Cakewalk 방식 VST3 연동 구현 명세

> **대상:** Claude Code 구현 에이전트  
> **기준일:** 2026-11-07  
> **상태:** 구현용 설계 문서(아직 실제 코드나 Windows 실기기 호환성 검증을 완료한 문서가 아님)  
> **우선 플랫폼:** Windows 11 x64 / SSL 2 MKII / AmpliTube 5 (64-bit VST3)  
> **현재 프로젝트의 기존 기술:** Tauri 2 + React/TypeScript + Rust 오디오 엔진(CPAL 가능) + Python AI + SQLite

---

## 0. Claude Code에 대한 최상위 지시

이 문서는 **기존 GuitarLab 프로젝트에 AmpliTube 5를 Cakewalk처럼 비파괴 방식으로 연동**하기 위한 작업 명세다.

1. 먼저 프로젝트 루트의 `AGENTS.md`, `README.md`, `docs/03-TECH-ARCHITECTURE.md`, `docs/05-REALTIME-JUDGEMENT.md`, `docs/07-DATABASE-AND-FILES.md`, `docs/08-IMPLEMENTATION-ROADMAP.md`, `docs/12-API-CONTRACTS.md`, `docs/17-RECORDING-AND-REPLAY.md` 및 **실제 구현된 오디오 관련 코드**를 확인한다. 파일 경로나 문서명이 다르면 저장소를 탐색하여 대응 자료를 찾고, 없는 문서를 새로 있다고 가정하지 않는다.
2. 기존 재생/녹음/기타 입력/판정/오버더빙/음원 분리 기능을 파괴하지 않는다. 신규 시스템은 점진적으로 통합한다.
3. **가장 먼저 Windows x64에서 실제 설치된 AmpliTube 5 VST3를 로드하고 오디오 처리하는 최소 PoC를 검증**한다. 호환성 증거 없이 전체 호스팅 구조를 구현 완료라고 표시하지 않는다.
4. 구현은 아래 Phase 0 → 5 순서로 진행한다. 검증이 끝나면 다음 Phase로 자동 진행하되, 중요한 기술·라이선스·데이터 손실 문제는 기록 후 중단한다.
5. 각 Phase별 구현/변경 파일/실행 명령/테스트 결과/미완료 항목을 `docs/progress/AMPLITUBE-05-PHASE-XX.md`로 작성하고 `docs/progress/README.md`를 갱신한다.
6. 기능별로 명세의 **필수(MUST)**, **후순위(SHOULD)**, **실험적(EXPERIMENTAL)** 범위를 지킨다. 제공 라이브러리의 문서에 없는 기능을 지어내지 않는다.
7. 실제 코드를 작성하고 가능한 테스트를 실행한다. Windows 장치나 플러그인이 현재 환경에 없으면 해당 부분은 **미검증**으로 남기고 시뮬레이션 통과를 실기기 검증으로 표현하지 않는다.

## 0.5 저장소 대조 결과와 조정 (2026-11-07 Claude 검토)

명세 목표(DI만 녹음, 모니터·재생은 AmpliTube 실시간, Freeze/Bounce만 처리 오디오 렌더, 판정은 DI)는 사용자와 합의한 Cakewalk 방식과 같다. 다만 아래는 실제 저장소와 달라 이 절을 우선한다.

1. **저장 구조**: 프로젝트별 `project.db`는 없다. 앱 데이터 루트의 `guitarlab.sqlite`(현재 DB10) 하나가 모든 프로젝트를 관리하고, 녹음은 이미 `projects/<project-id>/recordings/<take-id>/dry.wav`(mono, 원음)로 저장된다. 따라서 기존 테이크의 오디오 마이그레이션은 필요 없다. 새 테이블·컬럼은 DB 마이그레이션(DB11)과 백업/복원 허용목록(`docs/19`)·휴지통/영구 삭제(`docs/20`) 처리를 함께 설계한다. 플러그인 상태와 렌더는 `projects/<project-id>/plugin-state/`, `projects/<project-id>/renders/` 아래에 둔다.
2. **재생 경로**: 현재 음원·테이크 재생은 Rust가 아니라 **WebView의 `HTMLAudioElement`**(`src/features/player/PlayerEngine.ts`, `src/features/performance/TakeMixPlayer.ts`)가 곡 재생 시각에 맞춰 한다. Rust는 실시간 입력 모니터(CPAL 입력 → 링 버퍼 → CPAL 출력, `src-tauri/src/audio/monitor.rs`)와 오프라인 믹스 렌더(`src-tauri/src/mixer/`)만 한다. 그러므로 §3.2 "재생 스트림에 AmpliTube 실시간 적용"은 테이크 재생을 Rust 출력 엔진으로 옮기는 **설계 결정(D2)**이 필요하다. 결정 전에는 Phase 2를 2A(실시간 입력 모니터 wet)와 2B(테이크 재생 wet)로 나누어 2A만 진행한다.
3. **DAW 화면**: 현재 DAW 보기는 보기 전용 타임라인이고, 트랙별 M·S·음량은 하단 믹서(`MixDocument` 레이어)에 있다. 트랙별 Record Arm·Input Echo는 없고 녹음은 연주 화면의 REC 하나(단일 기타 입력)다. 첫 구현에서는 **기타 입력 줄(라이브 입력)이 모니터용 FX 랙**을, **각 테이크 레이어가 재생용 FX 랙**을 가진다. 트랙별 Record Arm은 기존 REC 흐름에 대응시키고, 새 트랙 모델은 별도 계약으로 정한다.
4. **ASIO(D1)**: `cpal`의 `asio` feature는 빌드에 Steinberg ASIO SDK와 LLVM(libclang)이 필요하다. ASIO SDK는 GPLv3 또는 Steinberg 독점 라이선스 중 선택이며, 이 결정과 SDK 수신(약관 동의)은 **사용자 결정**이다. 결정 전에는 기존 WASAPI(공유 모드) 경로를 쓰고 지연은 측정값으로만 표시한다.
5. **VST3 호스트 크레이트**: `vst3-host` 0.11.0은 MIT, `rust-version` 1.85이고 기본 기능이 `cpal-backend`·`process-isolation`이다. 기존 엔진과 중복 스트림을 만들지 않도록 `default-features = false`로 쓴다. 크레이트 문서대로 Windows는 CI 빌드만 되고 플러그인 실행·에디터는 미검증이다.
6. **의존성 추가 절차**: 제품 크레이트에 넣을 때는 정확한 버전 고정(`=x.y.z`), `docs/10` 라이선스 검토, `src/app/thirdPartyLicenses.json`(`scripts/third_party_notices.mjs`)과 `docs/release/dependency-inventory.json` 재수집을 함께 한다. Phase 0 PoC는 제품 `Cargo.toml`/`Cargo.lock`을 바꾸지 않도록 **별도 Cargo 프로젝트**(`scripts/vst3-amplitube-probe/`, 기존 `scripts/native-basic-pitch-probe/`와 같은 방식)로 만든다.
7. **진행 규칙**: 계약(`docs/12`)을 코드보다 먼저 갱신한다. Phase마다 `pnpm verify:app`을 실행한다. 커밋·푸시는 사용자가 요청할 때만 한다(§13의 Git commit 항목은 "미커밋"으로 기록). 귀로 들어야 하는 확인은 `docs/progress/MANUAL-CHECKS.md`에 모은다.
8. **기존 판정 경로**: 실시간 판정은 이미 Rust 입력(DI)에서 하고, 녹음 뒤 음정 분석도 `dry.wav`를 쓴다. 이 경로는 바꾸지 않는다.
9. **사용자 결정(2026-11-07)**: D1 우선 WASAPI(ASIO는 측정 지연이 부족할 때 다시 결정), D2 테이크 재생을 Rust 출력 엔진으로 옮김, D3 AmpliTube 인스턴스 하나로 시작(Phase 0에서 인스턴스 둘이 공존하면 소리가 바뀌고 인스턴스당 약 950MB를 확인). 트랙별 인스턴스(UC-4)는 공존 현상을 확인한 뒤로 미룬다.

## 1. 확인된 사실 및 채택할 동작

### 1.1 Cakewalk의 기본 방식 — 정확함

- `Input Echo`로 입력 모니터링을 활성화하면 **입력 소리가 트랙 FX를 거쳐 출력**된다.
- 일반 오디오 트랙에서 **FX 랙의 이펙트는 비파괴 처리**이며, 녹음 파일에는 기본적으로 입력 DI가 저장된다. 단, **외부 하드웨어·입력 소스 자체에 이미 걸린 이펙트**는 녹음 전에 적용된 신호이므로 예외다.
- 재생 시 원본 오디오가 FX 랙을 다시 거친다. 플러그인 설정을 변경하면 원본 WAV를 수정하지 않고 톤이 바뀐다.
- `Freeze Track`은 원본은 복구 가능하게 보존하면서 FX 처리된 결과를 임시 오디오로 렌더링하고 FX를 비활성화해 CPU 부하를 줄인다. `Unfreeze`로 원본 + FX 체인으로 복귀한다.
- `Bounce to Track(s)`는 FX를 포함해 렌더링한 결과를 **새 오디오 트랙**으로 생성한다.
- 사용자가 **처리된 신호를 녹음 파일로 직접 기록**하려면 별도의 입력/버스/라우팅 구성이 필요하다. GuitarLab의 기본 기능에는 포함하지 않는다.

### 1.2 AmpliTube 5 요구사항

- Windows의 AmpliTube 5는 **64비트 VST3** 플러그인을 제공한다. 독립 실행형(Standalone) 프로그램 실행만으로 GuitarLab의 플러그인 처리가 자동 연결되는 것은 아니다.
- 사용자가 **직접 설치·활성화한 AmpliTube 5**의 VST3 플러그인을 GuitarLab 안에서 호스팅한다. GuitarLab 설치 패키지에 IK Multimedia의 플러그인 DLL/콘텐츠/프리셋을 임의로 포함하거나 무단 재배포하지 않는다.
- AmpliTube의 자체 프리셋 파일(`.at5p`)과 **VST3 호스트가 저장하는 플러그인 상태 바이너리(blob)**는 구분한다. 프로젝트 복원은 원칙적으로 VST3 상태 저장/복원 API를 사용한다.
- 정상적인 오디오 출력·플러그인 UI·프리셋 복원이 **Windows 11 + 실제 AmpliTube 5 버전에서 통과**해야 지원 완료로 분류한다.

### 1.3 절대 보장하면 안 되는 것

- '오디오 파일을 두 개 저장해야 AmpliTube를 쓸 수 있다' → **아님**. DI 하나만 녹음한다.
- '플러그인 없이도 녹음한 톤이 그대로 재생된다' → **일반 재생에서는 아님**. Freeze/Bounce 등 처리된 렌더 파일이 있으면 그 파일은 재생 가능하다.
- 'Rust VST3 호스팅 라이브러리를 추가하면 Windows AmpliTube 5 에디터까지 무조건 동작한다' → **미검증**.
- 'ASIO만 설치하면 모든 환경에서 5ms 이내 지연이 보장된다' → **아님**. 측정값으로만 판단한다.
- '입력에 AmpliTube를 걸면 연주 판정 입력도 왜곡된 톤을 사용해야 한다' → **아님**. 판정 파이프라인은 별도의 DI 기준 신호를 유지한다.

## 2. 사용자 시나리오와 수용 기준

### UC-1. 기타 연주(모니터링)

1. `Settings > Audio`에서 **SSL 2 MKII / ASIO / Input 1 (mono)**와 같은 장치·채널을 선택한다.
2. 트랙의 `FX` 랙에서 `Add Plugin > AmpliTube 5`를 선택한다.
3. `Input Monitor (스피커 아이콘)`를 켜고 기타를 연주한다.
4. **앱 출력에서는 AmpliTube 톤을 실시간으로 들을 수 있어야 한다.**
5. 하드웨어 직접 모니터링(SSL 본체의 입력 직접 청취)이 동시에 켜져 있으면 원음과 처리음이 겹칠 수 있으므로 UI에서 경고한다.

### UC-2. DI 녹음

1. 트랙 `R (Record Arm)` 활성화 후 녹음한다.
2. 녹음 중에는 AmpliTube 효과가 적용된 소리를 듣는다.
3. 저장된 WAV를 바이트/파형 또는 신호 분석으로 확인하면 **FX를 통과하지 않은 원본 DI**여야 한다.
4. 프리셋을 바꿔도 원본 WAV는 **해시와 길이가 불변**이어야 한다.
5. Input Monitor를 꺼도 녹음 자체가 중단되면 안 된다.

### UC-3. 테이크 재생·톤 변경

1. 녹음한 DI WAV를 재생한다.
2. 현재 트랙의 FX 랙에 설정된 AmpliTube가 **재생 스트림에 실시간 적용**된다.
3. 프리셋이나 이펙트 설정을 바꾸면 다음 재생 블록부터 반영된다. 원본 WAV는 변경되지 않는다.
4. 프로젝트 저장/재오픈 후 플러그인 상태가 가능한 한 정확하게 복원된다.
5. 플러그인이 삭제되거나 비활성화된 경우, **원본 DI는 반드시 재생 가능**해야 한다. 사용자에게 FX 누락 상태를 표시한다.

### UC-4. Overdub

1. 기존 LEAD DI 테이크와 RHYTHM DI 테이크를 독립 파일로 보존한다.
2. 각 트랙은 **서로 다른 AmpliTube 5 인스턴스/상태**를 가질 수 있다.
3. LEAD 톤이 적용된 기존 재생을 들으며 RHYTHM 연주를 모니터링 및 DI 녹음할 수 있다.
4. 백킹/기존 테이크/유튜브/시스템 출력이 녹음용 DI WAV에 섞이지 않는다.
5. 녹음·재생 지연은 별도로 보정하고 오버더빙 타이밍을 유지한다.

### UC-5. Freeze / Unfreeze / Bounce

- `Freeze`: 원본 DI·FX 상태 보존 → 처리된 결과를 **별도 캐시 WAV**로 렌더 → 해당 트랙은 캐시를 재생하며 실시간 FX 처리를 우회한다.
- `Unfreeze`: 캐시를 사용하지 않고 **원본 DI + 활성 FX**로 돌아간다. 캐시는 필요 시 재사용하거나 정리할 수 있다.
- `Bounce to New Track`: 처리된 결과를 **별도 렌더 WAV + 새 트랙**에 기록한다. 원본 트랙은 그대로 둔다.
- FX 순서/파라미터/원본·영역/샘플레이트가 변경되면 해당 Freeze 캐시는 유효하지 않은 것으로 표시한다.
- 내보내기: 'Dry DI' 또는 'Processed Mix'를 명시적으로 선택하며, 후자에는 FX를 실제로 적용한다. 라이브 플러그인을 쓸 수 없다면 성공한 내보내기처럼 표시하지 않는다.

## 3. 요구 신호 흐름 (가장 중요)

### 3.1 연주 + 녹음

```text
             SSL 2 MKII / INST Input 1 (mono DI)
                           │
             [Audio Driver: ASIO 우선 / WASAPI fallback]
                           │
                   [Capture / Timestamp]
                           │
                [논리적 신호 분기]
                  ┌────────┴───────────────┐
                  │                        │
             RAW DI BRANCH            MONITOR BRANCH
                  │                        │
             [Recorder Queue]         [Input Monitor ON?]
                  │                        │
             [WAV Writer]              [Track pre-FX]
                  │                        │
            take_###_di.wav            [AmpliTube 5 VST3]
                  │                        │
             (원본 보존)               [Track fader/pan]
                                           │
                                    [Master / Limiter]
                                           │
                                    [SSL Output 1/2]

        └─ RAW DI → [Pitch/Timing Analysis Queue] → 기타 판정
           (FX 후 왜곡된 신호를 기본 판정 입력으로 사용하지 않음)
```

주의: 논리적으로 분리된 RAW DI가 최우선이며, 파일 쓰기·UI 이벤트·AI 모델 호출을 실시간 오디오 콜백에 직접 넣지 않는다. `Track pre-FX`의 단순 gain/trim을 RAW DI 저장보다 먼저 적용하지 않는다(사용자가 명시한 비파괴 클립 게인은 메타데이터로 저장).

### 3.2 녹음 파일 재생

```text
take_###_di.wav → [Clip Reader / Timeline Alignment]
                → [Track Pre-FX / Clip Gain]
                → [AmpliTube 5 instance]  ─────┐
                                                ├→ Mixer → Master → SSL Output
other DI/stem tracks → respective FX chains ──┘
```

### 3.3 Freeze / Bounce

```text
raw DI clip(s) + FX state + timeline region
             │
     [Offline/Realtime Render Engine]
             │
   processed-track-<id>.wav
             ├── Freeze: 임시 렌더 캐시, 원본 보존
             └── Bounce: 별도 트랙 및 새 미디어로 영구 추가
```

## 4. 구현 아키텍처

### 4.1 계층 / 스레드

| 계층 | 소유 책임 | 필수 제약 |
|---|---|---|
| React/Tauri UI | 트랙 FX 랙, Plugin Browser, 상태 표시, Record Arm, Input Monitor, Freeze/Bounce | UI 스레드에서 DSP 금지 |
| Tauri Rust Commands | 오디오 설정·플러그인 관리 요청/응답, 오류 변환 | 장시간 동기 작업은 별도 작업 스레드 |
| Audio Engine | 마스터 타임라인, 입력·출력 버퍼, 클립 재생, 믹싱 | RT-safe callback, 단일 타임베이스 |
| Input Splitter | DI 포착, 녹음 큐와 모니터 큐에 분기 | DI가 FX를 절대 통과하지 않음 |
| Recorder | WAV 저장, take metadata, 오류 처리 | 오디오 콜백 내 디스크 I/O 금지 |
| VST3 Host | 검색, 생성, 버스 협상, process, 파라미터, 상태 저장, 에디터 | 플러그인 스레드·호환성 요구사항 준수 |
| FX Chain | 트랙별 슬롯 순서, bypass, wet/dry(지원 시), plugin state | 실시간/재생/렌더 동일 처리 체인 |
| Render Worker | Freeze/Bounce/Export | 원본 불변, 종료·취소·복구 가능 |
| DB/Project | 파일 레퍼런스, FX 체인, 상태 blob, 캐시 메타데이터 | 기존 테이크 데이터 마이그레이션 |
| Python AI | 음원 분석/스템 분리 등 기존 역할 | 저지연 VST3 DSP에 사용하지 않음 |

### 4.2 오디오 시스템 결정

- Windows x64, 실제 SSL ASIO 드라이버를 최우선 타깃으로 한다. 같은 출력 장치에 대해 WASAPI로 fallback할 수 있으나 **지연·동기화 기능은 동일하다고 가정하지 않는다**.
- 기존 프로젝트의 CPAL 캡처/플레이백 흐름을 분석하고, `cpal`의 `asio` feature가 적절한지 검증한다. 설치된 ASIO 드라이버, SDK/라이선스 및 빌드 환경(LLVM/Clang, Windows C++ toolchain)을 점검한다.
- 여러 오디오 스트림을 독립적으로 여는 구조보다 **입력·출력의 동일 장치/타임베이스 및 단일 그래프 관리**를 우선한다. CPU/장치 제한 때문에 단일 콜백으로 결합할 수 없으면 버퍼와 타임스탬프 기반 동기화를 설계·측정한다.
- 표준 샘플레이트 테스트는 **48 kHz**. 블록 크기는 64/128/256/512 샘플 등의 **지원 여부 및 부하 측정 결과**로 선택한다. 디바이스 또는 플러그인 제약 때문에 sample format/채널 수/블록 크기 변환이 필요할 수 있다.
- 입력 채널 1은 **mono**이고 AmpliTube가 stereo output을 낼 수 있으므로 mono→stereo 버스 협상을 수행한다. 고정 stereo 입력을 가정하여 왼쪽 신호만 나오는 오류를 만들지 않는다.
- 입출력 장치의 reported latency, 플러그인의 reported processing latency 및 실제 loopback round-trip latency를 분리 측정한다. **실제 판정 UI에 샘플 수/밀리초 단위를 표시**한다.
- 사용자가 SSL 2 MKII의 하드웨어 `INST` 입력(기타용 Hi-Z)을 올바르게 선택하도록 안내한다. 앱에서 장치의 물리적 스위치를 임의로 제어할 수 있다고 가정하지 않는다.

### 4.3 VST3 호스트 후보 및 적용 제한

1. **우선 후보:** Rust 크레이트 [`vst3-host`](https://docs.rs/crate/vst3-host/latest). 플러그인 검색·오디오 처리·파라미터·상태 저장을 지원한다고 문서화되어 있음. 2026-11-07 기준 0.11.x 릴리스가 확인되지만, **최신 버전의 API/실제 Windows 호환성을 설치 시 다시 검증**해야 한다.
2. 해당 라이브러리 문서에는 **Windows/Linux가 빌드 CI는 통과해도 실제 플러그인 및 에디터의 대화형 런타임 테스트는 제한적**이라고 명시되어 있음. `play_realtime`이 존재하더라도 전체 오디오 경로가 실시간 안전성 감사를 완료한 것은 아님.
3. 사용자 앱의 기존 오디오 엔진 위에 크레이트를 **보조 VST3 DSP 호스트로 결합**한다. `simple::play()`를 무비판적으로 호출하여 별도 CPAL 스트림을 중복 생성하지 않는다. 플러그인의 `process_audio` 경로/스레드 특성을 검토하고 기존 엔진의 버퍼 공급·출력을 재사용한다.
4. PoC 검증에 실패하면: `vst3` 저수준 바인딩 + Steinberg 공식 VST3 SDK 기반 작은 C++/Rust FFI 호스트 등 대안을 **설계 변경 제안으로 문서화**한다. 곧바로 전체 엔진을 교체하지 않는다.
5. `VST3 SDK 3.8+`의 MIT 라이선스는 사용 가능하지만 **ASIO SDK와 서드파티 코드/IK 플러그인은 각각 별도 라이선스**로 확인한다.
6. 플러그인은 고유 식별자(class ID), vendor, name, version, bundle path로 관리한다. 파일명만 보고 플러그인의 정체성이나 호환성을 단정하지 않는다.

### 4.4 VST3 호스팅의 실제 필수 작업

- VST3 검색 경로 스캔(대표적으로 `%ProgramFiles%\\Common Files\\VST3`), 사용자가 지정한 경로도 지원.
- 검색 결과로부터 올바른 effect processor class 선택, load/initialize/activate/process/deactivate/terminate.
- 오디오 입출력 bus 및 mono/stereo channel arrangement 협상.
- 샘플레이트, 블록 크기, float32/float64 지원을 검증하고 불일치 시 명확히 실패/변환.
- 플러그인의 processing latency 및 tail 처리.
- transport context: song position, tempo, time signature, play/record state를 플러그인에 전달할 수 있으면 전달.
- editor ↔ processor 파라미터 변경과 `restartComponent`/상태 재설정 이벤트 처리.
- 상태 보존: component state와 controller state를 모두 지원해야 할 수 있음. 단순 UI 컨트롤 값 목록만 저장하지 않는다.
- 오류/플러그인 crash/hang 시 안전 종료 및 원본 DI 보존. Plugin isolation은 **가능한 경우 별도 단계**이며 in-process host 자체를 격리된 것처럼 표현하지 않는다.

### 4.5 AmpliTube GUI (중요, 별도 테스트)

- AmpliTube 5의 실제 앰프/캐비닛 UI를 GuitarLab에서 띄우려면 VST3의 **네이티브 플러그인 에디터 뷰** 호스팅이 필요하다.
- Windows에서는 보통 네이티브 윈도우 핸들(`HWND`)의 parent/child 관계·event loop·DPI·resize·focus 처리가 얽힌다. **Tauri WebView HTML 안에 플러그인 UI가 자동으로 들어간다고 가정하지 않는다.**
- 1차 목표는 `Open Plugin Editor` 버튼 → 지원되는 경우 **별도 네이티브 플러그인 창**으로 열기다. React 패널 안에 직접 임베드하는 기능은 후순위다.
- SDK/크레이트가 Windows 에디터를 제공하지 않거나 검증에 실패하면 기본 generic parameter UI로 fallback하거나 '에디터 미지원'을 명시한다. **실제 AmpliTube GUI 작동을 검증하지 않고 완료 처리하지 않는다.**
- Tauri 메인 윈도우의 닫기·최소화·포커스 이동·다중 모니터·디스플레이 배율 변화 시 크래시가 없어야 한다.

## 5. UI 요구사항

### 5.1 GuitarLab DAW 모드

- 각 트랙 헤더: `M`(Mute), `S`(Solo), `R`(Record Arm), `Monitor`(Input Echo), `FX` 버튼.
- FX 랙 패널: 슬롯 순서(최초 `01 AmpliTube 5`), `+ Add VST3`, `Bypass`, `Open Editor`, `Remove`, `Plugin Missing`, `State Restore Failed`.
- 선택한 트랙과 관련 없는 트랙의 FX 상태가 변경되지 않도록 분리.
- `Input Monitoring ON`과 `Record Arm ON`은 **서로 독립된 상태**.
- `Freeze`가 켜져 있으면 스노플레이크 등 작은 상태 아이콘과 `Unfreeze` 메뉴 제공. Freeze 중 원본 FX 편집은 금지하거나 자동 Unfreeze를 명확하게 요청.
- `Bounce to New Track`, `Export Processed`, `Export Dry DI` 메뉴 제공.
- 플러그인이 없는 사용자는 `FX Missing — Dry playback available`를 표시하고 오디오 재생 자체는 유지.

### 5.2 SCORE / 연습·퍼포먼스 모드

- 모드 전환 시 **현재 프로젝트·선택 트랙·이펙트 인스턴스·재생 위치·녹음 중인 DI 테이크**를 유지한다.
- 실시간 연주 평가 알고리즘은 DI 분석 브랜치를 사용하되, 프리셋 톤과 관찰 가능한 판정 사이의 지연을 정렬한다.
- DAW에서 설정한 AmpliTube 톤을 SCORE 모드에서도 같은 트랙의 모니터링에 사용한다. **모드 변경마다 플러그인을 해제/재생성하지 않는다.**

### 5.3 Audio Settings

- Driver: ASIO / WASAPI(지원되는 경우)
- Input device, Output device, Input channel(모노 1·2), Sample rate, Buffer size
- 현재 round-trip latency(측정값), FX processing latency, input/output meter
- Direct monitoring 중복 사용 경고; ASIO 드라이버/플러그인 부재 안내
- 옵션 저장 시 오디오 엔진 재시작 여부·중단되는 녹음에 대한 안전한 처리

## 6. 상태 모델 및 파일 저장 구조

다음은 **개념 모델**이다. 기존 SQLite 스키마와 대조하여 마이그레이션을 설계하고 컬럼/테이블명을 기존 코드에 맞춘다.

```typescript
// 신규 기능의 논리 모델: 파일 위치와 타입은 실제 저장소에 맞춰 조정
export type TrackId = string;
export type PluginInstanceId = string;

export interface TrackAudioState {
  trackId: TrackId;
  inputDeviceId: string | null;
  inputChannel: number | null;
  recordArmed: boolean;
  inputMonitoring: boolean;
  mute: boolean;
  solo: boolean;
  gainDb: number;
  pan: number;
  fxChain: PluginSlot[];
  freeze: FreezeState | null;
}

export interface PluginSlot {
  instanceId: PluginInstanceId;
  pluginFormat: 'vst3';
  vendor: string;
  classId: string; // 파일명과 별개인 플러그인 클래스 식별자
  displayName: string;
  installedPathHint?: string; // 경로는 힌트, 절대 유일 키가 아님
  enabled: boolean;
  stateBlobRef: string | null; // 바이너리 파일 또는 BLOB 참조
  stateVersion?: number;
  status: 'loaded' | 'missing' | 'failed' | 'bypassed';
}

export interface RecordedTake {
  id: string;
  trackId: TrackId;
  mediaPath: string; // 반드시 RAW DI 경로
  channels: number; // 기타 DI는 기본 1
  sampleRate: number;
  startSample: string; // 64-bit frame/sample index를 문자열/정수로 정확히 관리
  durationSamples: string;
  originalHash?: string;
  // 효과를 입힌 별도 녹음 파일은 기본 요구사항이 아님
}

export interface FreezeState {
  trackId: TrackId;
  cacheMediaPath: string;
  originalMediaRefs: string[];
  fxStateFingerprint: string;
  renderSampleRate: number;
  renderedFrames: string;
  valid: boolean;
}
```

저장 예시:

```text
<앱 데이터>/                    # 실제 저장소 구조(§0.5-1)
├─ guitarlab.sqlite             # 모든 프로젝트의 DB(현재 DB10, 새 테이블은 마이그레이션)
└─ projects/<project-id>/
   ├─ recordings/<take-id>/
   │  └─ dry.wav                # 기존 원본 DI(mono), 절대 덮어쓰지 않음
   ├─ renders/                  # 새로 추가
   │  ├─ frozen-<hash>.wav      # Freeze 캐시
   │  └─ bounce-<uuid>.wav      # Bounce 영구 결과
   └─ plugin-state/             # 새로 추가
      └─ <instance-id>.bin      # VST3 상태 바이너리
```

- 프로젝트 저장 시 `stateBlobRef`와 관련 파일을 **원자적/복구 가능한 방식**으로 저장하고, blob 실패가 원본 녹음 삭제로 이어지지 않게 한다.
- 플러그인 누락 시에도 불러온 track/take의 참조 및 blob을 **그대로 보존**하여 추후 복원 가능해야 한다.
- 플러그인 경로·버전 변경 시 검색된 클래스 식별자를 이용해 재연결하며, 기존 상태 호환 실패는 명시적으로 보고한다.
- `Freeze` 캐시는 필요 시 삭제 가능하지만 `Bounce` 트랙 미디어와 RAW DI는 명시적 사용자 삭제가 없는 한 보존.

## 7. Rust 모듈 경계 (제안, 기존 코드에 맞춰 조정)

```text
src-tauri/src/
├─ audio/
│  ├─ engine.rs              # 기존 엔진 확장, 단일 타임베이스
│  ├─ device.rs              # ASIO/WASAPI selection, I/O configuration
│  ├─ routing.rs             # RAW DI splitter, monitoring, graph
│  ├─ latency.rs             # device + FX + alignment/measurement
│  ├─ recorder.rs            # DI writer queue + worker
│  ├─ playback.rs            # timeline/clip render path
│  └─ render.rs              # freeze/bounce/export, worker task
├─ plugins/
│  ├─ mod.rs
│  ├─ discovery.rs           # VST3 scan / class id
│  ├─ host.rs                # VST3 lifetime and DSP
│  ├─ chain.rs               # per-track FX chain
│  ├─ state.rs               # VST3 component/controller state
│  └─ editor.rs              # Windows native plugin editor (separate milestone)
└─ commands/
   ├─ audio_commands.rs
   └─ plugin_commands.rs
```

참고: 신규 디렉터리를 강제로 똑같이 만들지 않는다. 기존 서비스 경계/명명 규칙과 합치되 기능이 단일 파일에 몰리지 않도록 한다.

### 7.1 명시적 인터페이스(구현에 맞게 조정)

```rust
// 구현 가능한 정확한 crate/API를 확인한 뒤 채택할 개념 트레이트
pub trait TrackFxProcessor {
    fn prepare(&mut self, sample_rate: f64, max_block_frames: usize) -> Result<(), FxError>;
    fn process(&mut self, io: &mut AudioProcessBlock<'_>) -> Result<(), FxError>;
    fn latency_samples(&self) -> u32;
    fn reset(&mut self) -> Result<(), FxError>;
    fn save_state(&mut self) -> Result<Vec<u8>, FxError>;
    fn load_state(&mut self, bytes: &[u8]) -> Result<(), FxError>;
}

// 실제 Callback 내부에서는 FS I/O / lock / alloc / plugin scan / React IPC 금지.
// 트레이트 정의와 호출 방법은 안전성과 라이브러리 제약을 검토해 조정.
```

### 7.2 Tauri 명령 API(개념)

```text
audio_list_devices()
audio_set_configuration(driver, input_device, output_device, input_channel, sample_rate, buffer_size)
plugin_scan_vst3_paths()
plugin_list_available()
track_fx_add(track_id, plugin_class_id)
track_fx_remove(track_id, plugin_instance_id)
track_fx_set_bypass(track_id, plugin_instance_id, bypass)
track_fx_open_editor(track_id, plugin_instance_id)
track_fx_save_state(track_id, plugin_instance_id)
track_set_input_monitoring(track_id, enabled)
track_set_record_arm(track_id, enabled)
track_freeze(track_id)
track_unfreeze(track_id)
track_bounce_to_new_track(track_id, render_options)
export_project_mix(options)
```

명령은 명확한 오류 enum, 취소 지원(렌더 등), 상태 이벤트 및 오디오 콜백의 thread-safety를 포함한다.

## 8. 녹음·버퍼·지연 구현 요구

1. **RAW DI는 캡처 직후 복사 또는 nonblocking 큐로 전달.** 플러그인이 처리 결과를 같은 입력 버퍼에 쓰더라도 RAW DI 저장 데이터는 영향을 받지 않도록 별도 버퍼를 보장한다.
2. 오디오 콜백에서는 bounded lock-free ring buffer 또는 이에 준하는 RT-safe 교환 구조를 사용한다. 큐 overflow/underrun 시 **침묵·샘플 손실을 조용히 숨기지 말고** 카운터와 파일 상태를 기록한다.
3. WAV 파일 쓰기는 별도 worker에서 수행한다. abrupt device disconnect/저장 공간 부족 시 저장된 take의 무결성과 오류 메시지를 확보한다.
4. input device channel 1에만 기타가 연결된 상태에서 mono DI 파일로 녹음되는지 검증한다. 내부 플러그인 처리가 stereo여도 DI 녹음은 stereo로 불필요하게 늘리지 않는다.
5. 모니터링 대상은 **현재 live input**이고, 재생 대상은 timeline clip이다. 같은 소리가 두 경로에서 중복 합산되지 않도록 track input monitoring/record arm/playback monitoring 룰을 명시한다.
6. 판정 파이프라인에서는 분기된 RAW DI에 별도 입력 정규화/노이즈 처리 등을 **복사본에서만** 적용한다. 점수 모델의 프레임 시간은 capture timestamp 기준으로 정렬하고 출력 모니터링 지연과 혼동하지 않는다.
7. 플러그인 처리 지연(PDC)이 있다면 Playback/Export/Overdub 정렬을 구분 보정한다. 'DI 파일의 파형을 타임라인에서 옮기는 것'과 '소리의 모니터 지연'을 혼동하지 않는다.
8. 48kHz 128 samples의 *블록 기간*은 약 2.67ms지만 **실제 총 왕복 지연은 드라이버·버퍼·플러그인·OS 영향을 추가로 포함**한다. 단순 블록 기간을 UI 'latency'로 표시하지 않는다.
9. 재생/녹음 오디오 블록은 동일한 clock domain에서 움직이도록 설계한다. 다른 장치로 출력하면 drift/resampling 문제가 생길 수 있다.
10. `Direct monitoring`과 `Input monitoring` 동시 사용 시 플랜징/중복음 현상이 발생할 수 있다. 특히 SSL 2 MKII는 사용자가 본체 모니터 설정을 확인하도록 UI에 표시한다.

## 9. 플러그인 상태, 오디오 렌더링 및 안전성

### 9.1 State 복원

- VST3 사양에 맞게 processor component state / controller state의 전체 저장·복원을 검토한다.
- 프리셋 UI 조작 뒤 저장 → 앱 종료 → 재실행 → 동일 톤/설정이 재현되는지 **실제 AmpliTube에서** 테스트한다.
- 프리셋 전환은 DSP 내부 자원을 교체할 수 있으므로 **오디오 콜백에 직접 UI용 상태 변경 코드를 실행하지 않는다**. 안전한 명령 큐/블록 경계 및 라이브러리 요구 스레드를 사용한다.
- `stateBlob` 크기는 가변이다. 작은 JSON 필드에 임의로 고정 길이로 제한하거나 단순 파라미터 숫자만 직렬화하지 않는다.

### 9.2 Freeze/Bounce 정확성

- Render worker는 트랙 시간축을 따라 **같은 DI → 같은 FX chain 순서**로 처리한다.
- 플러그인 tail(리버브/딜레이) 및 latency를 보존하며, 재생 프리롤/마지막 꼬리 구간을 고려한다.
- 빠른 오프라인 렌더를 지원하지 않거나 오프라인에서 결과가 달라지는 플러그인은 **실시간 렌더 fallback**을 제공한다.
- Freeze 캐시 WAV의 생성은 임시 파일에 완료 후 원자적 이동으로 반영한다. 실패 시 원본+FX 체인을 그대로 유지한다.
- Freeze된 트랙은 이미 처리된 결과에 AmpliTube가 **다시 이중 적용되지 않도록** 한다.
- Bounce 결과는 처리된 오디오를 새 트랙에 놓되 **원본 트랙의 FX 체인을 자동으로 중복 활성화하지 않는다**. 사용자가 새 트랙에 FX를 추가할 수 있는 것은 별개.
- Export 시 단독 raw take, 특정 FX 처리된 track, 모든 track+master mix를 구분한다. 다른 모드의 백킹·YouTube 콘텐츠를 임의 캡처/합성하지 않는다.

### 9.3 플러그인 실패 대응

| 장애 | 기본 동작 |
|---|---|
| AmpliTube 미설치 | `Missing plugin`; DI 재생/녹음 정상 유지 |
| 라이선스 미인증 | IK 표시/로그를 바탕으로 명확히 안내; 사용 가능으로 거짓 표시 금지 |
| 로딩 실패 | FX bypass, 오류 기록, 프로젝트/DI 유지 |
| DSP 예외/크래시 | In-process에선 전체 앱 크래시 가능성; isolation 지원 전에는 위험 명시, 복구 설계 |
| GUI 에디터 미지원 | FX 오디오/상태 처리와 별개로 표시; generic param UI 시도 |
| 오디오 underrun | 성능 계측, 버퍼 조정 안내, 녹음 손상 여부 확인 |
| 장치 분리 | 녹음 안전 중지/파일 마무리, 장치 재연결 안내 |
| 재열기 시 플러그인 없음 | blob 보존, DI 재생, Freeze 캐시가 유효하면 재생 가능 |

### 9.4 보안 및 라이선스

- 외부 VST3 플러그인은 **네이티브 실행 코드**다. 파일을 로드하는 행위 자체가 신뢰 경계다. 일반적인 플러그인 검색·서명/경로/제조사 표시, 사용자 동의, 충돌 복구 정책을 마련한다.
- VST3 SDK 3.8+는 MIT로 전환되었으나 ASIO SDK/각 Rust 크레이트/IK Multimedia 플러그인·프리셋/제조사 상표는 **별도 조건** 확인.
- IK 플러그인 설치 파일이나 모델·샘플 콘텐츠를 앱과 함께 재배포하지 않는다.
- GuitarLab이 IK 제품과 공식 제휴되어 있는 것처럼 표기하지 않는다.

## 10. 실행 계획(Claude Code 자동 개발용)

### Phase 0 — 저장소 조사 / 실기기 PoC [반드시 선행]

- [x] Git 상태 확인 및 기존 오디오/녹음/DB/UI 레이어 인벤토리 작성(2026-11-07: §0.5·`AMPLITUBE-05-PHASE-00.md` 인벤토리).
- [ ] Windows x64 / SSL 2 MKII ASIO driver / AmpliTube 5 VST3 설치 여부 검증(2026-11-07: Windows 11 x64·AmpliTube 5.10.4 VST3 확인. ASIO는 D1 결정으로 WASAPI 우선이라 미검증).
- [x] VST3 검색 결과에서 AmpliTube 5의 plugin class ID와 오디오 버스 정보 확인(2026-11-07 Phase 0 probe).
- [x] `vst3-host` 최신 호환 버전 또는 SDK 기반 작은 PoC 생성: **기존 WAV의 DI 몇 초 → AmpliTube 5 → 처리된 출력 WAV**(2026-11-07: `scripts/vst3-amplitube-probe/`, 원음 지문 불변).
- [x] 프리셋 변화로 실제 처리된 오디오가 변하는지 검사(단순 볼륨·패스스루만 보고 성공 처리 금지)(Phase 0에서는 미검증, 2026-11-07 Phase 3B·4A에서 저장 톤 전환·다른 톤 Freeze 결과가 달라짐을 확인. 청취는 사람 몫).
- [x] 플러그인 로드/프로세싱 해제/메모리·에러 처리 검증(2026-11-07: 반복 로드·해제 누수 없음, 해제 뒤 메모리 반환, 실패 시 원음 유지).
- [x] 실기기 미보유 시 테스트 프로그램과 실행 절차를 제공하고 상태를 '미검증'으로 기록(실기기 보유. 사람 확인은 `docs/progress/MANUAL-CHECKS.md` 16~28번).
- **통과 기준:** 실제 AmpliTube 5 VST3 신호 처리 검증 또는 정확한 blocker/대체 계획.

### Phase 1 — RAW DI 분기 / 입력 모니터링 기반

- [x] 기존 레코더를 유지하면서 capture 직후 DI를 독립 writer queue로 보낸다(기존 구현: 입력 callback에서 녹음 큐와 모니터 링으로 따로 복사, `AMPLITUBE-05-PHASE-01.md`).
- [x] Input Monitor와 Record Arm의 상태를 분리한다(기존 구현: 모니터 켜기는 녹음을 시작하지 않음).
- [ ] DAW 트랙별 FX 라우팅 및 master output을 단일 엔진에 연결한다(2026-11-07 2B: TAKE 레이어 하나만 모니터 엔진에 합침. 반주·다른 레이어는 WebView 재생 그대로라 미완료).
- [x] 별도 FX 없이 dry passthrough를 정상 동작시킨다(2026-11-07: `MonitorInsert` DRY가 기존 출력과 샘플 단위 동일).
- [x] 기존 take, 백킹, 스템, 실시간 판정 회귀 테스트(매 Phase `pnpm verify:app` 전체 통과).
- **통과 기준:** dry-only WAV 저장, monitor 토글, 재생 동기화.

### Phase 2 — AmpliTube 실시간 VST3 호스팅

- [ ] 트랙별 VST3 instance 생성/FX slot 관리(D3 결정으로 인스턴스 하나·슬롯 하나. 트랙별 인스턴스는 공존 현상(O-1) 확인 뒤로 미룸).
- [x] mono in → stereo out, buffer/sample rate/bus negotiation 구현(2026-11-07 2A).
- [x] (2A) `DI → AmpliTube → Output` 연주 중 모니터링 구현(기존 Rust 모니터 경로)(2026-11-07: 별도 DSP 스레드·잠금 없는 링. 청취는 `MANUAL-CHECKS` 17번).
- [x] (2B, D2 결정 후) `DI WAV → AmpliTube → Output` 재생 구현(2026-11-07: 사용자 선택에 따라 TAKE 레이어 하나를 모니터 경로에 합쳐 같은 인스턴스로 처리, 반주·다른 레이어는 WebView 유지. 청취 확인은 사람 몫).
- [x] CPU/xrun/latency 측정; 오류 시 dry bypass/에러 UI(2026-11-08: 블록 처리 평균 부하 4.7%, 부족·버림·오류 수 `InsertStats`, 지연 구성 추정 표시, 실패·누락 시 원음 유지 안내).
- **통과 기준:** Record 시 모니터는 wet, WAV는 dry, 재생은 wet, 원본 해시 동일.

### Phase 3 — UI, 상태 저장/에디터

- [x] DAW 트랙 FX 랙과 Plugin Browser, Bypass, Insert/Remove, Input Echo를 연결(2026-11-07: 하단 믹서 입력·테이크 줄 FX 랙, 실시간 Bypass, 적용·빼기, 입력 모니터 연결. Plugin Browser는 사용자 결정으로 AmpliTube만, 다른 VST3는 안내만).
- [x] AmpliTube 플러그인 상태 binary 저장/복원 및 프로젝트 재열기 테스트(2026-11-07: 프로젝트별 DB 저장·버튼 복원, 앱 재시작 뒤 앰프 복원 화면 확인. 청취는 `MANUAL-CHECKS` 20번).
- [x] Windows native plugin editor 별도 윈도우 가능 여부 검증/구현(2026-11-07: 실제 AmpliTube 5 화면이 별도 창에 그려지고 처리 중 열기·X 닫기·해제·앱 종료 확인. 노브 조작 청취는 사람 확인 `MANUAL-CHECKS` 19번).
- [x] Score ↔ DAW 전환 중 state/engine/stream 유지(2026-11-07: 입력·AmpliTube 모니터·Bypass·편집 창을 켠 채 작업 공간·탭 13회 전환, 입력 세대·모니터 세션·플러그인 상태 불변).
- [x] 누락 플러그인, 라이선스, 에디터 미지원에 대한 친절한 UI(2026-11-07: 원음 유지 안내·인증 여부 미표시 원칙·느린 로드 인증 창 안내·톤 보존·상표/비제휴 고지. 실제 미설치·미인증 재현은 안 함).
- **통과 기준:** 저장/재열기 후 프리셋 복원 및 UI 상태 유지, GUI 작동 여부를 별도로 보고.

### Phase 4 — Freeze / Bounce / Export / Overdub

- [x] Freeze 캐시 렌더 + Unfreeze 원본 복원(2026-11-07 4A: 오프라인 렌더·정착 확인·tail·지연 정렬, 실시간과 상관 1.0000, 앱에서 Freeze→재생 준비→Unfreeze·DI 불변 확인. 청취는 `MANUAL-CHECKS` 24번).
- [x] Bounce to New Track(2026-11-07 4C: 믹스 `RENDER` 레이어, 원본 줄 음소거, Freeze면 캐시 복사. 청취는 `MANUAL-CHECKS` 25번).
- [x] Dry DI Export vs Processed Export 분리(2026-11-07 4B: 원본은 기존 `export_recording`, 처리된 소리는 `export_take_freeze`로 Freeze 캐시를 바이트 그대로 새 WAV에).
- [ ] LEAD/RHYTHM 독립 FX/테이크, 오버더빙 실시간 모니터링과 정렬.
- [x] plugin tail, latency, 실패 시 안전 취소/부분 파일 정리(2026-11-07 4A·4C: tail -90dBFS·최대 10초, 지연 정렬, 정착 확인, 취소·실패 시 임시 파일만 정리·이전 캐시 유지).
- **통과 기준:** 렌더 결과에 FX가 정확히 한 번만 적용, 원본 손상 없음.

### Phase 5 — 안정화 / 릴리스 준비

- [ ] 입력 끊김, 오디오 장치 교체, 프리셋 변경, 플러그인 누락/크래시 회귀 테스트(2026-11-08: 프리셋 변경·누락 안내·전환 유지는 자동·앱 확인, 실제 장치 분리·미설치·크래시는 미실행 — `AMPLITUBE-05-PHASE-05.md`).
- [ ] 48kHz에서 다양한 버퍼 크기 및 고CPU 환경 측정(2026-11-08: 128블록 처리 평균 부하 4.7% 측정. WASAPI 공유 모드라 장치 버퍼 선택·고CPU 환경 측정은 미실행).
- [x] Windows x64 release build, 필요한 SDK/라이선스/배포 자산 점검(2026-11-08: release 빌드·Rust 1.90·고지 지문 확인. 설치기·서명·새 PC·법무 검토는 별도).
- [x] 기존 프로젝트 DB 마이그레이션 테스트, 녹음 파일/렌더 파일 무결성 검증(2026-11-08: v2~v11 → 12 migration 검사, 실제 DB 10→11→12 백업 대조, 렌더 SHA 검사, 백업·복원의 DB 11·12 지원 회귀 수정).
- [x] 설명서에 SSL 2 MKII 입력 설정 및 AmpliTube 설치·활성화 절차 기재(2026-11-08: `docs/21-QUICKSTART.md` 7절).
- **통과 기준:** 검증된 플랫폼·테스트·제약·미지원 기능을 최종 문서에 명확히 표시.

## 11. 필수 테스트 시나리오

| ID | 테스트 | 기대 결과 |
|---|---|---|
| T01 | AmpliTube VST3 검색 | 제조사/클래스 정확히 식별; 없으면 Missing |
| T02 | Input Monitor ON, Record OFF | AmpliTube 모니터링은 들리되 녹음 파일 생성 안 됨 |
| T03 | Record ON, Input Monitor OFF | DI 파일 녹음, wet monitor 음소거 |
| T04 | Record ON, Input Monitor ON | 파일은 dry, 모니터링은 wet |
| T05 | 프리셋 A→B 변경 | 원본 WAV SHA-256 불변, 출력 변화 |
| T06 | 프로젝트 Save/Load | 플러그인 인스턴스 상태/톤 복원 |
| T07 | AmpliTube 누락 | dry 재생 및 원본 유지; FX Missing 경고 |
| T08 | LEAD + RHYTHM overdub | 두 DI 파일 독립; 혼입 없음; 시간 정렬 |
| T09 | Score/DAW 전환 | 재생 위치/플러그인/녹음 유지 |
| T10 | Freeze/Unfreeze | wet 캐시→dry+FX 복귀; 원본 WAV 불변 |
| T11 | Bounce to New Track | 별도 FX-processed WAV 생성; 원본 보존 |
| T12 | Processed export | 렌더에 FX 포함; tail 보존; 이중 처리 없음 |
| T13 | 48k 64/128/256/512 | 지원 설정별 실제 지연/xrun 측정·기록 |
| T14 | Mono DI to stereo | input channel 1 정상, 스테레오 출력 모두 확인 |
| T15 | Native editor 열기/닫기 | Windows 실제 AmpliTube UI 동작 여부 검증 |
| T16 | 강제 중지/디스크 부족 | 데이터 손실 최소화 및 partial take 오류 표시 |
| T17 | 한쪽 채널/장치 분리 | 오디오 안전 종료, 상세 오류 표시 |
| T18 | 판정 + wet monitor 동시 | 점수는 DI 기준, 판정 지연/음소거 독립 |

**테스트 규칙:** `cargo check`나 `pnpm build` 성공만으로 T02~T18의 실제 오디오 동작을 검증했다고 기록하지 않는다. 정상 기능 검증, 가청 모니터링, 음성/신호 비교, Windows 실기기 호환성을 구분한다.

## 12. 성능·완료 조건 및 범위 관리

- 추가 플러그인 기능은 기존 기능 회귀가 없어야 한다.
- 사용자 모니터링 지연은 **측정된 실제 round-trip latency**로 표기한다. 초기 목표는 가능한 작은 블록에서 안정적인 연주감이지만 하드웨어별 결과를 과장하지 않는다.
- CPU 과부하/드롭아웃/정지 시 사용자에게 인지 가능한 상태 메시지를 제공한다.
- 음원 분리 기능의 기타 STEM과 **직접 연주한 DI 트랙**은 구분한다. AmpliTube는 우선 DI 기타 트랙에만 기본 활성화한다.
- Python AI 모델은 리얼타임 VST DSP 콜백 내에서 호출하지 않는다.
- Windows 네이티브 editor나 프로세스 격리와 같은 고난도 기능은 **증거 기반 구현/미지원 판정**을 한다. 일단 가짜 화면으로 완료 처리하면 안 된다.

## 13. Claude Code 최종 결과 보고 형식

각 Phase 종료 시 아래 내용을 Markdown에 반드시 남긴다.

```md
# AmpliTube VST3 Integration — Phase XX
- 작업 일자:
- Git commit/branch:
- 이번 Phase 목표:
- 구현된 기능:
- 변경 파일과 변경 이유:
- 실제 실행한 빌드/테스트 명령:
- PASS / FAIL / NOT RUN (실기기 테스트는 별도 분리):
- 원본 DI 데이터 무결성 검증 결과:
- Windows + SSL 2 MKII + AmpliTube 5 실기기 검증 결과:
- 미완성·제약·리스크:
- 다음 단계 및 재개 지점:
```

**최종 완료 판정:** UC-1~UC-5 중 실제 지원한다고 선언한 항목의 동작 검증과 파일 무결성 확보. 기능이 테스트되지 않았다면 '코드 작성 완료'와 '기능 정상 동작 확인'을 분리해서 보고한다.

## 14. 공식 자료 / 기술 참고 링크

> 아래 링크는 구현 시작 시 다시 읽고 버전, 라이선스, 실제 지원 상태를 재확인한다. 오래된 Cakewalk SONAR 문서는 **기본 설계 원리 확인용**이다.

1. Cakewalk Sonar — How to Record into an Audio Track (Input Echo): https://help.cakewalk.com/hc/en-us/articles/360021857933-How-to-Record-into-an-Audio-Track-in-Cakewalk-Sonar
2. Cakewalk SONAR — Freeze tracks and synths: https://taylor.cakewalk.com/Documentation?help=Mixing.24.html&language=3&product=SONAR
3. Cakewalk SONAR — Bounce to Track(s): https://taylor.cakewalk.com/Documentation?help=Dialogs1.14.html&language=3&product=SONAR
4. Sweetwater/Cakewalk historical behavior — Track FX monitors wet, records dry: https://www.sweetwater.com/sweetcare/articles/insert-effect-cakewalk-sonar-version-1-2-3-4/
5. IK Multimedia — AmpliTube 5 formats and Windows requirements: https://www.ikmultimedia.com/products/amplitube5/
6. IK Multimedia — AmpliTube 5 presets `.at5p` (distinct from VST3 component state): https://www.ikmultimedia.com/faq/?id=1408
7. Steinberg — VST3 API: https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/API%2BDocumentation/Index.html
8. Steinberg — Plugin state persistence: https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Persistence.html
9. Steinberg — Real-time processing rules: https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Processing.html
10. Steinberg — VST3 SDK 3.8+ MIT license: https://steinbergmedia.github.io/vst3_dev_portal/pages/VST%2B3%2BLicensing/VST3%2BLicense
11. RustAudio CPAL Windows ASIO support: https://github.com/RustAudio/cpal
12. Rust `vst3-host` (candidate, not compatibility guarantee): https://docs.rs/crate/vst3-host/latest
13. SSL — Windows ASIO/WDM driver: https://support.solidstatelogic.com/hc/en-gb/articles/5349706035229-SSL-USB-Audio-ASIO-WDM-Windows-Driver-Downloads
14. SSL 2 MKII product specification / ASIO driver: https://solidstatelogic.com/products/ssl-2-mkii

---

## 15. Claude Code에 붙여 넣을 시작 프롬프트

```text
첨부/프로젝트에 있는 GuitarLab-AmpliTube5-Cakewalk-Style-VST3-Integration.md를 읽고 기존 GuitarLab 프로젝트의 모든 관련 설계 문서와 현재 코드를 먼저 분석해주세요.

목표는 Cakewalk처럼 'DI 원음만 녹음하고, AmpliTube 5 VST3를 트랙 FX 랙에서 실시간 모니터링/재생에 적용하며, Freeze/Bounce 때만 처리 오디오를 별도 렌더링'하는 기능입니다.

먼저 Phase 0에서 Windows x64 + 실제 AmpliTube 5 플러그인 호환성 검증 및 기존 오디오 엔진 통합안을 작성하고 최소 PoC를 구현해주세요. 명세서의 순서와 검증 조건을 준수하여 가능한 다음 Phase로 자동 진행해주세요.

기존 기능/녹음 원본을 절대 파괴하지 말고, 실제 동작·빌드·테스트 결과와 미검증 항목을 분리해서 docs/progress/AMPLITUBE-05-PHASE-XX.md에 기록해주세요. 진행 상태는 docs/progress/README.md에 누적 관리해주세요. 실제로 검증되지 않은 Windows 플러그인 GUI나 저지연 동작을 완성됐다고 표현하지 마세요.
```
