'use client';

import Link from 'next/link';
import { CSSProperties, Fragment, ReactNode, useEffect } from 'react';
import type { EstadoEvaluacion, Oa } from '@/lib/types';
import { ESTADO_EVAL, nota as fmtNota } from '@/lib/format';

const DX_CLASE: Record<string, string> = { TEA: 'dx-tea', 'TDA-H': 'dx-tdah', TL: 'dx-tl' };

export function DxBadge({ dx, nivel }: { dx: string | null; nivel?: number | null }) {
  if (!dx) return null;
  return (
    <span className={`dx ${DX_CLASE[dx] ?? 'dx-otro'}`} title={nivel ? `${dx}, nivel ${nivel} de apoyo` : dx}>
      {dx}
      {nivel ? ` ${nivel}` : ''}
    </span>
  );
}

/** Código oficial del OA con su nivel y asignatura, siempre visibles. */
export function OaTag({ oa, compacto }: { oa: Oa; compacto?: boolean }) {
  return (
    <span className="oa-tag" style={{ '--c': oa.asignaturaColor } as CSSProperties} title={`${oa.asignatura} · ${oa.nivel}: ${oa.descripcion}`}>
      <b>{oa.codigoOficial}</b>
      {!compacto && (
        <span>
          {oa.nivel} · {oa.asignatura}
        </span>
      )}
    </span>
  );
}

export function OaDetalle({ oa, children }: { oa: Oa; children?: ReactNode }) {
  return (
    <div className="oa-detalle">
      <div className="oa-detalle-head">
        <OaTag oa={oa} />
        {oa.eje && <span className="muted small">Eje: {oa.eje}</span>}
      </div>
      <p>{oa.descripcion}</p>
      {children}
    </div>
  );
}

export function EstadoEval({ estado }: { estado: EstadoEvaluacion }) {
  return <span className={`chip chip-${estado.toLowerCase()}`}>{ESTADO_EVAL[estado]}</span>;
}

export function NotaBadge({ nota, pendiente }: { nota: number | null; pendiente?: boolean }) {
  if (pendiente) return <span className="nota nota-pend">Por revisar</span>;
  if (nota == null) return <span className="muted">—</span>;
  return <span className={`nota ${nota >= 4 ? 'nota-ok' : 'nota-baja'}`}>{fmtNota(nota)}</span>;
}

export function LogroBadge({ porcentaje, nivel }: { porcentaje: number; nivel: string }) {
  const clase = nivel === 'Logrado' ? 'l-ok' : nivel === 'Medianamente logrado' ? 'l-med' : 'l-bajo';
  const sigla = nivel === 'Logrado' ? 'L' : nivel === 'Medianamente logrado' ? 'ML' : 'PL';
  return (
    <span className={`logro ${clase}`} title={nivel}>
      {sigla} · {porcentaje}%
    </span>
  );
}

export function Barra({ valor, total, color }: { valor: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="bar" aria-label={`${pct}%`}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, activo, onChange }: { tabs: [T, string, number?][]; activo: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label, n]) => (
        <button key={k} role="tab" aria-selected={activo === k} className={`tab ${activo === k ? 'active' : ''}`} onClick={() => onChange(k)}>
          {label}
          {n != null && <span className="tab-n">{n}</span>}
        </button>
      ))}
    </div>
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

export function PageHead({ title, subtitle, action, migas }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; migas?: [string, string?][] }) {
  return (
    <div className="page-head">
      <div>
        {migas && (
          <nav className="migas" aria-label="Ruta">
            {migas.map(([label, href], i) => (
              <Fragment key={i}>
                {i > 0 && <span>/</span>}
                {href ? <Link href={href}>{label}</Link> : <span>{label}</span>}
              </Fragment>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {action && <div className="head-actions">{action}</div>}
    </div>
  );
}

export function Stat({ valor, label, detalle, color }: { valor: ReactNode; label: string; detalle?: ReactNode; color?: string }) {
  return (
    <div className={`stat ${color ? `stat-${color}` : ''}`}>
      <div className="stat-value">{valor}</div>
      <div className="stat-label">{label}</div>
      {detalle && <div className="stat-detail">{detalle}</div>}
    </div>
  );
}

/** Markdown mínimo para materiales: títulos, listas, negrita y párrafos. */
export function Contenido({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: string[] = [];
  let numerada = false;
  const cerrarLista = () => {
    if (!lista.length) return;
    const items = lista.map((t, i) => <li key={i}>{enLinea(t)}</li>);
    bloques.push(numerada ? <ol key={bloques.length}>{items}</ol> : <ul key={bloques.length}>{items}</ul>);
    lista = [];
  };
  for (const linea of texto.split('\n').map((l) => l.trim())) {
    const item = /^(-|\d+\.)\s+(.*)$/.exec(linea);
    if (item) {
      const esNum = item[1] !== '-';
      if (lista.length && esNum !== numerada) cerrarLista();
      numerada = esNum;
      lista.push(item[2]);
      continue;
    }
    cerrarLista();
    if (!linea) continue;
    if (linea.startsWith('## ')) bloques.push(<h4 key={bloques.length}>{enLinea(linea.slice(3))}</h4>);
    else if (linea.startsWith('# ')) bloques.push(<h3 key={bloques.length}>{enLinea(linea.slice(2))}</h3>);
    else bloques.push(<p key={bloques.length}>{enLinea(linea)}</p>);
  }
  cerrarLista();
  return <div className="contenido">{bloques}</div>;
}

function enLinea(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).map((parte, i) => (parte.startsWith('**') ? <strong key={i}>{parte.slice(2, -2)}</strong> : parte));
}
