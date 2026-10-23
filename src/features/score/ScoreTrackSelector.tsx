import type { GuitarPartRole } from '../../entities/score';
import { guitarRoleLabels, isGuitarPartRole } from '../../entities/guitarRoles';
import type { ScoreSession } from './scoreSession';
import { getActiveTrackIndex, scoreTrackEntries } from './trackSelection';

export function ScoreTrackSelector({
  session,
  onSelect,
  onRole,
}: {
  session: ScoreSession;
  onSelect: (id: string) => void;
  onRole: (id: string, role: GuitarPartRole) => void;
}) {
  const entries = scoreTrackEntries(session);
  const current = entries[getActiveTrackIndex(session)];
  if (!current) return null;
  const guitars = entries.filter((entry) => entry.instrument === 'GUITAR');
  const others = entries.filter((entry) => entry.instrument !== 'GUITAR');
  return (
    <section aria-label="연주 악보 트랙">
      <div className="toolbar">
        <label>
          악보 트랙
          <select
            aria-label="악보 트랙"
            value={current.track.id}
            onChange={(event) => onSelect(event.target.value)}
          >
            {guitars.length > 0 && (
              <optgroup label="기타 악보">
                {guitars.map(({ track }) => (
                  <option key={track.id} value={track.id}>
                    {track.name} · {guitarRoleLabels[track.role ?? 'UNKNOWN']}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="그 외 악보">
                {others.map(({ track }) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          기타 역할
          <select
            aria-label="기타 악보 역할"
            value={current.track.role ?? 'UNKNOWN'}
            disabled={current.instrument !== 'GUITAR'}
            onChange={(event) => {
              if (isGuitarPartRole(event.target.value))
                onRole(current.track.id, event.target.value);
            }}
          >
            {Object.entries(guitarRoleLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span>
          기타 악보 {guitars.length}개 · 현재 {current.track.name}
        </span>
      </div>
      <p>
        역할은 사용자 지정 태그입니다. 악보 트랙과 개별 기타 오디오 stem은
        별도로 관리합니다.
      </p>
    </section>
  );
}
