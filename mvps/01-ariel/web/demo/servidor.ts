// Backend simulado de la demo de presentación: responde las mismas rutas y formas que la API .NET (api/src/Endpoints),
// pero con los datos guardados en el navegador. Se activa con NEXT_PUBLIC_DEMO=1 (ver lib/api.ts).
import { BANCO } from './banco';
import {
  type Catalogo, ciclo, codigoOa, corregir, nivelLogro, normalizarRut, oaDto, recalcular, redondearPar, responderMetis,
} from './dominio';
import {
  archivos, type Db, type EstadoEvaluacion, type Evaluacion, type Intento, type Material, type Objetivo, type Pregunta,
  type Respuesta, type TipoEvaluacion, type TipoPregunta, guardar, obtenerDb, siguienteId,
} from './estado';

const TOKEN_DEMO = 'demo-metis';
const DEMO_EMAIL = 'profe@metis.cl';
const DEMO_PASSWORD = 'metis123';
const DIFICULTADES = ['Básico', 'Intermedio', 'Avanzado'];
const MAXIMO_PREGUNTAS = 30;
const TIPOS_ARCHIVO: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
};

class Problema extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const vacio = () => new Response(null, { status: 204 });
const fallo = (status: number, detail: string) => json({ status, detail }, status);
const NO_ENCONTRADO = new Problema(404, 'No encontrado');
const noEncontrado = () => NO_ENCONTRADO;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const limpio = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
const comparar = (a: string, b: string) => a.localeCompare(b, 'es');
const redondear = redondearPar; // como Math.Round de C#
const promedio = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const ahora = () => new Date().toISOString();

function ordenar<T>(xs: T[], ...claves: ((x: T) => string | number)[]) {
  return [...xs].sort((a, b) => {
    for (const k of claves) {
      const va = k(a);
      const vb = k(b);
      const c = typeof va === 'string' ? comparar(va, vb as string) : va - (vb as number);
      if (c !== 0) return c;
    }
    return 0;
  });
}

function nuevoToken(bytes = 9) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, 'x').replace(/\//g, 'y').replace(/=+$/, '');
}

type Ctx = { db: Db; cat: Catalogo; oas: Map<number, Objetivo> };

const nombreCurso = (c: Ctx, cursoId: number) => {
  const curso = c.db.cursos.find((x) => x.id === cursoId)!;
  return `${c.cat.niveles.get(curso.nivelId)!.nombre} ${curso.letra}`;
};
const oa = (c: Ctx, id: number) => oaDto(c.oas.get(id)!, c.cat);
const asig = (c: Ctx, id: number) => c.cat.asignaturas.get(id)!;
const preguntasDe = (c: Ctx, evaluacionId: number) => ordenar(c.db.preguntas.filter((p) => p.evaluacionId === evaluacionId), (p) => p.orden);

function cursoPropio(c: Ctx, id: number) {
  return c.db.cursos.find((x) => x.id === id && x.profesorId === 1) ?? null;
}

function evaluacionPropia(c: Ctx, id: number) {
  const e = c.db.evaluaciones.find((x) => x.id === id);
  return e && cursoPropio(c, e.cursoId) ? e : null;
}

// --- Logro.cs ---
function logroPorOa(c: Ctx, f: { cursoId?: number; estudianteId?: number; evaluacionId?: number }) {
  const intentos = c.db.intentos.filter((i) => {
    if (!i.entregadoEn || i.esPrueba) return false;
    if (f.cursoId !== undefined && c.db.evaluaciones.find((e) => e.id === i.evaluacionId)?.cursoId !== f.cursoId) return false;
    if (f.estudianteId !== undefined && i.estudianteId !== f.estudianteId) return false;
    if (f.evaluacionId !== undefined && i.evaluacionId !== f.evaluacionId) return false;
    return true;
  });
  const preguntas = new Map(c.db.preguntas.filter((p) => p.objetivoId !== null).map((p) => [p.id, p]));
  const acc = new Map<number, { obt: number; max: number }>();
  for (const r of intentos.flatMap((i) => i.respuestas)) {
    const p = preguntas.get(r.preguntaId);
    if (r.puntaje === null || !p) continue;
    const a = acc.get(p.objetivoId!) ?? { obt: 0, max: 0 };
    acc.set(p.objetivoId!, { obt: a.obt + r.puntaje, max: a.max + p.puntaje });
  }
  const res = new Map<number, { porcentaje: number; nivel: string }>();
  for (const [id, { obt, max }] of acc) {
    const porcentaje = max === 0 ? 0 : redondear((100 * obt) / max);
    res.set(id, { porcentaje, nivel: nivelLogro(porcentaje) });
  }
  return res;
}

// --- Rendicion.cs ---
function excluidos(c: Ctx, e: Evaluacion, estudianteId: number | null) {
  return new Set(estudianteId === null ? [] : c.db.exclusiones.filter((x) => x.cursoId === e.cursoId && x.estudianteId === estudianteId).map((x) => x.objetivoId));
}
function preguntasDelIntento(c: Ctx, e: Evaluacion, estudianteId: number | null) {
  const ex = excluidos(c, e, estudianteId);
  return preguntasDe(c, e.id).filter((p) => p.objetivoId === null || !ex.has(p.objetivoId));
}

function preguntaDto(c: Ctx, p: Pregunta) {
  return {
    id: p.id, orden: p.orden, tipo: p.tipo, enunciado: p.enunciado, opciones: p.opciones, correctas: p.correctas, puntaje: p.puntaje,
    objetivoId: p.objetivoId, oa: p.objetivoId === null ? null : oa(c, p.objetivoId), asistenteHabilitado: p.asistenteHabilitado,
    pistaDocente: p.pistaDocente, justificacion: p.justificacion, fuente: p.fuente,
  };
}

type PreguntaRequest = {
  tipo: TipoPregunta; enunciado: string; opciones?: string[] | null; correctas?: number[] | null; puntaje: number;
  objetivoId?: number | null; asistenteHabilitado: boolean; pistaDocente?: string | null; justificacion?: string | null; fuente?: string | null;
};

function validarPregunta(r: PreguntaRequest, orden: number, oasCurso: Set<number>): Omit<Pregunta, 'id' | 'evaluacionId'> {
  const error = (msg: string) => new Problema(400, `Pregunta ${orden}: ${msg}`);
  if (!r.enunciado?.trim()) throw error('escribe el enunciado');
  if (r.puntaje <= 0 || r.puntaje > 20) throw error('el puntaje debe estar entre 0,5 y 20');
  if (r.objetivoId != null && !oasCurso.has(r.objetivoId)) throw error('el OA no está asignado a este curso');
  const opciones = r.tipo === 'VerdaderoFalso' ? ['Verdadero', 'Falso'] : r.tipo === 'Abierta' ? [] : (r.opciones ?? []).map((o) => o.trim()).filter(Boolean);
  const correctas = r.tipo === 'Abierta' ? [] : [...new Set(r.correctas ?? [])].sort((a, b) => a - b);
  if ((r.tipo === 'Unica' || r.tipo === 'Multiple') && opciones.length < 2) throw error('agrega al menos dos alternativas');
  if (r.tipo !== 'Abierta') {
    if (correctas.length === 0 || correctas.some((x) => x < 0 || x >= opciones.length)) throw error('marca la alternativa correcta');
    if (r.tipo !== 'Multiple' && correctas.length !== 1) throw error('marca solo una alternativa correcta');
  }
  return {
    orden, tipo: r.tipo, enunciado: r.enunciado.trim(), opciones, correctas, puntaje: r.puntaje, objetivoId: r.objetivoId ?? null,
    asistenteHabilitado: r.asistenteHabilitado, pistaDocente: limpio(r.pistaDocente), justificacion: limpio(r.justificacion), fuente: limpio(r.fuente),
  };
}

function agregarPreguntas(c: Ctx, evaluacionId: number, preguntas: Omit<Pregunta, 'id' | 'evaluacionId'>[]) {
  for (const p of preguntas) c.db.preguntas.push({ ...p, id: siguienteId(c.db.preguntas), evaluacionId });
}

function borrarEvaluacion(c: Ctx, id: number) {
  const intentos = new Set(c.db.intentos.filter((i) => i.evaluacionId === id).map((i) => i.id));
  c.db.mensajes = c.db.mensajes.filter((m) => !intentos.has(m.intentoId));
  c.db.intentos = c.db.intentos.filter((i) => i.evaluacionId !== id);
  c.db.preguntas = c.db.preguntas.filter((p) => p.evaluacionId !== id);
  c.db.evaluaciones = c.db.evaluaciones.filter((e) => e.id !== id);
}

function normalizarRespuestas(lista: { preguntaId: number; seleccion?: number[] | null; texto?: string | null }[], preguntas: Pregunta[]): Respuesta[] {
  const ultimas = new Map<number, (typeof lista)[number]>();
  for (const r of lista) if (preguntas.some((p) => p.id === r.preguntaId)) ultimas.set(r.preguntaId, r);
  return [...ultimas.values()].map((r) => ({
    preguntaId: r.preguntaId, seleccion: [...new Set(r.seleccion ?? [])], texto: r.texto?.trim() ? r.texto.trim().slice(0, 4000) : null, puntaje: null, comentario: null,
  }));
}

// --- Generación de evaluaciones sin modelo de lenguaje ---
type OaGen = { id: number; codigo: string; descripcion: string };
function generarEsquema(oas: OaGen[], cantidad: number, tipos: TipoPregunta[], asignatura: string, consigna: string | null) {
  const minuscula = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
  const colas = oas.map((o) => ({ o, banco: (BANCO[o.codigo] ?? []).filter((p) => tipos.includes(p.tipo)) }));
  const preguntas: { tipo: TipoPregunta; enunciado: string; opciones: string[]; correctas: number[]; puntaje: number; objetivoId: number; pistaDocente: string; justificacion: string; fuente: string }[] = [];
  // Reparte las preguntas del banco entre los OA, de a una por OA en cada vuelta.
  for (let vuelta = 0; preguntas.length < cantidad && colas.some((q) => q.banco.length > vuelta); vuelta++) {
    for (const { o, banco } of colas) {
      if (preguntas.length >= cantidad) break;
      const p = banco[vuelta];
      if (p) preguntas.push({ tipo: p.tipo, enunciado: p.enunciado, opciones: p.opciones ?? [], correctas: p.correctas ?? [], puntaje: p.puntaje ?? 1, objetivoId: o.id, pistaDocente: p.pista, justificacion: p.justificacion, fuente: o.codigo });
    }
  }
  // Sin banco para esos OA: el esquema de ejemplo de la API (una abierta por OA).
  for (let i = 0; preguntas.length < cantidad && tipos.includes('Abierta') && oas.length > 0; i++) {
    const o = oas[i % oas.length];
    const foco = o.descripcion.split(/[\n:]/)[0].replace(/\.+$/, '');
    preguntas.push({
      tipo: 'Abierta', enunciado: i < oas.length ? `Explica con tus palabras y con un ejemplo: ${minuscula(foco)}.` : `Da otro ejemplo distinto relacionado con: ${minuscula(foco)}.`,
      opciones: [], correctas: [], puntaje: 2, objetivoId: o.id, pistaDocente: 'Piensa en algo que hayas visto en clases o en tu vida diaria.',
      justificacion: 'Pregunta de ejemplo: escribe la pauta de corrección.', fuente: o.codigo,
    });
  }
  const tema = consigna?.trim().replace(/\s+/g, ' ');
  const titulo = tema ? (tema.length > 70 ? `${tema.slice(0, 67).trimEnd()}…` : tema) : `Evaluación de ${asignatura}`;
  return { titulo: titulo[0].toUpperCase() + titulo.slice(1), preguntas };
}

type Manejador = (c: Ctx, p: Record<string, string>, q: URLSearchParams, body: any, init: RequestInit) => Promise<Response> | Response;
const rutas: [string, string, Manejador][] = [];
const ruta = (metodo: string, patron: string, h: Manejador) => rutas.push([metodo, patron, h]);

// ---------------- Auth ----------------
ruta('POST', '/auth/login', (_c, _p, _q, b) => {
  if (String(b?.email ?? '').trim().toLowerCase() !== DEMO_EMAIL || b?.password !== DEMO_PASSWORD) return fallo(401, 'Email o contraseña incorrectos');
  return json({ tokenType: 'Bearer', accessToken: TOKEN_DEMO, expiresIn: 43200 });
});
ruta('GET', '/auth/me', (c) => {
  const p = c.db.profesores[0];
  return json({ id: p.id, nombre: p.nombre, email: p.email, rol: p.rol });
});

// ---------------- Currículum ----------------
ruta('GET', '/asignaturas', (c, _p, q) => {
  const nivelId = q.get('nivelId') ? Number(q.get('nivelId')) : null;
  const lista = c.db.asignaturas
    .map((a) => ({
      id: a.id, codigo: a.codigo, nombre: a.nombre, color: a.color, prefijo: a.prefijo ?? a.codigo, area: a.area,
      oas: c.db.objetivos.filter((o) => o.asignaturaId === a.id && (nivelId === null || o.nivelId === nivelId)).length,
    }))
    .filter((a) => nivelId === null || a.oas > 0);
  const area = (a: string | null) => (a === null || a === 'Formación general' ? 0 : a.startsWith('Formación general') ? 1 : 2);
  return json(ordenar(lista, (a) => area(a.area), (a) => a.nombre));
});
ruta('GET', '/niveles', (c) => json(ordenar(c.db.niveles, (n) => n.orden).map((n) => ({ id: n.id, codigo: n.codigo, nombre: n.nombre, ciclo: ciclo(n) }))));
ruta('GET', '/oas', (c, _p, q) => {
  let lista = c.db.objetivos;
  if (q.get('asignaturaId')) lista = lista.filter((o) => o.asignaturaId === Number(q.get('asignaturaId')));
  if (q.get('nivelId')) lista = lista.filter((o) => o.nivelId === Number(q.get('nivelId')));
  const term = q.get('q')?.trim();
  if (term) {
    const m = term.toUpperCase().match(/^([A-Z]{2,3})\s*(\d{2}|\dM)\s*OA\s*(\d{1,2})$/);
    if (m) {
      lista = lista.filter((o) => {
        const a = asig(c, o.asignaturaId);
        return (a.prefijo ?? a.codigo) === m[1] && c.cat.niveles.get(o.nivelId)!.codigoMineduc === m[2] && o.numero === Number(m[3]);
      });
    } else {
      const solo = term.toUpperCase().match(/^OA\s*(\d{1,2})$/);
      const numero = solo ? Number(solo[1]) : -1;
      const t = term.toLocaleLowerCase('es');
      lista = lista.filter((o) => o.numero === numero || o.descripcion.toLocaleLowerCase('es').includes(t) || (o.eje?.toLocaleLowerCase('es').includes(t) ?? false));
    }
  }
  const cursos = new Map<number, { id: number; nombre: string; anio: number }[]>();
  for (const co of c.db.cursoObjetivos) {
    const curso = cursoPropio(c, co.cursoId);
    if (curso) cursos.set(co.objetivoId, [...(cursos.get(co.objetivoId) ?? []), { id: curso.id, nombre: nombreCurso(c, curso.id), anio: curso.anio }]);
  }
  return json(
    ordenar(lista, (o) => c.cat.niveles.get(o.nivelId)!.orden, (o) => asig(c, o.asignaturaId).nombre, (o) => o.numero).map((o) => ({
      ...oaDto(o, c.cat), cursos: ordenar(cursos.get(o.id) ?? [], (x) => x.nombre),
    })),
  );
});
function validarOa(c: Ctx, b: any, id?: number) {
  if (!(b.numero > 0)) throw new Problema(400, 'El número de OA debe ser mayor que 0');
  if (!b.descripcion?.trim()) throw new Problema(400, 'La descripción es obligatoria');
  if (c.db.objetivos.some((o) => o.id !== id && o.asignaturaId === b.asignaturaId && o.nivelId === b.nivelId && o.numero === b.numero))
    throw new Problema(409, `Ya existe el OA ${b.numero} para esa asignatura y nivel`);
}
ruta('POST', '/oas', (c, _p, _q, b) => {
  validarOa(c, b);
  const o: Objetivo = { id: siguienteId(c.db.objetivos), asignaturaId: b.asignaturaId, nivelId: b.nivelId, numero: b.numero, eje: limpio(b.eje), descripcion: b.descripcion.trim(), fuente: null };
  c.db.objetivos.push(o);
  return json({ id: o.id }, 201);
});
ruta('PUT', '/oas/:id', (c, p, _q, b) => {
  const o = c.db.objetivos.find((x) => x.id === Number(p.id));
  if (!o) throw noEncontrado();
  validarOa(c, b, o.id);
  Object.assign(o, { asignaturaId: b.asignaturaId, nivelId: b.nivelId, numero: b.numero, eje: limpio(b.eje), descripcion: b.descripcion.trim() });
  return vacio();
});
ruta('DELETE', '/oas/:id', (c, p) => {
  const id = Number(p.id);
  if (c.db.cursoObjetivos.some((x) => x.objetivoId === id)) throw new Problema(409, 'El OA está asignado a uno o más cursos. Quítalo de esos cursos antes de eliminarlo.');
  if (c.db.preguntas.some((x) => x.objetivoId === id)) throw new Problema(409, 'El OA se usa en preguntas de evaluaciones. No se puede eliminar.');
  const antes = c.db.objetivos.length;
  c.db.objetivos = c.db.objetivos.filter((o) => o.id !== id);
  if (antes === c.db.objetivos.length) throw noEncontrado();
  return vacio();
});
ruta('POST', '/oas/importar', () => {
  throw new Problema(400, 'En la demo de presentación no se importan OA. El currículum oficial ya viene cargado.');
});

// ---------------- Cursos ----------------
const evaluacionesAbiertas = (c: Ctx, cursoId: number) => c.db.evaluaciones.filter((e) => e.cursoId === cursoId && e.estado === 'Publicada').length;
const estudiantesDe = (c: Ctx, cursoId: number) => c.db.estudiantes.filter((e) => e.cursoId === cursoId);
const oasDe = (c: Ctx, cursoId: number) => c.db.cursoObjetivos.filter((x) => x.cursoId === cursoId);

ruta('GET', '/cursos', (c) => {
  const lista = ordenar(c.db.cursos.filter((x) => x.profesorId === 1), (x) => -x.anio, (x) => c.cat.niveles.get(x.nivelId)!.orden, (x) => x.letra);
  return json(
    lista.map((x) => {
      const oas = oasDe(c, x.id);
      const est = estudiantesDe(c, x.id);
      return {
        id: x.id, nivelId: x.nivelId, nivel: c.cat.niveles.get(x.nivelId)!.nombre, letra: x.letra, anio: x.anio, nombre: nombreCurso(c, x.id),
        totalOas: oas.length, oasCubiertos: oas.filter((o) => o.estado === 'Cubierto').length,
        totalEstudiantes: est.length, estudiantesPie: est.filter((e) => e.tipoPie !== 'Ninguno').length,
        evaluacionesAbiertas: evaluacionesAbiertas(c, x.id),
        asignaturas: [...new Set(oas.map((o) => asig(c, c.oas.get(o.objetivoId)!.asignaturaId).nombre))],
      };
    }),
  );
});
ruta('GET', '/cursos/:id', (c, p) => {
  const x = cursoPropio(c, Number(p.id));
  if (!x) throw noEncontrado();
  const n = c.cat.niveles.get(x.nivelId)!;
  return json({
    id: x.id, nivelId: x.nivelId, nivel: n.nombre, ciclo: ciclo(n), letra: x.letra, anio: x.anio, nombre: nombreCurso(c, x.id),
    totalEstudiantes: estudiantesDe(c, x.id).length, totalOas: oasDe(c, x.id).length,
  });
});
ruta('POST', '/cursos', (c, _p, _q, b) => {
  const letra = String(b.letra ?? '').trim().toUpperCase();
  if (letra.length === 0 || letra.length > 3) throw new Problema(400, 'La letra del curso es obligatoria (ej: A)');
  if (!c.cat.niveles.has(b.nivelId)) throw new Problema(400, 'Nivel inválido');
  if (c.db.cursos.some((x) => x.profesorId === 1 && x.nivelId === b.nivelId && x.letra === letra && x.anio === b.anio)) throw new Problema(409, 'Ya tienes ese curso para ese año');
  const curso = { id: siguienteId(c.db.cursos), profesorId: 1, nivelId: b.nivelId, letra, anio: b.anio };
  c.db.cursos.push(curso);
  const ids: number[] = b.asignaturaIds ?? [];
  for (const o of c.db.objetivos.filter((o) => o.nivelId === b.nivelId && ids.includes(o.asignaturaId)))
    c.db.cursoObjetivos.push({ cursoId: curso.id, objetivoId: o.id, estado: 'Pendiente', asignadoEn: ahora() });
  return json({ id: curso.id }, 201);
});
ruta('DELETE', '/cursos/:id', (c, p) => {
  const id = Number(p.id);
  if (!cursoPropio(c, id)) throw noEncontrado();
  for (const e of c.db.evaluaciones.filter((e) => e.cursoId === id)) borrarEvaluacion(c, e.id);
  c.db.cursos = c.db.cursos.filter((x) => x.id !== id);
  c.db.cursoObjetivos = c.db.cursoObjetivos.filter((x) => x.cursoId !== id);
  c.db.exclusiones = c.db.exclusiones.filter((x) => x.cursoId !== id);
  c.db.planificaciones = c.db.planificaciones.filter((x) => x.cursoId !== id);
  c.db.materiales = c.db.materiales.filter((x) => x.cursoId !== id);
  for (const e of c.db.estudiantes) if (e.cursoId === id) e.cursoId = null;
  return vacio();
});
ruta('GET', '/cursos/:id/oas', (c, p) => {
  const id = Number(p.id);
  if (!cursoPropio(c, id)) throw noEncontrado();
  const logro = logroPorOa(c, { cursoId: id });
  const evalsCurso = new Set(c.db.evaluaciones.filter((e) => e.cursoId === id).map((e) => e.id));
  const lista = ordenar(oasDe(c, id), (x) => asig(c, c.oas.get(x.objetivoId)!.asignaturaId).nombre, (x) => c.oas.get(x.objetivoId)!.numero);
  return json(
    lista.map((x) => ({
      oa: oa(c, x.objetivoId), estado: x.estado,
      excluidos: c.db.exclusiones.filter((e) => e.cursoId === id && e.objetivoId === x.objetivoId).length,
      planificaciones: c.db.planificaciones.filter((pl) => pl.cursoId === id && pl.objetivoIds.includes(x.objetivoId)).length,
      evaluaciones: new Set(c.db.preguntas.filter((pr) => evalsCurso.has(pr.evaluacionId) && pr.objetivoId === x.objetivoId).map((pr) => pr.evaluacionId)).size,
      logro: logro.get(x.objetivoId) ?? null,
    })),
  );
});
ruta('POST', '/cursos/:id/oas', (c, p, _q, b) => {
  const id = Number(p.id);
  if (!cursoPropio(c, id)) throw noEncontrado();
  const existentes = new Set(oasDe(c, id).map((x) => x.objetivoId));
  const validos = (b.objetivoIds as number[]).filter((x) => c.oas.has(x));
  const nuevos = [...new Set(validos)].filter((x) => !existentes.has(x));
  for (const oaId of nuevos) c.db.cursoObjetivos.push({ cursoId: id, objetivoId: oaId, estado: 'Pendiente', asignadoEn: ahora() });
  return json({ asignados: nuevos.length, yaExistian: validos.length - nuevos.length });
});
ruta('PUT', '/cursos/:id/oas/:oaId/estado', (c, p, _q, b) => {
  if (!cursoPropio(c, Number(p.id))) throw noEncontrado();
  const x = c.db.cursoObjetivos.find((x) => x.cursoId === Number(p.id) && x.objetivoId === Number(p.oaId));
  if (!x) throw noEncontrado();
  x.estado = b.estado;
  return vacio();
});
ruta('DELETE', '/cursos/:id/oas/:oaId', (c, p) => {
  const id = Number(p.id);
  const oaId = Number(p.oaId);
  if (!cursoPropio(c, id)) throw noEncontrado();
  c.db.cursoObjetivos = c.db.cursoObjetivos.filter((x) => !(x.cursoId === id && x.objetivoId === oaId));
  c.db.exclusiones = c.db.exclusiones.filter((x) => !(x.cursoId === id && x.objetivoId === oaId));
  return vacio();
});
ruta('GET', '/cursos/:id/oas/:oaId/exclusiones', (c, p) => {
  const id = Number(p.id);
  if (!cursoPropio(c, id)) throw noEncontrado();
  const ex = new Set(c.db.exclusiones.filter((x) => x.cursoId === id && x.objetivoId === Number(p.oaId)).map((x) => x.estudianteId));
  return json(
    ordenar(estudiantesDe(c, id), (e) => e.apellido, (e) => e.nombre).map((e) => ({
      id: e.id, nombre: e.nombre, apellido: e.apellido, diagnostico: e.diagnostico, nivelTea: e.nivelTea, excluido: ex.has(e.id),
    })),
  );
});
ruta('PUT', '/cursos/:id/oas/:oaId/exclusiones', (c, p, _q, b) => {
  const id = Number(p.id);
  const oaId = Number(p.oaId);
  if (!cursoPropio(c, id)) throw noEncontrado();
  if (!oasDe(c, id).some((x) => x.objetivoId === oaId)) throw new Problema(400, 'El OA no está asignado a este curso');
  const delCurso = estudiantesDe(c, id).filter((e) => (b.estudianteIds as number[]).includes(e.id)).map((e) => e.id);
  c.db.exclusiones = c.db.exclusiones.filter((x) => !(x.cursoId === id && x.objetivoId === oaId));
  for (const estudianteId of delCurso) c.db.exclusiones.push({ cursoId: id, objetivoId: oaId, estudianteId });
  return json({ excluidos: delCurso.length });
});
ruta('GET', '/cursos/:id/resumen', (c, p) => {
  const id = Number(p.id);
  const curso = cursoPropio(c, id);
  if (!curso) throw noEncontrado();
  const est = ordenar(estudiantesDe(c, id), (e) => e.apellido, (e) => e.nombre).map((e) => ({
    id: e.id, nombre: e.nombre, apellido: e.apellido, diagnostico: e.diagnostico, nivelTea: e.nivelTea, tipoPie: e.tipoPie,
  }));
  const oas = oasDe(c, id).map((x) => ({ a: asig(c, c.oas.get(x.objetivoId)!.asignaturaId), estado: x.estado }));
  const logro = [...logroPorOa(c, { cursoId: id }).values()];
  const porDx = new Map<string, number>();
  for (const e of est) if (e.diagnostico) porDx.set(e.diagnostico, (porDx.get(e.diagnostico) ?? 0) + 1);
  const porAsig = new Map<string, { asignatura: string; color: string; total: number; cubiertos: number; enProgreso: number }>();
  for (const o of oas) {
    const g = porAsig.get(o.a.nombre) ?? { asignatura: o.a.nombre, color: o.a.color, total: 0, cubiertos: 0, enProgreso: 0 };
    g.total++;
    if (o.estado === 'Cubierto') g.cubiertos++;
    if (o.estado === 'EnProgreso') g.enProgreso++;
    porAsig.set(o.a.nombre, g);
  }
  const intentosReales = c.db.intentos.filter((i) => !i.esPrueba);
  return json({
    curso: { id: curso.id, nombre: nombreCurso(c, id), anio: curso.anio, ciclo: ciclo(c.cat.niveles.get(curso.nivelId)!) },
    totalEstudiantes: est.length,
    permanentes: est.filter((e) => e.tipoPie === 'Permanente'),
    transitorios: est.filter((e) => e.tipoPie === 'Transitorio'),
    sinPie: est.filter((e) => e.tipoPie === 'Ninguno').length,
    diagnosticos: [...porDx].map(([diagnostico, total]) => ({ diagnostico, total })).sort((a, b) => b.total - a.total),
    cobertura: ordenar([...porAsig.values()], (g) => g.asignatura),
    totalOas: oas.length,
    oasCubiertos: oas.filter((o) => o.estado === 'Cubierto').length,
    exclusiones: c.db.exclusiones.filter((x) => x.cursoId === id).length,
    planificaciones: c.db.planificaciones.filter((x) => x.cursoId === id).length,
    logroPromedio: logro.length === 0 ? null : redondear(promedio(logro.map((l) => l.porcentaje))),
    oasPorLograr: logro.filter((l) => l.porcentaje < 60).length,
    evaluaciones: ordenar(c.db.evaluaciones.filter((e) => e.cursoId === id), (e) => -new Date(e.creadaEn).getTime()).slice(0, 4).map((e) => ({
      id: e.id, titulo: e.titulo, estado: e.estado, tipo: e.tipo,
      entregas: intentosReales.filter((i) => i.evaluacionId === e.id && i.entregadoEn).length,
      porRevisar: intentosReales.filter((i) => i.evaluacionId === e.id && i.revisionPendiente).length,
    })),
  });
});

// ---------------- Estudiantes ----------------
const visible = (c: Ctx, cursoId: number | null) => cursoId === null || cursoPropio(c, cursoId) !== null;
function estudianteDto(c: Ctx, e: Db['estudiantes'][number]) {
  return {
    id: e.id, rut: e.rut, nombre: e.nombre, apellido: e.apellido, fechaNacimiento: e.fechaNacimiento, cursoId: e.cursoId,
    curso: e.cursoId === null ? null : nombreCurso(c, e.cursoId), diagnostico: e.diagnostico, nivelTea: e.nivelTea, tipoPie: e.tipoPie, apoyos: e.apoyos,
    nombreApoderado: e.nombreApoderado, telefonoApoderado: e.telefonoApoderado, emailApoderado: e.emailApoderado, observaciones: e.observaciones,
  };
}
ruta('GET', '/estudiantes', (c, _p, q) => {
  let lista = c.db.estudiantes.filter((e) => visible(c, e.cursoId));
  if (q.get('cursoId')) lista = lista.filter((e) => e.cursoId === Number(q.get('cursoId')));
  if (q.get('pie') === 'si') lista = lista.filter((e) => e.tipoPie !== 'Ninguno');
  const t = q.get('q')?.trim().toLocaleLowerCase('es');
  if (t) lista = lista.filter((e) => `${e.nombre} ${e.apellido}`.toLocaleLowerCase('es').includes(t) || e.rut.includes(t));
  return json(ordenar(lista, (e) => e.apellido, (e) => e.nombre).map((e) => ({ ...estudianteDto(c, e), exclusiones: c.db.exclusiones.filter((x) => x.estudianteId === e.id).length })));
});
ruta('GET', '/estudiantes/:id', (c, p) => {
  const id = Number(p.id);
  const e = c.db.estudiantes.find((x) => x.id === id && visible(c, x.cursoId));
  if (!e) throw noEncontrado();
  const intentos = ordenar(c.db.intentos.filter((i) => i.estudianteId === id && !i.esPrueba), (i) => -new Date(i.iniciadoEn).getTime());
  const logro = logroPorOa(c, { estudianteId: id });
  const oasLogro = ordenar([...logro.keys()].map((k) => c.oas.get(k)!), (o) => asig(c, o.asignaturaId).nombre, (o) => o.numero);
  return json({
    ...estudianteDto(c, e),
    exclusiones: c.db.exclusiones.filter((x) => x.estudianteId === id).map((x) => oa(c, x.objetivoId)),
    evaluaciones: intentos.map((i) => {
      const ev = c.db.evaluaciones.find((x) => x.id === i.evaluacionId)!;
      return {
        id: i.id, evaluacionId: ev.id, titulo: ev.titulo, tipo: ev.tipo, asignatura: asig(c, ev.asignaturaId).nombre, cursoId: ev.cursoId,
        entregadoEn: i.entregadoEn, puntajeObtenido: i.puntajeObtenido, puntajeMaximo: i.puntajeMaximo, nota: i.nota, revisionPendiente: i.revisionPendiente,
        ayudas: c.db.mensajes.filter((m) => m.intentoId === i.id && m.rol === 'metis' && m.nivelAyuda !== null).length,
      };
    }),
    logro: oasLogro.map((o) => ({ oa: oaDto(o, c.cat), ...logro.get(o.id)! })),
  });
});
function validarEstudiante(c: Ctx, b: any, id: number | null) {
  const rut = normalizarRut(b.rut);
  if (!rut) throw new Problema(400, 'RUT inválido: revisa el dígito verificador');
  if (!b.nombre?.trim() || !b.apellido?.trim()) throw new Problema(400, 'Nombre y apellido son obligatorios');
  if (b.nivelTea != null && ![1, 2, 3].includes(b.nivelTea)) throw new Problema(400, 'El nivel TEA debe ser 1, 2 o 3');
  if (b.cursoId != null && !cursoPropio(c, b.cursoId)) throw new Problema(400, 'Curso inválido');
  if (c.db.estudiantes.some((e) => e.rut === rut && e.id !== id)) throw new Problema(409, 'Ya existe un estudiante con ese RUT');
  const diagnostico = limpio(b.diagnostico);
  return {
    rut, nombre: b.nombre.trim(), apellido: b.apellido.trim(), fechaNacimiento: b.fechaNacimiento || null, cursoId: b.cursoId ?? null,
    diagnostico, nivelTea: diagnostico === 'TEA' ? (b.nivelTea ?? null) : null, tipoPie: b.tipoPie ?? 'Ninguno', apoyos: limpio(b.apoyos),
    nombreApoderado: limpio(b.nombreApoderado), telefonoApoderado: limpio(b.telefonoApoderado), emailApoderado: limpio(b.emailApoderado), observaciones: limpio(b.observaciones),
  };
}
ruta('POST', '/estudiantes', (c, _p, _q, b) => {
  const e = { id: siguienteId(c.db.estudiantes), ...validarEstudiante(c, b, null) };
  c.db.estudiantes.push(e);
  return json({ id: e.id }, 201);
});
ruta('PUT', '/estudiantes/:id', (c, p, _q, b) => {
  const e = c.db.estudiantes.find((x) => x.id === Number(p.id) && visible(c, x.cursoId));
  if (!e) throw noEncontrado();
  const datos = validarEstudiante(c, b, e.id);
  if (e.cursoId !== datos.cursoId) c.db.exclusiones = c.db.exclusiones.filter((x) => x.estudianteId !== e.id);
  Object.assign(e, datos);
  return vacio();
});
ruta('DELETE', '/estudiantes/:id', (c, p) => {
  const id = Number(p.id);
  if (!c.db.estudiantes.some((x) => x.id === id && visible(c, x.cursoId))) throw noEncontrado();
  const intentos = new Set(c.db.intentos.filter((i) => i.estudianteId === id).map((i) => i.id));
  c.db.mensajes = c.db.mensajes.filter((m) => !intentos.has(m.intentoId));
  c.db.intentos = c.db.intentos.filter((i) => i.estudianteId !== id);
  c.db.exclusiones = c.db.exclusiones.filter((x) => x.estudianteId !== id);
  c.db.estudiantes = c.db.estudiantes.filter((x) => x.id !== id);
  return vacio();
});

// ---------------- Planificaciones ----------------
function aplicarPlan(c: Ctx, b: any) {
  if (!b.titulo?.trim()) throw new Problema(400, 'El título es obligatorio');
  if (!cursoPropio(c, b.cursoId)) throw new Problema(400, 'Curso inválido');
  const d = new Date(`${b.semanaInicio}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const delCurso = new Set(oasDe(c, b.cursoId).map((x) => x.objetivoId));
  return {
    cursoId: b.cursoId, titulo: b.titulo.trim(), semanaInicio: d.toISOString().slice(0, 10), actividades: b.actividades?.trim() ?? null,
    adecuaciones: b.adecuaciones?.trim() ?? null, objetivoIds: (b.objetivoIds as number[]).filter((x) => delCurso.has(x)),
  };
}
ruta('GET', '/planificaciones', (c, _p, q) => {
  const cursoId = Number(q.get('cursoId'));
  if (!cursoPropio(c, cursoId)) throw noEncontrado();
  return json(
    ordenar(c.db.planificaciones.filter((x) => x.cursoId === cursoId), (x) => x.semanaInicio).map((x) => ({
      id: x.id, cursoId: x.cursoId, semanaInicio: x.semanaInicio, titulo: x.titulo, actividades: x.actividades, adecuaciones: x.adecuaciones,
      objetivos: ordenar(x.objetivoIds.map((id) => c.oas.get(id)!), (o) => asig(c, o.asignaturaId).nombre, (o) => o.numero).map((o) => oaDto(o, c.cat)),
    })),
  );
});
ruta('POST', '/planificaciones', (c, _p, _q, b) => {
  const pl = { id: siguienteId(c.db.planificaciones), ...aplicarPlan(c, b) };
  c.db.planificaciones.push(pl);
  return json({ id: pl.id }, 201);
});
ruta('PUT', '/planificaciones/:id', (c, p, _q, b) => {
  const pl = c.db.planificaciones.find((x) => x.id === Number(p.id) && cursoPropio(c, x.cursoId));
  if (!pl) throw noEncontrado();
  Object.assign(pl, aplicarPlan(c, b));
  return vacio();
});
ruta('DELETE', '/planificaciones/:id', (c, p) => {
  const id = Number(p.id);
  if (!c.db.planificaciones.some((x) => x.id === id && cursoPropio(c, x.cursoId))) throw noEncontrado();
  c.db.planificaciones = c.db.planificaciones.filter((x) => x.id !== id);
  return vacio();
});

// ---------------- Inicio ----------------
ruta('GET', '/inicio', (c) => {
  const propios = ordenar(c.db.cursos.filter((x) => x.profesorId === 1), (x) => c.cat.niveles.get(x.nivelId)!.orden, (x) => x.letra);
  const cursos = propios.map((x) => {
    const est = estudiantesDe(c, x.id);
    const oas = oasDe(c, x.id);
    return {
      id: x.id, nombre: nombreCurso(c, x.id), anio: x.anio, estudiantes: est.length, estudiantesPie: est.filter((e) => e.tipoPie !== 'Ninguno').length,
      oas: oas.length, oasCubiertos: oas.filter((o) => o.estado === 'Cubierto').length, evaluacionesAbiertas: evaluacionesAbiertas(c, x.id),
    };
  });
  const evals = c.db.evaluaciones.filter((e) => cursoPropio(c, e.cursoId));
  const reales = c.db.intentos.filter((i) => !i.esPrueba);
  const base = (e: Evaluacion) => ({ id: e.id, titulo: e.titulo, cursoId: e.cursoId, curso: nombreCurso(c, e.cursoId) });
  const abiertas = evals.filter((e) => e.estado === 'Publicada').map((e) => ({
    ...base(e), entregas: reales.filter((i) => i.evaluacionId === e.id && i.entregadoEn).length, estudiantes: estudiantesDe(c, e.cursoId).length,
  }));
  return json({
    cursos,
    totales: {
      cursos: cursos.length, estudiantes: cursos.reduce((s, x) => s + x.estudiantes, 0),
      estudiantesPie: cursos.reduce((s, x) => s + x.estudiantesPie, 0), evaluacionesAbiertas: abiertas.length,
    },
    porRevisar: evals.map((e) => ({ ...base(e), total: reales.filter((i) => i.evaluacionId === e.id && i.revisionPendiente).length })).filter((x) => x.total > 0),
    abiertas,
    borradores: evals.filter((e) => e.estado === 'Borrador').map(base),
  });
});

// ---------------- Materiales ----------------
function materialDto(c: Ctx, m: Material, conContenido: boolean) {
  return {
    id: m.id, titulo: m.titulo, tipo: m.tipo, asignaturaId: m.asignaturaId, asignatura: asig(c, m.asignaturaId).nombre, asignaturaColor: asig(c, m.asignaturaId).color,
    nivelId: m.nivelId, nivel: c.cat.niveles.get(m.nivelId)!.nombre, cursoId: m.cursoId, curso: m.cursoId === null ? null : nombreCurso(c, m.cursoId),
    descripcion: m.descripcion, contenido: conContenido ? m.contenido : null, url: m.url, lecturaFacil: m.lecturaFacil, creadoEn: m.creadoEn,
    archivoNombre: m.archivoNombre, archivoTipo: m.archivoTipo, archivoTamano: m.archivoTamano,
    objetivos: ordenar(m.objetivoIds.map((id) => c.oas.get(id)!).filter(Boolean), (o) => o.numero).map((o) => oaDto(o, c.cat)),
  };
}
const materialVisible = (c: Ctx, m: Material) => visible(c, m.cursoId);
ruta('GET', '/materiales', (c, _p, q) => {
  let lista = c.db.materiales.filter((m) => materialVisible(c, m));
  if (q.get('cursoId')) {
    const curso = cursoPropio(c, Number(q.get('cursoId')));
    if (!curso) throw noEncontrado();
    const oasCurso = new Set(oasDe(c, curso.id).map((x) => x.objetivoId));
    lista = lista.filter((m) => m.cursoId === curso.id || (m.cursoId === null && (m.nivelId === curso.nivelId || m.objetivoIds.some((o) => oasCurso.has(o)))));
  }
  if (q.get('asignaturaId')) lista = lista.filter((m) => m.asignaturaId === Number(q.get('asignaturaId')));
  if (q.get('nivelId')) lista = lista.filter((m) => m.nivelId === Number(q.get('nivelId')));
  if (q.get('oaId')) lista = lista.filter((m) => m.objetivoIds.includes(Number(q.get('oaId'))));
  if (q.get('tipo')) lista = lista.filter((m) => m.tipo === q.get('tipo'));
  const t = q.get('q')?.trim().toLocaleLowerCase('es');
  if (t) lista = lista.filter((m) => m.titulo.toLocaleLowerCase('es').includes(t) || (m.descripcion?.toLocaleLowerCase('es').includes(t) ?? false));
  return json(ordenar(lista, (m) => c.cat.niveles.get(m.nivelId)!.orden, (m) => asig(c, m.asignaturaId).nombre, (m) => m.titulo).map((m) => materialDto(c, m, false)));
});
ruta('GET', '/materiales/:id', (c, p) => {
  const m = c.db.materiales.find((x) => x.id === Number(p.id) && materialVisible(c, x));
  if (!m) throw noEncontrado();
  return json(materialDto(c, m, true));
});
function aplicarMaterial(c: Ctx, b: any, conArchivo: boolean) {
  if (!b.titulo?.trim()) throw new Problema(400, 'El título es obligatorio');
  if (!conArchivo && !b.contenido?.trim() && !b.url?.trim()) throw new Problema(400, 'Agrega el contenido del material o un enlace');
  if (b.url?.trim() && !/^https?:\/\/\S+$/i.test(b.url.trim())) throw new Problema(400, 'El enlace debe comenzar con http:// o https://');
  if (!c.cat.asignaturas.has(b.asignaturaId) || !c.cat.niveles.has(b.nivelId)) throw new Problema(400, 'Asignatura o nivel inválido');
  if (b.cursoId != null && !cursoPropio(c, b.cursoId)) throw new Problema(400, 'Curso inválido');
  return {
    titulo: b.titulo.trim(), tipo: b.tipo, asignaturaId: b.asignaturaId, nivelId: b.nivelId, cursoId: b.cursoId ?? null,
    descripcion: limpio(b.descripcion), contenido: limpio(b.contenido), url: limpio(b.url), lecturaFacil: !!b.lecturaFacil,
    objetivoIds: (b.objetivoIds as number[]).filter((x) => c.oas.has(x)),
  };
}
ruta('POST', '/materiales', (c, _p, _q, b) => {
  const m: Material = { id: siguienteId(c.db.materiales), ...aplicarMaterial(c, b, false), archivoNombre: null, archivoTipo: null, archivoTamano: null, creadoEn: ahora() };
  c.db.materiales.push(m);
  return json({ id: m.id }, 201);
});
ruta('PUT', '/materiales/:id', (c, p, _q, b) => {
  const m = c.db.materiales.find((x) => x.id === Number(p.id) && materialVisible(c, x));
  if (!m) throw noEncontrado();
  Object.assign(m, aplicarMaterial(c, b, m.archivoNombre !== null));
  return vacio();
});
ruta('POST', '/materiales/archivo', async (c, _p, _q, _b, init) => {
  const form = init.body instanceof FormData ? init.body : null;
  const archivo = form?.get('archivo');
  if (!form || !(archivo instanceof File) || archivo.size === 0) throw new Problema(400, 'Adjunta un archivo');
  if (archivo.size > 15 * 1024 * 1024) throw new Problema(400, 'El archivo supera los 15 MB');
  const ext = archivo.name.slice(archivo.name.lastIndexOf('.')).toLowerCase();
  const tipo = TIPOS_ARCHIVO[ext];
  if (!tipo) throw new Problema(400, 'Formato no soportado. Usa PDF, Word (.docx), PowerPoint (.pptx) o texto (.txt, .md, .csv)');
  const asignaturaId = Number(form.get('asignaturaId'));
  const nivelId = Number(form.get('nivelId'));
  if (!c.cat.asignaturas.has(asignaturaId) || !c.cat.niveles.has(nivelId)) throw new Problema(400, 'Asignatura o nivel inválido');
  const cursoId = form.get('cursoId') ? Number(form.get('cursoId')) : null;
  if (cursoId !== null && !cursoPropio(c, cursoId)) throw new Problema(400, 'Curso inválido');
  // En la demo solo se lee el texto de archivos de texto; PDF, Word y PowerPoint los lee la API.
  const texto = tipo.startsWith('text/') ? (await archivo.text()).trim() : `Archivo de demostración: ${archivo.name}. En la versión conectada, Metis lee su contenido para generar las preguntas.`;
  if (!texto) throw new Problema(400, 'El archivo no tiene texto que podamos leer');
  const titulo = String(form.get('titulo') ?? '').trim() || archivo.name.replace(/\.[^.]+$/, '');
  const m: Material = {
    id: siguienteId(c.db.materiales), titulo, tipo: 'Documento', asignaturaId, nivelId, cursoId, descripcion: `Archivo subido: ${archivo.name}`,
    contenido: texto, url: null, lecturaFacil: false, archivoNombre: archivo.name, archivoTipo: tipo, archivoTamano: archivo.size, creadoEn: ahora(), objetivoIds: [],
  };
  c.db.materiales.push(m);
  archivos.set(m.id, archivo);
  return json({ id: m.id, titulo: m.titulo, archivoNombre: m.archivoNombre, archivoTipo: m.archivoTipo, archivoTamano: m.archivoTamano }, 201);
});
ruta('GET', '/materiales/:id/archivo', (c, p) => {
  const blob = archivos.get(Number(p.id));
  if (!blob) throw new Problema(404, 'En la demo, los archivos solo se pueden descargar en la misma sesión en que se subieron.');
  return new Response(blob, { status: 200, headers: { 'content-type': blob.type || 'application/octet-stream' } });
});
ruta('DELETE', '/materiales/:id', (c, p) => {
  const id = Number(p.id);
  if (!c.db.materiales.some((x) => x.id === id && materialVisible(c, x))) throw noEncontrado();
  c.db.materiales = c.db.materiales.filter((x) => x.id !== id);
  archivos.delete(id);
  return vacio();
});

// ---------------- Evaluaciones ----------------
ruta('GET', '/cursos/:cursoId/evaluaciones', (c, p) => {
  const cursoId = Number(p.cursoId);
  if (!cursoPropio(c, cursoId)) throw noEncontrado();
  const total = estudiantesDe(c, cursoId).length;
  const lista = ordenar(c.db.evaluaciones.filter((e) => e.cursoId === cursoId), (e) => -new Date(e.creadaEn).getTime());
  return json(
    lista.map((e) => {
      const preguntas = preguntasDe(c, e.id);
      const propios = c.db.intentos.filter((i) => i.evaluacionId === e.id && !i.esPrueba && i.entregadoEn);
      const notas = propios.filter((i) => i.nota !== null).map((i) => i.nota!);
      const oaIds = [...new Set(preguntas.filter((x) => x.objetivoId !== null).map((x) => x.objetivoId!))];
      return {
        id: e.id, titulo: e.titulo, tipo: e.tipo, estado: e.estado, token: e.token, duracionMinutos: e.duracionMinutos,
        asignaturaId: e.asignaturaId, asignatura: asig(c, e.asignaturaId).nombre, asignaturaColor: asig(c, e.asignaturaId).color,
        asistenteActivo: e.asistenteActivo, nivelAyuda: e.nivelAyuda, creadaEn: e.creadaEn, publicadaEn: e.publicadaEn,
        preguntas: preguntas.length, puntajeTotal: preguntas.reduce((s, x) => s + x.puntaje, 0),
        oas: ordenar(oaIds.map((id) => c.oas.get(id)!), (o) => o.numero).map((o) => oaDto(o, c.cat)),
        entregas: propios.length, totalEstudiantes: total, porRevisar: propios.filter((i) => i.revisionPendiente).length,
        promedio: notas.length === 0 ? null : redondear(promedio(notas), 1),
      };
    }),
  );
});
function nuevaEvaluacion(c: Ctx, datos: Partial<Evaluacion> & Pick<Evaluacion, 'cursoId' | 'asignaturaId' | 'titulo' | 'tipo'>): Evaluacion {
  const e: Evaluacion = {
    id: siguienteId(c.db.evaluaciones), instrucciones: null, estado: 'Borrador', duracionMinutos: 30, exigencia: 60, token: nuevoToken(),
    asistenteActivo: true, nivelAyuda: 2, instruccionesAsistente: null, dificultad: null, generadaConIa: false, creadaEn: ahora(), publicadaEn: null, ...datos,
  };
  c.db.evaluaciones.push(e);
  return e;
}
ruta('POST', '/cursos/:cursoId/evaluaciones', (c, p, _q, b) => {
  const cursoId = Number(p.cursoId);
  if (!cursoPropio(c, cursoId)) throw noEncontrado();
  if (!b.titulo?.trim()) throw new Problema(400, 'El título es obligatorio');
  if (!c.cat.asignaturas.has(b.asignaturaId)) throw new Problema(400, 'Asignatura inválida');
  const e = nuevaEvaluacion(c, {
    cursoId, asignaturaId: b.asignaturaId, titulo: b.titulo.trim(), tipo: b.tipo as TipoEvaluacion,
    instrucciones: 'Lee cada pregunta con calma. Si tienes dudas, puedes pedirle ayuda a Metis.',
  });
  return json({ id: e.id }, 201);
});
const entregasDe = (c: Ctx, id: number) => c.db.intentos.filter((i) => i.evaluacionId === id && !i.esPrueba && i.entregadoEn).length;
ruta('GET', '/evaluaciones/:id', (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  const entregas = entregasDe(c, e.id);
  return json({
    id: e.id, cursoId: e.cursoId, curso: nombreCurso(c, e.cursoId), nivelId: c.db.cursos.find((x) => x.id === e.cursoId)!.nivelId, titulo: e.titulo,
    instrucciones: e.instrucciones, asignaturaId: e.asignaturaId, asignatura: asig(c, e.asignaturaId).nombre, tipo: e.tipo, estado: e.estado,
    duracionMinutos: e.duracionMinutos, exigencia: e.exigencia, token: e.token, asistenteActivo: e.asistenteActivo, nivelAyuda: e.nivelAyuda,
    instruccionesAsistente: e.instruccionesAsistente, dificultad: e.dificultad, generadaConIa: e.generadaConIa, creadaEn: e.creadaEn, publicadaEn: e.publicadaEn,
    entregas, bloqueada: entregas > 0, preguntas: preguntasDe(c, e.id).map((x) => preguntaDto(c, x)),
  });
});
ruta('PUT', '/evaluaciones/:id', (c, p, _q, b) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  if (!b.titulo?.trim()) throw new Problema(400, 'El título es obligatorio');
  if (b.duracionMinutos < 5 || b.duracionMinutos > 240) throw new Problema(400, 'La duración debe estar entre 5 y 240 minutos');
  if (b.exigencia < 40 || b.exigencia > 80) throw new Problema(400, 'La exigencia debe estar entre 40% y 80%');
  if (b.nivelAyuda < 1 || b.nivelAyuda > 3) throw new Problema(400, 'El nivel de ayuda debe ser 1, 2 o 3');
  const conEntregas = entregasDe(c, e.id) > 0;
  let nuevas: Omit<Pregunta, 'id' | 'evaluacionId'>[] = [];
  if (!conEntregas) {
    const oasCurso = new Set(oasDe(c, e.cursoId).map((x) => x.objetivoId));
    nuevas = (b.preguntas as PreguntaRequest[]).map((r, i) => validarPregunta(r, i + 1, oasCurso));
  }
  Object.assign(e, {
    titulo: b.titulo.trim(), instrucciones: limpio(b.instrucciones), tipo: b.tipo, duracionMinutos: b.duracionMinutos, exigencia: b.exigencia,
    asistenteActivo: b.asistenteActivo, nivelAyuda: b.nivelAyuda, instruccionesAsistente: limpio(b.instruccionesAsistente),
  });
  if (!conEntregas) {
    e.asignaturaId = b.asignaturaId;
    // Las vistas previas guardan respuestas por id de pregunta: se descartan al rehacer las preguntas.
    const pruebas = new Set(c.db.intentos.filter((i) => i.evaluacionId === e.id && i.esPrueba).map((i) => i.id));
    c.db.mensajes = c.db.mensajes.filter((m) => !pruebas.has(m.intentoId));
    c.db.intentos = c.db.intentos.filter((i) => !pruebas.has(i.id));
    c.db.preguntas = c.db.preguntas.filter((x) => x.evaluacionId !== e.id);
    agregarPreguntas(c, e.id, nuevas);
  }
  return json({ preguntasBloqueadas: conEntregas });
});
ruta('POST', '/evaluaciones/:id/publicar', (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  const preguntas = preguntasDe(c, e.id);
  if (preguntas.length === 0) throw new Problema(400, 'Agrega al menos una pregunta antes de publicar');
  e.estado = 'Publicada';
  e.publicadaEn ??= ahora();
  const oas = new Set(preguntas.filter((x) => x.objetivoId !== null).map((x) => x.objetivoId!));
  for (const x of oasDe(c, e.cursoId)) if (oas.has(x.objetivoId) && x.estado === 'Pendiente') x.estado = 'EnProgreso';
  return json({ token: e.token });
});
function cambiarEstado(c: Ctx, id: number, estado: EstadoEvaluacion) {
  const e = evaluacionPropia(c, id);
  if (!e) throw noEncontrado();
  if (e.estado === 'Borrador') throw new Problema(400, 'Primero publica la evaluación');
  e.estado = estado;
  return vacio();
}
ruta('POST', '/evaluaciones/:id/cerrar', (c, p) => cambiarEstado(c, Number(p.id), 'Cerrada'));
ruta('POST', '/evaluaciones/:id/reabrir', (c, p) => cambiarEstado(c, Number(p.id), 'Publicada'));
ruta('POST', '/evaluaciones/:id/duplicar', (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  const copia = nuevaEvaluacion(c, {
    cursoId: e.cursoId, asignaturaId: e.asignaturaId, titulo: `${e.titulo} (copia)`, instrucciones: e.instrucciones, tipo: e.tipo,
    duracionMinutos: e.duracionMinutos, exigencia: e.exigencia, asistenteActivo: e.asistenteActivo, nivelAyuda: e.nivelAyuda,
    instruccionesAsistente: e.instruccionesAsistente, dificultad: e.dificultad, generadaConIa: e.generadaConIa,
  });
  agregarPreguntas(c, copia.id, preguntasDe(c, e.id).map(({ id: _id, evaluacionId: _e, ...x }) => ({ ...x, opciones: [...x.opciones], correctas: [...x.correctas] })));
  return json({ id: copia.id });
});
ruta('DELETE', '/evaluaciones/:id', (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  borrarEvaluacion(c, e.id);
  return vacio();
});
function nuevoIntento(c: Ctx, evaluacionId: number, estudianteId: number | null, esPrueba: boolean): Intento {
  const i: Intento = {
    id: siguienteId(c.db.intentos), evaluacionId, estudianteId, esPrueba, clave: nuevoToken(18), iniciadoEn: ahora(), entregadoEn: null,
    respuestas: [], puntajeObtenido: null, puntajeMaximo: 0, nota: null, revisionPendiente: false,
  };
  c.db.intentos.push(i);
  return i;
}
ruta('POST', '/evaluaciones/:id/vista-previa', (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  if (preguntasDe(c, e.id).length === 0) throw new Problema(400, 'Agrega al menos una pregunta para ver la vista previa');
  return json({ clave: nuevoIntento(c, e.id, null, true).clave });
});
const ayudas = (c: Ctx, intentoId: number) => c.db.mensajes.filter((m) => m.intentoId === intentoId && m.rol === 'metis' && m.nivelAyuda !== null);
ruta('GET', '/evaluaciones/:id/resultados', (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  const estudiantes = ordenar(estudiantesDe(c, e.cursoId), (x) => x.apellido, (x) => x.nombre);
  const intentos = c.db.intentos.filter((i) => i.evaluacionId === e.id && !i.esPrueba);
  const entregados = intentos.filter((i) => i.entregadoEn);
  const notas = entregados.filter((i) => i.nota !== null).map((i) => i.nota!);
  const ids = new Set(intentos.map((i) => i.id));
  const ayudasPorPregunta = new Map<number, number>();
  for (const m of c.db.mensajes) if (ids.has(m.intentoId) && m.rol === 'metis' && m.nivelAyuda !== null && m.preguntaId !== null) ayudasPorPregunta.set(m.preguntaId, (ayudasPorPregunta.get(m.preguntaId) ?? 0) + 1);
  const logro = logroPorOa(c, { evaluacionId: e.id });
  const preguntas = preguntasDe(c, e.id);
  const oaIds = [...new Set(preguntas.filter((x) => x.objetivoId !== null).map((x) => x.objetivoId!))].filter((id) => logro.has(id));
  return json({
    evaluacion: { id: e.id, titulo: e.titulo, cursoId: e.cursoId, curso: nombreCurso(c, e.cursoId), tipo: e.tipo, estado: e.estado, exigencia: e.exigencia, token: e.token },
    resumen: {
      estudiantes: estudiantes.length, entregas: entregados.length, enCurso: intentos.filter((i) => !i.entregadoEn).length,
      porRevisar: entregados.filter((i) => i.revisionPendiente).length, promedio: notas.length === 0 ? null : redondear(promedio(notas), 1),
      aprobados: notas.filter((n) => n >= 4).length, conNota: notas.length,
    },
    estudiantes: estudiantes.map((s) => {
      const i = intentos.find((x) => x.estudianteId === s.id);
      const estado = !i ? 'Pendiente' : !i.entregadoEn ? 'En curso' : i.revisionPendiente ? 'Por revisar' : 'Revisada';
      return {
        id: s.id, nombre: s.nombre, apellido: s.apellido, diagnostico: s.diagnostico, nivelTea: s.nivelTea, estado, intentoId: i?.id ?? null,
        puntajeObtenido: i?.puntajeObtenido ?? null, puntajeMaximo: i?.puntajeMaximo ?? null, nota: i?.nota ?? null, ayudas: i ? ayudas(c, i.id).length : 0,
      };
    }),
    preguntas: preguntas.map((x) => {
      const resp = entregados.flatMap((i) => i.respuestas).filter((r) => r.preguntaId === x.id && r.puntaje !== null);
      return {
        id: x.id, orden: x.orden, tipo: x.tipo, enunciado: x.enunciado, oa: x.objetivoId === null ? null : oa(c, x.objetivoId), respondidas: resp.length,
        logro: resp.length === 0 ? null : redondear((100 * resp.reduce((s, r) => s + r.puntaje!, 0)) / (resp.length * x.puntaje)),
        ayudas: ayudasPorPregunta.get(x.id) ?? 0,
      };
    }),
    logroOa: ordenar(oaIds.map((id) => c.oas.get(id)!), (o) => o.numero).map((o) => ({ oa: oaDto(o, c.cat), ...logro.get(o.id)! })),
  });
});
ruta('GET', '/intentos/:id', (c, p) => {
  const i = c.db.intentos.find((x) => x.id === Number(p.id));
  const e = i ? evaluacionPropia(c, i.evaluacionId) : null;
  if (!i || !e) throw noEncontrado();
  const est = i.estudianteId === null ? null : c.db.estudiantes.find((x) => x.id === i.estudianteId)!;
  const preguntas = preguntasDelIntento(c, e, i.estudianteId);
  const mensajes = ordenar(c.db.mensajes.filter((m) => m.intentoId === i.id), (m) => m.creadoEn, (m) => m.id);
  return json({
    id: i.id, evaluacionId: e.id, evaluacion: e.titulo, cursoId: e.cursoId, exigencia: e.exigencia,
    estudiante: est && { id: est.id, nombre: est.nombre, apellido: est.apellido, diagnostico: est.diagnostico, nivelTea: est.nivelTea },
    iniciadoEn: i.iniciadoEn, entregadoEn: i.entregadoEn, puntajeObtenido: i.puntajeObtenido, puntajeMaximo: i.puntajeMaximo, nota: i.nota,
    revisionPendiente: i.revisionPendiente, omitidas: preguntasDe(c, e.id).length - preguntas.length,
    preguntas: preguntas.map((x) => {
      const r = i.respuestas.find((r) => r.preguntaId === x.id);
      return {
        pregunta: preguntaDto(c, x),
        respuesta: r ? { seleccion: r.seleccion, texto: r.texto, puntaje: r.puntaje, comentario: r.comentario } : null,
        conversacion: mensajes.filter((m) => m.preguntaId === x.id).map((m) => ({ rol: m.rol, texto: m.texto, nivelAyuda: m.nivelAyuda, porIa: m.porIa, creadoEn: m.creadoEn })),
      };
    }),
  });
});
ruta('PUT', '/intentos/:id/revision', (c, p, _q, b) => {
  const i = c.db.intentos.find((x) => x.id === Number(p.id));
  const e = i ? evaluacionPropia(c, i.evaluacionId) : null;
  if (!i || !e) throw noEncontrado();
  if (!i.entregadoEn) throw new Problema(400, 'El estudiante aún no entrega esta evaluación');
  const preguntas = preguntasDelIntento(c, e, i.estudianteId);
  const respuestas = i.respuestas.map((r) => ({ ...r }));
  for (const pr of b.puntajes as { preguntaId: number; puntaje: number; comentario?: string | null }[]) {
    const x = preguntas.find((q) => q.id === pr.preguntaId);
    if (!x) throw new Problema(400, 'Pregunta inválida');
    if (pr.puntaje < 0 || pr.puntaje > x.puntaje) throw new Problema(400, `El puntaje de la pregunta ${x.orden} debe estar entre 0 y ${x.puntaje}`);
    let r = respuestas.find((r) => r.preguntaId === x.id);
    if (!r) respuestas.push((r = { preguntaId: x.id, seleccion: [], texto: null, puntaje: null, comentario: null }));
    r.puntaje = pr.puntaje;
    r.comentario = limpio(pr.comentario);
  }
  i.respuestas = respuestas;
  recalcular(i, preguntas, e.exigencia);
  return json({ nota: i.nota, puntajeObtenido: i.puntajeObtenido, revisionPendiente: i.revisionPendiente });
});

// ---------------- Evalia: IA ----------------
ruta('GET', '/ia/estado', () => json({ disponible: true, modelo: 'demo' }));
ruta('POST', '/cursos/:cursoId/evaluaciones/generar', async (c, p, _q, b) => {
  const curso = cursoPropio(c, Number(p.cursoId));
  if (!curso) throw noEncontrado();
  const a = c.cat.asignaturas.get(b.asignaturaId);
  if (!a) throw new Problema(400, 'Elige la asignatura');
  if (b.cantidad < 1 || b.cantidad > MAXIMO_PREGUNTAS) throw new Problema(400, `La cantidad de preguntas debe estar entre 1 y ${MAXIMO_PREGUNTAS}`);
  const tipos: TipoPregunta[] = b.tipos?.length ? [...new Set<TipoPregunta>(b.tipos)] : ['Unica', 'Multiple', 'VerdaderoFalso', 'Abierta'];
  const dificultad = DIFICULTADES.find((d) => d.toLowerCase() === String(b.dificultad ?? '').toLowerCase()) ?? 'Intermedio';
  const delCurso = oasDe(c, curso.id).map((x) => c.oas.get(x.objetivoId)!);
  const ids: number[] = b.oaIds ?? [];
  const oas = ordenar(ids.length ? delCurso.filter((o) => ids.includes(o.id)) : delCurso.filter((o) => o.asignaturaId === a.id), (o) => o.numero);
  if (oas.length === 0) throw new Problema(400, 'Elige al menos un OA del curso (o asígnale OA de esta asignatura al curso)');
  if ((b.materialIds ?? []).length > 5) throw new Problema(400, 'Puedes usar hasta 5 materiales por evaluación');
  await esperar(2600); // deja ver el paso "Procesando"
  const r = generarEsquema(oas.map((o) => ({ id: o.id, codigo: codigoOa(o, c.cat), descripcion: o.descripcion })), b.cantidad, tipos, a.nombre, b.consigna ?? null);
  return json({
    titulo: r.titulo, instrucciones: 'Lee cada pregunta con calma. Si tienes dudas, puedes pedirle ayuda a Metis.', porIa: false, dificultad,
    aviso: 'Demo de presentación: estas preguntas vienen de un banco de ejemplo. En la versión conectada, Claude las genera desde tu consigna, los OA y tus materiales.',
    preguntas: r.preguntas.map((x) => ({ ...x, oa: oa(c, x.objetivoId), asistenteHabilitado: true })),
  });
});
ruta('POST', '/cursos/:cursoId/evaluaciones/desde-esquema', (c, p, _q, b) => {
  const cursoId = Number(p.cursoId);
  if (!cursoPropio(c, cursoId)) throw noEncontrado();
  if (!b.titulo?.trim()) throw new Problema(400, 'El título es obligatorio');
  if (!c.cat.asignaturas.has(b.asignaturaId)) throw new Problema(400, 'Asignatura inválida');
  if (!b.preguntas?.length) throw new Problema(400, 'El esquema no tiene preguntas');
  const oasCurso = new Set(oasDe(c, cursoId).map((x) => x.objetivoId));
  const preguntas = (b.preguntas as PreguntaRequest[]).map((r, i) => validarPregunta(r, i + 1, oasCurso));
  const e = nuevaEvaluacion(c, {
    cursoId, asignaturaId: b.asignaturaId, titulo: b.titulo.trim(), tipo: b.tipo, instrucciones: limpio(b.instrucciones),
    duracionMinutos: Math.min(Math.max(b.duracionMinutos, 5), 240), dificultad: DIFICULTADES.find((d) => d === b.dificultad) ?? null, generadaConIa: !!b.generadaConIa,
  });
  agregarPreguntas(c, e.id, preguntas);
  return json({ id: e.id }, 201);
});
const nombreEstudiante = (c: Ctx, id: number | null) => {
  const e = id === null ? null : c.db.estudiantes.find((x) => x.id === id);
  return e ? `${e.nombre} ${e.apellido}` : null;
};
ruta('GET', '/evaluaciones/:id/conversaciones', (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  const preguntas = new Map(preguntasDe(c, e.id).map((x) => [x.id, x]));
  const lista = c.db.intentos.filter((i) => i.evaluacionId === e.id && !i.esPrueba).flatMap((i) => {
    const porPregunta = new Map<number, Db['mensajes']>();
    for (const m of c.db.mensajes) if (m.intentoId === i.id && m.preguntaId !== null && preguntas.has(m.preguntaId)) porPregunta.set(m.preguntaId, [...(porPregunta.get(m.preguntaId) ?? []), m]);
    const est = i.estudianteId === null ? null : c.db.estudiantes.find((x) => x.id === i.estudianteId) ?? null;
    return [...porPregunta].map(([pid, ms]) => {
      const x = preguntas.get(pid)!;
      const mensajes = ordenar(ms, (m) => m.creadoEn, (m) => m.id);
      const niveles = mensajes.map((m) => m.nivelAyuda).filter((n): n is number => n !== null);
      return {
        intentoId: i.id, estudianteId: est?.id ?? null, estudiante: nombreEstudiante(c, i.estudianteId) ?? '—', diagnostico: est?.diagnostico ?? null,
        preguntaId: x.id, preguntaOrden: x.orden, enunciado: x.enunciado, ayudas: mensajes.filter((m) => m.rol === 'metis' && m.nivelAyuda !== null).length,
        nivelMaximo: niveles.length ? Math.max(...niveles) : null,
        mensajes: mensajes.map((m) => ({ rol: m.rol, texto: m.texto, nivelAyuda: m.nivelAyuda, porIa: m.porIa, creadoEn: m.creadoEn })),
      };
    });
  });
  return json(ordenar(lista, (x) => x.preguntaOrden, (x) => x.estudiante));
});
ruta('POST', '/evaluaciones/:id/dudas', async (c, p) => {
  const e = evaluacionPropia(c, Number(p.id));
  if (!e) throw noEncontrado();
  const preguntas = new Map(preguntasDe(c, e.id).map((x) => [x.id, x]));
  const intentos = new Map(c.db.intentos.filter((i) => i.evaluacionId === e.id && !i.esPrueba).map((i) => [i.id, i]));
  const consultas = c.db.mensajes
    .filter((m) => m.rol === 'estudiante' && m.preguntaId !== null && preguntas.has(m.preguntaId) && intentos.has(m.intentoId))
    .map((m) => ({ pregunta: preguntas.get(m.preguntaId!)!, estudiante: nombreEstudiante(c, intentos.get(m.intentoId)!.estudianteId) ?? `intento ${m.intentoId}` }));
  if (consultas.length === 0) return json({ resumen: 'Todavía no hay consultas a Metis en esta evaluación.', dudas: [], porIa: false });
  await esperar(1200);
  const grupos = new Map<number, { orden: number; enunciado: string; estudiantes: Set<string> }>();
  for (const x of consultas) {
    const g = grupos.get(x.pregunta.id) ?? { orden: x.pregunta.orden, enunciado: x.pregunta.enunciado, estudiantes: new Set<string>() };
    g.estudiantes.add(x.estudiante);
    grupos.set(x.pregunta.id, g);
  }
  const dudas = [...grupos.values()]
    .map((g) => ({ pregunta: g.orden, duda: `Consultas sobre: ${g.enunciado}`, estudiantes: g.estudiantes.size, sugerencia: 'Revisa las conversaciones de esta pregunta para ver qué no quedó claro.' }))
    .sort((a, b) => b.estudiantes - a.estudiantes)
    .slice(0, 6);
  const total = new Set(consultas.map((x) => x.estudiante)).size;
  return json({
    resumen: `${total} estudiantes hicieron ${consultas.length} consultas a Metis. En la versión conectada, Claude agrupa aquí las dudas por concepto y sugiere qué reforzar.`,
    dudas, porIa: false,
  });
});

// ---------------- Rendición pública (estudiante) ----------------
const porToken = (c: Ctx, token: string) => {
  const e = c.db.evaluaciones.find((x) => x.token === token);
  if (!e || e.estado === 'Borrador') throw new Problema(404, 'Este link no corresponde a una evaluación disponible');
  return e;
};
ruta('GET', '/publico/evaluaciones/:token', (c, p) => {
  const e = porToken(c, p.token);
  return json({
    titulo: e.titulo, instrucciones: e.instrucciones, asignatura: asig(c, e.asignaturaId).nombre, curso: nombreCurso(c, e.cursoId),
    anio: c.db.cursos.find((x) => x.id === e.cursoId)!.anio, duracionMinutos: e.duracionMinutos, estado: e.estado, asistenteActivo: e.asistenteActivo,
    preguntas: preguntasDe(c, e.id).length,
  });
});
ruta('POST', '/publico/evaluaciones/:token/ingresar', (c, p, _q, b) => {
  const e = porToken(c, p.token);
  if (e.estado === 'Cerrada') throw new Problema(409, 'Esta evaluación ya cerró. Consulta con tu profesor.');
  const rut = normalizarRut(b.rut);
  if (!rut) throw new Problema(400, 'Revisa tu RUT: el dígito verificador no coincide');
  const est = c.db.estudiantes.find((s) => s.rut === rut && s.cursoId === e.cursoId);
  if (!est) throw new Problema(404, 'Tu RUT no está en la nómina de este curso. Avísale a tu profesor.');
  let i = c.db.intentos.find((x) => x.evaluacionId === e.id && x.estudianteId === est.id && !x.esPrueba);
  if (i?.entregadoEn) throw new Problema(409, 'Ya entregaste esta evaluación. ¡Bien hecho!');
  i ??= nuevoIntento(c, e.id, est.id, false);
  return json({ clave: i.clave });
});
function intentoPorClave(c: Ctx, clave: string) {
  const i = c.db.intentos.find((x) => x.clave === clave);
  if (!i) throw noEncontrado();
  return { i, e: c.db.evaluaciones.find((x) => x.id === i.evaluacionId)! };
}
ruta('GET', '/publico/intentos/:clave', (c, p) => {
  const { i, e } = intentoPorClave(c, p.clave);
  const preguntas = preguntasDelIntento(c, e, i.estudianteId);
  const est = i.estudianteId === null ? null : c.db.estudiantes.find((x) => x.id === i.estudianteId)!;
  const limite = new Date(i.iniciadoEn).getTime() + e.duracionMinutos * 60_000;
  return json({
    clave: i.clave, estado: i.entregadoEn ? 'Entregado' : 'EnCurso', esPrueba: i.esPrueba, estudiante: est && { nombre: est.nombre, apellido: est.apellido },
    evaluacion: {
      titulo: e.titulo, instrucciones: e.instrucciones, asignatura: asig(c, e.asignaturaId).nombre, curso: nombreCurso(c, e.cursoId), tipo: e.tipo,
      duracionMinutos: e.duracionMinutos, asistenteActivo: e.asistenteActivo, nivelAyuda: e.nivelAyuda,
    },
    segundosRestantes: i.entregadoEn ? 0 : Math.max(0, Math.floor((limite - Date.now()) / 1000)),
    omitidas: preguntasDe(c, e.id).length - preguntas.length,
    preguntas: preguntas.map((x, idx) => ({
      id: x.id, numero: idx + 1, tipo: x.tipo, enunciado: x.enunciado, opciones: x.opciones, puntaje: x.puntaje,
      oa: x.objetivoId === null ? null : { codigoOficial: codigoOa(c.oas.get(x.objetivoId)!, c.cat), descripcion: c.oas.get(x.objetivoId)!.descripcion },
      asistente: e.asistenteActivo && x.asistenteHabilitado,
    })),
    respuestas: i.respuestas.map((r) => ({ preguntaId: r.preguntaId, seleccion: r.seleccion, texto: r.texto })),
    mensajes: ordenar(c.db.mensajes.filter((m) => m.intentoId === i.id), (m) => m.creadoEn, (m) => m.id).map((m) => ({ preguntaId: m.preguntaId, rol: m.rol, texto: m.texto, nivelAyuda: m.nivelAyuda })),
  });
});
ruta('PUT', '/publico/intentos/:clave/respuestas', (c, p, _q, b) => {
  const { i, e } = intentoPorClave(c, p.clave);
  if (i.entregadoEn) throw new Problema(409, 'La evaluación ya fue entregada');
  i.respuestas = normalizarRespuestas(b.respuestas, preguntasDelIntento(c, e, i.estudianteId));
  return vacio();
});
ruta('POST', '/publico/intentos/:clave/mensajes', async (c, p, _q, b) => {
  const { i, e } = intentoPorClave(c, p.clave);
  if (i.entregadoEn) throw new Problema(409, 'La evaluación ya fue entregada');
  let texto = String(b.texto ?? '').trim();
  if (!texto) throw new Problema(400, 'Escribe tu pregunta para Metis');
  texto = texto.slice(0, 600);
  const x = preguntasDelIntento(c, e, i.estudianteId).find((q) => q.id === b.preguntaId);
  if (!x) throw new Problema(400, 'Pregunta inválida');
  const llegada = ahora();
  const est = i.estudianteId === null ? null : c.db.estudiantes.find((s) => s.id === i.estudianteId)!;
  const objetivo = x.objetivoId === null ? null : c.oas.get(x.objetivoId)!;
  const r = responderMetis(
    {
      pregunta: x, objetivo, codigoOa: objetivo && codigoOa(objetivo, c.cat), nivelMaximo: e.nivelAyuda, activo: e.asistenteActivo,
      instruccionesDocente: e.instruccionesAsistente, ayudasPrevias: ayudas(c, i.id).filter((m) => m.preguntaId === x.id).length,
      lenguajeClaro: est?.diagnostico === 'TEA', nombreEstudiante: est?.nombre ?? 'profe',
    },
    texto,
  );
  await esperar(900);
  c.db.mensajes.push({ id: siguienteId(c.db.mensajes), intentoId: i.id, preguntaId: x.id, rol: 'estudiante', texto, nivelAyuda: null, porIa: false, creadoEn: llegada });
  c.db.mensajes.push({ id: siguienteId(c.db.mensajes), intentoId: i.id, preguntaId: x.id, rol: 'metis', texto: r.texto, nivelAyuda: r.nivel, porIa: false, creadoEn: ahora() });
  return json({ texto: r.texto, nivel: r.nivel });
});
ruta('POST', '/publico/intentos/:clave/entregar', (c, p, _q, b) => {
  const { i, e } = intentoPorClave(c, p.clave);
  if (i.entregadoEn) throw new Problema(409, 'La evaluación ya fue entregada');
  const preguntas = preguntasDelIntento(c, e, i.estudianteId);
  const respuestas = normalizarRespuestas(b.respuestas, preguntas);
  for (const x of preguntas) if (!respuestas.some((r) => r.preguntaId === x.id)) respuestas.push({ preguntaId: x.id, seleccion: [], texto: null, puntaje: null, comentario: null });
  for (const r of respuestas) r.puntaje = corregir(preguntas.find((x) => x.id === r.preguntaId)!, r);
  i.respuestas = respuestas;
  i.entregadoEn = ahora();
  recalcular(i, preguntas, e.exigencia);
  return json({
    entregada: true, respondidas: respuestas.filter((r) => r.seleccion.length > 0 || r.texto !== null).length, total: preguntas.length,
    nota: i.esPrueba ? i.nota : null, puntaje: i.esPrueba ? i.puntajeObtenido : null, puntajeMaximo: i.puntajeMaximo,
  });
});

// ---------------- Enrutador ----------------
const compiladas = rutas.map(([metodo, patron, h]) => {
  const nombres: string[] = [];
  const re = new RegExp(`^${patron.replace(/:(\w+)/g, (_, n) => (nombres.push(n), '([^/]+)'))}/?$`);
  return { metodo, re, nombres, h };
});

/** Responde una llamada a /api/... como lo haría la API .NET. */
export async function responder(url: string, init: RequestInit = {}): Promise<Response> {
  const u = new URL(url, 'http://demo');
  const ruta = u.pathname.replace(/^\/api/, '');
  const metodo = (init.method ?? 'GET').toUpperCase();
  const r = compiladas.find((x) => x.metodo === metodo && x.re.test(ruta));
  if (!r) return fallo(404, 'No encontrado');
  const publica = ruta.startsWith('/publico/') || ruta === '/auth/login';
  const auth = new Headers(init.headers).get('authorization');
  if (!publica && auth !== `Bearer ${TOKEN_DEMO}`) return new Response(null, { status: 401 });

  const m = r.re.exec(ruta)!;
  const params = Object.fromEntries(r.nombres.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  const db = await obtenerDb();
  const ctx: Ctx = {
    db,
    cat: { asignaturas: new Map(db.asignaturas.map((a) => [a.id, a])), niveles: new Map(db.niveles.map((n) => [n.id, n])) },
    oas: new Map(db.objetivos.map((o) => [o.id, o])),
  };
  try {
    const res = await r.h(ctx, params, u.searchParams, body, init);
    if (metodo !== 'GET') guardar();
    return res;
  } catch (e) {
    if (e === NO_ENCONTRADO) return new Response(null, { status: 404 }); // como Results.NotFound(): sin cuerpo
    if (e instanceof Problema) return fallo(e.status, e.message);
    console.error(e);
    return fallo(500, 'Algo falló en la demo. Prueba con «Restablecer demo».');
  }
}
