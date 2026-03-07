/**
 * Normalizes a model reference image to a fixed 1:1 aspect ratio with letterboxing
 * so the API receives consistent framing across runs (reduces crop/framing variance).
 */
const MAX_SIDE = 1024;

export function normalizeReferenceImage(base64: string, mimeType: string = 'image/png'): Promise<string> {
  return new Promise((resolve, reject) => {
    const dataUrl = base64.includes(',') ? base64 : `data:${mimeType};base64,${base64}`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const scale = Math.min(MAX_SIDE / w, MAX_SIDE / h, 1);
        const scaledW = Math.round(w * scale);
        const scaledH = Math.round(h * scale);
        const size = Math.max(scaledW, scaledH, 1);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        const x = (size - scaledW) / 2;
        const y = (size - scaledH) / 2;
        ctx.drawImage(img, 0, 0, w, h, x, y, scaledW, scaledH);
        const out = canvas.toDataURL('image/png');
        const outBase64 = out.split(',')[1];
        if (outBase64) resolve(outBase64);
        else reject(new Error('Failed to export canvas'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load reference image'));
    img.src = dataUrl;
  });
}
