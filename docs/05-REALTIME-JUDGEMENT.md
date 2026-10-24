# 05. 실제 기타 인식 · 리듬게임 판정 시스템

## 골페 표기의 미지원 경계 — 2026-10-25

박자의 손가락/엄지 골페 표기도 기존 `UNSUPPORTED`에 포함합니다. 해당 박자의 일반 음정을 골페 주법을 수행한 근거로 채점하지 않으며 인접 정상 피킹은 그대로 둡니다. 실제 골페 소리를 인식하는 엔진은 아니며 기존 감점 제외/편집 소실 거부·반복/구형 원본 복원 정책을 재사용합니다. 실제 파서/GP 왕복과 검사 결과는 progress/PHASE-07 최신 절을 따릅니다.

## 장식음의 미지원 경계 — 2026-10-24

명시적 GraceType.None 이외의 꾸밈음은 짧은 일반 피킹으로 채점하지 않습니다. 유효한 원래 시각/길이·인접 일반음은 그대로 두고 해당 목표만 기존 UNSUPPORTED로 보류합니다. 음수 시작 tick을0으로 바꿔 목표를 만들지 않습니다.

Turn/InvertedTurn/UpperMordent/LowerMordent는 한 음표로 표기돼도 여러 피치의 장식 연주이므로 일반 피킹 채점을 하지 않습니다. 공통 정규화의 기존 UNSUPPORTED→감점 제외 경로를 사용하며 반복 occurrence/구형 원본 metadata 복원에도 적용합니다. 실제 오디오에서 장식음을 인식하는 기능·과거 점수 재계산은 추가하지 않습니다.

## 단음 흔들림 관측 추가 — 2026-10-20

기존 사후1초 궤적 진단에 제한된3~9Hz/35~150cents의 주기적 변화 관측을 추가합니다. 선형 추세 제거/사인·코사인 최소제곱·충분한 유효 점/주기성/설명비율/3회 이상 관측 조건을 적용합니다. 유지·상승/하강 조건이 우선이며 불확정 곡선은 기존처럼 보류합니다. 명칭은 주기적 음정 흔들림 후보이고, 실제 비브라토/벤딩/슬라이드 분류나 채점으로 연결하지 않습니다. 결과v2와 호환성은 docs/12를 따릅니다.

## 요약

마이크/오디오 인터페이스의 입력을 Rust로 캡처하고 음표의 **onset(시작 타격 시각)**과 **pitch(실제 음높이)**를 추정합니다. 현재 악보의 목표 음표와 매칭해 `COOL`, `GOOD`, `MISS`를 부여합니다. `EARLY`, `LATE`, `WRONG NOTE`는 별도 상세 결과입니다.

> 초기 안정 범위: 깨끗한 **단음 멜로디**. 화음 및 벤딩·하모닉스·슬라이드 등은 단계적 고도화. 확신이 낮은 검출은 오채점 방지를 위해 재확인/판정 보류를 지원합니다.

## 데이터 흐름

```text
CPAL capture(callback, sample frame + sampleIndex)
   → bounded PCM queue → DSP noise gate / onset detection
   → pitch estimate (Hz, confidence) + onset timestamp
   → pitchHz → MIDI pitch float/int and cents deviation
   → timebase: capture timestamp → corrected song time
   → matcher(expected note events, detected events)
   → judgement{COOL|GOOD|MISS, timing, pitch, combo, score}
   → Tauri event → React scoreboard & practice history
```

- 기타 input의 스피커 모니터링 및 원곡 출력이 마이크에 재유입될 때 false onset 가능. 입력 게인·헤드폰 권장·노이즈 게이트 UI 제공.
- open E2(82.41Hz 부근)~프렛 높은 음까지 안정 검출 가능한 알고리즘을 선택하되, harmonic confusion/왜곡을 실제 샘플로 확인.
- 단일 프레임 FFT peak를 곧바로 정답이라고 취급하지 않음. YIN/autocorrelation 등 가능한 알고리즘 PoC 후 선택.

## 시간축 정의

`targetSongTimeMs`: 현재 악보 노트의 **원곡 오디오에서의 목표 시간** (sync anchors 반영).

`detectedSampleTime`: 실제 샘플이 캡처된 monotonic 시간 (정확도가 가능하면 드라이버/오디오 프레임 기반; 불가능하면 측정 오차 표시).

`playedSongTimeMs`: 입력 시각을 재생 엔진 clock을 사용해 원곡 시간축으로 변환한 값. seek/loop/rate 변경을 포함합니다.

`calibrationBiasMs`: 동일 장치·설정에서 사용자가 올바르게 연주해도 감지 시간이 얼마나 **늦게 관측되는지**에 대한 바이어스 (양수 = 늦게 관측). 원곡 시간축의 ms로 저장하되 rate 변경 시 재계산 규칙이 필요합니다.

`correctedPlayedSongTimeMs = playedSongTimeMs - calibrationBiasMs`.

`deltaSongMs = correctedPlayedSongTimeMs - targetSongTimeMs`.

- delta<0: EARLY; delta>0: LATE. **미래 이벤트를 현재 UI 렌더 시각과 비교 금지**.
- 재생속도 `rate`가 0.75일 때 동일한 실시간 허용 간격을 유지하려면 `deltaRealMs = deltaSongMs / rate`를 사용합니다. `rate=1`과 `rate=0.75`에서 손실/유불리 정책을 테스트로 검증합니다.
- 초기 구현은 판정 허용치를 **실제 시간(ms)** 기준으로 정의하고, rate 계산을 적용합니다. UI가 표시하는 EARLY/LATE도 real ms로 표기.
- 각 input event는 판단 시점의 `playbackEpoch`(seek, 재시작, 루프 반복, 속도 변경 시 새 epoch)를 갖습니다. 이전 epoch 이벤트는 폐기.

## 초기 판정 규칙 (조절 가능)

기본 난이도 **Normal**: 음정 매칭(기본 ±50 cents, 기기/소음 조건에 따라 조정)일 때

| 판정 | 입력 타이밍 오차 `abs(deltaRealMs)` | 점수 |
|---|---:|---:|
| `COOL` | `<= 50ms` | 1000 |
| `GOOD` | `> 50ms` & `<= 120ms` | 500 |
| `MISS` | `> 120ms`, 미입력 또는 잘못된 음정 | 0 |

설정 초기값(테스트용, 실측 후 조정):

| 난이도 | COOL | GOOD | 음정 허용 편차 |
|---|---:|---:|---:|
| Easy | ±80ms | ±180ms | ±75 cents |
| Normal | ±50ms | ±120ms | ±50 cents |
| Hard | ±30ms | ±80ms | ±35 cents |

- 사용자가 타이밍/음정 허용치 세부 조절 가능(범위 검증). 난이도·rate·튜닝·calibration 포함한 조건을 기록과 함께 저장.
- 잘못된 음정이 윈도 안에 들어오면 `WRONG NOTE` 피드백 표시. **같은 목표음에 대해 재시도할 시간을 허용**할지 즉시 MISS인지 정책을 고정: 초기에는 목표 시각 이후 GOOD 윈도 종료까지 재시도 허용, 마지막에 MISS 확정. 잘못된 음은 별도 mistake event로 기록.
- onset이 없는 피치 흔들림/지속음은 새 공격으로 채점하지 않음. 한 목표 음표는 **최대 한 번**만 COOL/GOOD/MISS 확정.
- 짧은 음 연타에서는 onset 최소 거리/monophonic matching rule을 조정하여 같은 음 연속 공격을 별개 타깃과 매칭.

## Note matcher / 확정 규칙

1. 해당 epoch에서 아직 확정되지 않은 기대 음표 중 현재 관측 시각으로부터 후보 윈도 내 이벤트를 수집.
2. 시간 차가 작고 pitch가 맞는 후보를 선택하되, 가장 먼저 확정 가능하고 전체 일대일 매칭을 해치지 않게 결정론적 규칙 적용.
3. Pitch confidence가 낮으면 장치 상태/노이즈 측정과 함께 `UNVERIFIED`로 표시. `MISS`로 무조건 카운트하지 않음.
4. 각 expected note에 대해 window 종료 시 matching 성공이 없으면 `MISS`를 한 번만 발행.
5. 미래 타깃의 `MISS`는 재생/입력 상태가 정상일 때만 발행. 중단/장치 끊김 구간은 `SKIPPED` 처리 후 정확도 분모에서 제외.
6. 코드/동시 음표는 Phase 7까지 `UNSUPPORTED` 또는 공정한 단음 대표 트랙만 활성화(불가능한 전체 음 동시 일대일 채점 금지).
7. loop 시 iteration ID를 부여해 같은 노트가 새 시도로 채점되게 함. 개별 attempt의 점수는 분리하여 관리.

## 점수/콤보/정확도

- COOL 1000, GOOD 500, MISS 0. 모든 판정 대상은 기본 가중치 1.
- 정확도(%) = `100*(COOL*1.0+GOOD*0.5)/(COOL+GOOD+MISS)`; 단, `UNVERIFIED/SKIPPED/UNSUPPORTED` 제외.
- 콤보: COOL 또는 GOOD 시 +1, MISS 시 0. WRONG_NOTE를 잘못된 최종 판정으로 확정한 시점에만 콤보 종료.
- 랭킹: 동일 곡·트랙·악보 버전·속도·난이도·채점 옵션 조합에서 비교. 점수 비교 기준이 달라지면 다른 보드.
- 일시정지/seek: 과거 시도 기록은 보존하되 새로운 attempt를 시작. loop 연습은 루프마다 별도 attempt로 기록(사용자 선택 시 전체 누적 화면 표시 가능).
- 미지원/저신뢰 구간은 분모에서 제외했음을 결과 화면에 표시.

## 캘리브레이션

- 장치 프로필 키: OS 입력 장치 식별자(보안상 원본 표시·저장 주의) + sample rate + buffer configuration + 모니터 환경.
- 비트/클릭 사운드와 사용자의 반복 스트럼 간 측정으로 **관측 오프셋**을 추정하고, 중앙값/이상치 제거·신뢰도 표시.
- 클릭 재생과 캡처에 각각 latency가 있어 완벽한 절대 측정이 어려움. 사용자 수동 ±ms 미세 조정 제공.
- 실제 오디오 재생은 헤드폰 권장. 스피커→마이크 acoustic loop는 교정 오염을 일으킬 수 있음.
- 장치/출력/버퍼/샘플레이트 변경 시 기존 보정값의 유효성을 점검하고 재측정 권유.

## 피치·온셋 실험 계획

- `E2, A2, D3, G3, B3, E4` 개방현 단음, 8프렛, 12프렛, palm mute, 높은 gain, noise에서 test.
- Synthetic sine는 정확한 주파수/시점 테스트 용도이며 **실제 기타 모델 검증 대체 불가**.
- 목표: onset timestamp 오차 분포(p50/p95), pitch accuracy, CPU %, dropped frames, 메모리, 렌더 UI 지연을 장치별 기록.

## 결정론적 테스트 예시

1. Normal, 목표 G4=67 at 2000ms, 관측 G4 at 1975ms → COOL, EARLY 25ms, 1000점.
2. 관측 G4 at 2090ms → GOOD, LATE 90ms, 500점.
3. 관측 F4 at 2000ms + 추가 G4 at 2080ms → WRONG NOTE 피드백 후 GOOD(재시도 허용).
4. 목표 E4 at 2000ms, window 종료까지 감지 없음 → MISS 딱 1회.
5. seek 직후 이전 epoch 이벤트 도착 → 폐기, 새로운 목표에 재사용 금지.
6. 입력 장치 disconnect → `SKIPPED`, 무조건 MISS 처리하지 않음.
7. speed 0.5×일 때 80ms 실제 지연은 deltaSongMs=40ms로 변환 후 재생속도를 되돌려 80ms GOOD으로 처리.
8. 같은 목표에 이중 onset → 단일 확정, 중복 점수 없음.

## UI 데이터 흐름

- `JudgementEvent`는 `noteId`, `attemptId`, `judgement`, `deltaRealMs`, `expectedPitchMidi`, `detectedPitchMidi`, `confidence`, `scoreAwarded`, `comboAfter`, `epoch` 포함.
- 60fps UI 애니메이션은 이벤트 뷰만 수행. Rust 채점 계산과 지판 표시를 함께 묶지 않음.

## 완료 조건

- 고정된 입력 fixture를 동일 결과로 판정(최소 8개 위 예시).
- 오디오 callback blocked I/O 없음 및 장치 해제 처리 확인.
- calibration / speed / seek / loop / pause의 점수 일관성 자동 테스트.
- 실제 오디오 인터페이스에서 측정 데이터를 공개할 수 있는 진단 창 보유.

## v0.2 연주 모드 채점 및 녹음 연동

- 연주 모드의 판정 대상은 선택된 `targetScoreTrackId` 1개. 다른 악보 기타 트랙의 노트를 matcher에 넣어 잘못된 MISS/WRONG NOTE를 계산하지 않습니다.
- 재생 epoch, score revision, selected track 및 calibration snapshot을 시도(attempt)에 기록. 세션 중 트랙 전환은 명시적 stop/restart 또는 새 attempt로 분리.
- 녹음 자체는 판정 성공 여부에 의존하지 않으며 `REC` 누르지 않은 상황에서는 계속 생성되지 않습니다.
- `recordedSampleToSongMs`는 sample position과 monotonic capture timestamp 기반. 기록된 takes의 파형과 scoring marks를 재생 타임라인에 표시.
- YouTube backing은 sample-accurate clock을 얻지 못하므로 정밀 COOL/GOOD/MISS를 검증 전 비활성화하고 무점수 연주/녹음 허용. 사용자가 선택한 임베드 재생을 별도 수정·합성하지 않습니다.
- 마이크 녹음은 배경음이 섞일 수 있으며 입력 장치로 DI 인터페이스를 권장. 자세한 조건 `docs/17`.

## Phase7 첫 내부 평가 — 2026-10-20

순수 코드 음정 집합 평가를 별도 모듈로 실험합니다. 목표2~6음·검출0~6개/신뢰도와 허용 cents를 검증하고 최대 일대일 대응 후 같은 대응 수에서 평균 절대 오차를 최소화합니다. 누락·추가·다른 옥타브는 완전 일치가 아니며 후보 없음/저신뢰/근접 중복은 UNVERIFIED입니다. 같은 목표 MIDI의 다른 줄·프렛은 구별하지 못합니다.

기존 단음 Matcher와 실시간 입력·점수에는 연결하지 않습니다. PCM 다성 검출·onset/스트럼 시간·주법 평가·실제 허위 감점률 검증은 후속입니다. 합성 음정 후보의 테스트 통과를 실제 기타 코드 인식 성공으로 표시하지 않습니다. 내부 계약은 docs/12, 결과는 progress/PHASE-07을 따릅니다.

## Phase7 PCM 후보 진단 — 2026-10-20

기존 음정 집합 비교에 바로 점수를 붙이지 않고, 저장한 선택 테이크400ms를 읽기만 하는 별도 진단부터 제공합니다. FFT peak의 상대 salience는 확률/confidence로 사용하지 않습니다. 좁은 합성 close triads와 달리 옥타브/배음이 겹치는 open voicings에서 recall0.60에 그쳐 높은 성부 누락 한계를 명시하고 실시간 코드 Matcher 연결을 보류합니다. 이는 초기 기준선이지 실제 기타 검출 품질 통과가 아닙니다. 구간 SHA/소유권·30초/16MiB·누락/클리핑/취소와 원본 보존을 검사하며 개인 녹음은 사용자가 명시적으로 선택·실행한 때만 로컬 처리합니다. 실제 입력/콜백·기존 단음 판정은 바꾸지 않습니다.

## Phase7 미지원 주법 보호 — 2026-10-20

2026-10-24 보완: note의 왼손 태핑과 별개로 박자의 tap/slap/pop/deadSlapped·fade/volume swell·rasgueado 표기도 미지원으로 보존합니다. import/반복·구형 원본 복원→감점 제외·편집 소실 거부 경로를 같은 계약으로 검증합니다. 이 보완은 표기된 미지원 음의 안전 처리이며 실제 연주 주법을 감지하거나 채점 지원하는 기능이 아닙니다.

원본 주법 표기를 `NoteEvent.judgementSupport=UNSUPPORTED`로 보존하고 `PracticeTarget.unsupported`에 전달합니다. 음정/오음 점수 대신 정상 마감 때 NOT_SCORED/UNSUPPORTED로 제외하며 중단/불완전 윈도는 SKIPPED 우선입니다. 미지원 목표에 더 가까운 onset을 인접 지원 음의 정답/오음 근거로 넘기지 않습니다. 새 기록 버전은 monophonic-poc-v2이며 기존 기록은 재계산하지 않습니다. 원본 재열기 시 예전 metadata를 비파괴 보완하고 저장을 안내합니다. 기본 편집/MusicXML 정규화는 주법을 보존하지 못하므로 거부하고 원본 보기·재생을 유지합니다. 주법 인식기가 아니며 악보에 표시되지 않은 주법의 검출이나 모든 표기 형식 지원을 보장하지 않습니다.

## Phase7 단음 음정 궤적 진단 — 2026-10-20

선택한 누락 없는 READY 녹음1초에서 기존 차분 단음 검출기의 창별 주기성과 음정을 관측합니다. 최대40개/약25ms 간격이며 창 중심 시각·유효 비율/처음·끝3점 중앙값의 변화량을 표시합니다. 클리핑/저음량·유효80% 미만·급격/방향 모호 변화는 보류합니다. 결과는 유지/상승/하강 후보이고 벤딩/슬라이드/레가토를 음정만으로 분류하지 않습니다. 실제 입력 콜백/단음 점수·코드 채점/녹음 파일은 바꾸지 않습니다. 단음 전용·배음/옥타브/왜곡 한계와 확률이 아닌 주기성을 항상 안내합니다. 태핑/고스트 표기도 기존 미지원 정책으로 제외하며 실제 검출 지원을 뜻하지 않습니다.
