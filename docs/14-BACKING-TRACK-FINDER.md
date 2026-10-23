# 14. Backing Track Finder — 연주용 반주 검색 및 연결

> 상태(2026-10-20): URL 직접 입력/공식 보이는 임베드·API 상태·시간·창 전환 중지/임시 TAB 커서·열기 버튼 수정 사용자 수용 완료. 영상 ID 저장/복원 및 별도 맞춤 프로필 저장/복원·v7 적용/기존 데이터 보존 자동 검사 완료, 실제 저장 UI/맞춤 재실행 수용은 대기. 검색 API는 미구현. 대상: 연주 모드. 연결 문서: `02`, `03`, `04`, `10`, `12`, `15`, `16`, `17`.

> 2026-10-20 수용 갱신: 영상 맞춤 저장·다시 읽기와 앱 재실행 후0/10초 복원까지 사용자 확인했습니다. 위 저장 수용 대기는 이전 이력이며 현재 검색 인증 방식 결정이 필요합니다.

> 최신 결정: 사용자가 API 키 발급의 사용 부담을 지적해 URL 붙여넣기를 기본으로 확정했습니다. 본인 키 방식은 구현 전 취소, 내부 자동 검색/키 관리·서버는 후속 선택 기능으로 보류합니다. 현재 URL/공식 플레이어·IFrame 시간/TAB 맞춤 저장·복원은 API 키 없이 사용하며 키 설정을 요구하지 않습니다. 아래 검색 설계·인증 선택지는 미래 요구/검토 이력입니다.

## 목적 및 기본 원칙

- 이미 가지고 있는 기타 악보(곡 제목, 아티스트, 악보 트랙)를 바탕으로 사용자가 연주할 기타 파트가 없는 반주를 찾아 재생합니다.
- **경로 A: 로컬 반주**: 사용자가 소유·사용 허가를 받은 멀티트랙 또는 AI 분리 산출물을 선택하여 앱 자체 PlayerEngine에서 재생합니다.
- **경로 B: YouTube 검색**: YouTube Data API로 후보를 검색하고 공식 IFrame Player API로 **보이는 플레이어에서** 시청·재생합니다.
- YouTube 영상의 오디오 다운로드, 추출, 분리, 변형, 대체 트랙 입히기, 사용자 동의 없는 캐시는 **구현하지 않습니다**. AI 분리는 유효한 권리의 **로컬 음원만** 대상으로 합니다.
- 검색 결과가 제목과 맞아도 해당 기타 파트가 실제로 빠졌다는 **보장은 없습니다**. 사용자가 미리 보고 확인하여 선택합니다.

## 악보 기반 검색 UX

1. 악보 import 또는 프로젝트 생성. 제목·아티스트 자동 읽기, 잘못된 경우 수정 가능.
2. 사용자가 연주 트랙 `Lead Guitar`, `Rhythm Guitar`, `Guitar 3` 등 **악보에 존재하는 트랙 중 하나**를 선택.
3. `반주 찾기` 클릭 → 로컬 반주 우선 표시 + YouTube 검색 탭. 예시 검색어:
   - `"곡명" "아티스트" guitar backing track no lead guitar`
   - `"곡명" "아티스트" rhythm guitar backing track no rhythm guitar`
   - `"곡명" "아티스트" instrumental guitarless backing track`
4. 검색 후보에 제목·채널·길이·썸네일·YouTube 링크 및 **원본 플랫폼의 명시적 표시**. `no lead guitar` 등의 문구는 제작자 주장이지 검증 결과가 아님.
5. 영상은 정식 임베드 플레이어로 미리듣기. 사용자가 곡, BPM/튜닝, 연주 대상 파트와 일치 여부 확인.
6. 프로젝트에 `YouTube videoId`, 검색어, 사용자 선택 결과, 개인별 sync anchor 저장. 영상 자체를 저장하지 않음.
7. 재생 실패/비공개/임베드 제한/네트워크 오류 시 로컬 반주 선택 안내. 무단 우회나 다운로드 대체 경로 금지.

## 동기화와 재생의 한계

- `BackingSource` 타입: `LOCAL_ASSET | YOUTUBE_EMBED`. 두 소스는 서로 다른 capabilities를 가집니다.
- 로컬 오디오: 앱에서 지원하고 실제 검증된 기능 범위 내에서 믹서, 연습 속도, 루프, 파형, 분석, 녹음과의 정밀 재생 동기화 지원.
- YouTube: 공식 플레이어의 play/pause/seek/time/currentState 등 **허용 API 기능만** 사용. 재생 위치 폴링을 통한 TAB 커서 표시와 사용자 **수동 싱크 보정** 제공.
- YouTube 재생과 오디오 인터페이스 입력은 서로 다른 clock이며 buffering/광고/seek/network jitter 영향이 있음. 따라서 **정밀 리듬게임 채점을 기본 지원한다고 가정하지 않습니다**. 플랫폼·기기별 PoC와 지연 검증 전에는 `정밀 채점 불가` 안내/비활성화 또는 별도 메트로놈 기반의 비점수 연주 모드 사용.
- YouTube에 앱의 로컬 대체 오디오를 덧입히거나 자체적으로 재생하는 방식으로 영상 내용을 변형하지 않습니다. 유튜브 오디오 믹스 파일로 저장 금지.
- 사용자 카운트인은 로컬 반주에서는 가능, YouTube에는 정확한 시작 제어 보장을 하지 않음.
- 프로젝트 전체의 기준 `audioTimeMs`는 소스별 adapter에서 추상화하되, 시간의 신뢰도와 정밀도를 명시합니다.

## 최소 API 계약

```ts
type BackingSource =
  | { kind: 'LOCAL_ASSET'; assetId: string; sourcePartPolicy: 'NONE'|'EXCLUDE_SELECTED'|'MIX_SELECTED' }
  | { kind: 'YOUTUBE_EMBED'; videoId: string; selectedByUser: true; estimatedDurationMs?: number };

type BackingCapability = {
  canSeek: boolean;
  canPreciseLoop: boolean;
  canTimeStretch: boolean;
  canAnalyzeAudio: boolean;
  canRecordBackingToFile: boolean;
  syncPrecision: 'SAMPLE_CLOCK'|'BEST_EFFORT';
};
```

- `YOUTUBE_EMBED`의 `canAnalyzeAudio`, `canRecordBackingToFile`, `canPreciseLoop`는 `false`; `syncPrecision='BEST_EFFORT'`.
- UI에서는 capability 기반으로 조절 버튼과 상태를 활성/비활성화하고 사유를 설명합니다.

## 오류·보안·테스트

- API 키는 프론트엔드/클라이언트 앱에 무방비로 하드코딩하지 않음. 로컬 배포에서 검색 인증, 할당량, 키 노출 위험을 별도 검토. 안전한 인증·프록시 부재 시 YouTube 검색 자동화 대신 **사용자가 video URL을 입력해 공식 임베드로 여는 최소 모드**부터 구현 가능합니다.
- `YT_SEARCH_UNAVAILABLE`, `YT_EMBED_DISABLED`, `YT_SYNC_UNCERTAIN`, `BACKING_NOT_FOUND`, `BACKING_MEDIA_MISSING` 오류 명세.
- 테스트: 메타데이터 누락/동명이곡/여러 기타/검색 0건/접근 불가/네트워크 종료/seek drift/YouTube recording leakage 없음.
- 테스트 fixture는 자체 제작 메타데이터로 대체. CI에서 YouTube 이용 약관 위반/자동 대량 스크랩 금지.

## 참고

- https://developers.google.com/youtube/v3/docs/search/list
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/terms/developer-policies

## 2026-10-19 URL 우선 첫 구현

API 키 보호 수단이 없어 사용자 URL의 공식 수동 iframe 경로를 먼저 구현합니다. 동의 전 연결하지 않고 원격 script를 앱 origin에서 실행하지 않으며 frame-src만 정확한 YouTube 호스트로 허용합니다. 로컬 transport/REC/정밀 채점/믹스와 분리하고 화면 이탈·숨김·표시 밖/창 비활성화 시 제거합니다. 영상 내부 오류를 앱이 자동 감지하지 못하며 실제 WebView 재생/Referer 검증은 미실행입니다. 검색/메타데이터 영구 저장/수동 앵커·악보 싱크는 미구현입니다. 현재 결과/제약은 progress/PHASE-06A.md를 따릅니다.

### 2026-10-19 실제 URL 재생 수용과 조작 개선

사용자가 Windows 후보의 실제 영상·소리를 정상 확인했습니다. 별도 체크박스 대신 전달 정보·개인정보/약관 안내 앞의 ‘안내에 동의하고 YouTube 열기’ 클릭으로만 연결하도록 소스를 간소화합니다. 입력만으로 연결하거나 화면 복귀 시 자동 재생하지 않습니다. 기존 수용 창은 유지하며 다음 후보에 반영합니다. 새 버튼 수동 조작/모든 영상의 오류/네트워크 단절·최소화는 미실행입니다. 이전 절의 재생 미실행 표기는 수용 전 이력이며 최신 결과는 progress/PHASE-06A.md를 따릅니다.

### 2026-10-19 구현 경계 갱신

프로젝트 영상 ID의 로컬 저장/명시적 해제·입력칸 복원과 SQLite v6 적용/기존 데이터 보존을 자동 검증했습니다. 공식 API 상태·시간 관측 후보는 loopback 별도 origin의 고정 wrapper/remote ACL 거부와 엄격한 message 계약을 사용하며 명시적 ‘재생 상태·시간 확인 (검증)’ 선택으로만 연결합니다. 실제 서비스/WebView 시계 수용은 미실행, 기존 수동 플레이어의 영상·소리 수용은 완료입니다. API 시간은 BEST_EFFORT이고 악보/입력/REC/채점·믹스에 연결하지 않습니다. 검색·수동 앵커·TAB 싱크는 후속이며 최신 상태는 progress/PHASE-06A.md를 따릅니다.

### 2026-10-19 창 전환 동작 보완

API 검증 mode는 blur/숨김/플레이어 표시 밖에서 공식 pauseVideo를 요청하고 실제 중지 상태 확인 후 영상/위치를 보존합니다. 복귀 자동 재생은 없고 공식 player의 ▶로 수동 재개합니다. 확인 timeout이면 제거하고 수동 mode·화면 이탈/오프라인/REC의 제거는 유지합니다. 실제 서비스 수용 전 검증 표시를 유지하며 상세 계약은 docs/12 최신 절을 따릅니다.

### 영상 수동 맞춤의 화면 임시 미리보기

열린 악보가 있는 API 검증 mode에서 영상/TAB를 나란히 표시하고 두 진행 마디와 영상 초를 수동으로 지정할 수 있습니다. 반복을 펼친 진행 번호와 마지막+1의 악보 끝을 사용하며 실제 관측 시간으로 커서를 표시합니다. 버퍼링/지연/다른 영상/맞춤 구간 밖에서는 숨기고 점수/REC/원래 local syncAnchors에는 연결하지 않습니다. 공식 getVideoUrl로 현재 영상 ID를 확인하는 관측 v2를 사용하며 원래 선택 ID로 대신 채우지 않습니다. 화면 임시 기능으로 닫기/화면 이탈 시 소실되고 영구 저장은 후속입니다. 후보 자동 검사만 완료했으며 실제 커서 수용은 대기입니다.
### 2026-10-20 영상 맞춤 영구 보존 후보

임시 커서/열기 버튼 즉시 활성화는 사용자 수용했습니다. 추가 저장 후보는 같은 프로젝트·불변 악보 버전·영상·트랙의 두 지점만 보존하고, 영상 정보를 준비한 뒤 ‘저장 맞춤 다시 읽기’로 복원합니다. 프로젝트 악보를 새로 저장하면 다른 버전으로 구분하므로 과거 맞춤을 자동 적용하지 않습니다. 원래 local syncAnchors를 바꾸거나 YouTube에 접속 동의/자동 재생 상태를 저장하지 않습니다. 현재 후보의 자동 검사/실제 적용·수용 상태는 progress/PHASE-06A.md를 따릅니다. 검색/다중 지점/정밀 채점은 미구현입니다.

## 2026-10-20 다음 검색 슬라이스의 인증 의존성

공식 [Data API 시작 문서](https://developers.google.com/youtube/data/getting-started)는 Google 프로젝트/인증 설정을 요구하며, [키 관리 지침](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices)은 키 제한·클라이언트 코드/저장소에 공유 키를 넣지 않는 방침을 안내합니다. [search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list)는 공식 API로만 호출하고 할당량/인증 오류를 표시해야 합니다. 할당량은 Google 프로젝트 설정과 최신 정책에 따르며 과거 고정 수치를 무조건 적용하지 않습니다.

현재 저장소에는 검색 어댑터/인증 설정·보호 서버가 없습니다. 타인의 키/계정이나 사용자 환경의 비밀을 탐색해 가져오지 않습니다. 기존 URL 입력/영상 ID·맞춤 보존은 키 없이 계속 사용할 수 있습니다. 아래는 **구현 전 방향 후보**이며 새 인증 기능/검색이 완성됐다는 뜻이 아닙니다.

1. **개인용/오픈소스의 각 사용자 본인 키 방식(제안)**: 사용자가 자신의 Google 프로젝트에서 발급·YouTube API로 제한한 키를 앱 설정에 직접 입력합니다. native 전용 Windows 보호 저장·삭제와 설정 여부만 조회, 프론트 영구 저장/DB/로그/배포물에 키를 포함하지 않는 경계부터 검증합니다. 공유 개발자 키를 배포하지 않습니다. 본인 계정의 할당량을 쓰며 로컬 PC 소유자가 자신의 키에 접근할 수 없다고 보장하지 않습니다. 키는 채팅으로 받지 않습니다.
2. **공유 서비스 검색 서버**: 서버가 키를 보유하고 인증/남용 방지·사용자/전체 할당량·HTTPS/운영을 담당합니다. 실제 서버 주소/운영 주체·설정이 필요합니다. 동의 없는 외부 서비스 배포/계정 생성은 하지 않습니다.
3. **앱 내부 검색 보류**: 현재 URL 경로를 유지하고 미구현을 명시한 채 영향 없는 다음 로드맵 작업을 진행합니다. Phase6A 검색 완료로 체크하지 않습니다.

방향 결정 뒤 docs/12 계약→native 키/통신 경계→악보 제목/아티스트·선택 역할의 검색어/공식 후보→사용자 명시적 선택·기존 플레이어 연결 순서로 한 슬라이스씩 구현합니다. 입력/응답 크기·타임아웃/취소·인증 실패/쿼터/오프라인·키 로그 누출 없음과 실제 검색을 검증합니다. 공식 검색 결과의 파트 제외 여부는 제작자 주장으로 표시하고 기타 분리를 보장하지 않습니다.
