// Estado de la demo de presentación: los mismos datos que siembra la API .NET, guardados en el navegador.
// La semilla se exporta desde la base sembrada (ver demo/README.md). Lo que cada persona crea queda en su navegador.
import semilla from './datos/semilla.json';

export type EstadoOa = 'Pendiente' | 'EnProgreso' | 'Cubierto';
export type TipoPie = 'Ninguno' | 'Permanente' | 'Transitorio';
export type TipoPregunta = 'Unica' | 'Multiple' | 'VerdaderoFalso' | 'Abierta';
export type TipoEvaluacion = 'Formativa' | 'Sumativa';
export type EstadoEvaluacion = 'Borrador' | 'Publicada' | 'Cerrada';

export type Profesor = { id: number; nombre: string; email: string; rol: string };
export type Asignatura = { id: number; codigo: string; nombre: string; prefijo: string | null; area: string | null; color: string };
export type Nivel = { id: number; codigo: string; codigoMineduc: string; nombre: string; orden: number };
export type Objetivo = { id: number; asignaturaId: number; nivelId: number; numero: number; eje: string | null; descripcion: string; fuente: string | null };
export type Curso = { id: number; profesorId: number; nivelId: number; letra: string; anio: number };
export type CursoOA = { cursoId: number; objetivoId: number; estado: EstadoOa; asignadoEn: string };
export type Estudiante = {
  id: number; cursoId: number | null; rut: string; nombre: string; apellido: string; fechaNacimiento: string | null;
  diagnostico: string | null; nivelTea: number | null; tipoPie: TipoPie; apoyos: string | null;
  nombreApoderado: string | null; telefonoApoderado: string | null; emailApoderado: string | null; observaciones: string | null;
};
export type Exclusion = { cursoId: number; objetivoId: number; estudianteId: number };
export type Planificacion = {
  id: number; cursoId: number; semanaInicio: string; titulo: string; actividades: string | null; adecuaciones: string | null; objetivoIds: number[];
};
export type Material = {
  id: number; titulo: string; tipo: string; asignaturaId: number; nivelId: number; cursoId: number | null;
  descripcion: string | null; contenido: string | null; url: string | null; lecturaFacil: boolean;
  archivoNombre: string | null; archivoTipo: string | null; archivoTamano: number | null; creadoEn: string; objetivoIds: number[];
};
export type Evaluacion = {
  id: number; cursoId: number; asignaturaId: number; titulo: string; instrucciones: string | null; tipo: TipoEvaluacion;
  estado: EstadoEvaluacion; duracionMinutos: number; exigencia: number; token: string; asistenteActivo: boolean; nivelAyuda: number;
  instruccionesAsistente: string | null; dificultad: string | null; generadaConIa: boolean; creadaEn: string; publicadaEn: string | null;
};
export type Pregunta = {
  id: number; evaluacionId: number; orden: number; tipo: TipoPregunta; enunciado: string; opciones: string[]; correctas: number[];
  puntaje: number; objetivoId: number | null; asistenteHabilitado: boolean; justificacion: string | null; fuente: string | null; pistaDocente: string | null;
};
export type Respuesta = { preguntaId: number; seleccion: number[]; texto: string | null; puntaje: number | null; comentario: string | null };
export type Intento = {
  id: number; evaluacionId: number; estudianteId: number | null; esPrueba: boolean; clave: string; iniciadoEn: string;
  entregadoEn: string | null; respuestas: Respuesta[]; puntajeObtenido: number | null; puntajeMaximo: number; nota: number | null; revisionPendiente: boolean;
};
export type Mensaje = {
  id: number; intentoId: number; preguntaId: number | null; rol: 'estudiante' | 'metis'; texto: string; nivelAyuda: number | null; porIa: boolean; creadoEn: string;
};

export type Db = {
  version: number;
  profesores: Profesor[];
  asignaturas: Asignatura[];
  niveles: Nivel[];
  objetivos: Objetivo[];
  cursos: Curso[];
  cursoObjetivos: CursoOA[];
  estudiantes: Estudiante[];
  exclusiones: Exclusion[];
  planificaciones: Planificacion[];
  materiales: Material[];
  evaluaciones: Evaluacion[];
  preguntas: Pregunta[];
  intentos: Intento[];
  mensajes: Mensaje[];
};

const VERSION = 1;
const CLAVE = 'metis.demo.v1';

// Archivos subidos en esta sesión (no caben en localStorage): se pierden al recargar.
export const archivos = new Map<number, Blob>();

let db: Db | null = null;

type Semilla = typeof semilla;

// Las fechas de la semilla se corren a "ahora" para que la demo siempre se vea reciente (las semanas, en semanas completas).
function desplazar(s: Semilla, oas: Objetivo[]): Db {
  const delta = Date.now() - new Date(s.exportadoEn).getTime();
  const semanas = Math.round(delta / (7 * 86_400_000));
  const fecha = (v: string | null) => (v ? new Date(new Date(v).getTime() + delta).toISOString() : null);
  const dia = (v: string) => {
    const d = new Date(`${v}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + semanas * 7);
    return d.toISOString().slice(0, 10);
  };
  const porPlan = new Map<number, number[]>();
  for (const x of s.planificacionObjetivos) porPlan.set(x.planificacionId, [...(porPlan.get(x.planificacionId) ?? []), x.objetivosId]);
  const porMaterial = new Map<number, number[]>();
  for (const x of s.materialObjetivos) porMaterial.set(x.materialId, [...(porMaterial.get(x.materialId) ?? []), x.objetivosId]);

  return {
    version: VERSION,
    profesores: s.profesores,
    asignaturas: s.asignaturas,
    niveles: s.niveles,
    objetivos: oas,
    cursos: s.cursos,
    cursoObjetivos: s.cursoObjetivos.map((c) => ({ ...c, estado: c.estado as EstadoOa, asignadoEn: fecha(c.asignadoEn)! })),
    estudiantes: s.estudiantes.map((e) => ({ ...e, tipoPie: e.tipoPie as TipoPie })),
    exclusiones: s.exclusiones,
    planificaciones: s.planificaciones.map((p) => ({ ...p, semanaInicio: dia(p.semanaInicio), objetivoIds: porPlan.get(p.id) ?? [] })),
    materiales: s.materiales.map((m) => ({ ...m, creadoEn: fecha(m.creadoEn)!, objetivoIds: porMaterial.get(m.id) ?? [] })),
    evaluaciones: s.evaluaciones.map((e) => ({
      ...e, tipo: e.tipo as TipoEvaluacion, estado: e.estado as EstadoEvaluacion, creadaEn: fecha(e.creadaEn)!, publicadaEn: fecha(e.publicadaEn),
    })),
    preguntas: s.preguntas.map((p) => ({ ...p, tipo: p.tipo as TipoPregunta })),
    intentos: s.intentos.map((i) => ({ ...i, iniciadoEn: fecha(i.iniciadoEn)!, entregadoEn: fecha(i.entregadoEn) })),
    mensajes: s.mensajes.map((m) => ({ ...m, rol: m.rol as Mensaje['rol'], creadoEn: fecha(m.creadoEn)! })),
  } as Db;
}

// Los OA (más de 1.700) van en un archivo aparte y compacto que se carga solo una vez.
async function cargarOas(): Promise<Objetivo[]> {
  const { fuentes, oas } = (await import('./datos/oas.json')).default as { fuentes: string[]; oas: [number, number, number, number, string | null, string, number | null][] };
  return oas.map(([id, asignaturaId, nivelId, numero, eje, descripcion, f]) => ({
    id, asignaturaId, nivelId, numero, eje, descripcion, fuente: f === null ? null : fuentes[f],
  }));
}

export async function obtenerDb(): Promise<Db> {
  if (db) return db;
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) {
      const d = JSON.parse(guardado) as Db;
      if (d.version === VERSION) return (db = d);
    }
  } catch {
    /* almacenamiento no disponible o dañado: se parte desde la semilla */
  }
  db = desplazar(semilla, await cargarOas());
  return db;
}

export function guardar() {
  if (!db) return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(db));
  } catch {
    /* sin espacio o en modo privado: la demo sigue funcionando en memoria */
  }
}

export function restablecer() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
  db = null;
  archivos.clear();
}

export function siguienteId(lista: { id: number }[]) {
  return lista.reduce((max, x) => Math.max(max, x.id), 0) + 1;
}
