---
name: review-loop
description: 커밋하지 않은 변경 전체를 Codex CLI로 리뷰받고, Claude가 지적을 검증·수정한 뒤 Codex 재리뷰(최대 3라운드)를 거쳐 승인되면 commit·push 한다. 사용자가 "리뷰하고 통과하면 커밋, 푸쉬 해줘"처럼 요청하거나 /review-loop 를 입력했을 때만 사용한다. 작업이 끝났다고 자동으로 실행하지 않는다.
---

## 실행 조건

**사용자가 요청할 때만 실행한다**(2026-11-03 사용자 지시: 리뷰·커밋·push 모두 자동 금지).

- "리뷰하고 통과하면 커밋, 푸쉬 해줘" → 1~5단계 전체.
- 리뷰만 요청 → 1~3단계까지만 하고 승인 지문 경로를 보고한다.
- GUI 확인이 필요한 작업이면 요청을 받았을 때 GUI 확인이 남았음을 먼저 알린다.
- Codex 사용량 한도·인증 오류가 나면 멈추고 보고한다(우회 금지).

# Codex 교차 리뷰 루프

구현이 끝난 **커밋하지 않은 변경 전체**(staged·unstaged·untracked)를 Codex가 읽기 전용으로 리뷰하고,
Claude가 지적을 검증·수정하는 과정을 **최대 3라운드** 반복한다. 사용자가 커밋까지 요청한 경우에만 승인 뒤 커밋·push한다.
`$ARGUMENTS`가 있으면 이번 변경의 의도/범위 설명으로 리뷰 프롬프트에 포함한다.

## 0. 사전 점검

1. `git status --porcelain`으로 변경이 있는지 확인한다. 없으면 "리뷰할 변경 없음"으로 종료한다.
2. 변경 파일 목록을 사용자에게 보여 준다. 이번 작업과 무관해 보이는 변경(이전 세션의 미커밋 문서 등)이 섞여 있으면
   **진행 전에 포함 여부를 묻는다** — 커밋 범위를 임의로 넓히지 않는다.
3. 실행 폴더를 만든다: `.claude/review-runs/<YYYYMMDD-HHMMSS>/` (git 제외 폴더).
4. 변경 영역에 맞는 로컬 검사를 먼저 실행한다. 실패하면 리뷰 전에 고친다.
   - `src/`(React/TS): `pnpm typecheck`, `pnpm lint`, 관련 `pnpm test -- <경로>`; 넓은 변경이면 `pnpm test` 전체.
   - `src-tauri/`(Rust): `cargo fmt --check`, `cargo clippy --locked -- -D warnings`, `cargo test --locked` (`--manifest-path src-tauri/Cargo.toml`).
   - `ai/`(Python): `ai/` 의 pytest (`ai/AGENTS.md`의 가상환경 규칙을 따름).
   - 프론트·Rust를 함께 바꿨으면 `pnpm verify:app`.
   - 문서만 바꿨으면 `pnpm format:check`만 실행하고 그 사실을 기록한다.
   - 실행하지 못한 검사는 **미실행**과 이유를 응답·커밋 본문에 남긴다.

## 1. Codex 리뷰 실행 (라운드 N)

`round-N-prompt.md`를 UTF-8로 작성한다. 내용:

- 역할: "GuitarLab 저장소의 시니어 리뷰어. 코드를 수정하지 말고 리뷰만 한다."
- 대상: `git status --porcelain`, `git diff HEAD`, untracked 파일 내용을 직접 확인해 **커밋하지 않은 변경 전체**를 리뷰.
- 기준: 루트 `AGENTS.md`, 변경 파일이 속한 하위 `src-tauri/AGENTS.md`·`ai/AGENTS.md`, 관련 `docs/` 규칙, 정확성 버그, 오류 은폐, 실시간 오디오 콜백 규칙, 계약(`docs/12`) 불일치,
  검증되지 않은 완료 주장, 보안/데이터 손실 위험. 스타일 취향은 `minor` 이하로만.
- 심각도: `critical`(데이터 손실·보안·크래시), `major`(잘못된 동작·계약 위반·테스트 누락으로 인한 회귀 위험), `minor`(그 외).
- 판정: 미해결 `critical`/`major`가 없으면 `APPROVE`, 있으면 `CHANGES_REQUESTED`.
- 출력 언어: 한국어. `line`을 특정할 수 없으면 0.
- 라운드 2 이상이면 **이전 라운드 지적 목록과 Claude의 응답(수정 내용 또는 거절 근거)** 을 그대로 붙이고,
  각 이전 id에 대해 `previous_responses`에 `FIX_VERIFIED` / `REJECTION_ACCEPTED` / `STILL_OPEN`을 답하게 한다.
  새 지적은 이전과 다른 id(`R<N>-<번호>`)를 쓰게 한다.

실행 (Bash 도구 — stdin 리다이렉트는 UTF-8 바이트를 그대로 전달하므로 PowerShell 파이프 대신 사용):

```bash
codex exec --sandbox read-only --ephemeral \
  -c model_reasoning_effort='"high"' \
  --output-schema .claude/skills/review-loop/review.schema.json \
  -o .claude/review-runs/<run>/round-N.json \
  - < .claude/review-runs/<run>/round-N-prompt.md \
  > .claude/review-runs/<run>/round-N.log 2>&1
```

- 추론 강도는 사용자가 2026-11-03에 지정한 **`high`** 로 고정한다. `~/.codex/config.toml`(데스크톱 앱과 공유)의
  기본값은 바꾸지 않고 이 실행에만 `-c`로 덮어쓴다. 모델은 공유 설정의 기본 모델을 따른다.
  실행 후 `round-N.log`의 `reasoning effort:` 줄이 `high`인지 확인한다.
- `high`는 오래 걸릴 수 있으므로 Bash 도구의 `run_in_background`로 실행하고 완료 알림을 기다린다.
- 오류 처리:
  - **인증 오류·사용량 한도·모델 미지원**(`model_not_found`) → 재시도하지 않고 **즉시 루프를 멈추고 보고**한다.
  - **일시적 오류**(네트워크·5xx 등)나 **JSON 출력 누락/파싱 실패** → 1회 재시도하고, 다시 실패하면 멈추고 보고한다.
- 정체 처리: 시작 후 30분이 지나도 완료 알림이 없으면 `round-N.log`를 확인한다. 진행 흔적이 없으면
  해당 백그라운드 작업을 중지(TaskStop)하고 멈춘 사실과 로그 마지막 부분을 보고한다. 자동 재실행하지 않는다.
- 결과 JSON을 읽어 사용자에게 라운드 요약(판정, 심각도별 개수)을 짧게 보여 준다.

## 2. Claude 검증 및 수정

각 finding마다 **실제 코드를 직접 읽어** 판단한다. Codex 지적을 그대로 믿지 않는다.

- 타당함 → 최소 수정 + 관련 테스트 실행. 응답: `ACCEPTED: <수정 내용, 실행한 검사와 결과>`
- 오탐/범위 밖 → 수정하지 않음. 응답: `REJECTED: <코드 근거(file:line), 이유>`
- `minor`는 타당하고 수정이 작을 때만 고친다. 아니면 `DEFERRED: <이유>`로 남긴다.

응답 목록을 `round-N-response.md`에 저장한다. 수정 후 0단계 4번의 로컬 검사를 다시 실행한다.

## 3. 반복 / 종료 조건

- 매 라운드 Codex 실행 **직전에** 리뷰 대상 내용의 지문을 저장한다. 지문은 staging 여부와 무관하게
  범위 파일의 경로와 작업 트리 내용(삭제 포함)만으로 만든다. 범위 경로는 **Bash 배열**로 보관하고
  NUL로 구분해 공백·한글·glob 문자가 든 경로도 분할·확장되지 않게 한다:

  ```bash
  S=("CLAUDE.md" "docs/my plan.md")   # 승인 범위 경로, 하나씩 따옴표로
  fp(){ printf '%s\0' "${S[@]}" | sort -zu | while IFS= read -r -d '' f; do
    if [ -e "$f" ]; then printf '%s\t%s\n' "$f" "$(git hash-object -- "$f")"
    else printf '%s\tDELETED\n' "$f"; fi; done | sha256sum; }
  fp > round-N.fingerprint
  ```

  이 저장소는 Windows에서 `core.fileMode=false`이므로 파일 모드는 지문에 넣지 않는다.
  2026-11-03에 공백·한글·`*` 경로를 포함한 임시 저장소에서 `git add` 전·후 지문이 같고,
  내용 수정 시 달라지는 것을 확인했다. Bash 도구 호출마다 셸 상태가 초기화되므로 `S`와 `fp`는 매 호출마다 다시 정의한다.

- `APPROVE` + 로컬 검사 통과 + **현재 지문이 승인받은 라운드의 지문과 동일** → 사용자가 커밋을 요청했으면 4단계(커밋), 리뷰만 요청했으면 승인 지문 경로를 보고하고 종료.
- `APPROVE` 이후 minor 수정 등으로 범위 파일 내용이 바뀌면 그 승인은 무효다. N < 3이면 다음 라운드로 재리뷰하고,
  라운드가 남지 않았으면 승인 후 수정분을 되돌리지 말고 **커밋을 중단**해 사용자에게 보고한다.
  (불필요한 재리뷰를 피하려면 APPROVE 뒤의 minor는 기본적으로 `DEFERRED`로 남긴다.)
- `CHANGES_REQUESTED`이고 N < 3 → N+1 라운드로 1단계 반복.
- **3라운드 후에도 `CHANGES_REQUESTED`** → 커밋하지 않는다. 남은 `STILL_OPEN` 지적과 양측 근거를 정리해 사용자 판단을 요청하고 멈춘다.
- 동일 지적에 Claude가 2회 연속 `REJECTED`, Codex가 2회 연속 `STILL_OPEN`이면 라운드가 남아 있어도 사용자 판단으로 넘긴다.

## 4. 커밋

1. 커밋 전 `git status`로 리뷰받은 파일 범위와 일치하는지 확인한다. 리뷰 이후 새로 추가된 무관한 변경이 있으면 제외한다.
2. 프로젝트 규칙(AGENTS.md)의 문서화가 필요한 작업이면 `docs/progress/` 갱신이 포함되었는지 확인한다.
   문서 갱신을 새로 했다면 그것도 리뷰 대상이므로 1단계를 한 번 더 거친다(라운드 상한 내).
3. `git add` **전에** `git diff --cached --name-only`를 확인한다. 승인 범위 밖 파일이 이미 staged 되어 있으면
   사용자 변경을 임의로 unstage 하지 말고 **커밋을 중단**해 보고한다.
4. 승인 범위 파일만 이름으로 지정해 `git add` 한다 (`git add -A`/`git add .` 금지 — 비밀 파일·대용량 산출물 방지).
5. `git add` 후 `git diff --cached --name-only`가 승인 범위와 정확히 같은지, 3단계의 지문이 여전히 같은지 다시 확인한다.
   다르면 커밋하지 않는다.
6. 커밋 메시지는 기존 저장소 스타일을 따른다. 첫 줄은 한국어 한 줄 요약, 빈 줄 뒤 본문에
   `Codex 리뷰 N라운드 승인, 수용 X건/거절 Y건/보류 Z건`과 시스템이 지정한 attribution 줄을 넣는다.

## 5. Push

사용자가 커밋을 요청하면 커밋 후 push까지 한다(2026-11-03 허가). 요청 없이 push하지 않는다.

1. `git status -sb`로 현재 브랜치에 upstream이 있는지 확인한다(현재 `main` → `origin/main`). upstream이 없으면 push하지 않고 보고한다.
2. `git push`만 실행한다. **`--force`/`--force-with-lease`, 다른 브랜치·태그 push 금지.**
3. non-fast-forward 등으로 거부되면 rebase/merge/force로 해결하지 않는다. 멈추고 원인과 함께 사용자에게 보고한다.
4. push 성공 시 GitHub Actions(`verify.yml`)가 실행되므로 Actions 페이지 링크
   `https://github.com/BomJin2/GuitarLab/actions`를 보고에 포함한다. 원격 검사 결과는 확인 전까지 **진행 중/미확인**으로 기록한다.

## 6. 최종 보고

채팅에는 짧게: 라운드 수, 수용/거절/보류 건수, 실행한 검사와 결과, 커밋 해시와 push 결과(또는 하지 않은 이유).
