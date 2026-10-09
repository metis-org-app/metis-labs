'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Curso, CursoOa, Planificacion } from '@/lib/types';
import { Empty, ErrorBox, Modal, PageHead } from '@/components/ui';

type Form = { id?: number; semanaInicio: string; titulo: string; actividades: string; adecuaciones: string; objetivoIds: number[] };

const fmt = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

export default function PlanificacionPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoId, setCursoId] = useState('');
  const [lista, setLista] = useState<Planificacion[]>([]);
  const [oasCurso, setOasCurso] = useState<CursoOa[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Curso[]>('/cursos')
      .then((c) => {
        setCursos(c);
        if (c[0]) setCursoId(String(c[0].id));
      })
      .catch((e) => setError(e.message));
  }, []);

  const cargar = useCallback(() => {
    if (!cursoId) return;
    api<Planificacion[]>(`/planificaciones?cursoId=${cursoId}`).then(setLista).catch((e) => setError(e.message));
    api<CursoOa[]>(`/cursos/${cursoId}/oas`).then(setOasCurso).catch(() => setOasCurso([]));
  }, [cursoId]);
  useEffect(cargar, [cargar]);

  const eliminar = async (p: Planificacion) => {
    if (!confirm(`¿Eliminar la planificación “${p.titulo}”?`)) return;
    await api(`/planificaciones/${p.id}`, { method: 'DELETE' });
    cargar();
  };

  return (
    <>
      <PageHead icon="🗓️" title="Planificación de Clases" subtitle="Organiza tus objetivos de aprendizaje por semana" />

      <div className="curso-picker">
        <label>
          📚 Selecciona el curso a planificar:
          <select value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.anio})
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        className="btn btn-green"
        disabled={!cursoId}
        onClick={() => setForm({ semanaInicio: new Date().toISOString().slice(0, 10), titulo: '', actividades: '', adecuaciones: '', objetivoIds: [] })}
      >
        + Nueva Planificación
      </button>
      <ErrorBox error={error} />

      <div className="timeline">
        {lista.length === 0 && <Empty>Este curso aún no tiene planificaciones.</Empty>}
        {lista.map((p) => (
          <div key={p.id} className="card plan-card">
            <div className="plan-week">Semana del {fmt(p.semanaInicio)}</div>
            <div className="plan-head">
              <h3>{p.titulo}</h3>
              <div className="row-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setForm({
                      id: p.id, semanaInicio: p.semanaInicio, titulo: p.titulo, actividades: p.actividades ?? '',
                      adecuaciones: p.adecuaciones ?? '', objetivoIds: p.objetivos.map((o) => o.id),
                    })
                  }
                >
                  Editar
                </button>
                <button className="icon-btn" title="Eliminar" onClick={() => eliminar(p)}>
                  🗑
                </button>
              </div>
            </div>
            <div className="plan-oas">
              {p.objetivos.map((o) => (
                <span key={o.id} className="tag" title={o.descripcion}>
                  {o.codigo} · {o.asignatura}
                </span>
              ))}
              {p.objetivos.length === 0 && <span className="muted small">Sin OA vinculados</span>}
            </div>
            {p.actividades && (
              <p>
                <strong>Actividades:</strong> {p.actividades}
              </p>
            )}
            {p.adecuaciones && (
              <p className="adecuacion">
                <strong>Adecuaciones TEA:</strong> {p.adecuaciones}
              </p>
            )}
          </div>
        ))}
      </div>

      {form && (
        <PlanModal
          cursoId={Number(cursoId)}
          form={form}
          oasCurso={oasCurso}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            cargar();
          }}
        />
      )}
    </>
  );
}

function PlanModal({ cursoId, form: inicial, oasCurso, onClose, onSaved }: { cursoId: number; form: Form; oasCurso: CursoOa[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(inicial);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) =>
    setForm((f) => ({ ...f, objetivoIds: f.objetivoIds.includes(id) ? f.objetivoIds.filter((x) => x !== id) : [...f.objetivoIds, id] }));

  const guardar = async () => {
    const body = { cursoId, ...form };
    try {
      if (form.id) await api(`/planificaciones/${form.id}`, { method: 'PUT', json: body });
      else await api('/planificaciones', { method: 'POST', json: body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={form.id ? 'Editar planificación' : 'Nueva planificación'} onClose={onClose} wide>
      <div className="form-grid form-2">
        <label>
          Semana (cualquier día; se ajusta al lunes)
          <input type="date" value={form.semanaInicio} onChange={(e) => setForm({ ...form, semanaInicio: e.target.value })} />
        </label>
        <label>
          Título
          <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Seres vivos y su entorno" />
        </label>
        <label className="span-2">
          Actividades
          <textarea rows={3} value={form.actividades} onChange={(e) => setForm({ ...form, actividades: e.target.value })} />
        </label>
        <label className="span-2">
          Adecuaciones para estudiantes TEA
          <textarea
            rows={2}
            value={form.adecuaciones}
            placeholder="Ej: anticipación con agenda visual, pictogramas, pausas activas…"
            onChange={(e) => setForm({ ...form, adecuaciones: e.target.value })}
          />
        </label>
      </div>
      <h4>OA del curso a trabajar</h4>
      <div className="check-list">
        {oasCurso.length === 0 && <p className="muted">Este curso no tiene OA asignados. Asígnalos en Mis Cursos o Currículum.</p>}
        {oasCurso.map((o) => (
          <label key={o.id} className="check-item">
            <input type="checkbox" checked={form.objetivoIds.includes(o.id)} onChange={() => toggle(o.id)} />
            <span>
              <strong>{o.codigo}</strong> <span className="tag">{o.asignatura}</span>
              <br />
              <span className="small">{o.descripcion}</span>
            </span>
          </label>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={guardar} disabled={!form.titulo.trim()}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}
