import type { AppError, Result } from '@shared/types';

/** Thrown inside the main process; converted to a Result before it reaches the UI. */
export class DriverError extends Error implements AppError {
  constructor(
    readonly code: string,
    readonly humanMessage: string,
    readonly hint: string,
  ) {
    super(humanMessage);
  }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof DriverError) return { code: e.code, humanMessage: e.humanMessage, hint: e.hint };
  const msg = e instanceof Error ? e.message : String(e);
  return {
    code: 'unexpected',
    humanMessage: `Something unexpected happened: ${msg}`,
    hint: 'Try again. If it keeps happening, unplug the board, plug it back in and reconnect.',
  };
}

export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () =>
        reject(
          new DriverError(
            'timeout',
            `${what} took too long (more than ${Math.round(ms / 1000)} s).`,
            'Check the USB cable and try again. If the board is stuck, press EN to restart it.',
          ),
        ),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function guard<T>(fn: () => Promise<T>, ms: number, what: string): Promise<Result<T>> {
  try {
    return { ok: true, value: await withTimeout(fn(), ms, what) };
  } catch (e) {
    return { ok: false, error: toAppError(e) };
  }
}
