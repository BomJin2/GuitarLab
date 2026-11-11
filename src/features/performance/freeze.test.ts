import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { decodeTakeRender, freezeApi, freezeMessage } from './freeze';
import { emptyMonitorPlugin } from '../practice/monitorPlugin';
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: () => true,
}));
afterEach(() => vi.clearAllMocks());

const projectId = '11111111-1111-4111-8111-111111111111';
const takeId = '22222222-2222-4222-8222-222222222222';
const render = {
  schemaVersion: 1,
  id: '33333333-3333-4333-8333-333333333333',
  projectId,
  takeId,
  kind: 'FREEZE',
  sampleRate: 48000,
  channels: 2,
  frames: 48000,
  durationMs: 1000,
  bytes: 44 + 48000 * 8,
  sha256: 'a'.repeat(64),
  takeSha256: 'b'.repeat(64),
  pluginClassId: '56535441746235616D706C6974756265',
  pluginVersion: '5.10.4',
  latencyFrames: 7,
  tailFrames: 4800,
  createdAtMs: 1,
};
it('Freeze 메타데이터 v1을 검사한다(크기는 stereo float32와 맞아야 함)', () => {
  expect(decodeTakeRender(render, projectId).tailFrames).toBe(4800);
  for (const bad of [
    { projectId: 'other' },
    { channels: 1 },
    { bytes: 100 },
    { kind: 'MIX' },
    { pluginClassId: 'x' },
    { frames: 0 },
    // Rust 검사와 같은 한도(2026-11-08 대조)
    { id: 'not-uuid' },
    { sampleRate: 4000, durationMs: 12000 },
    { durationMs: 999 },
    { pluginVersion: '' },
    { pluginVersion: 'v\u0007' },
    { tailFrames: 48000 * 12 },
    {
      frames: 40_000_000,
      bytes: 44 + 40_000_000 * 8,
      sampleRate: 192000,
      durationMs: (40_000_000 * 1000) / 192000,
    },
  ])
    expect(() => decodeTakeRender({ ...render, ...bad }, projectId)).toThrow(
      'FREEZE_CONTRACT_INVALID',
    );
});
it('목록·Unfreeze·톤 불러오기는 v1 요청이고 오류 코드는 원본 보존 문구로 바꾼다', async () => {
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    projectId,
    freezes: [render],
  });
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    projectId,
    takeId,
    removed: true,
  });
  vi.mocked(invoke).mockResolvedValueOnce(emptyMonitorPlugin);
  expect(await freezeApi.list(projectId)).toHaveLength(1);
  expect(await freezeApi.unfreeze(projectId, takeId)).toBe(true);
  await freezeApi.restoreTone(projectId, takeId);
  vi.mocked(invoke).mockResolvedValueOnce({
    schemaVersion: 1,
    projectId,
    renderId: render.id,
    removed: true,
  });
  expect(await freezeApi.deleteBounce(projectId, render.id)).toBe(true);
  const take = { request: { schemaVersion: 1, projectId, takeId } };
  expect(vi.mocked(invoke).mock.calls).toEqual([
    ['list_take_freezes', { request: { schemaVersion: 1, projectId } }],
    ['unfreeze_take', take],
    ['restore_take_freeze_tone', take],
    [
      'delete_take_bounce',
      { request: { schemaVersion: 1, projectId, renderId: render.id } },
    ],
  ]);
  expect(freezeMessage({ code: 'PLUGIN_IN_USE' })).toContain('모니터를 끈 뒤');
  expect(freezeMessage({ code: 'EXPORT_DESTINATION_EXISTS' })).toContain(
    '덮어쓰지 않습니다',
  );
  expect(freezeMessage({ code: 'RENDER_FAILED' })).toContain(
    '원본 DI는 그대로',
  );
  expect(freezeMessage(new Error('???'))).toContain('원본 DI는 그대로');
});
