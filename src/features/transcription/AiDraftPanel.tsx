import type { ScoreSession } from '../score/scoreSession';
import type { ProjectController } from '../library/useProjects';
import { ScoreViewport } from '../score/ScoreViewport';
import { reviewLabels } from './transcription';
import { useTranscription } from './useTranscription';
import { useState } from 'react';
import type { AiDraft } from './transcription';
import type { ScoreEditingController } from '../score/useScoreEditing';
import { useImportedStems } from '../performance/useImportedStems';
import { guitarRoleLabels } from '../../entities/guitarRoles';

export function AiDraftPanel({
  session,
  project,
  editor,
}: {
  session: ScoreSession | null;
  project?: Pick<ProjectController, 'details' | 'audioAssetId' | 'busy'>;
  editor?: ScoreEditingController;
}) {
  const projectId = project?.details?.project.id;
  const sources = useImportedStems(projectId, !!project?.busy);
  const [selection, setSelection] = useState<{
    projectId: string;
    id: string;
  } | null>(null);
  const selectedImported =
    selection?.projectId === projectId
      ? sources.items.find((item) => item.id === selection?.id)
      : undefined;
  const state = useTranscription(
    session,
    project ? { ...project, busy: project.busy || sources.busy } : undefined,
    selectedImported,
  );
  const [reviewed, setReviewed] = useState<AiDraft | null>(null);
  return (
    <section className="panel" aria-label="AI 카피 초안">
      <h2>로컬 WAV AI 카피 · 초안 미리보기</h2>
      <p>
        별도 승인 설치한 Basic Pitch 개발 모델로 선택한 입력을 분석합니다.
        원본의 혼합 악기나 분리 음원에 남은 다른 악기의 음도 포함될 수 있습니다.
        원본 악보와 채점 목표는 명시적으로 적용하기 전까지 유지합니다.
      </p>
      <label>
        AI 분석 입력
        <select
          aria-label="AI 분석 입력"
          value={state.source}
          disabled={state.busy}
          onChange={(event) => {
            const value = event.target.value;
            if (
              value === 'original' ||
              value === 'guitar' ||
              value === 'imported'
            )
              state.selectSource(value);
          }}
        >
          <option value="original">프로젝트 원본 WAV</option>
          <option value="guitar">저장된 최신 전체 기타</option>
          <option value="imported">사용자 제공 기타 WAV</option>
        </select>
      </label>
      {state.source === 'imported' && (
        <div>
          <button
            disabled={!sources.available || sources.busy || state.busy}
            onClick={() => void sources.refresh()}
          >
            사용자 기타 목록 읽기
          </button>
          <label>
            AI 카피할 사용자 기타
            <select
              aria-label="AI 카피할 사용자 기타"
              value={selectedImported?.id ?? ''}
              disabled={sources.busy || state.busy || !!project?.busy}
              onChange={(event) => {
                if (projectId)
                  setSelection({ projectId, id: event.target.value });
              }}
            >
              <option value="">파일 선택</option>
              {sources.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {guitarRoleLabels[item.role]} ·{' '}
                  {(item.durationMs / 1000).toFixed(2)}초
                </option>
              ))}
            </select>
          </label>
          <p>
            ‘연주’에서 이미 보존한 기타 파일만 읽습니다. 파일 자체의 0ms부터
            기존 수동 싱크로 분석하며 믹스 offset·음량은 적용하지 않습니다.
            원곡과 파일 시작이 다르면 먼저 싱크를 맞춰주세요. 역할은 사용자
            지정이며 AI 파트 분리가 아닙니다.
          </p>
          {sources.busy && (
            <p role="status">
              사용자 기타 목록 읽는 중{' '}
              <button onClick={sources.cancel}>목록 조회 취소</button>
            </p>
          )}
          {sources.error && <p role="alert">{sources.error}</p>}
          {sources.notice && <p role="status">{sources.notice}</p>}
        </div>
      )}
      {state.source === 'guitar' && (
        <p>
          이미 저장된 전체 기타만 사용하며 새로 분리하지 않습니다. 새 분리
          결과를 만들면 최신 입력도 달라집니다. 음표가 검출되지 않을 수
          있습니다.
        </p>
      )}
      <button
        disabled={!state.native || !state.available || state.busy}
        onClick={() => void state.analyze()}
      >
        {state.source === 'imported'
          ? '사용자 기타를 AI 카피'
          : state.source === 'guitar'
            ? '저장 전체 기타를 AI 카피'
            : '프로젝트 WAV를 AI 카피'}
      </button>
      <button
        disabled={!state.native || !state.available || state.busy}
        onClick={() => void state.restore()}
      >
        저장된 AI 초안 불러오기
      </button>
      {!state.available && (
        <p>
          프로젝트 음원과 악보를 먼저 불러오세요. 사용자 제공 입력은 목록에서
          파일도 선택하세요. 현재는60초/64MiB 이하 PCM16/float32 WAV만
          지원합니다.
        </p>
      )}
      {state.busy && (
        <p role="status">
          AI 입력·초안 작업 중 · 모델 실행 시 첫 시작은 시간이 걸릴 수 있습니다.{' '}
          <button onClick={state.cancel}>AI 분석 취소</button>
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {state.notice && <p role="status">{state.notice}</p>}
      {state.draft && (
        <>
          <p role="status">
            AI 초안 · {state.draft.notes.length}음 · Basic Pitch{' '}
            {state.draft.modelVersion} · 로컬 초안 보존됨
          </p>
          <p>
            {state.draft.importedStemId
              ? `입력: 사용자 제공 기타 · ${state.draft.importedStemId}`
              : state.draft.stemId
                ? `입력: 저장 전체 기타 · ${state.draft.stemId}`
                : '입력: 프로젝트 원본 WAV'}
          </p>
          <p>
            활성도는 모델의 평균 note activation이며 정답 확률이 아닙니다.
            운지는 권장 후보입니다. 원래 분석과 검토 사유는 별도로 보존됩니다.
            현재 선택 트랙에 적용하면 기존 음표를 교체합니다. 되돌리기가
            가능하며, 편집본을 영구 저장하려면 ‘프로젝트 저장’을 누르세요.
            음원·튜닝·싱크가 같은 최신 초안을 다시 불러올 수 있습니다.
          </p>
          {editor && (
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={reviewed === state.draft}
                  onChange={(e) =>
                    setReviewed(e.target.checked ? state.draft : null)
                  }
                />
                불확실한 AI 초안을 검토했고 선택 트랙의 음표 교체를
                확인했습니다.
              </label>
              <button
                disabled={
                  state.busy ||
                  !state.available ||
                  !state.preview.value ||
                  reviewed !== state.draft
                }
                onClick={() => {
                  if (state.preview.value && reviewed === state.draft)
                    editor.replace(state.preview.value.document);
                }}
              >
                선택 트랙에 초안 적용
              </button>
            </div>
          )}
          {state.preview.value && (
            <ScoreViewport
              score={state.preview.value.score}
              lookup={state.preview.value.playbackLookup}
              trackIndex={state.preview.value.trackIndex}
              tick={0}
            />
          )}
          {state.preview.error && <p>{state.preview.error}</p>}
          <table>
            <caption>분석 음표 · 최대100개 표시</caption>
            <thead>
              <tr>
                <th>원곡 시작 ms</th>
                <th>MIDI</th>
                <th>권장 운지</th>
                <th>활성도</th>
                <th>검토 사유</th>
              </tr>
            </thead>
            <tbody>
              {state.draft.notes.slice(0, 100).map((n, i) => (
                <tr key={i}>
                  <td>{n.onsetMs.toFixed(1)}</td>
                  <td>{n.pitchMidi}</td>
                  <td>
                    {n.fingering
                      ? `${n.fingering.stringIndex}번 줄 ${n.fingering.fret}프렛`
                      : '미정'}
                  </td>
                  <td>{n.confidence.toFixed(3)}</td>
                  <td>
                    {n.reviewReasons.map((r) => reviewLabels[r]).join(' · ') ||
                      '사용자 확인 필요'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
