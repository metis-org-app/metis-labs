'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { NIVEL_AYUDA, TIPO_PREGUNTA } from '@/lib/format';
import type { CursoOa, Evaluacion, Oa, Pregunta, TipoPregunta } from '@/lib/types';
import { ErrorBox, OaTag } from '../ui';

const NUEVA: Pregunta = { tipo: 'Unica', enunciado: '', opciones: ['', '', '', ''], correctas: [], puntaje: 1, objetivoId: null, asistenteHabilitado: true, pistaDocente: null };

const AYUDA_DETALLE: Record<number, string> = {
  1: 'Metis solo hace preguntas que orientan: destaca palabras clave y pide al estudiante explicar lo que sabe.',
  2: 'Además entrega la pista que escribas para cada pregunta o le recuerda el OA que se evalúa.',
  3: 'Además puede descartar una alternativa incorrecta o proponer cómo empezar una respuesta abierta.',
};

export function EditorEvaluacion({ ev, onSaved }: { ev: Evaluacion; onSaved: () => void }) {
  const [form, setForm] = useState(() => structuredClone(ev));
  const [oasCurso, setOasCurso] = useState<Oa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const sucio = useMemo(() => JSON.stringify(form) !== JSON.stringify(ev), [form, ev]);
  const bloqueada = ev.bloqueada;

  useEffect(() => setForm(structuredClone(ev)), [ev]);
  useEffect(() => {
    api<CursoOa[]>(`/cursos/${ev.cursoId}/oas`).then((l) => setOasCurso(l.map((x) => x.oa)));
  }, [ev.cursoId]);

  // Avisar antes de salir con cambios sin guardar.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (sucio) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sucio]);

  const oasAsignatura = oasCurso.filter((o) => o.asignaturaId === form.asignaturaId);
  const otrosOas = oasCurso.filter((o) => o.asignaturaId !== form.asignaturaId);
  const total = form.preguntas.reduce((s, p) => s + Number(p.puntaje || 0), 0);
  const oasCubiertos = new Set(form.preguntas.map((p) => p.objetivoId).filter(Boolean));

  const set = <K extends keyof Evaluacion>(k: K, v: Evaluacion[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setP = (i: number, cambio: Partial<Pregunta>) => setForm((f) => ({ ...f, preguntas: f.preguntas.map((p, j) => (j === i ? { ...p, ...cambio } : p)) }));
  const mover = (i: number, d: number) =>
    setForm((f) => {
      const ps = [...f.preguntas];
      const j = i + d;
      if (j < 0 || j >= ps.length) return f;
      [ps[i], ps[j]] = [ps[j], ps[i]];
      return { ...f, preguntas: ps };
    });
  const agregar = () =>
    setForm((f) => ({ ...f, preguntas: [...f.preguntas, { ...structuredClone(NUEVA), objetivoId: f.preguntas.at(-1)?.objetivoId ?? oasAsignatura[0]?.id ?? null }] }));

  const guardar = async () => {
    setError(null);
    setAviso(null);
    setGuardando(true);
    try {
      const r = await api<{ preguntasBloqueadas: boolean }>(`/evaluaciones/${ev.id}`, {
        method: 'PUT',
        json: {
          ...form,
          preguntas: form.preguntas.map((p) => ({ ...p, opciones: p.tipo === 'Unica' || p.tipo === 'Multiple' ? p.opciones : [], puntaje: Number(p.puntaje) })),
        },
      });
      if (r.preguntasBloqueadas) setAviso('Se guardó la configuración. Las preguntas no cambian porque ya hay entregas.');
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="editor">
      <section className="card">
        <h2>Configuración</h2>
        <div className="form-grid form-3">
          <label className="span-3">
            Título
            <input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} />
          </label>
          <label>
            Tipo
            <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as Evaluacion['tipo'])}>
              <option value="Formativa">Formativa (logro por OA)</option>
              <option value="Sumativa">Sumativa (nota 1,0 a 7,0)</option>
            </select>
          </label>
          <label>
            Duración (minutos)
            <input type="number" min={5} max={240} value={form.duracionMinutos} onChange={(e) => set('duracionMinutos', Number(e.target.value))} />
          </label>
          <label>
            Exigencia para el 4,0
            <select value={form.exigencia} onChange={(e) => set('exigencia', Number(e.target.value))}>
              {[50, 55, 60, 65, 70].map((x) => (
                <option key={x} value={x}>
                  {x}%
                </option>
              ))}
            </select>
          </label>
          <label className="span-3">
            Instrucciones para el estudiante
            <textarea rows={2} value={form.instrucciones ?? ''} onChange={(e) => set('instrucciones', e.target.value)} />
          </label>
        </div>
      </section>

      <section className="card metis-config">
        <div className="metis-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/metis.png" alt="" aria-hidden="true" className="metis-img" />
          <div>
            <h2>Asistente Metis</h2>
            <p className="muted small">Acompaña al estudiante dentro de la evaluación. Nunca entrega la respuesta y cada conversación queda registrada para ti.</p>
          </div>
          <label className="switch">
            <input type="checkbox" checked={form.asistenteActivo} onChange={(e) => set('asistenteActivo', e.target.checked)} />
            <span>{form.asistenteActivo ? 'Activado' : 'Desactivado'}</span>
          </label>
        </div>
        {form.asistenteActivo && (
          <>
            <div className="nivel-ayuda">
              {[1, 2, 3].map((n) => (
                <label key={n} className={`radio-card ${form.nivelAyuda === n ? 'checked' : ''}`}>
                  <input type="radio" name="nivelAyuda" checked={form.nivelAyuda === n} onChange={() => set('nivelAyuda', n)} />
                  <span>
                    <strong>Hasta {NIVEL_AYUDA[n].toLowerCase()}</strong>
                    <span className="muted small">{AYUDA_DETALLE[n]}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="muted small">
              La ayuda es gradual: cada vez que el estudiante pide ayuda en la misma pregunta, Metis sube un nivel hasta el máximo que elijas. Con
              estudiantes TEA responde en pasos numerados y lenguaje literal.
            </p>
            <label>
              Indicaciones para Metis (opcional)
              <input value={form.instruccionesAsistente ?? ''} onChange={(e) => set('instruccionesAsistente', e.target.value)} placeholder="Ej: usa ejemplos del entorno del colegio" />
            </label>
          </>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>
            Preguntas <span className="muted small">{form.preguntas.length} · {total} puntos</span>
          </h2>
          {oasAsignatura.length > 0 && (
            <div className="cobertura-oas small">
              OA evaluados:{' '}
              {oasAsignatura.map((o) => (
                <span key={o.id} className={oasCubiertos.has(o.id) ? '' : 'faltante'} title={o.descripcion}>
                  {o.codigoOficial.split(' ').slice(1).join(' ')}
                </span>
              ))}
            </div>
          )}
        </div>
        {bloqueada && <p className="alert alert-info small">Esta evaluación ya tiene entregas: las preguntas no se pueden cambiar. Puedes duplicarla para crear una versión nueva.</p>}

        {form.preguntas.map((p, i) => (
          <EditorPregunta
            key={i}
            n={i + 1}
            p={p}
            bloqueada={bloqueada}
            asistente={form.asistenteActivo}
            oas={oasAsignatura}
            otrosOas={otrosOas}
            onChange={(c) => setP(i, c)}
            onSubir={() => mover(i, -1)}
            onBajar={() => mover(i, 1)}
            onDuplicar={() => setForm((f) => ({ ...f, preguntas: [...f.preguntas.slice(0, i + 1), { ...structuredClone(p), id: undefined }, ...f.preguntas.slice(i + 1)] }))}
            onEliminar={() => setForm((f) => ({ ...f, preguntas: f.preguntas.filter((_, j) => j !== i) }))}
          />
        ))}
        {!bloqueada && (
          <button className="btn btn-ghost btn-block add-pregunta" onClick={agregar}>
            + Agregar pregunta
          </button>
        )}
      </section>

      <div className={`save-bar ${sucio ? 'visible' : ''}`}>
        <span>{sucio ? 'Tienes cambios sin guardar' : 'Todo guardado'}</span>
        <ErrorBox error={error} />
        {aviso && <span className="small">{aviso}</span>}
        <button className="btn btn-ghost" onClick={() => setForm(structuredClone(ev))} disabled={!sucio}>
          Descartar
        </button>
        <button className="btn btn-primary" onClick={guardar} disabled={!sucio || guardando}>
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

export function EditorPregunta(props: {
  n: number;
  p: Pregunta;
  bloqueada: boolean;
  asistente: boolean;
  oas: Oa[];
  otrosOas: Oa[];
  onChange: (c: Partial<Pregunta>) => void;
  onSubir: () => void;
  onBajar: () => void;
  onDuplicar: () => void;
  onEliminar: () => void;
}) {
  const { n, p, bloqueada, asistente, oas, otrosOas, onChange } = props;
  const cerrada = p.tipo === 'Unica' || p.tipo === 'Multiple';
  const oaActual = [...oas, ...otrosOas].find((o) => o.id === p.objetivoId);

  const cambiarTipo = (tipo: TipoPregunta) => {
    const opciones = tipo === 'Unica' || tipo === 'Multiple' ? (p.opciones.length >= 2 ? p.opciones : ['', '', '', '']) : [];
    onChange({ tipo, opciones, correctas: tipo === 'Multiple' ? p.correctas : p.correctas.slice(0, 1) });
  };
  const marcar = (i: number) => {
    if (p.tipo === 'Multiple') onChange({ correctas: p.correctas.includes(i) ? p.correctas.filter((x) => x !== i) : [...p.correctas, i].sort() });
    else onChange({ correctas: [i] });
  };
  const quitarOpcion = (i: number) =>
    onChange({ opciones: p.opciones.filter((_, j) => j !== i), correctas: p.correctas.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)) });

  return (
    <fieldset className="pregunta-editor" disabled={bloqueada}>
      <div className="pregunta-head">
        <span className="pregunta-n">{n}</span>
        <select value={p.tipo} onChange={(e) => cambiarTipo(e.target.value as TipoPregunta)} aria-label="Tipo de pregunta">
          {Object.entries(TIPO_PREGUNTA).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select value={p.objetivoId ?? ''} onChange={(e) => onChange({ objetivoId: e.target.value ? Number(e.target.value) : null })} aria-label="OA que evalúa" className="oa-select">
          <option value="">Sin OA vinculado</option>
          {oas.map((o) => (
            <option key={o.id} value={o.id}>
              {o.codigoOficial} · {o.descripcion.slice(0, 70)}
              {o.descripcion.length > 70 ? '…' : ''}
            </option>
          ))}
          {otrosOas.length > 0 && (
            <optgroup label="Otras asignaturas del curso">
              {otrosOas.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.codigoOficial} · {o.descripcion.slice(0, 60)}…
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <label className="puntaje">
          <input type="number" min={0.5} max={20} step={0.5} value={p.puntaje} onChange={(e) => onChange({ puntaje: Number(e.target.value) })} aria-label="Puntaje" />
          pts
        </label>
        <div className="pregunta-tools">
          <button type="button" className="icon-btn" onClick={props.onSubir} title="Subir" aria-label="Subir">
            ↑
          </button>
          <button type="button" className="icon-btn" onClick={props.onBajar} title="Bajar" aria-label="Bajar">
            ↓
          </button>
          <button type="button" className="icon-btn" onClick={props.onDuplicar} title="Duplicar" aria-label="Duplicar">
            ⧉
          </button>
          <button type="button" className="icon-btn danger" onClick={props.onEliminar} title="Eliminar" aria-label="Eliminar">
            ✕
          </button>
        </div>
      </div>
      {oaActual && (
        <div className="pregunta-oa small">
          <OaTag oa={oaActual} /> {oaActual.descripcion}
        </div>
      )}
      <textarea rows={2} value={p.enunciado} placeholder="Escribe la pregunta" onChange={(e) => onChange({ enunciado: e.target.value })} aria-label={`Enunciado de la pregunta ${n}`} />

      {cerrada && (
        <div className="opciones-editor">
          <span className="small muted">{p.tipo === 'Multiple' ? 'Marca todas las alternativas correctas' : 'Marca la alternativa correcta'}</span>
          {p.opciones.map((o, i) => (
            <div key={i} className={`opcion-row ${p.correctas.includes(i) ? 'correcta' : ''}`}>
              <input type={p.tipo === 'Multiple' ? 'checkbox' : 'radio'} checked={p.correctas.includes(i)} onChange={() => marcar(i)} aria-label={`Alternativa ${String.fromCharCode(65 + i)} correcta`} />
              <span className="letra">{String.fromCharCode(65 + i)}</span>
              <input value={o} placeholder={`Alternativa ${String.fromCharCode(65 + i)}`} onChange={(e) => onChange({ opciones: p.opciones.map((x, j) => (j === i ? e.target.value : x)) })} />
              {p.opciones.length > 2 && (
                <button type="button" className="icon-btn" onClick={() => quitarOpcion(i)} aria-label="Quitar alternativa">
                  ✕
                </button>
              )}
            </div>
          ))}
          {p.opciones.length < 6 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ opciones: [...p.opciones, ''] })}>
              + Alternativa
            </button>
          )}
        </div>
      )}
      {p.tipo === 'VerdaderoFalso' && (
        <div className="opciones-editor vf">
          {['Verdadero', 'Falso'].map((o, i) => (
            <label key={o} className={`opcion-row ${p.correctas.includes(i) ? 'correcta' : ''}`}>
              <input type="radio" checked={p.correctas.includes(i)} onChange={() => onChange({ correctas: [i] })} />
              {o}
            </label>
          ))}
        </div>
      )}
      {p.tipo === 'Abierta' && <p className="small muted">La respuesta abierta la corriges tú en Resultados. Puedes asignar puntaje parcial y dejar un comentario.</p>}

      <details className="pregunta-pauta">
        <summary className="small">
          Pauta y fuente <span className="muted">(solo tú las ves)</span>
          {p.fuente && <span className="fuente-chip">📄 {p.fuente}</span>}
        </summary>
        <label className="small">
          Justificación de la respuesta o pauta de corrección
          <textarea rows={2} value={p.justificacion ?? ''} onChange={(e) => onChange({ justificacion: e.target.value || null })} />
        </label>
        <label className="small">
          Fuente (material, página u OA)
          <input value={p.fuente ?? ''} onChange={(e) => onChange({ fuente: e.target.value || null })} />
        </label>
      </details>

      <div className="pregunta-metis">
        <label className="check-row">
          <input type="checkbox" checked={p.asistenteHabilitado && asistente} disabled={!asistente} onChange={(e) => onChange({ asistenteHabilitado: e.target.checked })} />
          Metis puede ayudar en esta pregunta
        </label>
        {asistente && p.asistenteHabilitado && (
          <input value={p.pistaDocente ?? ''} placeholder="Pista para Metis (opcional): la entrega desde el nivel 2" onChange={(e) => onChange({ pistaDocente: e.target.value || null })} />
        )}
      </div>
    </fieldset>
  );
}

