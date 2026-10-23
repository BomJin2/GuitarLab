# 10. 보안 · 개인 정보 · 저작권 · 라이선스

2026-10-21 자체 자산 연결 후속: 주 창의 connect-src에 'self'를 추가해 내장 악보·합성 음원 fetch를 허용합니다. 기존 IPC 주소 외의 외부 HTTP/HTTPS origin·wildcard를 허용하지 않습니다. 별도 YouTube wrapper의 connect-src 'none'·원격 IPC 거부/명시적 영상 연결 정책은 유지합니다. 이는 개인 파일 네트워크 전송이나 시스템/YouTube 캡처 허가가 아닙니다. 실제 첫 악보 읽기 실패와 수정 전후 회귀·사용자 수용은 PHASE-08 최신 기록을 따릅니다.

## 배포 런타임의 지원 종료 확인 — 2026-10-18

공식 PEP619/릴리스 안내에서 Python3.10의2026-10-01 지원 종료를 확인했습니다. 기존 로컬 개발 검증과 별개로 현재3.10 환경을 독립 배포용으로 그대로 번들하지 않습니다. Basic Pitch의 Python3.11 이상 의존성 조건도 달라 기존 cp310 lock/실행 파일만 단순 교체하지 않습니다. 기존 프로젝트·환경은 보존하고 지원 중인 Python의 별도 AI 런타임 검증 방향을 확인합니다. 근거·권고·새 다운로드/ABI 계획과 Sidecar 미실행 범위는 [docs/18](18-AI-RUNTIME-MIGRATION.md)에 기록했습니다.

## 앱 내 Basic Pitch 설치 경계 — 2026-10-18

설치 버튼은 고정 모델과 계약 버전만 받으며 임의 경로/URL/shell을 받지 않습니다. 기존 hash 검증 캐시·고정 wheel lock·현재 Python 번들의 해시 검증 setuptools만 오프라인 설치합니다. 준비/검증/게시 worker는 하위 프로세스를 만들지 않고 native가 고정 pip 직접 자식의 취소/시간 제한/종료를 관리합니다. 개인 음원 대신 SHA가 알려진 자체 음원만 설치 검증에 사용합니다. 새 UUID만 정리하고 기존 활성 환경/프로젝트는 보존합니다. 설치 중 정상 창 닫기 제한과 정리 오류 표시를 적용하며 OS 강제 종료 뒤 자동 복구는 아직 미구현입니다. 기존 모델 라이선스/배포물 제외 정책은 유지합니다.

## 사용자 파일/개인 정보

- 오디오 녹음·프로젝트 파일·연습 기록은 개인 데이터로 취급합니다. 로컬 저장 기본, 별도 동의 없는 서버 업로드 금지.
- 음원/마이크 신호를 원격 분석 API에 전송하지 않습니다. 향후 클라우드 기능 추가 시 명시적 opt-in 및 상세 정책 필요.
- 오디오 캡처는 연습 시작/튜너 기능이 활성화된 경우에만; 중지 시 스트림 닫고 마이크 사용 표시.
- 크래시/진단 로그에서 원본 녹음, 음원 메타데이터/사용자명 경로, 프라이빗 파일명은 제외 또는 마스킹.

## 파일 시스템 보안

- Tauri의 최소 capability/permission. 임의 shell/임의 경로 쓰기 권한 금지.
- file picker로 선택한 파일은 검증된 경로만 처리; 사용자 파일을 임의 디렉터리로 추적·탐색하지 않습니다.
- 외부 media 디코더/모델 패키지 취약점, 압축폭탄, path traversal, symlink를 고려합니다.
- 모델 다운로드에 SHA-256 체크 및 제공자 URL 확인. 다운로드는 사용자가 요청했을 때만 실행.
- Python sidecar stdin에는 제한된 명령/인자를 전달하고, 사용자 지정 임의 Python 코드 또는 shell string 실행 금지.

## 저작권 원칙

- 사용자는 자신이 권리를 가지고 있거나 허가 받은 음원/악보를 개인적으로 가져오는 것을 기본 사용 사례로 합니다.
- 앱이 상업곡의 악보/음원 다운로드·크롤링·서버 공유를 제공하는 것으로 기획하지 않습니다.
- AI 분리 및 MIDI 생성 기술이 법적 사용 권한을 자동으로 부여하지 않습니다.
- 곡 파일, 모델 데이터, 악보를 외부에 공유/배포하는 기능을 추가할 때는 국가별 저작권·음악 퍼블리싱 조건을 별도 검토합니다.

## 외부 라이선스 검토 예시 (최종 확인 필수)

| 프로젝트 | 알려진 라이선스/주의 | 후속 확인 |
|---|---|---|
| Tauri | 프로젝트/플러그인별 라이선스 확인 | 설치 플러그인 고지 포함 |
| alphaTab | MPL-2.0 | 해당 소스 수정/배포 의무 및 저작권 고지 |
| Spotify Basic Pitch | Apache-2.0 | 모델·코드 고지 및 의존성 추가 검토 |
| audio-separator | MIT | 개별 UVR/분리 모델 가중치 출처/허가 확인 |
| Pretendard | 폰트 배포 라이선스 확인 | 파일을 포함할 때 고지 및 조건 검증 |

> 별도 모델의 가중치 라이선스와 라이브러리 코드 라이선스는 다를 수 있습니다. 배포 가능성은 각각 확인해야 합니다.

## 출시 전 보안 점검

2026-10-18 개발 설치 bootstrap: 현재 Python3.10.8 ensurepip의 setuptools63.2.0 wheel(1,228,000바이트·SHA0d33c374d41c7863419fc8f6c10bfe25b7b498aa34164d135c622e52580c6b16)을 검증해 오프라인 설치에 사용합니다. 내장 LICENSE의 MIT 조건과 METADATA의 Python>=3.7을 확인했고 현재3.10.8 환경에서 실제8음 추론을 통과했습니다. 이는 최신 버전/출시 환경 선정 완료를 뜻하지 않으며 배포 전 기존 의존성 고지·호환성 검토를 유지합니다.

- [ ] 모든 Tauri command의 입력 스키마 및 디렉터리 제한 검사.
- [ ] Python 프로세스 stdout JSONL 검증/timeout/취소.
- [ ] 불필요한 네트워크 호출 없음.
- [ ] 수집하는 개인 데이터와 로컬 삭제 방법 UI 설명.
- [ ] 제3자 라이선스 목록, attribution, 모델 출처와 파일 다운로드 안내.
- [ ] 사용자 프로젝트 백업/삭제/복구 처리.

## v0.2 YouTube 및 녹음 개인정보 보호

- YouTube 검색은 공식 Data API, 영상은 공식 **화면에 노출된** IFrame Player API로만 재생합니다. 다운로드/오디오 추출/비디오 분리/AI 변환/오디오 대체/재녹음/자체 믹스 출력·백그라운드 플레이를 구현하지 않습니다.
- YouTube 반주의 title, channel, videoId, 선택 시각, 사용자가 설정한 수동 sync anchor 등 **메타데이터**만 로컬 저장하고 영상/음성을 캐시하지 않습니다.
- YouTube API 키 하드코딩·클라이언트 비밀 유출과 quota abuse에 유의. 키 보호 수단이 없으면 사용자 URL 붙여넣기 방식과 공식 임베드만 우선 지원.
- 녹음은 **명시적 opt-in** 및 로컬 입력 장치만. SYSTEM_AUDIO/LOOPBACK 캡처 source 미지원. 사용자 녹음·프로젝트 export는 내보내기 동작과 대상을 확인받습니다.
- 합법적인 로컬 backing과 사용자 연주 녹음만 WAV 믹스 export. 온라인 영상과 음원을 혼합/기록한 파일은 제공하지 않습니다.
- 녹음과 테이크는 개인정보일 수 있습니다. 로컬 삭제·백업·복구 UI 지원, 텔레메트리·업로드 기본 차단, 로그에서 녹음/사용자 경로 제거.
- AI 모델과 서비스(특히 2-guitar separation)는 코드와 **가중치/상용 사용 조건**을 별도 검토하고 출처·라이선스 고지.
- 공식 정책: https://developers.google.com/youtube/terms/developer-policies

## Phase 4 저장 후보 의존성 확인 — 2026-10-14

| 실제 선택 버전 | 패키지 라이선스 | 용도와 확인 범위 |
|---|---|---|
| rusqlite 0.40.2 | MIT | SQLite migration/트랜잭션. bundled 기능으로 후보 컴파일·저장 회귀 검사 성공 |
| sha2 0.11.1 | MIT OR Apache-2.0 | 원본/악보 revision/기록 SHA-256 무결성 확인. Rust 최소1.88 metadata 확인 |
| tauri-plugin-dialog 2.8.2 | MIT OR Apache-2.0 | 사용자 승인 파일 선택 창. 안정2.x 및 Rust 최소1.90 metadata 확인, Tauri2.12.3/Rust1.98 후보 컴파일 성공 |

버전은 Cargo lockfile과 설치된 패키지 metadata를 기준으로 확인했습니다. Rust1.90에서 직접 실행한 검사는 미실행입니다. dialog npm SDK나 임의 파일 경로/shell 실행 권한은 추가하지 않았으며 원본은 사용자 선택 파일만 읽습니다. managed copy/reference와 재연결은 원본 및 기존 복구본을 덮어쓰거나 삭제하지 않습니다. 전이 의존성·번들 SQLite를 포함한 출시 배포 고지는 Phase 8의 최종 검사에서 작성합니다.

공식 버전 자료: [rusqlite 0.40.2](https://docs.rs/crate/rusqlite/0.40.2), [sha2 0.11.1](https://docs.rs/crate/sha2/0.11.1), [tauri-plugin-dialog 2.8.2](https://docs.rs/crate/tauri-plugin-dialog/2.8.2).

## Phase 6 분리 후보 사전 확인 — 2026-10-17

- audio-separator0.30.2의 Windows 필수 diffq-fixed0.2.4는 CC-BY-NC-4.0으로 확인해 해당 조합을 선정하지 않았습니다. 최신 후보의 버전/NumPy 요구사항도 기존 Basic Pitch 환경에 섞지 않습니다.
- Demucs4.1.0 코드는 MIT이며 추론 전용 의존성을 별도 환경에 고정한 계획을 준비했습니다. lameenc1.9.0은 LGPL-3.0-or-later입니다. 분리 프로세스 사용만으로 배포 의무가 사라진다고 가정하지 않으며 wheel 포함 라이브러리/고지·소스 제공 조건은 출시 전에 확인해야 합니다.
- 모델 가중치는 코드와 다릅니다. [저자 답변](https://github.com/facebookresearch/demucs/issues/327)은 MIT 적용 제외·연구 용도 제공이라고 안내합니다. HTDemucs-6s의 새 safetensors 저장소에서도 별도 상용 허가를 확인하지 못했습니다. 현재 manifest는 researchOnly=true/commercialRedistributionVerified=false이며 제품 채택·재배포를 보류합니다.
- 후보 전체 다운로드는707,117,623바이트(674.36MiB), 패키지31개·모델2파일이며 별도 개발 환경과 캐시를 위해 여유 공간4GiB를 요구하는 계획입니다. 설치 크기의 실측값은 아닙니다. 현재는 메타데이터만 조회했고 큰 파일 다운로드/설치는 미실행입니다. 모델 요청 동의 후에만 연구 검증 범위의 다운로드를 실행합니다.
- 전체 SHA-256/공식 출처/고정 revision은 `../ai/models/demucs-4.1.0-htdemucs-6s-windows-cp310.json`에 기록했습니다. 검증 전에 로드하지 않고 임의 코드/legacy pickle 자동 폴백도 허용하지 않습니다. 실제 설치·모델 실행과 오프라인 검사는 아직 수행하지 않았습니다.

### 사용자 요청 반영 및 실제 검증

위 사전 검토 이후 사용자가 Demucs 사용을 요청해 별도 개발 환경의 다운로드/설치와 자체 fixture 검증을 진행했습니다. 고정31개 wheel/2개 모델 파일의 크기/전체 SHA-256 일치·offline pip 설치/check·실제 CPU 분리/원본 보존/취소를 확인했습니다. 런타임은 로컬 safetensors만 사용하고 모델 클래스도 허용 목록으로 제한합니다. 프로세스 내 socket connect/urlopen 차단 상태의 자체 추론은 통과했으나 OS 방화벽 검사는 미실행입니다.

사용자는 오픈소스 배포 방향을 밝혔습니다. 가중치의 연구용 안내 및 일반 사용·재배포 허가 미확정은 유지하며 모델/가상환경은 Git과 앱 번들에서 제외합니다. 사용 요청을 제3자 권한 변경으로 기록하지 않습니다. 현재의 명시적 분리 버튼은 프로젝트가 보유한 로컬 WAV만 작업 사본으로 처리하며 사용자 오디오 네트워크 전송은 없습니다.

## 2026-10-19 URL 우선 첫 구현

API 키 보호 수단이 없어 사용자 URL의 공식 수동 iframe 경로를 먼저 구현합니다. 동의 전 연결하지 않고 원격 script를 앱 origin에서 실행하지 않으며 frame-src만 정확한 YouTube 호스트로 허용합니다. 로컬 transport/REC/정밀 채점/믹스와 분리하고 화면 이탈·숨김·표시 밖/창 비활성화 시 제거합니다. 영상 내부 오류를 앱이 자동 감지하지 못하며 실제 WebView 재생/Referer 검증은 미실행입니다. 검색/메타데이터 영구 저장/수동 앵커·악보 싱크는 미구현입니다. 현재 결과/제약은 progress/PHASE-06A.md를 따릅니다.

### 2026-10-19 실제 URL 재생 수용과 조작 개선

사용자가 Windows 후보의 실제 영상·소리를 정상 확인했습니다. 별도 체크박스 대신 전달 정보·개인정보/약관 안내 앞의 ‘안내에 동의하고 YouTube 열기’ 클릭으로만 연결하도록 소스를 간소화합니다. 입력만으로 연결하거나 화면 복귀 시 자동 재생하지 않습니다. 기존 수용 창은 유지하며 다음 후보에 반영합니다. 새 버튼 수동 조작/모든 영상의 오류/네트워크 단절·최소화는 미실행입니다. 이전 절의 재생 미실행 표기는 수용 전 이력이며 최신 결과는 progress/PHASE-06A.md를 따릅니다.

### 2026-10-19 프로젝트 ID 보존과 API 관측 경계

영상 ID만 SQLite v6에 선택적으로 보존하며 조회만으로 접속하지 않습니다. API 상태 관측 후보는127.0.0.1 임시 포트의 세션별 고정 wrapper에서만 공식 YouTube JS를 실행합니다. 앱 main의 script/connect/IPC 권한은 늘리지 않습니다. wrapper에는 파일·음원·프록시·IPC 엔드포인트가 없고 exact Host/GET/경로/요청 크기·시간 제한·no CORS·no-store가 적용됩니다. 외부 JS와 앱 사이에는 엄격한 source/origin/세션/영상/sequence·범위 검증의 상태 메시지만 허용합니다. 영상은 공식 controls로 보이는 상태에서만 사용하며 기존 화면/REC 수명 규칙을 유지합니다. 실제 서비스/WebView API 수용 전 검증 표시를 유지하고 수동 플레이어로 돌아갈 수 있습니다.

## 2026-10-20 RustFFT 후보 의존성

다성 PCM 진단용 FFT는 rustfft6.4.1을 정확히 고정합니다. [공식 Cargo manifest](https://docs.rs/crate/rustfft/6.4.1/source/Cargo.toml.orig)의 Rust>=1.61/edition2021·MIT OR Apache-2.0을 확인했습니다. 프로젝트 Rust 최소1.90/현재 설치 도구 체인에서 빌드·검사로 호환성을 확인합니다. 기본 CPU 기능 선택과 실패 시 scalar 폴백은 공식 FftPlanner를 사용하며 모델/네트워크 런타임을 추가하지 않습니다. 전이 의존성은 lockfile과 설치 metadata를 확인하고 출시 고지에 포함합니다. FFT 자체가 기타 다성 인식 품질을 보장하지 않습니다.

### 실제 고정 의존성 확인 — 2026-10-20

Cargo.lock의 추가 패키지는 rustfft6.4.1/num-complex0.4.6/num-integer0.1.47/primal-check0.3.4/strength_reduce0.2.4/transpose0.2.3입니다. 설치 Cargo.toml에서 모두 MIT OR Apache-2.0을 확인했습니다. 명시된 MSRV는 각각 RustFFT1.61/num-complex1.60/num-integer1.31이며 나머지3개는 별도 rust-version 미기재로 현재 도구 체인의 실제 빌드로 확인합니다. 기존 num-traits는 유지합니다. 가중치/모델 또는 개인 오디오 다운로드·업로드를 추가하지 않았습니다.

## 2026-10-20 공개 GuitarSet 검증 자료

[공식1.1.0 레코드](https://zenodo.org/records/3371780)/공식 API metadata의 license.id=cc-by-4.0을 확인했습니다. 저자:Qingyang Xi/Rachel M. Bittner/Johan Pauwels/Xuzhou Ye/Juan P. Bello, GuitarSet: A Dataset for Guitar Transcription, ISMIR2018.4개 녹음/주석8파일만 HTTPS 범위로 받고 개별 ZIP CRC·SHA-256/크기·귀속 안내를 보존합니다. 전체 ZIP MD5를 확인한 것으로 표시하지 않습니다. 원본 데이터는 `fixtures/external/` 아래에서만 사용하고 Git/앱 배포에 포함하지 않습니다. 모델 다운로드/개인 자료 업로드는 없습니다. [공식 알려진 타이밍 오류](https://github.com/marl/GuitarSet/issues/5)와 [중복 주석](https://github.com/marl/GuitarSet/issues/4)을 제외하는 소규모 계획은 docs/09를 따릅니다. 데이터 전체나 다른 배포물에 대한 포괄 권한 판단을 하지 않습니다.


## 백업 데이터 경계 — 2026-10-20

백업은 사용자에게 개인 녹음/메모/DB 안의 외부 파일 경로가 포함됨을 알리고 명시적 동의를 받습니다. native 저장 창에서 새 로컬ZIP만 선택하고 IPC에서 임의 경로/코드/압축 인자를 받지 않습니다. 모델 다운로드/AI 실행·네트워크 전송·시스템/YouTube 캡처를 수행하지 않습니다. 원본/기존 목적지를 보존하며 취소는 자식 종료와 신규 staging 정리를 확인합니다. 강제 OS 종료/드라이버 정지로 자식 정리를 확인하지 못하면 BACKUP_CLEANUP_UNCONFIRMED를 반환하고 원본 삭제나 정리 성공을 주장하지 않습니다. 앱 데이터 교체/삭제는 아직 지원하지 않습니다. 설치된 Tauri2.12.3의 webview IPC 경로는 remote origin에서 명시적 허용이 없는 custom command를 거부하며, 번들 검사에 backup_local_data도 포함합니다. remote 권한을 추가하지 않습니다.


## 2026-10-21 자체 소스 MIT 적용

사용자의 명시적 선택에 따라 GuitarLab 자체 소스에 MIT를 적용하고 루트 LICENSE 원문과 npm/Cargo/Python 메타데이터를 일치시킵니다. 기존 제3자 고지·음원/모델·폰트의 조건은 유지합니다. 검증 패키지에 LICENSE를 넣되 `legalReviewCompleted:false`를 유지하며 최종 법적 검토/모델 재배포/소스 제공 안내 완료를 주장하지 않습니다.


## 2026-10-21 로컬 네이티브 오류 진단 경계

앱은 초기화/종료·Rust panic의 고정6코드와 writer 수신 시각만 로컬에 최근64건 보존합니다. 경로·stack·예외 payload·프로젝트/장치 식별자·오디오는 포함하지 않고 자동 전송하지 않습니다. panic hook은 bounded try_send만 사용하며 디스크 작업은 별도 writer에서 수행합니다. 16KiB·엄격한 schema/코드 검증·새 파일 atomic 게시를 사용하고 백업 범위에서는 제외합니다. 모든 OS 충돌/강제 종료 포착과 panic 뒤 디스크 기록 완료는 보장하지 않습니다. frontend 오류 원문 수집이나 원격 보고 기능은 이번 범위에 없습니다.


## 2026-10-21 캐시 삭제의 명시적 범위

캐시 정리는 최신 상태 조회·모델 선택·명시적 동의 후에만 시작합니다. 경로/파일명/프로필/URL을 IPC에서 받지 않고 고정 CP312 계획에 속하는 앱 캐시만 대상으로 삼습니다. 링크·junction/알 수 없는 파일과 바뀐 revision은 거부합니다. 설치 환경/활성 marker·프로젝트·녹음은 제외하며 파일 내용/개인 경로를 출력하지 않습니다. 실제 사용자 캐시를 개발자가 자동 삭제하지 않습니다. 프로젝트/개인 녹음 삭제·휴지통의 미구현 상태는 유지합니다.


### 2026-10-21 로컬 악보 확인 메시지 최소 권한

주 창의 비동기 미저장 악보 확인에 필요한 dialog:allow-message만 default capability에 추가합니다. 기존 이벤트 listen/unlisten과 함께 로컬 main에 한정하며 원격 YouTube/loopback·다른 창에는 부여하지 않습니다. 파일 open/save·shell·window close/destroy 권한은 여전히 없습니다. 설치된 tauri-plugin-dialog2.8.2의 window.confirm 대체 구현과 실제 runtime authority를 함께 검사합니다. 메시지 호출 실패/거절은 확인 승인이 아니며 악보를 보존합니다. native X 종료 확인은 기존 Rust 경로를 유지합니다.
