import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCAL_MODEL, LOCAL_MODELS, formatBytes, getLocalModel, isLocalModelId, localModelUrl, recommendLocalModel, type HardwareInfo } from '@shared/localModels';

const hw = (over: Partial<HardwareInfo>): HardwareInfo => ({ platform: 'win32', arch: 'x64', ramGb: 16, freeDiskGb: 200, gpu: null, vramGb: 0, ...over });
const pick = (over: Partial<HardwareInfo>) => recommendLocalModel(hw(over)).recommended?.id ?? null;
const fitOf = (over: Partial<HardwareInfo>, id: string) => recommendLocalModel(hw(over)).fits.find((f) => f.model.id === id)?.fit;

describe('the offline model catalog', () => {
  it('has three sizes in order, with unique ids and files', () => {
    expect(LOCAL_MODELS.map((m) => m.tier)).toEqual(['small', 'medium', 'large']);
    expect(new Set(LOCAL_MODELS.map((m) => m.id)).size).toBe(3);
    expect(new Set(LOCAL_MODELS.map((m) => m.file)).size).toBe(3);
    for (const m of LOCAL_MODELS) {
      expect(m.file).toMatch(/\.gguf$/);
      expect(m.repo).toMatch(/^[\w-]+\/[\w.-]+$/);
      // Running needs more memory than the file itself.
      expect(m.needGb * 1024 ** 3).toBeGreaterThan(m.approxBytes);
    }
    const sizes = LOCAL_MODELS.map((m) => m.approxBytes);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it('knows its default and builds download URLs', () => {
    expect(isLocalModelId(DEFAULT_LOCAL_MODEL)).toBe(true);
    expect(isLocalModelId('gpt-6-sol')).toBe(false);
    const m = getLocalModel('qwen3-8b')!;
    expect(localModelUrl(m)).toBe('https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf');
    expect(localModelUrl(m, 'http://localhost:9000/')).toBe('http://localhost:9000/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf');
  });

  it('formats sizes for people', () => {
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 GB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB');
    expect(formatBytes(300 * 1024 ** 2)).toBe('300 MB');
  });
});

describe('which offline model suits a computer', () => {
  it('Mac with 8 GB: the small model on the Apple GPU', () => {
    expect(pick({ platform: 'darwin', arch: 'arm64', ramGb: 8, gpu: 'metal' })).toBe('qwen3-4b');
    expect(fitOf({ platform: 'darwin', arch: 'arm64', ramGb: 8, gpu: 'metal' }, 'qwen3-8b')).not.toBe('fast');
  });

  it('Mac with 16 GB: the medium model; 32 GB: the large one', () => {
    expect(pick({ platform: 'darwin', arch: 'arm64', ramGb: 16, gpu: 'metal' })).toBe('qwen3-8b');
    expect(pick({ platform: 'darwin', arch: 'arm64', ramGb: 32, gpu: 'metal' })).toBe('qwen3-14b');
  });

  it('Windows with a 12 GB NVIDIA card: the large model; 8 GB card: the medium one', () => {
    expect(pick({ ramGb: 16, gpu: 'cuda', vramGb: 12 })).toBe('qwen3-14b');
    expect(pick({ ramGb: 16, gpu: 'cuda', vramGb: 8 })).toBe('qwen3-8b');
    expect(pick({ ramGb: 16, gpu: 'vulkan', vramGb: 4 })).toBe('qwen3-4b');
  });

  it('a small graphics card falls back to the processor with the small model', () => {
    expect(pick({ ramGb: 16, gpu: 'cuda', vramGb: 2 })).toBe('qwen3-4b');
    expect(fitOf({ ramGb: 16, gpu: 'cuda', vramGb: 2 }, 'qwen3-4b')).toBe('ok');
  });

  it('processor only: recommends the small model, and offers bigger ones as slow', () => {
    expect(pick({ ramGb: 16 })).toBe('qwen3-4b');
    expect(fitOf({ ramGb: 16 }, 'qwen3-8b')).toBe('slow');
    expect(pick({ ramGb: 64 })).toBe('qwen3-4b');
    expect(fitOf({ ramGb: 64 }, 'qwen3-14b')).toBe('slow');
  });

  it('8 GB processor-only laptop can still run the small model', () => {
    expect(pick({ ramGb: 8 })).toBe('qwen3-4b');
  });

  it('too little memory: nothing is recommended and every size says why', () => {
    const r = recommendLocalModel(hw({ ramGb: 4 }));
    expect(r.recommended).toBeNull();
    expect(r.fits.every((f) => f.fit === 'no_memory')).toBe(true);
  });

  it('too little disk space: a model that would not fit on the disk is not recommended', () => {
    expect(fitOf({ ramGb: 16, freeDiskGb: 3 }, 'qwen3-4b')).toBe('no_disk');
    expect(pick({ ramGb: 16, freeDiskGb: 3 })).toBeNull();
    // Enough for the small one, not the large one.
    expect(fitOf({ platform: 'darwin', ramGb: 32, gpu: 'metal', freeDiskGb: 6 }, 'qwen3-14b')).toBe('no_disk');
    expect(pick({ platform: 'darwin', ramGb: 32, gpu: 'metal', freeDiskGb: 6 })).toBe('qwen3-8b');
  });
});
