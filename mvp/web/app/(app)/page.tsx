'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Inicio } from '@/lib/types';
import { Barra, Empty, ErrorBox, PageHead, Stat } from '@/components/ui';

function saludo() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export default function InicioPage() {
  const [d, setD] = useState<Inicio | null>(null);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Inicio>('/inicio').then(setD).catch((e) => setError(e.message));
    api<{ nombre: string }>('/auth/me').then((m) => setNombre(m.nombre.split(' ')[0])).catch(() => undefined);
  }, []);

  const pendientes = d ? d.porRevisar.length + d.borradores.length : 0;

  return (
    <>
      <PageHead title={`${saludo()}${nombre ? `, ${nombre}` : ''}`} subtitle="Esto es lo que tienes pendiente hoy." />
      <ErrorBox error={error} />
      {d && (
        <>
          <div className="stats">
            <Stat valor={d.totales.cursos} label="Cursos" />
            <Stat valor={d.totales.estudiantes} label="Estudiantes" detalle={`${d.totales.estudiantesPie} en PIE`} />
            <Stat valor={d.totales.evaluacionesAbiertas} label="Evaluaciones abiertas" />
            <Stat valor={d.porRevisar.reduce((s, x) => s + x.total, 0)} label="Respuestas por revisar" color={d.porRevisar.length ? 'amber' : undefined} />
          </div>

          <div className="grid-2">
            <section className="card">
              <h2>Tareas</h2>
              {pendientes === 0 && d.abiertas.length === 0 && <p className="muted">No tienes tareas pendientes.</p>}
              <ul className="tareas">
                {d.porRevisar.map((x) => (
                  <li key={`r${x.id}`}>
                    <span className="tarea-tipo t-revisar">Revisar</span>
                    <div>
                      <Link href={`/cursos/${x.cursoId}/evaluaciones/${x.id}?vista=resultados`}>{x.titulo}</Link>
                      <div className="muted small">
                        {x.curso} · {x.total} {x.total === 1 ? 'respuesta abierta' : 'respuestas abiertas'} por corregir
                      </div>
                    </div>
                  </li>
                ))}
                {d.abiertas.map((x) => (
                  <li key={`a${x.id}`}>
                    <span className="tarea-tipo t-abierta">Abierta</span>
                    <div>
                      <Link href={`/cursos/${x.cursoId}/evaluaciones/${x.id}?vista=resultados`}>{x.titulo}</Link>
                      <div className="muted small">
                        {x.curso} · {x.entregas} de {x.estudiantes} entregas
                      </div>
                      <Barra valor={x.entregas} total={x.estudiantes} />
                    </div>
                  </li>
                ))}
                {d.borradores.map((x) => (
                  <li key={`b${x.id}`}>
                    <span className="tarea-tipo t-borrador">Borrador</span>
                    <div>
                      <Link href={`/cursos/${x.cursoId}/evaluaciones/${x.id}`}>{x.titulo}</Link>
                      <div className="muted small">{x.curso} · sin publicar</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h2>Mis cursos</h2>
              {d.cursos.length === 0 && (
                <Empty>
                  Aún no tienes cursos. <Link href="/cursos">Crea el primero</Link>.
                </Empty>
              )}
              <div className="curso-lista">
                {d.cursos.map((c) => (
                  <Link key={c.id} href={`/cursos/${c.id}`} className="curso-fila">
                    <div>
                      <strong>{c.nombre}</strong> <span className="muted small">{c.anio}</span>
                      <div className="muted small">
                        {c.estudiantes} estudiantes · {c.estudiantesPie} PIE
                        {c.evaluacionesAbiertas > 0 && ` · ${c.evaluacionesAbiertas} evaluación abierta`}
                      </div>
                    </div>
                    <div className="curso-fila-cob">
                      <span className="small muted">
                        {c.oasCubiertos}/{c.oas} OA cubiertos
                      </span>
                      <Barra valor={c.oasCubiertos} total={c.oas} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
