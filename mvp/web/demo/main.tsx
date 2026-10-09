// Punto de entrada de la versión artifact: mismas pantallas de app/, API simulado en el navegador.
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { instalarMockApi } from './mock-api';
import { navegar, useEstado } from './shims/router';
import { getToken } from '@/lib/api';
import AppLayout from '@/app/(app)/layout';
import DashboardPage from '@/app/(app)/page';
import CursosPage from '@/app/(app)/cursos/page';
import EstudiantesPage from '@/app/(app)/estudiantes/page';
import CurriculumPage from '@/app/(app)/curriculum/page';
import PlanificacionPage from '@/app/(app)/planificacion/page';
import MaterialesPage from '@/app/(app)/materiales/page';
import NotasPage from '@/app/(app)/notas/page';
import EvaluacionesPage from '@/app/(app)/evaluaciones/page';
import LoginPage from '@/app/login/page';

instalarMockApi();

const PAGINAS: Record<string, ComponentType> = {
  '/': DashboardPage,
  '/cursos': CursosPage,
  '/estudiantes': EstudiantesPage,
  '/curriculum': CurriculumPage,
  '/planificacion': PlanificacionPage,
  '/materiales': MaterialesPage,
  '/notas': NotasPage,
  '/evaluaciones': EvaluacionesPage,
};

function App() {
  const { pathname } = useEstado();
  if (pathname === '/login') return <LoginPage />;
  const Pagina = PAGINAS[pathname] ?? DashboardPage;
  return (
    <AppLayout>
      <Pagina />
    </AppLayout>
  );
}

navegar(getToken() ? '/' : '/login');
createRoot(document.getElementById('root')!).render(<App />);
