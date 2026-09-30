// Checks the offline model catalog (shared/localModels.ts) against Hugging Face: every file must
// exist, and its real size must be close to the catalog's approximate size. Run it on a computer
// with internet access: npm run check:models
// Uses Node's built-in TypeScript support (Node 22.18+ / 24).
import { LOCAL_MODELS, localModelUrl, formatBytes } from '../shared/localModels.ts';

const base = process.env.BOARDPILOT_MODEL_BASE_URL || 'https://huggingface.co';
let bad = 0;
for (const m of LOCAL_MODELS) {
  const url = localModelUrl(m, base);
  try {
    // A HEAD request follows Hugging Face's redirect to the file store and reports the real size.
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    const size = Number(res.headers.get('x-linked-size') ?? res.headers.get('content-length') ?? 0);
    const hash = (res.headers.get('x-linked-etag') ?? '').replace(/"/g, '');
    if (!res.ok) throw new Error(`the server answered ${res.status}`);
    const ratio = size / m.approxBytes;
    const close = size > 0 && ratio > 0.85 && ratio < 1.15;
    if (!close) bad++;
    console.log(`${close ? 'ok  ' : 'SIZE'} ${m.id.padEnd(10)} ${m.file}  real ${size ? formatBytes(size) : '?'} · catalog ${formatBytes(m.approxBytes)} · sha256 ${hash ? hash.slice(0, 12) + '…' : 'not reported'}`);
  } catch (e) {
    bad++;
    console.log(`FAIL ${m.id.padEnd(10)} ${url}\n     ${e instanceof Error ? e.message : e}`);
  }
}
if (bad) {
  console.log(`\n${bad} of ${LOCAL_MODELS.length} models need attention. If the server answered 403 or the request failed, check the network first; otherwise fix the file name or the size in shared/localModels.ts.`);
  process.exit(1);
}
console.log('\nEvery catalog file exists and its size matches.');
