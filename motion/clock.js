// Virtual clock for the motion capture (issue #22). app/main/motion.ts injects this file into the
// page before any app script runs (DevTools protocol, only when BP_MOTION is set). Until
// bpClock.manual() is called it follows real time, so the demo sets itself up normally. From then
// on time only moves when the main process calls bpClock.advance(ms): timers, animation frames
// (three.js, React Three Fiber, the overlay camera) and CSS / Web Animations step exactly one
// video frame at a time. Every render gives the same frames, however slow the machine is.
// Plain browser JavaScript on purpose: it is injected as text.

(() => {
  if (window.bpClock) return;
  const real = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    now: performance.now.bind(performance),
  };
  const epoch = Date.now() - real.now();
  let manual = false;
  let frozen = 0;
  const now = () => (manual ? frozen : real.now());

  let seq = 0;
  /** id → { due, fn, args, every } */
  const timers = new Map();
  /** id → callback */
  const frames = new Map();

  let pumpTimer = null;
  let rafPending = false;

  function fire(id, t) {
    if (t.every) t.due += t.every;
    else timers.delete(id);
    try {
      if (typeof t.fn === 'function') t.fn(...t.args);
    } catch (e) {
      console.error(e);
    }
  }

  function earliest(limit) {
    let pick = null;
    for (const [id, t] of timers) if (t.due <= limit && (!pick || t.due < pick[1].due || (t.due === pick[1].due && id < pick[0]))) pick = [id, t];
    return pick;
  }

  // Real-time mode: a real timer wakes up for the earliest virtual one.
  function pump() {
    if (manual) return;
    if (pumpTimer !== null) real.clearTimeout(pumpTimer);
    pumpTimer = null;
    let next = Infinity;
    for (const t of timers.values()) next = Math.min(next, t.due);
    if (next === Infinity) return;
    pumpTimer = real.setTimeout(() => {
      pumpTimer = null;
      for (let p = earliest(now()); p && !manual; p = earliest(now())) fire(p[0], p[1]);
      pump();
    }, Math.max(0, next - now()));
  }

  function runFrames(t) {
    const list = [...frames.values()];
    frames.clear();
    for (const cb of list) {
      try {
        cb(t);
      } catch (e) {
        console.error(e);
      }
    }
  }

  function pumpFrames() {
    if (manual || rafPending) return;
    rafPending = true;
    real.raf(() => {
      rafPending = false;
      if (!manual) runFrames(now());
    });
  }

  const add = (fn, ms, args, repeat) => {
    const id = ++seq;
    // At least 1 ms, so a chain of zero-delay timers cannot stop the clock from moving.
    const delay = Math.max(1, Number(ms) || 0);
    timers.set(id, { due: now() + delay, fn, args, every: repeat ? delay : 0 });
    pump();
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => {
    timers.delete(id);
  };
  window.requestAnimationFrame = (cb) => {
    const id = ++seq;
    frames.set(id, cb);
    pumpFrames();
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };
  performance.now = () => now();
  Date.now = () => Math.round(epoch + now());

  // CSS animations, transitions and Web Animations: paused, then set to the virtual time.
  const born = new WeakMap();
  function syncAnimations() {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) {
        born.set(a, frozen - (Number(a.currentTime) || 0));
        a.pause();
      }
      a.currentTime = frozen - born.get(a);
    }
  }

  const realFrame = () =>
    new Promise((resolve) => {
      const guard = real.setTimeout(resolve, 10000);
      real.raf(() => real.raf(() => (real.clearTimeout(guard), resolve())));
    });

  window.bpClock = {
    now,
    /** Stop following real time; from now on only advance() moves the clock. */
    manual() {
      if (manual) return;
      frozen = real.now();
      manual = true;
      if (pumpTimer !== null) real.clearTimeout(pumpTimer);
      pumpTimer = null;
      syncAnimations();
    },
    /** Move the clock by one step: fire due timers in order, run one animation frame, wait for the paint. */
    async advance(ms) {
      const target = frozen + ms;
      for (let p = earliest(target); p; p = earliest(target)) {
        frozen = Math.max(frozen, p[1].due);
        fire(p[0], p[1]);
      }
      frozen = target;
      runFrames(frozen);
      syncAnimations();
      // Let React commit what the timers and frame callbacks changed, then let the page paint.
      await new Promise((r) => real.setTimeout(r, 0));
      syncAnimations();
      await realFrame();
      return frozen;
    },
  };
})();
