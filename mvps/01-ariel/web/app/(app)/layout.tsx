'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken, setToken } from '@/lib/api';
import { ConfirmHost } from '@/components/confirm';
import { Icon } from '@/components/icon';

type Me = { nombre: string; rol: string };
type CursoNav = { id: number; nombre: string; anio: number };

const NAV = [
  { href: '/', icon: 'inicio', label: 'Inicio' },
  { href: '/cursos', icon: 'cursos', label: 'Mis cursos' },
  { href: '/estudiantes', icon: 'estudiantes', label: 'Estudiantes' },
  { href: '/curriculum', icon: 'curriculum', label: 'Currículum' },
  { href: '/materiales', icon: 'materiales', label: 'Materiales' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [cursos, setCursos] = useState<CursoNav[]>([]);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api<Me>('/auth/me').then(setMe).catch(() => undefined);
    const cargar = () => api<CursoNav[]>('/cursos').then(setCursos).catch(() => undefined);
    cargar();
    window.addEventListener('metis:cursos', cargar);
    return () => window.removeEventListener('metis:cursos', cargar);
  }, [router]);

  useEffect(() => setMenuAbierto(false), [pathname]);

  const salir = () => {
    setToken(null);
    router.replace('/login');
  };

  if (!me) return <div className="boot">Cargando…</div>;

  return (
    <div className={`shell ${menuAbierto ? 'menu-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">Metis</div>
          <div className="brand-sub">Currículum, inclusión y evaluación</div>
        </div>
        <nav>
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
          {cursos.length > 0 && (
            <div className="nav-cursos">
              <div className="nav-section">Mis cursos</div>
              {cursos.map((c) => (
                <Link key={c.id} href={`/cursos/${c.id}`} className={`nav-curso ${pathname.startsWith(`/cursos/${c.id}`) ? 'active' : ''}`}>
                  {c.nombre}
                  <span>{c.anio}</span>
                </Link>
              ))}
            </div>
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="user">
            <div className="avatar">{me.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('')}</div>
            <div>
              <div className="user-name">{me.nombre}</div>
              <div className="user-rol">{me.rol}</div>
            </div>
          </div>
          <button className="logout" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión">
            <Icon name="salir" />
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setMenuAbierto(false)} />
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMenuAbierto((v) => !v)} aria-label="Abrir menú">
            ☰
          </button>
          <div className="topbar-brand">Metis</div>
        </header>
        <main className="content">{children}</main>
      </div>
      <ConfirmHost />
    </div>
  );
}
