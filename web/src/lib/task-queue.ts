/**
 * Global singleton task queue — inspired by FullCalendar's TaskRunner.
 *
 * Properties:
 * - Strictly serial: at most 1 task executes at a time.
 * - Bounded: max QUEUE_SIZE tasks; oldest dropped when full.
 * - Timeout: each task gets TASK_TIMEOUT_MS to complete.
 *
 * No key dedup — the app's debounce layers already prevent duplicate
 * submissions.  Dedup-by-key was swallowing unrelated writes that share
 * the same HTTP method+path (e.g. settings PATCH from debounce vs
 * auto-backup PATCH from the panel).
 */

const QUEUE_SIZE = 16;
const TASK_TIMEOUT_MS = 30_000;

interface QueuedTask<T = unknown> {
  fn: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

class TaskQueue {
  private queue: QueuedTask[] = [];
  private running = false;

  push<T>(fn: () => Promise<T>): Promise<T> {
    // Drop oldest if full
    while (this.queue.length >= QUEUE_SIZE) {
      const dropped = this.queue.shift()!;
      clearTimeout(dropped.timer);
      dropped.reject(new DOMException("Queue full", "AbortError"));
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.queue.findIndex((t) => t.resolve === resolve);
        if (i >= 0) {
          const t = this.queue[i];
          this.queue.splice(i, 1);
          t.reject(new DOMException("Task timed out", "TimeoutError"));
          this.drain();
        }
      }, TASK_TIMEOUT_MS);

      this.queue.push({ fn, resolve, reject, timer } as QueuedTask);
      this.drain();
    });
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift()!;
        clearTimeout(task.timer);
        try {
          const result = await task.fn();
          task.resolve(result);
        } catch (e) {
          task.reject(e);
        }
      }
    } finally {
      this.running = false;
      if (this.queue.length > 0) this.drain();
    }
  }
}

export const taskQueue = new TaskQueue();
