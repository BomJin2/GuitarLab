# 12. 인터페이스 계약 — React ⇄ Rust ⇄ Python

## 긴 테이크의 제한 메모리 구간 분석 — 2026-10-25

기존 `analyze_recording_pitches` v1/`analyze_recording_pitch_track` v1 요청과 스펙트럼 결과v1/궤적 결과v2 형식은 유지합니다. startMs 범위만0~600000ms로 확장하며 실제 녹음 안에400ms/1000ms 전체가 남아 있어야 합니다. 허용 테이크는 기존 녹음 한도(최대10분/256MiB 중 먼저 도달한 값)의 누락/경고 없는 READY·사용자 INPUT_ONLY입니다. 이전30초/16MiB 분석 전용 제한은 이 후속에서 대체합니다. DSP/판정·저장 버전/원본은 바꾸지 않습니다.

native는 소유권/보관 상태와 현재 불변 WAV 메타데이터를 확인하고 같은 열린 파일의 헤더·정확한 길이와 전체 SHA256을 검사합니다.64KiB 단위로 읽되 선택한 최대1초의 f32만 보관합니다(최대192000샘플/768000바이트와64KiB 읽기 버퍼·해시 상태). 선택 구간 밖의 변조도 거부하며 무결성 확인 전 후보를 게시하지 않습니다. 전체 파일 검사는 길이에 따라 시간이 걸리며 건너뛰지 않습니다. 단위 청크와 최종 결과 직전에 취소를 확인하고 실제 읽은 전체 바이트로 진행 상태를 전달합니다. 실패/취소는 DB·원본/이전 결과를 변경하지 않고 활성 녹음 중 실행은 기존대로 거부합니다.

## 골페 표기의 기존 미지원 계약 적용 — 2026-10-25

설치된 alphaTab1.6.1의 박자 `GolpeType.Thumb/Finger`는 몸통 타격 표기이므로 일반 단음 피킹 지원으로 취급하지 않습니다. 실제 파서/GP import에서 해당 박자의 모든 음을 기존 `judgementSupport:UNSUPPORTED`로 보존하고 matcher 감점 제외/기본 편집의 주법 소실 거부에 연결합니다. 반복 occurrence와 구형 원본 복원도 같은 공유 조건을 사용하며 원본/기존 리비전·ID/싱크를 변경하지 않습니다. 새 골페 검출/점수·IPC/DB/판정 버전은 추가하지 않습니다. 실제 파서/GP 왕복/구형 복원 회귀가 통과하기 전 구현 완료로 표시하지 않습니다.

## 보관 프로젝트 용량 확인 v1 — 2026-10-25

`inspect_trashed_project_usage`는 기존 StorageJob/취소 계약으로 `{schemaVersion:1,projectId,trashId}`만 받습니다. 현재 휴지통 UUID/revision을 검사하고 녹음/다른 파일 작업 중에는 시작하지 않습니다. 반환은 `{schemaVersion:1,state:"PROJECT_TRASH_USAGE",usage:{projectId,trashId,files,logicalBytes,externalReferences}}`입니다. 정수는 안전 범위, files≤10000·externalReferences≤100000입니다. 관리 폴더가 아직 없는 새 프로젝트는0파일/0바이트이며 외부 참조 파일은 열거나 크기를 조회하지 않습니다.

앱 데이터의 정확한 projects/UUID 아래 metadata만 읽습니다. 루트/조상/항목의 심볼릭 링크·Windows reparse point,특수 파일·16단계 초과·10000항목 초과·30초 초과·읽기 오류는 부분 합계를 성공으로 반환하지 않습니다. 취소/시간은 각 파일 시스템 호출 사이와 최종 결과 반환 전에 확인하며 OS 호출 자체를 강제 중단하지 않습니다. 취소/실패/보관 UUID 변경 시 기존 DB/파일을 보존합니다. 논리 파일 크기는 공유 링크/압축/클러스터/동시 외부 수정 등을 반영한 실제 회수 가능 공간이 아닙니다. 자동 정리·삭제 토큰/영구 삭제 API·DB 마이그레이션은 추가하지 않습니다. UI는 각 보관 항목의 명시적 ‘용량 확인’ 요청과 상태/취소·결과만 표시합니다.

## 기존 공개 단음의 pYIN 오프라인 비교 계획 — 2026-10-25

이미 설치한 개발용 librosa0.11.0/NumPy1.26.4·SciPy1.15.3·Numba0.68.0만 사용하며 새 설치/모델·네트워크 추론은 하지 않습니다. 기존 관측된 GuitarSet 두 묶음의91+91창/각3458점을 원래 참조/누락 그대로 비교합니다. 이미 본 자료의 사후 비교이며 독립 수용 자료가 아닙니다. 입력은 원래1초/44.1kHz PCM의 같은DC 제거·3표본 평균/f32,14.7kHz/1024점/hop367·center=false이며 padding/시각 이동을 하지 않습니다. fmin70/fmax1500·나머지는 해당 버전 공식 기본값을 고정합니다. 원래클리핑/저음량·MIDI39.5~88.5 경계는 공통 적용하되 pYIN voiced_flag/voiced_prob를 기존 주기성 confidence로 바꾸거나0.90과 동등하다고 주장하지 않습니다.

원시F0/발음여부·발음확률/공통게이트 후 후보·모든 미검출/무음·불확실/다성 분모·호출 소요를 별도로 보존합니다. Viterbi가 이후 프레임도 사용하는 오프라인 진단이므로 실시간 지연/기존Rust 검출기 대체·고급 점수 수용을 주장하지 않습니다. 원본/지문·실패/취소와 자체DEMO 검사를 먼저 확인하고,실행 계획/소스를 고정한 뒤에만 공개 파형 비교를 수행합니다. 사용자 오디오/앱/UI·제품 의존성/저장 계약은 변경하지 않습니다.

## 격리 설치 앱의 초기화 관측 — 2026-10-25

설치 검사는 창 제목/Responding만으로 초기화 완료를 판단하지 않습니다. 별도 앱이 살아 있고 올바른 창 상태와16KiB 이하의 정상 native-v1.json(schema1/이벤트1~64개·마지막APP_STARTED)이 함께 확인될 때만 DB 검사로 진행합니다. 최대30초/200ms 간격이며 파일 부재·Win32 공유/잠금 위반32/33만 대기합니다. 프로세스 종료·잘못된 JSON/버전·실패 이벤트·그 밖의 권한/I/O 오류는 실패를 유지합니다. 시간 초과는 실패 영수증을 기록하고 앱 강제 종료/제거·개인 데이터 변경은 하지 않습니다. 제품 로깅/IPC/판정 동작은 바꾸지 않습니다.

## 배포 고지와 의존성 입력 일치 — 2026-10-24

Python runtime 고지는 기존 runtimeBundleManifestSha256도 실제 배포 lock 원문SHA와 같아야 합니다. 현재 고지14개의 이름/크기/SHA를 대조한 뒤 오래된 저장 지문을 갱신하며 원문·런타임은 변경하지 않습니다. 이전 lock/누락/잘못된 지문도 신규 ZIP 생성 전에 거부합니다.

Test-ValidationPackage.ps1은 현재 PowerShell의 PSHOME에 있는 기본 Microsoft.PowerShell.Utility 모듈 전체를 먼저 읽습니다.5.1 부분 자동 로딩에서 Get-FileHash 함수가 없던 실패를 그대로 보존하고 새 패키지를 별도 경로에서 검사합니다. 개인 모듈/인터넷·시스템 모듈 설치나 영구 설정 변경은 하지 않습니다.

내부 debug/release NSIS 설정 준비와 이를 재사용하는 CI 준비기도 같은 검사를 통과해야 새 설정/포인터를 만듭니다. 실패하면 이전 설정/현재 후보는 보존하며 준비 영수증의 dependencyInventorySha256에 실제 사용한 고지 목록을 묶습니다. 기존 설치기/ZIP을 소급 변경하거나 앱을 실행하지 않습니다.

새로 수집하는 개발 고지 inventory에 dependencyInputNormalization='utf8-crlf-to-lf-v1'와 dependencyInputs를 기록합니다. package.json·pnpm-lock.yaml·src-tauri/Cargo.toml·src-tauri/Cargo.lock의 제한된 UTF-8 텍스트를 CRLF→LF만 정규화해 각각 SHA-256으로 묶습니다. 신규 검증 ZIP은 이4개가 현재 파일과 일치하지 않거나 기록이 없으면 출력 생성 전에 거부합니다. 기존 ZIP/설치기 검증·고지 원문·이용 조건/검토 미완료 상태는 유지합니다. 현재 파일 변경 후 고지는 현재 그래프와 대조해 다시 수집/검토해야 하며 이 검사를 법률 검토 완료로 해석하지 않습니다. 제품IPC/DB/모델 계약 변경은 없습니다.

## 고정 후보 결과의 읽기 전용 감사 — 2026-10-24

개발 도구 audit_octave_candidate.py는 별도 후보 폴더의 SHA가 지정된 완료 보고서만 읽습니다. schemaVersion=1·productCodeChanged/actualAppJudgements/independentTechniqueGroundTruthAccepted=false, 고정38점의 원래 참조와 baseline/candidate 쌍을 검증하고 모든 미검출·무음·불확실/다성 지점을 분모에 유지합니다. Boolean/NaN·어긋난 인덱스·중복 창·불일치 합계/상태를 거부합니다. 이미 등록한50cents·이전 정답 퇴행/무음 새 후보/새 자료 개선 조건만 다시 계산하며 새 임계값이나 정답은 만들지 않습니다. 원본/제품·모델은 수정하지 않고 새UUID 감사 결과에 성공/실패/취소와 원본SHA를 남깁니다. 실행 파일/네트워크·개인 오디오는 사용하지 않습니다.

## 별도 옥타브 증거 후보 v1 — 제품 미적용/별도 자료 수신 전 등록 (2026-10-24)

2026-10-24 결과: 기존 대조군을 유지했으나 새4파일의 주석상 무음에 새 후보1개가 생겨 사전 조건으로 기각했습니다. 제품에는 적용하지 않습니다. 아래는 수신 전 등록한 기준의 이력이며 실제 분모/지문·미실행은 PHASE-07 최신 절을 따릅니다.

기존 학습용 관측 뒤의 사후 가설이며 제품DSP는 바꾸지 않습니다. 원래0.15 잔차 비율 교정은 보존하고, 원래 조건이 실패한 경우에만0.4 잔차 비율 및 Hann 홀수/짝수 계열 power비≥0.04를 함께 요구하는 별도 복사본을 검증합니다. 계수는0.5/1/1.5/2/2.5/3배·1024점/같은f32 입력이며 Goertzel 계산과 직접 투영의 수치 일치를 먼저 확인합니다. 유효 주파수 범위 밖/비유한·작은 분모는 추가 교정을 하지 않습니다.0.04는 기존 표본을 본 뒤 선택했으므로 독립 증거가 아닙니다.

별도02/03/04/05 네 파일의 음원/결과를 보기 전에 방법/소스SHA·기각 기준을 고정합니다. 기존 AGPT337타격의 시각/미검출 분모·6개 단위 미확정 하모닉스 출력을 보존하고 조건부 팜뮤트4곳만 별도 확인합니다. 기존/새 GuitarSet의 이전50cents 적중을 하나라도 잃거나,주석상 무음에 새 후보가 생기거나,기존 합성DSP 회귀/Goertzel 일치·후보 p95비용2배 제한을 실패하면 기각합니다. 새 네 파일에서 실제 개선이 없을 때도 제품 채택하지 않습니다. 결과를 본 뒤 같은 검증 표본에 숫자를 맞춰 다시 수용하지 않습니다. 이 가설의 실행/수용은 아직 미완료이며 실제 장치/고급 점수 품질 완료를 의미하지 않습니다.

## 옥타브 후보의 배음 증거 관측 v1 — 2026-10-24 구현 전 계획

제품 DSP/임계값을 바꾸지 않는 개발 관측입니다. 기존 GuitarSet91창/3458점의 고정 benchmark SHA bfa23294…/native보고서 e4e96b43…를 검증하고 단일 중심 참조838점 중 후보677개(기존50cents 이내629/초과48)의 실제1024점 전처리 창을 모두 비교합니다. 누락161개도 분모에 남깁니다. 기존17시각 문맥 분류를 재사용해 중심 단음과 창 전체 단음을 구분합니다. 기존 AGPT 비율 가설의4개 팜뮤트/6개 하모닉스 변경점도 원래 방출 시점/PCM SHA로 별도 대조하되 candidate0.4의 결과를 정답으로 사용하지 않습니다.

배음 계수는 baseline 관측 주파수의0.5/1/1.5/2/2.5/3배에서 고정 Hann 투영으로 측정합니다. 낮은 주파수 계열의 홀수 성분(0.5/1.5/2.5)과 관측 주파수 계열(1/2/3)의 비율을 기록하며, 계수가 기본음 존재/성부 수/신뢰도라는 추론이나 새 교정 임계값은 만들지 않습니다. GuitarSet은 원래1초 DC 제거·3표본 평균의f32,AGPT는 원래4096프레임의4표본 f32 누적 평균을 그대로 재구성합니다. gain/주파수·발음 시각/점수는 변경하지 않습니다. 경로/크기·고정JSON/PCM·제품 DSP SHA·입력 전후 불변을 검사하고 새 UUID 결과·사후 선택/비독립/실제 점수false를 보존합니다. 합성 일반/강한2차 배음·잘못된 입력/원본 보존으로 계산을 검증한 뒤 실제 관측을 실행합니다.

## 장식음의 미지원 판정/편집 보호 — 2026-10-24

명시적 GraceType.OnBeat/BeforeBeat/BendGrace도 단순 피킹 목표로 지원하지 않습니다. 기존 음정/양수 재생 tick·duration을 보존하며 실제 파서/GP 왕복에서 grace beat만 UNSUPPORTED로 보류합니다. 주법 표기만 빠진 구형 원본의 기존 ID/시각이 같을 때 비파괴 복원합니다. 첫 마디보다 앞선 음수 tick의 before-beat grace를 임의로0으로 이동하거나 지우지 않고 기존 도메인 검증에서 거부하는 제약은 유지합니다. 꾸밈음의 자동 검출/편집 지원을 추가하지 않습니다.

alphaTab1.6.1 Note.ornament가 None 이외인 Turn/InvertedTurn/UpperMordent/LowerMordent는 단일 피킹이 아니므로 기존 judgementSupport=UNSUPPORTED로 정규화합니다. 동일 원본의 반복/구형 metadata 비파괴 복원에도 적용하고 기본 편집/출력에서는 장식 표기를 지워 저장하지 않도록 기존 거부를 재사용합니다. 원본/ID·음정/시각·동기 앵커와 일반 NoteOrnament.None은 유지합니다. 새 IPC/DB·실제 장식음 검출이나 과거 점수 재계산은 없습니다.

## EG-IPT 주기 조건의 사후 감사 v1 — 2026-10-24

개발용 audit_egipt_periodicity.py는 고정 공개 관측 JSON(SHA a524f4f17a1477046364832dbd3ed378c02c3dd3d2a26400619da9c74b86625e)만 읽습니다. 기존31창 중 vibrato 라벨/coverage90% 이상3창의 점 시각·음정으로 현재3~9Hz/0.1Hz 탐색의 적합도·깊이·주기 수·선형 경향을 별도 계산합니다. 원본/모델 재분석·네트워크·제품 threshold 변경은 없고 입력SHA와 사후 선택/계산임을 표시합니다. 경향 guard 실패 후 계산한 최적 곡선은 제품이 반환한 주기 후보가 아닙니다. 고정 관측의 허용 경로/크기512KiB·원문SHA·유효 점을 확인하고 새 UUID JSON/POSTHOC_PERIODICITY_CONDITIONS_AUDITED만 기록합니다. 연속 정답/실제 점수·독립 평가 필드는 false입니다.

## EG-IPT 고정 표본 수신 도구 v1 — 2026-10-24

후속 관측 계약 v1: cfg(test)의 public_egipt_pitch_motion_observations는 명시한 GUITARLAB_EGIPT_SAMPLE manifest의 고정SHA71e721ef7039c65d944a34770ebbf116d0838c3fee8304fd60c8a6f2371c03ff·원본8개 SHA/계획을 확인합니다. 결과를 보기 전에 각 원본0초부터 겹치지 않는 완전1초 창만 분석하고 짧은 파일/나머지 프레임을 보존합니다. padding·gain 정규화·배속/리샘플링은 하지 않습니다. PCM24를 정확한 f32 비율로 디코딩해 기존96kHz analyze_pitch_track에 전달합니다. 기존 내부 블록 평균/음정 탐색은 그대로입니다. 출력은 새 UUID JSON/EGIPT_PITCH_MOTION_OBSERVED, source/probe hash·원곡 창 시각·coverage·motion·변화cents/주기성·관측점·보류 경고/처리 시간이며 continuousPitchGroundTruthVerified/actualAppJudgements=false입니다. 파일명 라벨과 검출 motion의 일치율을 주법 정확도로 계산하지 않습니다. 원본은 실행 전후 SHA가 같아야 합니다.

앱 IPC가 아닌 개발용 scripts/fetch_egipt_sample.py는 기본 실행에서 로컬 계획만 읽으며 --download-samples에만 네트워크를 사용합니다. 공식 레코드15205644/version1/CC BY4.0·EG-IPT.zip23757983313바이트/선언MD548a5135adfd090515ff0af7dc5c3c32f 및 정확한 주소를 확인합니다. fixtures/egipt-technique-sample-v1.json의 raw SHA2566da7035d1d8b121c0c9038201d0715ae25e4784dbd23426c1716512c12f51766에 HB-bridge/DI8조건을 분석 전에 고정합니다. 파일명1s/6s는 초가 아니라 기타 줄 번호입니다.

전체 ZIP은 받지 않습니다. 정확한 HTTP206/Content-Range/주소·ETag 변경 검사를 재사용하고 ZIP 합계32MiB/요청8MiB·180초를 제한합니다. 고정 중앙 목록(offset23741203027/16780188바이트)만 요청을 분할하며 다른 큰 read는 거부합니다. 선택8개는 합계10224558바이트, 파일 선언 크기/CRC/headerOffset/압축 방식·실제 CRC·mono PCM24/96kHz/최대30초/실제 프레임을 확인해 새 UUID 경로에 수정 없이 보존합니다. 기존 출력은 덮어쓰지 않고 실패/취소 manifest와 완료한 파일을 남깁니다. 공식 metadata의 통계는 바뀔 수 있어 기존 raw SHA와 동일해야 한다고 요구하지 않고 새 지문을 기록합니다.

공식 설명52320개와 실제 WAV 목록52317개의 차이3개는 미해결입니다. manifest v1 성공은 DI_FILES_VERIFIED_NOT_ANALYZED이며 전체 ZIP MD5/연속 F0 정답·독립 연주자 품질·실제 앱 판정 수용을 뜻하지 않습니다. 소리/모델 분석·학습·네트워크 업로드는 하지 않으며 앱/배포물에 포함하지 않습니다.

## 박자 단위의 미지원 주법 보완 — 2026-10-24

설치된 alphaTab1.6.1의 Beat.tap/slap/pop/deadSlapped, fade(None 이외), hasRasgueado는 단음 피킹 지원으로 취급하지 않습니다. 기존 NoteEvent.judgementSupport=UNSUPPORTED/PracticeTarget.unsupported/NOT_SCORED 계약으로 연결하고 반복 occurrence와 구형 원본 재열기의 비파괴 metadata 복원에도 같은 규칙을 적용합니다. 일반 피킹·None 효과는 그대로 두며 녹음/원음·저장된 과거 점수를 재계산하지 않습니다. 기본 편집/정규화 출력은 기존 미지원 주법 소실 방지 정책으로 거부합니다. 새 IPC/DB/기록 버전이나 실제 주법 검출 성공을 추가하지 않습니다. 원본에 표기되지 않은 주법을 추측하지 않습니다.

## 공개 참조의 저자 평가 범위 감사 v1 — 2026-10-24

개발 전용 audit_agpt_reference_scope.py는 고정 CSV4개·수신 manifest/UUID·표본 계획과 저자 TaskA 노트북 원문 SHA를 확인한 뒤8파일의281개 타격 참조를 모두 보존한 별도 결과만 생성합니다. 외부 노트북/코드·모델 실행과 네트워크·앱 데이터 접근은 없습니다. filename에 pitched 포함/impro 제외 조건을 먼저 적용하고, 정수 문자열의108 상한을 검사합니다. 결측/비정수 문자열은 변환 추측 없이 RAW_PITCH_UNRESOLVED로 남기므로 다른 pandas 버전의 결측/형변환 정책을 재현했다고 주장하지 않습니다.

결과 schemaVersion1/state AUTHOR_REFERENCE_SCOPE_AUDITED는 각 파일/타격의 원문 sample/rawPitchMidi·범위 상태와 모든 상태의 분모, source commit/노트북·CSV·계획 지문을 보존합니다. pitchEvaluationEnabled/groundTruthQualityAccepted/independentHeldOutEvaluation/actualAppJudgements는 모두 false입니다. 이 도구는 저자의 참조 사용 범위 감사이며 검출기 비교·실제 음정 정확도/품질 수용을 하지 않습니다. 출력은 원문 UUID 폴더의 새 author-pitch-scope-UUID.json에만 기록하고 기존 원문/타격 평가/결과는 덮어쓰지 않습니다. 입력 실패/취소 때 결과를 성공으로 표시하지 않습니다. 제품 IPC/DB 형식은 변경하지 않습니다.

## 편집 선택의 로컬 탐색 동작 — 2026-10-24

useScoreEditing.selectNote는 편집 허용/현재 트랙의 유효 ID·잠금을 먼저 확인합니다. 선택할 기존 음표와 준비된 로컬 음원이 있으면 현재 syncAnchors/startTick을 scoreTickToAudioTime으로 변환해 pause 후 seek를 한 번 요청합니다. 원곡 ms는 재생 배속과 독립이며 엔진의 기존 pause/seek epoch 정책을 그대로 사용합니다. 자동 play/REC·IPC/저장 형식 변경은 없습니다. loading/empty/error 미디어는 건드리지 않고 선택만 변경합니다. null 선택은 pause/seek하지 않습니다. 잘못된 싱크·음원 밖/미디어 탐색 실패는 고정 안내를 표시하고 선택을 유지합니다. 키보드 preventDefault 소유권과 전역5초 탐색 중복 방지는 계속 적용합니다.

## 개발 패키지 검증 도구의 빌드 정보 v1 — 2026-10-24

`manage_ai_model.exe build-info`는 인수 한 개만 받으며 `{schemaVersion:1,tool:'GUITARLAB_MODEL_MANAGER',runtimeBundleLockSha256:<컴파일 시 내장한 원문 lock의 SHA256>}` 한 줄을 반환합니다. Python/자식 프로세스·입력 스레드·AppData/모델 설치·네트워크를 시작하지 않습니다. 기존 inspect/install/verify/download와 제품 IPC/DB 계약은 유지합니다.

개발 ZIP 작성기는 고정된 검증 도구 경로/파일 경계를 확인한 뒤 shell 없이 이 명령만 실행합니다.5초 한도/표준 입력 없음·출력4KiB 이내·정상 종료/정확한3필드·고정 tool/schema와 현재 원문 lock 지문 일치가 필수입니다. 구형 도구/다른 lock·손상/중복 키/실패·시간 초과는 ZIP 출력 폴더를 만들기 전에 거부합니다. 빌드 정보는 서명/전체 소스 동일성이나 실제 Python 실행 성공을 보증하지 않으므로 기존 전체 리소스 지문과 ZIP/독립 실행 검사를 생략하지 않습니다.

## 키보드 이벤트 소유권 — 2026-10-24

악보·로컬 컨트롤이 `preventDefault()`로 처리한 키는 전역 재생/화면 전환에서 다시 실행하지 않습니다. TAB 좌우 선택은 음표 선택만 변경하며 전역 5초 탐색을 함께 실행하지 않습니다. 일반 영역의 좌우 탐색은 기존 동작과 키 반복을 유지합니다. Space/R의 반복 keydown, 조합 입력 중 keydown은 재생/반복 토글을 실행하지 않습니다. 화면 전환·안내 전역 키도 처리 완료·조합 입력·키 반복을 무시합니다.

표준 input/textarea/select·role=textbox와 상속된 contenteditable(빈 값/true/plaintext-only)은 텍스트 입력으로 보호합니다. 명시적 contenteditable=false는 편집 상속을 끊으며, SVG를 포함한 하위 요소에도 같은 경계를 적용합니다. 버튼/링크/summary/패널 구분선의 키는 기존 네이티브 조작에 맡깁니다. 이는 프론트 이벤트 처리 변경이며 새 IPC·DB·Python 계약 버전은 없습니다.

## AG-PT-set 기존 타격 검출기의 오프라인 기준선 — 2026-10-24

평가 결과 schema2는 기존50ms 일대일 대응을 바꾸지 않고 eventAudit50ms를 추가합니다. 대응/추가 각각의 음정 후보 있음/미확정, 추가가 참조창 내부/외부인지와 각 추가의 가장 가까운 참조·이미 대응된 검출을 기록합니다. 동률 최근접은 낮은 참조 index를 선택합니다. 음정 후보 유무로 재대응·분모 삭제·실제 오류 판정하지 않으며 새 결과만 생성합니다. schema1 결과는 그대로 보존합니다.

입력 schemaVersion/tailPaddingFrames와 referencePitchIssues의 개수는 JSON 정수만 허용합니다. true/false를1/0으로 받아들이지 않으며 개수는 양수여야 합니다. 원문 참조 상태 분모와 일치하지 않는 입력은 지표 생성 전에 거부합니다.

별도 주석 대조의 개발 관측은 기존 타격 평가를 바꾸지 않습니다. 주석 경로가 있고 값이 MIDI 범위의 정수인 고정 팜뮤트3파일만 원문 선언값을 MIDI라고 가정한 차이를 별도 UUID에 기록할 수 있습니다. sourceReferences281/조건부159/나머지122·관측 없음도 보존하고 원래50ms 대응을 재사용합니다. referenceInterpretationAccepted=false로 남기며 이 사후 조건부 진단을 실제 음정 정확도·독립 시험·고급 점수 수용으로 쓰지 않습니다. 하모닉스 값의 Hz 변환·기존 pitchEvaluationEnabled=false 변경은 하지 않습니다.

선언값과 약1옥타브 차이4곳의 검출 창은 방출 샘플에서 원본4096프레임/4프레임 평균1024점을 재구성합니다. f32 누적/차분을 재현하고 native 보고 음정과 대조한 뒤 원본/축소 계수·첫 골/두 배 lag 잔차를 관측합니다. 잔차 비율0.15→0.4 비교는 원본과 한 곳만 바꾼 별도 소스 복사본의 사후 가설이며 제품 변경이 아닙니다. 원본 복사본은 고정8개 전체337이벤트/시각/음정이 기존 보고서와 일치해야 하고, 후보의 전체 변화/미확정 분모를 보존합니다. 일부4곳만의 개선으로 채택하지 않습니다.

같은 가설을 기존 GuitarSet91창에 대조할 때는 원래1초 DC 제거/3프레임 평균·1024점/25ms hop·레벨/주기성 필터를 재현하고 원본 복사본의3458지점 전부가 보존 보고서와 일치해야 합니다. 기존 단음838/다성772/주석상무음474/불확정1374를 유지하며 단음 후보/50cents 이내/초과·누락과 기존 적중의 퇴행을 기록합니다. 이 자료에서 임계값을 다시 고르거나 기존 주석을 바꾸지 않습니다. 독립적인 실제 주법/정답 수용은 별개입니다.

실제 표본에서 pitch_midi=None8개와 MIDI 범위 밖76개(440 등)가 발견되어 음정 참조 해석은 중단합니다. 이 기준선은 onset-sample-column-only-v1/타격 전용이며 pitchEvaluationEnabled=false입니다. 참조마다 rawPitchMidi 원문과 MISSING/INVALID_NUMERIC/OUTSIDE_MIDI_RANGE/UNVERIFIED_RANGE_ONLY 상태를 보존합니다. 범위 안 숫자도 정답으로 검증된 것은 아니므로 MIDI로 강제 변환·보간하거나 pitch 정확도를 계산하지 않습니다. referencePitchIssues는 모든281개 참조의 상태 분모를 보존합니다. 초기 nullable MIDI 계획은 이 실제 검증 후 타격 전용 정책으로 대체했습니다.

고정8개 WAV/CSV의 지문과281개 참조를 검증해 PCM24를2^23으로 나눈 float32 파생 파일만 새 UUID에 만듭니다. gain 정규화/리샘플링/앞뒤 padding은 하지 않습니다. 참조는 CSV의 정수 onset_label_samples를 주 시각으로 사용하고 원문 초 문자열도 보존합니다. 두 열 차이·프레임 범위·주법/줄·행 수/중복을 검사하고 실패 참조를 몰래 제외하지 않습니다. 음정 열은 rawPitchMidi와 상태만 보존하며 None/범위 밖/잘못된 숫자도 타격 시점 분모에서 제외하지 않습니다. 비유한 숫자 문자열은 INVALID_NUMERIC으로 남기고 음정 정답으로 사용하지 않습니다.

개발 전용 native CLI는 제한된 공개 자료 경로와 schema1/고정계획 SHA·원문/파생 지문을 확인하고 현재 Detector의 초기 noise gate−50dBFS로 연속 샘플을 실행합니다. 결과에는 검출 공격 sample·결과 방출 sample·음정/신뢰도 또는 null·불연속·처리 시간을 원문과 별도 보존합니다. 원문 캡처 타임스탬프 대신 sample/48kHz의 합성 monotonic 시간만 사용하며 실제 장치/IPC/왕복 지연으로 해석하지 않습니다. cold start/파일 끝 미방출 가능성을 기록하고 제품 검출기/채점·앱 입력·사용자 설정은 변경하지 않습니다.

타격 평가기는 원문 CSV와 native 결과의 SHA 연결을 다시 확인하고5/10/25/50/120ms에서 결정적인 최대 수 일대일 대응을 수행합니다. 가까운 후보부터 탐색하지만 전체 절대오차 최소 대응을 보장하지 않습니다. 모든281참조/모든 검출·미대응/추가·음정 미확정 분모를 유지하며 결과 방출 지연은 own attack sample과의 차이로 별도 계산합니다. 중앙값은 정렬 상위 중앙/95백분위는 nearest rank이며 실제 장치 지연·앱 허위 감점률·독립 holdout 검증은 false입니다. 새 UUID 결과만 기록하며 기존 결과/원본은 보존합니다.

## AG-PT-set의 고정 WAV8개 선택 수신 — 2026-10-23

사전 계획은 guitar_id0/6 × 기법4/5 × 줄1/6의 사전순 첫 표본으로 고정하며 오디오 결과로 바꾸지 않습니다. Git의 지문 고정 계획에 파일명·원본/압축 크기·CRC·CSV 원본SHA·48kHz/mono/PCM24 프레임 수를 보존합니다. 부분 수신40MiB/원본합계64MiB/파일12MiB·작업 여유512MiB 한도에서8개만 받아 전체 CRC/고정SHA와 실제 WAV/프레임 데이터를 확인한 뒤 새 UUID 폴더에 보존합니다. 실패 표본 자동 교체·gain 정규화·전체 ZIP 수신·외부 코드/모델 실행은 없습니다. 실패/취소는 새 상태 영수증을 남기고 기존 파일은 유지합니다. 검증된 파일 수신과 실제 onset/음정 평가·실시간 점수 수용은 별개입니다.

## AG-PT-set 내부 stored ZIP의 목록 읽기 — 2026-10-23

개발 도구는 고정 외부 ZIP 안의 aGPTset/data/audio.zip만 대상으로 합니다. 중앙/로컬 헤더·파일명/플래그·ZIP_STORED/동일 압축·원본 크기/범위를 검증한 뒤 파일 뷰의 위치를 HTTP 원본의 제한된 범위로 매핑합니다. 내부 ZIP 전체를 읽어 건너뛰거나 압축 해제하지 않습니다. 양쪽 중앙 목록의 수신 합계는2MiB로 제한하고 전체/내부 ZIP의 CRC나 MD5를 검증했다고 표시하지 않습니다. 목록의 WAV를 추출·재생/분석하거나 모델을 실행하지 않습니다. 새 UUID 개발 영수증에 원본/압축 크기·CRC 선언과 수신량/ETag 유무를 보존하며 제품 IPC/데이터는 변경하지 않습니다.

## AG-PT-set 정밀 onset 참조의 메타데이터 수신 — 2026-10-23

개발 도구만 공식 레코드10159492/CC BY4.0·고정 ZIP6,749,621,615바이트/공식 MD5 선언을 확인하고 HTTP206/정확한 Content-Range로 CSV4개만 선택합니다. 실제 ZIP 전체 MD5는 확인하지 않은 상태로 명시합니다. API 응답64KiB·ZIP 부분 수신2MiB 한도, 고정 경로/원본·압축 크기/CRC/개별SHA와 UTF-8 CSV 행 구조를 확인하고 원문/SHA·행 수·헤더·수신량·ETag 유무를 새 UUID에 보존합니다. ETag 없는 응답을 버전 고정 검증으로 가장하지 않습니다.

외부 Python·음원/내부 audio.zip·모델은 읽거나 실행하지 않습니다. 취소/실패는 자신이 만든 새 결과와 상태 영수증만 남기며 기존 자료·앱/입력/점수를 바꾸지 않습니다. 파일/음표 메타데이터 확보와 실제 음정/타격 검출 평가를 구분하고, 정수 음표 레이블을 연속 F0 곡선이나 미주석 벤딩/비브라토의 정답으로 사용하지 않습니다. 제품 IPC/저장 형식 변경은 없습니다.

## 독립 설치 CI의 런타임 준비 — 2026-10-23

기존 고정 CPython3.12.15 stripped/full 원본 두 개(합계65,751,269바이트)만 캐시/크기/SHA 검증 후 사용합니다. 다운로드는 개발 CLI의 명시적 --download-runtime에서만 허용하며 AI 모델/사용자 자료는 수신·전송하지 않습니다. 캐시 변조/주소·한도 오류·취소에서 기존 파일을 보존하고 자신이 새로 만든 partial만 정리합니다. 준비기는 immutable runtime lock을 갱신하지 않고 새 UUID 리소스만 생성합니다. 설치 설정 준비는 명시적 검증 리소스 경로도 받을 수 있으며 현재 사용자 앱의 portable 후보 영수증을 덮어쓰지 않습니다.

Git LF checkout과 기존 작업 트리 CRLF의 worker3개(model_cache.py/runtime_packages.py/worker.py) 지문 차이는 Git 기준 LF 소스와 새 runtime lock을 대조해 해결합니다. 실행 중인 이전 후보/리소스·사용자 모델/DB는 그대로 유지하고 이전 리소스를 새 lock에 맞춰 변조하지 않습니다. Python 의미/IPC/모델 ABI 버전은 변경하지 않습니다. GitHub Windows 실행기 설치 검사는 별도 OS 증거이며 실제 Windows10/11 사용자 PC/모델 추론·서명 배포 완료로 확대하지 않습니다.

## 공개 음정 오류의 분석 창 문맥 감사 — 2026-10-23

개발 도구는 기존 GuitarSet continuous-note-mask-v1 원본/고정91창과 native schema2 보고서의 SHA 연결을 검증합니다. native와 같은 블록 평균 축소율·1024점/25ms hop의 원본 샘플 범위/중심을 재구성하고, 모든 단음 참조 지점에 대해 창 전체의 고정17개 시각에서 연속 참조를 조회합니다. 다성·다른 음정·무성·불확정 주석의 존재를 각각 보존하며 주석 공백을 무음으로 바꾸지 않습니다. 창 내 참조가 모두 한 음/중심±50cents 이내인 경우만 ANNOTATED_MONO_CONTEXT로 분류합니다. 이는 실제 신호에 다른 성분이 없다는 보장이 아닙니다.

개발 결과 schema1에는 원본/benchmark/보고서 지문, 전체/단음/후보/허용 오차 초과/누락 분모, 문맥별 대조군과 50cents 초과 오류 지점 목록을 별도로 보존합니다. 보고서의 중복/누락 창·잘못된 중심/참조를 거부하고 새 UUID 파일로만 씁니다. 모델/참조/원본·검출기/실시간 점수/제품 IPC는 변경하지 않습니다.

명시적 `--signal` 후속은 같은 오류48곳의 원본 f32 조각 크기/SHA·유한성을 검증한 뒤 raw3072점과 native와 같은3프레임 평균/1024점의 참조·검출 주파수 Hann 창 계수를 대조합니다. 개발 결과 schema2의 각 오류에 Hz·raw RMS/peak·원본/축소 계수·계수비dB를 추가하고 원본 조각 SHA를 남깁니다. 수치 바닥 이하의 비율은 null이며 계수를 confidence나 실제 성부 유무로 바꾸지 않습니다. 기존 schema1 실행/보고서는 유지하며 별도 window-signal UUID 파일로 생성합니다.

## 저장/같은 프로젝트 다시 열기의 작업 화면 유지 — 2026-10-23

수동/자동 저장은 현재 경로를 변경하지 않습니다. 카피·연습·연주 화면에서 같은 프로젝트를 다시 열면 저장된 생성 모드로 이동하지 않고 현재 작업 화면을 유지합니다. 읽기 대기 중 사용자가 다른 화면으로 이동해도 이전 화면으로 끌어오지 않습니다. 라이브러리에서 프로젝트를 열거나 다른 프로젝트를 여는 경우에는 기존 프로젝트 모드로 이동합니다. 실패·취소·미저장 교체 확인과 기존 재생/악보 복원·불변 revision 정책은 유지하며 새 IPC/저장 버전은 없습니다.

## 편집본 악보 트랙 순서 변경 — 2026-10-23 후속

- StructureEdit의 `MOVE_TRACK {trackId, targetIndex}`는 현재 문서의 0부터 시작하는 최종 위치로 선택 트랙을 이동합니다. 없는 ID·정수가 아닌 값·범위 밖·현재와 같은 위치는 거부하고 기존 문서를 유지합니다. 기본 단성 편집 검증/시작과 녹음·파일 작업 잠금을 재사용합니다.
- tracks 배열 순서만 바꾸며 트랙/음표의 ID·이름/역할/튜닝·음정/시각·템포/박자/앵커는 유지합니다. 렌더 왕복 검증 후 반영하고 현재 활성 트랙은 인덱스 대신 같은 ID를 따라갑니다. 기존 Undo/Redo·새 불변 revision 저장·JSON/MusicXML 출력 경로를 사용합니다.
- 원본 비교의 목록/선택은 독립적입니다. 원본 파일·이전 revision·테이크/믹스/음원 순서를 변경하거나 실제 기타 stem을 만들지 않습니다. 새 IPC/DB/Python/저장 형식 버전은 없습니다.

## 편집본 악보 트랙 삭제 — 2026-10-23 후속

- 기존 StructureEdit에 `REMOVE_TRACK {trackId, discardNotes:true}`를 추가합니다. 기본 단성 편집 범위/명시적 편집 시작·녹음/파일 작업 잠금을 유지하며 없는 ID·확인 없는 요청·마지막 남은 트랙 삭제는 거부합니다. UI 확인은 현재 선택 트랙의 ID·이름·음표 목록·역할/튜닝에 묶고 내용 변경/다른 트랙 이동 시 새로 확인합니다. 변경 없는 부모 상태 갱신만으로 확인을 취소하지 않습니다.
- 현재 문서에서 해당 트랙과 소속 음표만 제외한 새 NORMALIZED 문서를 만듭니다. 나머지 트랙/음표 ID·역할·튜닝·시간/싱크는 보존합니다. 원본 파일·이전 저장 revision·음원 stem/녹음 take·저장 연습 기록은 삭제/변경하지 않습니다.
- 기존 렌더 왕복 검증 후에만 history에 반영하고 현재 활성 트랙을 없앤 경우 남은 첫 트랙을 선택합니다. Undo/Redo는 삭제 전 트랙·음표의 같은 ID를 복원/제거하며, 복원으로 다시 생긴 트랙은 즉시 선택해 화면에도 복구를 표시합니다. 새 프로젝트 저장은 기존 불변 revision 정책을 사용합니다. 원본 비교에서는 최초 원본을 유지합니다. 새 IPC/DB/Python/저장 형식 버전은 없습니다.
- 트랙 삭제로 편집본 인덱스와 최초 원본 인덱스가 달라질 수 있으므로 읽기 전용 원본 비교는 별도 ‘원본 악보 트랙’ 선택기를 사용합니다. 편집본과 같은 인덱스가 같은 원본 트랙이라는 가정을 제거하며 이 선택은 편집 대상/문서/history·재생 clock을 바꾸지 않습니다.

## 마디 단위 로컬 반복 선택 — 2026-10-23 후속

- F-03의 마디 선택은 실제 alphaTab playbackLookup.masterBars의 펼친 재생 순서를 사용합니다. 시작/끝은0부터 시작하는 occurrence 인덱스이며 UI는 원래 마디 번호와1부터 시작하는 재생 순서를 함께 표시합니다. 끝으로 선택한 마디 전체를 포함하고 쉼표/빈 마디도 선택할 수 있습니다. 음표 첫/끝 시각으로 마디를 추정하지 않습니다.
- 선택 시 최신 syncAnchors로 시작 occurrence.start·끝 occurrence.end를 로컬 음원 ms로 변환하고 기존250ms 최소 길이·음원 범위를 검증합니다. 음원 밖을 임의 잘라내거나 배속으로 ms를 다시 나누지 않습니다. 잘못된 선택/싱크/미준비 음원은 안내하고 기존 반복/재생 상태를 유지합니다.
- 정상 적용은 기존 PlayerEngine.pause/setLoop/seek를 사용해 정지·새 epoch·선택 시작 위치로 이동합니다. 직접 재생은 사용자가 누르며 기존 준비 시간/판정 epoch 정책을 재사용합니다. 녹음/프로젝트 파일 작업 중 조작은 잠급니다. 하단 ms 반복/해제와 하나의 engine.loop를 공유하고 새 IPC/DB/프로젝트 저장 형식은 없습니다.
- 마디 선택 초안은 해당 악보 화면의 임시 상태입니다. 악보 교체 시 초기화하고 구조 변경 후 없는 인덱스는 적용하지 않습니다. 적용된 loop의 기존 프로젝트 저장/음원 교체 정책은 변경하지 않으며 영상/테이크 미리보기 clock에는 연결하지 않습니다.

## 악보 표시 선택 — 2026-10-23 후속

- `ScoreDisplaySettings`는 악보 문서/프로젝트 저장과 분리된 앱 실행 중 표시 상태입니다. notation=`tab|score`, layout=`page|horizontal`, scale=`0.75|1|1.25|1.5`만 허용하며 기본값은 TAB/세로/100%입니다. 사용자의2026-10-23 후속 요청으로 기본 TAB만 표시하고 별도 ‘오선보 보기’/‘TAB 보기’ 버튼으로 한 표기씩 전환합니다. 앞선 TAB+오선보 동시 표시 후보는 배포하지 않습니다. 카피·연습·연주 주 악보에 적용하고 다른 화면 왕복에도 같은 실행의 선택을 유지합니다. 재실행 영구 복원/원본 비교·AI/영상/테이크 미리보기 설정은 이번 범위에 포함하지 않습니다.
- 설치 alphaTab1.6.1의 `StaveProfile.Tab|Score`, `LayoutMode.Page|Horizontal`, display.scale에 매핑합니다. 원본의 TAB 전용 staff 플래그가 오선보를 숨기지 않도록 공개 JsonConverter로 만든 렌더 복사본에만 선택한 트랙의 표시 플래그를 적용합니다. 원본과 복사본의 트랙/staff/마디/voice/beat/note 순서에 따라 직접 객체 관계를 보존해 클릭은 원래 Note로 전달하고 원본 lookup의 beat는 복사본 bounds로 조회합니다. 관계가 없으면 추측하지 않습니다.
- 표시 선택이 바뀔 때 기존 렌더 인스턴스를 정리하고 새 렌더를 만듭니다. 재생 tick/선택 콜백 변경만으로 인스턴스를 바꾸지 않습니다. 원본 모델/문서·Note ID·선택 트랙·재생 tick/epoch·판정/녹음/Undo·저장 revision은 변경하지 않습니다. 새 IPC/DB/Python 계약이나 네트워크/라이브러리는 없습니다.
- 변경/새 렌더 준비 중 이전 bounds의 커서는 숨기며 현재 렌더 완료 후 같은 tick으로 갱신합니다. 가로/세로 커서 추적은 악보 내부 scrollLeft/scrollTop만 이동하고 페이지 스크롤·입력/REC 초점은 유지합니다. 렌더 실패/이전 인스턴스의 늦은 이벤트는 현재 정상 렌더로 처리하지 않습니다.

## 프로젝트별 자동 저장 선택 복원 v1 — 재실행 수용 완료(2026-10-22)

- 자동 저장 선택만 로컬 WebView Storage의 앱 전용 키 `guitarlab.score-autosave.v1`에 저장합니다. `{schemaVersion:1,projectIds:string[]}`의 표준 소문자 UUID/중복 없음·최대128개/8KiB만 허용하고 켠 프로젝트 ID만 보존합니다. 미선택 프로젝트 기본 꺼짐, 끄기는 해당 ID만 제거합니다.
- 읽기는 변경 없는 검증이며 손상/중복 키·미지원 버전/알 수 없는 필드·한도·Storage 접근 실패 시 기본 꺼짐과 오류 안내를 제공합니다. 지원하지 않는 설정을 임의 초기화하지 않습니다. 저장 실패 시 현재 실행의 명시적 선택은 적용하되 다음 실행 복원이 안 될 수 있음을 표시하며 자동 재시도하지 않습니다. 다른 앱 Storage 키는 건드리지 않습니다.
- 프론트의 저장 서비스가 형식/경계/오류를 담당하고 컨트롤러/화면은 읽은 선택과 사용자 명령을 사용합니다. 악보/음원·개인 메모/경로/장치 설정은 이 키에 넣지 않습니다. 새 IPC·DB/Python 버전·라이브러리·네트워크 연결은 없습니다.
- 선택을 복원해도 기존 첫 수동 저장/현재 원본·revision·NORMALIZED/30초 안정·정지/녹음·채점·보정/파일 작업·오류 보호를 모두 거칩니다. Storage 삭제/앱 데이터 초기화 시 선택은 기본값으로 돌아갑니다. 이 편의 설정은 기존 프로젝트 ZIP 백업·다른 PC 복원에 포함하지 않습니다.

## 선택적 악보 자동 저장 정책 — 기본 편집 범위 수용 완료(2026-10-22)

- 새 IPC/DB 버전을 추가하지 않고 기존 save_project의 불변 새 revision/expectedRevision·취소/진행/오류·원본 보존을 재사용합니다. 복구 초안이나 원본 덮어쓰기 기능이 아닙니다.
- 기본 꺼짐. 이번 실행의 사용자가 켠 프로젝트에만 적용하며 먼저 한 번 수동 저장한 같은 원본/현재 revision에 연결된 NORMALIZED 편집 악보만 대상입니다. 다른 프로젝트·원본으로 이동하면 적용하지 않습니다.
- 마지막 적용 변경 후30초 동안 변경이 없고, 재생 상태 empty/paused·녹음/보정/프로젝트 작업 없음·기존 오류 없음이면 현재 악보/재생 설정을 저장합니다. UI 입력 중 아직 ‘적용’하지 않은 값, 프로젝트 없는 악보·새 원본의 최초 저장·GP/화음 고급 편집은 자동 저장 대상이 아닙니다. 실행 직전 최신 조건을 재확인합니다.
- 기본 저장 작업이 busy/실패/취소되면 같은 문서의 자동 무한 재시도를 금지합니다. 오류 해결 뒤 수동 저장으로 확인하고 다시 켤 수 있습니다. 수동 저장·Undo/Redo·프로젝트 교체/종료 보호를 유지하며, 대기30초 내 강제 종료/종료 확인을 무시한 편집 보존은 보장하지 않습니다. 저장 버전/디스크 사용량은 늘 수 있고 자동 삭제하지 않습니다.

## GuitarLab JSON 악보 가져오기 v1 — 기본 편집 범위 수용 완료(2026-10-22)

- 기존 `SCORE_IMPORT`/로컬 악보 선택에 `.json`을 추가합니다. 입력은 최대8MiB의 UTF-8(BOM 없음)이며 GuitarLab이 내보낸 `ScoreDocument` schemaVersion1·renderSource=NORMALIZED만 허용합니다. 임의 경로/명령·외부 미디어 참조는 받지 않고 새 IPC/DB 버전은 추가하지 않습니다.
- 객체/하위 객체의 알 수 없는 필드·중복 키·버전/자료형·중복 ID/관계·수치·제어문자 오류를 거부합니다. 실제 렌더는 기존 기본6줄 단성/PPQ960·256마디/2,000음 지원 범위를 따르며 원본 주법/화음 손실 없이 표현할 수 없으면 이전 작업을 유지하고 실패합니다.
- JSON에 기록된 음표/트랙 ID·역할·튜닝·시간/템포·싱크 앵커를 유지하고 alphaTab 렌더 왕복을 확인합니다. `originalBytes`는 JSON 자체를 보존하며 원본 비교도 해당 JSON의 최초 악보를 렌더합니다. 프로젝트/asset/revision/미디어 연결 식별자를 외부 파일에서 신뢰하거나 자동 복원하지 않습니다.
- 프로젝트 선택은 기존 native picker로 승인된 파일만 읽고 고정 크기/헤더·serde 문서 검증을 새 자산 공개 전에 완료합니다. 취소/실패 때 기존 원본·head/편집을 유지하고 생성한 part만 정리합니다. 동일 바이트 중복은 기존 import 정책을 유지합니다. 이후 편집·저장은 기존 새 revision 경로입니다.
- 프로젝트 없는 선택/프로젝트 선택 모두 기존 비동기 미저장 확인·읽기 취소·문맥 변경 후 늦은 결과 거부를 재사용합니다. 오류는 `FILE_INVALID`/로컬 JSON 형식 안내로 제공하고 원문/개인 경로를 노출하지 않습니다. 기존 MusicXML/GP/WAV·녹음·판정 계약은 유지합니다.

## 내부 설치 종료 증거 보완 — 2026-10-22

설치 검증 스크립트는 CloseMainWindow 요청·5초 내 종료·정수 종료 코드0·APP_EXITED를 모두 확인한 뒤에만 독립 runtime 검사와 제거를 진행합니다. 거절/시간 초과/코드 누락·비정상 코드는 실패이며 강제 종료하지 않습니다. 새 개발 receipt(schemaVersion1)는 applicationExitCode를 추가 기록하고 과거 해당 필드 없는 receipt의 코드를0으로 추정하지 않습니다. 제품 IPC·DB·앱 종료 보호는 변경하지 않습니다.

## 빈 악보 생성 v1 — 2026-10-22

- `create_blank_project_score({request:{schemaVersion:1,projectId,expectedRevision}}) -> StorageJob v1`. 로컬 main에서 기존 파일 작업 큐로 실행합니다. UUID·버전·현재 프로젝트 revision/휴지통 상태를 검사하며 파일 경로·XML·음표를 IPC 입력으로 받지 않습니다.
- 앱이 소유한 고정 MusicXML(표준 6줄, 기타 1트랙, 4/4·120BPM·빈 1마디)을 새 UUID의 관리용 `SCORE_IMPORT` 자산으로 생성합니다. 성공 결과는 `{schemaVersion:1,asset:AssetInfo}`이며 기존 원본·revision·반주·녹음은 변경하지 않습니다. 선택/편집 후 기존 ‘프로젝트 저장’으로 별도 revision을 생성해야 합니다. DB 마이그레이션은 없습니다.
- 취소/쓰기·DB 오류 때 새 파일만 정리하고 기존 자산은 유지합니다. 커밋 이후 늦은 취소는 저장을 되돌리지 않습니다. `INVALID_REQUEST/REVISION_CONFLICT/PROJECT_IN_TRASH/STORAGE_ERROR/CANCELED/STORAGE_BUSY`는 기존 고정 오류 정책을 따릅니다. 파일 생성 중 앱 강제 종료로 남은 미등록 파일을 자동 삭제하지 않습니다.
- 화면에서는 비동기 악보 교체 확인을 먼저 기다립니다. 거절/확인 실패/취소·문맥 변경 뒤 늦은 승인은 현재 편집을 보존합니다. 프로젝트 없는 카피 화면은 같은 내장 원본을 메모리에서 열며 파일·DB를 자동 생성하지 않습니다. 내보내기는 기존 JSON/MusicXML 경로를 사용합니다. 자동 저장·화음 편집·새 트랙 추가 기능을 뜻하지 않습니다.

## 비동기 악보 교체 확인 수정 — 2026-10-21

설치된 tauri-plugin-dialog2.8.2는 window.confirm을 Promise<boolean>으로 대체합니다. DOM의 동기 boolean 타입에 의존하지 않고 UI 어댑터에서 await한 명시적 true만 허용합니다. 응답 대기 중 중복 요청은 거절하며, 취소·Promise 거절·화면 이탈·악보 문맥 변경·작업 취소의 늦은 승인은 파일 읽기/프로젝트 변경을 시작하지 않습니다. 직접 가져오기와 프로젝트 생성/열기/악보 교체/현재 프로젝트 보관의 모든 호출자가 이 비동기 계약을 따릅니다.

기존 default capability의 로컬 main 창에 dialog:allow-message만 추가합니다. 기존 event listen/unlisten 외 파일 선택·저장·shell·창 close/destroy 권한은 추가하지 않습니다. 원격 YouTube/loopback origin·다른 창은 message를 포함한 기존 IPC를 허용하지 않습니다. native 창 종료 보호의 UUID/저장 확인 절차와 DB9/Python/앱 IPC 버전은 변경하지 않습니다. 설치 소스의 init-iife.js 및 permissions/autogenerated/commands/message.toml을 기준으로 검사합니다.

## 직접 악보 가져오기 미저장 보호 — 2026-10-21 후속 계약

저장 프로젝트에 속하지 않은 로컬 파일 선택/자체 악보 불러오기도 현재 불변 악보의 미저장 확인을 거친 뒤 파일을 읽습니다. 취소/확인 실패 때 현재 문서·미디어를 바꾸거나 fixture fetch를 시작하지 않습니다. 새 파일 읽기/형식 오류·작업 취소·화면 이탈의 늦은 결과는 현재 문서를 교체하지 않습니다. 음원 선택은 악보를 교체하지 않으므로 이 확인을 자동 요청하지 않습니다. 실제 파싱/파일 경계 검증은 별도 로컬 미디어 import 어댑터에 두고 화면은 작업 상태/확인 어댑터·명령 전달에 집중합니다. 새 파일을 저장 DB에 자동 연결하지 않으며 기존 GP/MusicXML8MiB·WAV/MP3256MiB/헤더 검사·LatestTask 취소 정책과 native/DB/Python 계약 버전은 유지합니다.

주 창의 CSP connect-src는 `'self' ipc: http://ipc.localhost`로 자체 내장 fixture의 fetch와 기존 native IPC만 허용합니다. 외부 https/http origin·wildcard 연결은 추가하지 않습니다. 별도 YouTube bridge의 connect-src 'none'과 원격 IPC 거부는 유지합니다. 기존 ipc 전용 정책은 내장 악보 fetch도 막으므로 첫 불러오기 수용 실패의 원인 후보로 검증합니다. 실제 내장 fixture5개 존재/자체 XML bytes와 주 창 connect 허용 목록을 함께 회귀 검사합니다. 근거: [MDN connect-src/fetch](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src), [Tauri CSP의 앱별 조정](https://v2.tauri.app/security/csp/).

## 프로젝트 휴지통 보관/복원 v1 — Windows 검증 후보(2026-10-21)

- Phase8 사용자 데이터 정리의 첫 범위는 **되돌릴 수 있는 목록 보관**입니다. 파일/프로젝트 행·원본 참조·녹음·점수를 삭제/이동하지 않고 디스크 회수량으로 표시하지 않습니다. 영구 삭제/실제 AppData 교체는 별도 후속입니다. 자동 보관하지 않습니다.
- DB009/v9에 `project_trash(project_id PRIMARY KEY/FK projects,trash_id UNIQUE,trashed_at_ms,project_revision)`를 추가합니다. 기존 v8의 행·파일은 유지합니다. 일반 목록에서 보관 프로젝트를 제외하고 해당 프로젝트의 일반 조회/변경은 PROJECT_IN_TRASH로 거부합니다. 휴지통 목록은 명시적으로 조회합니다. 백업 도구는 v8/v9를 모두 허용하고 실제 source DB 버전을 manifest에 보존하며 미리보기의 DB/manifest 버전 일치도 확인합니다. 구버전 앱은 v9를 열 수 없습니다.
- `list_trashed_projects({request:{schemaVersion:1}})` → `{schemaVersion:1,projects:[{project:ProjectSummary,trashId,trashedAtMs}]}`. 최대1000개·보관 시각 내림차순/동일 시각 project ID 오름차순입니다. ID/시각·보관 시 revision과 현재 revision 일치를 검사합니다.
- `trash_project({request:{schemaVersion:1,projectId,expectedRevision}})` → StorageJob v1. UUID/현재 revision/명시적인 보관 조작·휴지통1000개 한도를 검사하고 새 trash UUID·시각/현재 revision을 IMMEDIATE transaction으로 저장합니다. 성공 결과 `{schemaVersion:1,state:'PROJECT_TRASHED',entry:{project,trashId,trashedAtMs}}`. 현재 열린 프로젝트도 보관할 수 있습니다. UI는 미저장 편집 확인/취소·실패 보존을 거치고 실제 성공 응답 뒤에만 현재 악보·프로젝트·재생 문맥을 비웁니다. 다른 프로젝트를 보관하면 현재 문맥을 유지합니다. native는 RUNNING 연습/활성 녹음·다른 파일 작업 중 보관을 계속 거부합니다.
- `restore_trashed_project({request:{schemaVersion:1,projectId,trashId}})` → StorageJob v1. 현재 보관 UUID와 일치하는 marker만 transaction에서 제거합니다. 성공 `{schemaVersion:1,state:'PROJECT_RESTORED',project:ProjectSummary}`이며 자동 열기·현재 미저장 문서 교체는 하지 않습니다. 과거 버튼/없는 항목은 PROJECT_TRASH_CHANGED로 거부합니다. 명령은 경로/임의 SQL을 받지 않습니다.
- 취소는 커밋 전 rollback, 커밋 이후 늦은 취소는 성공으로 구분합니다. 기존 StorageJobs 진행/취소·RecordingService의 파일 작업/REC 배타 처리를 사용합니다. frontend는 비즈니스/계약을 UI와 분리하고 중복 작업/늦은 응답을 처리합니다. 버전/추가 필드/오류·취소/복원·원본 보존/기존 v8 백업 회귀 및 원격 IPC 거부를 검증합니다. 별도 Python AI protocol은 변경하지 않습니다.

보관하려면 다른 프로젝트를 여는 흐름에서 기존 미저장 악보를 잃지 않도록, useProjects의 새 프로젝트/다시 열기·프로젝트 악보 교체 앞에 UI 확인 어댑터를 주입합니다. 현재 불변 문서/저장 revision 비교를 재사용하고 취소·확인 실패 때 native 작업/미디어·프로젝트 문맥을 바꾸지 않습니다. 같은 controller의 중복 작업 중에는 확인을 열지 않습니다. 복원은 현재 작업 공간을 바꾸지 않아 이 확인을 자동 호출하지 않습니다. 브라우저 확인은 UI 어댑터에 두며 저장 엔진/IPC에는 종속시키지 않습니다. standalone 악보 직접 가져오기·폼/믹스/OS 강제 종료는 이 추가 보호 범위 밖입니다.

## 미저장 악보 종료 보호 v1 — 구현 전 계약(2026-10-21)

- 주 창의 로컬 root가 `application-close-requested` 이벤트를 구독한 뒤 `enable_close_guard({request:{schemaVersion:1}})`를 호출합니다. 활성화는 멱등이며 root 해제로 비활성화하지 않습니다. 응답은 `{schemaVersion:1,state:'ENABLED'}`입니다. 창 권한/destroy 권한을 추가하지 않습니다.
- 녹음·설치·백업 및 진행 중 StorageJobs가 있으면 기존 정상 종료를 차단하고 안내합니다. 이 조건은 사용자 확인 뒤 재요청할 때도 우선합니다. 파일 선택·취소 처리 중에도 완료 전에는 닫지 않습니다.
- 그 외 닫기는 막고 `{schemaVersion:1,requestId:<UUID>}`를 emit합니다. root는 현재 불변 악보 문서를 저장 revision 또는 같은 원본의 초기 문서와 비교하고 `resolve_close_request({request:{schemaVersion:1,requestId,hasUnsavedScore:boolean}})`로 응답합니다. 다른 버전/추가 필드/UUID 오류·이전 요청은 거부합니다. 결과는 `{schemaVersion:1,state:'CONFIRMING'|'CLOSE_REQUESTED'}`입니다.
- 변경이 없으면 1회 허가 후 native `close()`로 기존 종료 조건을 다시 검사합니다. 변경이 있으면 native 확인창의 ‘계속 편집’/‘저장하지 않고 닫기’를 제공하고 명시적 후자만 같은 경로로 종료합니다. 자동 저장·DB/악보 수정·강제 destroy는 없습니다. 취소 뒤 재요청은 새 UUID이며 이전 확인은 적용하지 않습니다.
- root 응답이 없으면 5초 후 다시 닫기를 누를 때 미저장 여부를 확인하지 못했다는 native 확인을 제공합니다. 확인창은 중복 생성하지 않으며 실패/오래된 응답은 종료 허가로 해석하지 않습니다. 프로세스 강제 종료/OS 종료·프로젝트 전환·미저장 믹스/폼 필드는 이 슬라이스의 보호 범위 밖입니다.
- 기존 Python/DB/악보 형식은 바꾸지 않습니다. 원격 IPC 차단·정상/편집/되돌리기/저장·늦은 응답/취소/재요청·진행 작업 우선순위를 회귀 검사합니다.

## 앱 데이터 단일 실행 보호 — 2026-10-21

동일 앱 데이터 root를 쓰는 새 버전끼리는 `.app-instance.lock`의 비차단 OS 배타 잠금을 진단/DB 초기화·미완료 녹음 복구보다 먼저 획득합니다. 잠금 파일은 빈 고정 파일이며 PID·경로·사용자 정보를 저장하지 않고 종료 시 삭제하지 않습니다. 살아 있는 파일 핸들을 앱 수명 동안 보유하고 정상/비정상 프로세스 종료 뒤 OS가 해제합니다. 다른 root/제품 식별자는 서로 차단하지 않습니다. 상대 경로·root/lock의 링크/reparse·비어 있지 않은 기존 파일·파일이 아닌 대상은 거부하며 임의 초기화/덮어쓰기는 없습니다.

중복 실행/잠금 실패는 새 창을 숨기고 고정 한국어 native 안내를 표시한 뒤 새 프로세스만 종료합니다. DB·진단 writer·녹음 복구·모델 명령용 상태는 초기화하지 않습니다. 기존 창의 PID·장치/작업을 조회하거나 강제 종료하지 않습니다. 같은 소스의 manage_ai_model 개발 CLI도 install/download/verify 전에 동일 잠금을 잡고, 점유 중에는 INSTANCE_ALREADY_RUNNING/잠금 실패에는 INSTANCE_LOCK_UNAVAILABLE 고정 코드로 종료합니다. AppData를 쓰지 않는 inspect는 제외합니다. 잠금 구현이 없는 구버전 및 다른 외부 도구까지 차단한다고 보장하지 않으며 제품 전환/직접 도구 사용은 기존 정상 종료 규칙을 유지합니다. IPC/SQLite/Python 버전 변경은 없습니다. 근거: [Rust 표준 File::try_lock](https://doc.rust-lang.org/std/fs/struct.File.html#method.try_lock)·설치된 tauri-plugin-dialog2.8.2의 비동기 show API입니다.

## 현재 번들 모델의 다운로드 캐시 관리 — 2026-10-21

`inspect_model_download_cache` 요청은 `{schemaVersion:1,modelId}`이며 modelId는 기존 basic-pitch/htdemucs_6s 두 값입니다. 현재 Python3.12.15 프로필의 `ai/downloads/<고정 plan.cache>`만 조회합니다. 경로/URL/파일명을 인자로 받지 않으며 legacy cp310·설치 환경/활성 marker·프로젝트/개인 녹음은 범위 밖입니다. 최대128개/총2GiB의 고정 artifact 이름만 수용하고 링크·junction/알 수 없는 항목은 거부합니다. 정보는 내용의 SHA 검증이나 모델 설치 확인을 대신하지 않습니다.

응답은 정확히8필드 `{schemaVersion:1,state:"CACHE_USAGE",modelId,modelVersion,profile:"CP312_DOWNLOADS",files,bytes,revision}`입니다. files는 모델별42/34 이하, bytes는0~2GiB 안전 정수입니다. revision은 모델/고정프로필·정렬된 파일 이름/크기/수정시각에 대한 SHA256 소문자64자로 삭제 전 상태 확인용이며 개인 경로/파일 내용은 포함하지 않습니다. 조회는 작은 bounded worker이고 UI는 진행/오류·화면 이탈의 늦은 응답을 폐기합니다.

`clear_model_download_cache`는 `{schemaVersion:1,modelId,clearConsent:true,expectedRevision}`만 받습니다. 명시적 재다운로드 필요 안내/동의와 최신 조회가 있어야 UI가 활성화됩니다. 기존 StorageJob/REC 중 차단·storage 단일 작업/파일 작업 종료 guard를 재사용합니다. 삭제 전에 디렉터리 전체 허용 목록과 revision을 다시 확인하고, 각 파일의 링크/경로·크기/수정시각을 재검사합니다. 고정 캐시의 직접 자식 파일만 unlink하고 빈 캐시 폴더만 비재귀 제거합니다. 모델 weights의 설치 복사본/현재 환경·marker/사용자 자산에는 접근하지 않습니다. 다운로드/모델 실행은 없습니다.

진행은 기존 모델 작업처럼 completedBytes=파일 처리 백분율0~100/totalBytes=100이며 UI는 %로만 표시합니다. 삭제한 파일의 논리적 크기 합계는 결과에 별도 반환하며 실제 디스크 회수량을 측정한 값은 아닙니다. 결과는8필드 `{schemaVersion:1,state:"CACHE_CLEARED",modelId,modelVersion,profile:"CP312_DOWNLOADS",removedFiles,removedBytes,installedEnvironmentsChanged:false}`입니다. 파일 수·bytes는 조회와 같은 경계입니다. 취소/오류 시 이미 지운 캐시를 자동 복구하지 않으며 일부 파일이 지워졌을 수 있음을 안내하고 다시 조회하도록 합니다. 원본/이미 설치된 환경/다른 모델 캐시는 보존합니다. 실제 사용자 캐시의 자동 삭제는 개발 검증에 포함하지 않습니다. Python/DB 계약·모델 다운로드 동의는 변경하지 않습니다.


## 로컬 네이티브 진단 — 2026-10-21

`get_local_diagnostics`는 `{schemaVersion:1}`만 받고 앱 데이터 `diagnostics/native-v1.json`의 고정 코드 최대64개를 읽습니다. 경로·오류 원문·프로젝트/장치/미디어 식별자·네트워크 전송 인자는 받거나 반환하지 않습니다. 응답은 `{schemaVersion:1,persistenceAvailable:boolean,droppedEvents:number,events:[{unixMs:number,code:string}]}`이며 정확히4필드/이벤트2필드, 정수는 JS 안전 정수입니다. 코드 허용 목록은 APP_STARTED/APP_EXITED/NATIVE_PANIC/STORAGE_INIT_FAILED/RECORDING_RECOVERY_INIT_FAILED/APP_START_FAILED입니다. unknown 필드·버전/코드는 거부합니다.

원본 저장 문서는 schemaVersion1/events 두 필드,16KiB/64건 한도이며 새 파일+sync/rename으로 게시합니다. 읽기는 제한된 blocking worker에서 실행하고 UI는 진행/실패와 화면 이탈 후 늦은 결과 폐기를 처리합니다. 작은 고정 파일 읽기로서 별도 장기 StorageJob/내보내기·삭제 기능은 제공하지 않습니다.

오디오 처리 경로에서 파일 I/O를 하지 않습니다. Rust panic hook은 예외 payload·소스 위치·stack을 읽지 않고 bounded queue에 고정 코드만 try_send합니다. 별도 writer가 수신 시각을 기록합니다. 큐 초과/저장 실패는 droppedEvents와 persistenceAvailable에 반영하며 앱 기능을 중단시키지 않습니다. 마지막64건만 유지하고 네트워크/자동 지원 전송은 없습니다. 프로세스 강제 종료/OS access violation·초기화 이전 실패의 완전한 포착은 보장하지 않으며 panic 뒤 디스크 기록도 best effort입니다. 정상 종료 때 제한 시간 flush를 시도합니다. DB/모델/연주 결과 계약은 그대로입니다.


## 새 폴더 복원 미리보기 — 2026-10-21

`preview_local_backup`은 백업 생성과 동일한 `{schemaVersion:1,consentLocalData:true}`만 받습니다. ZIP 선택 후 native 폴더 선택 창에서 상위 폴더를 고르며, 그 안의 새 `GuitarLab-backup-preview` 폴더에만 추출합니다. 이름이 이미 존재하면 덮어쓰기 없이 실패합니다. 현재 AppData 및 그 하위·상위 폴더와 겹치는 목적지는 거부합니다. 요청에 경로/복원 대상 AppData/임의 명령을 넣을 수 없습니다.

기존 StorageJob v1을 사용하고 결과는 정확히7필드입니다: `{schemaVersion:1,state:"RESTORED_TO_NEW_FOLDER",files,bytes,externalReferencesNotCopied,restoreSupported:false,appDataReplaced:false}`. 파일/용량은 기존256MiB 경계를 유지합니다. 다른 명령은 이 상태를 거부하며 preview에는 appDataReplaced:false가 필수입니다. 실제 AppData 교체나 프로젝트 열기 성공으로 표시하지 않습니다.

고정 번들 Python의 app-preview 경로는 전체 ZIP 경로/CRC/SHA를 먼저 검사하고 새 임시 폴더에 다시 검증하며 추출합니다. 새 DB의 v8/quick_check/FK/비활성 REC를 확인한 뒤 Windows의 교체 불가 rename으로 새 폴더만 게시합니다. 외부 참조 미디어/모델 재설치·재연결은 수행하지 않습니다. REC/동시 storage 작업과 겹치지 않고 취소·실패 때 새 staging만 정리합니다. 검사/추출 양쪽에서 취소와 진행을 확인하며 게시 직전 취소를 다시 검사합니다. 게시 후 늦은 취소는 이미 만든 새 폴더를 삭제하지 않습니다. DB migration/모델 worker 계약은 그대로입니다.


## 백업 ZIP 읽기 전용 지문 검사 — 2026-10-20

새 `verify_local_backup`은 `{schemaVersion:1}`만 받으며 native 파일 선택 창에서 ZIP을 고릅니다. 임의 경로/명령/복원 인자를 IPC로 받지 않습니다. 모델/개인 데이터의 네트워크 전송과 압축 해제·AppData 교체 없이, 같은 고정 schema/경로·개수·256MiB/ZIP_STORED/CRC/SHA 검사를 수행합니다. 기록/프로젝트가 수정됐거나 복원됐다고 표시하지 않습니다.

기존 StorageJob v1을 사용하고 결과는 백업 완료와 같은6필드에서 state만 `VERIFIED`입니다: `{schemaVersion:1,state:"VERIFIED",files,bytes,externalReferencesNotCopied,restoreSupported:false}`. bytes는 manifest를 제외한 확인한 payload 합계이며 안전 정수/양수·256MiB 이하입니다. 생성 명령은 COMPLETED만, 검사 명령은 VERIFIED만 수용하고 다른 상태는 계약 오류로 거부합니다. 파일 선택/검사 취소는 자식 종료·정리까지 기다립니다. 기본 백업 동의와 별개로 사용자가 직접 선택한 파일만 읽으며 REC 중에는 디스크 작업 충돌을 피하도록 검사 시작을 막습니다. 기존 요청/저장/DB/모델 worker protocol은 변경하지 않습니다.

## 로컬 데이터 백업 첫 연결 계약 — 2026-10-20

새 `backup_local_data` 요청은 `{schemaVersion:1, consentLocalData:true}` 두 필드만 받습니다. 경로/실행 명령/압축 옵션은 받지 않습니다. native 저장 대화상자에서 새ZIP만 선택하고 앱 데이터의 v8 DB/프로젝트 파일/보정값만 읽습니다. 모델·캐시·로그·외부 참조 미디어는 포함하지 않으며 DB의 메모/외부 경로와 개인 녹음이 포함됨을 동의 전에 알립니다. 기존파일은 덮어쓰지 않습니다.

결과/진행은 기존 StorageJob v1을 사용합니다. 이 첫 앱 경로는 총256MiB/10,000개 이하로 제한하며 기존 progress/binary 한도를 확대하지 않습니다. 결과는 `{schemaVersion:1,state:"COMPLETED",files,bytes,externalReferencesNotCopied,restoreSupported:false}`입니다. files는1~9,999,bytes는1~268435456의 안전 정수입니다. 복원/실제 AppData 교체는 아직 앱에서 지원하지 않습니다.

검증된 번들 Python3.12.15의 표준 SQLite/ZIP 모듈과 실행파일에 내장된 고정 백업 코드만 별도 자식에서 실행합니다. AI 모델/네트워크/임의 shell은 사용하지 않습니다. 내부 JSONL은 별도 schemaVersion1/progress 또는 최종 결과이며 모델 worker protocol은 변경하지 않습니다. native는 녹음 시작을 잠시 막고 프로젝트 writer를 보유해 일관성을 보호합니다. 보정 파일 등 외부 변경은 변경 감지 시 실패 처리합니다. 취소는 직접 자식에 전달하고 신규 staging 정리/종료까지 기다립니다. 게시 직후 늦은 취소는 성공을 실패로 바꾸지 않습니다. 진행 중 창 닫기는 막고 취소·완료를 안내합니다. 저장 대화상자 취소/녹음 중/동시 작업/버전·동의/원격 origin은 실패 계약으로 검사합니다.

개발용 `scripts/backup_local_data.py` CLI는 별도로 앱 종료를 확인하고 총2GiB 이하 백업/지문 확인/새 폴더 복원 미리보기만 제공합니다. CLI의 새 폴더 결과는 실제 AppData 교체·새PC 완전 복원을 의미하지 않습니다. 앱 경로와 개발 CLI의 용량/실행 조건을 구분합니다.

## 단음 음정 궤적 결과 v2: 주기적 흔들림 관측 — 2026-10-20

`analyze_recording_pitch_track` 요청/StorageJob 외피는 기존v1(ID/시각만 전달)을 유지합니다. 결과만 schemaVersion=2/정확히16필드로 바꾸고 기존15필드에 `oscillation: {rateHz, depthCents, cycles, fit} | null`을 추가합니다. motion에 OSCILLATING을 추가하며 해당 값일 때만 oscillation이 있고 다른 motion에서는 null입니다. 프론트 decoder는 기존v1/15필드도 읽되 oscillation=null로 정규화하고v1의 OSCILLATING은 거부합니다. 저장 형식/DB/Python 계약은 변경하지 않습니다.

모든 기존1초/소유권/SHA/누락·클리핑/취소·단음 전용 조건은 유지합니다. 유효율>=90%·최소20점·최소 주기성>=0.95·시간 간격<=80ms·인접 변화<=80cents를 요구합니다. 선형 추세를 제거한 음정 곡선에3~9Hz/0.1Hz 간격의 사인·코사인 최소제곱을 적합해 최고 설명비율fit>=0.85, peak-to-peak 깊이35~150cents, 관측창 환산 cycles>=3일 때만 후보를 반환합니다. 선형 추세의 창 누적 변화 절댓값<=50cents/관측 범위>35cents에서만 OSCILLATING으로 분류합니다. 유지/상승·하강 판정은 기존 조건을 우선합니다. rateHz는3~9/0.1 간격, cycles는 유효 첫·끝 시각 차이×rateHz, fit은0.85~1이고 확률이 아닙니다.

UI는 ‘주기적 음정 흔들림 후보’와 속도Hz·관측 깊이cents/반복 수·곡선 적합도를 표시합니다. 실제 비브라토/손가락 주법·화음/줄·프렛의 분류나 정답 점수가 아닙니다. EXPERIMENTAL/MONOPHONIC_ONLY/NOT_TECHNIQUE_CLASSIFICATION 경고를 계속 필수로 표시하며 기존 Matcher/보정/녹음·점수는 바꾸지 않습니다. 아래15필드/v1 설명은 이전 계약 이력입니다.

## Demucs 명시적 선택 다운로드 — 구현·실제 전송 검증(2026-10-19)

- 기존 `download_ai_model({schemaVersion:1,modelId,downloadConsent:true})`/JSONL v1의 필드는 유지하며 modelId에 `htdemucs_6s`를 추가합니다. 모델 enum·명시적 동의/REC 거부·고정 캐시/UUID 작업 폴더 검증은 유지하고 임의 URL/명령/모델 경로를 받지 않습니다. 프론트는 모델 변경 시 동의/이전 결과를 초기화하며 동작 중에는 모델을 변경하지 않습니다. Demucs의 연구용 가중치 안내/Lead·Rhythm 미지원과 다운로드 약675~676MiB·설치 여유4GiB를 표시합니다.
- 캐시 결과는 기존 정확한7필드로 모델별 검증합니다. Basic Pitch는 기존41개/144366287바이트 또는42개/146364006바이트·0.4.0, Demucs는 기존 cp31033개/707117623바이트 또는 cp31234개/708033316바이트·4.1.0입니다. 선택한 요청 모델과 다른 결과·총량/수량의 교차 조합·임의 필드·잘못된 재사용 수를 거부하며 캐시를 설치 완료로 표시하지 않습니다.
- Python은 해시가 고정된 기존 ABI별 wheel 계획과 Demucs modelFiles2개를 사용합니다. 자동 분석/설치/네트워크가 아니라 명시적 다운로드 작업에서만 받습니다. 기존 설치/marker/음원·완성 캐시는 변경하지 않습니다. 모델 수치·코드를 새 버전으로 교체하지 않습니다.
- 기존 바이트 제한·SHA·원자적 새 파일 게시·디스크 여유·취소 정리를 재사용합니다. 패키지 HTTPS 허용 목록에 고정 Hugging Face 저장소/commit의2개 resolve URL·동일 commit의 config 캐시 경로와 실제 확인한 us.aws.cdn.hf.co의 xet-bridge-us 경로만 추가합니다. CDN의 서명 쿼리는 로그에 남기지 않고 HTTPS/호스트/경로 및 최종 크기/SHA를 검사합니다. 다른 redirect·HTTP·사용자 정보/포트·다른 저장소는 거부합니다.
- 진행률은 전체 바이트 기준5% 단위·최대22개이며 해시/게시 뒤만100%입니다. 정상/실패/취소/손상 기존 캐시·실제 JSONL/캐시 재사용을 검증합니다. 테스트용 작은 DEMO 전송은 실제 모델 설치/분리 성공과 구별합니다.

## cp312 공개 worker 연결 — 구현 및 검증(2026-10-18)

- JSONL protocolVersion:1/설치 확인5필드/음표·분리 결과/모델 알고리즘 버전은 유지합니다. 설치 확인의 pythonVersion은 기존3.10.x 또는 정확히3.12.15만 허용합니다. 지원 범위 밖의3.11·다른3.12 패치는 거부합니다.
- 공개 모델 adapter는 실행 중인 Python으로 고정 프로필을 선택합니다.3.10은 기존 계획,3.12.15는 SHA가 고정된 cp312 계획만 사용하며 모든 설치 패키지 버전과 모델 SHA를 추론 전에 확인합니다. Basic Pitch 로컬 패키지 버전0.4.0+guitarlab.onnx1과 모델 알고리즘 버전0.4.0을 구별합니다. 임의 계획/런타임 경로를 IPC 입력으로 추가하지 않습니다.
- 실제 Rust JSONL 경계 검증은 앞서 격리 설치한 두 환경과 새 worker snapshot/자체 사인파만 사용합니다. Python -I/-B·최소 PATH·고정 실행 파일·UTF-8·timeout·진행/취소/출력 검증을 적용합니다. 기존 관리 marker/앱 기본 실행 경로를 전환하지 않으며 검증 성공을 제품 배포 완료로 표시하지 않습니다.

## 별도 Windows runtime 리소스 후보 — 구현·native 검증(2026-10-18)

- 개발 도구는 해시 고정 런타임·일반 worker 소스/고정 모델 계획·동일 빌드의 라이선스 원문만 새 UUID 리소스 폴더에 복사합니다. 모델 환경/가중치·개인 음원/프로젝트·개발 가상환경은 포함하지 않습니다. 기존 후보를 덮어쓰거나 앱을 자동 종료하지 않습니다.
- 후보는 전체 파일 경로/크기/SHA가 담긴 빌드 lock으로 검증하고 native가 실행 전에 재확인합니다. 리소스 경로는 Tauri resource_dir에서만 얻고 IPC 입력으로 받지 않습니다. 심볼릭 링크/경로 이탈/추가·누락/변조 파일을 거부합니다. 검사·실행은 기존 파일 job의 취소/오류·진행 정책을 따릅니다.
- 명시적 후보 빌드 설정에서만 Python3.12.15와 복사 worker로 환경 확인을 실행합니다. 일반 개발 빌드의 기존 모델 선택/설치 환경은 유지합니다. JSONL과 RuntimeInfo v1은 그대로이며 기본 런타임의 PACKAGE_MISSING은 설치 전 정상 상태입니다. 모델 설치·전환/새 PC 검증을 완료했다고 표시하지 않습니다.

### 불변 앱 데이터 runtime 준비 — 구현·native 검증(2026-10-19)

- 모델 환경을 생성하기 전에 검증된 runtime/고지를 앱 데이터 ai/runtimes/cpython-3.12.15-20261013-r1에 준비합니다. 새 UUID staging 폴더에만 복사·fsync·전체 SHA를 확인하고 같은 볼륨의 rename으로 게시합니다. 기존 설치 경로가 있으면 전체 검증 후 재사용하며 손상된 기존 runtime을 덮어쓰거나 조용히 개발 Python으로 폴백하지 않습니다.
- 정상 취소/실패는 현재 UUID staging만 정리합니다. 이미 게시된 runtime·이전 모델·프로젝트·녹음은 유지합니다. 크래시 잔여 staging 자동 삭제는 후속이며 다른 UUID를 임의 삭제하지 않습니다. 모델 venv는 이 불변 base 경로를 참조하며 폴더 이동/자동 정리를 하지 않습니다.
- native 내부 함수는 검증된 Tauri 리소스/앱 데이터 root·UUID job과 취소/진행만 받습니다. 임의 Python/명령/경로를 프론트 계약에 추가하지 않습니다. 리소스를 포함한 후보의 install_ai_model은 이 불변 base에서 별도 cp312 환경을 준비하고, 리소스 없는 기존 개발 빌드는 기존 경로를 유지합니다.
- Windows의 동일 경로 별칭은 base 디렉터리의 파일 식별자로 확인합니다. DLL 경로 길이 제한에 대응해 검증된 절대 import 경로를 NT 확장 경로로 정규화하고 모델 포함 검사도 같은 표기로 비교합니다. 실제 sys.prefix/모델 버전/분석 결과를 재작성하지 않으며 검색 디렉터리를 추가하지 않습니다.

### cp312 오프라인 관리 설치 — 구현·native 검증(2026-10-19)

- 기존 install_ai_model/prepare_install·check_install·activate_install·discard_install의 JSONL 필드는 그대로입니다. Python3.12.15 bootstrap에서만 고정 cp312 계획을 사용하고 pip26.2.1·setuptools75.3.2를 확인합니다. 자체 검증 fixture를 worker/fixtures에 포함하고 고정 SHA를 확인한 뒤만 모델을 실행합니다. 임의 모델/명령/URL 입력은 추가하지 않습니다.
- 새 환경은 ai/environments/basic-pitch-0.4.0-onnx1-cp312/UUID 및 demucs-4.1.0-cp312/UUID입니다. 각42/32개 고정 wheel·Demucs의 기존2개 가중치 캐시만 오프라인 사용합니다. install→pip check→고정 버전/모델 SHA·실제 자체 음원→새 marker 순서이고 실패/취소는 신규 UUID만 정리합니다.
- 새 marker는 ai/basic-pitch-cp312-active.json·demucs-cp312-active.json이며 정확한 기존7필드입니다. planSha256은 해당 cp312 계획 지문, bootstrapSha256은 Python archive SHA7a2aef48e5ee569e310b29b32681debbc5d888e92790d85331a47736c6b06aad, selfTest는 기존 모델별 실제 자체 검증 문자열입니다. 구형 marker/환경은 변경하지 않습니다. 새 marker가 있으면 native는 새 환경을 먼저 검증하고 손상 시 조용히 구형 환경으로 폴백하지 않습니다.
- 모델 실행의 worker 리소스 root는 Tauri에서 전달한 내부 경로만 사용합니다. 앱 기본 runtime의 PACKAGE_MISSING과 개별 모델 venv의 FILES_VERIFIED/실제 검증을 구별합니다. Basic Pitch cp312 캐시 경로는 연결했으나 새 UI 수용/실제 앱 데이터 전환·Demucs 다운로드 UI·새 PC 검증은 후속이며 이번 격리 설치 성공을 해당 기능 완료로 표시하지 않습니다.

### Basic Pitch cp312 캐시 — 구현·캐시 재사용 검증(2026-10-19)

- download_ai_model의 기존7필드 결과/명시적 동의는 유지하고, 리소스가 있는3.12 빌드에서는42개/146,364,006바이트를, 기존 개발 빌드에서는41개/144,366,287바이트를 사용합니다. 필드 조합과 재사용 수를 Rust/프론트에서 엄격히 검사합니다. totalBytes는 설치 대상 캐시 바이트이며 네트워크 전송량과 구별합니다.
- ONNX fork/모델 가중치는 기본 앱에 포함하지 않습니다. 동의한 다운로드 작업에서만 고정 원본 wheel758,279바이트를 공식 PyPI에서 받고 전체 SHA 확인 후 표준 라이브러리로 고정 메타데이터 recipe를 적용합니다. 생성한 fork는 기존 계획의2,249,897바이트/SHA53ca6709be7a4599d66df70d5e6618038f2ee5dfa7252eb2b1fda5570a00eed6와 일치할 때만 캐시에 게시합니다. 원본 코드/모델/LICENSE/NOTICE를 보존하며 패키지를 실행하지 않습니다.
- 진행100%는 전체 해시·게시 완료 뒤에만 반환합니다. 실패/취소 후 native는 현재 UUID 작업 폴더의 download.part/고정 fork 파일/검증 가능한 onnx-UUID.part만 정리하고, 알 수 없는 파일·기존 캐시는 삭제하지 않습니다. Demucs 다운로드 UI는 여전히 후속입니다.

## cp312 별도 호환성 검증 도구 — 구현 및 검증(2026-10-18)

- 사용자 승인으로 Python3.12.15 Windows x64의 별도 호환성을 검사합니다. 기존 앱 IPC/7필드 marker/DB와 cp310 환경을 변경하지 않습니다. 검증 자료는 src-tauri/target/runtime-validation에 격리하며 앱에서 활성화하지 않습니다.
- 런타임 archive는 고정22,019,610바이트/전체 SHA 확인 후 일반 파일만 새 폴더에 풉니다. 경로 이탈/ADS·장치 파일명/링크·중복·파일 수/크기 초과를 거부하며 취소/실패는 새 폴더만 정리합니다. 런타임3.12.15/pip26.2.1/독립 prefix는 별도로 확인합니다.
- Basic Pitch0.4.0의 코드/모델/LICENSE/NOTICE는 보존하고 ONNX 전용 의존성·명시적 로컬 패키지 버전0.4.0+guitarlab.onnx1·변경 고지/WHEEL/RECORD만 다시 만듭니다. 원본 wheel을 덮어쓰지 않습니다. fork SHA는53ca6709be7a4599d66df70d5e6618038f2ee5dfa7252eb2b1fda5570a00eed6입니다.
- 새 두 계획은 COMPATIBILITY_VALIDATION_ONLY이며 기존 고정 버전의 cp312 또는 호환 안정 ABI wheel/전체 SHA·용량을 공식 PyPI/PyTorch CPU 메타데이터로 확인합니다. Basic Pitch42개/Demucs32개이며 중복 제거68개/775,707,515바이트입니다.52개는 기존 캐시/로컬 fork를 재사용하고16개/746,526,892바이트를 승인된 별도 검증용으로 받습니다. 모델 가중치는 기존 해시 검증 파일을 재사용합니다.
- 분석 코어는 검증된 모델 resolver를 전달받도록 분리하되 기존 공개 adapter/worker 계약은 유지합니다. 새 probe는 고정 새 계획·모든 패키지 버전/모델 SHA·자체 fixture SHA를 확인한 resolver만 사용합니다. 실제 Basic Pitch8음과 Demucs4초 분리를 기존3.10 기준 결과와 비교하며 mock 분석을 사용하지 않습니다. 서브프로세스는 숨김/고정 argv·timeout/취소·종료 wait를 유지합니다.
- 새 런타임/설치 prefix·snapshot 코드 경로로 격리 실행한 성공은 호환성 검증 결과일 뿐 독립 Tauri Sidecar/새 PC 배포 완료가 아닙니다. 앱의 native 경로 전환/설치 UI·마이그레이션은 후속 계약으로 분리합니다.

## Demucs 기존 다운로드의 관리 캐시 이관 — 구현 및 검증(2026-10-18)

- 개발 도구 `python -m guitarlab_ai.cache_demucs --import-cache`는 기존 고정31개 wheel과 기존 개발 환경의2개 모델 파일만 읽어 앱 데이터 ai/downloads/demucs-4.1.0-htdemucs-6s-windows-cp310에 복사합니다. 다운로드·설치·모델 실행·개인 음원 읽기는 하지 않습니다. 경로/URL/shell 인자를 받지 않습니다.
- 고정 manifest 정규화 SHA 0b4407faad80689e6b0a0c51816a1077eb7650cb20ec094ee1dc6132adc5e33d,33개/707,117,623바이트와 각 파일의 크기/전체 SHA를 확인합니다. 새 UUID 작업 폴더의 단일 part→fsync→덮어쓰기 없는 게시를 사용하며 이미 검증된 캐시는 재사용합니다. 취소/실패는 현재 part와 빈 작업 폴더만 정리합니다. 원본 캐시/모델·기존 환경은 보존합니다.
- 결과는 schemaVersion:1/modelId:htdemucs_6s/modelVersion:4.1.0/state:CACHE_VERIFIED/artifactCount:33/totalBytes:707117623/reusedFiles:0..33입니다. CACHE_VERIFIED는 설치 완료가 아니며 아직 앱 IPC/UI 계약에 추가하지 않습니다. 이 단계는 기존 사용자 승인 설치 파일의 로컬 재사용이며 모델 가중치를 Git/앱 배포물에 포함하지 않습니다.

## 관리 설치의 Demucs 확장 — 구현 및 검증(2026-10-18)

- 기존 install_ai_model/내부 prepare_install·check_install·activate_install·discard_install의 허용 modelId에 htdemucs_6s만 추가합니다. 다른 임의 모델/경로/URL은 거부합니다. 기존 Basic Pitch 계약과 marker는 유지합니다.
- Demucs는 별도 ai/environments/demucs-4.1.0-cp310/UUID에 캐시31개 wheel+기존 고정 setuptools를 오프라인 설치하고 캐시의 모델2개를 검증해 models/htdemucs_6s에 복사합니다. pip check→모든 고정 버전/모델 SHA→자체4초 음원의 실제 두 stem/형식 검증을 통과한 환경만 활성화합니다. 개인 음원은 사용하지 않으며 검증 산출물은 격리 임시 폴더에서 정리합니다.
- ai/demucs-active.json은 기존 marker와 같은 정확한7필드이며 modelId:htdemucs_6s/modelVersion:4.1.0/planSha256:0b4407faad80689e6b0a0c51816a1077eb7650cb20ec094ee1dc6132adc5e33d/selfTest:OWNED_STEM_SPLIT_PASSED와 동일 bootstrap SHA를 요구합니다. 성공 결과6필드도 선택 모델의 ID/버전/selfTest만 달라집니다. 교차 모델 응답/marker는 거부합니다.
- native의 Demucs 파일 확인/분리는 유효한 관리 marker를 우선 사용하고 marker가 없을 때만 기존 개발 환경을 유지합니다. 손상 marker는 조용히 폴백하지 않습니다. 설치/취소/정리/닫기 guard는 두 고정 모델의 공통 절차를 사용하며 기존 환경을 자동 교체하지 않습니다. Demucs 네트워크 다운로드 UI와 독립 Sidecar/배포 허가를 완료한 것으로 기록하지 않습니다.

## 앱 내 Basic Pitch 설치 job v1 — 구현 및 검증(2026-10-18)

- `install_ai_model({request:{schemaVersion:1,modelId:"basic-pitch"}})`는 버튼의 명시적 로컬 설치/재검증 요청입니다. 경로/URL/명령/다른 모델은 받지 않습니다. 네트워크 없이 기존 캐시만 사용하며 시작 시 REC 중 거부/StorageJob 단일 작업 정책을 적용합니다.
- Rust가 준비 worker→고정 pip 직접 자식(install/check)→새 환경의 자체8음 worker→활성화 worker 순서로 실행합니다. Python 준비/검증/게시 worker는 하위 프로세스를 실행하지 않습니다. 모든 직접 자식은 숨김·출력 제한·timeout·취소 후 kill/wait를 적용합니다. 설치 중 정상 창 닫기는 막고 설치 화면의 취소를 안내합니다. OS 강제 종료 복구/과거 임시 환경 정리는 후속입니다.
- 내부 JSONL v1의 prepare_install/activate_install/discard_install은 modelId와 input:{appDataRoot,environmentId}만 받습니다. ID는 native가 작업 UUID로 정하며 준비 응답은 정확히 schemaVersion/modelId/modelVersion/environmentId/state:PREPARED 또는 ALREADY_ACTIVE입니다. check_install은 modelId만 받고 실제 자체 검증 후 schemaVersion/modelId/modelVersion/state:SELF_TEST_PASSED를 반환합니다. 모두 installation stage/0→100의 자체 단계 진행을 지킵니다. 외부 UI는 내부 단계를 직접 호출하지 않습니다.
- pip 단계는 검증된 cache/42개 고정 lock·준비한 bootstrap 복사본만 사용합니다. no-index/require-hashes/only-binary/no-deps/no-compile/no-cache-dir/버전 확인 비활성화를 유지하며 설치 스크립트/sdist를 실행하지 않습니다. 기존 관리 환경은 pip 재설치 없이 자체 검증 후 재사용합니다.
- 성공 응답은 정확히 schemaVersion:1/modelId:basic-pitch/modelVersion:0.4.0/environmentId:UUID/state:INSTALLED 또는 ALREADY_ACTIVE/selfTest:OWNED_8_NOTES_PASSED입니다. 기존 marker7필드/DB/카피 응답 계약은 유지합니다. 늦은 취소 전에 유효한 새 marker가 게시됐으면 설치 성공을 보존하며, 활성 환경을 정리하지 않습니다.
- 실패/취소 시 native가 알고 있는 새 UUID만 discard worker로 정리합니다. 기존 marker·캐시/다른 환경은 유지합니다. 정리 오류는 AI_SETUP_CLEANUP_FAILED로 표시합니다. 진행 UI는 현재 설치 단계/취소 상태를 표시하며 처리 시간에 대한 추정 퍼센트를 만들지 않습니다. 앱 내 설치는 현재 개발 Python/worker를 요구하며 독립 Sidecar가 아닙니다.
- 설치 프론트는 취소 시 native job의 terminal 상태까지 조회를 유지하고 CANCELED와 정리 오류 ERROR를 구분합니다. 게시 직후의 성공 COMPLETED는 취소 요청보다 우선해 보존합니다. 다른 StorageJob 호출의 기존 즉시 취소 동작은 유지합니다.

## Basic Pitch 앱 데이터 환경 설치/활성화 — 구현 전 계약(2026-10-18)

- 사용자 설치 요청에 따라 개발 설치 도구 `python -m guitarlab_ai.install_managed --install`을 제공합니다. 새 IPC 설치 명령/임의 shell 실행 권한은 추가하지 않습니다. 앱 데이터의 기존 검증 캐시만 사용하고 네트워크·기존 개발 가상환경·프로젝트/DB는 변경하지 않습니다. 앱 내 설치 버튼/독립 Sidecar는 후속입니다.
- 캐시41개/전체 SHA·고정 manifest/lock 일치를 재확인한 뒤 ai/environments/basic-pitch-0.4.0-cp310/새 UUID에 pip 없는 Python3.10 환경을 만듭니다. 설치된 pip22.2.2의 고정 runner를 새 인터프리터에서 실행하고 no-index/require-hashes/only-binary/no-deps/no-compile/no-cache-dir로 설치합니다. subprocess는 고정 argv·숨김·출력 비공개·시간 제한·취소 시 종료/wait를 적용합니다.
- resampy의 암묵적 pkg_resources 의존성은 현재 Python3.10.8의 ensurepip 번들 setuptools63.2.0(1,228,000바이트·고정 전체 SHA)을 추가 다운로드 없이 설치합니다. 별도 bootstrap lock을 기록하며 원래41개 다운로드 manifest는 변경하지 않습니다.
- pip check→고정 버전/모델 해시→SHA가 알려진 자체 sine.wav의 실제8음 분석을 통과한 뒤만 활성화합니다. marker는 정확히 schemaVersion:1/modelId:basic-pitch/modelVersion:0.4.0/environmentId:UUID/planSha256/bootstrapSha256/selfTest:OWNED_8_NOTES_PASSED이며 ai/basic-pitch-active.json에 fsync/덮어쓰기 없는 게시로 저장합니다. 기존 활성 환경은 재검증해 재사용하며 자동 교체하지 않습니다. 실패·취소는 새 작업 환경만 경로 확인 후 정리하며 기존 marker/모델/캐시는 보존합니다.
- native는 Basic Pitch 검증/분석 시 앱 데이터 marker가 있으면 해당 UUID의 관리 환경을 우선 사용합니다. 누락/손상 marker·경로 이탈은 오류이며 개발 환경으로 몰래 폴백하지 않습니다. marker가 없을 때만 기존 개발 환경을 유지합니다. worker 입력/분석 응답·DB 계약은 변경하지 않습니다.
- 이 환경은 현재 PC의 기존 Python 설치와 개발 worker 소스에 의존합니다. 새 PC 독립 배포·Sidecar 완료나 실제 기타 정량 품질을 뜻하지 않습니다. 다운로드 캐시 UI는 설치 상태를 단정하지 않고 별도 모델 검증을 안내합니다.

## Basic Pitch 선택 다운로드 캐시 v1 — 구현 전 계약(2026-10-18)

- `download_ai_model({request:{schemaVersion:1,modelId:"basic-pitch",downloadConsent:true}})`만 허용합니다. 설치 동의는 새 작업마다 요청에 포함하며 false/누락·다른 모델·경로/URL은 거부합니다. REC 중 거부하고 기존 StorageJob 진행/취소를 재사용합니다. 사용자 데이터 업로드는 없습니다.
- 개발 worker JSONL v1에 action download_model/modelId/input:{cacheDir,workDir}를 추가합니다. native가 앱 데이터의 ai/downloads/고정 계획 ID와 별도 작업 UUID 디렉터리를 생성하며 UI는 경로를 전달하지 않습니다. 최대30분, 취소 후1초 유예/직접 자식 종료 정책을 사용하고 native가 현재 작업의 download.part만 정리합니다. 하위 설치 프로세스는 실행하지 않습니다.
- Basic Pitch 고정 manifest의 정규화 JSON SHA와41개/144,366,287바이트를 확인합니다. HTTPS files.pythonhosted.org의 지정 URL만 사용하고 프록시/외부 리다이렉트·임의 버전 탐색·압축 해제·코드 실행을 하지 않습니다. 각 파일의 크기/전체 SHA 일치와 fsync 후 새 캐시 파일을 게시합니다. 기존 파일은 재검증 후 재사용하며 손상된 기존 파일을 자동 덮어쓰거나 삭제하지 않습니다.
- 진행률은 확인한 캐시/실제 받은 바이트 기반5% 단위(최대21회)이며 JSONL 제한을 유지합니다. 성공 응답은 정확히 schemaVersion/modelId/modelVersion/state:"CACHE_VERIFIED"/artifactCount:41/totalBytes:144366287/reusedFiles:0~41입니다. 다운로드 파일 확인은 설치나 분석 가능 상태가 아닙니다.
- 실패는 AI_DOWNLOAD_FAILED/AI_CACHE_INTEGRITY/AI_DISK_SPACE/기존 AI_PROTOCOL_INVALID·CANCELED 등으로 구분합니다. 실패·취소 시 현재 미완성 파일만 정리하고 이미 검증해 게시한 캐시는 남겨 재시도에 재사용합니다. 프로세스 강제 중단 직전 게시된 검증 캐시도 남을 수 있으며 설치는 활성화하지 않습니다. 기존 모델 환경/프로젝트/DB는 변경하지 않습니다. Demucs 다운로드 UI와 실제 환경 설치/Sidecar는 이번 범위 밖입니다.

## 선택 모델 설치 파일 검증 v1 — 구현 전 계약(2026-10-18)

- `verify_ai_model({request:{schemaVersion:1,modelId}})`의 modelId는 basic-pitch/htdemucs_6s만 허용합니다. 임의 경로·명령·URL은 받지 않습니다. 기존 StorageJob 진행/취소·녹음 중 거부·10초 제한을 사용합니다. 기존 inspect_ai_runtime는 테스트 환경 메타데이터 조회로 유지합니다.
- native는 선택한 고정 개발 환경만 실행해 JSONL v1의 새 action verify_model/modelId를 전달합니다. Python은 기존 adapter의 패키지 고정 버전·모델 전체 SHA 검증만 재사용하며 모델 로드/추론·음원 읽기·설치/다운로드를 하지 않습니다. release Sidecar는 아직 미지원입니다.
- 성공 응답은 정확히 `{schemaVersion:1,modelId,modelVersion,pythonVersion,state:"FILES_VERIFIED"}`입니다. 모델 버전은 각각0.4.0/4.1.0이며 요청 ID와 반드시 일치해야 합니다. 파일 검증 성공은 추론/DLL 호환성·분석 품질·재배포 허가 검증을 뜻하지 않습니다.
- 환경/패키지 없음은 AI_MODEL_MISSING, 버전 차이는 AI_MODEL_VERSION, 파일 누락/크기/해시 오류는 AI_MODEL_INTEGRITY, 실패/취소/timeout은 기존 코드로 반환합니다. 경로/예외 원문을 노출하지 않습니다. 오류·취소 후 이전 성공 배지를 표시하지 않습니다.
- 최소 UI는 명시적 모델 선택·검증/취소·고정 설치 계획의 다운로드 용량과 별도 환경·연구용 안내를 표시합니다. 설치 버튼은 제공하지 않으며 선택 설치기/릴리스 배포를 구현한 것으로 표시하지 않습니다. 사용자 데이터·DB/Python의 기존 inspect/transcribe/separate 계약은 변경하지 않습니다.

## 저장 전체 기타 STEM의 AI 카피 입력 v1 — 구현 전 계약(2026-10-18)

- TranscribeRequest에 선택적 `stemId:UUID`를 추가합니다. 미지정/null은 기존 ORIGINAL 입력이며 native 직렬화에서는 None 필드를 생략해 기존 context JSON/hash와 저장 초안 조회를 보존합니다. 지정하면 같은 프로젝트/assetId의 정확한 GUITAR_FULL stem UUID만 허용합니다. ACCOMPANIMENT/외부 프로젝트/다른 원본/손상은 거부하며 최신 set으로 몰래 치환하지 않습니다.
- 새 입력은 기존 stem 전체 검증과 파일 해시를 확인한 뒤 별도 작업 input.wav 사본으로 전달합니다. 기존 Python JSONL v1/Basic Pitch options는 변경하지 않으며 원본·저장 stem을 수정하지 않습니다. 모델 추가 다운로드/사용자 녹음 자동 분석은 하지 않습니다.
- 원본 AiDraft 응답의 기존10개 필드는 유지합니다. STEM 응답만 필수 stemId를 추가하고 inputSha256은 실제 stem WAV 해시입니다. assetId는 부모 ORIGINAL 자산이며 stem/set의 분리 provenance는 기존 저장 관계로 추적합니다. native와 프론트는 요청 source와 응답 stemId/필드 구성을 일치시킵니다.
- SQLite v5/기존004 테이블을 재사용합니다. 요청의 선택 stemId가 문맥 해시에 포함되어 원본/서로 다른 stem/튜닝·싱크·grid 초안을 분리합니다. 저장/복원은 stem의 역할·원본/파일 해시 및 길이와 결과 duration을 재확인합니다. 모델 재실행은 없지만 stem 파일이 누락/손상되면 복원을 거부하며 원본 초안이나 이전 초안을 덮어쓰지 않습니다.
- UI 기본 입력은 프로젝트 원본입니다. 명시적으로 ‘저장된 최신 전체 기타’를 선택한 분석/복원 요청에서만 기존 분리 결과 조회로 최신 GUITAR_FULL UUID를 결정합니다. 그 작업은 해당 UUID로 고정됩니다. 새 set을 만든 이후 UI의 최신 입력은 달라지며 이전 초안 자동 폴백은 없습니다. 과거 set 직접 선택은 이번 범위 밖입니다.
- 소스 선택/문맥 변경은 초안/검토 체크/이전 비동기 응답을 무효화합니다. 빈 검출은 AI_TRANSCRIPTION_EMPTY이며 음표/점수를 생성하지 않고 이전 저장 초안을 유지합니다. 분석→검토→선택 트랙 적용·Undo/Redo·프로젝트 저장은 기존 경로를 재사용합니다. ‘기타 분리’와 ‘카피 분석’은 별도 명시적 동작입니다.

## 저장 STEM의 연주 재생 연결 v1 — 구현 전 계약(2026-10-17)

- `read_project_stem({request:{schemaVersion:1,projectId,assetId,stemId}})`는 기존 StorageJob 진행/취소/REC 중 거부 정책으로 동작합니다. result는 `{schemaVersion:1,projectId,assetId,stemId,bytes}`이고 검증된 한 WAV를 기존 take_storage_bytes로 한 번 전달합니다. UUID·프로젝트·정확한 stem/set·현재 기준 ORIGINAL asset의 일치와 저장 검증을 확인합니다. 임의 경로/URL은 받지 않으며 모델은 실행하지 않습니다. 이전 set의 UUID도 그대로 읽습니다.
- MixDocument/DB v5/Python 계약은 변경하지 않습니다. 준비 시 TAKE와 STEM을 구분한 재생 입력을 받으며 STEM을 RecordedTake로 위장하지 않습니다. 최대8개 레이어/7개 TAKE·읽은 재생 파일 합계64MiB를 적용하고 누락/중복/다른 프로젝트·다른 기준 음원은 거부합니다.
- 명시적 ‘오버더빙 믹스 준비’에서만 저장 STEM을 읽습니다. main PlayerEngine의 원본 media/논리 clock은 유지하며 LOCAL_ASSET 레이어가 없으면 원본 출력 음량만0으로 둡니다. STEM sample의 노래 시각은 원본 시작0ms+layer.offsetMs이고 배속은 main.rate를 따릅니다. TAKE는 기존 songStart/alignment/녹음 배속 공식을 유지합니다.
- 재생/정지/seek/배속/loop/count-in·gain/mute/solo·지속 drift 보정/오류 시 주 재생 중단·취소와 Blob URL 해제를 기존 재생 어댑터에서 공유합니다. WebView 다중 media의 샘플 정밀 동기화나 독립 오디오 엔진을 구현했다고 주장하지 않습니다.
- REC는 기존 선택 입력만 별도 테이크로 기록합니다. STEM은 referenceTakeIds에 넣지 않고 실제 TAKE만 기존 규칙대로 전달합니다. 현재 요청/저장 형식에는 청취한 stem 믹스 전체 snapshot이 없으므로 해당 믹스의 완전한 녹음 시점 재현은 보장하지 않습니다. sourceBackingId는 기준 원본 asset이며 별도 stem UUID로 바꾸지 않습니다.
- 이전 출력 전용 단계의 MIX_STEM_LIVE_UNSUPPORTED 제한을 이 구현/검증 후 해제합니다. 소스 변경/프로젝트 변경은 준비를 해제하며 준비/청취와 설정 저장은 자동 실행하지 않습니다.

## 저장 AudioStem의 출력 믹스 연결 v1 — 구현 전 계약(2026-10-17)

- 기존 MixLayer.kind에 `STEM`을 추가하며 id는 프로젝트의 불변 audio_stems UUID입니다. schemaVersion1의 기존 TAKE/LOCAL_ASSET 문서는 그대로 읽고 새 kind를 같은 native/프론트 빌드에서 함께 지원합니다. DB 스키마와 Python 계약은 변경하지 않습니다. 이전 앱은 STEM 포함 문서를 지원하지 않습니다.
- 저장/렌더/내보내기에서 같은 프로젝트의 정확한 stem/set을 조회해 원본 메타데이터·set JSON/해시·두 stem 행·WAV 전체 샘플/해시를 기존 복원 검증으로 재확인합니다. 새 분석이 생겨도 저장 믹스의 이전 UUID를 최신 stem으로 바꾸지 않습니다. 모델/원본 오디오 내용 재읽기 없이 동작하며 외부 경로나 YouTube 입력은 받지 않습니다.
- 출력은 기존48kHz mono float32/linear resampling·gain/mute/solo/offset·limiter/취소·입력 합계64MiB 정책을 재사용합니다. 44.1kHz stereo stem은 기존 PCM 디코더처럼 두 채널 평균으로 mono 처리합니다. stereo 보존/샘플 정밀 정렬을 새로 보장하지 않습니다.
- UI의 명시적 ‘분리 2개만으로 출력 믹스 구성’은 기존 restore_project_separation을 사용해 최신 완료 결과를 확인하고 현재 편집 중 레이어를 두 STEM으로 교체합니다. 파일/원래 저장 믹스는 자동 변경하지 않으며 ‘믹스 설정 저장’을 눌러야 저장됩니다. 처리 중 취소/프로젝트 변경 뒤 응답은 폐기합니다. 저장된 이전 UUID는 이름 대신 식별자로 표시해도 유지합니다.
- 이번 슬라이스는 출력 미리 듣기/설정 보존/새 WAV 출력입니다. STEM 포함 믹스의 기존 실시간 오버더빙 준비는 `MIX_STEM_LIVE_UNSUPPORTED`로 명시적으로 거부하며 REC 준비 조건도 미완료로 둡니다. 실제 연주 재생 연결은 후속이며 기존 TAKE/LOCAL_ASSET 동작은 유지합니다.

## 분리 AudioStem 영구 보존/재열기 v1 — 구현 전 계약(2026-10-17)

- `separate_project_audio`는 검증한 실제 결과 두 WAV를 새 불변 stem set으로 보존한 후 성공을 반환합니다. 공개 SeparationInfo에 필수 `stemSetId:UUID`·`createdAtMs:안전한 정수`와 각 stems 원소에 `id:UUID`를 추가합니다. 기존 Python JSONL v1/worker 결과와 ScoreDocument/RecordedTake는 변경하지 않습니다. 이 native/프론트 확장은 같은 앱 빌드에서 함께 반영합니다.
- SQLite 추가005는 audio_stem_sets와 audio_stems를 별도 생성합니다. set은 프로젝트/원본 asset의 복합 FK·입력 SHA/모델 provenance/전체 공개 JSON과 해시·DB 완료 순서를 보존하고 stem은 독립 UUID/역할/SHA/크기를 가집니다. 역할은 GUITAR_FULL/ACCOMPANIMENT, status는AI_ESTIMATE입니다. 악보의 Guitar1/2 역할이나 녹음 take ID를 재사용하지 않습니다.
- 새 파일은 앱 데이터 projects/{projectId}/stems/{stemSetId}/{stemId}.wav이며 경로를 요청/반환하지 않습니다. 새 폴더/파일만 만들고 flush/fsync와 출력 검증 후 DB transaction으로 set/두 stem을 함께 공개합니다. 저장 실패/커밋 전 취소는 새로 만든 파일만 정리하고 이전 결과를 보존합니다. 커밋 뒤 늦은 취소는 이미 저장한 결과를 되돌리지 않으며 재열기로 확인할 수 있습니다. 강제 종료의 orphan 폴더 자동 정리는 첫 범위에 포함하지 않습니다.
- 프로젝트당 최대20개 set이며 자동 삭제/덮어쓰기가 없습니다. 한도 초과는 AI_STEM_LIMIT입니다. 성공 저장이 불가능하면 분석 완료로 표시하지 않습니다. 디스크 여유 공간은 실제 새 출력 합계와8MiB 이상의 추가 여유로 확인합니다.
- `restore_project_separation({request:{schemaVersion:1,projectId,assetId}})`는 같은 프로젝트/원본 자산/현재 고정 모델의 최신 완료 set을 찾습니다. 결과는 `{schemaVersion:1,separation:SeparationInfo|null}`이며 존재하면 기존 단발 binary 경로로 두 WAV를 반환합니다. 원본 오디오 파일을 다시 읽거나 Python/모델을 실행하지 않습니다. 원본 DB 메타데이터 SHA·set JSON 해시/스키마/모델·stem 행/파일 경로·크기·헤더/샘플·해시/peak를 재검증합니다. 최신 결과가 손상되면 이전 결과로 조용히 폴백하지 않습니다.
- 새 조회는 기존 StorageJobs 진행/취소·중복 방지와 녹음 중 거부를 사용합니다. 프론트는 명시적인 ‘저장된 분리 결과 불러오기’에서만 재열고 프로젝트/음원 변경·화면 이탈 뒤 응답은 폐기합니다. 영구 보존과 화면 Blob URL의 수명은 구분하며 기존 재생/악보/채점/녹음·믹스는 자동 변경하지 않습니다. 이전 버전의 메모리 결과는 새 버전에서 재분리해야 보존됩니다. 저장 stem의 믹서/카피 입력 연결은 후속 슬라이스입니다.

## Demucs 분리 어댑터 첫 검증 계약 — 2026-10-17

첫 슬라이스는 별도 Python3.10 CPU 환경의 내부 어댑터입니다. 아직 Tauri 공개 명령/설치 UI가 아니며 기존 JSONL v1의 inspect/transcribe 계약은 유지합니다. 후속 연결 전에 별도 separate 액션과 native 결과 검증/저장 계약을 추가합니다.

- `separate_wav(inputPath, allowedRoot, outputDir, cancel, progress)`는 허용 루트 내부의64MiB/60초 이하 RIFF WAV만 읽습니다. 첫 포맷은 PCM16 또는 IEEE float32, mono/stereo·8k~192kHz이며 WAVEX/RF64·압축 포맷은 거부합니다. 실제 데이터 길이/채널·프레임·유한값을 검증하고 원본을 변경하지 않습니다.
- 고정31개 패키지 버전과2개 로컬 모델 파일의 크기/전체 SHA-256을 확인한 뒤 허용된 HTDemucs 클래스만 로드합니다. 자동 다운로드/get_model·legacy pickle 폴백은 없습니다. CPU4스레드 이하/shifts0·모델 기본7.8초 분할로 실행하고 각 분할 전후 취소를 확인합니다. 이는 품질 최적 설정이나 즉시 취소 지연 보증이 아닙니다.
- 출력은 별도 작업 폴더의 새 `guitar.wav`/`accompaniment.wav`,44.1kHz stereo float32입니다. 후자는 resampled 원본에서 추정 기타를 뺀 residual이며 다른5개 모델 출력을 합친 것과 다릅니다. 정수 변환/limiter로 clipping을 숨기지 않습니다. 출력 길이는 resampling 규칙의 프레임 수를 따르며 자동으로 원본 샘플 단위 정밀 정렬을 보장하지 않습니다.
- 내부 결과는 schemaVersion1, inputSha256·modelId/modelVersion/modelRevision/weightsSha256·sampleRate/channels/frames/durationMs/startOffsetMs:0·각 출력의 role/path/sha256/peak를 가집니다. 역할은 GUITAR_FULL/ACCOMPANIMENT이고 분리 정확성·Lead/Rhythm 역할 confidence를 만들어내지 않습니다. 원본/기존 출력은 덮어쓰지 않으며 취소/실패 시 자신이 새로 만든 출력만 정리합니다.
- 기본 단위 검사는 모델 없이 경로/포맷·손상·취소·기존 파일 보존을 검사합니다. 실제 모델 검사는 별도 환경·자체 fixture를 사용하며 성공한 추론과 분리 음질/정량 성능 검증을 구분합니다.

## 원칙

### Demucs 프로젝트 미리보기 연결 v1 — 구현 전 계약(2026-10-17)

- `separate_project_audio({request:{schemaVersion:1,projectId,assetId}})`는 프로젝트 ORIGINAL WAV를 읽어 검증한 새 snapshot만 별도 `.venv-demucs` worker에 전달합니다. 녹음 중 거부하며 기존 StorageJobs 중복 방지/취소를 사용합니다. 임의 경로/URL/실행 코드를 받지 않습니다.
- JSONL v1 start에 action=separate와 input={assetPath,workDir}만 추가합니다. 별도 options는 받지 않습니다. stage=separation의0~100 단조 진행, completed result={separationPath,modelId:'htdemucs_6s',modelVersion:'4.1.0'}입니다. worker는 자신의 작업 폴더에만 두 WAV와 최대16KiB의 새 separation.json을 기록합니다. stdout은 JSONL만 사용합니다.
- native는 입력 SHA/모델 revision/가중치 SHA·예상 경로·WAV 헤더/프레임·모든 샘플 유한값/peak·파일 해시를 재검증합니다. 공개 결과는 schemaVersion1/projectId/assetId/inputSha256/modelId/modelVersion/modelRevision/weightsSha256/sampleRate:44100/channels:2/frames/durationMs/startOffsetMs:0/status:'AI_ESTIMATE'/stems:[{role,sha256,peak,bytes}]이며 외부 경로는 반환하지 않습니다. 단성 음표/악보 트랙/녹음 테이크와 다른 미리보기 데이터입니다.
- native는 검증한 guitar WAV 다음 residual WAV 순서로 합친 binary를 StorageJob에 단발 보관하고 프론트가 기존 take_storage_bytes로 소비합니다. 각 길이는 stems.bytes로 검증해 분할합니다. 원본/기존 악보/보정/테이크·반주 PlayerEngine은 변경하지 않습니다. 첫 미리보기는 화면/프로젝트 전환·앱 종료 시 소실되며 영구 stem 저장과 기존 믹서 연결은 후속입니다.
- 성공/실패/취소 후 자신의 작업 input/출력/json만 정리합니다. native timeout300초·취소 유예1초 후 직접 worker 회수를 사용합니다. worker는 자식 분석 프로세스를 만들지 않습니다. JSONL 최대64줄/줄64KiB/합계256KiB로 제한하며 기존 inspect/transcribe도 동일 상한을 적용합니다. AI_SEPARATION_EMPTY는 침묵/상수 입력 거부, 기타 엔진 오류는 기존 고정 코드를 사용합니다.

- 이 문서는 **초기 설계 계약**입니다. 실제 코드는 구현 Phase에 맞춰 작성하고, 변경 시 문서/계약 테스트를 동기화합니다.
- 외부 경계의 모든 메시지는 `schemaVersion` 또는 `protocolVersion`을 가집니다.
- 가능한 경우 TS와 Rust 모델의 스키마를 공유/생성하며, 타입캐스팅만으로 외부 JSON을 신뢰하지 않습니다.
- 모든 ID는 프로젝트 범위에서 충돌 없는 UUID 문자열. millisecond 및 tick 필드는 이름에 단위를 명시합니다.

## 공통 타입 초안 (TypeScript 형태)

```ts
type UUID = string;
type Judgement = 'COOL' | 'GOOD' | 'MISS';
type JudgementDetail =
  | 'EARLY' | 'LATE' | 'ON_TIME' | 'WRONG_NOTE'
  | 'UNVERIFIED' | 'SKIPPED' | 'UNSUPPORTED';

type NoteEvent = {
  id: UUID;
  trackId: UUID;
  startTick: number;       // integer >= 0
  durationTicks: number;   // integer > 0
  pitchMidi: number;       // 0..127; bend is separate data
  stringIndex?: number;    // 1..6 (1=high E)
  fret?: number;           // 0..24 default, instrument-specific
  velocity?: number;       // 0..127
  confidence?: number;     // 0..1, AI result only
  source: 'manual' | 'import' | 'ai';
  articulations?: string[];
};

type ScoreDocument = {
  schemaVersion: 1;
  id: UUID;
  title: string;
  ppq: number;
  tempoMap: Array<{ tick: number; bpm: number }>;
  timeSignatures: Array<{ tick: number; numerator: number; denominator: number }>;
  syncAnchors: Array<{ scoreTick: number; audioTimeMs: number }>;
  tracks: Array<{
    id: UUID;
    name: string;
    tuningMidi: number[]; // ordered strings 1..6
    capo: number;
    maxFret: number;
    notes: NoteEvent[];
  }>;
};

type InputPitchEvent = {
  eventId: UUID;
  playbackEpoch: number;
  captureSampleIndex: number;
  capturedMonotonicNs: string; // integer serialized as string; JS 53-bit precision 보호
  playedSongTimeMs: number;
  onsetConfidence: number;
  pitchMidi: number;
  pitchCentsOffset: number;
  pitchConfidence: number;
};

type JudgementEvent = {
  schemaVersion: 1;
  id: UUID;
  sessionId: UUID;
  attemptId: UUID;
  playbackEpoch: number;
  noteId: UUID;
  judgement: Judgement;
  detail: JudgementDetail;
  deltaRealMs: number | null;
  expectedPitchMidi: number;
  detectedPitchMidi: number | null;
  confidence: number | null;
  scoreAwarded: number;
  comboAfter: number;
};
```

> `UNVERIFIED/SKIPPED/UNSUPPORTED`는 `Judgement`가 아니라 **non-scored outcome**으로 별도 결과형을 구현하는 것이 더 안전합니다. 구현 시 `ScoreOutcome = Judged | NotScored` discriminated union으로 확정하고 TS/Rust 양측 타입을 맞추세요. 위 타입은 채점 성공 이벤트의 기본 형태만 보여줍니다.

## 권장 최종 outcome 구분

```ts
type ScoringOutcome =
  | { kind: 'JUDGED'; judgement: 'COOL' | 'GOOD' | 'MISS'; detail: 'EARLY' | 'LATE' | 'ON_TIME' | 'WRONG_NOTE'; scoreAwarded: number }
  | { kind: 'NOT_SCORED'; reason: 'UNVERIFIED' | 'SKIPPED' | 'UNSUPPORTED'; scoreAwarded: 0 };
```

UI `JudgementEvent` 저장 시 최종 outcome discriminator를 필수화하는 migration이 필요할 수 있습니다. Phase 3 이전 결정하고 유지하세요.

## Tauri command 계약 (초안)

| Command | 요청 | 성공 응답 | 에러 |
|---|---|---|---|
| `list_projects` | `{}` | `{projects: ProjectSummary[]}` | STORAGE_ERROR |
| `create_project` | `{title, sourcePath?}` | `{projectId}` | FILE_INVALID 등 |
| `load_score` | `{projectId}` | `{score: ScoreDocument}` | FILE_NOT_FOUND |
| `save_score` | `{projectId, expectedRevision, score}` | `{revision}` | REVISION_CONFLICT |
| `list_audio_devices` | `{}` | `{devices: DeviceInfo[]}` | AUDIO_DEVICE_UNAVAILABLE |
| `start_audio_input` | `{deviceId, profileId?}` | `{streamId, negotiatedConfig}` | AUDIO_PERMISSION_DENIED |
| `stop_audio_input` | `{streamId}` | `{stopped: true}` | INPUT_NOT_ACTIVE |
| `start_practice` | `{projectId, scoreRevision, trackId, settings}` | `{sessionId, attemptId, epoch}` | CALIBRATION_REQUIRED 등 |
| `stop_practice` | `{sessionId}` | `{summary}` | SESSION_NOT_FOUND |
| `start_analysis` | `{projectId, assetId, modelId, options}` | `{jobId}` | AI_MODEL_MISSING |
| `cancel_analysis` | `{jobId}` | `{status}` | JOB_NOT_FOUND |

- `sourcePath` 등 경로는 UI에서 임의 텍스트 입력으로 수집하지 말고 file picker에서 승인을 받아 취급합니다.
- Tauri Rust API와 실제 command serialization naming(camelCase/snake_case)은 adapter 계층에서 명시적으로 일치시킵니다.

## Tauri event 계약

### Phase 4 저장 계약 — 구현 중 (2026-10-14)

- 저장소는 앱 데이터 경로의 SQLite와 `projects/{UUID}/` 파일을 사용합니다. DB `user_version` migration·foreign_keys·WAL·synchronous FULL,5초 busy timeout. 새 버전/손상 DB는 덮어쓰지 않고 STORAGE_ERROR로 중단합니다.
- 프로젝트/asset/revision/session/attempt ID는 UUID이며 사용자 파일 경로는 native picker 승인으로만 얻습니다. 공개 command에서 임의 절대 경로를 받지 않습니다. 외부 참조는 OS 절대 경로를 native에만 보관하고 UI에는 이름·상태·크기/hash를 반환합니다. managed 파일은 고정 UUID 기반 경로만 사용합니다.
- Asset import는 MANAGED(복사)/REFERENCE(참조)를 사용자가 선택합니다. 원본 악보8MiB/음원256MiB 한도, 유효 확장자/헤더 검사와 SHA256·크기를 기록합니다. 읽기/복사는별도 blocking task, 취소·바이트 진행 상태 제공. 동일 프로젝트의 kind/hash 중복은 기존 asset을 안내하고 원본 삭제 없음.
- 외부 참조 누락은 MISSING 상태로 열며 사용자가 재연결한 파일의 hash/크기가 기존과 같은지 확인합니다. 다르면 ASSET_MISMATCH로 거부하고 기존 reference를 보존합니다. 참조 경로와 managed 경로를 혼용하지 않습니다.
- 관리용 복사본 누락/손상도 같은 hash의 원본 선택으로 복구합니다. `projects/{projectId}/assets/{assetId}/restores/{UUID}.{extension}`의 새 불변 파일을 만든 뒤 asset 연결만 갱신하고 기존 복사본·사용자 원본을 덮어쓰지 않습니다. 이 경로도 고정 UUID 구조/앱 내부 canonical 검증을 적용하며 실패 시 이전 연결을 유지합니다.
- 저장 악보는 entities/score.ts의 실제 schemaVersion1 계약을 Rust에서 재검증합니다. tracks/notes/tempo/time signature/sync anchors와 ID 관계·수치/크기 제한을 검사합니다. 기존 원본 bytes asset을 함께 보존하며 normalized score와 원본이 별도 산출물임을 명시합니다.
- `save_project_revision`은 schemaVersion/projectId/expectedRevision과 악보·선택 트랙/재생 위치·배속·loop/음원 asset 연결을 받습니다. 새 UUID 파일을 create_new·flush/sync·rename한 뒤 DB transaction에서 revision/head를 커밋합니다. 충돌은 REVISION_CONFLICT, 취소는 CANCELED. 기존 revision/원본 파일은 변경·삭제하지 않습니다. 커밋 전 중단으로 남은 미참조 산출물은 자동 삭제하지 않으며 이전 head를 복구합니다.
- `create_project`, `list_projects`, `open_project`, `save_project_revision`, picker 기반 asset import/relink, binary asset 읽기 및 작업 취소/진행 조회를 연결할 예정입니다. 구현된 command 이름·요청/응답은 연결 시 추가 확정하며 아직 호출 가능하다고 간주하지 않습니다.
- 실제 연습 기록은 native matcher의 불변 설정/입력 보정/profile·scoringVersion과 저장 score revision/track에 연결합니다. 기존 메모리128개를 넘는 전체 최종 이벤트를 SQLite에 저장하고 (attemptId,event sequence)로 중복 방지합니다. frontend 임의 점수 입력을 저장 command로 받지 않습니다. RUNNING 기록은 앱 재실행 시 INTERRUPTED로 복구하며 이미 확정된 결과를 재판정하지 않습니다.
- 결과 비교는 동일 revision/track/rate/판정 설정·보정/algorithm만 묶습니다. 감점 제외는 분모 제외, 동점은 먼저 완료된 유효 FINISHED 시도를 유지합니다. 실패/중단 시도를 최고점으로 사용하지 않습니다.
- 연습 기록 연결에는 선택적 `archive:{projectId,sessionId,rangeStartMs,rangeEndMs}`를 start_practice_attempt 요청에 추가할 예정입니다. scoreRevision은 저장된 revision UUID를 사용하며 native가 해당 악보/track·공격 음·싱크와 요청 구간의 전체 목표가 일치하는지 검사합니다. 같은 sessionId의 불변 config가 바뀌면 거부하고 새 sessionId로 시작합니다. archive 없는 기존 연습은 메모리 모드로 유지합니다.
- 기록 조회는 schemaVersion1·프로젝트/session/attempt ID·revision/track/scoringVersion·configFingerprint·기록 상태/시간·native snapshot을 반환합니다. 중단 복구의 기록 상태 INTERRUPTED와 마지막 snapshot의 RUNNING을 구분합니다. 원본 snapshot 최근128개 표시와 별개로 전체 이벤트는 별도 페이지 조회하며 JSON/hash 손상은 STORAGE_ERROR, sequence 유실은 ARCHIVE_EVENT_GAP으로 처리합니다.

#### Phase 4 command 확정 — 후보 연결 중

모든 요청은 `{request:{schemaVersion:1,...}}`이며 알려지지 않은 필드를 거부합니다. 파일 경로를 받는 command는 없습니다.

| command | 추가 요청 필드 | 응답 |
|---|---|---|
| `create_project` | title, artist:null 또는 문자열, mode:copy/practice/performance | schemaVersion, project |
| `list_projects` | 없음 | schemaVersion, projects |
| `open_project` | projectId | 파일 job, 완료 result:{schemaVersion,project,revision:null 또는 RevisionDocument,assets} |
| `save_project_revision` | projectId,expectedRevision,scoreAssetId,score,workspace | 파일 job, 완료 result:{schemaVersion,revision} |
| `pick_project_asset` | projectId,kind:SCORE_IMPORT/ORIGINAL,storage:MANAGED/REFERENCE | OS picker→import job, 완료 result:{schemaVersion,asset,duplicate} |
| `relink_project_asset` | projectId,assetId | OS picker→동일 hash 확인 job, 완료 result:{schemaVersion,asset} |
| `read_project_asset` | projectId,assetId | binary 읽기 job, 완료 result:{schemaVersion,name,bytes} |
| `get_storage_job`, `cancel_storage_job` | jobId | JobSnapshot |
| `take_storage_bytes` | jobId | 완료 binary 결과의 ArrayBuffer,1회 소비 |
| `list_practice_records` | projectId | schemaVersion,attempts |
| `list_practice_events` | projectId,attemptId,afterSequence,throughSequence | schemaVersion,events(최대500개, 증가하는 sequence) |

`JobSnapshot`은 schemaVersion/jobId/state(PICKING/RUNNING/CANCELING/COMPLETED/CANCELED/ERROR), completedBytes/totalBytes, result:null 또는 완료 JSON, errorCode:null 또는 고정 코드입니다. 한 파일 작업만 실행하며 picker 취소 요청 후 실제 창 종료 전에는 새 작업을 막습니다. 이미 커밋 완료 후 도착한 취소는 저장 성공을 취소로 위조하지 않습니다. binary 결과는 raw IPC Response이며 오디오 배열을 JSON으로 전달하지 않습니다. UI는 오래된 job 결과를 새 작업에 적용하지 않고 취소/진행·오류를 표시합니다.

최고 점수 동점은 native SQLite transaction에서 처음 FINISHED를 기록한 `completedOrder`가 작은 시도를 유지합니다. 완료 시각이 같은 millisecond여도 안정적으로 구별하며 동일 완료의 재시도는 순서를 바꾸지 않습니다. FINISHED 외 상태 또는 유효 판정 분모가0인 시도는 최고 기록 후보에서 제외합니다.

이벤트 조회는 선택 snapshot.eventSequence를 throughSequence로 고정합니다. 조회 도중 RUNNING 시도가 증가해도 해당 상한까지의 일관된 기록을 읽으며, frontend는 연속 sequence/중복 최종 note ID/총 점수와 판정 수를 snapshot과 대조합니다. 마디 정확도는 기존 matcher와 동일하게100×(COOL+0.5×GOOD)/(COOL+GOOD+MISS)를 사용하고 감점 제외는 분모에서 뺍니다.

- `player://position`: `{schemaVersion, audioTimeMs, playbackEpoch, rate, status}` — UI 가시 표시용. **입력 판정의 clock source로 사용 금지**.
- `audio://status`: `{schemaVersion, deviceId, state, negotiatedConfig?, levelDbfs?, droppedFrames?}`.
- `practice://outcome`: 최종 `ScoringOutcome` 및 note/attempt identity.
- `practice://diagnostic`: 임시 개발 진단. 크기가 큰 PCM buffer 방송 금지.
- `analysis://progress`: `{schemaVersion, jobId, stage, completed?, total?, percent?, status}`.

> 권고: 재생 위치 이벤트는 UI 갱신에만, 판정에 필요한 원시 clock mapping은 Rust `PlaybackCoordinator`의 별도 시간기준을 사용. WebView가 재생 master라면 Rust에 clock anchor를 지속 동기화하는 PoC가 필요합니다.

## Python JSONL IPC v1

**stdin (요청 예시)**

```json
{"protocolVersion":1,"type":"start","jobId":"example-uuid","action":"transcribe","input":{"assetPath":"APP_MANAGED_ASSET_PATH","startMs":0,"endMs":8000},"options":{"modelId":"basic-pitch"}}
```

```json
{"protocolVersion":1,"type":"cancel","jobId":"example-uuid"}
```

**stdout (응답 예시)**

```json
{"protocolVersion":1,"type":"progress","jobId":"example-uuid","stage":"transcription","percent":58}
```

```json
{"protocolVersion":1,"type":"completed","jobId":"example-uuid","result":{"notesPath":"APP_MANAGED_RESULT_PATH","modelId":"basic-pitch","modelVersion":"PINNED_AT_BUILD"}}
```

```json
{"protocolVersion":1,"type":"failed","jobId":"example-uuid","error":{"code":"AI_MODEL_MISSING","message":"Required model is not installed"}}
```

- 메시지는 줄당 1개 JSON, UTF-8. 읽기/쓰기 바이트 상한, 잘못된 JSON, 중복 jobId, 긴 무응답 timeout 처리.
- 사용자 임의 경로를 Python subprocess `shell=True`에 이어붙이지 않습니다.
- 응답의 파일 경로는 지정된 `analysis/{jobId}` 영역 안에 존재하고 실제 파일/무결성 검사를 통과해야 DB에 등록.
- cancel 완료 시 `canceled` event를 명시. subprocess 실패·강제 종료도 Rust가 실패로 기록.

## 오류 응답 규격

### AI 초안 보존·명시적 적용 v1 — 구현 전 계약(2026-10-17)

- 실제 transcribe 성공 결과를 반환하기 전에 SQLite 추가 migration004의 ai_transcription_drafts에 별도 불변 행으로 저장합니다. request(프로젝트/자산·튜닝/앵커/grid)와 실제 결과/원본 SHA-256·모델 버전/검토 사유를 함께 보존하고 기존 악보/revision은 바꾸지 않습니다. worker가 출력한 값을 native에서 검증한 뒤에만 기록하며 JS가 임의 분석 결과를 저장하는 명령은 없습니다. 프로젝트당 최대100개/결과2MiB, 기존 행 삭제/덮어쓰기 없음. 저장 실패는 분석 성공으로 표시하지 않습니다.
- `restore_transcription_draft({request:TranscribeRequest})`는 StorageJob으로 현재 프로젝트/asset·튜닝/앵커/grid가 일치하는 가장 최근 초안을 조회합니다. 응답 `{schemaVersion:1,draft:AiDraft|null}`. 원본 asset의 등록 SHA와 다른 결과·손상 JSON/해시·다른 프로젝트/문맥은 복원하지 않습니다. 모델 미설치여도 기존 초안 조회는 가능하며 새 추론/다운로드를 하지 않습니다. 조회/커밋 전 취소를 확인하며 커밋 직후 늦은 취소에 이미 보존된 초안은 삭제하지 않습니다.
- 적용은 별도 사용자 체크와 ‘선택 트랙에 초안 적용’ 버튼에서만 수행합니다. 현재 미리보기의 지원되는 단성 음표 전체를 선택한 한 트랙에 교체하고 source=ai를 보존합니다. 다른 트랙/역할/튜닝/템포/싱크/원본 바이트·기존 저장 리비전은 유지합니다. 미지원 화음/운지/음가/렌더 실패면 적용하지 않습니다. 적용 시 기존 editor history/일시정지·새 epoch를 사용하며 Undo/Redo 및 명시적 ‘프로젝트 저장’으로 새 불변 리비전이 생성됩니다. 자동 정답/검토 완료 판정으로 바꾸지 않습니다.
- 저장 초안은 같은 문맥에서 최신 한 개를 UI로 다시 읽는 첫 범위입니다. 과거 초안 목록/개별 삭제·선택·승인 이력/적용 리비전과의 영구 ID 연결은 후속입니다. 현재 ScoreDocument v1/Python JSONL v1은 변경하지 않습니다. 초안의 activation/검토 metadata는 별도 보존되며 편집 후 실제 음표 source는 기존 편집 규칙을 따릅니다.

### 로컬 WAV AI 초안 미리보기 v1 — 구현 전 계약(2026-10-17)

- `transcribe_project_audio({request:{schemaVersion:1,projectId,assetId,tuningMidi:number[6],syncAnchors:SyncAnchor[],grid:60|120|240|480|960}})`는 같은 프로젝트의 로컬 ORIGINAL WAV asset만 읽습니다. ID/크기/종류/해시를 검증하고 앱 데이터 projects/{projectId}/analysis/{jobId}의 새 input.wav로 복사한 뒤 별도 승인 설치된 dev 모델 환경을 실행합니다. 임의 URL/외부 경로/코드를 받지 않습니다. 녹음 중 거부하고 기존 StorageJob 조회/취소/중복 방지를 사용합니다.
- 처음은60초/64MiB·PCM16/float32·mono/stereo WAV만 지원하며 분리 없이 전체 로컬 파일을 카피합니다. 혼합 악기 음원의 기타만 분리했다고 표시하지 않습니다. 모델 환경이 없으면 AI_MODEL_MISSING입니다. transcribe worker timeout180초·취소 후1초 회수, 기존 JSONL 줄/총량 상한을 유지하며 진행0/100만 실제 시작/완료에 표시합니다.
- worker start의 action=transcribe, input={assetPath,workDir}, options={tuningMidi,syncAnchors,grid}. input.wav는workDir 바로 아래의 검증 snapshot이어야 합니다. worker는 결과 최대2MiB를 새 notes.json에만 기록하고 completed result={notesPath,modelId:'basic-pitch',modelVersion:'0.4.0'}를 반환합니다. native가 예상 결과 경로/실제 파일/크기/스키마·음역/운지·시간/유한값·검토 사유를 재검증한 뒤에만 공개 결과를 반환합니다. 성공/실패/취소 후 자신이 만든 작업 파일만 정리하며 원본을 수정하지 않습니다.
- 공개 결과={schemaVersion:1,projectId,assetId,inputSha256,modelId,modelVersion,status:'AI_DRAFT',confidenceMeaning:'MEAN_NOTE_ACTIVATION',durationMs,notes:[정량화/운지 계약 결과]}. confidence는 평균 note activation이며 정답 확률이 아닙니다. 미리보기는 현재 악보/채점 목표를 변경하지 않고 입력 파일/악보 문맥이 바뀌면 오래된 결과를 폐기합니다.
- 이번 슬라이스의 초안은 메모리 미리보기/검토 전용입니다. 사용자 승인 후 기존 악보 대체/영구 초안 저장·모델 설치 UI·stem 분리는 후속이며 미구현으로 표시합니다. 지원하지 않는 화음/운지는 표와 검토 사유를 남기고 무손실 TAB 렌더를 주장하지 않습니다.

### Basic Pitch 개발 adapter — 구현 전 계약(2026-10-17)

- 사용자가 Basic Pitch0.4.0/고정41개 wheel의 다운로드·별도 개발 환경 설치를 승인했습니다. 기존 테스트 환경과 사용자 파일을 변경하지 않습니다. 패키지 설치는 고정 SHA-256/바이너리 wheel만 허용합니다.
- 로드 전41개 설치 버전과 manifest의 ONNX 파일 경로/크기/SHA-256을 검증합니다. 모델 해시는 고정된 원본 wheel SHA 검증 후 내부 nmp.onnx에서 도출한 값입니다. 설치 여부 조회와 실제 로드 검증은 구분합니다. 미설치/다른 버전/가중치 손상은 고정 오류로 실패하며 우회 로드하지 않습니다.
- 첫 Python adapter는 작업 영역 안의 로컬 WAV(PCM16/float32, mono/stereo,8~192kHz,최대60초/64MiB)를 검증하고 CPU ONNX 추론합니다. URL/다른 영역/손상/비유한 샘플/빈 결과를 거부합니다. 파일/음표를 외부로 전송하거나 원본을 수정하지 않습니다. 공개 자체4초 fixture로 먼저 검증합니다.
- 출력 onset/offset은ms·pitch는MIDI, confidence에는 Basic Pitch의 평균 note activation을 전달하며 정답 확률로 해석하지 않습니다. 최대2,000음, 원래 모델 피치를 임의 보정하지 않고 후처리의 검토 사유를 보존합니다. 모델 프레임 사이에서 취소를 검사하고 프로세스 kill 회수는 기존 Rust 경계가 담당합니다.
- 실제 앱의 분석 command/AI 초안 승인·저장은 adapter 검증 후 별도 계약/구현합니다. 모델 설치만으로 기존 inspect의 usable=false 정책을 바꾸지 않습니다.

### Phase 6 정량화/운지 순수 도메인 — 구현 전 계약(2026-10-17)

- Python 내부 `DetectedNote(onset_ms,offset_ms,pitch_midi,confidence)`를 입력받으며 원곡 시각 단위는ms입니다. 분석 구간 오프셋은 adapter가 더한 뒤 전달해야 합니다. 입력 최대2,000음/10분, 피치0~127 정수·유한0~1 confidence, onset>=0·offset>onset을 검사합니다. 음원 추론이나 자동 템포 검출을 수행하는 함수가 아닙니다.
- 사용자 지정 단조 증가 sync anchors의 ms→tick piecewise mapping을 사용합니다. 기본PPQ960에서 선택 grid(60/120/240/480/960tick)에 가장 가까운 위치로 반올림하고 최소 길이는grid입니다. 원래 onset/offset·confidence를 보존하며 양자화 오차/저신뢰/시간 중첩/음역 밖은 review 이유로 반환합니다. 결과는 검토 전 AI 초안 내부 데이터이며 기존 ScoreDocument/채점 목표에 자동 적용하지 않습니다.
- 운지는6개 MIDI 튜닝·최대36프렛 제약 내 모든 가능한 줄/프렛을 반환합니다. 단성 연속 구간은 프렛/줄 이동 비용으로 권장 후보를 선택하되 정답으로 확정하지 않습니다. 화음/중첩 구간·음역 밖 음은 자동 선택하지 않고 검토 표시하며 피치를 옥타브 이동하거나 삭제하지 않습니다. 취소를 검사하고 실패 시 입력을 바꾸지 않습니다.

### Phase 6 첫 dev worker 슬라이스 — 구현 전 계약(2026-10-17)

- `inspect_ai_runtime({request:{schemaVersion:1}})`는 기존 StorageJob 진행/조회/취소를 재사용합니다. 프론트에서 실행 파일/인자/경로/코드를 받지 않고 녹음 중 실행을 거부합니다. 개발 빌드만 저장소 ai/.venv Python으로 고정 모듈을 실행하며 릴리스 Sidecar가 없으면 AI_RUNTIME_UNAVAILABLE로 실패합니다.
- Python JSONL v1의 첫 실제 action은 `inspect`입니다. start 요청은 `{protocolVersion:1,type:'start',jobId:UUID,action:'inspect'}`, cancel은 같은 jobId의 기존 형태입니다. 한 프로세스에서 한 작업만 처리하고 stdin EOF는 중단으로 처리합니다. 각 줄 최대64KiB, 출력 최대16개 메시지/총256KiB,10초 timeout, 취소 후1초 내 미종료 시 자식 kill/wait로 회수합니다. stdout은 JSONL 전용이고 stderr는 UI/로그로 원문 전송하지 않습니다.
- progress는 `{protocolVersion:1,type:'progress',jobId,stage:'environment',percent:0..100}`, completed는 result=`{schemaVersion:1,pythonVersion:string,models:[{id:'basic-pitch'|'audio-separator',packageVersion:string|null,state:'PACKAGE_MISSING'|'UNVERIFIED',usable:false}]}`입니다. 설치 패키지 메타데이터만 확인하며 모델 로드/다운로드/음원 읽기를 하지 않습니다. 패키지가 있어도 가중치 무결성/호환/라이선스 검증 전에는 UNVERIFIED이고 usable=false입니다.
- failed는 고정 코드/한국어 message, canceled는 기존 envelope의 type=canceled입니다. 버전/jobId/unknown field/type/모델ID 중복/percent 역행·완료 중복/후속 출력·과대/잘못된 JSON은 AI_PROTOCOL_INVALID, 프로세스 실패는 AI_WORKER_FAILED, timeout은 AI_WORKER_TIMEOUT입니다. 경로/사용자 데이터는 반환하지 않습니다.
- 이번 첫 슬라이스는 설치 상태 확인만 제공합니다. transcribe/separate action의 실제 실행·모델 설치/선택·분리 산출물·AI_DRAFT·릴리스 패키징은 미구현이며 기존 설계 예시를 실행 가능 명령으로 표시하지 않습니다. 모델 다운로드는 명시적 사용자 요청과 manifest 검증 구현 전 수행하지 않습니다.

```ts
type AppErrorCode =
  | 'FILE_INVALID' | 'FILE_NOT_FOUND' | 'UNSUPPORTED_FORMAT'
  | 'STORAGE_ERROR' | 'REVISION_CONFLICT'
  | 'AUDIO_DEVICE_UNAVAILABLE' | 'AUDIO_PERMISSION_DENIED'
  | 'INPUT_NOT_ACTIVE' | 'CALIBRATION_REQUIRED'
  | 'AI_MODEL_MISSING' | 'AI_JOB_FAILED' | 'JOB_NOT_FOUND'
  | 'SESSION_NOT_FOUND' | 'CANCELED';

type AppError = { code: AppErrorCode; message: string; retryable: boolean };
```

## 계약 테스트

- 잘못된 schemaVersion / unknown enum / null ID / negative duration / unsorted anchors → 거부.
- note `pitchMidi` 와 선택된 `stringIndex`/`fret`의 음악적 불일치 → 에러 또는 검토 필요로 표시.
- timestamp 값 직렬화에서 JS integer precision 손실 없음.
- Python stdout 오류 JSON 처리 / progress 순서 / 중복 finish / cancel과 finish 경합 테스트.
- 같은 noteId/attemptId/epoch에 최종 outcome 중복 발행 방지.

## v0.2 반주/연주/녹음 계약 확장 초안

> `14`~`17`의 구체 타입을 기준으로 합니다. 아래 필드는 후속 Phase에서 구현할 **계약 초안**이며 지금 즉시 작동하는 command가 아닙니다. 구현 전 schemaVersion/migration 버전을 합의하세요.

```ts
type PerformanceConfig = {
  schemaVersion: 1;
  projectId: string; scoreRevisionId: string; targetScoreTrackId: string;
  backingSourceId?: string; inputProfileId: string;
  scoringMode: 'DISABLED' | 'PRECISE_LOCAL';
};
type TrackAudioBinding = {
  scoreTrackId: string; stemAssetId?: string;
  role: 'LEAD'|'RHYTHM'|'HARMONY'|'GUITAR_OTHER'|'UNKNOWN';
  confirmedByUser: boolean;
};
type RecordStartRequest = {
  schemaVersion:1; projectId:string; scoreRevisionId:string; targetScoreTrackId:string;
  inputProfileId:string; backingSourceId?:string; countInBars:0|1|2;
  captureMode:'INPUT_ONLY';
};
type RecordProgress = {
  schemaVersion:1; takeId:string; status:'ARMING'|'COUNT_IN'|'RECORDING'|'FINALIZING'|'READY'|'RECOVERABLE_ERROR';
  framesWritten:number; droppedFrames:number; durationMs:number;
};
```

| Command | 요청 핵심 | 결과 핵심 | 실패/제약 |
|---|---|---|---|
| `list_score_tracks` | `{projectId, scoreRevisionId}` | `{tracks}` | SCORE_NOT_FOUND |
| `set_performance_track` | `{sessionId?, targetScoreTrackId}` | `{activeTrackId, newPlaybackEpoch?}` | RECORDING_IN_PROGRESS |
| `list_backing_sources` | `{projectId}` | `{sources, capabilities}` | STORAGE_ERROR |
| `save_backing_selection` | `{projectId, kind, localAssetId?, youtubeVideoId?}` | `{backingSourceId}` | INVALID_BACKING_SOURCE |
| `start_recording` | `RecordStartRequest` | `{takeId, state}` | RECORDING_IN_PROGRESS, INPUT_NOT_ACTIVE, DISK_SPACE_LOW |
| `stop_recording` | `{takeId}` | `{takeId, state, frames, relativePath?}` | RECORDING_NOT_ACTIVE, FINALIZE_FAILED |
| `list_recorded_takes` | `{projectId}` | `{takes[]}` | STORAGE_ERROR |
| `replay_recorded_take` | `{takeId, playFromSongMs?}` | `{state, playbackEpoch}` | TAKE_NOT_READY |
| `set_take_mix_layers` | `{projectId, layers[]}` | `{saved:true}` | FILE_NOT_FOUND |
| `export_local_mix` | `{projectId, takeIds, localBackingAssetIds, destPath}` | `{exportedPath, format:'WAV'}` | YOUTUBE_MIX_FORBIDDEN, PERMISSION_DENIED |
| `separate_guitar_parts` | `{projectId, localAssetId, modelId, userOptIn:true}` | `{jobId}` | MODEL_UNSUPPORTED, LICENSE_UNVERIFIED |

- YouTube 검색은 앱의 안전한 API client를 통해 별도 처리. `videoId` 메타데이터만 로컬 저장. API key와 endpoint 동작은 구현 시 공식 SDK 정책 검토.
- Recorder 입력 source는 `INPUT_ONLY` 고정; 명령에 systemLoopback 설정을 추가하지 않습니다.
- `recording://progress`, `recording://finalized`, `recording://recoverable`, `performance://track-changed`, `backing://status` 이벤트는 `schemaVersion`·식별자·오류 코드를 포함합니다.
- Tauri error codes 추가: `RECORDING_IN_PROGRESS`, `RECORDING_NOT_ACTIVE`, `DISK_SPACE_LOW`, `FINALIZE_FAILED`, `TAKE_NOT_READY`, `SCORE_NOT_FOUND`, `INVALID_BACKING_SOURCE`, `YOUTUBE_MIX_FORBIDDEN`, `MODEL_UNSUPPORTED`, `LICENSE_UNVERIFIED`, `YT_SYNC_UNCERTAIN`.
- `PerformanceConfig.scoringMode`이 `PRECISE_LOCAL`이면 `BackingCapability.syncPrecision='SAMPLE_CLOCK'` 등 신뢰 가능한 클럭·캘리브레이션 검증 필요. YouTube embedding일 때 유효성 검사로 거부합니다.
- `recordedSampleToSongMs`는 `recordingSegments` 및 input calibration snapshot을 사용. 테이크 타임축 매핑 테스트가 필수.

## Phase 0 실제 구현 상태 (2026-10-13)

현재 Tauri command/event와 Python JSONL 작업 프로세스는 노출하지 않습니다. 위 목록은 후속 구현 계약입니다. Rust `ipc::PROTOCOL_VERSION`과 Python `ipc.PROTOCOL_VERSION`의 값 1만 구조 테스트로 확인하며, 런타임 연동 완료를 의미하지 않습니다. 프론트 invoke 어댑터와 메시지 검증은 첫 실제 명령 도입 시 이 문서와 함께 구현합니다.

## Phase 2 실제 계약 (진행 중)

로컬 미디어는 사용자 파일 선택 후 WebView 메모리의 Blob URL로만 재생하며 저장·네트워크 전송하지 않습니다. 악보 최대 8MiB, WAV/MP3 최대 256MiB. 작업 상태는 loading/ready/error/canceled, 취소 시 결과를 적용하지 않습니다. 파일 교체 시 기존 Blob URL을 해제합니다. 저장소 연동과 native input은 아직 없습니다.

정규화 모델은 schemaVersion=1, ppq=960, 트랙별 NoteEvent, tempoMap, syncAnchors를 사용합니다. syncAnchors는 최소 2개이고 tick/audioTimeMs가 모두 엄격 증가해야 합니다. playback state는 schemaVersion=1, audioTimeMs, rate, status, playbackEpoch로 표현하며 seek/rate/loop/정지 시 epoch를 증가시킵니다. UI clock은 채점 근거로 사용하지 않습니다.

### Phase 2 수정 계약 (2026-10-13)

- 재생 snapshot에 loop(A/B 음원 ms 또는 null), volume(0..1), metronomeEnabled, metronomeVolume(0..1), timing(bpm, numerator, denominator)을 포함합니다. 반복 표시·음량·카운트인은 이 상태만 사용합니다. tempo는 10..600 BPM, 박자 분자는 1..32, 분모는 1/2/4/8/16/32 범위입니다.
- play 완료/실패는 동일한 요청 세대와 동일한 미디어일 때만 상태를 변경합니다. 취소된 이전 완료가 새 미디어를 pause하거나 오류로 변경해서는 안 됩니다.
- 악보 session은 앱 수명 동안 원본 bytes, alphaTab model, 정규화 document, activeTrackIndex를 보존합니다. 모드/라이브러리/설정 이동은 원본·앵커를 초기화하지 않습니다. 아직 디스크 저장은 하지 않습니다.
- 사용자 선택 파일과 자체 fixture 로딩은 동일한 latest-task 취소 규칙을 적용합니다. 취소/교체 후 늦은 결과는 적용하지 않으며 fetch는 AbortSignal로 취소합니다. 외부 파서 원문 오류는 고정 한국어 문구로 변환합니다.
- ScoreDocument에 timeSignatures를 추가해 원본의 템포·박자 변화를 유지합니다. 저장 command/event는 아직 노출하지 않습니다. 메트로놈과 카운트인은 현재 score tick의 박자·음원/앵커 템포·재생 rate를 반영하며 WebAudio 출력만 사용합니다. 녹음이나 입력 캡처와는 무관합니다.

- Phase 2의 정규화 startTick은 alphaTab의 반복을 펼친 playback tick입니다. 각 노트에 notationNoteId(UUID)를 보존해 동일한 원본 음표의 반복 occurrence를 구별합니다. 악보 편집 시 원본 alphaTab 모델을 변경하고 playback 정규화를 갱신하며, 원본 bytes를 덮어쓰지 않습니다. attack=false인 tie destination은 새 타격 목표가 아닙니다. cursor는 MidiTickLookup으로 반복 occurrence를 원본 beat에 역매핑합니다.

- timing.beatOriginMs는 현재 마디 시작이 놓이는 음원 시간입니다. 메트로놈은 이 기준으로 강박을 맞추며 악보 시작 이전 인트로에서 클릭을 생성하지 않습니다.

## Phase 3 입력 계약 — 구현 중 (2026-10-13)

기존 초안 중 아래 명령부터 도입합니다. 버전 1 이외 요청은 거부하며 장치 열거는 캡처를 시작하지 않습니다. 브라우저 실행에서는 네이티브 입력을 제공하지 않습니다.

| 명령 | 요청 | 응답 |
|---|---|---|
| `list_audio_devices` | 없음 | `{schemaVersion:1, devices:[{id,name,channels,sampleRate,sampleFormat}]}` |
| `start_audio_input` | `{request:{schemaVersion:1,deviceId,channelIndex,noiseGateDbfs}}` | `AudioSnapshot` |
| `stop_audio_input` | `{request:{schemaVersion:1}}` | `AudioSnapshot`, 이미 정지한 요청도 성공 |
| `get_audio_snapshot` | 없음 | `AudioSnapshot` |

- `channelIndex`는 0부터, 실제 열거된 기본 입력 채널 범위만 허용합니다. gate는 -80..-10 dBFS. 기본 입력 포맷을 협상하며 8k..192kHz, 1..32채널 중 f32/i16/i32/u16만 지원합니다. 미지원 설정은 명확히 거부합니다.
- `AudioSnapshot`: schemaVersion, state(`STOPPED/STARTING/RUNNING/ERROR`), deviceId 또는 null, sampleRate, channels, channelIndex, sampleFormat, callbackFrames, capturedFrames, droppedFrames, discontinuities, levelDbfs, pitchMidi/cents/confidence 또는 null, capturedMonotonicNs(정수 문자열), onsets(최대128개), errorCode 또는 null. 아직 채점 이벤트는 발행하지 않습니다.
- onset은 sequence, captureSampleIndex, capturedMonotonicNs, pitchMidi, cents, confidence를 포함합니다. sequence는 입력 시작마다 1부터 증가하며 상태 조회로 PCM/개인 오디오를 전송하거나 파일에 저장하지 않습니다. 최근 onset 목록은 진단용이며 중복 소비를 막기 위해 stream 시작 식별자와 sequence를 사용합니다.
- 캡처 시각은 CPAL stream의 monotonic capture timestamp + sample offset. stream 간 원점을 동일하다고 가정하지 않습니다. 드라이버 callback 시각과 캡처 시각을 구별합니다. clock mapping 검증 전 실시간 채점은 비활성입니다.
- 데이터 callback은 미리 할당한 bounded SPSC queue로 선택 채널 sample과 timestamp만 전달합니다. 오류 callback은 atomic 상태만 기록합니다. DSP/로그/IPC/파일 I/O/잠금은 callback에서 수행하지 않습니다. queue 누락 시 drop 수와 sample gap을 측정하고 DSP 상태를 초기화합니다.
- `start`는 UI의 명시적 장치 선택·입력 시작에만 호출합니다. 입력 중단/장치 오류/앱 종료는 stream과 worker를 종료합니다. 시작/중단은 직렬화하며 실패한 이전 요청이 새 입력을 덮어쓰지 않습니다. 오류 응답은 `{code,message,retryable}` 고정 한국어 메시지이며 장치 내부 ID나 경로를 로그에 출력하지 않습니다.

### Phase 3 순수 matcher 계약

튜너 우선 슬라이스의 snapshot에는 `noiseGateDbfs`(-80..-10)를 포함합니다. 입력 중 다른 화면으로 이동해도 실제 사용한 장치·채널·gate를 표시합니다. MIDI float→음 이름/Hz/cents는 표시 계산이며 프렛/줄 식별이나 채점 결과가 아닙니다. RUNNING 및 confidence 0.85 이상일 때만 음정 표시, 정지/오류 시 이전 음을 숨깁니다.

Rust matcher는 Tauri/입력 장치와 독립적입니다. 목표 `{id,songTimeMs,pitchMidi}`, 입력 `{sequence,playbackEpoch,playedSongTimeMs,pitchMidi,confidence,onset}`과 설정 `{rate,calibrationRealMs,coolMs,goodMs,pitchToleranceCents}`을 검증합니다. 보정값은 실제 ms로 저장하고 원곡 시간에서 `calibrationRealMs*rate`를 뺍니다. 설정·대상 노트·epoch는 attempt 생성 후 불변입니다.

- 최종 결과는 `JUDGED`(COOL/GOOD/MISS, EARLY/LATE/ON_TIME/WRONG_NOTE, scoreAwarded) 또는 `NOT_SCORED`(UNVERIFIED/SKIPPED/UNSUPPORTED, 0)입니다. 목표별 한 번만 확정합니다. WRONG_NOTE는 임시 피드백이며 올바른 재시도를 GOOD 종료까지 허용합니다.
- 순서가 동일한 목표와 입력은 같은 결과를 만듭니다. pitch가 맞는 후보 중 시간 차가 가장 작은 후보, 동률이면 원래 목표 순서를 선택합니다. 동일 sequence·이전 epoch·onset 없는 지속음 입력은 재사용하지 않습니다.
- 낮은 confidence(0.85 미만)가 윈도에 있으면 유효 입력으로 재시도할 수 있으며 종료 시 UNVERIFIED. 동시 공격은 UNSUPPORTED. 중단·입력 장치 오류는 미확정 목표를 SKIPPED로 닫습니다. seek/rate/loop/pause 시 새 matcher를 만들고 이전 결과는 별도 attempt 기록으로 유지합니다.
- `advance`는 캡처/재생 clock에서 얻은 시간만 받으며 React 렌더 시간을 사용하지 않습니다. 실제 clock 검증 이전에는 이 순수 엔진의 fixture 결과만 검증하며 UI 채점은 제공하지 않습니다.

### Phase 3 clock PoC 계약 — 구현 중

- `get_audio_clock`는 캡처 중인 동일 CPAL stream의 `now()`만 사용해 `{schemaVersion:1,streamGeneration,monotonicNs:string}`를 반환합니다. stream 없음/실패면 INPUT_NOT_ACTIVE. 조회는 캡처를 시작하지 않습니다.
- WebView는 render snapshot을 읽지 않고 `HTMLAudioElement.currentTime`과 `performance.now()`를 IPC 왕복 직전/직후 표본화합니다. 같은 재생 epoch/속도/playing 상태를 확인하고 왕복 midpoint의 원곡 ms와 uncertaintyRealMs를 계산합니다. 이는 검증할 PoC이며 sample-accurate 보장이 아닙니다.
- 순수 Rust `CaptureMapping`: streamGeneration/epoch/rate/monotonicNs/songTimeMs/uncertaintyRealMs를 받습니다. uncertainty 15ms 초과, 오래된 anchor(1초), 역순 timestamp, stream/epoch 불일치, 예상 흐름과 실제 anchor 잔차 20ms 초과는 거부합니다. 최소 3개 anchor와 400ms 구간을 통과해야 READY.
- seek/loop/rate/pause는 mapping을 invalidate합니다. 새 epoch 첫 anchor 이전 캡처는 폐기합니다. 동일 epoch의 과거 입력은 최대 2초 범위의 보존 anchor로 역매핑합니다. 부정확한 clock은 유효 점수로 사용하지 않고 진단/보정 요청을 표시합니다.
- clock이 검증되어도 HTML media 시간 양자화·출력 장치 지연이 남으므로 calibration과 실제 장치 측정이 별도로 필요합니다. precision capability를 SAMPLE_CLOCK이라고 표시하지 않습니다.

- `update_capture_clock`: `{request:{schemaVersion:1,streamGeneration,playbackEpoch,requestSequence,anchor:null|{monotonicNs,songTimeMs,rate,uncertaintyRealMs}}}`. null은 pause/seek/전환 시 무효화. 입력 시작마다 sequence=1부터 시작하며 더 오래된 sequence·epoch 요청은 거부합니다. anchor timestamp는 동일 stream now로부터 100ms 이내의 과거여야 합니다. 응답 `{schemaVersion:1,ready,anchorCount,maximumResidualRealMs}`는 진단용이며 아직 점수를 발행하지 않습니다.

### Phase 3 calibration 단위

프로필의 저장 단위는 `biasRealMs`(관측이 늦으면 양수)입니다. 적용 시 원곡 시간에서 `biasRealMs*rate`를 뺍니다. 이전 문서 초안의 song-ms 단위와 혼용하지 않으며 저장 schemaVersion=1에 단위를 명시합니다. 동일 장치·sampleRate·sampleFormat·입력 channel·관측 callbackFrames·출력 환경(헤드폰/스피커/기타)을 프로필 키로 검증합니다. 구성이 달라지면 재측정이 필요합니다.

반복 입력은 8..64회, 각 real delta ±500ms 범위. 중앙값과 MAD 기반 이상치 제거로 추정하며 유효 표본 8개 미만은 저장 가능한 측정으로 표시하지 않습니다. 표본 jitter(MAD 기반 실 ms)를 UI에 노출하며 자동 성공 점수로 치환하지 않습니다. 수동 보정 ±500ms도 허용하되 `method=MANUAL`로 저장하고 실측 wizard 결과처럼 표시하지 않습니다.

- `list_input_calibrations`: `{schemaVersion:1,revision,profiles:[{id,key,biasRealMs,method,jitterRealMs,samplesUsed}]}`. key는 deviceId/sampleRate/sampleFormat/channelIndex/callbackFrames/monitorEnvironment(`HEADPHONES/SPEAKERS/OTHER`)이며 로컬에만 저장합니다. 원시 deviceId를 로그에 출력하지 않습니다.
- `save_input_calibration`: `{request:{schemaVersion:1,expectedRevision,biasRealMs,monitorEnvironment}}`. 서버가 현재 정상 캡처 설정을 확인해 key를 만들며 `MANUAL`로만 저장합니다. 요청에서 임의 파일 경로/측정 성공 표시를 받지 않습니다. 성공은 갱신된 전체 profile document. 입력 없음/장치 오류/REVISION_CONFLICT/STORAGE_ERROR는 명시적 실패.
- 첫 저장은 앱 데이터 경로의 `settings/input-calibrations.json` schemaVersion=1. revision CAS, 최대128개/64KiB, 같은 설정의 profile ID 유지. 단일 writer, 새로운 임시 파일→flush/sync→rename으로 교체, 원본 보존. 잘못된 기존 JSON이나 경로 우회는 덮어쓰지 않습니다. SQLite 프로젝트 저장은 Phase 4 작업입니다.

- key에 전체 `channels` 수를 포함합니다. channel layout 변경도 같은 프로필로 자동 채택하지 않습니다. 짧은 보정 저장은 원자적 교체가 끝날 때 성공/실패를 반환하고 UI는 저장 중 상태를 표시합니다. 완료된 저장을 취소됐다고 표시하거나 되돌렸다고 주장하지 않습니다.

- 실제 구현 전 프로필 버퍼 키를 위 초안의 `callbackFrames`에서 **협상된 `bufferFrames`**로 확정합니다. WASAPI callback packet 크기는 변할 수 있으므로 마지막 callback 크기를 저장 조건으로 쓰지 않습니다. snapshot.bufferFrames는 양의 정수 또는 null, CPAL `Stream::buffer_size()`가 알려주지 못하면 튜너는 사용 가능하지만 프로필 저장은 거부합니다. callbackFrames는 진단 전용입니다. 사용자 프로필 파일 생성 전 계약 변경으로 기존 사용자 저장 데이터는 없습니다.

- 저장 요청에 `expectedStreamGeneration`을 필수로 포함합니다. 서버가 profile key를 얻는 시점에 입력 세대가 바뀌었다면 INPUT_CHANGED로 거부해 이전 장치의 수동값이 다른 장치에 저장되지 않도록 합니다.

### 반복 측정 sampler — 내부 구현

순수 sampler는 native mapping을 통과한 onset의 streamGeneration/epoch/sequence/songTimeMs/confidence만 받습니다. 선택한 beat grid의 가장 가까운 박자와 일대일 대응시키고 `(songTimeMs-targetBeatSongMs)/rate`를 관측 real delta로 수집합니다. 같은 epoch/beat 또는 동일/과거 sequence는 다시 쓰지 않습니다. 저신뢰·mapping 없는 입력은 수집하지 않습니다. 장치 세대 변경/비정상 입력은 측정을 취소합니다. 자동 종료는 16개 표본이며 수동 종료도 유효 표본 8개 이상이어야 합니다. 실제 Tauri 측정 세션/UI 연결 전에는 이 sampler의 fixture 통과만 기록합니다.
## Phase 3 반복 연주 보정 측정 계약 — 구현, 실제 측정·저장 확인 (2026-10-13)

아래 측정 명령과 MEASURED 저장을 앱에 등록했습니다. 초안 당시에는 MANUAL까지만 구현했고 수동 검증 중 자동 재시작을 방지하기 위해 작업을 보류했습니다. 이후 임시 후보를 검사해 반영했으며 실제 반복 연주·저장 확인은 대기 중입니다. 최종 시간 소스는 아래 전용 AudioContext 계약을 따릅니다.

- `start_calibration_measurement`: `{request:{schemaVersion:1,expectedStreamGeneration,playbackEpoch,rate,originSongMs,beatDurationSongMs,monitorEnvironment}}`. 현재 입력과 READY clock이 같은 epoch/rate인지 확인하고 서버 UUID 측정 ID를 반환합니다. 시작 이전 온셋은 제외합니다.
- `get_calibration_measurement`: `{request:{schemaVersion:1,measurementId}}`. 실제 Rust 입력 온셋만 변환·수집합니다. 반환 `{schemaVersion:1,measurementId,state:"COLLECTING"|"READY"|"CANCELED",sampleCount:0..16,estimate:null|{biasRealMs,jitterRealMs,samplesUsed,samplesRejected}}`. 16회 수집 후 READY, 8회 이상이면 수동 종료·저장도 허용합니다. estimate는 중앙값/MAD 추정이며 절대 장치 latency나 사용자 반응 시간을 분리한 측정이 아닙니다.
- `cancel_calibration_measurement`: 동일 ID 요청. 입력 캡처 자체를 중단하지 않고 측정 표본을 취소합니다. 타 측정 ID는 거절하며 취소는 반복 가능합니다.
- `save_measured_calibration`: `{request:{schemaVersion:1,measurementId,expectedRevision}}`. 표본은 클라이언트에서 받지 않고 서버 측정 세션에서 계산합니다. 현재 프로필 키·stream generation·epoch·rate·clock 상태를 다시 검증하고 기존 revision 충돌 정책으로 저장합니다. 성공 응답은 기존 ProfileDocument입니다.
- 측정은 현재 재생의 고정 epoch에서 진행합니다. seek/loop/rate/pause, 입력 중단·누락/불연속 증가, clock 미확정 또는 90초 초과 시 CANCELED 처리합니다. UI는 기존 메트로놈과 미디어 clock을 사용하고 박자/메트로놈 변경 시 취소합니다. 출력 환경 선택도 측정 중 고정합니다.
- ProfileDocument의 method는 `MANUAL` 또는 `MEASURED`. MANUAL의 jitterRealMs/samplesUsed는 null, MEASURED의 jitterRealMs는 유한 0..750, samplesUsed는 정수 8..16. 수동 수정하면 측정 통계를 지우고 MANUAL로 전환합니다. 기존 MANUAL JSON은 그대로 읽습니다.
- nearest-beat 측정은 한 박자 내 위상만 추정합니다. 박자 간격의 절반보다 큰 실제 오프셋은 다른 박자로 매칭될 수 있으므로 UI에 한계를 표시하고 수동값으로 보완합니다. 원음은 기록하지 않습니다.

### Phase 3 clock 재연결·분석 마감 계약 (2026-10-13)

- `get_audio_clock` 응답에 `lastRequestSequence`, `lastPlaybackEpoch`(JS 안전 정수, 0 이상)를 추가합니다. bridge는 같은 입력 세대의 서버 마지막 번호를 읽고 자신의 번호와 큰 값 다음부터 요청합니다. 새 PlayerEngine의 epoch가 서버보다 낮으면 서버 epoch+1로 올려 새 시도로 구분합니다. 일시정지 상태의 reset 요청도 먼저 번호를 읽습니다. UI 재마운트/HMR 후 번호 초기화가 정상 clock을 계속 거절하게 만들지 않으며 오래된 sequence/epoch 거부 정책은 유지합니다.
- 같은 stream의 최신 요청이 malformed/overflow timestamp 또는 잘못된 anchor를 보냈을 때 mapping을 무효화합니다. 과거 sequence·다른 stream·이전 epoch 요청은 현재 mapping을 변경하지 않고 거부합니다.
- AudioSnapshot에 `judgementWatermarkNs:string`를 추가합니다. 이는 DSP에서 앞으로 늦게 확정될 수 있는 onset을 고려한 캡처 처리 마감 시각입니다. 현재 processed 시각보다 210ms 보수적으로 뒤에 두고, 미확정/대기 onset이 더 오래됐다면 그 시각 직전까지 제한합니다. 초기 값은 "0"입니다. matcher advance에는 이 값을 유효 clock으로 변환한 시간만 사용합니다. 실시간 채점 연결 자체는 후속 구현입니다.
- InputOnset의 `pitchMidi`는 유한 0..127 또는 null입니다. 저신뢰 피치는 실제 confidence를 유지하고, pitch를 얻지 못한 onset은 `pitchMidi:null,confidence:0`으로 명시합니다. 200ms 분석 기한 또는 빠른 다음 공격으로 미확정 onset이 밀린 경우에도 무입력으로 은폐하지 않습니다. 대기열은 worker에서만 bounded(8개)로 관리하며 초과는 불연속 진단에 포함합니다.
- 순수 Observation.pitchMidi도 nullable이며 confidence<0.85 또는 pitch 없음은 후보에 UNVERIFIED를 표시합니다. 유효 단음 재시도는 기존처럼 허용합니다. 튜너는 기존 RUNNING/고신뢰 pitch 표시 규칙을 유지합니다.

### 보정 wizard 시간 소스 확정 — 구현 계약 (2026-10-13)

- 보정은 기존 음원을 교체하지 않고 반주를 일시정지한 후 전용 AudioContext로 16회 클릭(고정 간격750ms, 첫 클릭1000ms)을 예약합니다. 사용자가 시작 버튼을 눌렀을 때만 출력합니다. 헤드폰 사용을 안내하며 파일 녹음/네트워크 전송은 없습니다.
- 보정 중에는 일반 미디어 clock bridge를 비활성화하고 단일 전용 bridge가 AudioContext.currentTime↔CPAL stream clock을 동기화합니다. rate=1, 새 playbackEpoch, 원점은 context 시작 시각입니다. media clock과 동시에 native mapping을 갱신하지 않습니다. 이전 sequence/epoch 거부는 유지합니다.
- 측정 시작은 전용 clock READY 후, 종료는 실제 서버 표본8회 이상일 때 저장 또는 취소입니다. 16번째 예정 클릭 이후의 가상 박자는 표본으로 수집하지 않습니다. 16회 모두 검출되면 READY, 부족하면 표본8회 이상으로 저장하거나 다시 측정합니다. 최대90초.
- start 요청의 rate/originSongMs/beatDurationSongMs는 각각1/1000/750으로 고정하며 서버가 검증합니다. 측정 세션은 UUID·streamGeneration·전용 epoch·현재 입력 프로필·최초 onset sequence·누락/불연속 기준값을 유지합니다. 입력 변경/장치 오류/clock 오류/취소/시간 초과는 CANCELED이며 저장 불가. 원본 보정 JSON은 보존합니다.
- 추정은 출력 장치 지연+사용자 박자 반응+입력/검출 지연을 합한 관측 오프셋입니다. 장치의 순수 하드웨어 latency를 측정했다고 표시하지 않습니다. 측정 clock을 종료한 뒤에는 일반 media clock bridge로 복귀하며 기존 음원·재생 위치를 유지합니다.

- 측정 snapshot의 종료 상태에 `SAVED`를 추가하고 `estimateErrorCode:null|string`을 포함합니다. 표본8개 미만은 정상 수집 중으로 null, 8개 이상이나 이상치 제거 후 유효 표본이 부족하면 CALIBRATION_REQUIRED를 명시합니다. SAVED 세션은 중복 저장을 거부하고 반복 cancel은 저장을 되돌리지 않습니다.
## Phase 3 실제 단음 채점 연결 계약 (2026-10-13, 구현 / 실제 기타 채점 검증 대기)

- `start_practice_attempt`: schemaVersion=1, expectedStreamGeneration, playbackEpoch, rate(0.5~1.5), scoreRevision(세션 내 UUID), trackId(1~128자), calibrationRevision, calibrationProfileId(UUID), monitorEnvironment, coolMs(5~250), goodMs(COOL~500), pitchToleranceCents(10~100), targets({id,songTimeMs:0~86400000,pitchMidi:0~127}, 정렬/고유 ID/최대100000).
- 저장 보정 revision·프로필·실제 입력 구성을 Rust에서 확인한다. 보정값은 호출자가 전달하지 않으며 시도 시작 때 로컬 프로필 사본으로 고정한다. 악보 revision UUID는 Phase 3의 메모리 내 변경 식별자이며 영속 revision은 Phase 4에서 구현한다.
- `get_practice_attempt`, `stop_practice_attempt`: schemaVersion=1, attemptId(UUID). 중지는 멱등적이며 오래된 ID로 새 시도를 중지할 수 없다. 입력·clock·epoch·배속 불일치나 캡처 누락/불연속/보존 onset 누락/2초 초과 처리는 남은 목표를 SKIPPED 처리해 감점에서 제외한다.
- 스냅샷: schemaVersion, attemptId, state(RUNNING/FINISHED/STOPPED/INVALIDATED), errorCode(null 또는 고정 코드), playbackEpoch, scoreRevision, trackId, rate, calibrationRevision, calibrationProfile(저장 프로필 사본), coolMs/goodMs/pitchToleranceCents, score/combo/maxCombo/cool/good/miss/excluded/accuracy(null 또는0~100), targetCount, eventSequence, events(최근128개).
- 이벤트: sequence, noteId, expectedPitchMidi, confidence(null 허용), finalOutcome(기존 순수 matcher 결과 또는 null), feedback(WRONG_NOTE 또는 null). 최종 판정은 목표당 한 번, WRONG_NOTE는 GOOD 창 종료까지 재시도 허용한다. 저신뢰/동시음표는 UNVERIFIED/UNSUPPORTED로 제외한다.
- 목표는 선택한 한 악보 트랙의 attack 음만 싱크 앵커로 변환한다. 타이 연결음은 새 공격에서 제외한다. 루프에서는 [A,B), 일반 재생에서는 [0,음원 길이)의 목표를 사용한다.
- 시작 시각보다 GOOD 창의 시작이 앞선 목표는 SKIPPED 처리한다. 시작 이전 캡처가 시작 이후에 DSP 결과로 도착해도 사용하지 않는다. 실제 onset을 먼저 처리한 뒤 DSP의 judgementWatermarkNs를 매핑해 MISS를 확정하며 UI 렌더 시각은 채점에 쓰지 않는다.
- 채점은 명시적인 시작/중단 조작으로 활성화한다. 활성화 중 pause/seek/rate/loop는 이전 시도를 종료하고 동기화 준비 후 새 시도를 시작한다. 장치 오류나 clock 손실은 안내 후 새 동기화까지 대기한다. 시도 요약 최근20개와 이벤트 최근128개만 메모리 보존하며 앱 종료 시 소실된다. 전체 이력/SQLite 저장은 Phase 4 범위다.
- 반복 보정 중·카피/설정 화면에서는 채점을 수행하지 않는다. 오디오 저장 및 네트워크 전송은 없다.

### Phase 3 준비 카운트다운 (2026-10-13, 구현 / 실제 표시 검증 대기)

- 사용자의 실제 채점 확인과 요청에 따라 연습/연주 화면의 재생 및 Space에 기본 3초 준비를 적용한다. 카피/다른 화면의 기존 즉시 재생은 유지한다. 카운트인 메뉴에서 끄기·3초·기존1/2마디를 선택한다.
- PlayerSnapshot schemaVersion=1의 `countInRemainingMs`(0 이상의 실제 시간 ms)를 추가한다. 준비 중 status=countIn, 음원 위치는 고정이고 실제 공격 채점은 시작하지 않는다. 준비 후 기존 media clock 동기화/시도를 사용하며 첫 목표의 불완전한 창 제외 정책은 유지한다.
- 준비는 배속/템포와 무관한 실제 약3초,1초 간격3클릭/3→2→1 표시다. 기존 마디 카운트인은 템포·박자·배속을 반영한다. pause/stop/seek/rate/loop/음원 교체/dispose로 준비 타이머·클릭을 취소하며 늦게 완료된 오디오 준비가 재생을 되살리지 않는다.
- 시도와 SCORE 결과를 합성하지 않으며 준비가 입력 또는 출력의 지연 보정을 대체하지 않는다.


## Phase 2A — 기타 악보 트랙 메타데이터의 선택적 확장

- 기존 schemaVersion=1 ScoreDocument의 ScoreTrack에 선택적인 `instrument: 'GUITAR'|'OTHER'`, `role: 'LEAD'|'RHYTHM'|'HARMONY'|'GUITAR_OTHER'|'UNKNOWN'`을 추가합니다. 역할은 사용자가 지정하는 태그이며 트랙 이름만으로 리드/리듬을 확정하지 않습니다. 원본 MIDI program24~31(0 기반)·비타악 트랙을 기타로 분류합니다. 기존 파일에서 필드가 없으면 원본 import의 MIDI 메타데이터를 참조하고 역할 UNKNOWN을 표시합니다.
- WorkspaceState에 선택적인 `activePerformanceTrackId`를 추가합니다. 제공되면 같은 score의 `tracks[activeTrackIndex].id`와 반드시 일치해야 합니다. 없는 Phase 4 파일은 기존 index에서 ID를 복원합니다. ID가 사라지거나 index와 불일치한 입력은 거부하며 다른 트랙으로 조용히 바꾸지 않습니다.
- 새 저장은 선택 ID를 함께 기록합니다. 기존 불변 revision 파일/DB migration001은 재작성하지 않습니다. frontend/Rust 모두 기존 필드 누락을 허용하고 새 필드의 enum·ID·관계를 검사합니다. Python은 이 저장 DTO를 소비하지 않으며 기존 protocolVersion1을 유지합니다.
- 트랙 변경은 재생/준비를 일시정지하고 이전 시도를 먼저 중단·저장합니다. 다시 재생하면 선택한 한 트랙의 목표만 새 시도/session에 전달합니다. 역할 변경은 새 canonical document로 처리해 저장되지 않은 변경임을 표시합니다.
- 새 native command/set_performance_track는 추가하지 않습니다. 기존 저장 command의 검증된 workspace와 기존 start_practice_attempt.trackId를 사용합니다. 앞의 set_performance_track 행은 여전히 미래 인터페이스 초안입니다.
- 악보 Guitar1/2와 사용자 역할은 AudioStem 존재를 의미하지 않으며 파트별 음원 제거/분리/녹음을 완료 기능으로 표시하지 않습니다. schemaVersion1 확장은 구버전 데이터를 새 앱이 읽는 방향을 지원합니다. 새 선택 필드가 있는 데이터를 구버전 앱에서 여는 호환성은 보장하지 않습니다.
# Phase 4A 실제 구현 계약 (2026-10-15, schemaVersion 1)

기존 v0.2 초안의 녹음 항목을 다음 입력 전용 계약으로 구체화합니다. 아직 실제 하드웨어 검증 전이며 완료 상태는 진행 문서를 따릅니다.

- `start_recording({schemaVersion:1,projectId,scoreRevisionId,targetScoreTrackId,expectedStreamGeneration,monitorEnvironment,source:'INPUT_ONLY',transport:null|{playbackEpoch,rate,backingAssetId}})`: 저장된 리비전/트랙과 실제 CPAL 입력·저장된 보정 프로필을 native에서 검증합니다. transport는 동기화가 안정된 로컬 반주 재생에만 사용하고 반복을 끈 상태에서 호출합니다. 무반주는 null이며 정밀 악보 정렬을 주장하지 않습니다. 요청에 파일 경로·출력 캡처 소스는 없습니다.
- `get_recording({schemaVersion:1})`: `{schemaVersion:1,take:RecordedTake|null}`. 진행 중 frames/peak와 상태·오류를 포함합니다.
- `stop_recording({schemaVersion:1,takeId})`: 해당 테이크만 중지·큐 배출·헤더/fsync·승격·DB 저장합니다. 오래된 ID로 다른 녹음을 중단할 수 없습니다.
- `list_recordings({schemaVersion:1,projectId})`: 테이크 목록(최대1000개)을 반환합니다. 모든 테이크는 origin USER_INPUT, source INPUT_ONLY, mono IEEE float32 WAV이며 입력 샘플레이트를 유지합니다.
- `read_recording({schemaVersion:1,projectId,takeId})`: READY WAV만 검증 후 binary 응답. 프론트는 가져오기 취소와 늦은 응답 폐기를 제공하고 실제 파일 읽기는 최대256MiB로 제한합니다.
- `recover_recording({schemaVersion:1,projectId,takeId})`: RECOVERABLE_ERROR 원본 `.part`/WAV를 보존하면서 새 takeId로 전체 유효 프레임을 복사·확정합니다. 데이터 손상은 복구 오류이며 무음으로 위장하지 않습니다. 원본은 계속 불완전 상태로 남깁니다.
- `update_recording({schemaVersion:1,projectId,takeId,name,memo,alignmentOffsetMs})`: 이름1~200자/메모0~2000자/offset ±60000ms만 변경합니다. 오디오와 캡처 시각·리비전·프로필은 불변입니다.

RecordedTake는 id/projectId/scoreRevisionId/targetScoreTrackId/name/memo/createdAtMs/state/sampleRate/channels:1/frames/peak/droppedFrames/errorCode, 캡처 시작 sample index 및 monotonic ns(정수 문자열 또는 미수신 null), streamGeneration, calibrationRevision 및 실제 DeviceProfile 스냅샷, transport와 songStartMs(무반주 null), alignmentOffsetMs, recoveredFrom(없으면 null)을 가집니다. 외부 경로는 반환하지 않습니다.

REC 이전에 큐에 남은 샘플은 native 시작 시각으로 제외합니다. 입력 콜백은 기존 bounded ring에 원본 f32/시각/index만 넣고, DSP worker가 REC 동안만 별도 bounded writer 큐로 전달합니다. 비유한 값·sample index 누락·큐 초과·장치/clock 변경·디스크 오류에서 연속된 앞부분을 보존하고 RECOVERABLE_ERROR를 표시합니다. 시간축을 숨겨 이어 붙이거나 무음을 삽입하지 않습니다. 최대10분 또는256MiB 중 먼저 도달하면 정상 확정하고 한도를 안내합니다.

최초 버전은 REC 중 seek/rate/loop/backing/프로젝트/목표 변경 UI를 잠급니다. native도 세대·epoch·rate/clock 유효성을 지속 검사합니다. STOP은 입력을 중단하지 않습니다. 앱 종료 중 녹음은 창 닫기를 차단하고 STOP/저장을 안내하며, 크래시 후 진행 상태는 RECOVERABLE_ERROR로 바꿉니다. 재생은 별도 media/원래 리비전의 악보를 사용하고 원곡 PlayerEngine의 asset 연결을 바꾸지 않습니다. A/B는 리비전·트랙·배속·보정 차이를 경고합니다. 원본 입력 신호는 limiter 없이 저장하며 replay gain은 파생 청취 설정입니다.
- `get_recording_revision({schemaVersion:1,projectId,takeId})`: 해당 take의 불변 리비전을 반환합니다. 현재 프로젝트의 최신 리비전으로 대체하지 않습니다. 실제 WAV 읽기/복구는 기존 StorageJob 상태·진행·취소 및 `take_storage_bytes` 단발 binary 소비를 재사용합니다.

### REC 즉시 중단 수정 — 2026-10-15

실제 SSL 입력에서 CAPTURE_CLOCK_GAP으로480프레임 뒤 중단되는 문제를 확인했습니다. WASAPI의 callback별 첫 샘플 시각에 작은 흔들림이 있어 이전 블록 마지막 샘플의 계산 시각보다 다음 블록 첫 시각이 앞설 수 있습니다. PCM 순서는 sample index로 검증하고, 최초 샘플 시각+누적 sample index/sampleRate와 관측 시각의 차이가100ms를 넘으면 CAPTURE_CLOCK_GAP으로 중단합니다. 작은 블록 경계 겹침에 샘플 삽입/삭제나 시각 재작성을 하지 않습니다. 실제 index 누락/중복·queue overflow·NaN·장치/clock 오류는 계속 중단합니다.

REC 시작 시각 필터는 첫 수신 샘플을 고를 때까지만 적용합니다. 이후 연속 index가 가리키는 샘플은 timestamp의 작은 역행으로 버리지 않습니다. timestamp 이상이나 중복 index만으로 누락 프레임을1개로 추정하지 않고, 확인된 index 전진 누락만 계수합니다. 외부 DTO/프로토콜 버전은 그대로이며 이전 불완전 테이크의 파일과 메타데이터는 변경하지 않습니다.

### 선택적 입력 모니터링 v1 — 2026-10-15

- `list_monitor_outputs()`: `{schemaVersion:1,devices:[{id,name,channels,sampleRate,sampleFormat}]}`. 실제 CPAL 출력 장치만 열거하며 기존 입력 장치 목록과 분리합니다. 2026-10-20 선택적 `isDefault`/초기 열거·기본 모니터 요청의 확장은 문서 마지막 계약을 따릅니다.
- `start_input_monitor({request:{schemaVersion:1,expectedStreamGeneration,outputDeviceId,volume}})`: 사용자가 시작한 정상 입력의 선택 채널만 명시적으로 선택한 출력으로 보냅니다. volume은 유한0~1. 입력/모니터/REC 시작은 독립적이며 자동 모니터 시작·설정 영속화는 하지 않습니다.
- `stop_input_monitor({request:{schemaVersion:1}})`: 멱등 중단. 입력·REC·반주를 중단하거나 WAV를 수정하지 않습니다.
- `set_input_monitor_volume({request:{schemaVersion:1,sessionId,volume}})`: 현재 세션과 일치할 때만 청취 음량을 갱신합니다. 오래된 요청은 `MONITOR_CHANGED`입니다.
- `get_input_monitor()`: 아래 snapshot을 반환하고 장치 오류/입력 종료 시 모니터를 정리합니다.
- `InputMonitorSnapshot`: `{schemaVersion:1,state:'STOPPED'|'RUNNING'|'ERROR',sessionId,inputGeneration,outputDeviceId:string|null,outputName:string|null,sampleRate,channels,bufferFrames:number|null,volume,queuedFrames,underrunFrames,droppedFrames,errorCode:string|null}`. 프레임 수는 모니터 전용 진단이며 녹음 누락과 별개입니다. queuedFrames/sampleRate는 소프트웨어 큐 길이이며 전체 왕복 지연 측정값이 아닙니다.
- 최초 범위는 동일 sample rate의 mono/stereo 출력입니다. 지원 설정을 협상하고 일치하지 않으면 `MONITOR_RATE_UNSUPPORTED`로 거부합니다. 리샘플링·ASIO·앰프/이펙트·지연0 보장은 없습니다. 입력은 mono로 복제해 좌우 출력합니다.
- 입력 callback에서 독립적인 최대100ms bounded ring에 선택 채널을 복사하고, 출력 callback에서만 소비합니다. DSP/판정/녹음 큐를 소비하지 않으며 callback의 mutex/파일/로그/할당은 금지합니다. 시작20ms prefill,60ms 초과 backlog를20ms로 줄이며 버린 프레임을 계수합니다. 부족은 출력 무음과 진단으로 표시합니다. 이전 모니터 세션 샘플은 재생하지 않습니다. 이 출력 무음/감쇠/복제는 녹음 PCM에 적용하지 않습니다.
- 기본 모니터 음량25%, 기본 꺼짐. 헤드폰 사용 및 하드웨어 직접 모니터와 중복 청취 방지를 안내합니다. 입력 종료/장치 실패 시 출력도 무음·중단하며 자동 재시작하지 않습니다. 오류는 `INPUT_NOT_ACTIVE`, `INPUT_CHANGED`, `MONITOR_ALREADY_ACTIVE`, `MONITOR_OUTPUT_UNAVAILABLE`, `MONITOR_RATE_UNSUPPORTED`, `UNSUPPORTED_FORMAT`, `INVALID_INPUT`으로 전달합니다.

### Phase 4B 로컬 믹스 v1 — 구현 계약(2026-10-15)

- `MixDocument={schemaVersion:1,projectId,masterGain,layers:MixLayer[]}`. 최대8개, masterGain/gain은 유한0~1, mute/solo는 boolean, offsetMs는 유한±60,000. `MixLayer={kind:'TAKE'|'LOCAL_ASSET',id,gain,mute,solo,offsetMs}`. UUID만 허용하며 같은 소스 중복/프로젝트 외부 소스/READY가 아닌 테이크/음원 아닌 asset/YouTube 종류는 거부합니다. 로컬 asset은 최대1개입니다. 녹음 원본은 변경하지 않습니다.
- `get_project_mix({request:{schemaVersion:1,projectId}})` → `{schemaVersion:1,mix:MixDocument|null}`. `save_project_mix({request:MixDocument})` → 같은 envelope. SQLite 추가003에 JSON+해시 저장. 미디어 원본/이전 migration은 불변입니다. 설정 저장은 명시적 버튼이며 자동 재생하지 않습니다.
- `render_project_mix({request:MixDocument})` → 기존 StorageJob. 완료 result는 `{schemaVersion:1,frames,sampleRate:48000,channels:1,peak,limitedFrames,bytes}`이며 binary는 `take_storage_bytes`로1회 읽습니다. 파일을 외부로 내보내지 않고 별도 미리 듣기에 사용합니다.
- `export_project_mix({request:{schemaVersion:1,mix:MixDocument,localRightsConfirmed:true}})` → PICKING/RUNNING StorageJob. 사용자가 native 저장 창에서 **새 WAV 경로**를 선택한 뒤 출력합니다. 기존 파일은 덮어쓰지 않으며 생성한 임시 파일만 실패/취소 시 정리합니다. result는 렌더 통계이며 절대 경로를 노출하지 않습니다. 로컬 음원 사용 권한 확인이 없으면 거부합니다. 원본 경로는 IPC 입력으로 받지 않습니다.
- 출력 첫 범위:48kHz mono float32 WAV, 최대10분/256MiB, 디코딩된 입력 합계64MiB 이하. 로컬 WAV의 PCM16/float32·mono/stereo·8~192kHz만 지원하고 stereo는 평균으로 mono화합니다. MP3/기타 WAV는 `MIX_FORMAT_UNSUPPORTED`. 다른 sample rate는 선형 보간하며 고품질 리샘플러는 후속 범위입니다. 출력은1× 기준이며 정렬 테이크의 transport.rate≠1이면 `MIX_RATE_UNSUPPORTED`로 거부합니다(무반주는 수동 정렬). pitch 보존 시간 변환을 구현했다고 주장하지 않습니다.
- 샘플의 songMs = take.songStartMs + take.alignmentOffsetMs + layer.offsetMs + sampleIndex/sampleRate*1000; 무반주는 songStartMs=0으로 취급하고 수동 정렬임을 표시합니다. 음수 시작은 잘라내고 앞부분 빈 구간은 믹스 출력에만 무음입니다. solo가 하나라도 있으면 mute가 아닌 solo만 출력하며 최종 합산에 masterGain을 적용합니다. ±1 초과 샘플은 출력에서만 제한하고 limitedFrames/제한 전 peak를 반환합니다.
- 오버더빙 재생: 기존 main PlayerEngine의 시간축을 따르는 별도 take 재생 어댑터로 녹음된 소리만 재생합니다. seek/pause/rate/loop는 주 시간축을 따르며 WebView 다중 media의 sample-accurate 동기화는 보장하지 않습니다. 입력 REC는 기존 CPAL InputOnly writer만 사용합니다. 믹서 재생 신호를 writer에 전달하지 않습니다.
- 4B 청취 보정 수정: 동일 volume/playbackRate를 매 프레임 재설정하지 않습니다. 시작/명시적 epoch 변경/offset 변경은 위치를 맞추되1ms 이하의 동일 위치 쓰기는 생략합니다. 연속 재생의 자동 탐색은 실제 재생시간 기준160ms 초과 편차가500ms 지속되고 직전 탐색 후1초 이상인 경우에만 수행합니다. play 준비/탐색 중에는 자동 탐색을 추가하지 않습니다. 이는 반복 탐색에 의한 끊김 방지 정책이며 실제 동기 오차160ms 달성 보장은 아닙니다. 외부 DTO 버전/PCM은 변경하지 않습니다.
- 녹음 요청/테이크 v1에 선택적 `referenceTakeIds:string[]`(기본빈배열, 최대7개·중복/자기참조 금지)를 추가합니다. 이전 파일은 그대로 읽습니다. 새 REC는 같은 프로젝트/리비전의 READY 참조만 허용하고 독립 takeID/WAV에 입력만 기록합니다. 요청의 참조가 실제 가청 재생됨까지 native에서 보장하는 것은 아니며 UI는 준비된 믹스에서만 전달합니다. 기존 테이크 복구는 참조 관계도 보존합니다.
- 오류/취소/진행은 기존 StorageJob 계약을 재사용합니다. export는 REC 중 거부하고 파일 선택 취소/기존 파일/디스크 쓰기 실패/잘못된 입력/손상 원본을 구분합니다. 개인 오디오·출력 파일의 네트워크 전송 없음.

### 재생 전 REC 예약·시작 구간 보존 v1 — 2026-10-15

- `start_recording` 요청에 선택적 `deferTransport:boolean`(기본false)를 추가합니다. true는 transport가 있는 로컬 정렬 REC에서만 허용합니다. 기존 요청/테이크/SQLite 버전은 유지하며 Python 계약은 변경하지 않습니다.
- 정지 상태의 REC는 프론트 준비 상태로 잠그고 기존3→2→1을 표시합니다. 취소되면 native REC/파일 생성 없이 종료합니다. 준비가 끝나면 native start를 먼저 완료하고, 같은 playbackEpoch/rate의 반주를 재생합니다. 준비 중 이중 요청·프로젝트/입력/배속/탐색 변경은 잠그며 준비 취소는 계속 가능합니다. 재생 중 REC는 현재 위치부터 기록하고 clock이 아직 준비되지 않았으면 지연 연결을 사용합니다.
- native 지연 연결은 입력 상태·보정·프로젝트/반주/참조 테이크를 먼저 검증하고 ARMING으로 입력만 즉시 기록합니다. 최대5초 동안 CLOCK_UNCERTAIN만 기다리며 입력 오류/누락/기타 실패는 기존처럼 중단합니다. READY mapping이 준비되면 실제 첫 캡처 timestamp와 현재 mapping의 signed delta로 songStartMs를 계산하고 RECORDING으로 전환합니다. 첫 샘플을 버리거나 캡처/반주 시각을 위조하지 않습니다. 그 이후 epoch/rate/시각 drift 검증은 유지합니다.
- 3초 준비 소리는 녹음하지 않습니다. native 기록 개방부터 반주 시작까지의 짧은 입력 선행 구간은 원본에 보존하고 음수 songStartMs로 표시할 수 있습니다. songStartMs 허용 하한은-60,000ms로 확장하며 앞선 테이크는 그대로 읽습니다. 최대5초 내 연결 실패/연결 전 중단은 정렬된 READY로 위장하지 않고 RECOVERABLE_ERROR/CLOCK_UNCERTAIN으로 원본을 보존합니다.
- PlayerEngine의 내부 prepare(beforePlay) 단계는 재생 직전 native 기록 준비를 기다립니다. 취소/늦은 응답/재생 실패 시 반주가 뒤늦게 시작되지 않으며, 이미 열린 take는 stop하여 원본을 보존합니다. 파일 생성 이전 준비 취소는 새 take를 만들지 않습니다. 앱 자동 종료/입력·모니터 자동 시작은 없습니다.

### 녹음 종료 안내 수신 권한 보완 — 2026-10-15

`recording-close-blocked` 안내를 받는 로컬 main 창에 `core:event:allow-listen`·`core:event:allow-unlisten`만 허용합니다. 프론트 emit/emit_to·원격 origin·다른 창에 권한을 부여하지 않습니다. native의 녹음 중 종료 차단과 STOP/저장은 그대로 유지하며 DTO/저장 형식은 변경하지 않습니다. 실제 번들의 RuntimeAuthority에서 수신/해제 허용과 원격·다른 창·발신 거부를 검증합니다.

## Phase 5 첫 편집 슬라이스 — 구현 전 계약(2026-10-15)

- ScoreDocument v1에 선택적 `renderSource:'NORMALIZED'`를 추가합니다. 누락된 기존 문서는 원본 import 렌더를 유지하며 null/다른 문자열은 거부합니다. NORMALIZED 문서는 저장된 정규화 음표로부터 파생 MusicXML/alphaTab 렌더와 lookup을 재생성합니다. 기존 `scoreAssetId`·originalBytes·리비전·테이크는 원본대로 보존하고 SQLite migration/Python protocol은 변경하지 않습니다.
- 첫 지원 범위는 PPQ960,6줄 운지 확정·기본 음가/쉼표·단성 악보입니다. 여러 트랙은 허용하지만 화음/중첩·타이·불일치 운지·마디 중간 템포 변경·지원 범위 밖의 악보는 편집/파생 렌더에서 명시적으로 거부합니다. 기존 읽기/재생은 그대로 제공합니다. 임의 주법/반복 표기의 무손실 변환을 주장하지 않습니다.
- 편집은 사용자가 카피 화면에서 시작하며 줄/프렛/시작 tick/길이 수정·추가/삭제를 원자적으로 검증합니다.6줄 MIDI 개방현+프렛에서 pitch를 계산하고 마디 경계·시간 중첩·동일ID·범위를 검사합니다. 기존 음표/트랙 ID와 싱크 앵커는 유지하며 새 음표만 UUID를 생성합니다. 렌더 왕복에서 실제 음정/시작/길이/운지가 달라지면 적용하지 않습니다.
- Undo/Redo는 최대100개 문서 snapshot으로 관리하고 외부 문서 변경 시 오래된 history를 사용하지 않습니다. 편집/Undo/Redo는 기존 PlayerEngine을 pause해 epoch를 바꾸며 렌더/lookup/정규화 목표를 함께 갱신합니다. 준비/녹음 중 편집은 잠그고 저장된 리비전과 다른 문서는 미저장으로 처리합니다. 프로젝트 다시 열기와 녹음 리플레이는 해당 리비전의 renderSource를 따릅니다.
- 마디/템포/튜닝 편집·원본 비교와 JSON/MusicXML 파일 내보내기는 후속 슬라이스이며 이 계약 작성 시 미구현입니다. 첫 슬라이스를 Phase 5 전체 완료로 표시하지 않습니다.
- tuningMidi의 계약 순서는 stringIndex와 같이1번 줄(가장 얇은 줄)부터입니다. 새 normalize는 alphaTab staff.tuning 순서를 유지합니다. 기존 renderSource 누락 문서의 첫 편집은 session의 원본 alphaTab 튜닝으로 편집용 사본을 만들고 NORMALIZED로 저장합니다. 이전 문서/리비전/원본은 수정하지 않으며 Undo·원본 렌더의 호환 경로를 유지합니다.

### Phase 5 구조 편집 슬라이스 — 구현 전 계약(2026-10-15)

- 기존 ScoreDocument v1 필드로 선택 마디의 템포/박자·빈 마디 삽입/마디 삭제·선택 트랙의6줄 튜닝을 편집합니다. 새 native 명령/DB migration은 추가하지 않습니다. 순수 함수 결과를 같은 검증/렌더/Undo·Redo/새 리비전 경로로 적용합니다.
- 템포는 선택 마디부터 다음 명시적 템포 변화 전까지 적용합니다. 박자는 선택 마디 한 개에만 적용하고 다음 마디의 시작/음표/템포 위치를 이동합니다. 줄어든 마디에 음표가 넘치면 거부합니다. 삽입은 빈 마디, 삭제는 해당 마디의 음표를 함께 삭제하는 명시적 명령이며 마지막 한 마디는 삭제할 수 없습니다.
- 마디/템포 작업은 `resetSync:true`를 명시해야 적용합니다. UI에서 ‘마디/템포 변경은 수동 싱크를 새 기본값으로 다시 만들고 반주 정렬을 재확인해야 함’을 안내/확인한 뒤 명령합니다. 기존0tick의 유효한 음원 시작 지연은 보존하고 새 템포·마디 종료까지 기본 앵커를 계산합니다. 음수 시작/범위 초과·잘못된 싱크는 거부하며 Undo로 기존 사용자 앵커를 그대로 복원합니다.
- 튜닝은1번 줄부터 MIDI 정수6개이며 프렛을 보존해 pitchMidi를 다시 계산합니다. MIDI 범위를 넘으면 전체 작업을 거부합니다. 시간/싱크는 바꾸지 않습니다. 미지원 주법/화음 등의 편집 제한은 첫 슬라이스와 같습니다.

### Phase 5 새 악보 파일 출력 v1 — 구현 전 계약(2026-10-15)

- `export_score_file({request:{schemaVersion:1,format:'JSON'|'MUSICXML',document:ScoreDocument,musicXml?:string|null}})`는 native 저장 창/기존 StorageJob의 진행·취소를 사용합니다. 임의 경로는 받지 않으며 새 `.json`/`.musicxml` 파일만 생성하고 기존 파일은 덮어쓰지 않습니다. 결과는 `{schemaVersion:1,format,bytes}`이며 외부 경로를 반환/DB 저장하지 않습니다.
- document는NORMALIZED v1·최대8MiB이며 native가 기존 스키마/범위를 재검증합니다. JSON은 native가 검증한 document를 직접 직렬화하고 musicXml을 받지 않습니다. MusicXML은 프론트에서 실제 alphaTab 의미 왕복을 마친 내부 serializer 결과만 전달합니다. native는 크기/UTF-8 문자열·XML prolog/score-partwise 루트·외부 entity/DOCTYPE 금지를 검사하며 전체 MusicXML XSD/음표 의미 검증을 수행한다고 주장하지 않습니다.
- 녹음 중 출력은 거부하고 저장 창 이후에도 재검사합니다. 기존 WAV 출력과 같은 새 임시 파일·flush/fsync·hard link 공개 정책을 공유하며 다른 파일 시스템에서는 실패합니다. 취소/충돌/디스크 부족/쓰기 오류는 명시적으로 반환하고 기존 원본/리비전/테이크를 변경하지 않습니다. 늦은 취소 전에 완성된 파일은 유지될 수 있음을 표시합니다.
- 원본 비교는 originalBytes에서 별도 읽기 전용 alphaTab 모델을 생성하고 현재 편집 문서/리비전/재생 소스를 바꾸지 않습니다. 비교 표시는0tick이며 원본과 편집본의 샘플 단위 동기 비교를 주장하지 않습니다.


## 독립 런타임 검증 패키지 — 개발 도구 계약(2026-10-19)

제품 IPC/DB 형식을 바꾸지 않고 기존 native 런타임 확인을 `manage_ai_model inspect <후보 폴더 절대 경로>`로 호출합니다. ai-runtime이 없는 폴더는 개발 Python으로 폴백하지 않도록 실행 전에 거부합니다. 전체 리소스 lock·고정 Python/최소 PATH/-I/-B·timeout/표준 입력 취소를 그대로 적용하며 설치/다운로드/사용자 데이터 작업을 수행하지 않습니다. 모델이 없는 기본 runtime의 PACKAGE_MISSING은 정상이며 설치된 개별 모델 환경 확인과 구별합니다.

별도 ZIP에는 검증된 앱 exe·고정 리소스·같은 native 개발 도구·한국어 점검 스크립트/안내·exe 지문만 넣고 모델 환경/가중치·사용자 데이터/개발 Python은 포함하지 않습니다. 스크립트는 원래 환경 변수를 복원하고 파일 지문·기본 runtime3.12.15/모델 미설치·실행 전후 재검증만 수행합니다. 현재 PC의 개발 PATH를 제외한 검증은 깨끗한 새 OS 검증을 대신하지 않으며 ZIP 생성만으로 릴리스/서명/새 PC 통과를 주장하지 않습니다.

배포 빌드의 첫 실행에서 cp312 활성 marker가 없으면 모델 확인/카피/분리는 AI_MODEL_MISSING으로 안내합니다. 기본 runtime이 없다는 뜻으로 표시하거나 구형 개발 Python을 실행하지 않습니다. 기존 구형 marker/환경은 삭제하지 않으며 명시적 새 프로필 설치 경로로 전환합니다. 디버그 개발 환경의 기존 호환 경로는 유지합니다.

## Phase 6A 첫 슬라이스 — YouTube URL 표시 임베드(2026-10-19, 구현 전 계약)

- 사용자 URL은 프론트의 순수 파서에서 HTTPS·정확한 youtube.com/www.youtube.com/m.youtube.com/youtu.be 호스트와 watch?v=, shorts/, embed/의11자 ID만 받습니다. 사용자 정보/비표준 포트/잘못된 경로/중복 v/제어문자/백슬래시/과대 URL은 거부합니다. 원래 쿼리/fragment/시작 시각/playlist를 임베드 URL로 전달하지 않습니다.
- `YoutubeSelection={kind:'YOUTUBE_EMBED',videoId,selectedByUser:true}`는 이 화면의 메모리에만 유지합니다. 새 Tauri command/DB/Python 계약은 만들지 않으며 기존 v1은 유지합니다. 프로젝트 저장·검색·수동 앵커·악보 커서 연결은 이번 범위 밖입니다.
- 연결·개인정보 안내와 약관/처리방침 링크를 열기 버튼 앞에 표시합니다. 별도 체크박스 없이 ‘안내에 동의하고 YouTube 열기’를 명시적으로 눌러야 iframe/외부 연결이 생성됩니다. URL 입력·화면 진입·화면 복귀만으로는 연결하지 않습니다. 고정 `https://www.youtube.com/embed/<ID>?autoplay=0&controls=1&playsinline=1`만 생성합니다. 공식 수동 iframe이며 JavaScript IFrame Player API 컨트롤은 아직 사용하지 않습니다. onLoad를 재생 가능/분석 성공으로 표시하지 않습니다.
- 원격 script를 권한 있는 앱 origin에 추가하지 않습니다. CSP의 frame-src만 정확한 YouTube embed host로 확장하며 원격 IPC 권한은 부여하지 않습니다. referrerPolicy는 strict-origin-when-cross-origin이며 Referer를 임의 위조하지 않습니다. WebView 식별/153 재생 오류는 실제 앱 검증 전까지 알려진 제약입니다.
- 로컬 PlayerEngine을 먼저 pause하고 해당 경로에서 로컬 transport/채점/믹서/REC를 제공하지 않습니다. 이미 REC 중이면 열기 거부·기존 녹음 유지입니다. URL 변경/취소/화면 이탈·숨김/오프라인·플레이어가 화면 밖으로 이동하면 iframe을 제거하며 자동 복귀/재생하지 않으며 매번 명시적 열기 클릭이 필요합니다. 네이티브 창 포커스 상실도 제거하며 listener 연결 실패 시 열기를 차단합니다.
- iframe load/error·네트워크 경고와 로컬 연습 복귀 링크를 제공합니다. 영상 비공개/임베드 제한은 공식 플레이어 오류를 그대로 보여주고 우회하지 않습니다. iframe onLoad만으로 내부 오류를 판별할 수 없음을 명시합니다.
- capability: syncPrecision BEST_EFFORT, canPreciseLoop/canTimeStretch/canAnalyzeAudio/canRecordBackingToFile false. 앱 seek/시계/정밀 채점은 연결하지 않습니다. YouTube 콘텐츠를 파일·AI·녹음·믹스 서비스로 넘기는 경로는 없습니다.
- 공식 기준 확인: https://developers.google.com/youtube/player_parameters , https://developers.google.com/youtube/iframe_api_reference , https://developers.google.com/youtube/terms/required-minimum-functionality , https://developers.google.com/youtube/terms/developer-policies .

### 2026-10-19 사용자 수용과 연결 조작 간소화

사용자가 기존 체크박스 후보의 실제 영상·소리 재생을 정상 확인했습니다. 별도 동의 체크는 앱의 초기 구현 선택이었으며 YouTube가 그 UI 형태를 지정한 것으로 설명하지 않습니다. 안내/약관/개인정보 표시와 명시적 연결 의사는 유지하되 한 번의 ‘안내에 동의하고 YouTube 열기’로 합칩니다. 사용자 로컬 오디오/악보/녹음은 전송하지 않으며, 온라인 임베드에는 선택 ID·접속 정보와 YouTube의 쿠키/기기 정보 처리가 따릅니다. 기존 모델 다운로드/설치의 용량·연구용 가중치 동의 체크는 이번 변경 대상이 아닙니다.

## Phase 6A 프로젝트 YouTube 선택 보존 — v1 계약(2026-10-19, 코드 작성 전)

- SQLite는 기존001~005를 수정하지 않고006 migration으로 v6가 됩니다. `project_backings`는 프로젝트당 최대1개 현재 선택만 저장하고 kind='YOUTUBE_EMBED', videoId11자 ASCII 영숫자/_/-, selectedByUser=true, 로컬 선택 시각을 검증합니다. 영상·음성·전체 공유 URL·추적 쿼리·쿠키·접속 동의는 저장하지 않습니다. 기존 로컬 asset/믹스/악보/테이크 선택과 별도이며 자동 연주 소스를 바꾸지 않습니다.
- `ProjectBacking={schemaVersion:1,projectId:UUID,selection:YoutubeSelection|null}`. `YoutubeSelection={kind:'YOUTUBE_EMBED',videoId:string,selectedByUser:true}`. 모든 필드는 필수이고 알 수 없는 필드/잘못된 kind/false/URL 경로는 거부합니다. `selection:null`은 명시적 저장 선택 해제이며 필드 누락을 null로 해석하지 않습니다.
- `get_project_backing({schemaVersion:1,projectId}) -> JobSnapshot`, 완료 result는 ProjectBacking입니다. 프로젝트가 없으면 PROJECT_NOT_FOUND, 연결이 없으면 selection:null입니다.
- `save_backing_selection(ProjectBacking) -> JobSnapshot`, 완료 result는 저장한 ProjectBacking과 정확히 같습니다. REC 준비/기록/저장 중이면 RECORDING_BUSY로 거부합니다. 읽기/쓰기는 기존 StorageJobs/취소 API를 사용하고 임의 경로/외부 URL/네트워크 인자는 받지 않습니다.
- 저장은 writer 직렬화·SQLite transaction·커밋 직전 취소 검사로 처리합니다. 커밋 전 취소/실패는 기존 선택 유지, 커밋 뒤 늦은 취소는 이미 저장한 값을 롤백했다고 주장하지 않습니다. 삭제도 같은 정책이며 다음 조회로 확정값을 확인할 수 있습니다.
- 프론트 서비스는 요청 UUID·정확한 v1/필드/11자 ID·응답 projectId와 save 응답의 정확한 선택 일치를 검증합니다. UI는 명시적 ‘영상 주소 저장’/‘저장 주소 다시 읽기’/‘저장 주소 삭제’/‘주소 작업 취소’와 진행·오류를 제공합니다. 작은 읽기/쓰기도 취소 후 native 종료를 기다리고 늦은 응답은 적용하지 않습니다.
- 조회는 URL 입력칸에 정규화 watch URL만 복원하고 iframe을 만들지 않습니다. 사용자가 입력을 바꾸면 진행 중 복원은 취소하고 편집 값을 보존합니다. 프로젝트 변경/화면 이탈/REC 잠금에서는 작업을 취소하고 이전 응답을 버립니다. 저장값을 불러와도 ‘안내에 동의하고 YouTube 열기’를 새로 눌러야 네트워크 연결합니다.
- IPC는 기존 v1의 새 명령 추가입니다. Python/분석 JSONL은 변경하지 않습니다. 검색어/영상 제목·채널은 직접 URL 모드에서 얻지 않으므로 위조하거나 자동 조회하지 않습니다. 수동 앵커·TAB 싱크/검색 API는 별도 후속 계약입니다.

## Phase 6A 공식 IFrame API 격리 상태 관측 — v1 계약 (2026-10-19)

- 기존 수동 임베드를 유지하며 Windows에서 사용자가 ‘재생 상태·시간 확인 (검증)’을 선택하고 명시적 동의 열기를 누를 때만 별도 경로를 엽니다. 외부 JS를 권한 있는 main origin에 로드하지 않습니다.
- `open_youtube_player({schemaVersion:1,videoId})`는 엄격한11자 ID만 받으며 `{schemaVersion:1,sessionId:UUID,videoId,frameUrl}`을 반환합니다. 녹음 중/기존 세션 활성 시 거부합니다. `close_youtube_player({schemaVersion:1,sessionId})`는 해당 세션만 닫고 `{schemaVersion:1,sessionId}`를 반환합니다. 둘 다 blocking worker에서 실행하며 실패 메시지는 고정 한국어/코드입니다. UI 취소/이탈 후 늦게 열린 세션도 ID로 닫습니다. Python/JSONL/DB 계약은 변경하지 않습니다.
- 네이티브는127.0.0.1의 임시 포트에서 고정 HTML/JS 두 파일만 제공합니다. 세션 UUID 경로·정확한 Host·GET·8KiB/1초 요청 제한·no-store·no CORS·Connection close이며 파일/음원/proxy/IPC 엔드포인트가 없습니다. 앱 시작 시 리스너를 열지 않고 닫기/수명 종료 시 listener를 해제합니다.
- 별도 origin의 wrapper는 공식 https://www.youtube.com/iframe_api만 로드하고 YT.Player의 onReady/onStateChange/onError 및 getCurrentTime/getDuration/getPlaybackRate를 사용합니다. origin은 실제 wrapper origin, widget_referrer는 허용된 부모 origin입니다. 부모 URL 경로/query/hash는 외부로 보내지 않습니다. autoplay0/공식 controls/보이는200x200 이상 플레이어를 유지합니다. main CSP는 frame-src의127.0.0.1 임시 포트만 추가하며 원격 script/connect/IPC 권한은 늘리지 않습니다.
- wrapper→부모 postMessage는 `{schemaVersion:1,type:'YOUTUBE_SNAPSHOT',sessionId,videoId,sequence,ready,state,currentTimeMs,durationMs,playbackRate,errorCode}`의 정확한 필드만 허용합니다. sequence는 양의 안전 정수, state는 -1/0/1/2/3/5 또는 null, 시간은 유한0~604800000ms, rate는0.1~4 또는 null, errorCode는 null/정수1~9999/'SCRIPT_FAILED'/'API_FAILED'입니다. ready=false 동안 시간/rate/state는 null입니다. 오류 시 시간·상태를 폐기하며 로컬 반주/수동 임베드 폴백을 안내합니다.
- 부모는 message source===소유 iframe.contentWindow·정확한 origin/세션/영상 ID·단조 증가 sequence를 모두 확인합니다. 거짓/과대/알 수 없는 필드·늦은 세션 메시지는 무시합니다. 수신3초 초과는 관측 지연으로 표시하고15초 동안 ready가 없으면 해당 연결을 닫습니다. UI 이탈/화면 밖/숨김/창 blur/오프라인/REC는 기존 수명 규칙대로 닫으며 자동 재연결하지 않습니다.
- 표시 시계는 API 관측값 그대로 BEST_EFFORT이며 보간하지 않습니다. 광고/버퍼링/seek/네트워크의 영향이 있으므로 악보·입력·REC·채점·로컬 믹스와 연결하지 않습니다. 실제 서비스/WebView 시계 수용 전 검증 기능으로 표시합니다. 공식 자료: https://developers.google.com/youtube/iframe_api_reference , https://developers.google.com/youtube/terms/required-minimum-functionality .

### 2026-10-19 API 모드의 표시 손실은 일시정지 후 보존

사용자가 창 전환 때 영상이 사라진다고 보고해 API 모드의 blur/숨김/표시 밖 처리를 수정합니다. 부모→소유 wrapper 메시지 `{schemaVersion:1,type:'YOUTUBE_PAUSE',sessionId,videoId,requestId}`는 양의 안전 정수 requestId와 정확한 source/origin/필드를 검증합니다. wrapper는 공식 pauseVideo만 호출하며 API 준비 전 요청도 보존합니다. 준비/매 표본에서 실제 state가 -1/0/2/5이면 `{schemaVersion:1,type:'YOUTUBE_PAUSED',sessionId,videoId,requestId}`를 확인 응답합니다. 1/3 또는 준비 전에는 성공 응답하지 않습니다. 부모는 해당 최신 요청의 확인을1.5초 안에 받지 못하면 기존처럼 frame/session을 닫고 사유를 표시합니다. 확인 전에는 중지 요청 중으로 표시합니다. API mode의 창 복귀/표시 복원은 playVideo나 자동 재생을 호출하지 않으며 사용자가 공식 player의 ▶를 다시 눌러야 합니다. 수동 API 미사용 mode에서는 일시정지 확인 수단이 없으므로 기존 제거를 유지합니다. URL 변경/화면 이탈/pagehide/오프라인/REC는 두 mode 모두 종료합니다. 시계/정밀 채점/다운로드 권한 변경은 없습니다.

### 2026-10-19 loopback HTTP의 분할 요청/사전 연결 경계

사용자 첫 접속 지연 원인은 미측정이며 현재 재접속은 빠르다고 확인했습니다. 별도 자체 검사에서 Windows listener의 nonblocking 상태를 상속한 연결이60ms 간격의 정상 분할 헤더를 조기에 닫는 실패(10053)를 재현했습니다. 사용자 지연의 원인으로 단정하지 않습니다. 요청 stream을 명시적으로 blocking+기존1초 전체 읽기 deadline으로 처리하고 최대8개 요청 worker로 제한합니다. 브라우저의 빈 사전 연결이 실제 HTML/JS 요청을 막지 않도록 하며 종료 시 모든 worker를 join합니다.8개가 차면 accept를 대기하고 추가 thread/메모리를 늘리지 않습니다. 고정 두 파일/Host/세션/GET/8KiB/no-store/CSP/권한·close 계약은 그대로입니다.

## Phase 6A 영상 수동 싱크 미리보기 — 화면 임시 계약 (2026-10-19)

- IPC/DB 변경 없는 첫 미리보기입니다. UI의 현재 ScoreSession/활성 트랙·펼친 재생 마디 lookup과 선택 videoId가 문맥이며 별도 프로필로 두 SyncAnchor만 생성합니다. 기존 로컬 ScoreDocument.syncAnchors와 PlayerEngine/입력·채점·REC는 수정하지 않습니다.
- 사용자는 두 진행 마디 번호(반복을 펼친1부터 마지막+1의 악보 끝)와 영상 초를 직접 지정하거나 일시정지된 실제 API 현재 시간을 넣습니다. 두 tick/영상 시간이 모두 엄격히 증가하고 악보 끝/실제 영상 길이 안에 있어야 적용됩니다. 기본 시간을 자동으로 맞췄다고 주장하지 않습니다.
- 기존 sync.ts의 검증/선형 보간을 재사용하되 앵커 구간 밖에서는 외삽하지 않고 커서를 숨깁니다. video/score/track/끝 tick이 다르거나 ready 없음·stale/pausing·버퍼링/시작 전이면 커서를 숨깁니다. seek/일시정지/배속 변경은 실제 getCurrentTime 표본을 그대로 사용하며 배속을 다시 곱하거나 벽시계로 보간하지 않습니다.
- ScoreViewport는 tick=null이면 커서만 숨기고 읽기 전용 악보는 유지하도록 확장합니다. alphaTab player는 계속 false이며 영상과 TAB를 나란히 표시해 영상 위에 덮지 않습니다. 영상 창 전환 중지/수명 규칙은 유지합니다.
- ‘화면 임시’/두 지점 사이 선형 추정·BEST_EFFORT/정밀 채점 불가를 표시합니다. 닫기/영상 변경/화면 이탈에서 소실되며 앱 재실행 복원/영구 저장/자동 정렬·음원 분석/점수는 미구현입니다. 저장은 다음 별도 계약/프로필 스키마/검증 후 연결합니다.

### 수동 싱크의 실제 영상 식별 — 관측 메시지 v2

수동 싱크가 추천 영상 전환 뒤에도 이전 악보를 잘못 따라가지 않도록 공식 getVideoUrl()로 현재 loaded/playing URL을 확인합니다. YOUTUBE_SNAPSHOT만 schemaVersion2로 올리고 videoId를 현재 API가 보고한11자 ID 또는 식별 전 null로 정의합니다. 세션/메시지 source/origin/sequence 경계는 유지하며 ready/state/time은 계속 관측합니다. snapshot의 ID가 선택한 ID와 다르거나 null이면 싱크 적용/시간 가져오기/커서를 중지하고 안내합니다. 공식 플레이어의 추천 영상·기본 조작은 차단하지 않습니다. 기존 v1 관측 메시지는 거부하여 구형 wrapper를 실제 식별 검증으로 간주하지 않습니다. native open/close·pause/ack v1과 Python/JSONL/DB는 변경하지 않습니다. getVideoUrl 공식 근거: https://developers.google.com/youtube/iframe_api_reference#Retrieving_video_information .

### 2026-10-19 열기 활성화는 명시적 조작/창 수명 준비로 판단

사용자가 임시 TAB 커서 동작을 확인한 뒤 지연은 영상 로드가 아니라 API 체크 직후 열기 버튼이 약3초 늦게 활성화되는 현상이라고 명확히 했습니다. 실제 구간 시간은 미측정이므로3초를 native/네트워크의 확정 측정값으로 기록하지 않습니다. mode 변경은 기존 observer/native blur listener를 재등록하지 않고 callback ref만 갱신합니다. autoplay0의 명시적 열기 버튼은 viewport intersection callback을 활성화 조건으로 기다리지 않으며 클릭 시 플레이어를 즉시 중앙으로 스크롤합니다. URL/REC/창 listener 준비·관찰 지원/오류 조건은 유지하고 준비 중 사유를 표시합니다. 영상 표시 손실의 중지 확인/제거·숨김/이탈/오프라인/REC는 유지합니다. observer는 큐의 최신 표시 표본을 사용합니다. 자동 재생/백그라운드 재생을 새로 허용하지 않습니다.
## 2026-10-20 YouTube 수동 맞춤 영구 보존 계약 v1

추가 get_youtube_sync / save_youtube_sync는 기존 StorageJobs(진행/취소/완료 대기)로 실행합니다. 입력·결과는 `{schemaVersion:1,projectId,revisionId,videoId,trackId,profile}`이며 조회 입력은 profile만 제외한5필드입니다. UUID 두 개/11자 영상 ID/제어문자 없는1~128자 트랙 ID를 검증하고 알 수 없는 필드는 거부합니다. profile은 필수이며 null은 **해당 문맥 한 개만 명시적 삭제**, 누락은 오류입니다. 조회에 없으면 profile:null을 반환합니다.

profile은 `{scoreId,endTick,durationMs,anchors}`입니다. 저장된 revision의 scoreId·실제 track 존재를 검사합니다. endTick은 안전 정수이며 저장 악보의 마지막 박자 지점보다 커야 합니다. 정확한 끝/진행 마디는 프론트의 실제 펼친 alphaTab lookup으로 대조합니다. 사용자가 바꿀 수 있는 로컬 syncAnchors의 마지막 tick을 악보 끝으로 간주하지 않습니다. durationMs는 유한한0초 초과/7일 이하, anchors는 정확히2개·엄격히 증가하는 정수 tick(0~endTick)/유한한 영상 시간(0~durationMs)입니다. 네이티브는8MiB 제한·SHA/프로젝트 소유권을 검사하는 기존 불변 revision reader를 재사용합니다. 저장·읽기 때 JSON(4KiB 이하)/SHA/모든 문맥과 구조를 재검증합니다. 미저장 편집본은 저장/복원 UI를 잠그고 먼저 프로젝트 저장을 안내합니다.

SQLite007/v7은 project_youtube_syncs만 추가합니다. 키는(project_id,revision_id,video_id,track_id), revision은 프로젝트 소유 복합 FK입니다. 최대100개/프로젝트, 같은 키 저장은 명시적 교체입니다. 기존 영상 주소 선택을 바꾸거나 삭제해도 다른 맞춤을 자동 삭제하지 않습니다. 저장은 writer/IMMEDIATE transaction·커밋 전 취소 검사, 실패/취소는 이전 행 보존입니다. 커밋 후 취소는 저장됐을 수 있어 재조회로 확인합니다. 녹음 중 저장은 거부합니다. 외부 URL·쿠키·원격 콘텐츠·접속 동의·재생 상태는 저장하지 않습니다.

UI는 현재 열린 영상·저장 revision·트랙의 명시적 다시 읽기만 제공하며 자동 연결/재생은 없습니다. 복원 시 현재 영상 ID/메타데이터 길이(차이1초 이하)와 진행 마디 시작 배열을 대조하고 다른 문맥/손상/범위 변경은 적용하지 않습니다. 입력 변경/새 revision/영상·트랙 변경/REC/화면 이탈은 진행 중 조회를 취소하고 늦은 결과를 버립니다. 복원도 기존 두 지점 미리보기에만 연결하며 local syncAnchors/점수·녹음·보정값은 변경하지 않습니다. 다중 지점/과거 프로필 목록 UI·YouTube 검색은 이 슬라이스에서 미구현입니다.
## 2026-10-20 Phase6B 사용자 기타 파일 import 첫 슬라이스 v1

추가 `import_guitar_stem` 입력은 `{schemaVersion:1,projectId,role}`입니다. role은 LEAD/RHYTHM/HARMONY/GUITAR_OTHER/UNKNOWN이고 네이티브 WAV 선택 창으로 파일을 고릅니다. 프론트로 임의 경로를 받지 않습니다. `list_imported_guitar_stems`는 `{schemaVersion:1,projectId}`, `read_imported_guitar_stem`은 `{schemaVersion:1,projectId,stemId}`입니다. 모두 기존 StorageJobs 진행·취소/완료 대기, import는 REC 거부를 사용합니다. 선택 창 자체는 OS에서 취소하며 앱 취소 뒤 작업 종료까지 잠금을 유지합니다.

결과 ImportedGuitarStem은 `{schemaVersion:1,id,projectId,name,role,origin:'USER_IMPORTED',sampleRate,channels,frames,durationMs,bytes,sha256,peak,createdAtMs}`입니다. 목록은 `{schemaVersion:1,projectId,stems:[]}`(최대20개), import/read는 `{schemaVersion:1,stem}`이며 read의 WAV는 단발 binary입니다. 사용자 선택 역할은 AI 판정·악보 트랙 자동 연결을 의미하지 않습니다. 모델/신뢰도·가짜 분석 필드는 없습니다. 검증한 UUID·제어문자 없는200자 이내 표시 이름·ASCII SHA64자·안전 정수/유한 값, 실제 파일 크기/해시/헤더/프레임·duration/peak를 사용합니다.

초기 지원은64MiB 이하·최대10분·8~192kHz mono/stereo RIFF WAV PCM16/float32입니다. 기존 mixer PCM decoder의 모든 채널 유한값/헤더/예산 검사(디코드 mono64MiB 상한)를 재사용합니다. WAV 원본 바이트를 변환하지 않고 앱 데이터 `projects/{projectId}/imported-stems/{stemId}.wav`에 새 UUID로 관리용 복사합니다. 역할/이름은 별도 메타데이터이고 원래 파일·AI set·RecordedTake·악보는 변경하지 않습니다. 미리 듣기는 선택 WAV 원본 채널, 이후 mixer는 기존 mono 출력 정책입니다.

SQLite008/v8은 imported_guitar_stems만 추가하며 메타데이터 JSON4KiB/해시·프로젝트 FK·고정 USER_IMPORTED를 검증합니다. 기존 save_new_file의 디스크 여유/새 `.part`→분할 쓰기/취소→flush/fsync→목적지 덮어쓰기 없는 hard-link 게시·부분 파일 정리→DB 커밋을 재사용합니다. 실패/커밋 전 취소는 자신이 새로 만든 파일만 정리하고 이전 항목은 보존합니다. 강제 종료로 남은 DB 미등록 파일 자동 청소는 미구현이며 성공 항목으로 나열하지 않습니다. 커밋 뒤 취소는 저장됐을 수 있어 목록으로 확인합니다. 프로젝트20개 상한이며 같은 파일 재import도 독립 ID입니다.

## 사용자 기타 WAV의 출력 믹스 연결 v1 — 구현 전 계약(2026-10-20)

후속 연주 연결은 아래 ‘사용자 기타 파일의 연주 재생 연결’ 계약을 따릅니다. 출력 전용/준비 거부 설명은 그 구현 이전 단계의 범위입니다.

- MixLayer.kind에 `IMPORTED_STEM`을 추가하고 id는 같은 프로젝트의 imported_guitar_stems 불변 UUID입니다. 기존 TAKE/LOCAL_ASSET/STEM·schemaVersion1은 유지합니다. DB 추가 migration/Python 변경/새 native command는 없습니다. 새 종류를 저장한 믹스는 이를 지원하는 같은 프론트/native 빌드가 필요하며 구버전 앱은 해당 종류를 거부합니다.
- 명시적 ‘믹스용 사용자 기타 목록 읽기’만 기존 list_imported_guitar_stems 작업을 사용합니다. 역할/원본은 변경하지 않고, 선택한 항목을 기존 편집 믹스에 더합니다. 최대8개 레이어/중복 ID 금지·프로젝트 소유권/파일 크기·SHA·WAV 검증은 기존 저장/출력 경계에서 다시 수행합니다. 목록의 오래된 응답은 프로젝트 변경/REC/이탈·취소 후 폐기합니다.
- 기존 gain/mute/solo/offsetMs(±60,000)/masterGain 및 출력48kHz mono float32·입력 예산/취소·비파괴 새 WAV 정책을 재사용합니다. 사용자 파일의 노래 시작은0ms+offsetMs이며 자동 정렬이 아닙니다. stereo는 기존 출력 정책대로 mono 평균하되 보존 원본/단독 청취는 바꾸지 않습니다. ‘믹스 설정 저장’만 영구 설정을 변경합니다.
- 이번 범위는 출력 미리 듣기·새 WAV 내보내기·설정 보존입니다. 사용자 파일을 포함한 실시간 오버더빙 준비는 `MIX_IMPORTED_STEM_LIVE_UNSUPPORTED`로 거부하고 REC의 needsPreparation을 유지합니다. 준비 버튼에도 미지원 이유를 표시합니다. 기존 AI STEM/TAKE의 실시간 동작은 유지하고 사용자 stem을 RecordedTake/AI 결과로 위장하지 않습니다. 연주 재생 연결은 후속 슬라이스입니다.

첫 슬라이스는 보존/목록·단독 미리 듣기/재실행 복원입니다. gain/mute/solo·offset/리드 제외 믹스·오버더빙 연결은 다음 슬라이스로 분리하며 이 단계에서 완료로 표시하지 않습니다. 인터넷/AI 모델 호출·시스템/YouTube 캡처는 없습니다. 기존AI AudioStem/ScoreTrack/RecordedTake 계약은 유지합니다.

## 사용자 기타 파일의 연주 재생 연결 v1 — 구현 전 계약(2026-10-20)

- 기존 저장 MixDocument/DBv8/native·Python 계약은 변경하지 않습니다. 명시적 믹스 준비에서 IMPORTED_STEM은 기존 read_imported_guitar_stem의 같은 프로젝트 UUID/바이트 무결성 검증·취소/단발 binary를 사용합니다. 목록 읽기 없이도 저장 불변 ID로 준비할 수 있습니다. 읽은 파일 합계64MiB·최대8레이어/7 TAKE·기존 기준 반주/저장 revision 조건은 유지합니다.
- 내부 MixPlaybackEntry의 stem 입력에 kind:'STEM'|'IMPORTED_STEM'을 명시해 같은 UUID라도 종류가 다른 입력을 거부합니다. RecordedTake로 위장하지 않습니다. 사용자 stem의 청취 시각은 main.audioTimeMs-layer.offsetMs, 배속은 main.rate이며 기존 TakeMixPlayer의 pause/seek/반복·오프셋·gain/mute/solo·오류/취소 정리를 재사용합니다. 원래 WAV 채널을 청취하며 native mono 출력 정책은 별개입니다.
- 기준 PlayerEngine/원본 media·논리 clock은 유지합니다. 원본 레이어가 없으면 원본 소리만0으로 두고 시간축을 사용합니다. 사용자 파일의 자동 정렬·샘플 정밀 동기를 보장하지 않으며 위치는 사용자가 오프셋으로 맞춥니다. 짧은 시각 차이의 반복 탐색 방지 정책은 유지합니다.
- 준비가 성공한 뒤에만 정렬 REC를 허용합니다. referenceTakeIds에는 TAKE만 넣으며 사용자 파일/AI stem을 섞지 않습니다. REC는 선택 입력만 별도 WAV에 저장하며 참조 재생을 캡처하지 않습니다. 저장 포맷에 믹스 전체 snapshot이 없으므로 녹음 당시 모든 청취 설정의 완전 재현을 보장하지 않습니다. 기준 반주 ID는 원래 asset을 유지합니다.
- 프로젝트/revision/소스 변경·화면 이탈·REC 잠금/취소의 늦은 읽기는 준비 상태를 적용하지 않습니다. 이번 구현/검사 후 IMPORTED_STEM의 기존 실시간 미지원 버튼/오류 제한을 해제하며 출력/설정 보존 경로는 그대로 유지합니다.

## 오디오 장치 초기 목록·기본 모니터 v1 확장 — 구현 전 계약(2026-10-20)

- DeviceInfo에 선택적 isDefault:boolean을 추가합니다. 출력 목록은 CPAL0.18.2의 HostTrait.default_output_device().id()와 지원 목록 ID를 대조해 기본 여부를 제공합니다. 입력은 필드를 생략하며 구버전 응답의 누락은 미지정으로 호환합니다. boolean 외 값은 프론트가 거부합니다. schemaVersion1/기존 ID·시작·중단 계약/DB/Python은 유지합니다.
- 입력/모니터 hook은 최초 native 진입 때 로컬 목록을 자동 조회합니다. 수동 새로고침은 유지하고 초기 조회보다 새로 시작한 조회가 우선하며 이탈/비네이티브의 늦은 결과를 버립니다. 열거만으로 입력 캡처/REC를 시작하지 않습니다.
- 모니터는 기본 활성 의도(true)로 대기합니다. 입력 RUNNING/양수 generation·지원 출력 목록/유효 선택이 준비되면 기존 start_input_monitor를 한 번 호출합니다. 초기 선택은 OS 기본 출력이며 사용자가 고른 장치가 목록에 있으면 유지합니다. 기본 출력이 없으면 임의 첫 장치를 선택하지 않습니다.
- 같은 입력 generation/선택 출력의 실패는 자동 반복하지 않습니다. 직접 끄면 이후 poll/입력 재시작이 임의로 다시 켜지지 않습니다. 켜기/출력 새로고침으로 명시적 재시도할 수 있습니다. 네이티브 session/generation·샘플레이트·볼륨/오류 정책은 유지합니다. 상태는 실제 RUNNING·대기·오류를 구분하고 ‘켜짐’ 의도를 실제 소리 재생으로 위장하지 않습니다.
- 이 사용자 요청은 이전 명시적 모니터 시작 전용 설명을 대체합니다. 입력 시작/REC는 계속 사용자 명령이 필요합니다. 켜짐 의도·수동 선택은 이번 앱 실행 동안만 유지하며 설정 영속화/OS 장치 변경 자동 추적은 후속입니다.

### 후속 사용자 결정 — 모니터 기본 꺼짐(2026-10-20)

위 기본 활성 의도(true)는 false로 대체합니다. 최초 목록 조회·PC 기본 출력 선택·입력 RUNNING만으로 start_input_monitor를 호출하지 않습니다. 명시적 ‘모니터 켜기’ 뒤 기존 generation/출력 검증과 연결·재시도·수동 끄기 규칙을 적용합니다. 새 앱 실행은 꺼짐이며 네이티브 명령/응답·DB·Python 계약 변경은 없습니다.

## Phase6B 어댑터 지원 범위·미지원 폴백 — 2026-10-20

현재 고정 어댑터 htdemucs_6s/4.1.0의 출력은 GUITAR_FULL·ACCOMPANIMENT 두 종류뿐이며 leadRhythm=UNSUPPORTED입니다. 프론트 도메인의 separationCapabilities가 이 빌드의 어댑터 범위를 나타내며 설치 여부/해당 곡의 품질 보증으로 사용하지 않습니다. UI는 리드·리듬 자동 분리를 실행하지 않고 기존 사용자 WAV 불러오기와 전체 기타를 뺀 잔여 반주를 안내합니다. 저장 결과/worker에서 LEAD·RHYTHM으로 가장한 출력은 기존 엄격한 두 역할 검증으로 거부합니다. 새 IPC/DB/Python 형식·다운로드·네트워크 전송은 추가하지 않습니다. 향후 특화 어댑터는 별도 계약·허가·정량 품질 검증 후 추가해야 하며 이 상수를 true로 바꾸는 것만으로 지원할 수 없습니다.

## Phase7 첫 슬라이스 — 내부 코드 음정 집합 평가 계약(2026-10-20)

이 계약은 Rust 순수 함수 내부용이며 Tauri/worker/DB 계약을 추가하지 않습니다. 기존 단음 Matcher·실시간 채점에는 연결하지 않습니다.

- 입력: 목표 MIDI 정수2~6개(0~127), 검출 후보0~6개(midi 실수0~127·confidence0~1), 허용 오차10~100cents. 유한 범위·크기 오류는 INVALID_ARGUMENT입니다.
- 같은 목표 MIDI는 하나의 음고로 취급하며 동일 음고의 줄/프렛·성부 수를 검출했다고 주장하지 않습니다. 모든 후보 신뢰도0.85 이상일 때만 비교합니다. 후보 없음/저신뢰·10cents 이하로 중복된 후보는 UNVERIFIED입니다.
- 허용 오차 내 일대일 최대 대응을 구하고, 대응 수가 같으면 cents 절대 오차 합이 최소인 대응을 선택합니다. 목표/검출 집합이 모두 대응되면 MATCH, 누락/추가가 있으면 MISMATCH입니다. 옥타브를 같은 pitch class로 접지 않습니다.
- 결과: 상태·고유 목표/검출/대응 음고 수, 대응 음고의 평균 절대 cents 오차, 검출 최소 신뢰도. 신뢰도는 후보 제공자의 값이며 보정된 확률을 뜻하지 않습니다. UNVERIFIED의 대응/오차 수치는 없음으로 처리합니다.
- 이 함수는 PCM→여러 음정 검출, onset/스트럼 시간, epoch/재시도/점수·MISS 확정을 처리하지 않습니다. 합성 후보 검사는 실제 기타 검증을 대체하지 않습니다. 후속 DSP·시간축 결합은 별도 계약과 단음 회귀/허위 감점 실측 후에만 적용합니다.

## Phase7 테이크 PCM 다성 후보 진단 v1 — 구현 전 계약(2026-10-20)

- 신규 command `analyze_recording_pitches`: `{schemaVersion:1,projectId,takeId,startMs}`. 시작 시각은 유한한0~30000ms이며 UUID·소유 프로젝트·READY/INPUT_ONLY/USER_INPUT·누락 없는 테이크만 허용합니다. 첫 범위는30초/16MiB 이하 테이크입니다. 기존 StorageJobs 진행·취소/오류 상태를 재사용하며 새 파일이나 DB 행을 쓰지 않습니다. 활성 REC 중에는 거부합니다.
- 기존 recording_bytes의 크기/저장 SHA 검증 후 시작 지점부터400ms mono float32 구간을 처리합니다. 끝에400ms가 남지 않으면 CHORD_WINDOW_INVALID이며 임의 패딩으로 성공 처리하지 않습니다. 실제 샘플레이트8~192kHz를 사용합니다. 반환 startMs는 실제 샘플 경계로 내림한 시각입니다.
- 결과: `{schemaVersion:1,projectId,takeId,startMs,durationMs:400,sampleRate,method:'SPECTRAL_PEAK_EXPERIMENTAL',state:'CANDIDATES'|'SILENT'|'UNVERIFIED',rmsDbfs,pitches:[{midi,salience}],warnings:string[]}`. 후보 최대6개·MIDI39.5~88.5/주파수 오름차순, salience0~1은 가장 큰 스펙트럼 peak에 대한 상대 진폭이며 정답 확률/confidence가 아닙니다.
- DC 제거/Hann창·FFT/log-peak 보간과 초기 배음 억제 기반 진단입니다. 동일 음고/배음에 겹치는 성부, 약한 기본음, 왜곡·스펙트럼 중첩을 신뢰성 있게 복원한다고 주장하지 않습니다. 결과에는 항상 실험적/옥타브 성부 모호성 안내를 포함합니다. 무음은 빈 후보, 클리핑/잡음/복잡한 다성은 UNVERIFIED/빈 후보입니다. 초깃값은 실측 후 재평가합니다.
- UI는 ‘녹음 다시 듣기’의 현재 선택 테이크·명시적 분석 버튼/시작ms·취소/결과만 제공하며 자동 분석하지 않습니다. 프로젝트/테이크/입력값 변경 때 기존 결과를 비우고 늦은 응답은 표시하지 않습니다. 원본/시스템/YouTube 캡처나 업로드, 새 REC·자동 채점은 하지 않습니다. 단음 튜너/Matcher는 유지합니다.
- Tauri 신규 명령만 추가하며 기존 v1/DB/Python 형식은 변경하지 않습니다. 원격 origin IPC 거부 회귀를 추가합니다.

### 구간 진단의 샘플 경계 보완 — 2026-10-20

테이크 구간 결과에는 실제 처리 frames도 포함합니다. frames=floor(sampleRate*2/5), durationMs=frames*1000/sampleRate로 반환하며 비표준 샘플레이트에서는400ms보다 한 샘플 미만 짧을 수 있습니다. startMs 역시 요청을 샘플 경계로 내림한 값이며 프론트가 같은 계산으로 검증합니다. 이 내부/구간 입력 검증의 오류 코드는 기존 AppError에 맞춰 INVALID_INPUT입니다. 정확한 결과 필드는 schemaVersion/projectId/takeId/startMs/durationMs/frames/sampleRate/method/state/rmsDbfs/pitches/warnings의12개이며 추가 필드는 거부합니다.

## Phase7 미지원 주법 보호 확장 — 구현 전 계약(2026-10-20)

- NoteEvent/저장 ScoreNote v1에 선택적 judgementSupport:'UNSUPPORTED'를 추가합니다. 누락된 기존 기본 악보는 호환하며 null/다른 문자열/배열·boolean은 거부합니다. DB 스키마/Python은 변경하지 않고 새 불변 revision에만 보존합니다. 이전 앱은 새 필드를 읽지 못할 수 있으므로 기존 revision/원본을 유지하고 새 후보 적용 전에는 새 필드를 저장하지 않습니다.
- 설치 alphaTab1.6.1의 실제 note/beat 주법 표식을 기준으로 벤딩·슬라이드·해머링/풀링·팜뮤트/데드노트·하모닉스·비브라토/트릴·와미/트레몰로를 지원 미검증으로 표시합니다. 검출했다고 주장하지 않습니다. 일반 피킹 음·attack=false 타이 규칙은 유지합니다.
- PracticeTarget v1에 선택적 unsupported:boolean(누락=false)을 추가합니다. 네이티브 순수 Target의 명시적 제외로 연결하고 기존 동시음 UNSUPPORTED와 합칩니다. 해당 목표는 고신뢰 관측에도 COOL/GOOD/WRONG_NOTE로 매칭하지 않으며 정상 윈도 종료 시 UNSUPPORTED/0점으로 제외합니다. 중단·시작 창 부족은 기존 SKIPPED 우선순위입니다. 단음 설정/점수·분모 규칙은 유지합니다.
- 영구 기록의 prepare_archive는 저장된 NoteEvent 표식과 target.unsupported의 동등성도 검증해 임의로 제외를 해제하거나 일반 음을 제외해 저장하지 못하게 합니다.
- 예전 원본 렌더 악보는 재열기 때 검증한 원본의 주법 표식만 메모리 문서에 보완합니다. 기존 note/track/score ID·싱크/역할을 유지합니다. 새 표식이 추가되면 프로젝트를 명시적으로 저장해 새 revision을 만들기 전 저장 대상이 달라졌음을 표시합니다. 원본/이전 revision을 자동 수정하지 않습니다. 기본 단음은 이 변경으로 저장 필요 상태가 되지 않습니다.
- 현재 기본 수동 편집기는 주법을 보존할 수 없어 해당 표식이 있는 문서의 정규화 편집/출력을 거부하고 원본 보기·재생을 유지합니다. 주법을 조용히 삭제해 판정 가능 음으로 바꾸지 않습니다.

주법 보호의 인접 목표 정책: 보정된 onset에서 가장 가까운 미지원 목표가 가장 가까운 지원 목표보다 가깝거나 같은 경우, 그 onset을 옆 음의 정답/오음/저신뢰 근거로 사용하지 않습니다. 실제로 어느 음을 연주했는지 보장하는 분류가 아니라 보수적 귀속 제한입니다. 이 정책을 포함한 신규 기록은 `monophonic-poc-v2`로 구분하며 이전 v1 기록/점수를 재계산하지 않습니다.

## Phase7 단음 PCM 음정 궤적 내부 계약 — 구현 전(2026-10-20)

- 새 `audio::pitch_track`은 UI/실시간 입력/점수/저장 계약과 분리한 오프라인 실험 엔진입니다. 고정1초의 mono f32 PCM, 샘플레이트8~192kHz, 취소 토큰을 받습니다. NaN/Inf·길이·샘플레이트를 검사하며 외부 라이브러리는 추가하지 않습니다.
- 제한된 블록 평균 다운샘플 뒤 기존 단음 차분 검출기를 사용합니다. 이는 범용 고품질 리샘플러가 아니며 기본음70~1500Hz의 깨끗한 단음만 평가합니다. 원본은 수정하지 않습니다.
- 1024샘플 창·약25ms hop의 시간/단음 후보·검출기 confidence를 최대40개 반환합니다. confidence는 차분 주기성 척도이며 정답일 확률이 아닙니다. 저음량/주기성 부족/지원 음역 밖의 창은 후보 없음으로 둡니다. 추정 창 중심 시간을 사용하고 onset/sample-accurate 정렬이라고 주장하지 않습니다.
- 파생 결과는 STEADY/RISING/FALLING/UNVERIFIED와 유효 비율·처음/끝 유효3점의 중앙값 차이(cents)입니다. 유효 창80% 이상/주기성0.90 이상, 고정 초기 움직임 범위·방향 일관성 기준에 한정합니다. 클리핑·낮은 coverage·급격/모호한 변화는 보류합니다.
- 벤딩·슬라이드·비브라토/레가토의 실제 주법을 음정 곡선만으로 구별하지 않습니다. 항상 실험·단음 전용·주법 분류 아님 경고를 반환하며 현재 UNSUPPORTED 목표를 지원 가능으로 바꾸거나 점수를 부여하지 않습니다.
- 자체 순음/배음 PCM의 유지음·상승/하강·잡음/무음/클리핑/도약/범위·취소·샘플레이트를 검증합니다. 실제 기타 궤적 오차·허위 주법 분류율 및 UI/저장 테이크 연결은 후속이며 이번 내부 엔진의 통과와 구분합니다.

### 선택 테이크 단음 궤적 명령 v1 — 구현 전

- `analyze_recording_pitch_track({request:{schemaVersion:1,projectId,takeId,startMs}}) -> StorageJob v1`. 기존400ms 스펙트럼 명령은 그대로 유지합니다. 같은 소유권·누락 없는 READY·최대30초/16MiB·SHA·녹음 중 금지·취소/진행·늦은 결과 폐기 정책으로 사용자가 선택한1초만 분석합니다. 파형을 프론트로 반환하거나 원본/DB/점수를 수정하지 않습니다.
- 성공 결과는 정확히15필드입니다: schemaVersion/projectId/takeId/startMs/durationMs(1000)/frames(샘플레이트와 동일)/sampleRate/method(MONOPHONIC_TRACK_EXPERIMENTAL)/motion(STEADY,RISING,FALLING,UNVERIFIED)/coverage(0~1)/deltaCents(number|null)/minConfidence(number|null)/rmsDbfs/points/warnings.
- 각 point는 정확히 `{timeMs,pitchMidi,confidence}`이며 timeMs는 구간 내 창 중심(0~1000), 음정/주기성은 둘 다null 또는 MIDI39.5~88.5/confidence0.90~1입니다. 시간은 오름차순·샘플레이트/감소 배수/1024창/25ms hop으로 산출하는 원본 위치와 일치합니다. 후보가 없어도 정상 창 위치는 남깁니다. 전 구간 클리핑/저음량 보류만 points=[]를 허용합니다.
- coverage는 유효 point 비율, minConfidence는 유효점 최소 주기성입니다. deltaCents는 앞/뒤3점 중앙값 차이이며 유효 비율80% 미만 또는 유효6점 미만에서는null입니다. 미확정 흐름도 유효 비율이 충분하면 변화량을 보존하되 주법으로 확정하지 않습니다.
- 항상 EXPERIMENTAL/MONOPHONIC_ONLY/NOT_TECHNIQUE_CLASSIFICATION 경고를 포함합니다. 추가 허용 경고는 CLIPPED/LOW_LEVEL/LOW_COVERAGE/NON_MONOTONIC_OR_AMBIGUOUS입니다. 예상과 다른 필드/ID/구간/시각·유효 비율/주기성/경고를 거부합니다.1초가 남지 않은 경우 PITCH_TRACK_WINDOW_INVALID로 종료합니다.
- 최소 UI는 기존 녹음 분석 패널의 ‘분석 방식’ 선택에 ‘단음 음정 변화 ·1초’를 추가합니다. 변경 시 이전 결과를 지우고 진행 중에는 선택을 잠급니다. 명시적 버튼을 눌러야 실행하며 상승/하강 후보·주기성(확률 아님)·음정 변화량과 원시점 확인만 제공합니다. 실제 벤딩/슬라이드 판정이나 점수는 활성화하지 않습니다.

미지원 표기 후속 확대: 단음 궤적 연결 후보에는 alphaTab의 `isLeftHandTapped`/`isGhost`도 같은 UNSUPPORTED metadata로 보존합니다. 새 필드나 주법 지원·검출 성공을 뜻하지 않으며 원본 재열기/편집 보호 정책은 동일합니다.


## 공개 기타 연속 음정 평가의 개발 전용 계약 — 2026-10-21

기존 GuitarSet1.1.0 검증 원본4개/CRC·SHA·cc-by-4.0와 고정 정수초1초창을 재사용합니다. 별도 명시적 --continuous 모드는 같은 benchmark schema1의 referencePolicy를 continuous-center-v1로 구분하고 TRACK만 생성합니다. 검출기와 독립적으로 정한 기존38개 분석 중심 시각마다6줄 주석을 조회하며 가장 가까운 주석이3.5ms보다 멀거나 누락·voiced/frequency 상충·음역 밖이면 참조 불확정으로 제외합니다. 중심 시각별 음정이 변하는 것을 평균/반올림하거나 안정도 이유로 제거하지 않습니다. 동시에 들리는 서로 다른 음정은 다성으로 분리하며 단음 정확도에 섞지 않습니다.

native cfg(test) 평가만 이 정책을 추가 수용하고 기존 stable-window-v1/EGSet12 정책은 유지합니다. 기존 단음 coverage/누락 포함50cents 적중률·조건부 오차 및 다성/무음 오검출 분모를 따로 보고합니다. 연속 정답 자체가 자동 주석이며 모델 학습 중복 여부도 불명확하므로 주법 분류/일반화·실시간 지연/채점 정확도를 입증하지 않습니다. 앱 IPC·DB·Python worker 버전/실제 오디오 콜백/앱 기능은 바꾸지 않습니다. 새 다운로드/의존성·개인 녹음 분석은 없습니다.


개발 평가 결과 JSON은 schemaVersion2로 기록하고 monoReferencePoints/polyReferencePoints/unvoicedReferencePoints/excludedReferencePoints로 분모를 구분합니다. 이전 안정 참조 보고서 파일은 변경하지 않습니다. 입력 benchmark schemaVersion1과 제품 IPC 버전은 유지하며, 중심 시각만 비교한 결과를 안정 창으로 표기하지 않습니다.


첫 strict 중심 참조 실행은3458지점 중3413개가 제외되고 단음 분모가0이었습니다. 원본 JAMS를 확인하니 줄별 pitch_contour는 발음 구간만 있는 희소 주석으로, 모든 줄에 매 시각 표본이 존재한다는 가정이 성립하지 않았습니다. 원래 결과를 보존하고 후속 continuous-note-mask-v1은 같은 자료의 note_midi6줄 구간을 발음 마스크로만 사용합니다. 음표 시작/끝30ms 이내는 제외하고, 발음 중인 줄의 F0가3.5ms 내 없거나 미발음 줄에 유성 F0가 있으면 불확정으로 제외합니다. 미발음은 단순 F0 누락이 아니라 note_midi와의 교차 확인에 근거합니다. MIDI 음높이로 F0를 대체/양자화하지 않으며6개 줄 data_source0~5 일치를 확인합니다. 이 마스크 역시 자동 주석이므로 절대 정답/실제 무음을 보장하지 않습니다. 이미 생성한 strict 결과는 수정하지 않습니다.


오차 원인 분리를 위해 개발 평가 schema2 보고서에 trackCases를 추가합니다. 검증된 각 TRACK의 clipId/startMs/분석 warnings와 최대38개 전체 참조 지점(index/timeMs/referenceMidi/detectedMidi/periodicity)을 보존합니다. 미분석 지점의 시각/검출은null, 참조 불확정null과 주석상 무음[]은 구분하며 주기성을 확률로 바꾸지 않습니다. 기존 요약 분모/점수·참조를 바꾸지 않으며 모든 고정 창을 기록해 결과에 따라 좋은 구간만 선택하지 않습니다. 공개 파일의 개발 결과만 기록하며 개인 오디오/UI/제품 IPC에 연결하지 않습니다.


## 기타 악보 트랙 직접 추가 — 계약/수용 완료(2026-10-22)

- 기존 프론트 `StructureEdit`에 `ADD_GUITAR_TRACK`을 추가합니다. 편집 안내 확인 후 잠금이 해제된 기본 단성 문서에만 적용하며, 최대128트랙을 넘으면 기존 문서와 history를 유지하고 오류를 표시합니다. 신규 IPC/DB/Python 버전이나 의존성은 추가하지 않습니다.
- 새 UUID, 기존 이름과 겹치지 않는 ‘기타 N’, 표준6줄 튜닝(1번 줄부터64/59/55/50/45/40), instrument=GUITAR, role=UNKNOWN, 빈 notes로 끝에 추가합니다. 기존 트랙/음표 ID·데이터, 박자·템포·수동 syncAnchors와 원본 바이트/저장 revision은 보존합니다. 새 트랙은 별도 기타 오디오 생성이나 AI 파트 분리를 뜻하지 않습니다.
- 추가 직후 새 트랙을 선택하고 기존 음표 추가·역할·튜닝 기능을 사용합니다. 되돌리기로 현재 선택 트랙이 없어지면 첫 유효 트랙으로 복귀합니다. 다시 실행은 같은 ID/문서를 복원하며 현재 유효한 선택은 유지합니다. 원본에 없는 추가 트랙의 원본 비교는 ‘추가한 트랙은 원본에 없습니다’로 표시합니다.
- 기존 불변 revision 저장/재열기와 JSON 출력은 ID·역할·선택을 유지합니다. MusicXML은 기존 출력 범위(음정·시각·운지·박자·템포·트랙 이름/튜닝)를 유지하며 앱 전용 ID·역할·수동 싱크 보존 형식은 JSON입니다. 취소/잠금·128개 한도·미지원 문서 거부·Undo/Redo·실제 렌더 및 저장 복원을 검사합니다. 트랙 삭제/이름 변경/재정렬은 이번 범위가 아닙니다.

## 기타 악보 트랙 이름 변경 — 계약/수용 완료(2026-10-22)

- 기존 StructureEdit에 `{kind:'SET_TRACK_NAME',trackId,name}`을 추가합니다. 현재 기본 단성 편집/잠금·원본 보호를 그대로 적용합니다. 신규 IPC/DB/Python/의존성은 없습니다.
- 이름은 앞뒤 공백을 제거한1~200문자(Unicode 코드 포인트)이고 제어 문자를 거부합니다. 존재하는 트랙 ID만 허용하며 다른 트랙 이름과 겹치면 기존 문서를 유지하고 오류를 표시합니다. alphaTab 표시용 NBSP는 일반 공백과 같은 이름으로 비교합니다. 기존 트랙의 이름 외 ID·역할·튜닝/음표·시각/싱크, 다른 트랙, 원본 바이트/저장 revision을 바꾸지 않습니다.
- 기존 history로 Undo/Redo하고 선택 ID를 유지합니다. 최소 UI는 선택 트랙 이름 입력과 ‘트랙 이름 적용’ 버튼이며 폼 미적용 값은 저장/자동 저장 대상이 아닙니다. 실제 렌더는 기존 XML escape를 사용하며 JSON/프로젝트 저장은 앱 이름 그대로, MusicXML 재렌더는 표시용 공백 변환을 허용합니다.
- 정상/경계·빈값/초과/제어문자·중복/없는ID·잠금·원본 보존·Undo/Redo·프로젝트 저장/재열기를 검사합니다. 트랙 삭제/재정렬·화음/주법 편집은 이 범위가 아닙니다.

## 내부 설치 검증의 빌드 프로필 — 2026-10-21

최적화 산출물 검증을 위해 개발용 prepare_validation_installer.py의 --profile과 Test-ValidationInstaller.ps1의 -BuildProfile에 debug/release 두 값만 허용합니다. 기존 기본값은debug이며 새 계획의 buildProfile과 검사 인자가 일치하지 않으면 설치 전에 거부합니다. 이전 프로필 없는 계획은debug로만 해석합니다. 목표 경로는 해당 고정target/debug 또는target/release에서 계산하고 임의 경로·profile 이름은 받지 않습니다. UUID별제품명/프로세스/AppData·현재 사용자 설치·데이터 보존/원격 권한은 유지하며 제품 IPC/DB/모델 계약은 변경하지 않습니다. release 검증도 서명/최종배포·새Windows 수용을 뜻하지 않습니다.
## TAB 음표 선택 — 구현 전 계약(2026-10-22)

2026-10-23 사용자 수용/요청 후속: 숫자 클릭/오른쪽 화살표 선택을 Windows에서 확인했습니다. 숫자뿐 아니라 같은 박자 열의 줄/세로선 영역도 선택하도록 공개 beatMouseDown을 사용합니다. 현재 기본 단성 범위에서 beat.notes가 정확히1개일 때만 같은 Note 매핑을 사용하고 쉼표/여러 음의 박자는 선택을 유지합니다. 새 음표 생성/줄 변경·화음 음표 추측은 하지 않습니다. 숫자 전용 noteMouseDown은 중복 연결하지 않아 한 번의 클릭을 두 번 처리하지 않으며 includeNoteBounds의 추가 계산도 필요하지 않습니다. 렌더는 score/track 변경에만 재생성하고 콜백/잠금 상태는 최신 참조를 사용합니다. 아래 noteMouseDown/includeNoteBounds 설명은 숫자 전용 첫 구현 이력이며 이 공개 beat 이벤트로 대체합니다.

- 키보드는 카피의 선택 가능한 악보 영역에 초점이 있을 때만 좌/우 화살표와 Home/End를 처리합니다. Ctrl/Alt/Meta/Shift 조합과 입력칸의 기본 동작은 가로채지 않습니다. 숫자 클릭은 페이지 스크롤을 바꾸지 않고 악보에 초점을 두며 처음/끝에서 순환하지 않습니다. 버튼과 키보드는 같은 컨트롤러 이동 명령을 사용하고 잠금/빈 트랙/새 음표 상태에서 무시합니다.

- 편집 안내 확인 후 카피 화면에서 TAB 숫자를 클릭하거나 이전/다음 음표 버튼·기존 목록으로 음표를 선택합니다. 선택은 현재 원본 바이트와 트랙 ID에 묶인 임시 상태이며 악보·history·revision·저장/자동 저장 대상은 바꾸지 않습니다. 잠금·다른 트랙/옛 렌더의 이벤트·없는 ID는 무시합니다.
- alphaTab1.6.1의 공개 noteMouseDown/includeNoteBounds를 사용하고 자체 재생·seek는 켜지 않습니다. 어댑터는 실제 현재 model.Note 객체와 트랙/마디/beat를 확인하고 playbackLookup의 반복 occurrence 시작+beat.playbackStart, 길이·실제 음정·줄/프렛이 모두 맞는 도메인 음표만 선택합니다. 같은 표기의 반복은 현재 재생 tick에 가장 가까운 occurrence, 동률은 먼저 나온 occurrence를 선택합니다. 매칭 실패/모호한 중복은 선택을 유지합니다.
- ID는 렌더별 숫자 ID/정규화 때 새 UUID로 추측하지 않습니다. NORMALIZED 재렌더 뒤에도 도메인 ID는 유지합니다. 원본 비교/연습/연주는 클릭 편집을 연결하지 않습니다. 삭제/Undo/Redo/트랙 변경으로 선택 ID가 사라지면 현재 트랙 첫 음표, 빈 트랙은 새 음표로 복귀합니다. ‘새 음표 추가’는 명시적으로 유지합니다.
- 선택 시 반주를 일시정지하고 카피의 정지 커서는 선택 음표 tick을 표시합니다. 커서 추적은 기존 악보 내부 스크롤만 사용합니다. 미적용 입력 폼은 선택을 바꾸면 버려지므로 안내합니다. 원본/반복/다중 트랙·재렌더·잠금·삭제/Undo·쓰기 없는 선택·실제 렌더 이벤트 전달을 검사합니다. 신규 의존성·IPC/DB/Python 계약 변경은 없습니다.

## 압축 악보 입력의 전개량 제한 — 구현 전 계약(2026-10-22)

- 공통 importScore 어댑터의 원본 입력8MiB 제한은 유지하며, alphaTab1.6.1이 처리하기 전에 압축 포맷을 확인합니다. BCFZ(GPX)의 예상 해제량은4바이트 헤더를 포함해4바이트~32MiB 범위만 허용합니다. 원본/저장 자산은 수정하지 않습니다.
- 추가 확인: GPX의 내부 BCFS 파일 크기도 별도 할당에 사용되므로 헤더만 검사해서 안전하다고 표시하지 않습니다. GPX bitstream/BCFS도 앱에서 경계·전개/파일 누적32MiB·항목512개·sector 참조/진행·완료를 검사하고, 검증한 GPIF/스타일 항목을 동일 GPIF/스타일 파서를 사용하는 비압축 내부 ZIP으로 전달합니다. 정상 자체 BCFS/BCFZ와 upstream의 직접 읽기 결과를 비교합니다. malformed/불완전 컨테이너는 원본을 유지해 거부합니다.
- ZIP 기반 GP/MusicXML은 실제 스트리밍 해제량의 합계를 최대32MiB·항목512개로 제한하고, 작은 입력 청크마다 확인합니다. 헤더의 originalSize만 믿고 전체 unzipSync를 호출하지 않습니다. 잘못된 스트림·중복 이름·미지원 압축/미완료 항목은 거부합니다. 검증한 항목만 비압축 내부 ZIP으로 다시 구성해 alphaTab에 전달하고 원래 압축 바이트는 원본 비교/저장에 유지합니다. 디스크 추출/파일 경로 접근·네트워크는 없습니다.
- fflate0.8.3(MIT)의 ESM/브라우저 스트리밍 API와 TypeScript5.7+ 타입 수정 이력을 공식 버전 소스에서 확인하고 고정 의존성/lockfile·배포 고지에 반영합니다. 프론트 공통 어댑터만 사용하며 Rust/Python·DB/IPC 버전은 바꾸지 않습니다.
- 실패는 기존 악보/미저장 문서를 유지합니다. 취소된 파일 읽기의 파싱 진입 차단·잘못된 입력·선언 크기 및 실제 해제량 초과·항목 과다/중복·잘린 스트림·정상 자체 GP/MusicXML/JSON/원본 보존 회귀를 검사합니다. 이 제한은 악보 XML/GP 파서 전체의 CPU/메모리·주법 정확도나 ZIP의 진위/서명을 보증하지 않습니다. 전체 파싱을 비동기 worker로 옮기는 변경은 이번 범위가 아닙니다.

