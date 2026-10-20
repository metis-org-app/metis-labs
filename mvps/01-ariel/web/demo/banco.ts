// "Generar con IA" en la demo: no hay modelo de lenguaje, así que se arma el esquema con preguntas escritas de antemano
// para los OA del curso de ejemplo (1° Básico A). Para otros OA se usa el mismo esquema de ejemplo de la API (GeneradorEvaluaciones.Ejemplo).
import type { TipoPregunta } from './estado';

type PreguntaBanco = { tipo: TipoPregunta; enunciado: string; opciones?: string[]; correctas?: number[]; puntaje?: number; pista: string; justificacion: string };

const VF = ['Verdadero', 'Falso'];

export const BANCO: Record<string, PreguntaBanco[]> = {
  'CN01 OA 01': [
    { tipo: 'Unica', enunciado: '¿Cuál de estos es un ser vivo?', opciones: ['Una piedra', 'Un árbol', 'Una pelota', 'Una mesa'], correctas: [1], pista: 'Piensa: ¿cuál de ellos crece y necesita agua?', justificacion: 'El árbol nace, crece, se reproduce y necesita agua, aire y luz. Los demás son objetos inertes.' },
    { tipo: 'Multiple', enunciado: '¿Qué necesitan los seres vivos para vivir? Marca todas las correctas.', opciones: ['Agua', 'Alimento', 'Aire', 'Juguetes'], correctas: [0, 1, 2], pista: 'Recuerda lo que necesita una planta del patio para no secarse.', justificacion: 'Todos los seres vivos necesitan agua, alimento y aire. Los juguetes no son una necesidad vital.' },
    { tipo: 'VerdaderoFalso', enunciado: 'Una semilla puede crecer y convertirse en una planta.', opciones: VF, correctas: [0], pista: '¿Qué pasa cuando siembras un poroto en un algodón húmedo?', justificacion: 'Verdadero: la semilla contiene una planta pequeña que germina y crece.' },
  ],
  'CN01 OA 02': [
    { tipo: 'Unica', enunciado: '¿Qué cubre el cuerpo de un pájaro?', opciones: ['Escamas', 'Pelos', 'Plumas', 'Piel desnuda'], correctas: [2], pista: 'Piensa en lo que ves cuando un pájaro abre sus alas.', justificacion: 'Las aves tienen el cuerpo cubierto de plumas.' },
    { tipo: 'Unica', enunciado: '¿Cómo se desplaza un pez?', opciones: ['Vuela', 'Nada', 'Salta', 'Repta'], correctas: [1], pista: '¿Dónde vive un pez?', justificacion: 'Los peces viven en el agua y se desplazan nadando con sus aletas.' },
    { tipo: 'Abierta', enunciado: 'Elige un animal del patio del colegio y describe cómo es su cubierta corporal y cómo se mueve.', puntaje: 2, pista: 'Puedes pensar en un perro, una hormiga o un chincol.', justificacion: 'Pauta: nombra un animal, describe su cubierta (pelos, plumas, escamas o caparazón) y su forma de desplazarse.' },
  ],
  'CN01 OA 03': [
    { tipo: 'Unica', enunciado: '¿Qué parte de la planta absorbe el agua del suelo?', opciones: ['La flor', 'La hoja', 'La raíz', 'El fruto'], correctas: [2], pista: 'Es la parte que está bajo la tierra.', justificacion: 'La raíz fija la planta al suelo y absorbe el agua y los nutrientes.' },
    { tipo: 'VerdaderoFalso', enunciado: 'El tallo sostiene a la planta y lleva el agua hasta las hojas.', opciones: VF, correctas: [0], pista: 'Piensa en el tronco de un árbol.', justificacion: 'Verdadero: el tallo sostiene la planta y transporta el agua desde la raíz.' },
  ],
  'CN01 OA 04': [
    { tipo: 'Multiple', enunciado: '¿Cuáles de estos son frutos? Marca todas las correctas.', opciones: ['Manzana', 'Tomate', 'Lechuga', 'Palta'], correctas: [0, 1, 3], pista: 'Los frutos guardan semillas en su interior.', justificacion: 'La manzana, el tomate y la palta tienen semillas: son frutos. La lechuga es una hoja.' },
    { tipo: 'Abierta', enunciado: 'Observa dos semillas distintas y escribe en qué se parecen y en qué se diferencian (tamaño, forma, color o textura).', puntaje: 2, pista: 'Compara, por ejemplo, un poroto y una semilla de girasol.', justificacion: 'Pauta: menciona al menos una semejanza y una diferencia usando criterios observables.' },
  ],
  'CN01 OA 05': [
    { tipo: 'Unica', enunciado: '¿Cuál de estos animales es nativo de Chile?', opciones: ['El pudú', 'El león', 'La jirafa', 'El canguro'], correctas: [0], pista: 'Es un ciervo muy pequeño que vive en los bosques del sur.', justificacion: 'El pudú es un ciervo nativo de los bosques templados de Chile.' },
    { tipo: 'VerdaderoFalso', enunciado: 'El copihue es una flor nativa de Chile.', opciones: VF, correctas: [0], pista: 'Es la flor nacional de Chile.', justificacion: 'Verdadero: el copihue es una planta nativa y flor nacional.' },
  ],
  'CN01 OA 06': [
    { tipo: 'Unica', enunciado: '¿Con qué sentido sentimos si algo está frío o caliente?', opciones: ['La vista', 'El oído', 'El tacto', 'El olfato'], correctas: [2], pista: '¿Qué parte del cuerpo usas para tocar?', justificacion: 'El tacto, a través de la piel, nos permite sentir la temperatura.' },
    { tipo: 'Abierta', enunciado: 'Escribe una forma de cuidar tus oídos y explica por qué es importante.', puntaje: 2, pista: 'Piensa en la música muy fuerte.', justificacion: 'Pauta: propone una medida (no escuchar música muy fuerte, no meter objetos) y explica que protege la audición.' },
  ],
  'CN01 OA 07': [
    { tipo: 'Multiple', enunciado: '¿Cuáles son hábitos de vida saludable? Marca todas las correctas.', opciones: ['Lavarse las manos antes de comer', 'Dormir pocas horas', 'Comer frutas y verduras', 'Hacer actividad física'], correctas: [0, 2, 3], pista: 'Piensa en lo que te ayuda a crecer sano y con energía.', justificacion: 'Lavarse las manos, comer frutas y verduras y moverse son hábitos saludables. Dormir poco no lo es.' },
    { tipo: 'VerdaderoFalso', enunciado: 'Lavarse las manos ayuda a prevenir enfermedades.', opciones: VF, correctas: [0], pista: '¿Qué le pasa a los gérmenes con el agua y el jabón?', justificacion: 'Verdadero: el lavado de manos elimina gérmenes que causan enfermedades.' },
  ],
  'CN01 OA 08': [
    { tipo: 'Unica', enunciado: '¿De qué material está hecha normalmente una ventana?', opciones: ['Madera', 'Vidrio', 'Lana', 'Papel'], correctas: [1], pista: 'Es un material que deja pasar la luz.', justificacion: 'El vidrio es transparente y deja pasar la luz, por eso se usa en ventanas.' },
  ],
  'CN01 OA 11': [
    { tipo: 'VerdaderoFalso', enunciado: 'El Sol se ve en el cielo durante la noche.', opciones: VF, correctas: [1], pista: 'Piensa qué ves en el cielo cuando te vas a dormir.', justificacion: 'Falso: de noche vemos la Luna y las estrellas; el Sol se ve de día.' },
  ],
  'CN01 OA 12': [
    { tipo: 'Unica', enunciado: '¿En qué estación del año los árboles pierden sus hojas?', opciones: ['Verano', 'Otoño', 'Primavera', 'Ninguna'], correctas: [1], pista: 'Es la estación en que las hojas se ponen amarillas y cafés.', justificacion: 'En otoño muchos árboles pierden sus hojas.' },
  ],
  'MA01 OA 01': [
    { tipo: 'Unica', enunciado: 'Si cuentas de 10 en 10: 10, 20, 30, … ¿qué número sigue?', opciones: ['31', '35', '40', '50'], correctas: [2], pista: 'Suma 10 al último número.', justificacion: '30 + 10 = 40.' },
  ],
  'MA01 OA 03': [
    { tipo: 'Unica', enunciado: '¿Qué número es «quince»?', opciones: ['5', '15', '50', '51'], correctas: [1], pista: 'Quince tiene una decena y cinco unidades.', justificacion: 'Quince se escribe 15: una decena y cinco unidades.' },
  ],
  'MA01 OA 04': [
    { tipo: 'Unica', enunciado: '¿Cuál es el número mayor?', opciones: ['12', '19', '9', '15'], correctas: [1], pista: 'Compara primero las decenas y luego las unidades.', justificacion: '19 es el mayor: tiene una decena y nueve unidades.' },
  ],
  'MA01 OA 06': [
    { tipo: 'Multiple', enunciado: '¿Qué sumas dan 10? Marca todas las correctas.', opciones: ['5 + 5', '6 + 3', '7 + 3', '8 + 1'], correctas: [0, 2], pista: 'Usa tus dedos para comprobar cada suma.', justificacion: '5 + 5 = 10 y 7 + 3 = 10. Las otras suman 9.' },
  ],
  'MA01 OA 09': [
    { tipo: 'Abierta', enunciado: 'Tenías 8 lápices y te regalaron 5 más. ¿Cuántos tienes ahora? Explica cómo lo calculaste.', puntaje: 2, pista: 'Puedes dibujar los lápices o contar hacia adelante desde 8.', justificacion: 'Pauta: responde 13 y explica una estrategia (contar hacia adelante, completar 10, dibujar).' },
  ],
  'MA01 OA 11': [
    { tipo: 'Unica', enunciado: 'Continúa el patrón: 2, 4, 6, 8, …', opciones: ['9', '10', '12', '7'], correctas: [1], pista: '¿Cuánto aumenta cada número?', justificacion: 'El patrón suma 2 cada vez: 8 + 2 = 10.' },
  ],
  'MA01 OA 14': [
    { tipo: 'Unica', enunciado: '¿Qué objeto tiene forma de esfera?', opciones: ['Una pelota', 'Un dado', 'Una caja de zapatos', 'Un lápiz'], correctas: [0], pista: 'Es redondo por todos lados.', justificacion: 'La pelota tiene forma de esfera.' },
  ],
};
