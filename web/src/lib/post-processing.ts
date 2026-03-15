/**
 * Shared post-processing effects used by both preview player and export renderer.
 * Extracted to ensure visual parity between preview and final export.
 */

// ── Easing ──

export function applyEasing(t: number, easing: string): number {
  switch (easing) {
    case "linear": return t;
    case "quad": return 1 - (1 - t) * (1 - t);
    case "expo": return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case "cubic":
    default: return 1 - Math.pow(1 - t, 3);
  }
}

// ── Micro-settle ──

export function getMicroSettle(
  elapsedSec: number,
  settleScale: number = 1.006,
  settleDuration: number = 0.18,
  easing: string = "cubic"
): { scale: number; offsetY: number } {
  if (settleScale <= 1.0 || settleDuration <= 0 || elapsedSec >= settleDuration) return { scale: 1, offsetY: 0 };
  const t = Math.min(1, elapsedSec / settleDuration);
  const ease = applyEasing(t, easing);
  const scale = settleScale + (1 - settleScale) * ease;
  const offsetY = -2 * (settleScale - 1) / 0.006 * (1 - ease);
  return { scale, offsetY };
}

// ── Exit deceleration ──

export function getExitDeceleration(
  elapsedSec: number,
  clipDuration: number,
  minSpeed: number = 0.96,
  decelDuration: number = 0.14,
  easing: string = "quad"
): number {
  if (minSpeed >= 1.0 || decelDuration <= 0) return 1.0;
  const remaining = clipDuration - elapsedSec;
  if (remaining >= decelDuration || remaining <= 0) return 1.0;
  const t = 1 - remaining / decelDuration;
  const ease = applyEasing(t, easing);
  return 1.0 + (minSpeed - 1.0) * ease;
}

// ── Film grain overlay ──

let _grainCanvas: HTMLCanvasElement | null = null;
let _grainCtx: CanvasRenderingContext2D | null = null;
let _grainBlock: number = 4;

export function drawFilmGrain(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number = 0.045, blockSize: number = 4) {
  if (opacity <= 0) return;
  const gw = Math.ceil(w / blockSize);
  const gh = Math.ceil(h / blockSize);
  if (!_grainCanvas || _grainCanvas.width !== gw || _grainCanvas.height !== gh || _grainBlock !== blockSize) {
    _grainBlock = blockSize;
    _grainCanvas = document.createElement("canvas");
    _grainCanvas.width = gw;
    _grainCanvas.height = gh;
    _grainCtx = _grainCanvas.getContext("2d")!;
  }
  const gCtx = _grainCtx!;
  const imageData = gCtx.createImageData(gw, gh);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  gCtx.putImageData(imageData, 0, 0);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = "overlay";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(_grainCanvas, 0, 0, w, h);
  ctx.restore();
}

// ── Vignette overlay ──

let _vignetteCanvas: HTMLCanvasElement | null = null;
let _vignetteTightness: number = 0.45;
let _vignetteHardness: number = 0.48;

export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number = 0.18, tightness: number = 0.45, hardness: number = 0.48) {
  if (intensity <= 0) return;
  if (!_vignetteCanvas || _vignetteCanvas.width !== w || _vignetteCanvas.height !== h || _vignetteTightness !== tightness || _vignetteHardness !== hardness) {
    _vignetteCanvas = document.createElement("canvas");
    _vignetteCanvas.width = w;
    _vignetteCanvas.height = h;
    _vignetteTightness = tightness;
    _vignetteHardness = hardness;
    const vCtx = _vignetteCanvas.getContext("2d")!;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);
    const innerR = Math.max(0.1, Math.min(0.8, tightness));
    const grad = vCtx.createRadialGradient(cx, cy, radius * innerR, cx, cy, radius);
    const h_ = Math.max(0, Math.min(1, hardness));
    const midStop = 0.4 + h_ * 0.45;
    const midAlpha = 0.08 + h_ * 0.25;
    const edgeAlpha = 0.35 + h_ * 0.35;
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(midStop, `rgba(0,0,0,${midAlpha})`);
    grad.addColorStop(1, `rgba(0,0,0,${edgeAlpha})`);
    vCtx.fillStyle = grad;
    vCtx.fillRect(0, 0, w, h);
  }
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.drawImage(_vignetteCanvas, 0, 0);
  ctx.restore();
}

// ── Film stock base ──

export function applyFilmStock(ctx: CanvasRenderingContext2D, w: number, h: number, stock: { grain: number; warmth: number; contrast: number; fadedBlacks: number } | undefined) {
  if (!stock) return;
  const parts: string[] = [];
  if (stock.contrast !== 1.0) parts.push(`contrast(${stock.contrast.toFixed(3)})`);
  if (stock.warmth > 0) parts.push(`sepia(${stock.warmth.toFixed(3)})`);
  else if (stock.warmth < 0) parts.push(`hue-rotate(${(stock.warmth * 60).toFixed(1)}deg)`);
  if (parts.length > 0) {
    ctx.filter = parts.join(" ");
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.filter = "none";
  }
  if (stock.fadedBlacks > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighten";
    const gray = Math.round(stock.fadedBlacks * 255);
    ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (stock.grain > 0) {
    drawFilmGrain(ctx, w, h, stock.grain);
  }
}

// ── Warmth shift for final clip ──

export function getWarmthShiftCSS(
  elapsedSec: number,
  clipDuration: number,
  warmth: boolean | { sepia: number; saturation: number; fadeIn: number } = true
): string | null {
  if (warmth === false) return null;
  const sepiaMax = typeof warmth === "object" ? warmth.sepia : 0.06;
  const satMax = typeof warmth === "object" ? warmth.saturation : 0.04;
  const fadeIn = typeof warmth === "object" ? warmth.fadeIn : 2.0;
  const remaining = clipDuration - elapsedSec;
  if (remaining >= fadeIn) return null;
  const t = Math.min(1, (fadeIn - remaining) / fadeIn);
  const sepia = (sepiaMax * t).toFixed(3);
  const sat = (1 + satMax * t).toFixed(3);
  return `sepia(${sepia}) saturate(${sat})`;
}
