'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { EvaluacionResumen } from '@/lib/types';
import { Empty, ErrorBox, PageHead, Stat } from '@/components/ui';
import { EvalCard } from '@/components/curso/evaluaciones';
import { HeroIa } from '@/components/evaluacion/hero-ia';

type CursoNav = { id: number; nombre: string; anio: number };
type Fila = { curso: CursoNav; e: EvaluacionResumen };

export default function EvaluacionesPage() {
  const [cursos, setCursos] = useState<CursoNav[] | null>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<CursoNav[]>('/cursos')
      .then(async (cs) => {
        setCursos(cs);
        const listas = await Promise.all(cs.map((c) => api<EvaluacionResumen[]>(`/cursos/${c.id}/evaluaciones`).then((l) => l.map((e) => ({ curso: c, e })))));
        setFilas(listas.flat().sort((a, b) => b.e.creadaEn.localeCompare(a.e.creadaEn)));
      })
      .catch((e) => setError(e.message));
  }, []);

  const abiertas = filas?.filter((f) => f.e.estado === 'Publicada').length ?? 0;
  const porRevisar = filas?.reduce((s, f) => s + f.e.porRevisar, 0) ?? 0;
  const entregas = filas?.reduce((s, f) => s + f.e.entregas, 0) ?? 0;

  return (
    <>
      <PageHead title="Evaluaciones" subtitle="Crea con IA, publica con un link o QR y sigue cómo Metis acompaña a cada estudiante." />
      <ErrorBox error={error} />
      {cursos && cursos.length === 0 && (
        <Empty>
          Para crear evaluaciones primero necesitas un curso. <Link href="/cursos">Crea el primero</Link>.
        </Empty>
      )}
      {cursos && cursos.length > 0 && <HeroIa cursos={cursos} />}
      {filas && (
        <>
          <div className="stats">
            <Stat valor={filas.length} label="Evaluaciones" />
            <Stat valor={abiertas} label="Abiertas ahora" color={abiertas ? 'green' : undefined} />
            <Stat valor={entregas} label="Entregas recibidas" />
            <Stat valor={porRevisar} label="Respuestas por revisar" color={porRevisar ? 'amber' : undefined} />
          </div>
          {filas.length === 0 && <Empty>Aún no hay evaluaciones. Escribe una idea arriba y Metis arma la primera.</Empty>}
          <div className="eval-grid">
            {filas.map(({ curso, e }) => (
              <EvalCard key={e.id} e={e} cursoId={curso.id} curso={`${curso.nombre} ${curso.anio}`} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
