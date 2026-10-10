import type { EstadoEvaluacion, EstadoOa, TipoMaterial, TipoPregunta } from './types';

export const nota = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(1).replace('.', ','));
export const num = (n: number | null | undefined) => (n == null ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));

export const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const ESTADO_OA: Record<EstadoOa, string> = { Pendiente: 'Pendiente', EnProgreso: 'En progreso', Cubierto: 'Cubierto' };

export const ESTADO_EVAL: Record<EstadoEvaluacion, string> = { Borrador: 'Borrador', Publicada: 'Abierta', Cerrada: 'Cerrada' };

export const TIPO_PREGUNTA: Record<TipoPregunta, string> = {
  Unica: 'Selección única',
  Multiple: 'Selección múltiple',
  VerdaderoFalso: 'Verdadero o falso',
  Abierta: 'Respuesta abierta',
};

export const TIPO_MATERIAL: Record<TipoMaterial, string> = {
  Guia: 'Guía',
  Presentacion: 'Presentación',
  Lectura: 'Lectura',
  Video: 'Video',
  Ficha: 'Ficha',
};

export const NIVEL_AYUDA: Record<number, string> = {
  1: 'Nivel 1 · Preguntas guía',
  2: 'Nivel 2 · Pistas',
  3: 'Nivel 3 · Ejemplos parciales',
};

export const edad = (iso: string | null) => {
  if (!iso) return null;
  const n = new Date(`${iso}T12:00:00`);
  const hoy = new Date();
  let e = hoy.getFullYear() - n.getFullYear();
  if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) e--;
  return e;
};
