'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Asignatura, Curso, CursoOa, EstudianteBreve, Nivel, Oa, Panorama } from '@/lib/types';
import { DxBadge, Empty, ErrorBox, Modal, PageHead } from '@/components/ui';

type Tab = 'oas' | 'panorama' | 'nomina';

export default function CursosPage() {
  return (
    <Suspense>
      <Cursos />
    </Suspense>
  );
}

function Cursos() {
  const router = useRouter();
  const params = useSearchParams();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [tab, setTab] = useState<Tab>('oas');
  const seleccionado = Number(params.get('id')) || null;

  const cargar = useCallback(() => api<Curso[]>('/cursos').then(setCursos).catch((e) => setError(e.message)), []);

  useEffect(() => {
    cargar();
    api<Nivel[]>('/niveles').then(setNiveles).catch(() => undefined);
  }, [cargar]);

  const curso = cursos.find((c) => c.id === seleccionado) ?? null;
  const seleccionar = (id: number) => router.replace(`/cursos?id=${id}`, { scroll: false });

  const eliminar = async (c: Curso) => {
    if (!confirm(`¿Eliminar ${c.nombre} (${c.anio})? Se quitarán sus OA asignados y planificaciones.`)) return;
    try {
      await api(`/cursos/${c.id}`, { method: 'DELETE' });
      router.replace('/cursos');
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageHead
        icon="🏫"
        title="Mis Cursos"
        subtitle="Gestión de cursos escolares y OA asignados"
        action={
          <button className="btn btn-primary" onClick={() => setNuevo(true)}>
            + Nuevo Curso
          </button>
        }
      />
      <ErrorBox error={error} />

      <div className="curso-grid">
        {cursos.map((c) => (
          <button key={c.id} className={`curso-card ${c.id === seleccionado ? 'selected' : ''}`} onClick={() => seleccionar(c.id)}>
            <div className="curso-nombre">{c.nombre}</div>
            <div className="curso-anio">{c.anio}</div>
            <div className="curso-meta">
              {c.totalEstudiantes} {c.totalEstudiantes === 1 ? 'estudiante' : 'estudiantes'} · {c.totalOas} OA
            </div>
            {c.id === seleccionado && <div className="pill-ok">✓ Seleccionado</div>}
          </button>
        ))}
        {cursos.length === 0 && <Empty>Aún no tienes cursos. Crea el primero con “+ Nuevo Curso”.</Empty>}
      </div>

      {curso && (
        <section className="curso-detalle">
          <div className="detalle-head">
            <h2>
              {curso.nombre} <span className="muted">{curso.anio}</span>
            </h2>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => eliminar(curso)}>
              Eliminar curso
            </button>
          </div>
          <div className="tabs">
            {(
              [
                ['oas', 'OA asignados'],
                ['panorama', 'Panorama curso'],
                ['nomina', 'Nómina'],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'oas' && <OasCurso curso={curso} onChange={cargar} />}
          {tab === 'panorama' && <PanoramaCurso cursoId={curso.id} />}
          {tab === 'nomina' && <NominaCurso cursoId={curso.id} />}
        </section>
      )}
      {!curso && cursos.length > 0 && <Empty>Selecciona un curso para ver sus OA asignados y su panorama.</Empty>}

      {nuevo && (
        <NuevoCurso
          niveles={niveles}
          onClose={() => setNuevo(false)}
          onCreated={(id) => {
            setNuevo(false);
            setTab('oas');
            cargar().then(() => seleccionar(id));
          }}
        />
      )}
    </>
  );
}

function NuevoCurso({ niveles, onClose, onCreated }: { niveles: Nivel[]; onClose: () => void; onCreated: (id: number) => void }) {
  const [nivelId, setNivelId] = useState<number>(niveles[0]?.id ?? 1);
  const [letra, setLetra] = useState('A');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    try {
      const r = await api<{ id: number }>('/cursos', { method: 'POST', json: { nivelId, letra, anio } });
      onCreated(r.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Nuevo curso" onClose={onClose}>
      <div className="form-grid">
        <label>
          Nivel
          <select value={nivelId} onChange={(e) => setNivelId(Number(e.target.value))}>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Letra
          <input value={letra} maxLength={3} onChange={(e) => setLetra(e.target.value.toUpperCase())} />
        </label>
        <label>
          Año
          <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
        </label>
      </div>
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={guardar}>
          Crear curso
        </button>
      </div>
    </Modal>
  );
}

function OasCurso({ curso, onChange }: { curso: Curso; onChange: () => void }) {
  const [oas, setOas] = useState<CursoOa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asignar, setAsignar] = useState(false);
  const [excluir, setExcluir] = useState<CursoOa | null>(null);

  const cargar = useCallback(
    () => api<CursoOa[]>(`/cursos/${curso.id}/oas`).then(setOas).catch((e) => setError(e.message)),
    [curso.id],
  );
  useEffect(() => {
    setOas(null);
    cargar();
  }, [cargar]);

  const quitar = async (oa: CursoOa) => {
    if (!confirm(`¿Quitar ${oa.codigo} (${oa.asignatura}) de este curso?`)) return;
    await api(`/cursos/${curso.id}/oas/${oa.id}`, { method: 'DELETE' });
    cargar();
    onChange();
  };

  const porAsignatura = useMemo(() => {
    const m = new Map<string, CursoOa[]>();
    for (const oa of oas ?? []) m.set(oa.asignatura, [...(m.get(oa.asignatura) ?? []), oa]);
    return [...m.entries()];
  }, [oas]);

  return (
    <>
      <div className="section-head">
        <h3>OA Asignados a este Curso ({oas?.length ?? '…'})</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setAsignar(true)}>
          + Asignar OA
        </button>
      </div>
      <ErrorBox error={error} />
      {oas && oas.length === 0 && (
        <Empty>
          Este curso no tiene OA asignados aún.
          <br />
          Usa “+ Asignar OA” o ve a la sección <Link href="/curriculum">Currículum (OA)</Link> para asignar objetivos a este curso.
        </Empty>
      )}
      {porAsignatura.map(([asignatura, lista]) => (
        <div key={asignatura}>
          <h4 className="group-title">
            {asignatura} <span className="muted">({lista.length})</span>
          </h4>
          <div className="oa-grid">
            {lista.map((oa) => (
              <div key={oa.id} className="oa-card accent">
                <div className="oa-head">
                  <span className="oa-code">{oa.codigo}</span>
                  {oa.eje && <span className="oa-eje">{oa.eje}</span>}
                </div>
                <p className="oa-desc">{oa.descripcion}</p>
                <div className="oa-actions">
                  <button className="btn btn-slate btn-block" onClick={() => setExcluir(oa)}>
                    Excluir Estudiantes{oa.excluidos > 0 ? ` (${oa.excluidos})` : ''}
                  </button>
                  <button className="icon-btn" title="Quitar del curso" onClick={() => quitar(oa)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {asignar && (
        <AsignarOas
          curso={curso}
          yaAsignados={new Set((oas ?? []).map((o) => o.id))}
          onClose={() => setAsignar(false)}
          onDone={() => {
            setAsignar(false);
            cargar();
            onChange();
          }}
        />
      )}
      {excluir && (
        <ExcluirEstudiantes
          cursoId={curso.id}
          oa={excluir}
          onClose={() => setExcluir(null)}
          onDone={() => {
            setExcluir(null);
            cargar();
          }}
        />
      )}
    </>
  );
}

function AsignarOas({ curso, yaAsignados, onClose, onDone }: { curso: Curso; yaAsignados: Set<number>; onClose: () => void; onDone: () => void }) {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [asignaturaId, setAsignaturaId] = useState<string>('');
  const [oas, setOas] = useState<Oa[]>([]);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Asignatura[]>('/asignaturas').then(setAsignaturas).catch(() => undefined);
  }, []);
  useEffect(() => {
    const qs = new URLSearchParams({ nivelId: String(curso.nivelId) });
    if (asignaturaId) qs.set('asignaturaId', asignaturaId);
    api<Oa[]>(`/oas?${qs}`).then(setOas).catch((e) => setError(e.message));
  }, [curso.nivelId, asignaturaId]);

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
        <select value={asignaturaId} onChange={(e) => setAsignaturaId(e.target.value)}>
          <option value="">Todas las asignaturas</option>
          {asignaturas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setMarcados(new Set(disponibles.map((o) => o.id)))}>
          Marcar todos ({disponibles.length})
        </button>
      </div>
      <div className="check-list">
        {disponibles.length === 0 && <p className="muted">No hay OA disponibles de {curso.nivel} que no estén ya asignados.</p>}
        {disponibles.map((o) => (
          <label key={o.id} className="check-item">
            <input type="checkbox" checked={marcados.has(o.id)} onChange={() => toggle(o.id)} />
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
        <button className="btn btn-primary" disabled={marcados.size === 0} onClick={guardar}>
          Asignar {marcados.size} OA
        </button>
      </div>
    </Modal>
  );
}

function ExcluirEstudiantes({ cursoId, oa, onClose, onDone }: { cursoId: number; oa: CursoOa; onClose: () => void; onDone: () => void }) {
  const [lista, setLista] = useState<(EstudianteBreve & { excluido: boolean })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<(EstudianteBreve & { excluido: boolean })[]>(`/cursos/${cursoId}/oas/${oa.id}/exclusiones`)
      .then(setLista)
      .catch((e) => setError(e.message));
  }, [cursoId, oa.id]);

  const guardar = async () => {
    try {
      await api(`/cursos/${cursoId}/oas/${oa.id}/exclusiones`, {
        method: 'PUT',
        json: { estudianteIds: (lista ?? []).filter((e) => e.excluido).map((e) => e.id) },
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={`Excluir estudiantes · ${oa.codigo} ${oa.asignatura}`} onClose={onClose}>
      <p className="muted small">{oa.descripcion}</p>
      <p className="small">Marca a los estudiantes que no trabajarán este OA (adecuación curricular).</p>
      <div className="check-list">
        {lista?.length === 0 && <p className="muted">Este curso no tiene estudiantes.</p>}
        {lista?.map((e) => (
          <label key={e.id} className="check-item">
            <input
              type="checkbox"
              checked={e.excluido}
              onChange={() => setLista((l) => l!.map((x) => (x.id === e.id ? { ...x, excluido: !x.excluido } : x)))}
            />
            <span>
              {e.nombre} {e.apellido} <DxBadge dx={e.diagnostico} />
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

function PanoramaCurso({ cursoId }: { cursoId: number }) {
  const [p, setP] = useState<Panorama | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Panorama>(`/cursos/${cursoId}/panorama`).then(setP).catch((e) => setError(e.message));
  }, [cursoId]);

  if (error) return <ErrorBox error={error} />;
  if (!p) return <p className="muted">Cargando…</p>;
  const pie = p.permanentes.length + p.transitorios.length;

  return (
    <>
      <p className="muted">Información relevante del Programa de Integración Escolar (PIE) y del avance curricular del curso.</p>
      <div className="grid-panorama">
        <div className="card">
          <h3 className="pie-total">
            <span className="num">{pie}</span> Estudiantes PIE
          </h3>
          <ListaPie titulo="Estudiantes permanentes" lista={p.permanentes} />
          <ListaPie titulo="Estudiantes transitorios" lista={p.transitorios} />
          <p className="muted small">{p.sinPie.length} estudiantes sin PIE · {p.totalEstudiantes} en total</p>
        </div>
        <div>
          <div className="stats stats-4">
            <div className="stat stat-blue">
              <div className="stat-value">{p.totalOas}</div>
              <div className="stat-label">OA asignados</div>
            </div>
            <div className="stat stat-green">
              <div className="stat-value">{p.planificaciones}</div>
              <div className="stat-label">Planificaciones</div>
            </div>
            <div className="stat stat-amber">
              <div className="stat-value">{p.exclusiones}</div>
              <div className="stat-label">Adecuaciones (exclusiones)</div>
            </div>
            <div className="stat stat-red">
              <div className="stat-value">{p.totalEstudiantes}</div>
              <div className="stat-label">Estudiantes</div>
            </div>
          </div>
          <div className="card">
            <h3>OA por asignatura</h3>
            {p.oasPorAsignatura.length === 0 && <p className="muted">Sin OA asignados.</p>}
            {p.oasPorAsignatura.map((x) => (
              <div key={x.asignatura} className="bar-row">
                <span className="bar-label">{x.asignatura}</span>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${(x.total / Math.max(p.totalOas, 1)) * 100}%` }} />
                </div>
                <strong>{x.total}</strong>
              </div>
            ))}
            <h3 style={{ marginTop: 20 }}>Tipos de diagnóstico</h3>
            <div className="dx-legend">
              {p.diagnosticos.map((d) => (
                <span key={d.diagnostico}>
                  <DxBadge dx={d.diagnostico} /> {d.total}
                </span>
              ))}
              {p.diagnosticos.length === 0 && <span className="muted">Sin diagnósticos registrados.</span>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ListaPie({ titulo, lista }: { titulo: string; lista: EstudianteBreve[] }) {
  return (
    <div className="pie-list">
      <h4>
        <span className="num">{lista.length}</span> {titulo}
      </h4>
      {lista.map((e) => (
        <div key={e.id} className="pie-row">
          <span>
            {e.nombre} {e.apellido}
          </span>
          <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
        </div>
      ))}
    </div>
  );
}

function NominaCurso({ cursoId }: { cursoId: number }) {
  const [lista, setLista] = useState<EstudianteBreve[] | null>(null);
  useEffect(() => {
    api<EstudianteBreve[]>(`/estudiantes?cursoId=${cursoId}`).then(setLista).catch(() => setLista([]));
  }, [cursoId]);

  if (!lista) return <p className="muted">Cargando…</p>;
  return (
    <div className="card">
      {lista.length === 0 ? (
        <p className="muted">
          Sin estudiantes. Agrégalos en <Link href="/estudiantes">Estudiantes</Link>.
        </p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>PIE</th>
              <th>Diagnóstico</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.apellido}, {e.nombre}
                </td>
                <td>{e.tipoPie === 'Ninguno' ? '—' : e.tipoPie}</td>
                <td>
                  <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
