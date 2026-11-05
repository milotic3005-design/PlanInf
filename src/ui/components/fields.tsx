/**
 * Form controls in the CodeRx style: bold label, hint under the label, large
 * input with attached unit boxes ($, %, per year), radio cards.
 *
 * NumberField keeps the typed text locally and only reports a value when it
 * parses and is in range, so the engine never sees bad input. Invalid text
 * stays on screen with an error message (aria-invalid).
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface NumberFieldProps {
  label: string;
  /** Hide the visible label (table cells); it stays as the accessible name. */
  hideLabel?: boolean;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  /** Shown in and parsed from the box as a percent (value 0.2 ↔ "20"). */
  percent?: boolean;
  integer?: boolean;
  /** Empty box means null (e.g. "no copay"). Otherwise empty means 0. */
  blankIsNull?: boolean;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
}

const toText = (v: number | null, percent?: boolean) => (v === null ? '' : String(percent ? Math.round(v * 1e6) / 1e4 : v));

export const labelCls = 'block text-sm font-semibold text-ink';
export const hintCls = 'mt-0.5 text-xs leading-snug text-ink-muted';

export function NumberField(p: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(toText(p.value, p.percent));
  const [error, setError] = useState<string | null>(null);

  // Follow outside changes (e.g. "Load worked example") without clobbering what's being typed.
  useEffect(() => {
    const parsed = parse(text);
    if (parsed.ok && parsed.value !== p.value) {
      setText(toText(p.value, p.percent));
      setError(null);
    }
  }, [p.value]); // deliberately only on value: text/parse are read fresh each run

  function parse(t: string): { ok: true; value: number | null } | { ok: false; msg: string } {
    const s = t.replace(/[$,%\s]/g, '');
    if (s === '') return { ok: true, value: p.blankIsNull ? null : 0 };
    if (!/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return { ok: false, msg: 'Enter a number.' };
    let n = Number(s);
    if (p.integer && !Number.isInteger(n)) return { ok: false, msg: 'Enter a whole number.' };
    const lo = p.min ?? 0;
    const hi = p.max ?? Infinity;
    const shownLo = p.percent ? lo * 100 : lo;
    const shownHi = p.percent ? hi * 100 : hi;
    if (p.percent) n = n / 100;
    if (n < lo || n > hi) {
      const range = Number.isFinite(shownHi)
        ? `from ${shownLo.toLocaleString('en-US')} to ${shownHi.toLocaleString('en-US')}`
        : `of ${shownLo.toLocaleString('en-US')} or more`;
      return { ok: false, msg: `Enter a number ${range}.` };
    }
    return { ok: true, value: n };
  }

  function onText(t: string) {
    setText(t);
    const r = parse(t);
    if (r.ok) {
      setError(null);
      p.onChange(r.value);
    } else setError(r.msg);
  }

  const describedBy = [p.hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(' ') || undefined;
  const addon = `flex items-center bg-paper-sunken px-3 font-semibold text-ink-muted select-none ${p.compact ? 'text-xs' : 'text-sm'}`;
  return (
    <div className={p.className}>
      <label htmlFor={id} className={p.hideLabel ? 'sr-only' : labelCls}>
        {p.label}
      </label>
      {p.hint && (
        <p id={`${id}-hint`} className={`${hintCls} ${p.hideLabel ? 'sr-only' : ''}`}>
          {p.hint}
        </p>
      )}
      <div
        className={`flex items-stretch overflow-hidden rounded-lg border bg-surface-raised transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 ${
          error ? 'border-danger' : 'border-rule-strong'
        } ${p.disabled ? 'opacity-50' : ''} ${p.hideLabel ? '' : 'mt-2'}`}
      >
        {p.prefix && <span className={`${addon} border-r border-rule-strong`}>{p.prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={p.disabled}
          placeholder={p.placeholder}
          value={text}
          onChange={(e) => onText(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`code-chip w-full min-w-0 bg-transparent text-ink outline-none placeholder:text-ink-faint ${p.compact ? 'min-h-9 px-2 text-sm' : 'min-h-12 px-3.5 text-base'}`}
        />
        {p.suffix && <span className={`${addon} border-l border-rule-strong`}>{p.suffix}</span>}
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectProps<T extends string | number> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
  hint?: ReactNode;
  className?: string;
  hideLabel?: boolean;
  compact?: boolean;
}

export function Select<T extends string | number>(p: SelectProps<T>) {
  const id = useId();
  return (
    <div className={p.className}>
      <label htmlFor={id} className={p.hideLabel ? 'sr-only' : labelCls}>
        {p.label}
      </label>
      {p.hint && (
        <p id={`${id}-hint`} className={hintCls}>
          {p.hint}
        </p>
      )}
      <div className={`relative ${p.hideLabel ? '' : 'mt-2'}`}>
        <select
          id={id}
          value={String(p.value)}
          aria-describedby={p.hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            const opt = p.options.find((o) => String(o.value) === e.target.value);
            if (opt) p.onChange(opt.value);
          }}
          className={`w-full appearance-none rounded-lg border border-rule-strong bg-surface-raised pr-9 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 ${
            p.compact ? 'min-h-9 px-2 text-sm' : 'min-h-12 px-3.5 text-base'
          }`}
        >
          {p.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
      </div>
    </div>
  );
}

/** Radio cards (fieldset + legend), like CodeRx's "Container type" picker. */
export function RadioCards<T extends string>(p: {
  legend: string;
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; detail?: string }>;
  onChange: (v: T) => void;
  hint?: ReactNode;
  columns?: 2 | 3 | 4;
  hideLegend?: boolean;
  /** One row at every width, tighter cards (the radio dot hides on phones; the card shows the choice). */
  compact?: boolean;
}) {
  const id = useId();
  // Literal class names so Tailwind can see them.
  const cols = p.compact ? { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[p.columns ?? 3] : { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 xl:grid-cols-4' }[p.columns ?? 2];
  return (
    <fieldset aria-describedby={p.hint ? `${id}-hint` : undefined}>
      <legend className={p.hideLegend ? 'sr-only' : labelCls}>{p.legend}</legend>
      {p.hint && (
        <p id={`${id}-hint`} className={hintCls}>
          {p.hint}
        </p>
      )}
      <div className={`grid gap-2 ${cols} ${p.hideLegend ? '' : 'mt-2'}`}>
        {p.options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-12 cursor-pointer items-center rounded-lg border border-rule-strong bg-surface-raised py-2 text-sm text-ink ${p.compact ? 'gap-2 px-2.5 sm:gap-3 sm:px-3.5' : 'gap-3 px-3.5'} transition-colors hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand-tint has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus`}
          >
            <input
              type="radio"
              name={p.name}
              value={o.value}
              checked={p.value === o.value}
              onChange={() => p.onChange(o.value)}
              className={`h-4 w-4 shrink-0 accent-[var(--brand)] focus-visible:outline-none ${p.compact ? 'max-sm:sr-only' : ''}`}
            />
            <span className="min-w-0">
              <span className="block font-semibold">{o.label}</span>
              {o.detail && <span className="block text-xs text-ink-muted">{o.detail}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Checkbox(p: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={p.checked}
        disabled={p.disabled}
        onChange={(e) => p.onChange(e.target.checked)}
        aria-describedby={p.hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
      />
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {p.label}
        </label>
        {p.hint && (
          <p id={`${id}-hint`} className={hintCls}>
            {p.hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Disclosure button + region (Show math, More options, table view). */
export function Disclosure(p: { label: string; openLabel?: string; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(p.defaultOpen));
  const id = useId();
  return (
    <div className={p.className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md text-sm font-semibold text-brand hover:text-brand-strong hover:underline"
      >
        <ChevronRight aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        {open ? (p.openLabel ?? p.label) : p.label}
      </button>
      {open && (
        <div id={id} className="mt-3">
          {p.children}
        </div>
      )}
    </div>
  );
}

/** Plan identity swatch (the color lives on the mark, never on the text). */
export function Swatch({ color, line }: { color: string; line?: boolean }) {
  return line ? (
    <span aria-hidden className="inline-block h-0.5 w-4 shrink-0 rounded-full" style={{ background: color }} />
  ) : (
    <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
  );
}
