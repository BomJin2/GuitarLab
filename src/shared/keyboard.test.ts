import { expect, it } from 'vitest';
import { isTextEntryTarget } from './keyboard';

it('표준 입력과 커스텀 텍스트 입력·SVG 하위 요소를 구분한다', () => {
  for (const html of [
    '<input />',
    '<textarea></textarea>',
    '<select></select>',
    '<div role="textbox"><span></span></div>',
    '<div contenteditable><span></span></div>',
    '<div contenteditable="plaintext-only"><span></span></div>',
    '<div contenteditable="TRUE"><svg><path /></svg></div>',
    '<div contenteditable="true"><div contenteditable="invalid"><span></span></div></div>',
  ]) {
    const host = document.createElement('section');
    host.innerHTML = html;
    expect(
      isTextEntryTarget(host.querySelector('path,span,input,textarea,select')),
    ).toBe(true);
  }
  const host = document.createElement('section');
  host.innerHTML =
    '<div contenteditable="true"><div contenteditable="false"><span></span></div></div>';
  expect(isTextEntryTarget(host.querySelector('span'))).toBe(false);
  expect(isTextEntryTarget(document.createElement('button'))).toBe(false);
  expect(isTextEntryTarget(null)).toBe(false);
  expect(isTextEntryTarget(window)).toBe(false);
});
