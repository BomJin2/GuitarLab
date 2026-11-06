import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LicenseNotice } from './LicenseNotice';
import { MenuBar } from './MenuBar';
import deps from './thirdPartyLicenses.json';

afterEach(cleanup);

it('도움말 메뉴에서 열고, 자체 MIT 원문·동봉 파일·모델 패키지 라이선스를 보여 준다', () => {
  const onNotices = vi.fn();
  render(<MenuBar onNotices={onNotices} />);
  fireEvent.click(screen.getByRole('button', { name: '도움말' }));
  fireEvent.click(screen.getByRole('button', { name: '라이선스 · 고지' }));
  expect(onNotices).toHaveBeenCalledOnce();
  cleanup();

  const onClose = vi.fn();
  render(<LicenseNotice onClose={onClose} />);
  const panel = screen.getByRole('region', { name: '라이선스 · 고지' });
  expect(panel.textContent).toContain('MIT License');
  expect(panel.textContent).toContain('Permission is hereby granted');
  expect(panel.textContent).toContain('SIL Open Font License 1.1');
  expect(
    screen.getByText(/Basic Pitch\(AI 카피\) 0\.4\.0 · Python 패키지 42/),
  ).toBeTruthy();
  expect(
    screen.getByText(/Demucs 전체 기타\(분리\) 4\.1\.0 · Python 패키지 32/),
  ).toBeTruthy();
  // 연구용 가중치 안내는 Demucs에만 있습니다.
  expect(screen.getAllByText(/연구용으로 제공된 것입니다/)).toHaveLength(1);
  // 표 머리 4줄 + 모델 패키지 + 앱 의존성(npm·Rust)
  expect(screen.getAllByRole('row').length).toBe(
    4 + 42 + 32 + deps.npm.length + deps.cargo.length,
  );
  expect(screen.getByText(/화면\(npm\) 의존성 \d+개/)).toBeTruthy();
  const alphaTab = screen.getByText('@coderline/alphatab').closest('tr');
  expect(alphaTab?.textContent).toContain(
    'MPL-2.0 · 수정하지 않은 원본 · 소스는 npm의 같은 버전',
  );
  // Python 패키지는 PyPI를, 원문 전체가 든 긴 라이선스 값은 고지 대상에서 뺍니다.
  for (const cell of screen.getAllByText('certifi'))
    expect(cell.closest('tr')?.textContent).toContain(
      '소스는 PyPI의 같은 버전',
    );
  for (const cell of screen.getAllByText('numpy'))
    expect(cell.closest('tr')?.textContent).not.toContain('수정하지 않은 원본');
  expect(screen.queryByText('guitarlab')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '고지 닫기' }));
  expect(onClose).toHaveBeenCalledOnce();
});
