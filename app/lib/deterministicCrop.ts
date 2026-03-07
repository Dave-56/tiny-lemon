/**
 * Deterministic client-side crop: same aspect ratio and framing for every image.
 * For portrait (e.g. 2:3 full-body): use 100% height, crop sides only — never crop head or feet.
 */

/**
 * Crop an image (data URL) to the target aspect ratio.
 * Portrait (targetRatio <= 1): full height, crop width (center horizontally). Preserves head and feet.
 * Landscape (targetRatio > 1): full width, crop height (center vertically).
 *
 * @param dataUrl - data URL of the image (e.g. data:image/png;base64,...)
 * @param targetRatio - width/height (e.g. 2/3 for 2:3 portrait, 1 for 1:1)
 * @returns data URL of the cropped image (PNG)
 */
export function cropToTargetAspectRatio(
  dataUrl: string,
  targetRatio: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        let cropW: number;
        let cropH: number;
        let x: number;
        let y: number;
        if (targetRatio <= 1) {
          // Portrait: use full height, crop width (no vertical crop — keep head and feet)
          cropH = h;
          cropW = Math.min(h * targetRatio, w);
          x = Math.max(0, (w - cropW) / 2);
          y = 0;
        } else {
          // Landscape: use full width, crop height
          cropW = w;
          cropH = Math.min(w / targetRatio, h);
          x = 0;
          y = Math.max(0, (h - cropH) / 2);
        }
        const sx = Math.round(x);
        const sy = Math.round(y);
        const sw = Math.round(cropW);
        const sh = Math.round(cropH);

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const out = canvas.toDataURL('image/png');
        resolve(out);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for crop'));
    img.src = dataUrl;
  });
}
