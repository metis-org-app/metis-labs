'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Evaluacion } from '@/lib/types';
import { confirmar } from '@/components/confirm';
import { EditorEvaluacion } from '@/components/evaluacion/editor';
import { ResultadosEvaluacion } from '@/components/evaluacion/resultados';
import { ErrorBox, EstadoEval, Modal, PageHead, Tabs } from '@/components/ui';

type Vista = 'editor' | 'resultados';

export default function EvaluacionPage() {
  return (
    <Suspense>
      <EvaluacionView />
    </Suspense>
  );
}

function EvaluacionView() {
  const { id, evalId } = useParams<{ id: string; evalId: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const vista = (params.get('vista') as Vista) || 'editor';
  const [ev, setEv] = useState<Evaluacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState(false);

  const cargar = useCallback(() => api<Evaluacion>(`/evaluaciones/${evalId}`).then(setEv).catch((e) => setError(e.message)), [evalId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const irA = (v: Vista) => router.replace(`/cursos/${id}/evaluaciones/${evalId}${v === 'editor' ? '' : '?vista=resultados'}`, { scroll: false });

  const accion = async (ruta: string, msg?: string) => {
    if (msg && !(await confirmar(msg, 'Confirmar'))) return;
    setError(null);
    try {
      await api(`/evaluaciones/${evalId}/${ruta}`, { method: 'POST' });
      await cargar();
      if (ruta === 'publicar') setLink(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const vistaPrevia = async () => {
    setError(null);
    try {
      const r = await api<{ clave: string }>(`/evaluaciones/${evalId}/vista-previa`, { method: 'POST' });
      window.open(`/rendir/intento/${r.clave}`, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const duplicar = async () => {
    const r = await api<{ id: number }>(`/evaluaciones/${evalId}/duplicar`, { method: 'POST' });
    router.push(`/cursos/${id}/evaluaciones/${r.id}`);
  };

  const eliminar = async () => {
    if (!(await confirmar('¿Eliminar esta evaluación? Se borran también sus entregas y conversaciones.'))) return;
    await api(`/evaluaciones/${evalId}`, { method: 'DELETE' });
    router.replace(`/cursos/${id}?tab=evaluaciones`);
  };

  if (!ev) return error ? <ErrorBox error={error} /> : <p className="muted">Cargando…</p>;

  return (
    <>
      <PageHead
        migas={[['Mis cursos', '/cursos'], [ev.curso, `/cursos/${id}`], ['Evaluaciones', `/cursos/${id}?tab=evaluaciones`], [ev.titulo]]}
        title={ev.titulo}
        subtitle={
          <span className="head-meta">
            <EstadoEval estado={ev.estado} /> {ev.tipo} · {ev.asignatura} · {ev.preguntas.length} preguntas · {ev.duracionMinutos} min
          </span>
        }
        action={
          <>
            <button className="btn btn-ghost" onClick={vistaPrevia} title="Rinde la evaluación como estudiante, con Metis">
              Vista previa
            </button>
            {ev.estado === 'Borrador' && (
              <button className="btn btn-green" onClick={() => accion('publicar')}>
                Publicar
              </button>
            )}
            {ev.estado === 'Publicada' && (
              <>
                <button className="btn btn-primary" onClick={() => setLink(true)}>
                  Link para estudiantes
                </button>
                <button className="btn btn-ghost" onClick={() => accion('cerrar', 'Al cerrar, los estudiantes ya no podrán entrar ni entregar.')}>
                  Cerrar
                </button>
              </>
            )}
            {ev.estado === 'Cerrada' && (
              <button className="btn btn-ghost" onClick={() => accion('reabrir')}>
                Reabrir
              </button>
            )}
            <details className="menu-mas">
              <summary className="btn btn-ghost" aria-label="Más acciones">
                ⋯
              </summary>
              <div>
                <button onClick={duplicar}>Duplicar</button>
                <button className="danger" onClick={eliminar}>
                  Eliminar
                </button>
              </div>
            </details>
          </>
        }
      />
      <ErrorBox error={error} />
      <Tabs<Vista>
        activo={vista}
        onChange={irA}
        tabs={[
          ['editor', 'Preguntas y configuración'],
          ['resultados', 'Resultados', ev.entregas],
        ]}
      />
      <div className="tab-panel">
        {vista === 'editor' && <EditorEvaluacion ev={ev} onSaved={cargar} />}
        {vista === 'resultados' &&
          (ev.estado === 'Borrador' ? (
            <div className="empty">Publica la evaluación para compartir el link con tus estudiantes y ver aquí sus resultados.</div>
          ) : (
            <ResultadosEvaluacion evaluacionId={ev.id} />
          ))}
      </div>
      {link && <LinkModal token={ev.token} titulo={ev.titulo} curso={ev.curso} onClose={() => setLink(false)} />}
    </>
  );
}

function LinkModal({ token, titulo, curso, onClose }: { token: string; titulo: string; curso: string; onClose: () => void }) {
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/rendir/${token}`;
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      (document.getElementById('link-eval') as HTMLInputElement | null)?.select();
    }
  };
  return (
    <Modal title="Link para estudiantes" onClose={onClose}>
      <p>
        Comparte este link con {curso}. Cada estudiante entra con su RUT, rinde “{titulo}” con Metis a su lado y entrega una sola vez.
      </p>
      <div className="copy-row">
        <input id="link-eval" readOnly value={url} onFocus={(e) => e.target.select()} />
        <button className="btn btn-primary" onClick={copiar}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <p className="muted small">Los estudiantes con adecuaciones por OA verán solo las preguntas que les corresponden.</p>
      <div className="modal-actions">
        <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">
          Abrir
        </a>
        <button className="btn btn-primary" onClick={onClose}>
          Listo
        </button>
      </div>
    </Modal>
  );
}
