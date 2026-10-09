'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, getToken, setToken } from '@/lib/api';
import { ConfirmHost } from '@/components/confirm';
import { DEMO } from '@/lib/demo';

type Me = { nombre: string; rol: string };

const NAV = [
  { href: '/', icon: '📊', label: 'Dashboard' },
  { href: '/estudiantes', icon: '👥', label: 'Estudiantes' },
  { href: '/cursos', icon: '🏫', label: 'Mis Cursos' },
  { href: '/planificacion', icon: '🗓️', label: 'Planificación' },
  { href: '/curriculum', icon: '📚', label: 'Currículum (OA)' },
  { href: '/materiales', icon: '📁', label: 'Materiales' },
  { href: '/notas', icon: '🗒️', label: 'Notas' },
  { href: '/evaluaciones', icon: '📝', label: 'Evaluaciones', soon: true },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [health, setHealth] = useState<string>('Conectando con el API…');
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    api<Me>('/auth/me').then(setMe).catch(() => undefined);
    api<{ message: string; version: string }>('/health')
      .then((h) => setHealth(`${h.message} · ${h.version}`))
      .catch(() => setHealth('API no disponible ⚠️'));
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
          <div className="brand-name">Profes TEA</div>
          <div className="brand-user">
            {me.nombre}
            <br />
            <span>{me.rol}</span>
          </div>
        </div>
        <nav>
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {item.soon && <span className="nav-soon">pronto</span>}
              </Link>
            );
          })}
        </nav>
        <button className="logout" onClick={salir}>
          🚪 Cerrar Sesión
        </button>
      </aside>
      <div className="scrim" onClick={() => setMenuAbierto(false)} />
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMenuAbierto((v) => !v)} aria-label="Menú">
            ☰
          </button>
          <div className="topbar-title">Plataforma Educativa TEA</div>
          <div className="health" title="Estado del API">
            {health}
          </div>
        </header>
        {DEMO && <DemoBanner />}
        <main className="content">{children}</main>
      </div>
      <ConfirmHost />
    </div>
  );
}

function DemoBanner() {
  const [confirmando, setConfirmando] = useState(false);
  const restablecer = async () => {
    await api('/__demo/reset', { method: 'POST' });
    window.location.reload();
  };
  return (
    <div className="demo-banner">
      <span>
        Demo en el navegador: los cambios se guardan solo en este dispositivo. Los estudiantes son ficticios.
      </span>
      {confirmando ? (
        <span className="demo-actions">
          ¿Volver a los datos iniciales?
          <button className="btn btn-danger btn-sm" onClick={restablecer}>
            Restablecer
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </span>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmando(true)}>
          Restablecer datos
        </button>
      )}
    </div>
  );
}
