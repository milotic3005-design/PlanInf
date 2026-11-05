/** Site chrome: logo, sticky header with section nav and theme toggle, footer. */
import { useEffect, useState, type ReactNode } from 'react';
import { Menu, Moon, Sun } from 'lucide-react';

export const NAV = [
  { href: '#situation', label: 'Situation' },
  { href: '#answer', label: 'Result' },
  { href: '#plans', label: 'Plans' },
  { href: '#chart', label: 'Chart' },
  { href: '#break-even', label: 'Break-even' },
  { href: '#breakdown', label: 'Breakdown' },
  { href: '#tax-data', label: 'Sources' },
] as const;

/** Mark: a plan card with a care cross and three ascending cost bars. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="36" height="36" rx="9" fill="var(--brand)" />
      <path d="M2 27h36v2.5a8.5 8.5 0 0 1-8.5 8.5h-19A8.5 8.5 0 0 1 2 29.5z" fill="var(--brand-strong)" />
      <g fill="var(--on-brand)">
        <path d="M15.5 8.5h4.2v4.6h4.6v4.2h-4.6v4.6h-4.2v-4.6h-4.6v-4.2h4.6z" />
        <rect x="26" y="15.5" width="3" height="6.5" rx="1" opacity=".9" />
        <rect x="30.5" y="12" width="3" height="10" rx="1" opacity=".9" />
        <rect x="9" y="30.5" width="22" height="1.6" rx=".8" opacity=".85" />
        <rect x="9" y="33.5" width="14" height="1.6" rx=".8" opacity=".6" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[1.4rem] leading-none font-semibold tracking-tight text-ink">
        Plan <span className="text-brand italic">Chooser</span>
      </span>
    </span>
  );
}

/** Light/dark toggle. Starts from the system setting; applies to this visit only (nothing is stored). */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', dark);
    el.classList.toggle('light', !dark);
  }, [dark]);
  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface hover:text-ink"
    >
      {dark ? <Sun aria-hidden="true" className="h-5 w-5" /> : <Moon aria-hidden="true" className="h-5 w-5" />}
    </button>
  );
}

export function SiteHeader({ right }: { right?: ReactNode }) {
  return (
    <header data-site-header className="sticky top-0 z-30 border-b hairline bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <a href="#top" className="shrink-0 rounded-lg" aria-label="Plan Chooser, back to top">
          <Wordmark />
        </a>
        <nav aria-label="Sections" className="hidden xl:block">
          <ul className="flex items-center gap-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface hover:text-ink">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {right}
          <ThemeToggle />
          <details className="relative xl:hidden">
            <summary className="inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-ink-muted hover:bg-surface hover:text-ink [&::-webkit-details-marker]:hidden">
              <Menu aria-hidden="true" className="h-5 w-5" />
              <span className="sr-only">Open section menu</span>
            </summary>
            <nav aria-label="Sections (menu)" className="absolute right-0 mt-2 w-56 rounded-xl border hairline bg-surface-raised p-2 shadow-card">
              <ul>
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={(e) => (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-ink hover:bg-paper-sunken"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ disclaimer, sources }: { disclaimer: string; sources: Array<{ title: string; url: string }> }) {
  return (
    <footer data-site-footer className="mt-16 border-t hairline bg-paper-sunken/50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1.2fr] lg:px-8">
        <div className="max-w-md">
          <Wordmark />
          <p className="mt-3 text-sm text-ink-muted">Compare employer medical plans by what they really cost you after taxes.</p>
          <p className="mt-4 text-xs leading-relaxed text-ink-faint">
            All math runs in this page. A Content-Security-Policy blocks the page from making any network request; nothing you type is sent or saved.
            Not affiliated with the IRS, SSA, or any employer or insurer.
          </p>
        </div>
        <nav aria-label="On this page">
          <h2 className="text-xs font-semibold tracking-wider text-ink-faint uppercase">On this page</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <a className="inline-flex min-h-9 items-center text-ink-muted hover:text-ink hover:underline" href={n.href}>
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Primary sources">
          <h2 className="text-xs font-semibold tracking-wider text-ink-faint uppercase">Primary sources</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {sources.map((s) => (
              <li key={s.url}>
                <a className="inline-flex min-h-9 items-center text-ink-muted hover:text-ink hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t hairline">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs leading-relaxed font-semibold text-ink-muted sm:px-6 lg:px-8">{disclaimer}</p>
      </div>
    </footer>
  );
}
