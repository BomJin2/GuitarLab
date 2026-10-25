import { expect, it } from 'vitest';
import { scoreCapacityFixture } from '../../test/scoreCapacityFixture';
import { normalizeScore } from './alphaTabAdapter';
import {
  renderNormalized,
  toNormalizedMusicXml,
  validateEditable,
} from './normalizedNotation';
it.each([1, 128])(
  '%i트랙·256마디·전체2000음은 크기 제한 안에서 실제 렌더 왕복한다',
  (tracks) => {
    const started = performance.now();
    const document = scoreCapacityFixture(tracks);
    const before = JSON.stringify(document);
    const xml = toNormalizedMusicXml(document);
    const xmlBytes = new TextEncoder().encode(xml).length;
    expect(xmlBytes).toBeLessThanOrEqual(8 * 1024 * 1024);
    const serialized = performance.now();
    const rendered = renderNormalized(document);
    const restored = normalizeScore(rendered.score, rendered.playbackLookup);
    expect(rendered.playbackLookup.masterBars).toHaveLength(256);
    expect(restored.tracks).toHaveLength(tracks);
    expect(
      restored.tracks.reduce((count, track) => count + track.notes.length, 0),
    ).toBe(2000);
    expect(JSON.stringify(document)).toBe(before);
    console.info('SCORE_CAPACITY', {
      tracks,
      bars: 256,
      notes: 2000,
      xmlBytes,
      preparationAndSerializationMs: serialized - started,
      parseAndRoundTripMs: performance.now() - serialized,
    });
  },
  20000,
);

it('257마디·2001음은 렌더 전에 거부하고 허용 문서를 유지한다', () => {
  const document = scoreCapacityFixture(1);
  const track = document.tracks[0];
  const last = track?.notes.at(-1);
  if (!track || !last) throw new Error('자체 음표가 필요합니다.');
  const before = JSON.stringify(document);
  expect(() =>
    validateEditable({
      ...document,
      timeSignatures: [
        ...document.timeSignatures,
        { tick: 256 * 3840, numerator: 4, denominator: 4 },
      ],
    }),
  ).toThrow('256마디/전체2,000음');
  expect(() =>
    validateEditable({
      ...document,
      tracks: [
        {
          ...track,
          notes: [
            ...track.notes,
            { ...last, id: 'excess', startTick: 960000, measureIndex: 250 },
          ],
        },
      ],
    }),
  ).toThrow('256마디/전체2,000음');
  expect(JSON.stringify(document)).toBe(before);
});

it('큰 박자·다중 트랙의 MusicXML 생성은 기존8MiB 예산을 초과하면 명시적으로 거부한다', () => {
  const document = scoreCapacityFixture(128, 32, 1);
  const before = JSON.stringify(document);
  expect(() => toNormalizedMusicXml(document)).toThrow('SCORE_XML_LIMIT');
  expect(JSON.stringify(document)).toBe(before);
}, 20000);
