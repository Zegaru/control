import type {MouseEvent, ReactNode} from 'react';
import {openExternalUrl} from '../lib/tauri.js';

export function portUrl(port: number): string {
  return `http://localhost:${port}`;
}

/** Port chip / link that opens localhost in the system browser (works in Tauri + web). */
export function PortLink({
  port,
  className,
  children,
  onClick,
}: {
  port: number;
  className?: string;
  children?: ReactNode;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const href = portUrl(port);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={`Open ${href}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(e);
        void openExternalUrl(href);
      }}
    >
      {children ?? `:${port}`}
    </a>
  );
}
