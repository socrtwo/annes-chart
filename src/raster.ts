// Reads the pixel size from the root <svg> tag written by renderSvg / fanChartSvg.
export function svgSize(svg: string): { w: number; h: number } {
  const w = Number(/<svg[^>]*\swidth="([\d.]+)"/.exec(svg)?.[1]);
  const h = Number(/<svg[^>]*\sheight="([\d.]+)"/.exec(svg)?.[1]);
  if (!w || !h) throw new Error('SVG has no width/height');
  return { w, h };
}

export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const { w, h } = svgSize(svg);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: Math.ceil(w * scale), height: Math.ceil(h * scale) });
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
