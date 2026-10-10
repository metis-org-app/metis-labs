'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { edad } from '@/lib/format';
import type { Curso, Estudiante } from '@/lib/types';
import { EstudianteForm } from '@/components/estudiante-form';
import { DxBadge, Empty, PageHead } from '@/components/ui';

export default function EstudiantesPage() {
  const [lista, setLista] = useState<Estudiante[] | null>(null);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [filtro, setFiltro] = useState({ cursoId: '', pie: '', q: '' });
  const [editando, setEditando] = useState<Estudiante | null | 'nuevo'>(null);

  const cargar = useCallback(() => {
    const qs = new URLSearchParams();
    Object.entries(filtro).forEach(([k, v]) => v && qs.set(k, v));
    return api<Estudiante[]>(`/estudiantes?${qs}`).then(setLista);
  }, [filtro]);

  useEffect(() => {
    api<Curso[]>('/cursos').then(setCursos);
  }, []);
  useEffect(() => {
    const t = setTimeout(cargar, 200);
    return () => clearTimeout(t);
  }, [cargar]);

  return (
    <>
      <PageHead
        title="Estudiantes"
        subtitle="Todos los estudiantes de tus cursos, con su participación en PIE, diagnóstico y apoyos."
        action={
          <button className="btn btn-primary" onClick={() => setEditando('nuevo')}>
            + Nuevo estudiante
          </button>
        }
      />
      <div className="toolbar">
        <select value={filtro.cursoId} onChange={(e) => setFiltro({ ...filtro, cursoId: e.target.value })} aria-label="Curso">
          <option value="">Todos los cursos</option>
          {cursos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.anio})
            </option>
          ))}
        </select>
        <select value={filtro.pie} onChange={(e) => setFiltro({ ...filtro, pie: e.target.value })} aria-label="PIE">
          <option value="">Todos</option>
          <option value="si">Solo estudiantes PIE</option>
        </select>
        <input placeholder="Buscar por nombre o RUT…" value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} />
      </div>
      {lista?.length === 0 && <Empty>No hay estudiantes con esos filtros.</Empty>}
      {lista && lista.length > 0 && (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Curso</th>
                <th>Edad</th>
                <th>PIE</th>
                <th>Diagnóstico</th>
                <th>Apoderado</th>
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
                  <td>{e.cursoId ? <Link href={`/cursos/${e.cursoId}`}>{e.curso}</Link> : <span className="muted">Sin curso</span>}</td>
                  <td>{edad(e.fechaNacimiento) ?? '—'}</td>
                  <td>{e.tipoPie === 'Ninguno' ? <span className="muted">—</span> : e.tipoPie}</td>
                  <td>
                    <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
                  </td>
                  <td className="small">
                    {e.nombreApoderado ?? <span className="muted">—</span>}
                    {e.telefonoApoderado && <div className="muted">{e.telefonoApoderado}</div>}
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
          cursoId={filtro.cursoId ? Number(filtro.cursoId) : undefined}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </>
  );
}
