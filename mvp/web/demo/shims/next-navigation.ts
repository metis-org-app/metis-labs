import { useMemo } from 'react';
import { navegar, useEstado } from './router';

const router = {
  push: (href: string, _opts?: unknown) => navegar(href),
  replace: (href: string, _opts?: unknown) => navegar(href),
  back: () => navegar('/'),
  refresh: () => undefined,
  prefetch: () => undefined,
};

export const useRouter = () => router;
export const usePathname = () => useEstado().pathname;
export function useSearchParams() {
  const { search } = useEstado();
  return useMemo(() => new URLSearchParams(search), [search]);
}
