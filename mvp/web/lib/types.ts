export type Nivel = { id: number; codigo: string; nombre: string };
export type Asignatura = { id: number; codigo: string; nombre: string };

export type Oa = {
  id: number;
  codigo: string;
  numero: number;
  eje: string | null;
  descripcion: string;
  asignaturaId: number;
  asignatura: string;
  nivelId: number;
  nivel: string;
  nivelOrden: number;
};

export type CursoOa = {
  id: number;
  codigo: string;
  numero: number;
  eje: string | null;
  descripcion: string;
  asignatura: string;
  nivel: string;
  excluidos: number;
};

export type Curso = {
  id: number;
  nivelId: number;
  nivel: string;
  letra: string;
  anio: number;
  nombre: string;
  totalOas: number;
  totalEstudiantes: number;
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
  observaciones: string | null;
};

export type EstudianteBreve = {
  id: number;
  nombre: string;
  apellido: string;
  diagnostico: string | null;
  nivelTea?: number | null;
  tipoPie?: TipoPie;
};

export type Panorama = {
  curso: { id: number; nombre: string; anio: number };
  totalEstudiantes: number;
  permanentes: EstudianteBreve[];
  transitorios: EstudianteBreve[];
  sinPie: EstudianteBreve[];
  diagnosticos: { diagnostico: string; total: number }[];
  oasPorAsignatura: { asignatura: string; total: number }[];
  totalOas: number;
  planificaciones: number;
  exclusiones: number;
};

export type Planificacion = {
  id: number;
  cursoId: number;
  semanaInicio: string;
  titulo: string;
  actividades: string | null;
  adecuaciones: string | null;
  objetivos: { id: number; codigo: string; asignatura: string; descripcion: string }[];
};

export type Dashboard = {
  cursos: number;
  estudiantes: number;
  oasAsignados: number;
  planificaciones: number;
  oasCurriculum: number;
  diagnosticos: { diagnostico: string; total: number }[];
  resumenCursos: { id: number; nombre: string; anio: number; estudiantes: number; oas: number; planificaciones: number }[];
};
