// One stem-splitting job at a time (Demucs uses every CPU core). Asking again for a song moves it
// to the front, so whatever is on the decks right now is always split first.

export type StemStatus = 'none' | 'queued' | 'working' | 'ready' | 'error';

export interface StemState {
  status: StemStatus;
  /** 0..100 */
  progress: number;
  error?: string;
}

export type StemWorker = (id: string, onProgress: (pct: number) => void) => Promise<void>;

export class StemQueue {
  private jobs = new Map<string, StemState>();
  private waiting: string[] = [];
  private busy = false;

  constructor(
    private worker: StemWorker,
    private isDone: (id: string) => boolean,
    /** Songs allowed to wait; the oldest request is dropped when it overflows. */
    private maxWaiting = 10,
  ) {}

  request(id: string): StemState {
    const cur = this.status(id);
    if (cur.status === 'ready' || cur.status === 'working') return cur;
    this.waiting = [id, ...this.waiting.filter((x) => x !== id)];
    for (const dropped of this.waiting.splice(this.maxWaiting)) this.jobs.delete(dropped);
    this.jobs.set(id, { status: 'queued', progress: 0 });
    void this.pump();
    return this.status(id);
  }

  status(id: string): StemState {
    if (this.isDone(id)) return { status: 'ready', progress: 100 };
    return this.jobs.get(id) ?? { status: 'none', progress: 0 };
  }

  get queued(): readonly string[] {
    return this.waiting;
  }

  private async pump() {
    if (this.busy) return;
    const id = this.waiting.shift();
    if (!id) return;
    this.busy = true;
    const job: StemState = { status: 'working', progress: 0 };
    this.jobs.set(id, job);
    try {
      await this.worker(id, (pct) => (job.progress = Math.max(job.progress, pct)));
      this.jobs.set(id, { status: 'ready', progress: 100 });
    } catch (e) {
      this.jobs.set(id, { status: 'error', progress: 0, error: (e as Error).message });
    } finally {
      this.busy = false;
      void this.pump();
    }
  }
}
