import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navegar } from './router';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export default function Link({ href, onClick, children, ...rest }: Props) {
  return (
    <a
      {...rest}
      href={href}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        e.preventDefault();
        navegar(href);
      }}
    >
      {children}
    </a>
  );
}
