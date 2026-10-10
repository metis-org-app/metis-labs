'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fechaHora, nota, num, TIPO_PREGUNTA } from '@/lib/format';
import type { IntentoDetalle, Resultados } from '@/lib/types';
import { DxBadge, Empty, ErrorBox, LogroBadge, Modal, NotaBadge, OaTag, Stat } from '../ui';

export function ResultadosEvaluacion({ evaluacionId }: { evaluacionId: number }) {
  const [r, setR] = useState<Resultados | null>(null);
  const [intento, setIntento] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => api<Resultados>(`/evaluaciones/${evaluacionId}/resultados`).then(setR).catch((e) => setError(e.message)), [evaluacionId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error) return <ErrorBox error={error} />;
  if (!r) return <p className="muted">Cargando…</p>;
  const { resumen } = r;
  const sumativa = r.evaluacion.tipo === 'Sumativa';

  return (
    <>
      <div className="stats">
        <Stat valor={`${resumen.entregas}/${resumen.estudiantes}`} label="Entregas" detalle={resumen.enCurso ? `${resumen.enCurso} respondiendo ahora` : undefined} />
        <Stat valor={resumen.porRevisar} label="Por revisar" color={resumen.porRevisar ? 'amber' : undefined} detalle="Respuestas abiertas sin corregir" />
        <Stat valor={nota(resumen.promedio)} label="Promedio" detalle={`Exigencia ${r.evaluacion.exigencia}% para el 4,0`} />
        <Stat valor={resumen.conNota ? `${resumen.aprobados}/${resumen.conNota}` : '—'} label="Con nota 4,0 o más" />
      </div>

      {r.logroOa.length > 0 && (
        <section className="card">
          <h2>Logro por objetivo de aprendizaje</h2>
          <p className="muted small">L: logrado (80% o más) · ML: medianamente logrado (60 a 79%) · PL: por lograr (menos de 60%).</p>
          <div className="logro-oas">
            {r.logroOa.map((l) => (
              <div key={l.oa.id} className="logro-oa">
                <OaTag oa={l.oa} compacto />
                <span className="small">{l.oa.descripcion}</span>
                <LogroBadge porcentaje={l.porcentaje} nivel={l.nivel} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card table-card">
        <h2>Estudiantes</h2>
        {r.estudiantes.length === 0 ? (
          <Empty>El curso no tiene estudiantes.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Estudiante</th>
                <th>Estado</th>
                <th>Puntaje</th>
                <th>{sumativa ? 'Nota' : 'Nota (referencial)'}</th>
                <th>Ayudas de Metis</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {r.estudiantes.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/estudiantes/${e.id}`}>
                      {e.apellido}, {e.nombre}
                    </Link>{' '}
                    <DxBadge dx={e.diagnostico} nivel={e.nivelTea} />
                  </td>
                  <td>
                    <span className={`chip estado-${e.estado.replace(' ', '-').toLowerCase()}`}>{e.estado}</span>
                  </td>
                  <td>{e.puntajeMaximo ? `${num(e.puntajeObtenido)} / ${num(e.puntajeMaximo)}` : '—'}</td>
                  <td>
                    <NotaBadge nota={e.nota} pendiente={e.estado === 'Por revisar'} />
                  </td>
                  <td>{e.intentoId ? e.ayudas : '—'}</td>
                  <td className="row-actions">
                    {e.intentoId && e.estado !== 'En curso' && (
                      <button className={`btn btn-sm ${e.estado === 'Por revisar' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setIntento(e.intentoId)}>
                        {e.estado === 'Por revisar' ? 'Revisar' : 'Ver respuestas'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card table-card">
        <h2>Análisis por pregunta</h2>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pregunta</th>
              <th>OA</th>
              <th>Logro</th>
              <th>Ayudas de Metis</th>
            </tr>
          </thead>
          <tbody>
            {r.preguntas.map((p) => (
              <tr key={p.id}>
                <td>{p.orden}</td>
                <td>
                  {p.enunciado}
                  <div className="muted small">{TIPO_PREGUNTA[p.tipo]}</div>
                </td>
                <td>{p.oa ? <OaTag oa={p.oa} compacto /> : '—'}</td>
                <td>
                  {p.logro == null ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className={`logro ${p.logro >= 80 ? 'l-ok' : p.logro >= 60 ? 'l-med' : 'l-bajo'}`}>{p.logro}%</span>
                  )}
                </td>
                <td>{p.ayudas > 0 ? <strong>{p.ayudas}</strong> : <span className="muted">0</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Muchas ayudas en una pregunta pueden indicar que el enunciado no es claro o que el OA necesita refuerzo.</p>
      </section>

      {intento && (
        <IntentoModal
          id={intento}
          onClose={() => setIntento(null)}
          onSaved={() => {
            setIntento(null);
            cargar();
          }}
        />
      )}
    </>
  );
}

function IntentoModal({ id, onClose, onSaved }: { id: number; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<IntentoDetalle | null>(null);
  const [puntajes, setPuntajes] = useState<Record<number, { puntaje: string; comentario: string }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<IntentoDetalle>(`/intentos/${id}`).then((x) => {
      setD(x);
      setPuntajes(
        Object.fromEntries(
          x.preguntas
            .filter((p) => p.pregunta.tipo === 'Abierta')
            .map((p) => [p.pregunta.id!, { puntaje: p.respuesta?.puntaje == null ? '' : String(p.respuesta.puntaje), comentario: p.respuesta?.comentario ?? '' }]),
        ),
      );
    });
  }, [id]);

  const guardar = async () => {
    setError(null);
    const lista = Object.entries(puntajes)
      .filter(([, v]) => v.puntaje !== '')
      .map(([k, v]) => ({ preguntaId: Number(k), puntaje: Number(v.puntaje.replace(',', '.')), comentario: v.comentario }));
    try {
      await api(`/intentos/${id}/revision`, { method: 'PUT', json: { puntajes: lista } });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const nombre = d?.estudiante ? `${d.estudiante.nombre} ${d.estudiante.apellido}` : 'Vista previa';

  return (
    <Modal title={`${nombre} · ${d?.evaluacion ?? ''}`} onClose={onClose} wide>
      {!d && <p className="muted">Cargando…</p>}
      {d && (
        <>
          <div className="intento-head">
            <span>Entregada {fechaHora(d.entregadoEn)}</span>
            <span>
              Puntaje {num(d.puntajeObtenido)} / {num(d.puntajeMaximo)}
            </span>
            <span>
              Nota <NotaBadge nota={d.nota} pendiente={d.revisionPendiente} />
            </span>
            {d.omitidas > 0 && <span className="chip">{d.omitidas} pregunta(s) omitidas por adecuación</span>}
          </div>
          {d.preguntas.map(({ pregunta: p, respuesta: r, conversacion }) => (
            <article key={p.id} className="respuesta-card">
              <div className="respuesta-head">
                <strong>
                  {p.orden}. {p.enunciado}
                </strong>
                {p.oa && <OaTag oa={p.oa} compacto />}
              </div>
              {p.tipo === 'Abierta' ? (
                <>
                  <blockquote className="respuesta-abierta">{r?.texto || <span className="muted">Sin respuesta</span>}</blockquote>
                  <div className="revision">
                    <label>
                      Puntaje (máx. {num(p.puntaje)})
                      <input
                        type="number"
                        min={0}
                        max={p.puntaje}
                        step={0.5}
                        value={puntajes[p.id!]?.puntaje ?? ''}
                        onChange={(e) => setPuntajes({ ...puntajes, [p.id!]: { ...puntajes[p.id!], puntaje: e.target.value } })}
                      />
                    </label>
                    <label className="grow">
                      Comentario para el estudiante
                      <input value={puntajes[p.id!]?.comentario ?? ''} onChange={(e) => setPuntajes({ ...puntajes, [p.id!]: { ...puntajes[p.id!], comentario: e.target.value } })} />
                    </label>
                  </div>
                </>
              ) : (
                <ul className="opciones-resultado">
                  {p.opciones.map((o, i) => {
                    const elegida = r?.seleccion.includes(i);
                    const correcta = p.correctas.includes(i);
                    return (
                      <li key={i} className={`${correcta ? 'ok' : ''} ${elegida && !correcta ? 'mal' : ''}`}>
                        <span className="letra">{p.tipo === 'VerdaderoFalso' ? '' : String.fromCharCode(65 + i)}</span> {o}
                        {elegida && <span className="tag">{correcta ? 'Elegida ✓' : 'Elegida ✗'}</span>}
                      </li>
                    );
                  })}
                  <li className="puntaje-linea small">
                    {num(r?.puntaje ?? 0)} / {num(p.puntaje)} pts
                  </li>
                </ul>
              )}
              {conversacion.length > 0 && (
                <details className="conversacion" open>
                  <summary>
                    Conversación con Metis ({conversacion.filter((m) => m.rol === 'estudiante').length}{' '}
                    {conversacion.filter((m) => m.rol === 'estudiante').length === 1 ? 'consulta' : 'consultas'})
                  </summary>
                  {conversacion.map((m, i) => (
                    <div key={i} className={`burbuja ${m.rol}`}>
                      {m.rol === 'metis' && m.nivelAyuda && <span className="nivel-tag">Ayuda nivel {m.nivelAyuda}</span>}
                      <span style={{ whiteSpace: 'pre-line' }}>{m.texto}</span>
                    </div>
                  ))}
                </details>
              )}
            </article>
          ))}
          <ErrorBox error={error} />
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Cerrar
            </button>
            {Object.keys(puntajes).length > 0 && (
              <button className="btn btn-primary" onClick={guardar}>
                Guardar revisión
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
