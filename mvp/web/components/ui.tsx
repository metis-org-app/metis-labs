'use client';

import { ReactNode, useEffect } from 'react';

const DX_CLASE: Record<string, string> = {
  TEA: 'dx-tea',
  'TDA-H': 'dx-tdah',
  TL: 'dx-tl',
};

export function DxBadge({ dx, nivel }: { dx: string | null; nivel?: number | null }) {
  if (!dx) return null;
  return (
    <span className={`dx ${DX_CLASE[dx] ?? 'dx-otro'}`} title={nivel ? `${dx} nivel ${nivel}` : dx}>
      {dx}
      {nivel ? ` ${nivel}` : ''}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? <div className="alert">{error}</div> : null;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHead({ icon, title, subtitle, action }: { icon: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>
          <span className="page-icon">{icon}</span> {title}
        </h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Proximamente({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <>
      <PageHead icon={icon} title={title} />
      <div className="card soon">
        <h2>Próximamente</h2>
        <p className="muted">{children}</p>
      </div>
    </>
  );
}
