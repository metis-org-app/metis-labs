'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { CursoDetalle } from '@/lib/types';
import { NuevaEvaluacion } from '@/components/curso/evaluaciones';
import { CrearConIa, type Modo } from '@/components/evaluacion/crear';
import { ErrorBox, PageHead } from '@/components/ui';

const OPCIONES: { modo: Modo | 'cero'; icono: string; titulo: string; texto: string; clase: string }[] = [
  { modo: 'ia', icono: '✦', titulo: 'Generar con IA', texto: 'Escribe una consigna breve y Metis crea la evaluación completa desde los OA del curso: preguntas, pauta, pistas para cada estudiante y adecuaciones.', clase: 'op-ia' },
  { modo: 'pegar', icono: '≡', titulo: 'Pegar contenido', texto: 'Convierte apuntes, un texto o un temario en preguntas alineadas a los OA.', clase: 'op-pegar' },
  { modo: 'archivo', icono: '⇪', titulo: 'Importar archivo', texto: 'Sube un PDF, Word o PowerPoint como material de origen.', clase: 'op-archivo' },
  { modo: 'cero', icono: '✎', titulo: 'Desde cero', texto: 'Escribe tú cada pregunta en el editor.', clase: 'op-cero' },
];

export default function NuevaEvaluacionPage() {
  return (
    <Suspense>
      <Nueva />
    </Suspense>
  );
}

function Nueva() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const [curso, setCurso] = useState<CursoDetalle | null>(null);
  // Desde el acceso "Generar evaluación" se llega directo al flujo con IA y la consigna escrita.
  const [modo, setModo] = useState<Modo | 'cero' | null>(params.get('modo') === 'ia' ? 'ia' : null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CursoDetalle>(`/cursos/${id}`).then(setCurso).catch((e) => setError(e.message));
  }, [id]);

  if (!curso) return error ? <ErrorBox error={error} /> : <p className="muted">Cargando…</p>;
  const titulo = modo && modo !== 'cero' ? OPCIONES.find((o) => o.modo === modo)!.titulo : 'Nueva evaluación';

  return (
    <>
      <PageHead
        migas={[['Mis cursos', '/cursos'], [curso.nombre, `/cursos/${id}`], ['Evaluaciones', `/cursos/${id}?tab=evaluaciones`], [titulo]]}
        title={titulo}
        subtitle={`${curso.nombre} ${curso.anio}`}
      />
      {(modo === null || modo === 'cero') && (
        <section className="empezar">
          <p className="empezar-kicker">Nueva evaluación</p>
          <h2>¿Cómo quieres empezar?</h2>
          <p className="muted">Elige un punto de partida. Podrás revisar y editar cada pregunta antes de publicar.</p>
          <div className="empezar-grid">
            {OPCIONES.map((o) => (
              <button key={o.modo} className={`empezar-card ${o.clase}`} onClick={() => setModo(o.modo)}>
                <span className="empezar-icono" aria-hidden="true">
                  {o.icono}
                </span>
                <span className="empezar-texto">
                  {o.modo === 'ia' && <span className="empezar-badge">Recomendado</span>}
                  <strong>{o.titulo}</strong>
                  <span>{o.texto}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="muted small">¿No sabes cuál elegir? Empieza con IA: siempre tendrás el control de cada pregunta.</p>
        </section>
      )}
      {modo && modo !== 'cero' && <CrearConIa key={modo} curso={curso} modo={modo} onVolver={() => setModo(null)} consignaInicial={modo === 'ia' ? (params.get('consigna') ?? '') : ''} />}
      {modo === 'cero' && <NuevaEvaluacion curso={curso} onClose={() => setModo(null)} />}
    </>
  );
}
