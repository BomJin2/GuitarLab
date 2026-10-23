import { expect, it } from 'vitest';
import raw from '../../../fixtures/manual-score-v1.json?raw';
import { decodeScoreJson } from './scoreJson';
import { importLocalMedia } from './localMediaImport';
import {
  renderOriginalScore,
  renderStoredScore,
  toNormalizedMusicXml,
} from './normalizedNotation';
import { editNote } from './scoreEditing';
const bytes = (text: string) => new TextEncoder().encode(text);

it('자체 JSON의 ID·역할·싱크와 원본을 유지하며 편집·원본 비교·XML 재열기를 연결한다', async () => {
  const document = decodeScoreJson(bytes(raw));
  const imported = await importLocalMedia(
    'score',
    new File([raw], '직접 작성.JSON'),
    new AbortController().signal,
  );
  if (imported.kind !== 'score') throw new Error('JSON 악보 없음');
  expect(imported.session.document).toEqual(document);
  expect(Array.from(imported.session.originalBytes)).toEqual(
    Array.from(bytes(raw)),
  );
  expect(imported.session.savedRevision).toBeUndefined();
  expect(imported.session.originalAssetId).toBeUndefined();
  const edited = editNote(document, {
    kind: 'UPDATE',
    trackId: 'lead-json',
    noteId: 'lead-1',
    value: { startTick: 0, durationTicks: 960, stringIndex: 1, fret: 4 },
  });
  const current = renderStoredScore(edited, imported.session.originalBytes);
  const original = renderOriginalScore(imported.session.originalBytes);
  expect(
    current.score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]
      ?.fret,
  ).toBe(4);
  expect(
    original.score.tracks[0]?.staves[0]?.bars[0]?.voices[0]?.beats[0]?.notes[0]
      ?.fret,
  ).toBe(3);
  expect(edited.tracks[0]?.role).toBe('LEAD');
  expect(edited.syncAnchors).toEqual(document.syncAnchors);
  const xml = toNormalizedMusicXml(edited);
  const reopened = await importLocalMedia(
    'score',
    new File([xml], '왕복.musicxml'),
    new AbortController().signal,
  );
  if (reopened.kind !== 'score') throw new Error('XML 왕복 없음');
  expect(reopened.session.document.tracks[0]?.notes[0]?.pitchMidi).toBe(68);
  expect(imported.session.document.tracks[0]?.notes[0]?.fret).toBe(3);
});

it('버전·부가 필드·관계/중복 ID·제어문자/UTF-8/길이와 중복 키를 거부한다', () => {
  for (const invalid of [
    raw.replace('"schemaVersion": 1', '"schemaVersion": 2'),
    raw.replace('"NORMALIZED"', 'null'),
    raw.replace('"ppq": 960', '"ppq": 960, "sourcePath": "private/path"'),
    raw.replace('"role": "LEAD"', '"role": "LEAD", "extra": 1'),
    raw.replace('"fret": 3', '"fret": 3, "extra": 1'),
    raw.replace('"lead-2"', '"lead-1"'),
    raw.replace('"trackId": "lead-json"', '"trackId": "other"'),
    raw.replace('manual-json-fixture', '한'.repeat(60)),
    raw.replace('manual-json-fixture', 'bad\\u007f'),
    raw.replace('"bpm": 120', '"bpm": 120, "bpm": 120'),
    raw.replace('"ppq": 960', '"ppq": 960, "p\\u0070q": 960'),
    raw.replace('"schemaVersion": 1', '"schemaVersion": 2, "schemaVersion": 1'),
    '{"x":1}',
    '[]',
    'null',
    '{',
  ]) {
    expect(invalid).not.toBe(raw);
    expect(() => decodeScoreJson(bytes(invalid))).toThrow('SCORE_JSON_INVALID');
  }
  expect(() => decodeScoreJson(new Uint8Array([123, 255, 125]))).toThrow();
  expect(() => decodeScoreJson(new Uint8Array(8 * 1024 * 1024 + 1))).toThrow();
  expect(() => decodeScoreJson(bytes('\uFEFF' + raw))).toThrow();
  expect(decodeScoreJson(bytes(' '.repeat(70000) + raw))).toEqual(
    decodeScoreJson(bytes(raw)),
  );
  expect(
    decodeScoreJson(
      bytes(raw.replace('기타 {제목} [왕복]', '쉼표, 괄호{}[] \\"문자열\\"')),
    ).title,
  ).toContain('괄호{}[]');
});

it('읽기 취소·미지원 표기/화음은 정규화해 지우거나 기존 편집으로 적용하지 않는다', async () => {
  const canceled = new AbortController();
  canceled.abort();
  await expect(
    importLocalMedia('score', new File([raw], '자체.json'), canceled.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  for (const unsupported of [
    raw.replace('"attack": true', '"attack": false'),
    raw.replace('"fret": 3', '"fret": 3, "judgementSupport": "UNSUPPORTED"'),
    raw.replace('"startTick": 960', '"startTick": 0'),
    raw.replace('"measureIndex": 0', '"measureIndex": 99'),
  ])
    await expect(
      importLocalMedia(
        'score',
        new File([unsupported], '미지원.json'),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
});
