import type { NoteEvent } from '../../entities/score';
export function Fretboard({
  note,
  demo = false,
}: {
  note?: NoteEvent;
  demo?: boolean;
}) {
  const target = demo ? { stringIndex: 1, fret: 3, pitchMidi: 67 } : note;
  return (
    <section className="fretboard">
      <h2>악보 목표 운지{demo ? ' · DEMO' : ''}</h2>
      <p>
        오디오만으로 실제 줄·프렛을 확정할 수 없습니다.{' '}
        {target && !target.stringIndex
          ? '운지 미정'
          : !target
            ? '다음 음을 준비하세요'
            : ''}
      </p>
      <div className="fret-scroll">
        <div className="frets">
          {Array.from({ length: 25 }, (_, i) => (
            <span key={i}>{i}</span>
          ))}
        </div>
        {['e', 'B', 'G', 'D', 'A', 'E'].map((string, index) => (
          <div className="fret-string" key={string}>
            {Array.from({ length: 25 }, (_, fret) => (
              <span
                key={fret}
                className={
                  target?.stringIndex === index + 1 && target.fret === fret
                    ? 'target-fret'
                    : ''
                }
              >
                {target?.stringIndex === index + 1 && target.fret === fret
                  ? `● ${target.pitchMidi}`
                  : fret === 0
                    ? string
                    : '─'}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
