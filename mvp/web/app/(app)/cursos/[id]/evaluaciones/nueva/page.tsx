'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { CursoDetalle } from '@/lib/types';
import { NuevaEvaluacion } from '@/components/curso/evaluaciones';
import { CrearConIa, type Modo } from '@/components/evaluacion/crear';
import { ErrorBox, PageHead } from '@/components/ui';

const OPCIONES: { modo: Modo | 'cero'; icono: string; titulo: string; texto: string; clase: string }[] = [
  { modo: 'ia', icono: '★', titulo: 'Generar con IA', texto: 'Parte de una consigna breve y de los OA del curso: Metis crea la evaluación completa.', clase: 'op-ia' },
  { modo: 'pegar', icono: '≡', titulo: 'Pegar contenido', texto: 'Convierte apuntes, un texto o un temario en preguntas alineadas a los OA.', clase: 'op-pegar' },
  { modo: 'archivo', icono: '⇪', titulo: 'Importar archivo', texto: 'Sube un PDF, Word o PowerPoint como material de origen.', clase: 'op-archivo' },
  { modo: 'cero', icono: '✎', titulo: 'Desde cero', texto: 'Escribe tú cada pregunta en el editor.', clase: 'op-cero' },
];

export default function NuevaEvaluacionPage() {
  const { id } = useParams<{ id: string }>();
  const [curso, setCurso] = useState<CursoDetalle | null>(null);
  const [modo, setModo] = useState<Modo | 'cero' | null>(null);
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
                  <strong>{o.titulo}</strong>
                  <span>{o.texto}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="muted small">¿No sabes cuál elegir? Empieza con IA: siempre tendrás el control de cada pregunta.</p>
        </section>
      )}
      {modo && modo !== 'cero' && <CrearConIa key={modo} curso={curso} modo={modo} onVolver={() => setModo(null)} />}
      {modo === 'cero' && <NuevaEvaluacion curso={curso} onClose={() => setModo(null)} />}
    </>
  );
}
