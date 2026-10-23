# 테스트 자료

Phase 0에는 오디오·악보 fixture가 없습니다. 후속 Phase에서 직접 생성한 자료만 추가하고 출처, 생성 방법, 예상 결과를 기록합니다.

## Phase 2 자체 제작 자료

public/fixtures/standard.musicxml: 4/4, 120 BPM, 2마디, E4 G4 A4 B4 반복, 표준 기타 1번 줄 0/3/5/7프렛. public/fixtures/sine.wav: 48kHz mono PCM16, 4초, 동일 음정의 0.5초 사인파 8개. 직접 합성하여 저작권 음원/개인 녹음을 포함하지 않습니다.

standard.gp는 자체 MusicXML을 alphaTab 1.6.1 Gp7Exporter로 변환한 GP7 round-trip fixture입니다. sine.mp3는 설치된 FFmpeg의 libmp3lame 인코더로 자체 sine.wav를 변환했습니다(앱 의존성/번들에 FFmpeg를 추가하지 않음). MP3 길이는 ffprobe로 4초를 확인했습니다.

## Phase 2A 자체 제작 두 기타 자료

`public/fixtures/dual-guitar.musicxml`: 기존 자체 standard.musicxml을 Python 표준 xml.etree.ElementTree/copy로 확장했습니다. 4/4·120BPM·2마디·4초, Guitar1은 E4/G4/A4/B4(64/67/69/71), Guitar2는 E2/A2/D3/G3(40/45/50/55)를 각2회 반복합니다. 표준6현 튜닝이며 Guitar2는6/5/4/3번 개방현입니다. MIDI program은1기반25/26, 채널1/2입니다. 트랙당8개의 독립된 공격 음이 있고 역할은 자동 확정하지 않아 UNKNOWN입니다. 원곡/상업곡/개인 연주를 포함하지 않습니다. UI 악보 선택·커서·채점 대상 독립성 검사에 사용하며 별도 오디오 stem을 생성했다고 표시하지 않습니다.


## Phase7 선택 공개 외부 검증 자료 — 2026-10-20

`fixtures/external/`은 Git/앱 배포물에서 제외합니다. 개발 CLI가 명시적으로 고른 소량만 수신하며 기존 개인 파일이나 저작권 곡을 분석하지 않습니다. 출처/허용 조건·선정 규칙·지문은 각 UUID 폴더의 manifest/ATTRIBUTION에 보존합니다.

- GuitarSet1.1.0: 공식 CC BY4.0,4개/2명 어쿠스틱 마이크 WAV/JAMS. 선택 ZIP member의 CRC/로컬SHA를 확인했고 전체 ZIP MD5 확인과 구분합니다. Basic Pitch의 학습 자료에 포함된 데이터셋이므로 독립 시험이라고 부르지 않습니다.
- Guitar-TECHS Zenodo14963133: 공식 CC BY4.0,6개 ZIP의 목록/MIDI8개만 수신. 연속 pitchwheel 참조가 없어 주기적 깊이/속도 정답으로 쓰지 않으며 큰 DI WAV는 수신하지 않았습니다.
- EGSet12 Zenodo11406378: 공식 CC BY4.0,분석 전01/12 고정2개/1명 앰프 마이크 WAV/JAMS4개·15,442,646바이트. 전체 공식 MD5/크기와 로컬SHA를 확인합니다.24bit stereo 원본을 보존하고 별도 float mono/PCM 조각만 만듭니다. 정수 음표 주석이므로 연속 음정 변화·실제 주법·샘플 정밀 정답/학습 비중복을 주장하지 않습니다. 모델 가중치는 받지 않습니다.

재현 명령/결과와 좁은 표본/제외 수는 docs/progress/PHASE-07.md를 참조합니다.
