'use client';

import type { CursoDetalle } from '@/lib/types';
import { MaterialesExplorador } from '../materiales';

export function MaterialesCurso({ curso }: { curso: CursoDetalle }) {
  return <MaterialesExplorador curso={{ id: curso.id, nivelId: curso.nivelId }} />;
}
