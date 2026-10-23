import { expect, it, vi } from 'vitest';
import xml from '../../../public/fixtures/standard.musicxml?raw';
import { importLocalMedia } from './localMediaImport';
import * as blobReader from '../../shared/readBlob';
import { importer } from '@coderline/alphatab';

it('읽기 완료 직전에 취소되면 반환된 바이트를 파서에 넘기지 않는다', async () => {
  const controller = new AbortController();
  const read = vi
    .spyOn(blobReader, 'readBlob')
    .mockImplementationOnce(async () => {
      controller.abort();
      return new TextEncoder().encode(xml);
    });
  const loader = vi.spyOn(importer.ScoreLoader, 'loadScoreFromBytes');
  try {
    await expect(
      importLocalMedia(
        'score',
        new File([xml], '자체.musicxml'),
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(loader).not.toHaveBeenCalled();
  } finally {
    read.mockRestore();
    loader.mockRestore();
  }
});

it('실제 악보를 정규화하되 저장 원본이나 프로젝트 연결을 만들지 않는다', async () => {
  const result = await importLocalMedia(
    'score',
    new File([xml], '자체.musicxml'),
    new AbortController().signal,
  );
  expect(result.kind).toBe('score');
  if (result.kind !== 'score') throw new Error('악보 결과 필요');
  expect(result.session.document.tracks[0]?.notes.length).toBeGreaterThan(0);
  expect(new TextDecoder().decode(result.session.originalBytes)).toBe(xml);
  expect(result.session.activeTrackIndex).toBe(0);
  expect(result.session.originalAssetId).toBeUndefined();
  expect(result.session.savedRevision).toBeUndefined();
});
it('확장자·빈 파일·용량 초과는 내용을 읽기 전에 거부한다', async () => {
  const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer');
  for (const [kind, name, limit] of [
    ['score', '자체.musicxml', 8],
    ['score', '자체.json', 8],
    ['audio', '자체.wav', 256],
  ] as const) {
    const large = new File(['fixture'], name);
    Object.defineProperty(large, 'size', { value: limit * 1024 * 1024 + 1 });
    for (const file of [
      new File(['fixture'], '다른.txt'),
      new File([], name),
      large,
    ])
      await expect(
        importLocalMedia(kind, file, new AbortController().signal),
      ).rejects.toThrow();
  }
  expect(read).not.toHaveBeenCalled();
});
it('음원 헤더와 읽기 취소를 검사하고 잘못된 악보·음원은 반환하지 않는다', async () => {
  const signal = new AbortController().signal;
  for (const [header, name] of [
    ['RIFF....WAVE', '자체.wav'],
    ['ID3fixture', '자체.mp3'],
  ] as const) {
    const file = new File([header], name);
    expect(await importLocalMedia('audio', file, signal)).toEqual({
      kind: 'audio',
      file,
    });
  }
  await expect(
    importLocalMedia('audio', new File(['broken'], '자체.wav'), signal),
  ).rejects.toThrow('invalid-audio');
  await expect(
    importLocalMedia('score', new File(['broken'], '자체.musicxml'), signal),
  ).rejects.toThrow();
  const canceled = new AbortController();
  canceled.abort();
  await expect(
    importLocalMedia(
      'score',
      new File([xml], '자체.musicxml'),
      canceled.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
