# 재생 Rust 이전 R4 — MP3 반주 디코딩

- 작업 일자: 2026-11-11
- Git commit/branch: `main`, 기준 커밋 `650b2b2`. **커밋하지 않음**.
- 설계·결정: [docs/plugin/PLAYBACK-RUST-DESIGN.md](../plugin/PLAYBACK-RUST-DESIGN.md) 7절(사용자 결정: `symphonia`, 네이티브 재생 + WAV 믹스 내보내기 함께). 계약: `docs/12` "MP3 반주 디코딩 v1".

## 결론

- **PASS(자동)**:
  - Rust 믹서 디코더가 MP3를 읽습니다(`src-tauri/src/mixer/mp3.rs`, `pcm.rs`에서 첫 바이트로 분기). 네이티브 재생·WAV 믹스 출력·DAW 표시가 같은 디코더를 씁니다. 화면에는 MP3 전용 분기가 없어(Rust 준비 실패 시 WebView로 넘어가는 구조) 문구만 바꿨습니다.
  - 길이를 모르고 풀므로 조각마다 512MiB 예산·611초를 확인하고 넘으면 바로 `MIX_LIMIT_EXCEEDED`(실패하면 예산을 쓰지 않음). 용량은 두 배씩 늘리되 예산 상한을 넘겨 잡지 않습니다. 깨진 프레임은 건너뛰지 않고 실패.
  - `pnpm verify:app` 통과(프론트 902·Rust 338, 처음엔 바뀐 실패 문구를 기대하던 테스트 1개와 서식 1건을 고친 뒤 통과), `cargo clippy --locked --all-targets --all-features -- -D warnings` 통과, CI와 같은 `scripts` 단위 검사 통과.
  - 회귀 검사 5개: 헤더 있는/없는 MP3의 클릭 위치, stereo 좌우 분리·mono 평균, 예산·쓰레기 입력·취소 거부, 믹스 디코더 분기, MP3 반주로 WAV 믹스 출력과 네이티브 보이스의 클릭 시각이 같음.
- **PASS(실측, 싱크 기준)**: 1.000초에 클릭이 든 WAV를 사용자 PC의 ffmpeg(libmp3lame)로 LAME 헤더 있는/없는 MP3로 만들어(작업 폴더) 비교했습니다.

| 파일 | symphonia(gapless) | Chromium `decodeAudioData` | Chromium `<audio>` 처음부터 재생 |
| --- | --- | --- | --- |
| LAME 헤더 있음 | 오프셋 0 | 0(44.1kHz는 -1샘플) | WAV와 같음(측정 흔들림 ±10ms 안) |
| 헤더 없음 | +1,105샘플 | +1,105샘플(약 23~25ms) | WAV보다 약 25~30ms 늦음 |

  - 따라서 기존 MP3 프로젝트의 싱크 지점·테이크(처음부터 재생 기준)는 그대로 맞습니다.
  - 발견: Chromium `<audio>`는 MP3에서 **이동(seek) 뒤 약 25ms 늦게** 자리를 잡았습니다(세 번 같음, WAV는 정확). 기존 WebView 재생에서 곡 중간으로 이동한 뒤 녹음한 MP3 테이크는 이만큼 어긋나 있었을 수 있습니다. Rust 재생은 이동해도 파일 처음부터의 위치 그대로입니다.
- **배포 고지**: Rust 배포 의존성 12개 추가(symphonia 0.5.5 계열 4개 MPL-2.0, `arrayvec`·`bytemuck`·`core_detect`·`encoding_rs`·`lazy_static`·`multiversion_no_op`·`rustversion`·`simdutf8`). 인벤토리를 다시 수집해 기존 항목·원문은 그대로임을 확인하고 새 항목만 넣었습니다. symphonia crate에는 LICENSE가 없어 정확한 배포 commit `6d533f26…`의 저장소 루트 LICENSE를 받아 보완했고, MPL 원본 crate 4개를 `docs/release/sources/`에 보관했습니다(Cargo.lock SHA256 일치, 설치 소스 77개 파일 일치).
- **큰 입력 성능(R6 뒤 후속 점검)**: 1.5초 fixture를 380번 이어 붙인 586초 mono MP3를 풀면 release 0.24초, debug(검증앱) 12.6초였습니다. stereo면 debug 약 25초라, `Cargo.toml`에서 `symphonia-core`·`symphonia-bundle-mp3`만 dev 빌드에서도 `opt-level = 3`으로 바꿔 debug 1.04초가 되었습니다. 배포(release) 빌드에는 영향이 없습니다. Cargo.toml이 바뀌어 배포 인벤토리의 의존성 입력 지문만 갱신했습니다(`ten_minute_mp3_decode_time`, 무시 표시 측정 검사).
- **NOT RUN(사람 확인)**: MP3 반주 청취·내보낸 WAV 확인 → `MANUAL-CHECKS.md` 31번.

## 위험·후속

- 44.1kHz MP3(대부분의 MP3)는 48kHz 출력에 선형 보간을 씁니다. 고음이 WebView보다 조금 거칠 수 있습니다(44.1kHz WAV도 R2부터 같음). 청취에서 거슬리면 고품질 리샘플러를 따로 결정합니다.
- 디코딩 전 MP3 바이트를 한 번 복사합니다(symphonia가 소유한 입력을 요구). 큰 MP3가 잦으면 호출부가 Vec을 넘기게 바꿉니다(코드에 `shortcut:` 표시).
- symphonia 0.6.1이 나와 있지만, 널리 쓰이는 0.5.5로 고정했습니다.

## 테스트 파일 만드는 법

`src-tauri/src/mixer/testdata/`의 MP3 3개는 직접 합성한 1.5초 WAV(1.000초에 32샘플 감쇠 클릭)를 ffmpeg로 인코딩했습니다: `-c:a libmp3lame -b:a 64k -map_metadata -1`(헤더 있음), 같은 설정에 `-write_xing 0`(헤더 없음), 48kHz stereo 왼쪽만 클릭은 `-b:a 96k`.

## 리뷰 반영(2026-11-13, Codex 리뷰 R1·R2)

- **헤더 없는 VBR의 끝 잘림 수정**: symphonia의 gapless 옵션은 Xing/VBRI 헤더가 없으면 앞 17프레임으로 추정한 길이에서 끝을 잘랐습니다. 앞이 시끄럽고 뒤가 조용한 2.5초 VBR(`testdata/click-mono-vbr-noxing.mp3`, ffmpeg `-q:a 2 -write_xing 0`)이 1.2초(52,992샘플)로 줄었습니다. 이제 gapless 옵션을 끄고 LAME 헤더의 앞 지연·뒤 채움을 다 푼 뒤 직접 자릅니다. 기존 시작 위치 검사(헤더 있음/없음)는 그대로 통과했습니다(`headerless_vbr_mp3_keeps_its_tail`).
- **끝이 잘린 파일**: 마지막 온전한 프레임까지 씁니다. 끝 채움(LAME padding)은 선언 길이 끝까지 풀었을 때만 뺍니다. 전에는 잘린 파일에서도 빼서 소리가 약 16ms 더 잘렸습니다(리뷰 R3-1, 잘린 fixture 30,438 → 31,151샘플). 정상 끝과 같은 EOF라 구분할 수 없고, WebView도 그렇게 재생했습니다(`truncated_mp3_plays_up_to_the_last_whole_frame_without_shifting`).
- **중간 프레임 헤더 손상**: 디먹서가 알리지 않고 다음 동기로 넘어가 감지하지 못합니다. 그 뒤가 한 프레임(약 26ms)씩 당겨질 수 있습니다(WebView와 같음, docs/12에 명시).
