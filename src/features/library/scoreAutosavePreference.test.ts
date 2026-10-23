import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  readScoreAutosavePreference,
  writeScoreAutosavePreference,
} from './scoreAutosavePreference';

const key = 'guitarlab.score-autosave.v1';
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
beforeEach(() => localStorage.removeItem(key));
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(key);
  localStorage.removeItem('다른 설정');
});

it('기본 꺼짐·프로젝트별 켜기/끄기를 다시 읽고 다른 설정을 유지한다', () => {
  expect(readScoreAutosavePreference(id(1))).toBe(false);
  localStorage.setItem('다른 설정', '유지');
  writeScoreAutosavePreference(id(1), true);
  writeScoreAutosavePreference(id(2), true);
  writeScoreAutosavePreference(id(1), true);
  expect(JSON.parse(localStorage.getItem(key) ?? '')).toEqual({
    schemaVersion: 1,
    projectIds: [id(2), id(1)],
  });
  writeScoreAutosavePreference(id(1), false);
  expect(readScoreAutosavePreference(id(1))).toBe(false);
  expect(readScoreAutosavePreference(id(2))).toBe(true);
  writeScoreAutosavePreference(id(2), false);
  expect(localStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem('다른 설정')).toBe('유지');
});

it('손상·다른 버전/필드·중복 키/UUID·한도를 거부하고 원문을 보존한다', () => {
  for (const raw of [
    '',
    '{',
    'null',
    '[]',
    JSON.stringify({ schemaVersion: 2, projectIds: [id(1)] }),
    JSON.stringify({ schemaVersion: 1, projectIds: [id(1)], extra: true }),
    JSON.stringify({ schemaVersion: 1, projectIds: [id(1), id(1)] }),
    JSON.stringify({ schemaVersion: 1, projectIds: ['../다른 경로'] }),
    JSON.stringify({ schemaVersion: 1, projectIds: [id(10).toUpperCase()] }),
    JSON.stringify({ schemaVersion: 1, projectIds: true }),
    JSON.stringify({
      schemaVersion: 1,
      projectIds: Array.from({ length: 129 }, (_, n) => id(n)),
    }),
    '{"schemaVersion":2,"schemaVersion":1,"projectIds":[]}',
    '{"schemaVersion":1,"projectIds":[],"projectI\\u0064s":[]}',
    ' '.repeat(8193),
  ]) {
    localStorage.setItem(key, raw);
    expect(() => readScoreAutosavePreference(id(1))).toThrow();
    expect(() => writeScoreAutosavePreference(id(1), true)).toThrow();
    expect(localStorage.getItem(key)).toBe(raw);
  }
});

it('128개 경계에서 기존 선택을 지우지 않으며 끄면 새 프로젝트를 선택할 수 있다', () => {
  const ids = Array.from({ length: 128 }, (_, n) => id(n));
  const raw = JSON.stringify({ schemaVersion: 1, projectIds: ids });
  localStorage.setItem(key, raw);
  expect(() => writeScoreAutosavePreference(id(129), true)).toThrow(
    'AUTOSAVE_PREFERENCE_LIMIT',
  );
  expect(localStorage.getItem(key)).toBe(raw);
  writeScoreAutosavePreference(id(0), false);
  writeScoreAutosavePreference(id(129), true);
  expect(readScoreAutosavePreference(id(129))).toBe(true);
  expect(readScoreAutosavePreference(id(127))).toBe(true);
});

it('잘못된 ID는 Storage 접근 전에 거부하고 접근 거절/쓰기 실패는 호출자에게 전달한다', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem');
  expect(() => readScoreAutosavePreference('다른 프로젝트')).toThrow();
  expect(() => writeScoreAutosavePreference('다른 프로젝트', true)).toThrow();
  expect(get).not.toHaveBeenCalled();
  get.mockImplementationOnce(() => {
    throw new DOMException('접근 거절', 'SecurityError');
  });
  expect(() => readScoreAutosavePreference(id(1))).toThrow();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('공간 부족', 'QuotaExceededError');
  });
  expect(() => writeScoreAutosavePreference(id(1), true)).toThrow();
  expect(localStorage.getItem(key)).toBeNull();
});
