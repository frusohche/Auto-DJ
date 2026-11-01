import { describe, expect, it } from 'vitest';
import { StemQueue } from './stemQueue.ts';
import { validVideoId } from './audio.ts';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('validVideoId', () => {
  it('accepts YouTube ids and rejects anything else', () => {
    expect(validVideoId('dQw4w9WgXcQ')).toBe(true);
    expect(validVideoId('a-b_c123456')).toBe(true);
    expect(validVideoId('short')).toBe(false);
    expect(validVideoId('../../etc/pa')).toBe(false);
    expect(validVideoId('dQw4w9WgXcQ; rm -rf')).toBe(false);
  });
});

describe('StemQueue', () => {
  it('runs one job at a time and moves re-requested songs to the front', async () => {
    const jobs = new Map<string, ReturnType<typeof deferred>>();
    const started: string[] = [];
    const done = new Set<string>();
    const q = new StemQueue(
      async (id) => {
        started.push(id);
        const d = deferred();
        jobs.set(id, d);
        await d.promise;
        done.add(id);
      },
      (id) => done.has(id),
    );

    expect(q.request('a').status).toBe('working');
    expect(q.request('b').status).toBe('queued');
    q.request('c');
    expect(q.queued).toEqual(['c', 'b']);
    q.request('b');
    expect(q.queued).toEqual(['b', 'c']);
    expect(started).toEqual(['a']);

    jobs.get('a')!.resolve();
    await flush();
    expect(q.status('a').status).toBe('ready');
    expect(started).toEqual(['a', 'b']);
    expect(q.status('b').status).toBe('working');
  });

  it('drops the oldest waiting song when too many pile up', () => {
    const q = new StemQueue(() => new Promise(() => {}), () => false, 2);
    q.request('a'); // working
    q.request('b');
    q.request('c');
    q.request('d');
    expect(q.queued).toEqual(['d', 'c']);
    expect(q.status('b').status).toBe('none');
  });

  it('reports failures and lets the song be retried', async () => {
    let fail = true;
    const q = new StemQueue(
      async () => {
        if (fail) throw new Error('boom');
      },
      () => false,
    );
    q.request('x');
    await flush();
    expect(q.status('x')).toMatchObject({ status: 'error', error: 'boom' });
    fail = false;
    expect(q.request('x').status).toBe('working');
  });
});
