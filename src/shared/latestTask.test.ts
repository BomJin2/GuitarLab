import { describe, it, expect } from 'vitest';
import { LatestTask } from './latestTask';
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('대기 생성 전');
  };
  let reject: (error: unknown) => void = () => {
    throw new Error('대기 생성 전');
  };
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
describe('최신 파일 요청 계약', () => {
  it('늦은 fixture 완료가 이후 선택 파일을 덮어쓰지 않는다', async () => {
    const task = new LatestTask();
    const old = deferred<string>();
    const first = task.run(() => old.promise);
    const second = await task.run(async () => '사용자 파일');
    old.resolve('fixture');
    expect(second).toEqual({ status: 'ready', value: '사용자 파일' });
    expect(await first).toEqual({ status: 'canceled' });
  });
  it('취소는 AbortSignal을 전달하고 늦은 오류도 폐기한다', async () => {
    const task = new LatestTask();
    const wait = deferred<void>();
    let signal: AbortSignal | undefined;
    const result = task.run((s) => {
      signal = s;
      return wait.promise;
    });
    task.cancel();
    expect(signal?.aborted).toBe(true);
    wait.reject(new Error('이전 파일 오류'));
    expect(await result).toEqual({ status: 'canceled' });
  });
  it('현재 실패는 error로 반환하고 다음 요청은 성공한다', async () => {
    const task = new LatestTask();
    const failure = await task.run(async () => {
      throw new Error('실패');
    });
    expect(failure.status).toBe('error');
    expect(await task.run(async () => 1)).toEqual({
      status: 'ready',
      value: 1,
    });
  });
});
