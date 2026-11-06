import { expect, it, vi } from 'vitest';
import { aiRuntimeApi, aiRuntimeError, decodeAiRuntime } from './runtime';
import { runStorageJob } from '../library/projects';
vi.mock('../library/projects', () => ({ runStorageJob: vi.fn() }));
const fixture = () => ({
  schemaVersion: 1,
  pythonVersion: '3.10.8',
  models: [
    {
      id: 'basic-pitch',
      packageVersion: null,
      state: 'PACKAGE_MISSING',
      usable: false,
    },
    {
      id: 'audio-separator',
      packageVersion: '0.0.1',
      state: 'UNVERIFIED',
      usable: false,
    },
  ],
});
it('미설치/미검증만 표시하고 임의 경로 없이 제한된 작업을 요청한다', async () => {
  vi.mocked(runStorageJob).mockResolvedValue(fixture());
  const signal = new AbortController().signal;
  const result = await aiRuntimeApi.inspect(signal);
  expect(result.models.map((m) => m.usable)).toEqual([false, false]);
  expect(runStorageJob).toHaveBeenCalledWith(
    'inspect_ai_runtime',
    {},
    signal,
    expect.any(Function),
  );
});
it('사용 가능 위조·누락/중복 모델·다른 버전·경로/알 수 없는 필드를 거부한다', () => {
  const bad = fixture();
  bad.models[0] = {
    id: 'basic-pitch',
    packageVersion: null,
    state: 'PACKAGE_MISSING',
    usable: true,
  };
  const path = fixture();
  path.pythonVersion = 'C:/private';
  const duplicate = fixture();
  duplicate.models[1] = duplicate.models[0]!;
  for (const value of [
    bad,
    path,
    duplicate,
    { ...fixture(), schemaVersion: 2 },
    { ...fixture(), path: 'private' },
    { ...fixture(), models: [] },
  ])
    expect(() => decodeAiRuntime(value)).toThrow('AI_PROTOCOL_INVALID');
});
it('설치 실패 단계마다 다른 안내를 보여 주고 모르는 코드는 일반 안내로 둔다', () => {
  const message = (code: string) => aiRuntimeError(new Error(code));
  const steps = [
    'AI_SETUP_INSTALL_FAILED',
    'AI_SETUP_DEPENDENCY_FAILED',
    'AI_RUNTIME_COPY_FAILED',
    'AI_SETUP_PROCESS_FAILED',
  ].map(message);
  expect(new Set(steps).size).toBe(4);
  expect(message('AI_SETUP_INSTALL_FAILED')).toContain('패키지 설치');
  expect(message('AI_SETUP_DEPENDENCY_FAILED')).toContain('의존성 검사');
  expect(message('AI_RUNTIME_COPY_FAILED')).toContain('복사');
  expect(message('DEMO_UNKNOWN')).toBe(message('ANOTHER_UNKNOWN'));
});
