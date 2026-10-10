'use client';

import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { nota as fmtNota } from '@/lib/format';

type PreguntaEst = {
  id: number;
  numero: number;
  tipo: 'Unica' | 'Multiple' | 'VerdaderoFalso' | 'Abierta';
  enunciado: string;
  opciones: string[];
  puntaje: number;
  oa: { codigoOficial: string; descripcion: string } | null;
  asistente: boolean;
};
type Respuesta = { preguntaId: number; seleccion: number[]; texto: string | null };
type Mensaje = { preguntaId: number | null; rol: 'estudiante' | 'metis'; texto: string; nivelAyuda: number | null };
type Vista = {
  clave: string;
  estado: 'EnCurso' | 'Entregado';
  esPrueba: boolean;
  estudiante: { nombre: string; apellido: string } | null;
  evaluacion: { titulo: string; instrucciones: string | null; asignatura: string; curso: string; tipo: string; duracionMinutos: number; asistenteActivo: boolean; nivelAyuda: number };
  segundosRestantes: number;
  omitidas: number;
  preguntas: PreguntaEst[];
  respuestas: Respuesta[];
  mensajes: Mensaje[];
};
type Entrega = { respondidas: number; total: number; nota: number | null; puntaje: number | null; puntajeMaximo: number };

const reloj = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export default function RendirPage() {
  const { clave } = useParams<{ clave: string }>();
  const [v, setV] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fase, setFase] = useState<'intro' | 'rindiendo' | 'confirmar' | 'entregada'>('intro');
  const [idx, setIdx] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<number, Respuesta>>({});
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [restante, setRestante] = useState(0);
  const [entrega, setEntrega] = useState<Entrega | null>(null);
  const [chatAbierto, setChatAbierto] = useState(false);
  const guardarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entregando = useRef(false);

  useEffect(() => {
    api<Vista>(`/publico/intentos/${clave}`)
      .then((d) => {
        setV(d);
        setRespuestas(Object.fromEntries(d.respuestas.map((r) => [r.preguntaId, r])));
        setMensajes(d.mensajes);
        setRestante(d.segundosRestantes);
        if (d.estado === 'Entregado') setFase('entregada');
        else if (d.respuestas.length || d.mensajes.length) setFase('rindiendo');
      })
      .catch((e) => setError(e.message));
  }, [clave]);

  const listaRespuestas = useCallback((r: Record<number, Respuesta>) => Object.values(r), []);

  const entregar = useCallback(async () => {
    if (entregando.current) return;
    entregando.current = true;
    if (guardarTimer.current) clearTimeout(guardarTimer.current);
    try {
      const r = await api<Entrega>(`/publico/intentos/${clave}/entregar`, { method: 'POST', json: { respuestas: listaRespuestas(respuestas) } });
      setEntrega(r);
      setFase('entregada');
    } catch (e) {
      setError((e as Error).message);
      entregando.current = false;
    }
  }, [clave, respuestas, listaRespuestas]);

  // Cuenta regresiva: al llegar a cero se entrega lo respondido.
  useEffect(() => {
    if (fase !== 'rindiendo' && fase !== 'confirmar') return;
    const t = setInterval(() => setRestante((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [fase]);
  useEffect(() => {
    if ((fase === 'rindiendo' || fase === 'confirmar') && restante === 0 && v) entregar();
  }, [restante, fase, v, entregar]);

  const responder = (r: Respuesta) => {
    const nuevas = { ...respuestas, [r.preguntaId]: r };
    setRespuestas(nuevas);
    if (guardarTimer.current) clearTimeout(guardarTimer.current);
    guardarTimer.current = setTimeout(() => {
      api(`/publico/intentos/${clave}/respuestas`, { method: 'PUT', json: { respuestas: listaRespuestas(nuevas) } }).catch(() => undefined);
    }, 700);
  };

  if (error && !v) return <div className="rendir-ingreso"><div className="ingreso-card"><div className="ingreso-brand">Metis</div><div className="alert">{error}</div></div></div>;
  if (!v) return <div className="boot">Cargando…</div>;

  const p = v.preguntas[idx];
  const respondida = (q: PreguntaEst) => {
    const r = respuestas[q.id];
    return !!r && (r.seleccion.length > 0 || !!r.texto?.trim());
  };
  const sinResponder = v.preguntas.filter((q) => !respondida(q)).length;

  if (fase === 'entregada') {
    return (
      <div className="rendir-ingreso">
        <div className="ingreso-card centrado">
          <div className="metis-avatar grande" aria-hidden="true">M</div>
          <h1>¡Evaluación entregada!</h1>
          {entrega ? (
            <p>
              Respondiste {entrega.respondidas} de {entrega.total} preguntas. Tu profesor revisará tus respuestas.
            </p>
          ) : (
            <p>Ya entregaste esta evaluación. Tu profesor revisará tus respuestas.</p>
          )}
          {v.esPrueba && entrega && (
            <div className="alert alert-info">
              Vista previa del profesor: {entrega.puntaje ?? 0} de {entrega.puntajeMaximo} puntos · nota {fmtNota(entrega.nota)}. Las respuestas abiertas quedan
              como pendientes de revisión. Este intento no cuenta en los resultados.
            </div>
          )}
          <p className="muted small">Ya puedes cerrar esta ventana.</p>
        </div>
      </div>
    );
  }

  if (fase === 'intro') {
    return (
      <div className="rendir-ingreso">
        <div className="ingreso-card">
          {v.esPrueba && <div className="badge-prueba">Vista previa del profesor</div>}
          <p className="muted small">
            {v.evaluacion.curso} · {v.evaluacion.asignatura}
          </p>
          <h1>{v.evaluacion.titulo}</h1>
          {v.estudiante && <p>Hola, {v.estudiante.nombre}.</p>}
          {v.evaluacion.instrucciones && <p>{v.evaluacion.instrucciones}</p>}
          <ul className="ingreso-datos">
            <li>{v.preguntas.length} preguntas</li>
            <li>{v.evaluacion.duracionMinutos} minutos</li>
          </ul>
          {v.evaluacion.asistenteActivo && (
            <div className="metis-intro">
              <div className="metis-avatar" aria-hidden="true">M</div>
              <p>
                <strong>Soy Metis.</strong> No te voy a dar las respuestas, pero puedo ayudarte a pensar. Si una pregunta te cuesta, escríbeme. Tu
                profesor podrá ver nuestra conversación.
              </p>
            </div>
          )}
          <button className="btn btn-primary btn-block btn-lg" onClick={() => setFase('rindiendo')}>
            Comenzar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rendir ${chatAbierto ? 'chat-abierto' : ''}`}>
      <header className="rendir-top">
        <div className="rendir-titulo">
          <strong>{v.evaluacion.titulo}</strong>
          <span className="muted small">
            {v.estudiante ? `${v.estudiante.nombre} ${v.estudiante.apellido}` : 'Vista previa del profesor'}
          </span>
        </div>
        <div className={`rendir-reloj ${restante < 120 ? 'urgente' : ''}`} aria-live="polite" title="Tiempo restante">
          {reloj(restante)}
        </div>
        <button className="btn btn-primary" onClick={() => setFase('confirmar')}>
          Entregar
        </button>
      </header>

      <div className="rendir-cuerpo">
        <main className="rendir-main">
          <nav className="puntos" aria-label="Preguntas">
            {v.preguntas.map((q, i) => (
              <button key={q.id} className={`punto ${i === idx ? 'actual' : ''} ${respondida(q) ? 'hecha' : ''}`} onClick={() => setIdx(i)} aria-label={`Pregunta ${q.numero}${respondida(q) ? ', respondida' : ''}`}>
                {q.numero}
              </button>
            ))}
          </nav>

          <PreguntaVista p={p} r={respuestas[p.id]} onChange={responder} />

          <div className="rendir-nav">
            <button className="btn btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
              ← Anterior
            </button>
            <span className="muted small">
              {v.preguntas.length - sinResponder} de {v.preguntas.length} respondidas
            </span>
            {idx < v.preguntas.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>
                Siguiente →
              </button>
            ) : (
              <button className="btn btn-green" onClick={() => setFase('confirmar')}>
                Terminar
              </button>
            )}
          </div>
        </main>

        {v.evaluacion.asistenteActivo && (
          <ChatMetis
            clave={clave}
            p={p}
            mensajes={mensajes.filter((m) => m.preguntaId === p.id)}
            onMensajes={(nuevos) => setMensajes((m) => [...m, ...nuevos])}
            onCerrar={() => setChatAbierto(false)}
          />
        )}
      </div>
      {v.evaluacion.asistenteActivo && (
        <button className="btn-metis-movil" onClick={() => setChatAbierto(true)}>
          Pedir ayuda a Metis
        </button>
      )}

      {fase === 'confirmar' && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-label="Entregar evaluación">
            <h3>¿Entregar la evaluación?</h3>
            {sinResponder > 0 ? (
              <p>
                Te {sinResponder === 1 ? 'falta 1 pregunta' : `faltan ${sinResponder} preguntas`} por responder. Después de entregar no podrás cambiar
                tus respuestas.
              </p>
            ) : (
              <p>Respondiste todas las preguntas. Después de entregar no podrás cambiar tus respuestas.</p>
            )}
            {error && <div className="alert">{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setFase('rindiendo')}>
                Seguir respondiendo
              </button>
              <button className="btn btn-primary" onClick={entregar}>
                Entregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PreguntaVista({ p, r, onChange }: { p: PreguntaEst; r?: Respuesta; onChange: (r: Respuesta) => void }) {
  const sel = r?.seleccion ?? [];
  const elegir = (i: number) => {
    const seleccion = p.tipo === 'Multiple' ? (sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort()) : [i];
    onChange({ preguntaId: p.id, seleccion, texto: null });
  };

  // Lectura en voz alta (apoyo para estudiantes que lo necesiten).
  const leer = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const texto = [p.enunciado, ...p.opciones.map((o, i) => `${p.tipo === 'VerdaderoFalso' ? '' : `${String.fromCharCode(65 + i)}: `}${o}`)].join('. ');
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = 'es-CL';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  return (
    <section className="pregunta-vista" aria-labelledby={`enunciado-${p.id}`}>
      <div className="pregunta-meta">
        <span>
          Pregunta {p.numero} · {p.tipo === 'Multiple' ? 'Puedes marcar más de una' : p.tipo === 'Abierta' ? 'Escribe tu respuesta' : 'Marca una alternativa'}
        </span>
        <span>
          {p.puntaje} {p.puntaje === 1 ? 'punto' : 'puntos'}
        </span>
      </div>
      <h2 id={`enunciado-${p.id}`}>{p.enunciado}</h2>
      <button className="btn btn-ghost btn-sm" onClick={leer} type="button">
        🔊 Escuchar pregunta
      </button>
      {p.tipo === 'Abierta' ? (
        <textarea
          className="respuesta-texto"
          rows={6}
          value={r?.texto ?? ''}
          placeholder="Escribe aquí tu respuesta…"
          onChange={(e) => onChange({ preguntaId: p.id, seleccion: [], texto: e.target.value })}
          aria-label="Tu respuesta"
        />
      ) : (
        <div className="alternativas" role={p.tipo === 'Multiple' ? 'group' : 'radiogroup'}>
          {p.opciones.map((o, i) => (
            <button key={i} type="button" role={p.tipo === 'Multiple' ? 'checkbox' : 'radio'} aria-checked={sel.includes(i)} className={`alternativa ${sel.includes(i) ? 'elegida' : ''}`} onClick={() => elegir(i)}>
              <span className="alt-letra">{p.tipo === 'VerdaderoFalso' ? (i === 0 ? 'V' : 'F') : String.fromCharCode(65 + i)}</span>
              {o}
            </button>
          ))}
        </div>
      )}
      {p.oa && (
        <p className="pregunta-oa-est small muted" title={p.oa.descripcion}>
          Objetivo: {p.oa.codigoOficial}
        </p>
      )}
    </section>
  );
}

function ChatMetis({ clave, p, mensajes, onMensajes, onCerrar }: { clave: string; p: PreguntaEst; mensajes: Mensaje[]; onMensajes: (m: Mensaje[]) => void; onCerrar: () => void }) {
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);
  const sugerencias = useMemo(() => ['No entiendo la pregunta', 'Dame una pista', '¿Por dónde empiezo?'], []);

  useEffect(() => {
    fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes.length, pensando, p.id]);

  const enviar = async (contenido: string) => {
    const t = contenido.trim();
    if (!t || pensando) return;
    setTexto('');
    setError(null);
    onMensajes([{ preguntaId: p.id, rol: 'estudiante', texto: t, nivelAyuda: null }]);
    setPensando(true);
    try {
      const [r] = await Promise.all([
        api<{ texto: string; nivel: number | null }>(`/publico/intentos/${clave}/mensajes`, { method: 'POST', json: { preguntaId: p.id, texto: t } }),
        new Promise((ok) => setTimeout(ok, 700)),
      ]);
      onMensajes([{ preguntaId: p.id, rol: 'metis', texto: r.texto, nivelAyuda: r.nivel }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPensando(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    enviar(texto);
  };

  return (
    <aside className="chat-metis" aria-label="Asistente Metis">
      <div className="chat-head">
        <div className="metis-avatar" aria-hidden="true">M</div>
        <div>
          <strong>Metis</strong>
          <div className="small muted">Te ayudo a pensar la pregunta {p.numero}</div>
        </div>
        <button className="icon-btn chat-cerrar" onClick={onCerrar} aria-label="Cerrar ayuda">
          ✕
        </button>
      </div>
      <div className="chat-mensajes">
        {!p.asistente ? (
          <div className="chat-bloqueado">En esta pregunta tu profesor pidió que trabajes sin ayuda. ¡Confía en lo que sabes!</div>
        ) : (
          <>
            {mensajes.length === 0 && (
              <div className="burbuja metis">¿Te ayudo con esta pregunta? Cuéntame qué parte te cuesta. Recuerda: no te daré la respuesta, pero sí pistas para pensar.</div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`burbuja ${m.rol}`} style={{ whiteSpace: 'pre-line' }}>
                {m.texto}
              </div>
            ))}
            {pensando && (
              <div className="burbuja metis escribiendo" aria-label="Metis está escribiendo">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={fin} />
          </>
        )}
      </div>
      {p.asistente && (
        <>
          {mensajes.length === 0 && (
            <div className="sugerencias">
              {sugerencias.map((s) => (
                <button key={s} type="button" onClick={() => enviar(s)} disabled={pensando}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {error && <div className="alert small">{error}</div>}
          <form className="chat-input" onSubmit={submit}>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe tu duda…" maxLength={600} aria-label="Mensaje para Metis" />
            <button className="btn btn-primary" disabled={!texto.trim() || pensando}>
              Enviar
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
