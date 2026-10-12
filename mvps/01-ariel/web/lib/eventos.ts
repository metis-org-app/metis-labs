/** Avisa a la barra lateral que la lista de cursos cambió. */
export const avisarCursos = () => window.dispatchEvent(new Event('metis:cursos'));
