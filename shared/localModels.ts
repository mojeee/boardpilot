// Offline models: the catalog the app can download, and which one suits a computer.
// The engine is llama.cpp (node-llama-cpp); the models are GGUF files from Hugging Face.
//
// Sizes are approximate (the download reports the real size). File names and sizes have to be
// checked against Hugging Face with `npm run check:models` on a computer with internet access.
// Qwen 3 model cards: https://huggingface.co/Qwen/Qwen3-4B-GGUF (and -8B, -14B): Q4_K_M quantization,
// 32k context, tool calling, thinking mode that can be switched off.

export type LocalTier = 'small' | 'medium' | 'large';

export interface LocalModelInfo {
  id: string;
  tier: LocalTier;
  /** For chips and lists, e.g. "Qwen 3 8B". */
  name: string;
  /** Hugging Face repository and file (the download URL is built from them). */
  repo: string;
  file: string;
  /** Approximate size of the file in bytes. */
  approxBytes: number;
  /** Memory (GB) the model needs while running: the file plus context and working space. */
  needGb: number;
  /** Tokens of context the app asks for (the engine may lower it when memory is short). */
  contextSize: number;
}

const GB = 1024 ** 3;

export const LOCAL_MODELS: readonly LocalModelInfo[] = [
  { id: 'qwen3-4b', tier: 'small', name: 'Qwen 3 4B', repo: 'Qwen/Qwen3-4B-GGUF', file: 'Qwen3-4B-Q4_K_M.gguf', approxBytes: Math.round(2.5 * GB), needGb: 4, contextSize: 8192 },
  { id: 'qwen3-8b', tier: 'medium', name: 'Qwen 3 8B', repo: 'Qwen/Qwen3-8B-GGUF', file: 'Qwen3-8B-Q4_K_M.gguf', approxBytes: Math.round(5.0 * GB), needGb: 7, contextSize: 8192 },
  { id: 'qwen3-14b', tier: 'large', name: 'Qwen 3 14B', repo: 'Qwen/Qwen3-14B-GGUF', file: 'Qwen3-14B-Q4_K_M.gguf', approxBytes: Math.round(9.0 * GB), needGb: 12, contextSize: 8192 },
];

export const DEFAULT_LOCAL_MODEL = 'qwen3-4b';

export const isLocalModelId = (x: unknown): x is string => typeof x === 'string' && LOCAL_MODELS.some((m) => m.id === x);
export const getLocalModel = (id: string): LocalModelInfo | undefined => LOCAL_MODELS.find((m) => m.id === id);

/** Where the file is downloaded from. `base` can point at a mirror (see BOARDPILOT_MODEL_BASE_URL). */
export const localModelUrl = (m: LocalModelInfo, base = 'https://huggingface.co'): string => `${base.replace(/\/+$/, '')}/${m.repo}/resolve/main/${m.file}`;

export type GpuKind = 'metal' | 'cuda' | 'vulkan' | null;

export interface HardwareInfo {
  platform: string;
  arch: string;
  /** Total memory, GB. */
  ramGb: number;
  /** Free space where models are stored, GB. */
  freeDiskGb: number;
  gpu: GpuKind;
  /** Video memory in GB for CUDA and Vulkan GPUs; 0 for Metal (Apple GPUs share the main memory) and no GPU. */
  vramGb: number;
}

/** How a model runs on this computer. */
export type LocalFit =
  /** Fits in GPU memory: fast. */
  | 'fast'
  /** Runs on the processor and is small enough to be comfortable. */
  | 'ok'
  /** Runs on the processor, but answers will take a while. */
  | 'slow'
  /** Not enough memory. */
  | 'no_memory'
  /** Not enough free disk space for the download. */
  | 'no_disk';

export interface LocalModelFit {
  model: LocalModelInfo;
  fit: LocalFit;
}

export interface LocalRecommendation {
  /** The model to offer first, or null when this computer cannot run any of them. */
  recommended: LocalModelInfo | null;
  fits: LocalModelFit[];
}

/** Memory a Metal GPU can use: Apple limits it to roughly two thirds of the unified memory. */
const METAL_SHARE = 0.66;
/** Share of the main memory a processor-only run can take without starving the system. */
const CPU_SHARE = 0.6;

const round1 = (x: number) => Math.round(x * 10) / 10;

export function fitLocalModel(m: LocalModelInfo, hw: HardwareInfo): LocalFit {
  const diskNeed = m.approxBytes / GB + 1;
  if (hw.freeDiskGb < diskNeed) return 'no_disk';
  const gpuBudget = hw.gpu === 'metal' ? hw.ramGb * METAL_SHARE : hw.gpu ? hw.vramGb : 0;
  if (gpuBudget >= m.needGb) return 'fast';
  if (hw.ramGb * CPU_SHARE >= m.needGb) {
    // On a processor only the small model is comfortable; bigger ones answer slowly.
    return m.tier === 'small' ? 'ok' : 'slow';
  }
  return 'no_memory';
}

/** The best model for a computer: the largest one that runs fast on the GPU, else the small one on
 *  the processor. A larger model on the processor is offered but never recommended (too slow). */
export function recommendLocalModel(hw: HardwareInfo): LocalRecommendation {
  const fits = LOCAL_MODELS.map((model) => ({ model, fit: fitLocalModel(model, hw) }));
  const fast = fits.filter((f) => f.fit === 'fast');
  const pick = fast.length ? fast[fast.length - 1] : fits.find((f) => f.fit === 'ok');
  return { recommended: pick?.model ?? null, fits };
}

/** Plain-language summary of a computer for the settings screen. */
export function describeHardware(hw: HardwareInfo): { memory: string; gpu: string; disk: string } {
  const memory = `${round1(hw.ramGb)} GB`;
  const gpu = hw.gpu === 'metal' ? 'Apple GPU (Metal)' : hw.gpu === 'cuda' ? `NVIDIA GPU (CUDA), ${round1(hw.vramGb)} GB` : hw.gpu === 'vulkan' ? `GPU (Vulkan), ${round1(hw.vramGb)} GB` : '';
  return { memory, gpu, disk: `${Math.floor(hw.freeDiskGb)} GB` };
}

export const formatBytes = (n: number): string => (n >= GB ? `${round1(n / GB)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`);

/** What the AI settings screen shows about offline models. */
export interface LocalModelStatus {
  id: string;
  tier: LocalTier;
  name: string;
  approxBytes: number;
  fit: LocalFit;
  installed: boolean;
  /** Bytes of an unfinished download (0 when none), so the button can say "Continue". */
  partialBytes: number;
}

export interface LocalAiStatus {
  hardware: HardwareInfo;
  /** False when the engine cannot start on this computer (then only the online providers work). */
  engineOk: boolean;
  engineError: string;
  recommendedId: string | null;
  /** The model in use (the one picked, or the largest installed). */
  selectedId: string;
  models: LocalModelStatus[];
  /** Id of the model being downloaded, or null. */
  downloading: string | null;
}

export interface LocalDownloadEvent {
  modelId: string;
  received: number;
  total: number;
  phase: 'downloading' | 'verifying';
}
