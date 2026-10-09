'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Dashboard } from '@/lib/types';
import { DxBadge, ErrorBox, PageHead } from '@/components/ui';

export default function DashboardPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Dashboard>('/dashboard').then(setD).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHead icon="📊" title="Dashboard" subtitle="Resumen de tus cursos, estudiantes y currículum" />
      <ErrorBox error={error} />
      {d && (
        <>
          <div className="stats">
            <Stat valor={d.cursos} label="Cursos" color="blue" />
            <Stat valor={d.estudiantes} label="Estudiantes" color="green" />
            <Stat valor={d.oasAsignados} label="OA asignados" color="amber" />
            <Stat valor={d.planificaciones} label="Planificaciones" color="red" />
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>Mis cursos</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Curso</th>
                    <th>Estudiantes</th>
                    <th>OA</th>
                    <th>Planificaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {d.resumenCursos.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/cursos?id=${c.id}`}>{c.nombre}</Link> <span className="muted">{c.anio}</span>
                      </td>
                      <td>{c.estudiantes}</td>
                      <td>{c.oas}</td>
                      <td>{c.planificaciones}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Estudiantes por diagnóstico</h2>
              {d.diagnosticos.length === 0 && <p className="muted">Aún no hay diagnósticos registrados.</p>}
              {d.diagnosticos.map((x) => (
                <div key={x.diagnostico} className="bar-row">
                  <DxBadge dx={x.diagnostico} />
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${(x.total / Math.max(d.estudiantes, 1)) * 100}%` }} />
                  </div>
                  <strong>{x.total}</strong>
                </div>
              ))}
              <p className="muted small" style={{ marginTop: 16 }}>
                {d.oasCurriculum} OA disponibles en el currículum cargado.
              </p>
            </div>
          </div>

          <div className="card ia-teaser">
            <div>
              <h2>📝 Evaluaciones con Evalia</h2>
              <p className="muted">
                El núcleo de Metis: evaluaciones por curso y OA con Evalia integrada, que guía al estudiante mientras responde sin darle
                la respuesta. Esta demo cubre la gestión curricular sobre la que se van a construir.
              </p>
            </div>
            <Link className="btn btn-ghost" href="/evaluaciones">
              Ver propuesta
            </Link>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ valor, label, color }: { valor: number; label: string; color: string }) {
  return (
    <div className={`stat stat-${color}`}>
      <div className="stat-value">{valor}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
