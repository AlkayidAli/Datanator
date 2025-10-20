export type ExportFormat = 'png' | 'svg';

function inlineStyles(svg: SVGSVGElement) {
  // Clone and inline computed styles to make the SVG self-contained
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const styleSheets = Array.from(document.styleSheets) as CSSStyleSheet[];
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.setAttribute('type', 'text/css');
  let cssText = '';
  for (const ss of styleSheets) {
    try {
      const rules = ss.cssRules || [];
      for (const r of Array.from(rules)) cssText += r.cssText + '\n';
    } catch {
      // Cross-origin or restricted stylesheet – skip
    }
  }
  styleEl.textContent = '<![CDATA[' + cssText + ']]>';
  defs.appendChild(styleEl);
  clone.insertBefore(defs, clone.firstChild);
  return clone;
}

export async function exportSvgElement(
  svg: SVGSVGElement,
  opts: { filename?: string; format?: ExportFormat; scale?: number } = {}
): Promise<void> {
  const { filename = 'chart', format = 'png', scale = 2 } = opts;
  const width = svg.viewBox.baseVal?.width || svg.getBoundingClientRect().width || svg.clientWidth;
  const height = svg.viewBox.baseVal?.height || svg.getBoundingClientRect().height || svg.clientHeight;

  // Serialize SVG
  const inlined = inlineStyles(svg);
  inlined.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  inlined.setAttribute('width', String(width));
  inlined.setAttribute('height', String(height));
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(inlined);
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });

  if (format === 'svg') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(svgBlob);
    a.download = `${filename}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }

  // Render to canvas for PNG
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(e);
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `${filename}.png`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
