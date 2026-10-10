export type Nivel = { id: number; codigo: string; nombre: string; ciclo: string };
export type Asignatura = { id: number; codigo: string; nombre: string; color: string };

export type Oa = {
  id: number;
  codigo: string;
  codigoOficial: string;
  numero: number;
  eje: string | null;
  descripcion: string;
  asignaturaId: number;
  asignatura: string;
  asignaturaCodigo: string;
  asignaturaColor: string;
  nivelId: number;
  nivel: string;
  nivelOrden: number;
  cursos?: { id: number; nombre: string; anio: number }[] | null;
};

export type EstadoOa = 'Pendiente' | 'EnProgreso' | 'Cubierto';
export type Logro = { porcentaje: number; nivel: string };

export type CursoOa = {
  oa: Oa;
  estado: EstadoOa;
  excluidos: number;
  planificaciones: number;
  evaluaciones: number;
  logro: Logro | null;
};

export type Curso = {
  id: number;
  nivelId: number;
  nivel: string;
  letra: string;
  anio: number;
  nombre: string;
  totalOas: number;
  oasCubiertos: number;
  totalEstudiantes: number;
  estudiantesPie: number;
  evaluacionesAbiertas: number;
  asignaturas: string[];
};

export type CursoDetalle = {
  id: number;
  nivelId: number;
  nivel: string;
  ciclo: string;
  letra: string;
  anio: number;
  nombre: string;
  totalEstudiantes: number;
  totalOas: number;
};

export type TipoPie = 'Ninguno' | 'Permanente' | 'Transitorio';

export type Estudiante = {
  id: number;
  rut: string;
  nombre: string;
  apellido: string;
  fechaNacimiento: string | null;
  cursoId: number | null;
  curso: string | null;
  diagnostico: string | null;
  nivelTea: number | null;
  tipoPie: TipoPie;
  apoyos: string | null;
  nombreApoderado: string | null;
  telefonoApoderado: string | null;
  emailApoderado: string | null;
  observaciones: string | null;
  exclusiones?: number;
};

export type FichaEstudiante = Omit<Estudiante, 'exclusiones'> & {
  exclusiones: Oa[];
  evaluaciones: {
    id: number;
    evaluacionId: number;
    titulo: string;
    tipo: string;
    asignatura: string;
    cursoId: number;
    entregadoEn: string | null;
    puntajeObtenido: number | null;
    puntajeMaximo: number;
    nota: number | null;
    revisionPendiente: boolean;
    ayudas: number;
  }[];
  logro: { oa: Oa; porcentaje: number; nivel: string }[];
};

export type EstudianteBreve = {
  id: number;
  nombre: string;
  apellido: string;
  diagnostico: string | null;
  nivelTea?: number | null;
  tipoPie?: TipoPie;
};

export type Resumen = {
  curso: { id: number; nombre: string; anio: number; ciclo: string };
  totalEstudiantes: number;
  permanentes: EstudianteBreve[];
  transitorios: EstudianteBreve[];
  sinPie: number;
  diagnosticos: { diagnostico: string; total: number }[];
  cobertura: { asignatura: string; color: string; total: number; cubiertos: number; enProgreso: number }[];
  totalOas: number;
  oasCubiertos: number;
  exclusiones: number;
  planificaciones: number;
  logroPromedio: number | null;
  oasPorLograr: number;
  evaluaciones: { id: number; titulo: string; estado: EstadoEvaluacion; tipo: TipoEvaluacion; entregas: number; porRevisar: number }[];
};

export type Planificacion = {
  id: number;
  cursoId: number;
  semanaInicio: string;
  titulo: string;
  actividades: string | null;
  adecuaciones: string | null;
  objetivos: Oa[];
};

export type TipoMaterial = 'Guia' | 'Presentacion' | 'Lectura' | 'Video' | 'Ficha';

export type Material = {
  id: number;
  titulo: string;
  tipo: TipoMaterial;
  asignaturaId: number;
  asignatura: string;
  asignaturaColor: string;
  nivelId: number;
  nivel: string;
  cursoId: number | null;
  curso: string | null;
  descripcion: string | null;
  contenido: string | null;
  url: string | null;
  lecturaFacil: boolean;
  creadoEn: string;
  objetivos: Oa[];
};

export type TipoEvaluacion = 'Formativa' | 'Sumativa';
export type EstadoEvaluacion = 'Borrador' | 'Publicada' | 'Cerrada';
export type TipoPregunta = 'Unica' | 'Multiple' | 'VerdaderoFalso' | 'Abierta';

export type EvaluacionResumen = {
  id: number;
  titulo: string;
  tipo: TipoEvaluacion;
  estado: EstadoEvaluacion;
  token: string;
  duracionMinutos: number;
  asignaturaId: number;
  asignatura: string;
  asignaturaColor: string;
  asistenteActivo: boolean;
  nivelAyuda: number;
  creadaEn: string;
  publicadaEn: string | null;
  preguntas: number;
  puntajeTotal: number;
  oas: Oa[];
  entregas: number;
  totalEstudiantes: number;
  porRevisar: number;
  promedio: number | null;
};

export type Pregunta = {
  id?: number;
  orden?: number;
  tipo: TipoPregunta;
  enunciado: string;
  opciones: string[];
  correctas: number[];
  puntaje: number;
  objetivoId: number | null;
  oa?: Oa | null;
  asistenteHabilitado: boolean;
  pistaDocente: string | null;
};

export type Evaluacion = {
  id: number;
  cursoId: number;
  curso: string;
  nivelId: number;
  titulo: string;
  instrucciones: string | null;
  asignaturaId: number;
  asignatura: string;
  tipo: TipoEvaluacion;
  estado: EstadoEvaluacion;
  duracionMinutos: number;
  exigencia: number;
  token: string;
  asistenteActivo: boolean;
  nivelAyuda: number;
  instruccionesAsistente: string | null;
  creadaEn: string;
  publicadaEn: string | null;
  entregas: number;
  bloqueada: boolean;
  preguntas: Pregunta[];
};

export type Resultados = {
  evaluacion: { id: number; titulo: string; cursoId: number; curso: string; tipo: TipoEvaluacion; estado: EstadoEvaluacion; exigencia: number; token: string };
  resumen: { estudiantes: number; entregas: number; enCurso: number; porRevisar: number; promedio: number | null; aprobados: number; conNota: number };
  estudiantes: {
    id: number;
    nombre: string;
    apellido: string;
    diagnostico: string | null;
    nivelTea: number | null;
    estado: 'Pendiente' | 'En curso' | 'Por revisar' | 'Revisada';
    intentoId: number | null;
    puntajeObtenido: number | null;
    puntajeMaximo: number | null;
    nota: number | null;
    ayudas: number;
  }[];
  preguntas: { id: number; orden: number; tipo: TipoPregunta; enunciado: string; oa: Oa | null; respondidas: number; logro: number | null; ayudas: number }[];
  logroOa: { oa: Oa; porcentaje: number; nivel: string }[];
};

export type MensajeMetis = { preguntaId?: number | null; rol: 'estudiante' | 'metis'; texto: string; nivelAyuda: number | null; creadoEn?: string };

export type IntentoDetalle = {
  id: number;
  evaluacionId: number;
  evaluacion: string;
  cursoId: number;
  exigencia: number;
  estudiante: { id: number; nombre: string; apellido: string; diagnostico: string | null; nivelTea: number | null } | null;
  iniciadoEn: string;
  entregadoEn: string | null;
  puntajeObtenido: number | null;
  puntajeMaximo: number;
  nota: number | null;
  revisionPendiente: boolean;
  omitidas: number;
  preguntas: {
    pregunta: Pregunta;
    respuesta: { seleccion: number[]; texto: string | null; puntaje: number | null; comentario: string | null } | null;
    conversacion: MensajeMetis[];
  }[];
};

export type Inicio = {
  cursos: { id: number; nombre: string; anio: number; estudiantes: number; estudiantesPie: number; oas: number; oasCubiertos: number; evaluacionesAbiertas: number }[];
  totales: { cursos: number; estudiantes: number; estudiantesPie: number; evaluacionesAbiertas: number };
  porRevisar: { id: number; titulo: string; cursoId: number; curso: string; total: number }[];
  abiertas: { id: number; titulo: string; cursoId: number; curso: string; entregas: number; estudiantes: number }[];
  borradores: { id: number; titulo: string; cursoId: number; curso: string }[];
};
