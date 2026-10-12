'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { avisarCursos } from '@/lib/eventos';
import type { Asignatura, Curso, Nivel } from '@/lib/types';
import { Barra, Empty, ErrorBox, Modal, PageHead } from '@/components/ui';

export default function CursosPage() {
  const router = useRouter();
  const [cursos, setCursos] = useState<Curso[] | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => api<Curso[]>('/cursos').then(setCursos).catch((e) => setError(e.message)), []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <PageHead
        title="Mis cursos"
        subtitle="Cada curso reúne a sus estudiantes, su currículum, materiales, planificación y evaluaciones."
        action={
          <button className="btn btn-primary" onClick={() => setNuevo(true)}>
            + Nuevo curso
          </button>
        }
      />
      <ErrorBox error={error} />
      {cursos?.length === 0 && <Empty>Aún no tienes cursos. Crea el primero con “Nuevo curso”.</Empty>}
      <div className="curso-grid">
        {cursos?.map((c) => (
          <Link key={c.id} href={`/cursos/${c.id}`} className="curso-card">
            <div className="curso-card-head">
              <div className="curso-nombre">{c.nombre}</div>
              <span className="muted">{c.anio}</span>
            </div>
            <div className="curso-asignaturas">
              {c.asignaturas.length ? c.asignaturas.join(' · ') : <span className="muted">Sin OA asignados</span>}
            </div>
            <dl className="curso-datos">
              <div>
                <dt>Estudiantes</dt>
                <dd>{c.totalEstudiantes}</dd>
              </div>
              <div>
                <dt>PIE</dt>
                <dd>{c.estudiantesPie}</dd>
              </div>
              <div>
                <dt>Eval. abiertas</dt>
                <dd>{c.evaluacionesAbiertas}</dd>
              </div>
            </dl>
            <div className="small muted">
              Cobertura: {c.oasCubiertos} de {c.totalOas} OA
            </div>
            <Barra valor={c.oasCubiertos} total={c.totalOas} />
          </Link>
        ))}
      </div>
      {nuevo && (
        <NuevoCurso
          onClose={() => setNuevo(false)}
          onCreated={(id) => {
            avisarCursos();
            router.push(`/cursos/${id}?tab=curriculo`);
          }}
        />
      )}
    </>
  );
}

function NuevoCurso({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [nivelId, setNivelId] = useState<number>(0);
  const [letra, setLetra] = useState('A');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Nivel[]>('/niveles').then((n) => {
      setNiveles(n);
      setNivelId(n[0]?.id ?? 0);
    });
  }, []);
  // Asignaturas con OA en el nivel. Por defecto se marcan las del plan común (formación general).
  useEffect(() => {
    if (!nivelId) return;
    api<Asignatura[]>(`/asignaturas?nivelId=${nivelId}`).then((l) => {
      setAsignaturas(l);
      setElegidas(new Set(l.filter((a) => (a.area ?? 'Formación general') === 'Formación general').map((a) => a.id)));
    });
  }, [nivelId]);
  const areas = useMemo(() => {
    const m = new Map<string, Asignatura[]>();
    for (const a of asignaturas) m.set(a.area ?? 'Otras', [...(m.get(a.area ?? 'Otras') ?? []), a]);
    return [...m.entries()];
  }, [asignaturas]);
  const toggle = (id: number) =>
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const totalOas = asignaturas.filter((a) => elegidas.has(a.id)).reduce((t, a) => t + a.oas, 0);

  const guardar = async () => {
    setError(null);
    try {
      const r = await api<{ id: number }>('/cursos', { method: 'POST', json: { nivelId, letra, anio, asignaturaIds: [...elegidas] } });
      onCreated(r.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Nuevo curso" onClose={onClose}>
      <div className="form-grid form-3">
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
      <div className="asig-elegir">
        <div className="asig-elegir-head">
          <strong>Asignaturas del curso</strong>
          <span className="muted small">
            Se asignan sus {totalOas} OA del nivel (puedes quitar o sumar OA después).{' '}
            <button type="button" className="link-btn" onClick={() => setElegidas(new Set(asignaturas.map((a) => a.id)))}>
              Todas
            </button>{' '}
            ·{' '}
            <button type="button" className="link-btn" onClick={() => setElegidas(new Set())}>
              Ninguna
            </button>
          </span>
        </div>
        {areas.map(([area, lista]) => (
          <fieldset key={area}>
            {areas.length > 1 && <legend className="small muted">{area}</legend>}
            <div className="asig-checks">
              {lista.map((a) => (
                <label key={a.id} className="check-row">
                  <input type="checkbox" checked={elegidas.has(a.id)} onChange={() => toggle(a.id)} />
                  <span className="dot" style={{ background: a.color }} />
                  <span>
                    {a.nombre} <span className="muted small">{a.oas} OA</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={guardar} disabled={!nivelId}>
          Crear curso
        </button>
      </div>
    </Modal>
  );
}
