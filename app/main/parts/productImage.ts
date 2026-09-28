// Product photo for an imported part: a small thumbnail for the library, and the board color for
// the 3D model, measured from the photo (ignoring the white shop background).

import { nativeImage } from 'electron';

export interface ProductImage {
  thumb: string;
  color: string | null;
}

async function download(url: string, signal: AbortSignal): Promise<Buffer | null> {
  const res = await fetch(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0 BoardPilot part importer', Accept: 'image/jpeg,image/png;q=0.9,image/*;q=0.5' } });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchProductImage(url: string): Promise<ProductImage | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    // Some shops (e.g. Adafruit) publish photo links without an extension that only serve the image as .jpg
    let buf = await download(url, ctrl.signal);
    if (!buf && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) buf = await download(`${url}.jpg`, ctrl.signal);
    if (!buf) return null;
    if (buf.length > 6 * 1024 * 1024) return null;
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return null;
    const small = img.resize({ width: 160, quality: 'good' });
    const thumb = `data:image/jpeg;base64,${small.toJPEG(78).toString('base64')}`;
    return { thumb, color: dominantBoardColor(img.resize({ width: 96 })) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Average color of the central area, skipping near-white and near-black pixels. */
function dominantBoardColor(img: Electron.NativeImage): string | null {
  const { width, height } = img.getSize();
  const px = img.toBitmap(); // BGRA
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = Math.floor(height * 0.2); y < height * 0.8; y++) {
    for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
      const i = (y * width + x) * 4;
      const B = px[i];
      const G = px[i + 1];
      const R = px[i + 2];
      const max = Math.max(R, G, B);
      const min = Math.min(R, G, B);
      if (min > 215 || max < 25) continue; // background or deep shadow
      if (max - min < 18 && max > 150) continue; // grey/white glare
      r += R;
      g += G;
      b += B;
      n++;
    }
  }
  if (n < 40) return null;
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
