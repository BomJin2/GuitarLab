# ai/AGENTS.md — Python 분석 규칙

루트 `AGENTS.md`와 `docs/06-AI-COPY-PIPELINE.md`, `docs/12-API-CONTRACTS.md`를 반드시 함께 적용합니다.

- AI는 **오프라인 배치 작업**을 담당합니다. 저지연 리듬게임 판정을 Python 모델의 실행 완료에 의존시키지 않습니다.
- 입력 파일 검증 → 필요 시 스템 분리 → 음표 추출 → 시간/박자 정량화 → 음역·튜닝에 맞는 운지 후보 생성 → 미리보기/수정 → 내보내기로 분리합니다.
- `audio-separator`와 `Basic Pitch`는 교체 가능한 adapter로 작성합니다. 별도 모델·가중치의 이용 허가와 배포 가능 여부를 검토합니다.
- 모델이 없는 개발 환경에서도 fixture/mock adapter로 전체 파이프라인의 성공·실패·취소 동작을 검증할 수 있어야 합니다. Mock을 실제 분석 결과로 노출하지 않습니다.
- stdout은 버전 표시된 JSONL 프로토콜 전용. 진행 로그/진단 메시지는 stderr로 출력하되 사용자 경로/음원 내용은 기록하지 않습니다.
- 작업마다 job_id, 진행률, cancel 여부, 오류 코드, 결과 경로를 반환합니다. 취소 요청 시 임시 파일을 정리합니다.
- 무결성 확인 전 다운로드된 모델을 실행하거나 로드하지 않습니다. 첫 실행 시 모델 강제 네트워크 다운로드를 금지합니다.
- `pytest`로 노트 정렬, 잘못된 입력, 템포 변경, 다성 입력, 빈 분석 결과, 취소를 검증합니다.
- AI 결과의 note confidence 및 불확실한 구간을 UI에서 사용자가 볼 수 있도록 반환합니다.

## 추가 — Lead / Rhythm 분리

- `docs/16-LEAD-RHYTHM-GUITAR-SPLIT.md`를 참조해 기본 Guitar stem(전체 기타)과 Lead/Rhythm AI 후보를 **다른 기능**으로 취급합니다.
- 기본 모델이 리드/리듬을 분리한다고 가정하지 않으며, 별도 part separation adapter가 실제 설치·라이선스·품질 검증을 통과한 경우에만 opt-in 실행합니다.
- StemRole confidence와 사용자 확인 여부, 모델/가중치 버전, mix alignment를 provenance로 남깁니다.
- 소스가 YouTube video URL이면 모든 audio extraction/separation job을 거부하고 로컬 파일 선택을 안내합니다.
