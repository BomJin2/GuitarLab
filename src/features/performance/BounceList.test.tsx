import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { recordingFixture } from '../../test/recordingFixture';
import { BounceList } from './BounceList';
import type { MixDocument } from './mixing';
import type { ProjectMixController } from './useProjectMix';
import type { TakeRender } from './freeze';

afterEach(cleanup);
const take = recordingFixture();
const bounce = (id: string): TakeRender => ({
  schemaVersion: 1,
  id,
  projectId: take.projectId,
  takeId: take.id,
  kind: 'BOUNCE',
  sampleRate: 48000,
  channels: 2,
  frames: 48000,
  durationMs: 1000,
  bytes: 384044,
  sha256: 'a'.repeat(64),
  takeSha256: 'b'.repeat(64),
  pluginClassId: '56535441746235616D706C6974756265',
  pluginVersion: '5.10.4',
  latencyFrames: 7,
  tailFrames: 0,
  createdAtMs: 1,
});
const inMix = '00000000-0000-4000-8000-000000000091';
const loose = '00000000-0000-4000-8000-000000000092';
const mix: MixDocument = {
  schemaVersion: 1,
  projectId: take.projectId,
  masterGain: 0.7,
  layers: [
    {
      kind: 'RENDER',
      id: inMix,
      gain: 0.7,
      mute: false,
      solo: false,
      offsetMs: 0,
    },
  ],
};
it('Bounce 목록에서 믹스에 다시 넣고, 같은 자리 확인 뒤에만 영구 삭제한다(docs/12 Bounce 삭제·관리 v1)', () => {
  const c = {
    bounces: [bounce(inMix), bounce(loose)],
    takes: [take],
    addBounceToMix: vi.fn(),
    deleteBounce: vi.fn(),
  } as unknown as ProjectMixController;
  render(<BounceList controller={c} mix={mix} />);
  expect(screen.getByText('Bounce 목록(2/20)')).toBeTruthy();
  const add = screen.getAllByRole('button', { name: '믹스에 넣기' });
  // 이미 믹스에 있는 줄은 넣기 버튼이 꺼져 있습니다.
  expect(add.map((b) => (b as HTMLButtonElement).disabled)).toEqual([
    true,
    false,
  ]);
  fireEvent.click(add[1]!);
  expect(c.addBounceToMix).toHaveBeenCalledWith(loose);
  const name = `Bounce · ${take.name}`;
  fireEvent.click(screen.getAllByRole('button', { name: `${name} 삭제` })[1]!);
  expect(screen.getByText(/되돌릴 수 없습니다/)).toBeTruthy();
  expect(c.deleteBounce).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.queryByText(/되돌릴 수 없습니다/)).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: `${name} 삭제` })[1]!);
  fireEvent.click(screen.getByRole('button', { name: `${name} 영구 삭제` }));
  expect(c.deleteBounce).toHaveBeenCalledWith(loose);
});
it('Bounce가 없으면 목록을 그리지 않는다', () => {
  const c = {
    bounces: [],
    takes: [],
  } as unknown as ProjectMixController;
  const { container } = render(<BounceList controller={c} mix={mix} />);
  expect(container.textContent).toBe('');
});
it('준비·작업 중에는 믹스에 넣기를 끈다(리뷰 R5-2)', () => {
  const c = {
    bounces: [bounce(loose)],
    takes: [take],
    busy: true,
    addBounceToMix: vi.fn(),
    deleteBounce: vi.fn(),
  } as unknown as ProjectMixController;
  render(<BounceList controller={c} mix={mix} />);
  expect(
    (screen.getByRole('button', { name: '믹스에 넣기' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
