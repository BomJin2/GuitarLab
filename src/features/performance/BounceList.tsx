import { useState } from 'react';
import type { MixDocument } from './mixing';
import type { ProjectMixController } from './useProjectMix';

// docs/12 "Bounce 삭제·관리 v1": 프로젝트의 Bounce를 믹스에 다시 넣거나 확인 후 영구 삭제합니다.
export function BounceList({
  controller: c,
  mix,
}: {
  controller: ProjectMixController;
  mix: MixDocument;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  if (c.bounces.length === 0) return null;
  return (
    <section aria-label="Bounce 목록">
      <strong>Bounce 목록({c.bounces.length}/20)</strong>
      {c.bounces.map((bounce) => {
        const take = c.takes.find((t) => t.id === bounce.takeId);
        const name = `Bounce · ${take?.name ?? bounce.takeId.slice(0, 8)}`;
        const inMix = mix.layers.some((l) => l.id === bounce.id);
        return (
          <div className="toolbar" key={bounce.id}>
            <span>
              {name} · AmpliTube {bounce.pluginVersion} ·{' '}
              {(bounce.durationMs / 1000).toFixed(1)}초 ·{' '}
              {new Date(bounce.createdAtMs).toLocaleString()}
              {inMix ? ' · 믹스에 있음' : ''}
            </span>
            <button
              disabled={c.busy || inMix || mix.layers.length >= 8}
              onClick={() => c.addBounceToMix(bounce.id)}
            >
              믹스에 넣기
            </button>
            {confirming === bounce.id ? (
              <>
                <small>
                  이 Bounce 파일을 지웁니다. 되돌릴 수 없습니다(원본 테이크는
                  그대로라 다시 Bounce할 수 있음).
                </small>
                <button
                  aria-label={`${name} 영구 삭제`}
                  onClick={() => {
                    setConfirming(null);
                    void c.deleteBounce(bounce.id);
                  }}
                >
                  영구 삭제
                </button>
                <button onClick={() => setConfirming(null)}>취소</button>
              </>
            ) : (
              <button
                aria-label={`${name} 삭제`}
                onClick={() => setConfirming(bounce.id)}
              >
                삭제
              </button>
            )}
          </div>
        );
      })}
      <small>
        저장된 믹스 설정이 쓰는 Bounce는 지울 수 없습니다. 믹스에서 빼고 설정을
        저장한 뒤 지우세요.
      </small>
    </section>
  );
}
