import type { ReactNode } from 'react';

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'active' | 'planned' }) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
