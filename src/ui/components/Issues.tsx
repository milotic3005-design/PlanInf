/**
 * Validation messages as callouts. Severity is never carried by color alone:
 * each one has an icon and a word ("Problem", "Check", "Note").
 */
import type { Issue } from '../../engine/types';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

const STYLE = {
  error: { box: 'border-danger/40 bg-danger-tint/60', icon: CircleAlert, iconClass: 'text-danger', word: 'Problem' },
  warning: { box: 'border-accent/40 bg-accent-tint/60', icon: TriangleAlert, iconClass: 'text-accent', word: 'Check' },
  info: { box: 'border-brand/30 bg-brand-tint/50', icon: Info, iconClass: 'text-brand', word: 'Note' },
} as const;

const ORDER = { error: 0, warning: 1, info: 2 } as const;

export function IssueList({ issues, label, className }: { issues: Issue[]; label: string; className?: string }) {
  if (issues.length === 0) return null;
  const sorted = [...issues].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return (
    <ul className={`space-y-2 ${className ?? ''}`} aria-label={label}>
      {sorted.map((i) => {
        const s = STYLE[i.severity];
        const Icon = s.icon;
        return (
          <li key={`${i.code}-${i.planId ?? ''}`} className={`flex gap-3 rounded-lg border px-4 py-3 text-sm text-ink ${s.box}`}>
            <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${s.iconClass}`} />
            <span>
              <span className="font-semibold">{s.word}: </span>
              <span className="text-ink-muted">{i.message}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
