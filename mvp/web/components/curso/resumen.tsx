'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { EstudianteBreve, Resumen } from '@/lib/types';
import { Barra, DxBadge, ErrorBox, EstadoEval, Stat } from '../ui';

type Tab = 'resumen' | 'estudiantes' | 'curriculo' | 'planificacion' | 'materiales' | 'evaluaciones';

export function ResumenCurso({ cursoId, irA }: { cursoId: number; irA: (t: Tab) => void }) {
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Resumen>(`/cursos/${cursoId}/resumen`).then(setR).catch((e) => setError(e.message));
  }, [cursoId]);

  if (error) return <ErrorBox error={error} />;
  if (!r) return <p className="muted">Cargando…</p>;
  const pie = r.permanentes.length + r.transitorios.length;

  return (
    <>
      <div className="stats">
        <Stat valor={r.totalEstudiantes} label="Estudiantes" detalle={`${pie} en PIE · ${r.exclusiones} adecuaciones por OA`} />
        <Stat valor={`${r.oasCubiertos}/${r.totalOas}`} label="OA cubiertos" detalle={<Barra valor={r.oasCubiertos} total={r.totalOas} />} />
        <Stat
          valor={r.logroPromedio == null ? '—' : `${r.logroPromedio}%`}
          label="Logro promedio"
          detalle={r.oasPorLograr > 0 ? `${r.oasPorLograr} OA por lograr` : 'Según evaluaciones corregidas'}
          color={r.logroPromedio == null ? undefined : r.logroPromedio >= 80 ? 'green' : r.logroPromedio >= 60 ? 'amber' : 'red'}
        />
        <Stat valor={r.planificaciones} label="Semanas planificadas" />
      </div>

      <div className="grid-panorama">
        <section className="card">
          <h2>Programa de Integración Escolar</h2>
          <p className="muted small">{pie === 0 ? 'Ningún estudiante en PIE.' : `${pie} de ${r.totalEstudiantes} estudiantes participan en PIE.`}</p>
          <ListaPie titulo="Permanentes" lista={r.permanentes} />
          <ListaPie titulo="Transitorios" lista={r.transitorios} />
          <button className="btn btn-ghost btn-sm" onClick={() => irA('estudiantes')}>
            Ver nómina completa
          </button>
        </section>

        <div className="stack">
          <section className="card">
            <div className="section-head">
              <h2>Cobertura curricular</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => irA('curriculo')}>
                Ver currículum
              </button>
            </div>
            {r.cobertura.length === 0 && <p className="muted">Este curso no tiene OA asignados.</p>}
            {r.cobertura.map((c) => (
              <div key={c.asignatura} className="bar-row">
                <span className="bar-label">{c.asignatura}</span>
                <div className="bar bar-stack" title={`${c.cubiertos} cubiertos, ${c.enProgreso} en progreso de ${c.total}`}>
                  <div className="bar-fill" style={{ width: `${(c.cubiertos / c.total) * 100}%`, background: c.color }} />
                  <div className="bar-fill bar-prog" style={{ width: `${(c.enProgreso / c.total) * 100}%`, background: c.color }} />
                </div>
                <span className="small nowrap">
                  {c.cubiertos}/{c.total}
                </span>
              </div>
            ))}
            {r.cobertura.length > 0 && (
              <p className="leyenda small muted">
                <span className="sw sw-ok" /> Cubierto <span className="sw sw-prog" /> En progreso
              </p>
            )}
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Evaluaciones</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => irA('evaluaciones')}>
                Ver todas
              </button>
            </div>
            {r.evaluaciones.length === 0 && <p className="muted">Aún no hay evaluaciones en este curso.</p>}
            <ul className="lista-simple">
              {r.evaluaciones.map((e) => (
                <li key={e.id}>
                  <Link href={`/cursos/${cursoId}/evaluaciones/${e.id}${e.estado === 'Borrador' ? '' : '?vista=resultados'}`}>{e.titulo}</Link>
                  <span className="muted small">
                    {e.tipo} · {e.entregas} entregas{e.porRevisar > 0 && ` · ${e.porRevisar} por revisar`}
                  </span>
                  <EstadoEval estado={e.estado} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function ListaPie({ titulo, lista }: { titulo: string; lista: EstudianteBreve[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="pie-list">
      <h4>
        {titulo} <span className="muted">({lista.length})</span>
      </h4>
      {lista.map((e) => (
        <Link key={e.id} href={`/estudiantes/${e.id}`} className="pie-row">
          <span>
            {e.nombre} {e.apellido}
          </span>
          <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
        </Link>
      ))}
    </div>
  );
}
