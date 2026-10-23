import { it, expect } from 'vitest';
import { readBlob } from './readBlob';
it('실제 Blob 읽기와 FileReader 취소를 처리한다', async () => {
  const controller = new AbortController();
  const result = readBlob(new Blob(['abc']), controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  const bytes = await readBlob(new Blob(['abc']), new AbortController().signal);
  expect([...bytes]).toEqual([97, 98, 99]);
});
