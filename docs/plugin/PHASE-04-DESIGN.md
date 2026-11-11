# Phase 4 설계안 — Freeze / Bounce / Export / Overdub (초안, 2026-11-07)

명세 `GuitarLab-AmpliTube5-Cakewalk-Style-VST3-Integration.md`의 Phase 4(UC-4·UC-5, 9.2, T08·T10~T12)를 지금 저장소(Phase 0~3 결과, D1 WASAPI·D2·D3 인스턴스 하나)에 맞춘 설계입니다. 결정은 5절에 기록했습니다.

## 0. 지금 있는 것(다시 만들지 않음)

| 명세 항목 | 현재 |
|---|---|
| Export Dry DI | 있음: `export_recording`(테이크 `dry.wav`를 새 파일로, 저장 창·StorageJob) |
| 믹스 Export | 있음: `export_project_mix`(48kHz mono, TAKE·로컬 음원·분리 음원·가져온 기타 파일 레이어) |
| LEAD/RHYTHM DI 독립 녹음·오버더빙 정렬 | 있음: 테이크마다 독립 `dry.wav`, `referenceTakeIds`, 4B 오버더빙 재생 |
| 실시간 톤으로 테이크 듣기 | 있음(2B): 테이크 하나를 모니터 경로에서 AmpliTube로. **모니터가 AmpliTube로 켜져 있어야 함** |
| 톤 저장 | 있음(3B): 프로젝트당 상태 하나 |

## 1. 핵심 아이디어: Freeze가 "트랙별 톤"을 만든다

인스턴스가 하나(D3)라 트랙마다 다른 톤을 동시에 실시간으로 걸 수 없습니다. Cakewalk에서도 CPU를 아끼려고 Freeze를 쓰듯, **Freeze = 그 테이크를 지금 톤으로 미리 처리해 둔 캐시 WAV**로 두면:

- LEAD를 톤 A로 Freeze → 톤을 B로 바꿔 RHYTHM을 모니터·녹음 → 재생 시 LEAD는 캐시(톤 A), RHYTHM은 실시간(톤 B). UC-4 해결.
- Freeze된 테이크는 **모니터를 켜지 않아도** 기존 WebView 재생으로 처리된 소리가 납니다(2B의 "모니터 필요" 제약이 없어짐).
- 믹스 Export에 Freeze 캐시를 넣으면 "처리된 소리로 내보내기"가 됩니다(T12).

## 2. 렌더(Freeze·Bounce 공통)

- **오프라인 렌더**(권장): 같은 AmpliTube 인스턴스를 소유 스레드에서 잠그고 테이크 DI를 128프레임씩 실시간보다 빠르게 처리합니다. Phase 0에서 오프라인 처리가 동작함을 확인했습니다. 인스턴스가 하나이므로 **모니터가 꺼져 있어야** 합니다(켜져 있으면 `MONITOR_IN_USE`로 거부).
- 처리 전 무음 0.5초를 넣고 버려 모니터 때 남은 잔향을 지웁니다. 앞쪽은 플러그인 지연(`latency_samples`)만큼 잘라 DI와 시점을 맞춥니다. 뒤쪽 tail은 무음을 계속 넣어 출력이 -90dBFS 아래로 0.5초 유지되면 끝냅니다(최대 10초).
- 출력은 AmpliTube 그대로 stereo, 테이크 샘플레이트, float32 WAV. 최대 10분(기존 테이크 상한)이라 최대 약 230MB입니다.
- StorageJob(진행률·취소)으로 돌리고, 임시 파일에 다 쓴 뒤 원자적 이동합니다. 실패·취소 시 임시 파일만 지우고 DI·기존 캐시는 그대로입니다.
- 실시간 렌더 fallback(명세 9.2)은 오프라인 결과가 실시간과 다를 때만 필요합니다. 첫 단계에서는 오프라인 결과와 실시간 모니터 출력을 같은 입력으로 비교하는 검사를 넣고, 다르면 그때 추가합니다.

## 3. 저장

- 파일: `projects/<project-id>/renders/<render-id>.wav`(새 폴더, 기존 파일 경로 규칙과 같은 검사).
- DB 12(새 표 하나 `take_renders`): `id, project_id, take_id, kind('FREEZE'|'BOUNCE'), relative_path, wav_sha256, frames, sample_rate, channels, take_sha256, plugin_class_id, plugin_version, state BLOB(렌더에 쓴 톤), state_sha256, latency_frames, tail_frames, created_at_ms`. 테이크당 FREEZE는 하나.
- 유효성: 테이크 SHA·파일 SHA가 맞을 때만 씁니다. 톤을 나중에 바꿔도 Freeze는 "그때 톤으로 고정"이라 무효로 보지 않습니다(그래서 렌더에 쓴 톤 blob을 함께 저장).
- 영구 삭제·백업·휴지통은 기존 프로젝트 규칙에 이 표·폴더를 더합니다.

## 4. 기능

| 기능 | 동작 |
|---|---|
| Freeze | 테이크 줄 FX 랙의 "Freeze" → 오프라인 렌더 → 그 줄 ❄ 표시, 재생은 캐시. Freeze 중에는 그 줄의 "AmpliTube로 재생"을 끔(이중 처리 방지, 명세 9.2) |
| Unfreeze | 캐시를 쓰지 않고 DI로 돌아감. "Freeze 때 톤 불러오기" 버튼으로 저장된 톤을 AmpliTube에 넣을 수 있음 |
| Export Processed | Freeze된 테이크(또는 Bounce)를 기존 저장 창으로 새 WAV에 내보내기 |
| 믹스 Export | Freeze된 TAKE 레이어는 캐시를 씀(내보내기 결과에 "처리됨" 표시) |
| Bounce to New Track | 렌더를 영구 새 트랙으로(아래 결정) |

## 5. 결정(2026-11-07 사용자)

- 렌더: **오프라인 렌더**(모니터를 끈 뒤).
- 저장: **DB 12 승인**(`take_renders` + `renders/`), **Unfreeze 시 캐시 삭제**(그 전에 "Freeze 때 톤 불러오기" 제공).
- Bounce: **믹스 새 레이어 `RENDER`**.
- 순서: **4A Freeze → 4B Export Processed → 4C Bounce**.

아래는 결정 전에 제시한 선택지입니다.

1. **렌더 방식**: 오프라인(빠름, 모니터 꺼야 함, 권장) / 실시간 렌더(테이크 길이만큼 걸림, 모니터와 같은 경로).
2. **저장**: DB 11 → 12(새 표 `take_renders`)와 `renders/` 폴더(테이크당 최대 약 230MB). Unfreeze 때 캐시 파일을 지울지(권장: 지움, DI로 다시 만들 수 있음) 남길지.
3. **Bounce 새 트랙 형식**: 믹스에 새 레이어 종류 `RENDER`를 추가(권장, `take_renders` 재사용) / 가져온 기타 파일 표에 `origin='BOUNCED'`를 추가(표 재작성 migration 필요).
4. **진행 순서**: 4A Freeze/Unfreeze + 재생·믹스 Export 반영 → 4B Export Processed → 4C Bounce(권장) / 한 번에.

## 5-1. 4A 구현 중 바뀐 점(2026-11-07)

- 렌더 전 **정착 확인**을 더했습니다. AmpliTube가 로드·톤 변경 직후 약 1초 동안 다른 소리를 내기 때문입니다(실측 RMS 0.955 → 0.252). 탐침 RMS가 250ms 간격 7번 연속(1.5초) 0.5dB 폭 안이면 렌더하고(2026-11-11 리뷰 R11-1로 세 번에서 강화: 로드 직후 0.5초의 안정 구간을 정착으로 오인하지 않게), 최대 약 8초 뒤엔 그대로 진행합니다.
- 앞 무음은 0.5초가 아니라 **1초**(탐침 잔향까지 비움). 오프라인 렌더 경로도 실시간처럼 매 블록 출력 버퍼를 비웁니다.

## 6. 검사 계획(명세 T08·T10~T12)

- 단위: 지연 자르기·tail 끝 판정·원자적 저장·취소 시 임시 파일 정리·SHA 불일치 거부·이중 처리 방지.
- 실제 AmpliTube(ignored 검사): 같은 DI를 오프라인 렌더와 실시간 DSP 경로로 처리해 결과 비교, Freeze 후 DI 파일 SHA 불변.
- 앱: Freeze → 모니터 없이 재생 → Unfreeze → 믹스 Export, DB·DI 불변 확인. 청취는 MANUAL-CHECKS.

## 7. 4D 설계안 — Bounce 삭제·관리(초안, 2026-11-08)

### 지금 문제

- Bounce 파일은 영구 보존이라 지울 방법이 없고, 프로젝트당 20개 한도를 채우면 더 만들 수 없습니다.
- 믹스에서 "레이어 제외"로 뺀 Bounce는 다시 넣을 화면이 없어 보이지 않는 파일로 남습니다.
- 저장된 믹스가 가리키는 Bounce를 지우면 다음 믹스 준비·내보내기가 `BOUNCE_NOT_FOUND`로 실패합니다.

### 제안

- 믹스 패널에 **Bounce 목록**: 프로젝트의 Bounce마다 원본 테이크 이름·AmpliTube 버전·길이·만든 시각, "믹스에 넣기"(지금 믹스에 없을 때), "삭제".
- `delete_take_bounce({request:{schemaVersion:1,projectId,renderId}})` → `{schemaVersion:1,projectId,renderId,removed}`. 행을 지운 뒤 파일을 지웁니다(원본 DI·Freeze·톤은 그대로). 멱등.
- 저장된 믹스가 그 Bounce를 쓰면(아래 결정 1) 처리합니다. 화면의 지금 믹스(저장 전)에 그 줄이 있으면 삭제와 함께 빼고 안내합니다.
- 삭제 전 확인 창: "Bounce 파일을 지웁니다. 되돌릴 수 없습니다(원본 테이크는 그대로라 다시 Bounce할 수 있음)."

### 결정(2026-11-08 사용자)

1. 저장된 믹스가 쓰는 Bounce는 **삭제 거부**(`BOUNCE_IN_USE`, 먼저 믹스에서 빼고 저장).
2. **확인 후 영구 삭제**(앱의 기존 방식처럼 화면 안 확인 줄).
