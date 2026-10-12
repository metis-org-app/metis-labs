'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type CursoOpcion = { id: number; nombre: string; anio: number };

const SUGERENCIAS = ['Prueba formativa sobre seres vivos con ejemplos del patio', 'Control de comprensión lectora con preguntas abiertas', 'Repaso de fracciones antes de la prueba sumativa'];

// Punto de entrada principal del producto: una consigna breve y Metis arma la evaluación.
export function HeroIa({ cursos, compacto }: { cursos: CursoOpcion[]; compacto?: boolean }) {
  const router = useRouter();
  const [consigna, setConsigna] = useState('');
  const [cursoId, setCursoId] = useState(cursos[0]?.id ?? 0);
  const [iaActiva, setIaActiva] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ disponible: boolean }>('/ia/estado').then((r) => setIaActiva(r.disponible)).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!cursos.some((c) => c.id === cursoId)) setCursoId(cursos[0]?.id ?? 0);
  }, [cursos, cursoId]);

  const generar = () => {
    if (!cursoId) return;
    const q = new URLSearchParams({ modo: 'ia' });
    if (consigna.trim()) q.set('consigna', consigna.trim());
    router.push(`/cursos/${cursoId}/evaluaciones/nueva?${q}`);
  };

  return (
    <section className={`hero-ia ${compacto ? 'hero-ia-compacto' : ''}`} aria-label="Crear evaluación con IA">
      <div className="hero-ia-texto">
        <div className="hero-ia-kicker">
          <span>✦ Evalia · Evaluaciones con IA</span>
          {iaActiva !== null && <span className={`hero-ia-estado ${iaActiva ? 'on' : ''}`}>{iaActiva ? 'IA activa' : 'Modo demo sin IA'}</span>}
        </div>
        <h2>{compacto ? 'Crea la próxima evaluación con IA' : 'Tu próxima evaluación, lista en minutos'}</h2>
        {!compacto && (
          <p>Escribe una idea y Metis arma las preguntas desde los OA del curso, con pistas para cada estudiante y adecuaciones PIE. Tú revisas y publicas.</p>
        )}
        <div className="hero-ia-box">
          <textarea
            value={consigna}
            onChange={(e) => setConsigna(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && generar()}
            placeholder="Ej: prueba formativa sobre seres vivos y sus necesidades, con ejemplos del patio del colegio."
            rows={compacto ? 2 : 3}
            aria-label="Describe tu evaluación"
          />
          <div className="hero-ia-bar">
            {cursos.length > 1 && (
              <select value={cursoId} onChange={(e) => setCursoId(Number(e.target.value))} aria-label="Curso">
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} {c.anio}
                  </option>
                ))}
              </select>
            )}
            {cursoId > 0 && (
              <Link className="hero-ia-otras" href={`/cursos/${cursoId}/evaluaciones/nueva`}>
                Pegar apuntes o subir archivo
              </Link>
            )}
            <button className="btn btn-ia" onClick={generar} disabled={!cursoId}>
              ✦ Generar evaluación
            </button>
          </div>
        </div>
        {!compacto && (
          <div className="hero-ia-sugerencias">
            {SUGERENCIAS.map((s) => (
              <button key={s} type="button" onClick={() => setConsigna(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {!compacto && (
        <div className="hero-ia-visual" aria-hidden="true">
          <img src="/metis.png" alt="" />
          <ul>
            <li>Alineada a los OA</li>
            <li>Pistas graduales, sin dar la respuesta</li>
            <li>Ves cada conversación</li>
          </ul>
        </div>
      )}
    </section>
  );
}
