import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MixPanel } from './MixPanel';
import type { ProjectMixController } from './useProjectMix';
import { PlayerEngine } from '../player/PlayerEngine';
import { recordingFixture } from '../../test/recordingFixture';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('권한 확인 전 파일 출력을 막고 REC 중 소스/출력은 잠그되 청취 음량은 조절한다', () => {
  const take = recordingFixture();
  const preview = new PlayerEngine();
  const c: ProjectMixController = {
    mix: {
      schemaVersion: 1,
      projectId: take.projectId,
      masterGain: 0.5,
      layers: [
        {
          kind: 'TAKE',
          id: take.id,
          gain: 0.7,
          mute: false,
          solo: false,
          offsetMs: 0,
        },
      ],
    },
    takes: [take],
    stems: [],
    importedStems: [],
    refreshImported: vi.fn(),
    addImported: vi.fn(),
    configureStems: vi.fn(),
    canConfigureStems: true,
    busy: false,
    prepared: true,
    error: null,
    notice: null,
    job: null,
    stats: null,
    preview,
    refresh: vi.fn(),
    update: vi.fn(),
    prepare: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    exportWav: vi.fn(),
    save: vi.fn(),
    cancel: vi.fn(),
    referenceTakeIds: [take.id],
    needsPreparation: false,
  };
  const { rerender } = render(<MixPanel controller={c} locked={false} />);
  const exportButton = screen.getByRole('button', {
    name: '새 WAV로 내보내기',
  });
  fireEvent.click(exportButton);
  expect(c.exportWav).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox', { name: /사용 권한/ }));
  fireEvent.click(exportButton);
  expect(c.exportWav).toHaveBeenCalledTimes(1);
  rerender(<MixPanel controller={c} locked />);
  expect(exportButton.hasAttribute('disabled')).toBe(true);
  expect(
    screen
      .getByRole('button', { name: '레이어 제외' })
      .hasAttribute('disabled'),
  ).toBe(true);
  const volume = screen.getByRole('slider', { name: '레이어 1 음량' });
  expect(volume.hasAttribute('disabled')).toBe(false);
  fireEvent.change(volume, { target: { value: '20' } });
  expect(c.update).toHaveBeenCalledWith(
    expect.objectContaining({
      layers: [expect.objectContaining({ gain: 0.2 })],
    }),
  );
  if (!c.mix) throw new Error('테스트 믹스 누락');
  c.mix = {
    ...c.mix,
    layers: c.mix.layers.map((layer) => ({ ...layer, kind: 'STEM' })),
  };
  c.stems = [
    {
      id: take.id,
      role: 'ACCOMPANIMENT',
      sha256: 'a'.repeat(64),
      peak: 0.5,
      bytes: 60,
    },
  ];
  rerender(<MixPanel controller={c} locked={false} />);
  expect(screen.getByText(/잔여 반주 · AI 추정/)).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: '오버더빙 믹스 준비' })
      .hasAttribute('disabled'),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole('button', { name: '분리 2개만으로 출력 믹스 구성' }),
  );
  expect(c.configureStems).toHaveBeenCalledTimes(1);
  c.mix = {
    ...c.mix,
    layers: c.mix.layers.map((layer) => ({ ...layer, kind: 'IMPORTED_STEM' })),
  };
  rerender(<MixPanel controller={c} locked={false} />);
  expect(screen.getByText(/사용자 기타 파일은 믹스 준비 후/)).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: '오버더빙 믹스 준비' })
      .hasAttribute('disabled'),
  ).toBe(false);
  expect(
    screen
      .getByRole('button', { name: '출력 믹스 만들기' })
      .hasAttribute('disabled'),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole('button', { name: '믹스용 사용자 기타 목록 읽기' }),
  );
  expect(c.refreshImported).toHaveBeenCalledTimes(1);
  preview.dispose();
});
