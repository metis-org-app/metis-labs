'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Info = { titulo: string; instrucciones: string | null; asignatura: string; curso: string; anio: number; duracionMinutos: number; estado: string; asistenteActivo: boolean; preguntas: number };

export default function IngresoPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [rut, setRut] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api<Info>(`/publico/evaluaciones/${token}`).then(setInfo).catch((e) => setError(e.message));
  }, [token]);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const r = await api<{ clave: string }>(`/publico/evaluaciones/${token}/ingresar`, { method: 'POST', json: { rut } });
      router.replace(`/rendir/intento/${r.clave}`);
    } catch (err) {
      setError((err as Error).message);
      setCargando(false);
    }
  };

  return (
    <div className="rendir-ingreso">
      <form className="ingreso-card" onSubmit={entrar}>
        <div className="ingreso-brand">Metis</div>
        {!info && !error && <p className="muted">Cargando…</p>}
        {info && (
          <>
            <p className="muted small">
              {info.curso} · {info.asignatura}
            </p>
            <h1>{info.titulo}</h1>
            <ul className="ingreso-datos">
              <li>{info.preguntas} preguntas</li>
              <li>{info.duracionMinutos} minutos</li>
              {info.asistenteActivo && <li>Con Metis, tu asistente</li>}
            </ul>
            {info.estado === 'Cerrada' ? (
              <div className="alert">Esta evaluación ya cerró. Consulta con tu profesor.</div>
            ) : (
              <>
                <label>
                  Escribe tu RUT para comenzar
                  <input value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12.345.678-5" inputMode="text" autoComplete="off" required autoFocus />
                </label>
                {error && <div className="alert">{error}</div>}
                <button className="btn btn-primary btn-block btn-lg" disabled={cargando}>
                  {cargando ? 'Entrando…' : 'Comenzar'}
                </button>
              </>
            )}
          </>
        )}
        {!info && error && <div className="alert">{error}</div>}
      </form>
    </div>
  );
}
