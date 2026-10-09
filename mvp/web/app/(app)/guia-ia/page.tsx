import { PageHead } from '@/components/ui';

export default function GuiaIaPage() {
  return (
    <>
      <PageHead icon="✨" title="Guía IA para estudiantes" subtitle="El núcleo de Metis · en diseño" />
      <div className="card">
        <h2>Qué hará</h2>
        <ul className="list">
          <li>Acompañar a cada estudiante en los OA asignados a su curso, guiando sin entregar la respuesta.</li>
          <li>Respetar las adecuaciones: si un estudiante está excluido de un OA, la guía no lo trabaja con él.</li>
          <li>Adaptar el estilo según el perfil (por ejemplo, instrucciones cortas y anticipación para estudiantes TEA).</li>
          <li>Dejar cada conversación visible para el profesor, junto al avance por OA.</li>
        </ul>
        <h2 style={{ marginTop: 24 }}>Cómo se conecta con esta demo</h2>
        <p className="muted">
          Los cursos, OA, exclusiones y planificaciones que se gestionan aquí son el contexto que recibirá el agente (vía metis-mcp en la
          arquitectura propuesta). Esta demo construye esa base.
        </p>
      </div>
    </>
  );
}
