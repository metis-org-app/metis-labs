import { PageHead } from '@/components/ui';

export default function EvaluacionesPage() {
  return (
    <>
      <PageHead icon="📝" title="Evaluaciones" subtitle="Con Evalia · próximamente" />
      <div className="card">
        <h2>Evaluaciones con Evalia</h2>
        <p className="muted">
          Las evaluaciones se crean por curso a partir de sus OA y materiales, y se comparten con los estudiantes por link. Evalia va
          integrada dentro de cada evaluación: mientras el estudiante responde, el asistente lo guía con preguntas y pistas, sin darle la
          respuesta.
        </p>
        <ul className="list">
          <li>El docente configura el asistente con rúbricas e instrucciones, y puede activarlo o desactivarlo por pregunta.</li>
          <li>Las conversaciones quedan registradas y el docente ve cómo razonó cada estudiante, no solo su respuesta.</li>
          <li>Se respetan las adecuaciones del curso: un estudiante excluido de un OA no recibe preguntas de ese OA.</li>
        </ul>
        <h2 style={{ marginTop: 24 }}>Cómo se conecta con esta demo</h2>
        <p className="muted">
          Los cursos, OA, exclusiones y planificaciones que se gestionan aquí son la base desde la que se arman las evaluaciones y el
          contexto que recibirá Evalia.
        </p>
      </div>
    </>
  );
}
