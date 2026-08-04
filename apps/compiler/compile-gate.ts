// Bounded concurrency gate for CPU-heavy work (Tectonic compiles). Caps how many
// run at once, allows a little queue slack, then sheds (acquire() -> null) so the
// caller can answer 503 instead of letting an unbounded spawn storm OOM the box —
// turns the cliff into a queue.
//
// In-process: correct for the single replica this compiler runs on. Scaled out,
// the cap becomes per-replica (still safe); a global limit would need Redis.
export function createCompileGate(maxConcurrent: number, maxQueued: number) {
  let active = 0;
  const waiters: Array<(release: () => void) => void> = [];

  function makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return; // idempotent: safe to call from more than one finally
      released = true;
      const next = waiters.shift();
      if (next) next(makeRelease()); // hand the slot straight to the next waiter
      else active--; // no one waiting: free the slot
    };
  }

  // Resolves to a release fn, or null when the queue is already too deep.
  function acquire(): Promise<(() => void) | null> {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve(makeRelease());
    }
    if (waiters.length >= maxQueued) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  }

  return { acquire, stats: () => ({ active, queued: waiters.length }) };
}
