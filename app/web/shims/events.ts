// node:events for the browser demo: the small part of EventEmitter the hardware hub uses.

type Listener = (...args: never[]) => void;

export class EventEmitter<_Events = unknown> {
  private listeners = new Map<string | symbol, Listener[]>();

  on(name: string | symbol, fn: Listener): this {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
    return this;
  }
  addListener(name: string | symbol, fn: Listener): this {
    return this.on(name, fn);
  }
  once(name: string | symbol, fn: Listener): this {
    const wrap = ((...args: never[]) => {
      this.off(name, wrap);
      fn(...args);
    }) as Listener;
    return this.on(name, wrap);
  }
  off(name: string | symbol, fn: Listener): this {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((x) => x !== fn));
    return this;
  }
  removeListener(name: string | symbol, fn: Listener): this {
    return this.off(name, fn);
  }
  removeAllListeners(name?: string | symbol): this {
    if (name === undefined) this.listeners.clear();
    else this.listeners.delete(name);
    return this;
  }
  emit(name: string | symbol, ...args: unknown[]): boolean {
    const list = this.listeners.get(name) ?? [];
    for (const fn of list) (fn as (...a: unknown[]) => void)(...args);
    return list.length > 0;
  }
  listenerCount(name: string | symbol): number {
    return this.listeners.get(name)?.length ?? 0;
  }
}

export default EventEmitter;
