export type TaskResult<T> =
  | { status: 'ready'; value: T }
  | { status: 'canceled' }
  | { status: 'error'; error: unknown };
export class LatestTask {
  private current: AbortController | null = null;
  cancel() {
    this.current?.abort();
    this.current = null;
  }
  async run<T>(
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<TaskResult<T>> {
    this.cancel();
    const controller = new AbortController();
    this.current = controller;
    try {
      const value = await work(controller.signal);
      if (controller.signal.aborted || this.current !== controller)
        return { status: 'canceled' };
      return { status: 'ready', value };
    } catch (error) {
      if (controller.signal.aborted || this.current !== controller)
        return { status: 'canceled' };
      return { status: 'error', error };
    } finally {
      if (this.current === controller) this.current = null;
    }
  }
}
