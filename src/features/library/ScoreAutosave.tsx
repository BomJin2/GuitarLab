import type { ScoreAutosaveController } from './useScoreAutosave';

export function ScoreAutosave({
  controller,
}: {
  controller: ScoreAutosaveController;
}) {
  if (!controller.available) return null;
  return (
    <section className="panel" aria-label="악보 자동 저장">
      <label>
        <input
          type="checkbox"
          checked={controller.enabled}
          disabled={controller.blocked}
          onChange={(event) => controller.setEnabled(event.target.checked)}
        />{' '}
        악보 자동 저장
      </label>
      <p>{controller.notice}</p>
      {controller.preferenceError && (
        <p role="alert">{controller.preferenceError}</p>
      )}
    </section>
  );
}
