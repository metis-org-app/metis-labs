'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { edad, fecha } from '@/lib/format';
import type { Estudiante, FichaEstudiante } from '@/lib/types';
import { confirmar } from '@/components/confirm';
import { EstudianteForm } from '@/components/estudiante-form';
import { DxBadge, ErrorBox, LogroBadge, NotaBadge, OaTag, PageHead } from '@/components/ui';

export default function FichaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [f, setF] = useState<FichaEstudiante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  const cargar = useCallback(() => api<FichaEstudiante>(`/estudiantes/${id}`).then(setF).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const eliminar = async () => {
    if (!f || !(await confirmar(`¿Eliminar a ${f.nombre} ${f.apellido}? Se borran también sus entregas.`))) return;
    await api(`/estudiantes/${f.id}`, { method: 'DELETE' });
    router.replace('/estudiantes');
  };

  if (error) return <ErrorBox error={error} />;
  if (!f) return <p className="muted">Cargando…</p>;

  return (
    <>
      <PageHead
        migas={[['Estudiantes', '/estudiantes'], [`${f.nombre} ${f.apellido}`]]}
        title={
          <>
            {f.nombre} {f.apellido} <DxBadge dx={f.diagnostico} nivel={f.nivelTea} />
          </>
        }
        subtitle={
          <>
            RUT {f.rut} · {f.curso ? <Link href={`/cursos/${f.cursoId}`}>{f.curso}</Link> : 'Sin curso'}
            {edad(f.fechaNacimiento) != null && ` · ${edad(f.fechaNacimiento)} años`}
          </>
        }
        action={
          <>
            <button className="btn btn-ghost" onClick={() => setEditando(true)}>
              Editar ficha
            </button>
            <button className="btn btn-danger-ghost" onClick={eliminar}>
              Eliminar
            </button>
          </>
        }
      />

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <h2>Necesidades educativas y apoyos</h2>
            <dl className="ficha">
              <dt>Programa de Integración</dt>
              <dd>{f.tipoPie === 'Ninguno' ? 'No participa' : `PIE ${f.tipoPie.toLowerCase()}`}</dd>
              <dt>Diagnóstico</dt>
              <dd>{f.diagnostico ? `${f.diagnostico}${f.nivelTea ? `, nivel ${f.nivelTea} de apoyo` : ''}` : 'Sin diagnóstico'}</dd>
              <dt>Apoyos</dt>
              <dd>{f.apoyos ?? <span className="muted">Sin apoyos registrados</span>}</dd>
              {f.observaciones && (
                <>
                  <dt>Observaciones</dt>
                  <dd>{f.observaciones}</dd>
                </>
              )}
            </dl>
          </section>
          <section className="card">
            <h2>Adecuaciones curriculares</h2>
            {f.exclusiones.length === 0 ? (
              <p className="muted">Trabaja todos los OA de su curso.</p>
            ) : (
              <>
                <p className="muted small">Por ahora no trabaja estos OA. Sus evaluaciones omiten las preguntas asociadas.</p>
                {f.exclusiones.map((o) => (
                  <div key={o.id} className="oa-linea">
                    <OaTag oa={o} />
                    <span className="small">{o.descripcion}</span>
                  </div>
                ))}
              </>
            )}
          </section>
          <section className="card">
            <h2>Apoderado</h2>
            {f.nombreApoderado || f.telefonoApoderado || f.emailApoderado ? (
              <dl className="ficha">
                <dt>Nombre</dt>
                <dd>{f.nombreApoderado ?? '—'}</dd>
                <dt>Teléfono</dt>
                <dd>{f.telefonoApoderado ?? '—'}</dd>
                <dt>Email</dt>
                <dd>{f.emailApoderado ?? '—'}</dd>
              </dl>
            ) : (
              <p className="muted">Sin datos del apoderado.</p>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="card table-card">
            <h2>Evaluaciones</h2>
            {f.evaluaciones.length === 0 ? (
              <p className="muted">Aún no rinde evaluaciones.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Evaluación</th>
                    <th>Entregada</th>
                    <th>Nota</th>
                    <th>Ayudas de Metis</th>
                  </tr>
                </thead>
                <tbody>
                  {f.evaluaciones.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/cursos/${e.cursoId}/evaluaciones/${e.evaluacionId}?vista=resultados`}>{e.titulo}</Link>
                        <div className="muted small">
                          {e.asignatura} · {e.tipo}
                        </div>
                      </td>
                      <td className="small">{e.entregadoEn ? fecha(e.entregadoEn) : <span className="muted">En curso</span>}</td>
                      <td>
                        <NotaBadge nota={e.nota} pendiente={e.revisionPendiente} />
                      </td>
                      <td>{e.ayudas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card">
            <h2>Logro por OA</h2>
            {f.logro.length === 0 ? (
              <p className="muted">Se calcula con sus evaluaciones corregidas.</p>
            ) : (
              f.logro.map((l) => (
                <div key={l.oa.id} className="logro-oa">
                  <OaTag oa={l.oa} compacto />
                  <span className="small">{l.oa.descripcion}</span>
                  <LogroBadge porcentaje={l.porcentaje} nivel={l.nivel} />
                </div>
              ))
            )}
          </section>
        </div>
      </div>
      {editando && (
        <EstudianteForm
          estudiante={f as unknown as Estudiante}
          onClose={() => setEditando(false)}
          onSaved={() => {
            setEditando(false);
            cargar();
          }}
        />
      )}
    </>
  );
}
