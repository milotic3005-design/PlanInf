import { useEffect, useRef, useState } from 'react';

/** Width of an element, kept current with a ResizeObserver (for label-fit and tick density). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean axis ticks: a step from 1/2/2.5/5 × 10ⁿ giving at most `maxTicks`. */
export function niceTicks(lo: number, hi: number, maxTicks: number): number[] {
  const span = Math.max(1, hi - lo);
  const raw = span / Math.max(1, maxTicks - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1]! < hi) out.push(out[out.length - 1]! + step);
  return out;
}
