// Web worker: downscale image to max 1024px edge, strip metadata, hash bytes
// Message in: { id: string, arrayBuffer: ArrayBuffer, mimeType: string }
// Message out: { id: string, ok: true, bytes: ArrayBuffer, width: number, height: number, mimeType: string, contentHash: string }
// or { id: string, ok: false, error: string }

type InMsg = { id: string; arrayBuffer: ArrayBuffer; mimeType: string };
type OutOk = { id: string; ok: true; bytes: ArrayBuffer; width: number; height: number; mimeType: string; contentHash: string };
type OutErr = { id: string; ok: false; error: string };

function toHex(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(hash);
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, arrayBuffer, mimeType } = e.data;
  try {
    const blob = new Blob([arrayBuffer], { type: mimeType });
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      // Fallback: just hash original and return
      const contentHash = await sha256Hex(arrayBuffer);
      const msg: OutOk = { id, ok: true, bytes: arrayBuffer, width: 0, height: 0, mimeType, contentHash };
      (self as any).postMessage(msg, [arrayBuffer]);
      return;
    }
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
    const outW = Math.max(1, Math.round(bitmap.width * scale));
    const outH = Math.max(1, Math.round(bitmap.height * scale));
    let outType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';

    // Draw into OffscreenCanvas
    const canvas = new OffscreenCanvas(outW, outH);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no_2d_context');
    ctx.drawImage(bitmap, 0, 0, outW, outH);
    const quality = outType === 'image/jpeg' ? 0.8 : undefined;
    const outBlob = await canvas.convertToBlob({ type: outType, quality: quality as any });
    const outBuf = await outBlob.arrayBuffer();
    const contentHash = await sha256Hex(outBuf);
    const msg: OutOk = { id, ok: true, bytes: outBuf, width: outW, height: outH, mimeType: outType, contentHash };
    (self as any).postMessage(msg, [outBuf]);
  } catch (err) {
    const msg: OutErr = { id, ok: false, error: (err as Error).message || 'worker_error' };
    (self as any).postMessage(msg);
  }
};

