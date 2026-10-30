# 16. 메인(리드)·세컨(리듬) 기타 — 악보 트랙/오디오 stem 분리

> 주의: **GP 악보의 트랙 분리**는 기본 지원 가능한 데이터 작업이지만, **완성된 혼합 음원을 두 기타로 정확히 AI 분리**하는 것은 별개의 연구·검증 문제입니다.

## 구분해야 하는 네 가지 작업

1. **TAB 트랙 분리(확정 기능)**: GP/MusicXML에 있는 `Guitar 1`, `Guitar 2` 등 `ScoreTrack`을 각각 표시, 변경, 편집, 연습 목표로 선택합니다. 트랙 명칭은 실제 리드/리듬 역할을 보장하지 않음.
2. **녹음된 개별 원본 stem 불러오기(확정 기능)**: 별도로 존재하는 lead.wav, rhythm.wav 등을 프로젝트로 import하여 파트별 볼륨/뮤트/솔로/백킹 조합을 지원합니다.
3. **완성곡에서 기타 전체 stem 분리(조건부)**: 사용 가능 모델이 기타 stem을 지원하면 기타 vs 나머지(반주)를 생성합니다. 미지원 모델은 UI에서 분리를 약속하지 않음.
4. **한 guitar stem을 lead/rhythm으로 다시 분리(실험적)**: 특화 모델이 실제로 분리 출력을 제공하고 라이선스/품질 검증을 통과한 경우만 사용합니다. 음색 중첩, 더블 트래킹, 하모니, 코러스 및 distortion에서는 실패하기 쉽습니다.

## 우선순위/폴백 정책

```text
악보에서 두 기타 트랙 검출
  ├─ 별도 lead/rhythm stems 사용자 제공? YES → 개별 재생/뮤트 (정확한 입력 매핑)
  └─ NO
      ├─ 지원하는 모델로 guitar 전체 stem 추출 → 기타 전체 없는 반주 만들기
      ├─ 특화 lead/rhythm 모델 설치·검증? YES → AI 후보 2개 제공, 사용자 검토·승인
      └─ 모델/품질 미달 → 기타 전체 뮤트 또는 수동 백킹 지정 (정확한 파트 선택 제거는 제공 불가)
```

- 기본 앱에 특정 lead/rhythm 분리 모델이 **설치되어 있다고 가정하지 않습니다**. 지원 모델 및 라이선스 정보는 adapter capability에서 확인.
- 악보 상 2개 기타 트랙이 있다고 두 개 오디오 stem을 합성/분리했다고 거짓 표시하지 않습니다.
- 악보 트랙과 AI stem 연결은 **사람이 듣고 확인한 후** 확정. AI confidence가 높아도 자동 연결은 preview 상태로 표시.
- `LEAD`, `RHYTHM`, `HARMONY`, `GUITAR_OTHER`, `UNKNOWN` 역할은 metadata 태그. 타이핑으로 변경 가능.
- `리드 제외 반주` / `리듬 제외 반주`는 실제 별도 stem이 있는 경우에만 **정확한 옵션**으로 제공. AI 후보만 있는 경우 `AI 추정 리드 제거 (음질 저하 가능)` 같은 표시 필요.

## AI 결과 메타데이터

```ts
type GuitarPartRole = 'LEAD' | 'RHYTHM' | 'HARMONY' | 'GUITAR_OTHER' | 'UNKNOWN';
type StemOrigin = 'USER_IMPORTED' | 'AI_GUITAR_ONLY' | 'AI_PART_SPLIT';

type GuitarStemDescriptor = {
  assetId: string;
  origin: StemOrigin;
  role: GuitarPartRole;
  roleConfirmedByUser: boolean;
  modelId?: string;
  modelVersion?: string;
  confidence?: number; // 0..1, 의미/근거를 모델별로 문서화
  auditionRequired: boolean;
  latencyAlignmentMs: number; // parent 오디오 대비
  compatibleScoreTrackIds: string[]; // 승인 전에는 빈 배열 허용
};
```

- job output validator는 길이·채널·샘플레이트·NaN/Inf·피크/클리핑·오프셋·오디오 파형 무결성을 검사하고 원본과 독립적으로 저장.
- 시간이 맞지 않는 stem끼리 믹싱하지 않고 오프셋 맞춤 UI 제공. 모노/스테레오 혼합 시 채널 정책 고정.
- AI 후보 stem을 영구 삭제해도 악보, 원곡, 사용자 take는 삭제하지 않아야 함.

## AI 모델 평가 프로토콜

- `Demucs 6-stem` 등은 기타 **전체**를 추출하는 비교 기준. 리드/리듬 2-way separation 성공을 의미하지 않습니다.
- 특화 분리 모델 후보는 별도 R&D 단계에서 교체 가능하게 설계. 모델 이름/성능/무료 이용 가능을 검증하지 않은 채 문서에 확정하지 않음.
- 직접 만든 두 기타 + 기타 외 반주 isolated stem을 합친 fixture로 품질 측정. 합성된 mixtures의 정답 stem과 비교.
- 검토 메트릭: SI-SDR, bleed/누출, artifact, 화음 변형, 시작/끝 offset, 반주 잔여 guitar bleed. 사용자 블라인드 A/B 검토 포함.
- 실제 곡에서 `solo over rhythm`, `twin lead`, `double-tracked rhythm`, `distorted power chords`, `same riff doubling`, `panned L/R` 사례별 품질 비교.
- 스테레오 좌우 패닝이 나뉜 녹음은 수동 channel isolation을 제공할 수 있으나, L/R가 곧 lead/rhythm이라는 보장은 없고 center bleed가 있을 수 있음.
- 분리 품질에 따라 자동 연주 판정을 오염시키지 않도록 사용자 연주 입력 경로와 소스 분리 경로를 독립적으로 유지.

## UI 사용자 문구

- 성공적으로 확인된 사용자 stem: `리드 기타 / 사용자 제공 음원`.
- AI 후보: `AI 추정 리드 기타 (직접 듣고 확인하세요)`.
- 지원 불가: `이 곡에서 리드와 리듬 기타를 정확히 구분할 수 없습니다. 개별 stem을 불러오거나 기타 전체 제거 반주를 이용할 수 있습니다.`
- `리드 기타만 제거` 버튼은 별도 stem 또는 검증된 모델 결과가 없으면 비활성.

## 수용/테스트

- 2개의 ScoreTrack을 독립 편집/선택해도 다른 트랙 음표는 변경되지 않음.
- 사용자 불러온 별도 guitar stems은 뮤트/솔로/라우팅과 반주 생성이 정확히 동작.
- 자동 분리 품질 검증 실패 시 강제 폴백, 알 수 없는 역할은 `UNKNOWN` 유지.
- 모델 라이선스 검증·네트워크 동의·옵트인 모델 설치 처리.

## 참고

- https://github.com/facebookresearch/demucs
- https://github.com/facebookresearch/demucs/issues/588
- https://developer.apple.com/articles/moises/
## 2026-10-20 사용자 WAV 보존 첫 후보

첫 슬라이스는 별도 존재하는 사용자 WAV의 역할 지정·관리용 복사/목록·단독 미리 듣기·재실행 보존입니다. 역할은 LEAD/RHYTHM/HARMONY/GUITAR_OTHER/UNKNOWN으로 직접 선택하며 원본 바이트/채널을 보존합니다.64MiB/10분 이하 mono/stereo PCM16·float32 WAV와20개/프로젝트를 지원하도록 검증합니다. 별도 imported_guitar_stems/UUID 파일로 AI set·RecordedTake·ScoreTrack과 독립적입니다. 상세 계약은 docs/12, 실제 구현/검사 결과는 PHASE-06B를 따릅니다. 믹서 gain/mute/solo/offset/파트 제외 반주 연결은 다음 슬라이스이며, 특화 AI 두 파트 분리는 여전히 미지원입니다.

## 2026-10-20 사용자 WAV 출력 연결 후보

USER_IMPORTED 파일을 같은 프로젝트 불변 UUID의 IMPORTED_STEM 믹스 레이어로 명시적으로 추가합니다. 기존 gain/mute/solo/수동 offset과 48kHz mono 출력·미리 듣기/새 WAV·설정 보존 경로를 재사용합니다. 자동 역할 추정·자동 정렬·리드 AI 분리 성공을 뜻하지 않습니다. 이번 범위는 출력용이며 실시간 오버더빙 준비/REC는 사용자 레이어가 있으면 차단합니다. 실제 구현/검사·수용 완료 여부는 docs/progress/PHASE-06B.md를 따릅니다.

## 사용자 WAV 연주 재생 후보 — 2026-10-20

출력/설정 보존 수용 뒤 기존 mixer의 명시적 준비·하단 재생 경로에 IMPORTED_STEM을 연결합니다. 저장 UUID로 읽되 내부 입력 종류를 AI STEM과 구분하고 기존 mute/solo/gain/offset·이탈/오류 정리를 재사용합니다. 새 모델·파트 추정/자동 정렬은 없습니다. 상세 계약/한계·실제 수용은 docs/12와 PHASE-06B를 따릅니다.

## 2026-10-20 특화 모델 검토와 안전한 폴백

| 검토 대상 | 확인한 지원 범위/제약 | 현재 처리 |
|---|---|---|
| Demucs htdemucs_6s/4.1.0 | 공식6-source의 guitar는 기타 전체이며 리드/리듬 출력이 아님 | 기존 GUITAR_FULL/ACCOMPANIMENT만 허용 |
| Sound Razor의 listra92 RoFormer 경로 | 로컬 리드 예측/입력에서 뺀 잔여음 경로가 있으나 제공 프로젝트도 원 학습 출처·가중치 재배포 조건 미확인이라고 명시 | 모델/코드 미다운로드·미설치, 채택 보류 |
| MVSep Lead/Rhythm Guitar | 공식 API에 해당 모델이 있으나 음원 업로드와 API 토큰을 사용하는 서비스 경로 | 로컬 기본 범위와 다르므로 미연결·음원 미전송 |

확인 출처(2026-10-20): [Demucs 공식 README](https://github.com/facebookresearch/demucs#separating-tracks), [Sound Razor 제공자의 모델/허가 안내](https://github.com/pedromtcosta/sound-razor), [MVSep 공식 API](https://www.mvsep.com/en/full_api). 공개 후보가 전혀 없다고 단정하지 않습니다. 이번 확인은 원문/메타데이터 검토이며 실제 후보의 Windows 오프라인 추론·정량 품질·허가 검증 완료를 의미하지 않습니다. 신규 다운로드나 개인 오디오 업로드는 하지 않았습니다.

특화 모델 채택은 이 의존성이 해결될 때까지 보류합니다. 현재 어댑터의 미지원 상태를 분리 도메인에서 선언하고 카피 화면에 사용자 WAV 불러오기/기타 전체 제거 잔여 반주의 폴백을 제공합니다. 기존 자동 분리의 LEAD/RHYTHM 가장 응답은 validator에서 거부합니다. 이 폴백 완료가 특화 AI 분리 완료는 아닙니다. 입력 판정과 독립적이므로 사용자 자동 진행 규칙에 따라 Phase7의 순수 판정 엔진 개발은 별도로 진행할 수 있습니다.

## 2026-10-24 후보 이용 조건/출력 재확인

- [Sound Razor 제공자의 현재 설명](https://github.com/pedromtcosta/sound-razor#lead-and-rhythm-guitar)은 listra92 checkpoint의 원 학습 출처/재배포 조건을 여전히 미확인으로 표시합니다. 코드를 MIT로 공개한 사실만으로 해당 가중치의 이용 조건까지 확인된 것으로 간주하지 않습니다. 예측 리드를 입력에서 뺀 잔여 출력이 독립적으로 정답인 리듬 stem이라는 보장도 없습니다.
- [HTDemucs guitar fine-tune 작성자의 모델 카드](https://huggingface.co/adityalakhani/htdemucs-6s-guitar-ft)는 여러 기타를 하나의 기타 stem으로 모으며 개별 레이어는 구분하지 않는다고 명시합니다. 전체 기타 후보일 뿐 Phase6B의 리드/리듬 요구를 해결하는 모델로 채택하지 않습니다. 카드의 기반 가중치/이용 조건 주장도 기존 검증을 자동 대체하지 않습니다.
- [MVSep 공식 API](https://www.mvsep.com/en/full_api)는 API token과 오디오 제출 경로를 사용합니다. 기본 로컬 정책을 변경하거나 개인 파일을 업로드하지 않았습니다.

이번 재확인은 문서 검토만 수행했습니다. 모델/코드 다운로드·설치/추론/실제 두 기타 정답 비교는 **미실행**이고 특화 AI·전체 Phase6B는 계속 미완료입니다. 사용자 제공 파일의 로컬 믹스/녹음과 기존 전체 기타 분리는 유지합니다.

## 2026-10-31 특화 후보와 출처 재확인

| 후보/근거 | 이번에 확인한 내용 | 채택 전 남은 조건 |
|---|---|---|
| [Sound Razor 작성자 README](https://github.com/pedromtcosta/sound-razor/blob/d59c0e0aa48993b40ac4bbc15810240a420434ea/README.md) | listra92 모델은 리드를 예측하고 입력에서 이를 뺀 값을 리듬으로 제공합니다. 작성자는 가중치의 원 학습 출처와 재배포 조건을 여전히 미확인으로 설명합니다. | 별도 가중치 이용 조건·독립 리듬 정답 비교. 코드 MIT만으로 가중치 허가를 대신하지 않음 |
| [배포 목록의 HTDemucs4 후보](https://huggingface.co/noblebarkrr/mvsepless_resources/blob/90c5baab074bf5984263c3df9c0fd1b5b3286222/models.json) | `demucs4_lead_rhythm_guitar_drypaint`가 HTDemucs/lead·rhythm 출력으로 등록돼 있습니다. 이는 목록 제공자의 설명이며 원저자의 지원·품질 보증으로 확대하지 않습니다. | 원저자 배포 경로/가중치 조건·실제 파일 무결성/안전한 로딩·Windows 호환성·정답 품질. [배포 저장소 첫 화면](https://huggingface.co/noblebarkrr/mvsepless_resources)에는 모델 카드가 없음 |
| [HTDemucs guitar fine-tune 작성자 카드](https://huggingface.co/adityalakhani/htdemucs-6s-guitar-ft#limitations) | 여러 기타를 하나의 기타 출력으로 모으며 개별 기타 레이어를 분리하지 않는다는 제한이 유지됩니다. | Phase6B의 두 역할 분리 요구를 해결하는 후보로 선정하지 않음 |
| [MVSep 공식 API](https://www.mvsep.com/en/full_api) | 모델101에 lead/rhythm과 1단계/2단계 옵션이 있습니다. API token 및 오디오 제출이 필요한 서비스입니다. | 별도 클라우드 범위/전송 동의가 없는 현재 로컬 경로에 연결하지 않음. 서비스 자체 지표를 GuitarLab 측정값으로 사용하지 않음 |

결론은 **후보 존재 확인, 제품 채택 보류**입니다. 로컬 두 파트 모델이 전혀 없다고 단정하지 않으며 커뮤니티 목록만으로 이용 허가·성능을 확정하지 않습니다. 이번에는 공개 문서/메타데이터만 읽었고 가중치·외부 실행 코드를 내려받거나 설치·실행하지 않았습니다. 개인 음원 전송, 모델 변경, 새 GUI 조작도 없습니다. 특화 모델의 조건과 별도 다운로드 요청이 확보되면 고정 가중치 검증 → 격리 환경 호환성 → 자체 두 기타 정답 비교 → 명시적 청취/역할 승인 순으로 진행합니다. 기존 사용자 WAV와 GUITAR_FULL/ACCOMPANIMENT 폴백은 유지합니다.
