# 믹스 입력 한도 v2(64MiB → 512MiB)

- 작업 일자: 2026-11-08
- Git commit/branch: `main`, 기준 커밋 `04dfdea`. **커밋하지 않음**.
- 사용자 결정(2026-11-08): "합계 512MiB로 올림".

## 문제

녹음은 10분(48kHz mono float32 약 110MB)까지 되는데, 믹스 준비(화면)와 WAV 믹스 출력(Rust)의 입력 합계가 64MiB여서 48kHz 테이크는 약 5.8분(출력은 반주 포함), stereo Bounce는 약 2.9분에서 `MIX_LIMIT_EXCEEDED`가 났습니다.

## 변경

- `src-tauri/src/mixer/render.rs`: `INPUT_BUDGET` 512MiB(디코딩한 mono f32 합계). 10분 반주 + 10분 테이크(48kHz)가 들어가는지 컴파일 시점 `assert`.
- `src/features/performance/useProjectMix.ts`: 믹스 준비 읽기 합계 512MiB(Rust와 같은 값).
- 안내 문구(`mixing.ts`, `MixPanel.tsx`)와 계약 `docs/12` "믹스 입력 한도 v2".
- DAW 파형 읽기 예산(64MiB, 보기 전용), 레이어당 10분, 출력 10분/256MiB, 레이어 8개는 그대로입니다.

## 검사

- 새 테스트: 10분 테이크 믹스 준비 성공, 합계 512MiB 초과는 읽기 전에 거부.
- 기존 "합계 제한" 테스트는 64MiB 실제 버퍼 대신 512MiB+1 크기만 가진 객체로 바꿨습니다(512MiB를 실제 할당하지 않기 위해). 처음에는 한도가 바뀌어 그 테스트가 실패하면서 64MiB 버퍼를 출력하다 테스트 프로세스가 메모리 부족으로 죽었습니다(앱 문제 아님).
- `pnpm verify:app` 통과(프론트 878·Rust 317), `cargo clippy --locked --all-targets --all-features -- -D warnings` 통과.

## 미확인·후속

- 실제 10분 녹음 여러 개로 믹스 준비·WAV 출력을 해 보는 확인과 그때의 메모리(최악 WebView·native 각각 약 1GB)는 재지 않았습니다 → `MANUAL-CHECKS.md` 28번.
