import { pitchReading } from '../../shared/pitch';

export type TunerReading = {
  note: string;
  frequencyHz: number;
  cents: number;
  confidence: number;
  direction: 'LOW' | 'CENTER' | 'HIGH';
};
export function tunerReading(
  pitchMidi: number | null,
  confidence: number | null,
): TunerReading | null {
  if (
    pitchMidi === null ||
    confidence === null ||
    !Number.isFinite(pitchMidi) ||
    !Number.isFinite(confidence) ||
    pitchMidi < 0 ||
    pitchMidi > 127 ||
    confidence < 0.85 ||
    confidence > 1
  )
    return null;
  const reading = pitchReading(pitchMidi);
  if (!reading) return null;
  const cents = reading.cents;
  return {
    ...reading,
    confidence,
    direction: Math.abs(cents) <= 5 ? 'CENTER' : cents < 0 ? 'LOW' : 'HIGH',
  };
}
