/**
 * Layout and display primitives in the CodeRx style: numbered document
 * sections, cards, callouts, pills, stat tiles, and scrollable tables.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';

/** Numbered page section: "01" code chip, serif title, optional description. */
export function PageSection(p: { id: string; number: string; title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={p.id} aria-labelledby={`${p.id}-title`} className={`scroll-mt-24 border-t hairline pt-8 pb-10 first:border-t-0 first:pt-0 ${p.className ?? ''}`}>
      <div className="mb-5 flex items-baseline gap-3">
        <span aria-hidden="true" className="code-chip text-sm text-ink-faint">
          {p.number}
        </span>
        <div className="min-w-0">
          <h2 id={`${p.id}-title`} className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">
            {p.title}
          </h2>
          {p.description ? <div className="mt-1 max-w-3xl text-sm text-ink-muted">{p.description}</div> : null}
        </div>
      </div>
      {p.children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border hairline bg-surface p-5 shadow-card sm:p-6 ${className}`}>{children}</div>;
}

/** "1 · Title" heading inside a card, like the CodeRx calculator steps. */
export function StepHeading({ n, children, id }: { n: number | string; children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="font-display text-xl font-semibold tracking-tight text-ink">
      <span className="text-ink-faint">{n} ·</span> {children}
    </h3>
  );
}

const TONES = {
  info: { box: 'border-brand/30 bg-brand-tint/50', icon: Info, iconClass: 'text-brand', role: 'note' },
  warning: { box: 'border-accent/40 bg-accent-tint/60', icon: TriangleAlert, iconClass: 'text-accent', role: 'note' },
  danger: { box: 'border-danger/40 bg-danger-tint/60', icon: CircleAlert, iconClass: 'text-danger', role: 'alert' },
} as const;

export function Callout({ tone = 'info', title, children, className = '' }: { tone?: keyof typeof TONES; title?: ReactNode; children?: ReactNode; className?: string }) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <div role={t.role} className={`flex gap-3 rounded-lg border px-4 py-3 text-sm ${t.box} ${className}`}>
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${t.iconClass}`} />
      <div className="min-w-0 text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-ink-muted [&_a]:font-semibold [&_a]:text-brand [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}

export function Pill({ children, tone = 'neutral', className = '', icon: Icon }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'accent' | 'ok'; className?: string; icon?: LucideIcon }) {
  const cls = {
    neutral: 'border border-rule-strong bg-surface text-ink-muted',
    brand: 'bg-brand-tint text-brand',
    accent: 'bg-accent-tint text-accent',
    ok: 'bg-ok-tint text-ok',
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.75rem] leading-5 font-semibold tracking-wide whitespace-nowrap ${cls} ${className}`}>
      {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; icon?: LucideIcon; size?: 'md' | 'sm' };

export function Button({ variant = 'secondary', icon: Icon, size = 'md', className = '', children, type = 'button', ...rest }: ButtonProps) {
  const v = {
    primary: 'bg-brand text-on-brand hover:bg-brand-strong',
    secondary: 'border border-rule-strong bg-surface-raised text-ink hover:border-brand hover:text-brand',
    ghost: 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
  }[variant];
  const s = size === 'sm' ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-sm';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${v} ${s} ${className}`}
      {...rest}
    >
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/** Horizontally scrollable, keyboard-focusable container for wide tables. */
export function TableScroll({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={`table-scroll overflow-x-auto rounded-lg border hairline bg-surface ${className}`}>
      {children}
    </div>
  );
}

export const th = 'bg-paper-sunken px-3 py-2.5 text-left text-xs font-semibold tracking-wide whitespace-nowrap text-ink-muted uppercase';
export const td = 'border-t hairline px-3 py-2.5 align-top text-sm';
