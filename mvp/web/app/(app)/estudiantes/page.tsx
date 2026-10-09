'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { rutValido } from '@/lib/rut';
import type { Curso, Estudiante, TipoPie } from '@/lib/types';
import { DxBadge, Empty, ErrorBox, PageHead } from '@/components/ui';

const DIAGNOSTICOS = ['TEA', 'TDA-H', 'TL', 'DI', 'FIL', 'Otro'];

type Form = {
  rut: string;
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  cursoId: string;
  diagnostico: string;
  nivelTea: string;
  tipoPie: TipoPie;
  observaciones: string;
};

const VACIO: Form = {
  rut: '', nombre: '', apellido: '', fechaNacimiento: '', cursoId: '',
  diagnostico: '', nivelTea: '', tipoPie: 'Ninguno', observaciones: '',
};

export default function EstudiantesPage() {
  const [lista, setLista] = useState<Estudiante[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [filtroCurso, setFiltroCurso] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    const qs = new URLSearchParams();
    if (filtroCurso) qs.set('cursoId', filtroCurso);
    if (q.trim()) qs.set('q', q.trim());
    return api<Estudiante[]>(`/estudiantes?${qs}`).then(setLista).catch((e) => setError(e.message));
  }, [filtroCurso, q]);

  useEffect(() => {
    api<Curso[]>('/cursos').then(setCursos).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const nuevo = () => {
    setEditId(null);
    setForm({ ...VACIO, cursoId: filtroCurso });
    setError(null);
  };
  const editar = (e: Estudiante) => {
    setEditId(e.id);
    setError(null);
    setForm({
      rut: e.rut, nombre: e.nombre, apellido: e.apellido, fechaNacimiento: e.fechaNacimiento ?? '',
      cursoId: e.cursoId ? String(e.cursoId) : '', diagnostico: e.diagnostico ?? '',
      nivelTea: e.nivelTea ? String(e.nivelTea) : '', tipoPie: e.tipoPie, observaciones: e.observaciones ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    if (!rutValido(form.rut)) {
      setError('RUT inválido: revisa el dígito verificador');
      return;
    }
    const body = {
      rut: form.rut,
      nombre: form.nombre,
      apellido: form.apellido,
      fechaNacimiento: form.fechaNacimiento || null,
      cursoId: form.cursoId ? Number(form.cursoId) : null,
      diagnostico: form.diagnostico || null,
      nivelTea: form.diagnostico === 'TEA' && form.nivelTea ? Number(form.nivelTea) : null,
      tipoPie: form.tipoPie,
      observaciones: form.observaciones || null,
    };
    try {
      if (editId) await api(`/estudiantes/${editId}`, { method: 'PUT', json: body });
      else await api('/estudiantes', { method: 'POST', json: body });
      setForm(null);
      setEditId(null);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const eliminar = async (e: Estudiante) => {
    if (!confirm(`¿Eliminar a ${e.nombre} ${e.apellido}?`)) return;
    await api(`/estudiantes/${e.id}`, { method: 'DELETE' });
    cargar();
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <>
      <PageHead
        icon="👥"
        title="Estudiantes"
        subtitle="Registro de estudiantes, diagnóstico y participación en PIE"
        action={
          !form && (
            <button className="btn btn-primary" onClick={nuevo}>
              + Nuevo Estudiante
            </button>
          )
        }
      />

      {form && (
        <form className="card" onSubmit={guardar}>
          <h2>{editId ? 'Editar Estudiante' : 'Nuevo Estudiante'}</h2>
          <div className="form-grid form-2">
            <label>
              RUT *
              <input value={form.rut} onChange={(e) => set('rut', e.target.value)} placeholder="12.345.678-5" required />
            </label>
            <label>
              Nombre *
              <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} required />
            </label>
            <label>
              Apellido *
              <input value={form.apellido} onChange={(e) => set('apellido', e.target.value)} required />
            </label>
            <label>
              Fecha de Nacimiento
              <input type="date" value={form.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} />
            </label>
            <label>
              Curso
              <select value={form.cursoId} onChange={(e) => set('cursoId', e.target.value)}>
                <option value="">Sin curso</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.anio})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Diagnóstico
              <select value={form.diagnostico} onChange={(e) => set('diagnostico', e.target.value)}>
                <option value="">Sin diagnóstico</option>
                {DIAGNOSTICOS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Nivel TEA
              <select value={form.nivelTea} onChange={(e) => set('nivelTea', e.target.value)} disabled={form.diagnostico !== 'TEA'}>
                <option value="">Selecciona nivel</option>
                <option value="1">Nivel 1 · necesita apoyo</option>
                <option value="2">Nivel 2 · necesita apoyo sustancial</option>
                <option value="3">Nivel 3 · necesita apoyo muy sustancial</option>
              </select>
            </label>
            <label>
              Programa de Integración (PIE)
              <select value={form.tipoPie} onChange={(e) => set('tipoPie', e.target.value as TipoPie)}>
                <option value="Ninguno">No participa</option>
                <option value="Permanente">Permanente</option>
                <option value="Transitorio">Transitorio</option>
              </select>
            </label>
            <label className="span-2">
              Observaciones
              <textarea rows={2} value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
            </label>
          </div>
          <ErrorBox error={error} />
          <div className="form-actions">
            <button className="btn btn-primary">Guardar Estudiante</button>
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="toolbar">
          <select value={filtroCurso} onChange={(e) => setFiltroCurso(e.target.value)}>
            <option value="">Todos los cursos</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.anio})
              </option>
            ))}
          </select>
          <input placeholder="Buscar por nombre o RUT…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!form && <ErrorBox error={error} />}
        {lista.length === 0 ? (
          <Empty>No hay estudiantes con esos filtros.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>RUT</th>
                <th>Estudiante</th>
                <th>Curso</th>
                <th>PIE</th>
                <th>Diagnóstico</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.rut}</td>
                  <td>
                    {e.apellido}, {e.nombre}
                  </td>
                  <td>{e.curso ?? <span className="muted">—</span>}</td>
                  <td>{e.tipoPie === 'Ninguno' ? <span className="muted">—</span> : e.tipoPie}</td>
                  <td>
                    <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => editar(e)}>
                      Editar
                    </button>
                    <button className="icon-btn" title="Eliminar" onClick={() => eliminar(e)}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
