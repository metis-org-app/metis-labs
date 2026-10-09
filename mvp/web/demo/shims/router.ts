// Enrutador en memoria para la versión artifact (reemplaza al de Next.js).
import { useSyncExternalStore } from 'react';

type Estado = { pathname: string; search: string };
let estado: Estado = { pathname: '/', search: '' };
const oyentes = new Set<() => void>();

export function navegar(href: string) {
  const url = new URL(href, 'http://demo.local');
  estado = { pathname: url.pathname, search: url.search };
  oyentes.forEach((f) => f());
  window.scrollTo?.(0, 0);
}

export function useEstado(): Estado {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f);
      return () => oyentes.delete(f);
    },
    () => estado,
  );
}
