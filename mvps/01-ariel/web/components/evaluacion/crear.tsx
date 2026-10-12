'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { TIPO_MATERIAL, TIPO_PREGUNTA } from '@/lib/format';
import type { CursoDetalle, CursoOa, EsquemaGenerado, Material, Oa, Pregunta, TipoEvaluacion, TipoPregunta } from '@/lib/types';
import { ErrorBox, OaTag } from '../ui';
import { EditorPregunta } from './editor';

export type Modo = 'ia' | 'pegar' | 'archivo';

const MODOS: Record<Modo, { titulo: string; placeholder: string; ayuda: string }> = {
  ia: {
    titulo: 'Generar con IA',
    placeholder: 'Describe tu evaluación. Ej: prueba formativa sobre seres vivos y sus necesidades, con ejemplos del patio del colegio.',
    ayuda: 'Metis arma las preguntas desde los OA del curso que elijas. Puedes sumar materiales para que las preguntas salgan de ellos.',
  },
  pegar: {
    titulo: 'Pegar contenido',
    placeholder: 'Pega aquí tus apuntes, un texto o el temario. Metis lo convierte en preguntas alineadas a los OA.',
    ayuda: 'Las preguntas se basan en el contenido que pegues; cada una indica de qué parte sale.',
  },
  archivo: {
    titulo: 'Importar archivo',
    placeholder: 'Indicaciones opcionales. Ej: enfócate en el capítulo 2 y agrega dos preguntas abiertas.',
    ayuda: 'Sube un PDF, Word o PowerPoint. Queda guardado en Materiales y las preguntas citan la parte del archivo de donde salen.',
  },
};

const PASOS = ['Idea', 'Procesando', 'Esquema', 'Crear'];
const MENSAJES_PROCESO = ['Leyendo tus materiales…', 'Alineando con los OA del curso…', 'Redactando preguntas y alternativas…', 'Escribiendo pistas para Metis…', 'Revisando que todo sea claro…'];
const TIPOS: TipoPregunta[] = ['Unica', 'Multiple', 'VerdaderoFalso', 'Abierta'];

export function CrearConIa({ curso, modo, onVolver }: { curso: CursoDetalle; modo: Modo; onVolver: () => void }) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [oasCurso, setOasCurso] = useState<Oa[] | null>(null);
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [iaDisponible, setIaDisponible] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Idea
  const [asignaturaId, setAsignaturaId] = useState(0);
  const [consigna, setConsigna] = useState('');
  const [oaIds, setOaIds] = useState<Set<number>>(new Set());
  const [materialIds, setMaterialIds] = useState<Set<number>>(new Set());
  const [cantidad, setCantidad] = useState(8);
  const [dificultad, setDificultad] = useState('Intermedio');
  const [tipo, setTipo] = useState<TipoEvaluacion>('Formativa');
  const [tipos, setTipos] = useState<Set<TipoPregunta>>(new Set(TIPOS));
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  // Esquema
  const [esquema, setEsquema] = useState<EsquemaGenerado | null>(null);
  const [duracion, setDuracion] = useState(30);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    api<{ disponible: boolean }>('/ia/estado').then((r) => setIaDisponible(r.disponible));
    api<CursoOa[]>(`/cursos/${curso.id}/oas`).then((l) => {
      const oas = l.map((x) => x.oa);
      setOasCurso(oas);
      const primera = oas[0]?.asignaturaId ?? 0;
      setAsignaturaId(primera);
      setOaIds(new Set(oas.filter((o) => o.asignaturaId === primera).map((o) => o.id)));
    });
    api<Material[]>(`/materiales?cursoId=${curso.id}`).then(setMateriales);
  }, [curso.id]);

  const asignaturas = useMemo(
    () => [...new Map((oasCurso ?? []).map((o) => [o.asignaturaId, { id: o.asignaturaId, nombre: o.asignatura }])).values()],
    [oasCurso],
  );
  const oasAsignatura = (oasCurso ?? []).filter((o) => o.asignaturaId === asignaturaId);
  const materialesAsignatura = materiales.filter((m) => m.asignaturaId === asignaturaId || materialIds.has(m.id));
  const elegirAsignatura = (id: number) => {
    setAsignaturaId(id);
    setOaIds(new Set((oasCurso ?? []).filter((o) => o.asignaturaId === id).map((o) => o.id)));
  };
  const alternar = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    setError(null);
    setSubiendo(true);
    try {
      for (const f of Array.from(archivos)) {
        const fd = new FormData();
        fd.append('archivo', f);
        fd.append('asignaturaId', String(asignaturaId));
        fd.append('nivelId', String(curso.nivelId));
        fd.append('cursoId', String(curso.id));
        const r = await api<{ id: number }>('/materiales/archivo', { method: 'POST', body: fd });
        setMaterialIds((s) => new Set(s).add(r.id));
      }
      setMateriales(await api<Material[]>(`/materiales?cursoId=${curso.id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = '';
    }
  };

  const generar = async () => {
    setError(null);
    setPaso(1);
    try {
      const r = await api<EsquemaGenerado>(`/cursos/${curso.id}/evaluaciones/generar`, {
        method: 'POST',
        json: { asignaturaId, consigna, oaIds: [...oaIds], materialIds: [...materialIds], cantidad, dificultad, tipos: [...tipos], tipo },
      });
      setEsquema(r);
      setPaso(2);
    } catch (e) {
      setError((e as Error).message);
      setPaso(0);
    }
  };

  const crear = async () => {
    if (!esquema) return;
    setError(null);
    setCreando(true);
    setPaso(3);
    try {
      const r = await api<{ id: number }>(`/cursos/${curso.id}/evaluaciones/desde-esquema`, {
        method: 'POST',
        json: {
          titulo: esquema.titulo,
          instrucciones: esquema.instrucciones,
          asignaturaId,
          tipo,
          duracionMinutos: duracion,
          dificultad: esquema.dificultad,
          generadaConIa: esquema.porIa,
          preguntas: esquema.preguntas.map((p) => ({ ...p, opciones: p.tipo === 'Unica' || p.tipo === 'Multiple' ? p.opciones : [], puntaje: Number(p.puntaje) })),
        },
      });
      router.push(`/cursos/${curso.id}/evaluaciones/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
      setPaso(2);
      setCreando(false);
    }
  };

  const setP = (i: number, cambio: Partial<Pregunta>) =>
    setEsquema((s) => (s ? { ...s, preguntas: s.preguntas.map((p, j) => (j === i ? { ...p, ...cambio } : p)) } : s));
  const mover = (i: number, d: number) =>
    setEsquema((s) => {
      if (!s) return s;
      const ps = [...s.preguntas];
      const j = i + d;
      if (j < 0 || j >= ps.length) return s;
      [ps[i], ps[j]] = [ps[j], ps[i]];
      return { ...s, preguntas: ps };
    });

  const info = MODOS[modo];
  const puedeGenerar = asignaturaId > 0 && oaIds.size > 0 && tipos.size > 0 && (modo !== 'pegar' || consigna.trim().length > 20) && (modo !== 'archivo' || materialIds.size > 0);

  if (oasCurso && oasCurso.length === 0)
    return <p className="alert alert-info">Primero asigna OA al curso en la pestaña Currículum: las preguntas se generan y se vinculan a esos OA.</p>;

  return (
    <div className="crear-ia">
      <ol className="pasos" aria-label="Pasos">
        {PASOS.map((p, i) => (
          <li key={p} className={i < paso ? 'hecho' : i === paso ? 'actual' : ''}>
            <span>{i + 1}</span> {p}
          </li>
        ))}
      </ol>
      <ErrorBox error={error} />

      {paso === 0 && (
        <section className="idea">
          {iaDisponible === false && (
            <p className="alert alert-info small">
              La IA no está configurada en este servidor (falta <code>ANTHROPIC_API_KEY</code>). Puedes probar el flujo: se arma un esquema de ejemplo desde los OA
              para que lo edites.
            </p>
          )}
          <p className="muted">{info.ayuda}</p>
          <div className="idea-box">
            <textarea
              rows={modo === 'pegar' ? 10 : 4}
              value={consigna}
              onChange={(e) => setConsigna(e.target.value)}
              placeholder={info.placeholder}
              aria-label="Descripción de la evaluación"
              autoFocus
            />
            <div className="idea-bar">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => archivoRef.current?.click()} disabled={subiendo || !asignaturaId}>
                📎 {subiendo ? 'Subiendo…' : 'Adjuntar archivo'}
              </button>
              <input ref={archivoRef} type="file" hidden multiple accept=".pdf,.docx,.pptx,.txt,.md,.csv" onChange={(e) => subir(e.target.files)} />
              <span className="muted small">PDF, Word, PowerPoint o texto · hasta 15 MB</span>
              <button className="btn btn-primary" onClick={generar} disabled={!puedeGenerar}>
                ★ Generar
              </button>
            </div>
          </div>

          <div className="idea-opciones">
            <label>
              Asignatura
              <select value={asignaturaId} onChange={(e) => elegirAsignatura(Number(e.target.value))}>
                {asignaturas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preguntas
              <select value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))}>
                {[3, 5, 8, 10, 12, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} preguntas
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dificultad
              <select value={dificultad} onChange={(e) => setDificultad(e.target.value)}>
                {['Básico', 'Intermedio', 'Avanzado'].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvaluacion)}>
                <option value="Formativa">Formativa</option>
                <option value="Sumativa">Sumativa (nota)</option>
              </select>
            </label>
          </div>

          <div className="idea-tipos">
            <span className="small muted">Tipos de pregunta:</span>
            {TIPOS.map((t) => (
              <label key={t} className={`chip-check ${tipos.has(t) ? 'on' : ''}`}>
                <input type="checkbox" checked={tipos.has(t)} onChange={() => setTipos((s) => alternar(s, t))} />
                {TIPO_PREGUNTA[t]}
              </label>
            ))}
          </div>

          <div className="idea-grid">
            <section className="card">
              <div className="section-head">
                <h3>
                  OA que se evalúan <span className="muted small">{oaIds.size} de {oasAsignatura.length}</span>
                </h3>
                <span className="small">
                  <button className="link-btn" onClick={() => setOaIds(new Set(oasAsignatura.map((o) => o.id)))}>
                    Todos
                  </button>{' '}
                  ·{' '}
                  <button className="link-btn" onClick={() => setOaIds(new Set())}>
                    Ninguno
                  </button>
                </span>
              </div>
              <ul className="oa-elegir">
                {oasAsignatura.map((o) => (
                  <li key={o.id}>
                    <label>
                      <input type="checkbox" checked={oaIds.has(o.id)} onChange={() => setOaIds((s) => alternar(s, o.id))} />
                      <OaTag oa={o} compacto />
                      <span className="small">{o.descripcion.split('\n')[0]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h3>
                Materiales de origen <span className="muted small">{materialIds.size} elegidos</span>
              </h3>
              {materialesAsignatura.length === 0 && <p className="muted small">No hay materiales de esta asignatura. Adjunta un archivo para usarlo como fuente.</p>}
              <ul className="oa-elegir">
                {materialesAsignatura.map((m) => (
                  <li key={m.id}>
                    <label>
                      <input type="checkbox" checked={materialIds.has(m.id)} onChange={() => setMaterialIds((s) => alternar(s, m.id))} />
                      <span className="mtipo-mini">{m.archivoNombre ? '📄' : '📘'}</span>
                      <span className="small">
                        <strong>{m.titulo}</strong>
                        <span className="muted"> · {m.archivoNombre ?? TIPO_MATERIAL[m.tipo]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onVolver}>
              Volver
            </button>
          </div>
        </section>
      )}

      {paso === 1 && <Procesando />}

      {paso >= 2 && esquema && (
        <section className="esquema">
          {esquema.aviso && <p className="alert alert-info small">{esquema.aviso}</p>}
          <div className="esquema-head card">
            <label className="grow">
              Título
              <input value={esquema.titulo} onChange={(e) => setEsquema({ ...esquema, titulo: e.target.value })} />
            </label>
            <label>
              Duración
              <select value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
                {[15, 20, 25, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <label className="span-all">
              Instrucciones para el estudiante
              <textarea rows={2} value={esquema.instrucciones} onChange={(e) => setEsquema({ ...esquema, instrucciones: e.target.value })} />
            </label>
            <p className="muted small span-all">
              {esquema.porIa ? '✦ Generada con IA. ' : ''}Revisa y edita cada pregunta: alternativas, respuesta correcta, OA, pista para Metis y la pauta de corrección.
            </p>
          </div>
          {esquema.preguntas.map((p, i) => (
            <EditorPregunta
              key={i}
              n={i + 1}
              p={p}
              bloqueada={false}
              asistente
              oas={oasAsignatura}
              otrosOas={(oasCurso ?? []).filter((o) => o.asignaturaId !== asignaturaId)}
              onChange={(c) => setP(i, c)}
              onSubir={() => mover(i, -1)}
              onBajar={() => mover(i, 1)}
              onDuplicar={() => setEsquema({ ...esquema, preguntas: [...esquema.preguntas.slice(0, i + 1), structuredClone(p), ...esquema.preguntas.slice(i + 1)] })}
              onEliminar={() => setEsquema({ ...esquema, preguntas: esquema.preguntas.filter((_, j) => j !== i) })}
            />
          ))}
          <button
            className="btn btn-ghost btn-block add-pregunta"
            onClick={() =>
              setEsquema({
                ...esquema,
                preguntas: [
                  ...esquema.preguntas,
                  { tipo: 'Unica', enunciado: '', opciones: ['', '', '', ''], correctas: [], puntaje: 1, objetivoId: esquema.preguntas.at(-1)?.objetivoId ?? null, asistenteHabilitado: true, pistaDocente: null },
                ],
              })
            }
          >
            + Agregar pregunta
          </button>
          <div className="save-bar visible">
            <span>
              {esquema.preguntas.length} preguntas · {esquema.preguntas.reduce((s, p) => s + Number(p.puntaje || 0), 0)} puntos
            </span>
            <button className="btn btn-ghost" onClick={() => setPaso(0)} disabled={creando}>
              ← Cambiar la idea
            </button>
            <button className="btn btn-ghost" onClick={generar} disabled={creando}>
              ↻ Generar de nuevo
            </button>
            <button className="btn btn-primary" onClick={crear} disabled={creando || esquema.preguntas.length === 0}>
              {creando ? 'Creando…' : 'Crear evaluación'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Procesando() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % MENSAJES_PROCESO.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="procesando" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/metis.png" alt="" className="procesando-avatar" />
      <p className="procesando-texto">{MENSAJES_PROCESO[i]}</p>
      <div className="procesando-barra">
        <span />
      </div>
      <p className="muted small">Puede tardar hasta un minuto si adjuntaste documentos largos.</p>
    </section>
  );
}
