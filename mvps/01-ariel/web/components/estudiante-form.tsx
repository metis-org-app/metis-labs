'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { rutValido } from '@/lib/rut';
import type { Curso, Estudiante, TipoPie } from '@/lib/types';
import { ErrorBox, Modal } from './ui';

export const DIAGNOSTICOS = [
  ['TEA', 'TEA · Trastorno del espectro autista'],
  ['TDA-H', 'TDA-H · Déficit atencional'],
  ['TL', 'TL · Trastorno del lenguaje'],
  ['DI', 'DI · Discapacidad intelectual'],
  ['FIL', 'FIL · Funcionamiento intelectual limítrofe'],
  ['DEA', 'DEA · Dificultad específica del aprendizaje'],
  ['Otro', 'Otro'],
];

type Form = {
  rut: string; nombre: string; apellido: string; fechaNacimiento: string; cursoId: string;
  diagnostico: string; nivelTea: string; tipoPie: TipoPie; apoyos: string;
  nombreApoderado: string; telefonoApoderado: string; emailApoderado: string; observaciones: string;
};

const desde = (e: Partial<Estudiante> | null, cursoId?: number): Form => ({
  rut: e?.rut ?? '', nombre: e?.nombre ?? '', apellido: e?.apellido ?? '', fechaNacimiento: e?.fechaNacimiento ?? '',
  cursoId: e?.cursoId ? String(e.cursoId) : cursoId ? String(cursoId) : '', diagnostico: e?.diagnostico ?? '',
  nivelTea: e?.nivelTea ? String(e.nivelTea) : '', tipoPie: e?.tipoPie ?? 'Ninguno', apoyos: e?.apoyos ?? '',
  nombreApoderado: e?.nombreApoderado ?? '', telefonoApoderado: e?.telefonoApoderado ?? '', emailApoderado: e?.emailApoderado ?? '',
  observaciones: e?.observaciones ?? '',
});

/** Crear o editar un estudiante. */
export function EstudianteForm({ estudiante, cursoId, onClose, onSaved }: { estudiante: Estudiante | null; cursoId?: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(desde(estudiante, cursoId));
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api<Curso[]>('/cursos').then(setCursos).catch(() => undefined);
  }, []);

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!rutValido(form.rut)) return setError('RUT inválido: revisa el dígito verificador.');
    const body = {
      ...form,
      fechaNacimiento: form.fechaNacimiento || null,
      cursoId: form.cursoId ? Number(form.cursoId) : null,
      diagnostico: form.diagnostico || null,
      nivelTea: form.diagnostico === 'TEA' && form.nivelTea ? Number(form.nivelTea) : null,
    };
    setGuardando(true);
    try {
      if (estudiante) await api(`/estudiantes/${estudiante.id}`, { method: 'PUT', json: body });
      else await api('/estudiantes', { method: 'POST', json: body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal title={estudiante ? `Editar a ${estudiante.nombre} ${estudiante.apellido}` : 'Nuevo estudiante'} onClose={onClose} wide>
      <form onSubmit={guardar} className="form-sections">
        <fieldset>
          <legend>Datos personales</legend>
          <div className="form-grid form-2">
            <label>
              RUT *
              <input value={form.rut} onChange={(e) => set('rut', e.target.value)} placeholder="12.345.678-5" required autoFocus />
            </label>
            <label>
              Curso
              <select value={form.cursoId} onChange={(e) => set('cursoId', e.target.value)}>
                <option value="">Sin curso</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.anio})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nombres *
              <input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} required />
            </label>
            <label>
              Apellidos *
              <input value={form.apellido} onChange={(e) => set('apellido', e.target.value)} required />
            </label>
            <label>
              Fecha de nacimiento
              <input type="date" value={form.fechaNacimiento} onChange={(e) => set('fechaNacimiento', e.target.value)} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Necesidades educativas y apoyos</legend>
          <div className="form-grid form-3">
            <label>
              Programa de Integración (PIE)
              <select value={form.tipoPie} onChange={(e) => set('tipoPie', e.target.value as TipoPie)}>
                <option value="Ninguno">No participa</option>
                <option value="Permanente">Permanente (NEE permanente)</option>
                <option value="Transitorio">Transitorio (NEE transitoria)</option>
              </select>
            </label>
            <label>
              Diagnóstico
              <select value={form.diagnostico} onChange={(e) => set('diagnostico', e.target.value)}>
                <option value="">Sin diagnóstico</option>
                {DIAGNOSTICOS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nivel de apoyo TEA
              <select value={form.nivelTea} onChange={(e) => set('nivelTea', e.target.value)} disabled={form.diagnostico !== 'TEA'}>
                <option value="">—</option>
                <option value="1">Nivel 1 · Necesita apoyo</option>
                <option value="2">Nivel 2 · Apoyo sustancial</option>
                <option value="3">Nivel 3 · Apoyo muy sustancial</option>
              </select>
            </label>
            <label className="span-3">
              Apoyos y adecuaciones que necesita
              <textarea rows={2} value={form.apoyos} onChange={(e) => set('apoyos', e.target.value)} placeholder="Ej: anticipar cambios con agenda visual, instrucciones cortas, tiempo extra en evaluaciones." />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Apoderado</legend>
          <div className="form-grid form-3">
            <label>
              Nombre
              <input value={form.nombreApoderado} onChange={(e) => set('nombreApoderado', e.target.value)} />
            </label>
            <label>
              Teléfono
              <input value={form.telefonoApoderado} onChange={(e) => set('telefonoApoderado', e.target.value)} placeholder="+56 9 …" />
            </label>
            <label>
              Email
              <input type="email" value={form.emailApoderado} onChange={(e) => set('emailApoderado', e.target.value)} />
            </label>
            <label className="span-3">
              Observaciones
              <textarea rows={2} value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} />
            </label>
          </div>
        </fieldset>
        <ErrorBox error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={guardando}>
            {estudiante ? 'Guardar cambios' : 'Agregar estudiante'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
