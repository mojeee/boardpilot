# Offline model

BoardPilot can answer questions with a small AI model that runs on your own computer. It needs no
API key and no internet after the download, and nothing you ask leaves the computer.

## What it is

- **Engine:** llama.cpp, through the `node-llama-cpp` package, inside the app. Nothing else to install.
- **Models:** three sizes of Qwen 3 (`shared/localModels.ts`), from Hugging Face, Q4_K_M files:

  | Size | Model | Download | Runs well with |
  |---|---|---|---|
  | Small | Qwen 3 4B | about 2.5 GB | 8 GB memory |
  | Medium | Qwen 3 8B | about 5 GB | 16 GB memory, or a GPU with 7 GB or more |
  | Large | Qwen 3 14B | about 9 GB | 32 GB memory, or a GPU with 12 GB or more |

- **Which one is recommended:** the app reads the memory, the free disk space and the GPU (Metal on
  a Mac, CUDA or Vulkan on Windows). It recommends the largest model that fits in GPU memory. With no
  fast GPU it recommends the small one, because bigger models answer slowly on a processor; they can
  still be downloaded (marked "slow on this computer"). If the computer is short on memory or disk
  space, it says so and points to a cheap online model (Claude Haiku, GPT Luna, Gemini Flash-Lite).

## Using it

AI settings (the AI chip at the top) → **Offline model** → **Download** → **Save**.

When no API key is set, an installed offline model answers before the free demo does. A key always
wins. Downloads can be cancelled and continue where they stopped; the file is checked (size and
SHA-256) before it is used. Models live in the app data folder, in `models/`, and can be deleted
from the same screen.

## What it can and cannot do

- Every check, measurement and the simulator work the same. The assistant still only states
  measurements it got from a tool call.
- It is smaller than Claude, GPT or Gemini, so it can be wrong more often and follows long
  instructions less well. Suggestions still need your confirmation.
- Text only: it cannot look at photos or PDFs (part recognition and datasheet import need an online
  provider). It says so instead of failing.
- The context is about 8,000 tokens. Long projects are trimmed (a shorter context block first, then
  the oldest turns). Very large questions are refused with a plain message.
- Tools: it calls the same tools as the other providers. Tool calls and structured answers cannot
  share one pass on a grammar-constrained engine, so with both, the final answer takes a second pass.

## Checking it on a computer

- `npm run check:models` checks that every catalog file exists on Hugging Face and that its size is
  close to the catalog (needs internet).
- `BP_LOCAL_MODEL=/path/to/model.gguf npm test -- local-provider` runs a real model through the
  provider: a plain answer, a tool call and a JSON answer (skipped when the variable is not set).
- `npm run test:e2e -- -g "offline model"` clicks through the settings screen in the real app,
  downloading a fake model from a local mirror.
- `BOARDPILOT_MODEL_BASE_URL` points downloads at a mirror (https, or http on localhost).

## Packaging notes

- `package.json` unpacks `node-llama-cpp` and `@node-llama-cpp/*` from the app archive and leaves
  the CUDA engine (about 176 MB) out of the Windows installer. The CPU and Vulkan engines stay, so
  NVIDIA, AMD and Intel GPUs work through Vulkan.
- The macOS job builds both apps on an Apple Silicon runner; `release.yml` adds the Intel engine
  (`@node-llama-cpp/mac-x64`) before packaging.
- Checked in the cloud container: the Linux package contains the engine unpacked, and Electron's own
  Node loads it from `app.asar` and builds a grammar. Not checked there: the Windows and macOS
  installers, and any real model (Hugging Face is not reachable from that container).
