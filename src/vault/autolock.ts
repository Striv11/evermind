/**
 * Idle auto-lock. Pure timer logic with injected scheduling so it can be tested without
 * real time. `touch()` is called on user activity and restarts the countdown; when the
 * countdown elapses `onLock` fires once and the timer stops until `start()` is called again.
 */
export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Allowed timeouts in minutes; 0 disables auto-lock. */
export const AUTOLOCK_CHOICES = [0, 1, 5, 15, 30, 60] as const;
export const DEFAULT_AUTOLOCK_MINUTES = 15;

export function parseAutolockMinutes(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_AUTOLOCK_MINUTES;
  const n = Number(raw);
  return (AUTOLOCK_CHOICES as readonly number[]).includes(n) ? n : DEFAULT_AUTOLOCK_MINUTES;
}

export class IdleLock {
  private handle: unknown = null;
  private running = false;

  constructor(
    private minutes: number,
    private readonly onLock: () => void,
    private readonly scheduler: Scheduler = realScheduler,
  ) {}

  get active(): boolean {
    return this.running && this.minutes > 0;
  }

  start(): void {
    this.running = true;
    this.arm();
  }

  stop(): void {
    this.running = false;
    this.disarm();
  }

  /** User activity: restart the countdown if running. */
  touch(): void {
    if (this.running) this.arm();
  }

  setMinutes(minutes: number): void {
    this.minutes = minutes;
    if (this.running) this.arm();
  }

  private disarm(): void {
    if (this.handle !== null) this.scheduler.clear(this.handle);
    this.handle = null;
  }

  private arm(): void {
    this.disarm();
    if (this.minutes <= 0) return;
    this.handle = this.scheduler.set(() => {
      this.handle = null;
      this.running = false;
      this.onLock();
    }, this.minutes * 60_000);
  }
}
