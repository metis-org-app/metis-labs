// Reglas de negocio de la API .NET (api/src/Domain) llevadas a TypeScript para la demo.
import type { Asignatura, Nivel, Objetivo, Pregunta, Respuesta, TipoPregunta } from './estado';

const redondear = (n: number, dec = 0) => {
  const f = 10 ** dec;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Math.Round de C# sin MidpointRounding: redondeo al par (66,5 → 66; 67,5 → 68). */
export function redondearPar(n: number, dec = 0) {
  const f = 10 ** dec;
  const x = n * f;
  const piso = Math.floor(x);
  const resto = x - piso;
  const r = Math.abs(resto - 0.5) < 1e-9 ? (piso % 2 === 0 ? piso : piso + 1) : Math.round(x);
  return r / f;
}

// --- Calificacion.cs ---

export const codigoOficial = (prefijo: string, nivelMineduc: string, numero: number) => `${prefijo}${nivelMineduc} OA ${String(numero).padStart(2, '0')}`;

/** Escala chilena 1,0 a 7,0 con exigencia (por defecto 60% para el 4,0). */
export function nota(puntaje: number, maximo: number, exigencia = 60) {
  if (maximo <= 0) return 1;
  const p = Math.min(Math.max(puntaje, 0), maximo);
  const corte = (maximo * exigencia) / 100;
  const n = p < corte ? 1 + (3 * p) / corte : 4 + (3 * (p - corte)) / (maximo - corte === 0 ? 1 : maximo - corte);
  return redondear(Math.min(Math.max(n, 1), 7), 1);
}

export const nivelLogro = (porcentaje: number) => (porcentaje >= 80 ? 'Logrado' : porcentaje >= 60 ? 'Medianamente logrado' : 'Por lograr');

/** Puntaje automático de una pregunta cerrada. Las abiertas quedan en null (revisión docente). */
export function corregir(p: Pregunta, r: Respuesta | undefined): number | null {
  if (p.tipo === 'Abierta') return r?.texto?.trim() ? null : 0;
  const sel = [...new Set(r?.seleccion ?? [])];
  if (sel.length === 0) return 0;
  if (p.tipo === 'Unica' || p.tipo === 'VerdaderoFalso') return sel.length === 1 && p.correctas.includes(sel[0]) ? p.puntaje : 0;
  const aciertos = sel.filter((s) => p.correctas.includes(s)).length;
  const neto = Math.max(0, aciertos - (sel.length - aciertos));
  return p.correctas.length === 0 ? 0 : redondearPar((p.puntaje * neto) / p.correctas.length, 2);
}

export function recalcular(
  intento: { respuestas: Respuesta[]; puntajeMaximo: number; revisionPendiente: boolean; puntajeObtenido: number | null; nota: number | null },
  preguntas: Pregunta[],
  exigencia: number,
) {
  intento.puntajeMaximo = preguntas.reduce((s, p) => s + p.puntaje, 0);
  intento.revisionPendiente = intento.respuestas.some((r) => r.puntaje === null);
  intento.puntajeObtenido = intento.respuestas.reduce((s, r) => s + (r.puntaje ?? 0), 0);
  intento.nota = intento.revisionPendiente ? null : nota(intento.puntajeObtenido, intento.puntajeMaximo, exigencia);
}

// --- Rut.cs ---

export function digitoVerificador(cuerpo: string) {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

export function normalizarRut(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  const limpio = input.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return null;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo) || cuerpo.length > 8) return null;
  return digitoVerificador(cuerpo) === dv ? `${cuerpo.replace(/^0+/, '')}-${dv}` : null;
}

// --- Dtos.cs ---

export type Catalogo = { asignaturas: Map<number, Asignatura>; niveles: Map<number, Nivel> };

export function codigoOa(o: Objetivo, c: Catalogo) {
  const a = c.asignaturas.get(o.asignaturaId)!;
  return codigoOficial(a.prefijo ?? a.codigo, c.niveles.get(o.nivelId)!.codigoMineduc, o.numero);
}

export function oaDto(o: Objetivo, c: Catalogo) {
  const a = c.asignaturas.get(o.asignaturaId)!;
  const n = c.niveles.get(o.nivelId)!;
  return {
    id: o.id, codigo: `OA${o.numero}`, codigoOficial: codigoOa(o, c), numero: o.numero, eje: o.eje, descripcion: o.descripcion,
    asignaturaId: o.asignaturaId, asignatura: a.nombre, asignaturaCodigo: a.codigo, asignaturaColor: a.color,
    nivelId: o.nivelId, nivel: n.nombre, nivelOrden: n.orden, fuente: o.fuente,
    cursos: null as { id: number; nombre: string; anio: number }[] | null,
  };
}

export const ciclo = (n: Nivel) => (n.orden <= 4 ? 'Primer ciclo básico' : n.orden <= 8 ? 'Segundo ciclo básico' : 'Enseñanza media');

// --- AsistenteMetis.cs: Metis con reglas pedagógicas (sin modelo de lenguaje) ---

export type ContextoMetis = {
  pregunta: Pregunta; objetivo: Objetivo | null; codigoOa: string | null; nivelMaximo: number; activo: boolean;
  instruccionesDocente: string | null; ayudasPrevias: number; lenguajeClaro: boolean; nombreEstudiante: string;
};

const sinTildes = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
const PIDE_RESPUESTA = ['respuesta', 'cual es', 'cuál es', 'dime', 'correcta', 'solucion', 'solución', 'resuelve', 'resuélvelo', 'cuál marco', 'cual marco', 'qué marco', 'que marco'];
const SALUDO = ['hola', 'buenas', 'buenos dias', 'buenos días', 'buenas tardes'];
const AGRADECE = ['gracias', 'listo', 'entendí', 'entendi', 'ya entendí', 'ok'];
const VACIAS = new Set(
  ('que qué cual cuál cuales cuáles como cómo para por con los las una uno unos unas del de la el en y o a se su sus es son esta este estos estas entre sobre ' +
    'siguientes siguiente alternativa alternativas explica describe indica marca escribe nombra lee texto afirmación pregunta ejemplo cuando donde dónde porque ' +
    'también más menos muy todos todas usamos usan usas tiene tienen tienes puede pueden puedes sirve sirven hacer hace hacen haces necesitan necesita esas esos ' +
    'otra otro nuestro nuestra tus tu mis correcta correctas').split(' '),
);

function palabrasClave(enunciado: string) {
  const vistas = new Set<string>();
  return (enunciado.match(/\p{L}+/gu) ?? [])
    .filter((w) => w.length > 3 && !VACIAS.has(w.toLowerCase()))
    .filter((w) => !vistas.has(w.toLowerCase()) && vistas.add(w.toLowerCase()))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
}

const minusculaInicial = (s: string) => (s ? s[0].toLocaleLowerCase('es-CL') + s.slice(1) : s);

function nivel1(c: ContextoMetis) {
  const claves = palabrasClave(c.pregunta.enunciado);
  const lista = claves.map((k) => `«${k}»`).join(', ');
  const frase = claves.length === 0 ? 'Fíjate bien en lo que te piden.' : claves.length === 1 ? `La palabra importante es ${lista}.` : `Las palabras importantes son ${lista}.`;
  const t: Record<TipoPregunta, string[]> = {
    Abierta: [frase, '¿Qué sabes ya sobre eso? Escribe una idea en una oración.', 'Después agrégale un ejemplo de tu vida diaria.'],
    VerdaderoFalso: [frase, 'Pregúntate: ¿esto se cumple siempre, o hay algún caso en que no?'],
    Multiple: [frase, 'Revisa cada alternativa por separado: ¿esta se relaciona con lo que te preguntan? Puede haber más de una correcta.'],
    Unica: [frase, 'Lee cada alternativa y pregúntate: ¿responde exactamente a lo que te piden?'],
  };
  return t[c.pregunta.tipo];
}

function nivel2(c: ContextoMetis) {
  const pasos: string[] = [];
  if (c.pregunta.pistaDocente?.trim()) pasos.push(`Pista de tu profesor: ${c.pregunta.pistaDocente.trim()}`);
  else if (c.objetivo) pasos.push(`Esta pregunta es del ${c.codigoOa}: ${minusculaInicial(c.objetivo.descripcion)}`);
  pasos.push(
    c.pregunta.tipo === 'Abierta'
      ? 'Piensa en qué ocurre, por qué ocurre y un ejemplo. Con esas tres partes tienes una buena respuesta.'
      : c.pregunta.tipo === 'VerdaderoFalso'
        ? 'Intenta pensar en un ejemplo concreto. Si encuentras un caso en que no se cumple, la afirmación es falsa.'
        : 'Descarta primero las alternativas que claramente no corresponden y compara las que quedan.',
  );
  return pasos;
}

function nivel3(c: ContextoMetis) {
  const pasos = nivel2(c).slice(0, 1);
  const p = c.pregunta;
  if (p.tipo === 'Unica' && p.opciones.length >= 3) {
    const incorrecta = p.opciones.map((_, i) => i).filter((i) => !p.correctas.includes(i)).at(-1)!;
    pasos.push(`Una ayuda más: la alternativa ${String.fromCharCode(65 + incorrecta)} (${p.opciones[incorrecta]}) no es la correcta. Compara las que quedan.`);
  } else if (p.tipo === 'Multiple') pasos.push(`Una ayuda más: en esta pregunta hay ${p.correctas.length} alternativas correctas.`);
  else if (p.tipo === 'Abierta') pasos.push('Puedes empezar así: «Esto ocurre porque…» y terminar con «Por ejemplo, …».');
  else pasos.push('Vuelve a leer la afirmación palabra por palabra. ¿Hay alguna palabra como «siempre», «solo» o «nunca» que la haga demasiado absoluta?');
  return pasos;
}

export function responderMetis(c: ContextoMetis, mensaje: string): { texto: string; nivel: number | null } {
  const m = sinTildes(mensaje);
  const nombre = c.nombreEstudiante.split(' ')[0];
  if (!c.activo || !c.pregunta.asistenteHabilitado)
    return { texto: 'En esta pregunta tu profesor pidió que trabajes sin ayuda. Lee con calma y confía en lo que sabes.', nivel: null };
  if (SALUDO.some((s) => m.startsWith(sinTildes(s))) && m.length < 25)
    return { texto: `¡Hola, ${nombre}! Estoy aquí para ayudarte a pensar, no para darte las respuestas. ¿Qué parte de la pregunta ${c.pregunta.orden} te cuesta?`, nivel: null };
  if (AGRADECE.some((s) => m.includes(sinTildes(s))) && m.length < 30)
    return { texto: '¡Bien! Cuando tengas tu respuesta, márcala o escríbela. Si vuelves a dudar, aquí estoy.', nivel: null };

  const pide = PIDE_RESPUESTA.some((p) => m.includes(sinTildes(p)));
  if (c.ayudasPrevias >= c.nivelMaximo && !pide)
    return { texto: 'Ya te di todas las pistas que tengo para esta pregunta. Vuelve a leerlas con calma y elige tu respuesta: equivocarse también es parte de aprender.', nivel: null };
  const nivel = Math.min(c.nivelMaximo, 1 + c.ayudasPrevias);
  let texto = pide ? 'No puedo decirte la respuesta, pero sí ayudarte a encontrarla. ' : '';
  const pasos = nivel === 1 ? nivel1(c) : nivel === 2 ? nivel2(c) : nivel3(c);
  texto += c.lenguajeClaro ? `Vamos paso a paso:${pasos.map((p, i) => `\n${i + 1}. ${p}`).join('')}` : pasos.join(' ');
  if (nivel < c.nivelMaximo) texto += c.lenguajeClaro ? '\nSi necesitas más ayuda, escríbeme otra vez.' : ' Si aún tienes dudas, pídeme otra pista.';
  return { texto, nivel };
}
