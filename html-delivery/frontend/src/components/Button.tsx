import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

type SharedProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet';
};

type ButtonProps = SharedProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: never };
type LinkProps = SharedProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Button({ children, variant = 'secondary', ...props }: ButtonProps | LinkProps) {
  const className = `button button--${variant} ${props.className || ''}`.trim();
  if ('href' in props && props.href) return <a {...props} className={className}>{children}</a>;
  return <button {...props as ButtonProps} className={className}>{children}</button>;
}
