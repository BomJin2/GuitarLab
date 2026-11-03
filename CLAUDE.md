# CLAUDE.md — Claude Code 전용 추가 규칙

공통 규칙은 `AGENTS.md`(루트 및 `src-tauri/`, `ai/` 하위)를 따른다. 이 파일은 Claude Code에만 적용되는 작업 흐름을 정의한다.

## 작업 전 구조 파악

작업 착수 전에 대상 영역의 폴더 구조, 해당 하위 `AGENTS.md`, `package.json` scripts와 `.github/workflows/`의 검사 기준을 먼저 확인하고 계획에 반영한다.

## Codex 교차 리뷰 루프 (자동)

코드/문서 변경 작업을 마치고 로컬 검사가 통과하면 `.claude/skills/review-loop` 스킬을 **사용자 입력 없이** 실행한다.

- 범위: 커밋하지 않은 변경 전체. Codex는 읽기 전용 리뷰만 하며 최대 3라운드.
- 승인 시 commit 후 `git push`(force 금지, 거부되면 멈추고 보고).
- 질문 답변만 한 턴, 구현 도중, 사용자 GUI 확인 답변 대기 중에는 실행하지 않는다.
- GUI 확인이 필요한 작업은 리뷰까지만 하고 commit·push는 GUI 확인 답변 뒤에 한다.
- 이번 작업과 무관한 미커밋 변경이 섞여 있으면 포함 여부를 먼저 묻는다.
- Codex 사용량 한도·인증·모델 오류 시 멈추고 보고한다.

세부 절차는 `.claude/skills/review-loop/SKILL.md`를 따른다.
