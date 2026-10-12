'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { CursoOa, Planificacion } from '@/lib/types';
import { confirmar } from '../confirm';
import { Empty, ErrorBox, Modal, OaTag } from '../ui';

type Form = { id?: number; semanaInicio: string; titulo: string; actividades: string; adecuaciones: string; objetivoIds: number[] };

const semana = (iso: string) => {
  const ini = new Date(`${iso}T12:00:00`);
  const fin = new Date(ini);
  fin.setDate(ini.getDate() + 4);
  const f = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  return `Semana del ${f(ini)} al ${f(fin)}`;
};

const hoy = () => new Date().toISOString().slice(0, 10);

export function PlanificacionCurso({ cursoId }: { cursoId: number }) {
  const [lista, setLista] = useState<Planificacion[] | null>(null);
  const [oasCurso, setOasCurso] = useState<CursoOa[]>([]);
  const [form, setForm] = useState<Form | null>(null);

  const cargar = useCallback(() => {
    api<Planificacion[]>(`/planificaciones?cursoId=${cursoId}`).then(setLista);
    api<CursoOa[]>(`/cursos/${cursoId}/oas`).then(setOasCurso);
  }, [cursoId]);
  useEffect(cargar, [cargar]);

  const eliminar = async (p: Planificacion) => {
    if (!(await confirmar(`¿Eliminar la planificación “${p.titulo}”?`))) return;
    await api(`/planificaciones/${p.id}`, { method: 'DELETE' });
    cargar();
  };

  return (
    <>
      <div className="section-head">
        <p className="muted">Organiza por semana qué OA vas a trabajar, con qué actividades y qué adecuaciones aplicarás.</p>
        <button className="btn btn-primary" onClick={() => setForm({ semanaInicio: hoy(), titulo: '', actividades: '', adecuaciones: '', objetivoIds: [] })}>
          + Planificar semana
        </button>
      </div>
      {lista?.length === 0 && <Empty>Aún no hay semanas planificadas.</Empty>}
      <div className="timeline">
        {lista?.map((p) => (
          <article key={p.id} className="card plan-card">
            <div className="plan-week">{semana(p.semanaInicio)}</div>
            <div className="plan-head">
              <h3>{p.titulo}</h3>
              <div className="row-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setForm({ id: p.id, semanaInicio: p.semanaInicio, titulo: p.titulo, actividades: p.actividades ?? '', adecuaciones: p.adecuaciones ?? '', objetivoIds: p.objetivos.map((o) => o.id) })
                  }
                >
                  Editar
                </button>
                <button className="icon-btn" title="Eliminar" onClick={() => eliminar(p)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="oa-tags">
              {p.objetivos.map((o) => (
                <OaTag key={o.id} oa={o} compacto />
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
                <strong>Adecuaciones:</strong> {p.adecuaciones}
              </p>
            )}
          </article>
        ))}
      </div>
      {form && (
        <PlanModal
          cursoId={cursoId}
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
  const toggle = (id: number) => setForm((f) => ({ ...f, objetivoIds: f.objetivoIds.includes(id) ? f.objetivoIds.filter((x) => x !== id) : [...f.objetivoIds, id] }));

  const guardar = async () => {
    try {
      const body = { cursoId, ...form };
      if (form.id) await api(`/planificaciones/${form.id}`, { method: 'PUT', json: body });
      else await api('/planificaciones', { method: 'POST', json: body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={form.id ? 'Editar planificación' : 'Planificar semana'} onClose={onClose} wide>
      <div className="form-grid form-2">
        <label>
          Semana
          <input type="date" value={form.semanaInicio} onChange={(e) => setForm({ ...form, semanaInicio: e.target.value })} />
          <span className="hint-inline">Se ajusta al lunes de esa semana.</span>
        </label>
        <label>
          Título de la unidad o clase
          <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej: Las plantas y sus partes" />
        </label>
        <label className="span-2">
          Actividades
          <textarea rows={3} value={form.actividades} onChange={(e) => setForm({ ...form, actividades: e.target.value })} />
        </label>
        <label className="span-2">
          Adecuaciones para estudiantes con NEE
          <textarea rows={2} value={form.adecuaciones} placeholder="Ej: anticipación con agenda visual, pictogramas, pausas activas…" onChange={(e) => setForm({ ...form, adecuaciones: e.target.value })} />
        </label>
      </div>
      <h4>OA del curso que se trabajan</h4>
      <div className="check-list compact">
        {oasCurso.length === 0 && <p className="muted">Este curso no tiene OA asignados.</p>}
        {oasCurso.map(({ oa }) => (
          <label key={oa.id} className="check-item">
            <input type="checkbox" checked={form.objetivoIds.includes(oa.id)} onChange={() => toggle(oa.id)} />
            <span>
              <OaTag oa={oa} compacto /> <span className="small">{oa.descripcion}</span>
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
