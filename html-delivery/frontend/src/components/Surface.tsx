import type { HTMLAttributes, ReactNode } from 'react';

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div';
  children: ReactNode;
};

export function Surface({ as: Element = 'section', children, className = '', ...props }: SurfaceProps) {
  return <Element className={`surface ${className}`.trim()} {...props}>{children}</Element>;
}
