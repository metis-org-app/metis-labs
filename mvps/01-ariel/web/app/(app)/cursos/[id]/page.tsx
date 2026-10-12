'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { avisarCursos } from '@/lib/eventos';
import type { CursoDetalle } from '@/lib/types';
import { confirmar } from '@/components/confirm';
import { ErrorBox, PageHead, Tabs } from '@/components/ui';
import { ResumenCurso } from '@/components/curso/resumen';
import { EstudiantesCurso } from '@/components/curso/estudiantes';
import { CurriculoCurso } from '@/components/curso/curriculo';
import { PlanificacionCurso } from '@/components/curso/planificacion';
import { MaterialesCurso } from '@/components/curso/materiales';
import { EvaluacionesCurso } from '@/components/curso/evaluaciones';

type Tab = 'resumen' | 'estudiantes' | 'curriculo' | 'planificacion' | 'materiales' | 'evaluaciones';

export default function CursoPage() {
  return (
    <Suspense>
      <Curso />
    </Suspense>
  );
}

function Curso() {
  const { id } = useParams<{ id: string }>();
  const cursoId = Number(id);
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'resumen';
  const [curso, setCurso] = useState<CursoDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => api<CursoDetalle>(`/cursos/${cursoId}`).then(setCurso).catch((e) => setError(e.message)), [cursoId]);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const irA = (t: Tab) => router.replace(`/cursos/${cursoId}${t === 'resumen' ? '' : `?tab=${t}`}`, { scroll: false });

  const eliminar = async () => {
    if (!curso) return;
    const ok = await confirmar(`¿Eliminar ${curso.nombre} (${curso.anio})? Se borran su planificación, materiales propios y evaluaciones. Los estudiantes quedan sin curso.`);
    if (!ok) return;
    await api(`/cursos/${cursoId}`, { method: 'DELETE' });
    avisarCursos();
    router.replace('/cursos');
  };

  if (error) return <ErrorBox error={error} />;
  if (!curso) return <p className="muted">Cargando…</p>;

  return (
    <>
      <PageHead
        migas={[['Mis cursos', '/cursos'], [curso.nombre]]}
        title={
          <>
            {curso.nombre} <span className="muted light">{curso.anio}</span>
          </>
        }
        subtitle={`${curso.ciclo} · ${curso.totalEstudiantes} estudiantes · ${curso.totalOas} OA en su currículum`}
        action={
          <button className="btn btn-danger-ghost btn-sm" onClick={eliminar}>
            Eliminar curso
          </button>
        }
      />
      <Tabs<Tab>
        activo={tab}
        onChange={irA}
        tabs={[
          ['resumen', 'Resumen'],
          ['estudiantes', 'Estudiantes', curso.totalEstudiantes],
          ['curriculo', 'Currículum', curso.totalOas],
          ['planificacion', 'Planificación'],
          ['materiales', 'Materiales'],
          ['evaluaciones', 'Evaluaciones'],
        ]}
      />
      <div className="tab-panel">
        {tab === 'resumen' && <ResumenCurso cursoId={cursoId} irA={irA} />}
        {tab === 'estudiantes' && <EstudiantesCurso cursoId={cursoId} onChange={cargar} />}
        {tab === 'curriculo' && <CurriculoCurso curso={curso} onChange={cargar} />}
        {tab === 'planificacion' && <PlanificacionCurso cursoId={cursoId} />}
        {tab === 'materiales' && <MaterialesCurso curso={curso} />}
        {tab === 'evaluaciones' && <EvaluacionesCurso curso={curso} />}
      </div>
    </>
  );
}
