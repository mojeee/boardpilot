// Everything the main process needs for the offline model in one place: the model files, the
// engine, and the status the AI settings screen shows.

import { join } from 'node:path';
import { recommendLocalModel, type LocalAiStatus } from '@shared/localModels';
import type { LocalDeps } from '../providers/local';
import { LlamaEngine, detectHardware, type LocalEngine } from './engine';
import { ModelStore } from './store';

type EngineWithGpu = LocalEngine & { gpu?: LlamaEngine['gpu'] };

export class LocalRuntime {
  readonly store: ModelStore;
  private hardwareCache: { at: number; value: LocalAiStatus['hardware']; ok: boolean; error: string } | null = null;

  constructor(
    dataDir: string,
    readonly engine: EngineWithGpu = new LlamaEngine(),
  ) {
    this.store = new ModelStore(join(dataDir, 'models'));
  }

  deps(): LocalDeps {
    return { engine: this.engine, pathOf: (id) => this.store.pathOf(id) };
  }

  installedIds(): string[] {
    return this.store.installed().map((i) => i.id);
  }

  /** The computer's memory, disk and GPU. The GPU probe loads the engine, so it is cached for a minute. */
  private async hardware() {
    if (this.hardwareCache && Date.now() - this.hardwareCache.at < 60_000) return this.hardwareCache;
    let ok = true;
    let error = '';
    const gpu = this.engine.gpu
      ? async () => {
          try {
            return await this.engine.gpu!();
          } catch (e) {
            ok = false;
            error = e instanceof Error ? e.message : String(e);
            throw e;
          }
        }
      : undefined;
    const value = await detectHardware(this.store.dir, gpu ? { gpu } : undefined);
    this.hardwareCache = { at: Date.now(), value, ok, error };
    return this.hardwareCache;
  }

  async status(selectedId: string): Promise<LocalAiStatus> {
    const hw = await this.hardware();
    const rec = recommendLocalModel(hw.value);
    const installed = new Set(this.installedIds());
    return {
      hardware: hw.value,
      engineOk: hw.ok,
      engineError: hw.error,
      recommendedId: rec.recommended?.id ?? null,
      selectedId,
      models: rec.fits.map(({ model, fit }) => ({
        id: model.id,
        tier: model.tier,
        name: model.name,
        approxBytes: model.approxBytes,
        fit,
        installed: installed.has(model.id),
        partialBytes: this.store.partialBytes(model.id),
      })),
      downloading: this.store.downloading,
    };
  }

  async dispose() {
    await this.engine.dispose();
  }
}
