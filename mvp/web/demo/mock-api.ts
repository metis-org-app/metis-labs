// API simulado para la versión artifact: misma forma de respuestas y mismas reglas que api/ (.NET).
// Los datos viven en localStorage del navegador de cada persona.
import oasCsv from '../../data/oas.csv';
import { digitoVerificador } from '../lib/rut';

type Asignatura = { id: number; codigo: string; nombre: string };
type Nivel = { id: number; codigo: string; nombre: string; orden: number };
type Oa = { id: number; asignaturaId: number; nivelId: number; numero: number; eje: string | null; descripcion: string };
type Curso = { id: number; profesorId: number; nivelId: number; letra: string; anio: number };
type CursoOa = { cursoId: number; objetivoId: number };
type TipoPie = 'Ninguno' | 'Permanente' | 'Transitorio';
type Estudiante = {
  id: number; cursoId: number | null; rut: string; nombre: string; apellido: string; fechaNacimiento: string | null;
  diagnostico: string | null; nivelTea: number | null; tipoPie: TipoPie; observaciones: string | null;
};
type Exclusion = { cursoId: number; objetivoId: number; estudianteId: number };
type Plan = {
  id: number; cursoId: number; semanaInicio: string; titulo: string; actividades: string | null;
  adecuaciones: string | null; objetivoIds: number[];
};
type Db = {
  seq: number;
  profesor: { id: number; nombre: string; email: string; rol: string };
  asignaturas: Asignatura[]; niveles: Nivel[]; oas: Oa[]; cursos: Curso[]; cursoOas: CursoOa[];
  estudiantes: Estudiante[]; exclusiones: Exclusion[]; planes: Plan[];
};

const KEY = 'metis.demo.v1';
const TOKEN = 'demo-token';
const PASSWORD = 'metis123';

// ---------------- Persistencia ----------------

let db: Db; // se inicializa en instalarMockApi()

function cargar(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* sin almacenamiento: se usa la semilla en memoria */
  }
  return semilla();
}

function guardar() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* sin almacenamiento */
  }
}

const nextId = () => ++db.seq;

// ---------------- Semilla (igual que api/src/Seed/Seeder.cs) ----------------

function semilla(): Db {
  const d: Db = {
    seq: 0,
    profesor: { id: 1, nombre: 'Juan Soler', email: 'profe@metis.cl', rol: 'Profesor' },
    asignaturas: [], niveles: [], oas: [], cursos: [], cursoOas: [], estudiantes: [], exclusiones: [], planes: [],
  };
  db = d;
  let orden = 0;
  for (const c of ['1B', '2B', '3B', '4B', '5B', '6B', '7B', '8B'])
    d.niveles.push({ id: nextId(), codigo: c, nombre: `${c[0]}° Básico`, orden: ++orden });
  for (const c of ['1M', '2M', '3M', '4M'])
    d.niveles.push({ id: nextId(), codigo: c, nombre: `${c[0]}° Medio`, orden: ++orden });
  for (const [codigo, nombre] of [
    ['LEN', 'Lenguaje y Comunicación'],
    ['MAT', 'Matemática'],
    ['CN', 'Ciencias Naturales'],
    ['HIS', 'Historia, Geografía y Ciencias Sociales'],
  ])
    d.asignaturas.push({ id: nextId(), codigo, nombre });

  importarCsv(oasCsv);

  const nivel = (c: string) => d.niveles.find((n) => n.codigo === c)!;
  const anio = new Date().getFullYear();
  const curso = (nv: string, letra: string) => {
    const c = { id: nextId(), profesorId: 1, nivelId: nivel(nv).id, letra, anio };
    d.cursos.push(c);
    return c;
  };
  const c1A = curso('1B', 'A');
  const c4B = curso('4B', 'B');
  const c8A = curso('8B', 'A');
  for (const [c, nv] of [[c1A, '1B'], [c8A, '8B']] as const)
    for (const o of d.oas.filter((o) => o.nivelId === nivel(nv).id)) d.cursoOas.push({ cursoId: c.id, objetivoId: o.id });

  let rutBase = 26_100_000;
  const est = (c: Curso, nombre: string, apellido: string, dx: string | null, nivelTea: number | null, tipoPie: TipoPie, edad: number) => {
    const cuerpo = String(rutBase++);
    d.estudiantes.push({
      id: nextId(), cursoId: c.id, rut: `${cuerpo}-${digitoVerificador(cuerpo)}`, nombre, apellido,
      fechaNacimiento: `${anio - edad}-${String(3 + (rutBase % 9)).padStart(2, '0')}-${String(1 + (rutBase % 27)).padStart(2, '0')}`,
      diagnostico: dx, nivelTea, tipoPie, observaciones: null,
    });
  };
  est(c1A, 'Martina', 'Ejemplo Uno', 'TEA', 1, 'Permanente', 6);
  est(c1A, 'Tomás', 'Ejemplo Dos', 'TEA', 2, 'Permanente', 7);
  est(c1A, 'Isidora', 'Ejemplo Tres', 'TDA-H', null, 'Transitorio', 6);
  est(c1A, 'Benjamín', 'Ejemplo Cuatro', 'TL', null, 'Transitorio', 6);
  est(c1A, 'Florencia', 'Ejemplo Cinco', null, null, 'Ninguno', 7);
  est(c1A, 'Agustín', 'Ejemplo Seis', null, null, 'Ninguno', 6);
  est(c4B, 'Josefa', 'Ejemplo Siete', 'TEA', 1, 'Permanente', 9);
  est(c4B, 'Vicente', 'Ejemplo Ocho', 'TL', null, 'Transitorio', 10);
  est(c8A, 'Maximiliano', 'Ejemplo Nueve', 'TEA', 1, 'Permanente', 13);
  est(c8A, 'Antonia', 'Ejemplo Diez', 'TDA-H', null, 'Transitorio', 14);
  est(c8A, 'Lucas', 'Ejemplo Once', null, null, 'Ninguno', 13);

  const cn = d.asignaturas.find((a) => a.codigo === 'CN')!;
  d.planes.push({
    id: nextId(), cursoId: c1A.id, semanaInicio: lunes(hoyIso()), titulo: 'Seres vivos y su entorno',
    actividades: 'Salida al patio para observar plantas e insectos; registro con dibujos; comparación de animales por cubierta corporal.',
    adecuaciones: 'Anticipar la salida con agenda visual; pictogramas para el registro; espacio de calma disponible.',
    objetivoIds: d.oas.filter((o) => o.nivelId === nivel('1B').id && o.asignaturaId === cn.id && o.numero <= 2).map((o) => o.id),
  });
  return d;
}

// ---------------- Utilidades ----------------

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const fallar = (status: number, detail: string): never => {
  throw new HttpError(status, detail);
};

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function lunes(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const nivelDe = (id: number) => db.niveles.find((n) => n.id === id)!;
const asigDe = (id: number) => db.asignaturas.find((a) => a.id === id)!;
const cursoNombre = (c: Curso) => `${nivelDe(c.nivelId).nombre} ${c.letra}`;
const vacioANull = (s: unknown) => (typeof s === 'string' && s.trim() ? s.trim() : null);

function normalizarRut(input: string): string | null {
  const limpio = (input ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return null;
  const cuerpo = limpio.slice(0, -1);
  if (!/^\d{1,8}$/.test(cuerpo)) return null;
  return digitoVerificador(cuerpo) === limpio.slice(-1) ? `${cuerpo.replace(/^0+/, '')}-${limpio.slice(-1)}` : null;
}

function cursoPropio(id: number) {
  return db.cursos.find((c) => c.id === id && c.profesorId === db.profesor.id) ?? null;
}

function oaDto(o: Oa) {
  const n = nivelDe(o.nivelId);
  return {
    id: o.id, codigo: `OA${o.numero}`, numero: o.numero, eje: o.eje, descripcion: o.descripcion,
    asignaturaId: o.asignaturaId, asignatura: asigDe(o.asignaturaId).nombre, nivelId: o.nivelId, nivel: n.nombre, nivelOrden: n.orden,
  };
}

function estudianteDto(e: Estudiante) {
  const c = e.cursoId ? db.cursos.find((x) => x.id === e.cursoId) : null;
  return { ...e, curso: c ? cursoNombre(c) : null };
}

// ---------------- CSV (igual que CsvImporter.cs) ----------------

function parseCsv(csv: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let comillas = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (comillas) {
      if (c === '"' && csv[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); campo = ''; filas.push(fila); fila = []; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

function importarCsv(csv: string) {
  let creados = 0, actualizados = 0;
  const errores: string[] = [];
  parseCsv(csv).forEach((f, i) => {
    const linea = i + 1;
    if (i === 0 && f[0]?.trim().toLowerCase() === 'asignatura') return;
    if (f.every((x) => !x.trim())) return;
    if (f.length < 5) return errores.push(`Línea ${linea}: se esperaban 5 columnas`);
    const asig = db.asignaturas.find((a) => a.codigo.toLowerCase() === f[0].trim().toLowerCase() || a.nombre.toLowerCase() === f[0].trim().toLowerCase());
    const nivel = db.niveles.find((n) => n.codigo.toLowerCase() === f[1].trim().toLowerCase());
    if (!asig) return errores.push(`Línea ${linea}: asignatura desconocida '${f[0]}'`);
    if (!nivel) return errores.push(`Línea ${linea}: nivel desconocido '${f[1]}'`);
    const numero = Number(f[2].trim().toUpperCase().replace('OA', ''));
    if (!Number.isInteger(numero) || numero <= 0) return errores.push(`Línea ${linea}: número de OA inválido '${f[2]}'`);
    const descripcion = f[4].trim();
    if (!descripcion) return errores.push(`Línea ${linea}: descripción vacía`);
    const eje = f[3].trim() || null;
    const existente = db.oas.find((o) => o.asignaturaId === asig.id && o.nivelId === nivel.id && o.numero === numero);
    if (existente) {
      if (existente.descripcion !== descripcion || existente.eje !== eje) {
        existente.descripcion = descripcion;
        existente.eje = eje;
        actualizados++;
      }
    } else {
      db.oas.push({ id: nextId(), asignaturaId: asig.id, nivelId: nivel.id, numero, eje, descripcion });
      creados++;
    }
  });
  return { creados, actualizados, errores };
}

// ---------------- Rutas ----------------

type Req = { method: string; path: string[]; query: URLSearchParams; body: any; text: string };
type Handler = (r: Req, p: Record<string, number>) => unknown;
const rutas: [string, string, Handler][] = [];
const ruta = (method: string, pattern: string, h: Handler) => rutas.push([method, pattern, h]);

ruta('GET', 'health', () => ({ message: 'API Metis Curriculum funcionando ✅', version: '0.1 - demo en el navegador' }));

ruta('POST', 'auth/login', ({ body }) => {
  if (String(body?.email ?? '').trim().toLowerCase() !== db.profesor.email || body?.password !== PASSWORD)
    fallar(401, 'Email o contraseña incorrectos');
  return { tokenType: 'Bearer', accessToken: TOKEN, expiresIn: 43200 };
});
ruta('GET', 'auth/me', () => ({ ...db.profesor }));
ruta('POST', '__demo/reset', () => {
  db = semilla();
  return null;
});

ruta('GET', 'asignaturas', () => [...db.asignaturas].sort((a, b) => a.nombre.localeCompare(b.nombre)));
ruta('GET', 'niveles', () => [...db.niveles].sort((a, b) => a.orden - b.orden));

ruta('GET', 'oas', ({ query }) => {
  let lista = db.oas;
  const asignaturaId = Number(query.get('asignaturaId')) || null;
  const nivelId = Number(query.get('nivelId')) || null;
  const q = query.get('q')?.trim();
  if (asignaturaId) lista = lista.filter((o) => o.asignaturaId === asignaturaId);
  if (nivelId) lista = lista.filter((o) => o.nivelId === nivelId);
  if (q) {
    const numero = Number(q.toUpperCase().replace('OA', '').trim());
    const t = norm(q);
    lista = lista.filter((o) => o.numero === numero || norm(o.descripcion).includes(t) || (o.eje && norm(o.eje).includes(t)));
  }
  return lista
    .map(oaDto)
    .sort((a, b) => a.nivelOrden - b.nivelOrden || a.asignatura.localeCompare(b.asignatura) || a.numero - b.numero);
});

function validarOa(body: any) {
  if (!(Number(body.numero) > 0)) fallar(400, 'El número de OA debe ser mayor que 0');
  if (!vacioANull(body.descripcion)) fallar(400, 'La descripción es obligatoria');
}
ruta('POST', 'oas', ({ body }) => {
  validarOa(body);
  if (db.oas.some((o) => o.asignaturaId === body.asignaturaId && o.nivelId === body.nivelId && o.numero === body.numero))
    fallar(409, `Ya existe el OA${body.numero} para esa asignatura y nivel`);
  const oa: Oa = { id: nextId(), asignaturaId: body.asignaturaId, nivelId: body.nivelId, numero: body.numero, eje: vacioANull(body.eje), descripcion: body.descripcion.trim() };
  db.oas.push(oa);
  return { id: oa.id };
});
ruta('PUT', 'oas/:id', ({ body }, { id }) => {
  validarOa(body);
  const oa = db.oas.find((o) => o.id === id) ?? fallar(404, 'No encontrado');
  if (db.oas.some((o) => o.id !== id && o.asignaturaId === body.asignaturaId && o.nivelId === body.nivelId && o.numero === body.numero))
    fallar(409, `Ya existe el OA${body.numero} para esa asignatura y nivel`);
  Object.assign(oa, { asignaturaId: body.asignaturaId, nivelId: body.nivelId, numero: body.numero, eje: vacioANull(body.eje), descripcion: body.descripcion.trim() });
  return null;
});
ruta('DELETE', 'oas/:id', (_r, { id }) => {
  if (db.cursoOas.some((c) => c.objetivoId === id))
    fallar(409, 'El OA está asignado a uno o más cursos; quítalo de los cursos antes de eliminarlo');
  if (!db.oas.some((o) => o.id === id)) fallar(404, 'No encontrado');
  db.oas = db.oas.filter((o) => o.id !== id);
  return null;
});
ruta('POST', 'oas/importar', ({ text }) => importarCsv(text));

ruta('GET', 'cursos', () =>
  db.cursos
    .filter((c) => c.profesorId === db.profesor.id)
    .map((c) => ({
      id: c.id, nivelId: c.nivelId, nivel: nivelDe(c.nivelId).nombre, letra: c.letra, anio: c.anio, nombre: cursoNombre(c),
      totalOas: db.cursoOas.filter((x) => x.cursoId === c.id).length,
      totalEstudiantes: db.estudiantes.filter((e) => e.cursoId === c.id).length,
      orden: nivelDe(c.nivelId).orden,
    }))
    .sort((a, b) => b.anio - a.anio || a.orden - b.orden || a.letra.localeCompare(b.letra)),
);
ruta('POST', 'cursos', ({ body }) => {
  const letra = String(body.letra ?? '').trim().toUpperCase();
  if (!letra || letra.length > 3) fallar(400, 'La letra del curso es obligatoria (ej: A)');
  if (!db.niveles.some((n) => n.id === body.nivelId)) fallar(400, 'Nivel inválido');
  if (db.cursos.some((c) => c.profesorId === db.profesor.id && c.nivelId === body.nivelId && c.letra === letra && c.anio === body.anio))
    fallar(409, 'Ya tienes ese curso para ese año');
  const c: Curso = { id: nextId(), profesorId: db.profesor.id, nivelId: body.nivelId, letra, anio: body.anio };
  db.cursos.push(c);
  return { id: c.id };
});
ruta('DELETE', 'cursos/:id', (_r, { id }) => {
  if (!cursoPropio(id)) fallar(404, 'No encontrado');
  db.cursos = db.cursos.filter((c) => c.id !== id);
  db.cursoOas = db.cursoOas.filter((c) => c.cursoId !== id);
  db.exclusiones = db.exclusiones.filter((x) => x.cursoId !== id);
  db.planes = db.planes.filter((p) => p.cursoId !== id);
  for (const e of db.estudiantes) if (e.cursoId === id) e.cursoId = null;
  return null;
});

ruta('GET', 'cursos/:id/oas', (_r, { id }) => {
  if (!cursoPropio(id)) fallar(404, 'No encontrado');
  return db.cursoOas
    .filter((c) => c.cursoId === id)
    .map((c) => db.oas.find((o) => o.id === c.objetivoId)!)
    .map((o) => ({
      ...oaDto(o),
      excluidos: db.exclusiones.filter((x) => x.cursoId === id && x.objetivoId === o.id).length,
    }))
    .sort((a, b) => a.asignatura.localeCompare(b.asignatura) || a.numero - b.numero);
});
ruta('POST', 'cursos/:id/oas', ({ body }, { id }) => {
  if (!cursoPropio(id)) fallar(404, 'No encontrado');
  const pedidos: number[] = body.objetivoIds ?? [];
  const validos = db.oas.filter((o) => pedidos.includes(o.id)).map((o) => o.id);
  const nuevos = validos.filter((oid) => !db.cursoOas.some((c) => c.cursoId === id && c.objetivoId === oid));
  for (const oid of nuevos) db.cursoOas.push({ cursoId: id, objetivoId: oid });
  return { asignados: nuevos.length, yaExistian: validos.length - nuevos.length };
});
ruta('DELETE', 'cursos/:id/oas/:oaId', (_r, { id, oaId }) => {
  if (!cursoPropio(id)) fallar(404, 'No encontrado');
  db.cursoOas = db.cursoOas.filter((c) => !(c.cursoId === id && c.objetivoId === oaId));
  db.exclusiones = db.exclusiones.filter((x) => !(x.cursoId === id && x.objetivoId === oaId));
  return null;
});
ruta('GET', 'cursos/:id/oas/:oaId/exclusiones', (_r, { id, oaId }) => {
  if (!cursoPropio(id)) fallar(404, 'No encontrado');
  return db.estudiantes
    .filter((e) => e.cursoId === id)
    .sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre))
    .map((e) => ({
      id: e.id, nombre: e.nombre, apellido: e.apellido, diagnostico: e.diagnostico,
      excluido: db.exclusiones.some((x) => x.cursoId === id && x.objetivoId === oaId && x.estudianteId === e.id),
    }));
});
ruta('PUT', 'cursos/:id/oas/:oaId/exclusiones', ({ body }, { id, oaId }) => {
  if (!cursoPropio(id)) fallar(404, 'No encontrado');
  if (!db.cursoOas.some((c) => c.cursoId === id && c.objetivoId === oaId)) fallar(400, 'El OA no está asignado a este curso');
  const ids: number[] = body.estudianteIds ?? [];
  const delCurso = db.estudiantes.filter((e) => e.cursoId === id && ids.includes(e.id)).map((e) => e.id);
  db.exclusiones = db.exclusiones.filter((x) => !(x.cursoId === id && x.objetivoId === oaId));
  for (const eid of delCurso) db.exclusiones.push({ cursoId: id, objetivoId: oaId, estudianteId: eid });
  return { excluidos: delCurso.length };
});
ruta('GET', 'cursos/:id/panorama', (_r, { id }) => {
  const curso = cursoPropio(id) ?? fallar(404, 'No encontrado');
  const ests = db.estudiantes
    .filter((e) => e.cursoId === id)
    .sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre))
    .map((e) => ({ id: e.id, nombre: e.nombre, apellido: e.apellido, diagnostico: e.diagnostico, nivelTea: e.nivelTea, tipoPie: e.tipoPie }));
  const porAsig = new Map<string, number>();
  for (const c of db.cursoOas.filter((x) => x.cursoId === id)) {
    const nombre = asigDe(db.oas.find((o) => o.id === c.objetivoId)!.asignaturaId).nombre;
    porAsig.set(nombre, (porAsig.get(nombre) ?? 0) + 1);
  }
  const dx = new Map<string, number>();
  for (const e of ests) if (e.diagnostico) dx.set(e.diagnostico, (dx.get(e.diagnostico) ?? 0) + 1);
  const oasPorAsignatura = [...porAsig].map(([asignatura, total]) => ({ asignatura, total })).sort((a, b) => a.asignatura.localeCompare(b.asignatura));
  return {
    curso: { id: curso.id, nombre: cursoNombre(curso), anio: curso.anio },
    totalEstudiantes: ests.length,
    permanentes: ests.filter((e) => e.tipoPie === 'Permanente'),
    transitorios: ests.filter((e) => e.tipoPie === 'Transitorio'),
    sinPie: ests.filter((e) => e.tipoPie === 'Ninguno'),
    diagnosticos: [...dx].map(([diagnostico, total]) => ({ diagnostico, total })).sort((a, b) => b.total - a.total),
    oasPorAsignatura,
    totalOas: oasPorAsignatura.reduce((s, x) => s + x.total, 0),
    planificaciones: db.planes.filter((p) => p.cursoId === id).length,
    exclusiones: db.exclusiones.filter((x) => x.cursoId === id).length,
  };
});

ruta('GET', 'estudiantes', ({ query }) => {
  let lista = db.estudiantes.filter((e) => e.cursoId === null || cursoPropio(e.cursoId));
  const cursoId = Number(query.get('cursoId')) || null;
  const q = query.get('q')?.trim();
  if (cursoId) lista = lista.filter((e) => e.cursoId === cursoId);
  if (q) lista = lista.filter((e) => norm(`${e.nombre} ${e.apellido}`).includes(norm(q)) || e.rut.includes(q));
  return lista.sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre)).map(estudianteDto);
});
function validarEstudiante(body: any, id: number | null) {
  const rut = normalizarRut(body.rut) ?? fallar(400, 'RUT inválido (revisa el dígito verificador)');
  if (!vacioANull(body.nombre) || !vacioANull(body.apellido)) fallar(400, 'Nombre y apellido son obligatorios');
  if (body.nivelTea != null && ![1, 2, 3].includes(body.nivelTea)) fallar(400, 'El nivel TEA debe ser 1, 2 o 3');
  if (body.cursoId != null && !cursoPropio(body.cursoId)) fallar(400, 'Curso inválido');
  if (db.estudiantes.some((e) => e.rut === rut && e.id !== id)) fallar(409, 'Ya existe un estudiante con ese RUT');
  return {
    rut, nombre: body.nombre.trim(), apellido: body.apellido.trim(), fechaNacimiento: body.fechaNacimiento || null,
    cursoId: body.cursoId ?? null, diagnostico: vacioANull(body.diagnostico), nivelTea: body.nivelTea ?? null,
    tipoPie: (body.tipoPie ?? 'Ninguno') as TipoPie, observaciones: vacioANull(body.observaciones),
  };
}
ruta('POST', 'estudiantes', ({ body }) => {
  const e: Estudiante = { id: nextId(), ...validarEstudiante(body, null) };
  db.estudiantes.push(e);
  return { id: e.id };
});
ruta('PUT', 'estudiantes/:id', ({ body }, { id }) => {
  const e = db.estudiantes.find((x) => x.id === id && (x.cursoId === null || cursoPropio(x.cursoId))) ?? fallar(404, 'No encontrado');
  const datos = validarEstudiante(body, id);
  if (e.cursoId !== datos.cursoId) db.exclusiones = db.exclusiones.filter((x) => x.estudianteId !== id);
  Object.assign(e, datos);
  return null;
});
ruta('DELETE', 'estudiantes/:id', (_r, { id }) => {
  if (!db.estudiantes.some((e) => e.id === id)) fallar(404, 'No encontrado');
  db.estudiantes = db.estudiantes.filter((e) => e.id !== id);
  db.exclusiones = db.exclusiones.filter((x) => x.estudianteId !== id);
  return null;
});

ruta('GET', 'planificaciones', ({ query }) => {
  const cursoId = Number(query.get('cursoId'));
  if (!cursoPropio(cursoId)) fallar(404, 'No encontrado');
  return db.planes
    .filter((p) => p.cursoId === cursoId)
    .sort((a, b) => a.semanaInicio.localeCompare(b.semanaInicio))
    .map((p) => ({
      id: p.id, cursoId: p.cursoId, semanaInicio: p.semanaInicio, titulo: p.titulo, actividades: p.actividades, adecuaciones: p.adecuaciones,
      objetivos: p.objetivoIds
        .map((oid) => db.oas.find((o) => o.id === oid))
        .filter((o): o is Oa => !!o)
        .sort((a, b) => a.numero - b.numero)
        .map((o) => ({ id: o.id, codigo: `OA${o.numero}`, asignatura: asigDe(o.asignaturaId).nombre, descripcion: o.descripcion })),
    }));
});
function datosPlan(body: any) {
  if (!vacioANull(body.titulo)) fallar(400, 'El título es obligatorio');
  if (!cursoPropio(body.cursoId)) fallar(400, 'Curso inválido');
  const ids: number[] = body.objetivoIds ?? [];
  return {
    cursoId: body.cursoId, semanaInicio: lunes(body.semanaInicio || hoyIso()), titulo: body.titulo.trim(),
    actividades: body.actividades?.trim() ?? null, adecuaciones: body.adecuaciones?.trim() ?? null,
    objetivoIds: db.cursoOas.filter((c) => c.cursoId === body.cursoId && ids.includes(c.objetivoId)).map((c) => c.objetivoId),
  };
}
ruta('POST', 'planificaciones', ({ body }) => {
  const p: Plan = { id: nextId(), ...datosPlan(body) };
  db.planes.push(p);
  return { id: p.id };
});
ruta('PUT', 'planificaciones/:id', ({ body }, { id }) => {
  const p = db.planes.find((x) => x.id === id && cursoPropio(x.cursoId)) ?? fallar(404, 'No encontrado');
  Object.assign(p, datosPlan(body));
  return null;
});
ruta('DELETE', 'planificaciones/:id', (_r, { id }) => {
  if (!db.planes.some((p) => p.id === id)) fallar(404, 'No encontrado');
  db.planes = db.planes.filter((p) => p.id !== id);
  return null;
});

ruta('GET', 'dashboard', () => {
  const cursos = db.cursos.filter((c) => c.profesorId === db.profesor.id);
  const ids = new Set(cursos.map((c) => c.id));
  const ests = db.estudiantes.filter((e) => e.cursoId !== null && ids.has(e.cursoId));
  const dx = new Map<string, number>();
  for (const e of ests) if (e.diagnostico) dx.set(e.diagnostico, (dx.get(e.diagnostico) ?? 0) + 1);
  return {
    cursos: cursos.length,
    estudiantes: ests.length,
    oasAsignados: db.cursoOas.filter((c) => ids.has(c.cursoId)).length,
    planificaciones: db.planes.filter((p) => ids.has(p.cursoId)).length,
    oasCurriculum: db.oas.length,
    diagnosticos: [...dx].map(([diagnostico, total]) => ({ diagnostico, total })).sort((a, b) => b.total - a.total),
    resumenCursos: cursos
      .sort((a, b) => nivelDe(a.nivelId).orden - nivelDe(b.nivelId).orden || a.letra.localeCompare(b.letra))
      .map((c) => ({
        id: c.id, nombre: cursoNombre(c), anio: c.anio,
        estudiantes: db.estudiantes.filter((e) => e.cursoId === c.id).length,
        oas: db.cursoOas.filter((x) => x.cursoId === c.id).length,
        planificaciones: db.planes.filter((p) => p.cursoId === c.id).length,
      })),
  };
});

// ---------------- fetch interceptado ----------------

function resolver(method: string, path: string): [Handler, Record<string, number>] | null {
  const partes = path.split('/').filter(Boolean);
  for (const [m, pattern, h] of rutas) {
    if (m !== method) continue;
    const pp = pattern.split('/');
    if (pp.length !== partes.length) continue;
    const params: Record<string, number> = {};
    if (pp.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = Number(partes[i])), true) : seg === partes[i]))) return [h, params];
  }
  return null;
}

const json = (status: number, data: unknown) =>
  new Response(data === null || data === undefined ? null : JSON.stringify(data), {
    status: data === null || data === undefined ? 204 : status,
    headers: { 'content-type': 'application/json' },
  });

export function instalarMockApi() {
  db = cargar();
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return original(input, init);
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.pathname.slice('/api/'.length);
    const headers = new Headers(init?.headers);
    const text = typeof init?.body === 'string' ? init.body : '';
    await new Promise((r) => setTimeout(r, 60)); // latencia mínima para que la UI se comporte como con el API real

    const publico = path === 'health' || path === 'auth/login';
    if (!publico && headers.get('authorization') !== `Bearer ${TOKEN}`) return json(401, { title: 'Unauthorized', status: 401 });

    const match = resolver(method, path);
    if (!match) return json(404, { title: 'Not Found', status: 404, detail: `Ruta no disponible en la demo: ${method} /api/${path}` });
    try {
      let body: unknown = null;
      if (text && headers.get('content-type')?.includes('json')) body = JSON.parse(text);
      const resultado = match[0]({ method, path: path.split('/'), query: url.searchParams, body, text }, match[1]);
      if (method !== 'GET') guardar();
      return json(method === 'POST' && resultado && typeof resultado === 'object' && 'id' in resultado ? 201 : 200, resultado);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { title: 'Error', status: e.status, detail: e.message });
      return json(500, { title: 'Error', status: 500, detail: (e as Error).message });
    }
  };
}
