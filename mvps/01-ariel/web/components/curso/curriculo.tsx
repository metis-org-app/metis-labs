'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ESTADO_OA } from '@/lib/format';
import type { Asignatura, CursoDetalle, CursoOa, EstadoOa, EstudianteBreve, Nivel, Oa } from '@/lib/types';
import { confirmar } from '../confirm';
import { DxBadge, Empty, ErrorBox, LogroBadge, Modal, OaTag } from '../ui';

export function CurriculoCurso({ curso, onChange }: { curso: CursoDetalle; onChange: () => void }) {
  const [oas, setOas] = useState<CursoOa[] | null>(null);
  const [asignar, setAsignar] = useState(false);
  const [adecuar, setAdecuar] = useState<Oa | null>(null);
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(() => api<CursoOa[]>(`/cursos/${curso.id}/oas`).then(setOas), [curso.id]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    const m = new Map<string, CursoOa[]>();
    for (const x of oas ?? []) {
      if (filtro && x.estado !== filtro) continue;
      m.set(x.oa.asignatura, [...(m.get(x.oa.asignatura) ?? []), x]);
    }
    return [...m.entries()];
  }, [oas, filtro]);

  const cambiarEstado = async (oaId: number, estado: EstadoOa) => {
    setOas((l) => l?.map((x) => (x.oa.id === oaId ? { ...x, estado } : x)) ?? null);
    await api(`/cursos/${curso.id}/oas/${oaId}/estado`, { method: 'PUT', json: { estado } });
  };

  const quitar = async (x: CursoOa) => {
    if (!(await confirmar(`¿Quitar ${x.oa.codigoOficial} del currículum de ${curso.nombre}? Se borran también sus adecuaciones.`, 'Quitar'))) return;
    await api(`/cursos/${curso.id}/oas/${x.oa.id}`, { method: 'DELETE' });
    cargar();
    onChange();
  };

  return (
    <>
      <div className="section-head">
        <p className="muted">
          OA que se trabajan en {curso.nombre}. Marca su avance, revisa el logro según las evaluaciones y define adecuaciones por estudiante.
        </p>
        <div className="head-actions">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_OA).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setAsignar(true)}>
            + Asignar OA
          </button>
        </div>
      </div>

      {oas?.length === 0 && <Empty>Este curso aún no tiene OA. Usa “Asignar OA” para elegirlos desde el currículum nacional.</Empty>}

      {grupos.map(([asignatura, lista]) => (
        <section key={asignatura} className="card oa-grupo">
          <h3>
            {asignatura}{' '}
            <span className="muted small">
              {lista.filter((x) => x.estado === 'Cubierto').length} de {lista.length} cubiertos
            </span>
          </h3>
          <table className="table oa-table">
            <thead>
              <tr>
                <th>Objetivo de aprendizaje</th>
                <th>Estado</th>
                <th>Uso</th>
                <th>Logro</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.oa.id}>
                  <td className="oa-cell">
                    <OaTag oa={x.oa} />
                    {x.oa.eje && <span className="muted small"> · {x.oa.eje}</span>}
                    <p className="oa-desc">{x.oa.descripcion}</p>
                  </td>
                  <td>
                    <select className={`estado-select es-${x.estado.toLowerCase()}`} value={x.estado} onChange={(e) => cambiarEstado(x.oa.id, e.target.value as EstadoOa)} aria-label={`Estado de ${x.oa.codigoOficial}`}>
                      {Object.entries(ESTADO_OA).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="small nowrap">
                    <div>{x.planificaciones ? `${x.planificaciones} sem. planificada${x.planificaciones > 1 ? 's' : ''}` : <span className="muted">Sin planificar</span>}</div>
                    <div>{x.evaluaciones ? `${x.evaluaciones} evaluación${x.evaluaciones > 1 ? 'es' : ''}` : <span className="muted">Sin evaluar</span>}</div>
                  </td>
                  <td>{x.logro ? <LogroBadge {...x.logro} /> : <span className="muted small">—</span>}</td>
                  <td className="row-actions">
                    <button className="btn btn-ghost btn-sm" onClick={() => setAdecuar(x.oa)} title="Estudiantes que no trabajan este OA">
                      Adecuaciones{x.excluidos > 0 && ` (${x.excluidos})`}
                    </button>
                    <button className="icon-btn" title="Quitar del curso" onClick={() => quitar(x)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {asignar && (
        <AsignarOas
          curso={curso}
          yaAsignados={new Set((oas ?? []).map((x) => x.oa.id))}
          onClose={() => setAsignar(false)}
          onDone={() => {
            setAsignar(false);
            cargar();
            onChange();
          }}
        />
      )}
      {adecuar && (
        <Adecuaciones
          cursoId={curso.id}
          oa={adecuar}
          onClose={() => setAdecuar(null)}
          onDone={() => {
            setAdecuar(null);
            cargar();
          }}
        />
      )}
    </>
  );
}

function AsignarOas({ curso, yaAsignados, onClose, onDone }: { curso: CursoDetalle; yaAsignados: Set<number>; onClose: () => void; onDone: () => void }) {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [asignaturaId, setAsignaturaId] = useState('');
  const [nivelId, setNivelId] = useState(String(curso.nivelId));
  const [oas, setOas] = useState<Oa[]>([]);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Nivel[]>('/niveles').then(setNiveles);
  }, []);
  useEffect(() => {
    api<Asignatura[]>(`/asignaturas?nivelId=${nivelId}`).then(setAsignaturas);
  }, [nivelId]);
  useEffect(() => {
    const qs = new URLSearchParams({ nivelId });
    if (asignaturaId) qs.set('asignaturaId', asignaturaId);
    api<Oa[]>(`/oas?${qs}`).then(setOas).catch((e) => setError(e.message));
  }, [nivelId, asignaturaId]);

  const disponibles = oas.filter((o) => !yaAsignados.has(o.id));
  const toggle = (id: number) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const guardar = async () => {
    try {
      await api(`/cursos/${curso.id}/oas`, { method: 'POST', json: { objetivoIds: [...marcados] } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={`Asignar OA a ${curso.nombre}`} onClose={onClose} wide>
      <div className="toolbar">
        <select value={nivelId} onChange={(e) => setNivelId(e.target.value)} aria-label="Nivel">
          {niveles.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nombre}
              {n.id === curso.nivelId ? ' (nivel del curso)' : ''}
            </option>
          ))}
        </select>
        <select value={asignaturaId} onChange={(e) => setAsignaturaId(e.target.value)} aria-label="Asignatura">
          <option value="">Todas las asignaturas</option>
          {asignaturas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setMarcados(new Set(disponibles.map((o) => o.id)))} disabled={!disponibles.length}>
          Marcar todos ({disponibles.length})
        </button>
      </div>
      {Number(nivelId) !== curso.nivelId && (
        <p className="alert alert-info small">Estás eligiendo OA de otro nivel. Úsalo para nivelación o trabajo multinivel.</p>
      )}
      <div className="check-list">
        {disponibles.length === 0 && <p className="muted">No quedan OA de este nivel por asignar.</p>}
        {disponibles.map((o) => (
          <label key={o.id} className="check-item">
            <input type="checkbox" checked={marcados.has(o.id)} onChange={() => toggle(o.id)} />
            <span>
              <OaTag oa={o} />
              <br />
              <span className="small oa-desc">{o.descripcion}</span>
            </span>
          </label>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={marcados.size === 0} onClick={guardar}>
          Asignar {marcados.size || ''} OA
        </button>
      </div>
    </Modal>
  );
}

function Adecuaciones({ cursoId, oa, onClose, onDone }: { cursoId: number; oa: Oa; onClose: () => void; onDone: () => void }) {
  const [lista, setLista] = useState<(EstudianteBreve & { excluido: boolean })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<(EstudianteBreve & { excluido: boolean })[]>(`/cursos/${cursoId}/oas/${oa.id}/exclusiones`).then(setLista).catch((e) => setError(e.message));
  }, [cursoId, oa.id]);

  const guardar = async () => {
    try {
      await api(`/cursos/${cursoId}/oas/${oa.id}/exclusiones`, { method: 'PUT', json: { estudianteIds: (lista ?? []).filter((e) => e.excluido).map((e) => e.id) } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={`Adecuaciones · ${oa.codigoOficial}`} onClose={onClose}>
      <p className="small oa-desc">{oa.descripcion}</p>
      <p className="muted small">
        Marca a los estudiantes que <strong>no trabajarán este OA</strong> por ahora. Sus evaluaciones omitirán las preguntas de este OA y su nota se
        calculará sobre el resto.
      </p>
      <div className="check-list">
        {lista?.length === 0 && <p className="muted">Este curso no tiene estudiantes.</p>}
        {lista?.map((e) => (
          <label key={e.id} className="check-item">
            <input type="checkbox" checked={e.excluido} onChange={() => setLista((l) => l!.map((x) => (x.id === e.id ? { ...x, excluido: !x.excluido } : x)))} />
            <span>
              {e.nombre} {e.apellido} <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
            </span>
          </label>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={guardar} disabled={!lista}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}
