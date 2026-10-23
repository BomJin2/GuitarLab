const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function pitchReading(pitchMidi: number) {
  if (!Number.isFinite(pitchMidi) || pitchMidi < 0 || pitchMidi > 127)
    return null;
  const midi = Math.round(pitchMidi);
  return {
    note: `${names[midi % 12]}${Math.floor(midi / 12) - 1}`,
    frequencyHz: 440 * 2 ** ((pitchMidi - 69) / 12),
    cents: (pitchMidi - midi) * 100,
  };
}
