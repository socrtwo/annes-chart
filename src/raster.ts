// Reads the pixel size from the root <svg> tag written by renderSvg / fanChartSvg.
export function svgSize(svg: string): { w: number; h: number } {
  const w = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
  const h = Number(/<svg[^>]*\sheight="([\d.]+)"/.exec(svg)?.[1]);
  if (!w || !h) throw new Error('SVG has no width/height');
  return { w, h };
}

const MAX_SIDE = 32767;
const MAX_AREA = 268_435_456;

// The largest scale up to `wanted` whose canvas stays inside the usual browser limits.
export function pngScale(w: number, h: number, wanted = 2): number {
  return Math.min(wanted, MAX_SIDE / w, MAX_SIDE / h, Math.sqrt(MAX_AREA / (w * h)));
}

// Browsers differ in how large a canvas they will encode, and report failure only by
// returning nothing, so a failed attempt is retried at half the scale.
export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const { w, h } = svgSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (let s = pngScale(w, h, scale); s >= 0.05; s /= 2) {
      const canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.floor(w * s)), height: Math.max(1, Math.floor(h * s)) });
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (blob) return blob;
    }
    throw new Error('The chart is too large for this browser to save as PNG; save it as SVG instead');
  } finally {
    URL.revokeObjectURL(url);
  }
}
