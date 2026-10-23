import { expect, it, vi } from 'vitest';
import { exporter, importer } from '@coderline/alphatab';
import { unzipSync, zipSync, Zip, ZipDeflate } from 'fflate';
import { prepareScoreArchive, scoreArchiveErrorMessage } from './scoreArchive';
import { importScore, normalizeScore } from './alphaTabAdapter';
import { importLocalMedia } from './localMediaImport';
import { scoreEditingFixture } from '../../test/scoreEditingFixture';
import { bcfsFixture, bcfzFixture } from '../../test/gpxFixture';

it('압축 MusicXML도 컨테이너와 음표·박자·템포를 유지해 기존 파서로 전달한다', () => {
  const initial = scoreEditingFixture();
  const container = new TextEncoder().encode(
    '<container><rootfiles><rootfile full-path="score.musicxml"/></rootfiles></container>',
  );
  const archived = zipSync({
    'META-INF/container.xml': container,
    'score.musicxml': initial.originalBytes,
  });
  const restored = normalizeScore(importScore(archived));
  const notes = (document: typeof restored) =>
    document.tracks.map((track) =>
      track.notes.map((note) => [
        note.startTick,
        note.durationTicks,
        note.pitchMidi,
        note.stringIndex,
        note.fret,
      ]),
    );
  expect(notes(restored)).toEqual(notes(initial.document));
  expect(restored.timeSignatures).toEqual(initial.document.timeSignatures);
  expect(restored.tempoMap).toEqual(initial.document.tempoMap);
});

function gpx(size: number) {
  const bytes = new Uint8Array(8);
  bytes.set([66, 67, 70, 90]);
  new DataView(bytes.buffer).setUint32(4, size, true);
  return bytes;
}

it('GPX 예상 크기를 파서 호출 전에 검사하고 원본 subarray 오프셋을 존중한다', () => {
  const loader = vi.spyOn(importer.ScoreLoader, 'loadScoreFromBytes');
  try {
    for (const size of [32 * 1024 * 1024 + 1, 0xffff_ffff])
      expect(() => importScore(gpx(size))).toThrow('SCORE_ARCHIVE_LIMIT');
    expect(() => importScore(gpx(3))).toThrow('SCORE_ARCHIVE_INVALID');
    expect(() => importScore(gpx(4).subarray(0, 7))).toThrow(
      'SCORE_ARCHIVE_INVALID',
    );
    expect(loader).not.toHaveBeenCalled();
    const parent = new Uint8Array(16);
    parent.set(gpx(32 * 1024 * 1024 + 1), 4);
    const view = parent.subarray(4, 12);
    expect(() => prepareScoreArchive(view)).toThrow('SCORE_ARCHIVE_LIMIT');
    const raw = new TextEncoder().encode('<score-partwise/>');
    expect(prepareScoreArchive(raw)).toBe(raw);
  } finally {
    loader.mockRestore();
  }
});

it('자체 BCFS/BCFZ는 upstream GPX 읽기와 음표·시각·튜닝/스타일이 같고 원본을 유지한다', () => {
  const own = new exporter.Gp7Exporter().export(scoreEditingFixture().score);
  const files = Object.fromEntries(
    Object.entries(unzipSync(own))
      .filter(([name]) => !name.endsWith('/'))
      .map(([name, data]) => [name.split('/').at(-1)!, data]),
  );
  const raw = bcfsFixture(files);
  const key = (score: ReturnType<typeof importScore>) => ({
    notes: normalizeScore(score).tracks.map((track) =>
      track.notes.map((n) => [
        n.startTick,
        n.durationTicks,
        n.pitchMidi,
        n.stringIndex,
        n.fret,
      ]),
    ),
    tuning: score.tracks.map((track) =>
      track.staves.map((staff) => staff.tuning),
    ),
    stylesheet: score.stylesheet,
  });
  for (const source of [raw, bcfzFixture(raw)]) {
    const before = Array.from(source);
    const expected = importer.ScoreLoader.loadScoreFromBytes(source);
    expect(key(importScore(source))).toEqual(key(expected));
    expect(Array.from(source)).toEqual(before);
    const parent = new Uint8Array(source.length + 7);
    parent.set(source, 3);
    expect(key(importScore(parent.subarray(3, 3 + source.length)))).toEqual(
      key(expected),
    );
  }
});

it('GPX 내부 파일 크기·sector 범위·역행/불완전 스트림도 과다 할당 없이 거부한다', () => {
  const raw = bcfsFixture({
    'score.gpif': new TextEncoder().encode('자체 자료'),
  });
  const oversized = raw.slice();
  new DataView(oversized.buffer).setUint32(4 + 4096 + 140, 0x7fff_ffff, true);
  expect(() => prepareScoreArchive(oversized)).toThrow('SCORE_ARCHIVE_LIMIT');
  const outside = raw.slice();
  new DataView(outside.buffer).setUint32(4 + 4096 + 148, 0xffff_ffff, true);
  expect(() => prepareScoreArchive(outside)).toThrow('SCORE_ARCHIVE_INVALID');
  const missing = raw.slice();
  new DataView(missing.buffer).setUint32(4 + 4096 + 148, 0, true);
  expect(() => prepareScoreArchive(missing)).toThrow('SCORE_ARCHIVE_INVALID');
  const backwards = bcfsFixture({
    first: new Uint8Array(4096),
    'score.gpif': new Uint8Array([1]),
  });
  new DataView(backwards.buffer).setUint32(4 + 3 * 4096 + 148, 1, true);
  expect(() => prepareScoreArchive(backwards)).toThrow('SCORE_ARCHIVE_INVALID');
  expect(() => prepareScoreArchive(bcfzFixture(raw).subarray(0, 12))).toThrow(
    'SCORE_ARCHIVE_INVALID',
  );
  const badCopy = new Uint8Array([...gpx(4), 128]);
  expect(() => prepareScoreArchive(badCopy)).toThrow('SCORE_ARCHIVE_INVALID');
});

it('자체 GP7의 stored/deflate를 실제 가져오고 음표·시간과 원본 압축 바이트를 보존한다', async () => {
  const initial = scoreEditingFixture();
  const own = new exporter.Gp7Exporter().export(initial.score);
  const contents = unzipSync(own);
  for (const level of [0, 6] as const) {
    const source = zipSync(contents, { level });
    const before = Array.from(source);
    const prepared = prepareScoreArchive(source);
    const restored = unzipSync(prepared);
    expect(Object.keys(restored).sort()).toEqual(Object.keys(contents).sort());
    for (const name of Object.keys(contents))
      expect(Array.from(restored[name]!)).toEqual(Array.from(contents[name]!));
    const result = await importLocalMedia(
      'score',
      new File([source], '자체.gp'),
      new AbortController().signal,
    );
    if (result.kind !== 'score') throw new Error('악보 세션 필요');
    expect(
      result.session.document.tracks[0]?.notes.map((n) => [
        n.startTick,
        n.pitchMidi,
        n.fret,
      ]),
    ).toEqual(
      initial.document.tracks[0]?.notes.map((n) => [
        n.startTick,
        n.pitchMidi,
        n.fret,
      ]),
    );
    expect(Array.from(result.session.originalBytes)).toEqual(before);
    expect(Array.from(source)).toEqual(before);
  }
});

it('data descriptor 스트림도 끝까지 해제하고 항목512개까지 허용한다', () => {
  const parts: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    parts.push(chunk);
  });
  const file = new ZipDeflate('자체.txt');
  zip.add(file);
  file.push(new Uint8Array([1, 2, 3]), true);
  zip.end();
  const stream = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    stream.set(part, offset);
    offset += part.length;
  }
  expect(
    Array.from(unzipSync(prepareScoreArchive(stream))['자체.txt']!),
  ).toEqual([1, 2, 3]);
  const entries = Object.fromEntries(
    Array.from({ length: 512 }, (_, i) => [`${i}.txt`, new Uint8Array()]),
  );
  expect(
    Object.keys(unzipSync(prepareScoreArchive(zipSync(entries, { level: 0 })))),
  ).toHaveLength(512);
  entries['초과.txt'] = new Uint8Array();
  expect(() => prepareScoreArchive(zipSync(entries, { level: 0 }))).toThrow(
    'SCORE_ARCHIVE_LIMIT',
  );
});

it('헤더가 해제량을 작게 속여도 실제32MiB 초과에서 중단하며 파서로 넘기지 않는다', () => {
  const archive = zipSync({ '과다.txt': new Uint8Array(32 * 1024 * 1024 + 1) });
  expect(archive.length).toBeLessThan(8 * 1024 * 1024);
  new DataView(archive.buffer).setUint32(22, 1, true);
  const loader = vi.spyOn(importer.ScoreLoader, 'loadScoreFromBytes');
  try {
    expect(() => importScore(archive)).toThrow('SCORE_ARCHIVE_LIMIT');
    expect(loader).not.toHaveBeenCalled();
  } finally {
    loader.mockRestore();
  }
});

it('선언 과다·중복 항목·미지원 압축·잘린 파일은 기존 파싱 전에 거부한다', () => {
  const own = zipSync({ '자체.txt': new Uint8Array([1, 2, 3]) });
  const large = own.slice();
  new DataView(large.buffer).setUint32(22, 32 * 1024 * 1024 + 1, true);
  expect(() => prepareScoreArchive(large)).toThrow('SCORE_ARCHIVE_LIMIT');
  const unknown = own.slice();
  new DataView(unknown.buffer).setUint16(8, 12, true);
  expect(() => prepareScoreArchive(unknown)).toThrow('SCORE_ARCHIVE_INVALID');
  const duplicate = new Uint8Array(own.length * 2);
  duplicate.set(own);
  duplicate.set(own, own.length);
  expect(() => prepareScoreArchive(duplicate)).toThrow('SCORE_ARCHIVE_INVALID');
  expect(() => prepareScoreArchive(own.subarray(0, 35))).toThrow(
    'SCORE_ARCHIVE_INVALID',
  );
  expect(scoreArchiveErrorMessage(new Error('SCORE_ARCHIVE_LIMIT'))).toContain(
    '32MiB',
  );
  expect(
    scoreArchiveErrorMessage(new Error('SCORE_ARCHIVE_INVALID')),
  ).toContain('기존 악보');
  expect(scoreArchiveErrorMessage(new Error('개인 경로'))).toBeNull();
});
