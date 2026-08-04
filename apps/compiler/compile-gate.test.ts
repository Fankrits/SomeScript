import { test, expect } from "bun:test";
import { createCompileGate } from "./compile-gate";

test("caps concurrency, queues slack, sheds past the queue, hands slots on", async () => {
  const gate = createCompileGate(2, 2); // 2 running, 2 queued max

  // Fill the two live slots.
  const r1 = await gate.acquire();
  const r2 = await gate.acquire();
  expect(r1).not.toBeNull();
  expect(r2).not.toBeNull();
  expect(gate.stats()).toEqual({ active: 2, queued: 0 });

  // Next two queue (pending until a slot frees). Executors push synchronously.
  let r3: (() => void) | null | undefined;
  let r4: (() => void) | null | undefined;
  const p3 = gate.acquire().then((r) => (r3 = r));
  const p4 = gate.acquire().then((r) => (r4 = r));
  expect(gate.stats()).toEqual({ active: 2, queued: 2 });

  // Queue full -> shed immediately.
  expect(await gate.acquire()).toBeNull();

  // Releasing one hands its slot straight to the head of the queue (r3),
  // so active stays capped at 2 rather than dipping.
  r1!();
  await p3;
  expect(r3).not.toBeNull();
  expect(gate.stats()).toEqual({ active: 2, queued: 1 });

  // Double-release is a no-op — it must not free an extra slot.
  r1!();
  expect(gate.stats()).toEqual({ active: 2, queued: 1 });

  // Drain: r2 hands off to r4, then the last two free real slots.
  r2!();
  await p4;
  expect(r4).not.toBeNull();
  expect(gate.stats()).toEqual({ active: 2, queued: 0 });
  r3!();
  r4!();
  expect(gate.stats()).toEqual({ active: 0, queued: 0 });
});
