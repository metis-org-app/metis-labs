'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { edad } from '@/lib/format';
import type { Estudiante } from '@/lib/types';
import { EstudianteForm } from '../estudiante-form';
import { DxBadge, Empty } from '../ui';

export function EstudiantesCurso({ cursoId, onChange }: { cursoId: number; onChange: () => void }) {
  const [lista, setLista] = useState<Estudiante[] | null>(null);
  const [editando, setEditando] = useState<Estudiante | null | 'nuevo'>(null);

  const cargar = useCallback(() => api<Estudiante[]>(`/estudiantes?cursoId=${cursoId}`).then(setLista), [cursoId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <div className="section-head">
        <p className="muted">Nómina del curso con su participación en PIE, diagnóstico y apoyos.</p>
        <button className="btn btn-primary" onClick={() => setEditando('nuevo')}>
          + Agregar estudiante
        </button>
      </div>
      {lista?.length === 0 && <Empty>Este curso aún no tiene estudiantes.</Empty>}
      {lista && lista.length > 0 && (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Edad</th>
                <th>PIE</th>
                <th>Diagnóstico</th>
                <th>Apoyos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/estudiantes/${e.id}`}>
                      {e.apellido}, {e.nombre}
                    </Link>
                    <div className="muted small mono">{e.rut}</div>
                  </td>
                  <td>{edad(e.fechaNacimiento) ?? '—'}</td>
                  <td>{e.tipoPie === 'Ninguno' ? <span className="muted">—</span> : e.tipoPie}</td>
                  <td>
                    <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
                  </td>
                  <td className="small apoyos-cell">
                    {e.apoyos ?? <span className="muted">—</span>}
                    {!!e.exclusiones && <div className="muted">{e.exclusiones} OA con adecuación</div>}
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditando(e)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editando && (
        <EstudianteForm
          estudiante={editando === 'nuevo' ? null : editando}
          cursoId={cursoId}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            cargar();
            onChange();
          }}
        />
      )}
    </>
  );
}
