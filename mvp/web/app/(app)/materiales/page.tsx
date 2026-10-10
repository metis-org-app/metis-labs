'use client';

import { MaterialesExplorador } from '@/components/materiales';
import { PageHead } from '@/components/ui';

export default function MaterialesPage() {
  return (
    <>
      <PageHead
        title="Materiales"
        subtitle="Guías, fichas, lecturas y presentaciones vinculadas a los OA. Los de la biblioteca compartida aparecen en todos tus cursos del nivel."
      />
      <MaterialesExplorador />
    </>
  );
}
