import { scoreScales, type ScoreDisplaySettings } from './scoreDisplay';

export function ScoreDisplayControls({
  settings,
  onChange,
}: {
  settings: ScoreDisplaySettings;
  onChange: (settings: ScoreDisplaySettings) => void;
}) {
  return (
    <section className="toolbar" aria-label="악보 표시 설정">
      <button
        type="button"
        onClick={() =>
          onChange({
            ...settings,
            notation: settings.notation === 'tab' ? 'score' : 'tab',
          })
        }
      >
        {settings.notation === 'tab' ? '오선보 보기' : 'TAB 보기'}
      </button>
      <label>
        악보 배치
        <select
          aria-label="악보 배치"
          value={settings.layout}
          onChange={(event) => {
            const layout = event.target.value;
            if (layout === 'page' || layout === 'horizontal')
              onChange({ ...settings, layout });
          }}
        >
          <option value="page">세로 보기</option>
          <option value="horizontal">가로 보기</option>
        </select>
      </label>
      <label>
        악보 확대
        <select
          aria-label="악보 확대"
          value={settings.scale}
          onChange={(event) => {
            const scale = scoreScales.find(
              (value) => value === Number(event.target.value),
            );
            if (scale !== undefined) onChange({ ...settings, scale });
          }}
        >
          {scoreScales.map((scale) => (
            <option key={scale} value={scale}>
              {scale * 100}%
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
