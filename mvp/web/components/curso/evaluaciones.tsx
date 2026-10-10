'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fecha, NIVEL_AYUDA, nota } from '@/lib/format';
import type { CursoDetalle, CursoOa, EvaluacionResumen, TipoEvaluacion } from '@/lib/types';
import { Barra, Empty, ErrorBox, EstadoEval, Modal, OaTag } from '../ui';

export function EvaluacionesCurso({ curso }: { curso: CursoDetalle }) {
  const [lista, setLista] = useState<EvaluacionResumen[] | null>(null);
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    api<EvaluacionResumen[]>(`/cursos/${curso.id}/evaluaciones`).then(setLista);
  }, [curso.id]);

  return (
    <>
      <div className="section-head">
        <p className="muted">
          Evaluaciones del curso con el asistente <strong>Metis</strong> integrado: guía a cada estudiante mientras responde, sin darle la respuesta, y
          tú ves cada conversación.
        </p>
        <button className="btn btn-primary" onClick={() => setNueva(true)}>
          + Nueva evaluación
        </button>
      </div>
      {lista?.length === 0 && <Empty>Aún no hay evaluaciones. Crea la primera a partir de los OA del curso.</Empty>}
      <div className="eval-grid">
        {lista?.map((e) => (
          <Link key={e.id} href={`/cursos/${curso.id}/evaluaciones/${e.id}${e.estado === 'Borrador' ? '' : '?vista=resultados'}`} className="eval-card">
            <div className="eval-top">
              <EstadoEval estado={e.estado} />
              <span className="chip">{e.tipo}</span>
              <span className="muted small">{e.asignatura}</span>
            </div>
            <h3>{e.titulo}</h3>
            <div className="oa-tags">
              {e.oas.map((o) => (
                <OaTag key={o.id} oa={o} compacto />
              ))}
              {e.oas.length === 0 && <span className="muted small">Sin OA vinculados</span>}
            </div>
            <div className="eval-meta small muted">
              {e.preguntas} preguntas · {e.puntajeTotal} pts · {e.duracionMinutos} min ·{' '}
              {e.asistenteActivo ? `Metis: ${NIVEL_AYUDA[e.nivelAyuda].split(' · ')[1].toLowerCase()}` : 'Metis desactivado'}
            </div>
            {e.estado !== 'Borrador' ? (
              <div className="eval-progreso">
                <div className="small">
                  {e.entregas} de {e.totalEstudiantes} entregas
                  {e.porRevisar > 0 && <span className="warn"> · {e.porRevisar} por revisar</span>}
                  {e.tipo === 'Sumativa' || e.promedio != null ? <span> · Promedio {nota(e.promedio)}</span> : null}
                </div>
                <Barra valor={e.entregas} total={e.totalEstudiantes} />
              </div>
            ) : (
              <div className="small muted">Creada el {fecha(e.creadaEn)} · sin publicar</div>
            )}
          </Link>
        ))}
      </div>
      {nueva && <NuevaEvaluacion curso={curso} onClose={() => setNueva(false)} />}
    </>
  );
}

function NuevaEvaluacion({ curso, onClose }: { curso: CursoDetalle; onClose: () => void }) {
  const router = useRouter();
  const [asignaturas, setAsignaturas] = useState<{ id: number; nombre: string }[]>([]);
  const [titulo, setTitulo] = useState('');
  const [asignaturaId, setAsignaturaId] = useState(0);
  const [tipo, setTipo] = useState<TipoEvaluacion>('Formativa');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Solo asignaturas con OA en el curso: una evaluación siempre se ancla al currículum del curso.
    api<CursoOa[]>(`/cursos/${curso.id}/oas`).then((oas) => {
      const unicas = [...new Map(oas.map((x) => [x.oa.asignaturaId, { id: x.oa.asignaturaId, nombre: x.oa.asignatura }])).values()];
      setAsignaturas(unicas);
      setAsignaturaId(unicas[0]?.id ?? 0);
    });
  }, [curso.id]);

  const crear = async () => {
    try {
      const r = await api<{ id: number }>(`/cursos/${curso.id}/evaluaciones`, { method: 'POST', json: { titulo, asignaturaId, tipo } });
      router.push(`/cursos/${curso.id}/evaluaciones/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={`Nueva evaluación · ${curso.nombre}`} onClose={onClose}>
      {asignaturas.length === 0 ? (
        <p className="alert alert-info">Primero asigna OA al curso en la pestaña Currículum: las preguntas se vinculan a esos OA.</p>
      ) : (
        <div className="form-grid">
          <label>
            Título
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Seres vivos y su entorno" autoFocus />
          </label>
          <label>
            Asignatura
            <select value={asignaturaId} onChange={(e) => setAsignaturaId(Number(e.target.value))}>
              {asignaturas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="radio-group">
            <legend>Tipo</legend>
            <label className="radio-card">
              <input type="radio" checked={tipo === 'Formativa'} onChange={() => setTipo('Formativa')} />
              <span>
                <strong>Formativa</strong>
                <span className="muted small">Para monitorear el aprendizaje. Se informa el logro por OA.</span>
              </span>
            </label>
            <label className="radio-card">
              <input type="radio" checked={tipo === 'Sumativa'} onChange={() => setTipo('Sumativa')} />
              <span>
                <strong>Sumativa</strong>
                <span className="muted small">Con calificación de 1,0 a 7,0.</span>
              </span>
            </label>
          </fieldset>
        </div>
      )}
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={crear} disabled={!titulo.trim() || !asignaturaId}>
          Crear y agregar preguntas
        </button>
      </div>
    </Modal>
  );
}
