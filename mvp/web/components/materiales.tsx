'use client';

import { CSSProperties, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { TIPO_MATERIAL } from '@/lib/format';
import type { Asignatura, Curso, Material, Nivel, Oa, TipoMaterial } from '@/lib/types';
import { confirmar } from './confirm';
import { Contenido, ErrorBox, Modal, OaTag } from './ui';

export function MaterialCard({ m, onOpen }: { m: Material; onOpen: () => void }) {
  return (
    <button className="material-card" onClick={onOpen} style={{ '--c': m.asignaturaColor } as CSSProperties}>
      <div className="material-top">
        <span className={`mtipo mtipo-${m.tipo.toLowerCase()}`}>{TIPO_MATERIAL[m.tipo]}</span>
        {m.lecturaFacil && <span className="chip chip-lf">Lectura fácil</span>}
        {m.url && <span className="chip">Enlace</span>}
      </div>
      <h4>{m.titulo}</h4>
      <p className="muted small">{m.descripcion}</p>
      <div className="material-meta">
        <span>
          {m.nivel} · {m.asignatura}
        </span>
        <span>{m.curso ? `Solo ${m.curso}` : 'Biblioteca compartida'}</span>
      </div>
      {m.objetivos.length > 0 && (
        <div className="oa-tags">
          {m.objetivos.map((o) => (
            <OaTag key={o.id} oa={o} compacto />
          ))}
        </div>
      )}
    </button>
  );
}

export function MaterialViewer({ id, onClose, onEdit, onDeleted }: { id: number; onClose: () => void; onEdit: (m: Material) => void; onDeleted: () => void }) {
  const [m, setM] = useState<Material | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Material>(`/materiales/${id}`).then(setM).catch((e) => setError(e.message));
  }, [id]);

  const eliminar = async () => {
    if (!m || !(await confirmar(`¿Eliminar el material “${m.titulo}”?`))) return;
    await api(`/materiales/${m.id}`, { method: 'DELETE' });
    onDeleted();
  };

  return (
    <Modal title={m?.titulo ?? 'Material'} onClose={onClose} wide>
      <ErrorBox error={error} />
      {m && (
        <>
          <div className="material-top">
            <span className={`mtipo mtipo-${m.tipo.toLowerCase()}`}>{TIPO_MATERIAL[m.tipo]}</span>
            {m.lecturaFacil && <span className="chip chip-lf">Lectura fácil</span>}
            <span className="muted small">
              {m.nivel} · {m.asignatura} · {m.curso ? `Solo ${m.curso}` : 'Biblioteca compartida'}
            </span>
          </div>
          {m.objetivos.length > 0 && (
            <div className="oa-lista">
              {m.objetivos.map((o) => (
                <div key={o.id} className="oa-linea">
                  <OaTag oa={o} />
                  <span className="small">{o.descripcion}</span>
                </div>
              ))}
            </div>
          )}
          {m.url && (
            <p>
              Enlace:{' '}
              <a href={m.url} target="_blank" rel="noreferrer">
                {m.url}
              </a>
            </p>
          )}
          <div className={`material-body ${m.lecturaFacil ? 'lectura-facil' : ''}`}>{m.contenido && <Contenido texto={m.contenido} />}</div>
          <div className="modal-actions">
            <button className="btn btn-danger-ghost" onClick={eliminar}>
              Eliminar
            </button>
            <button className="btn btn-primary" onClick={() => onEdit(m)}>
              Editar
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

type Form = {
  titulo: string; tipo: TipoMaterial; asignaturaId: number; nivelId: number; cursoId: string;
  descripcion: string; contenido: string; url: string; lecturaFacil: boolean; objetivoIds: number[];
};

export function MaterialForm({ material, curso, onClose, onSaved }: { material: Material | null; curso?: { id: number; nivelId: number }; onClose: () => void; onSaved: () => void }) {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [oas, setOas] = useState<Oa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    titulo: material?.titulo ?? '', tipo: material?.tipo ?? 'Guia', asignaturaId: material?.asignaturaId ?? 0,
    nivelId: material?.nivelId ?? curso?.nivelId ?? 0, cursoId: material?.cursoId ? String(material.cursoId) : curso ? String(curso.id) : '',
    descripcion: material?.descripcion ?? '', contenido: material?.contenido ?? '', url: material?.url ?? '',
    lecturaFacil: material?.lecturaFacil ?? false, objetivoIds: material?.objetivos.map((o) => o.id) ?? [],
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api<Asignatura[]>('/asignaturas').then((a) => {
      setAsignaturas(a);
      setForm((f) => (f.asignaturaId ? f : { ...f, asignaturaId: a[0]?.id ?? 0 }));
    });
    api<Nivel[]>('/niveles').then((n) => {
      setNiveles(n);
      setForm((f) => (f.nivelId ? f : { ...f, nivelId: n[0]?.id ?? 0 }));
    });
    api<Curso[]>('/cursos').then(setCursos).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!form.asignaturaId || !form.nivelId) return;
    api<Oa[]>(`/oas?asignaturaId=${form.asignaturaId}&nivelId=${form.nivelId}`).then(setOas).catch(() => setOas([]));
  }, [form.asignaturaId, form.nivelId]);

  const guardar = async () => {
    setError(null);
    const body = { ...form, cursoId: form.cursoId ? Number(form.cursoId) : null, objetivoIds: form.objetivoIds.filter((id) => oas.some((o) => o.id === id)) };
    try {
      if (material) await api(`/materiales/${material.id}`, { method: 'PUT', json: body });
      else await api('/materiales', { method: 'POST', json: body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleOa = (id: number) => set('objetivoIds', form.objetivoIds.includes(id) ? form.objetivoIds.filter((x) => x !== id) : [...form.objetivoIds, id]);

  return (
    <Modal title={material ? 'Editar material' : 'Nuevo material'} onClose={onClose} wide>
      <div className="form-grid form-3">
        <label className="span-2">
          Título *
          <input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} autoFocus />
        </label>
        <label>
          Tipo
          <select value={form.tipo} onChange={(e) => set('tipo', e.target.value as TipoMaterial)}>
            {Object.entries(TIPO_MATERIAL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Asignatura
          <select value={form.asignaturaId} onChange={(e) => set('asignaturaId', Number(e.target.value))}>
            {asignaturas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nivel
          <select value={form.nivelId} onChange={(e) => set('nivelId', Number(e.target.value))}>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Disponible para
          <select value={form.cursoId} onChange={(e) => set('cursoId', e.target.value)}>
            <option value="">Biblioteca compartida (todos mis cursos)</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                Solo {c.nombre} ({c.anio})
              </option>
            ))}
          </select>
        </label>
        <label className="span-3">
          Descripción breve
          <input value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Para qué sirve y cómo usarlo en clases" />
        </label>
        <label className="span-3">
          Contenido
          <textarea rows={8} className="mono" value={form.contenido} onChange={(e) => set('contenido', e.target.value)} placeholder={'# Título\n\nTexto del material.\n\n## Actividad\n- Paso 1\n- Paso 2'} />
          <span className="hint-inline">Usa # para títulos, ## para subtítulos y - para listas.</span>
        </label>
        <label className="span-2">
          Enlace (opcional)
          <input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.lecturaFacil} onChange={(e) => set('lecturaFacil', e.target.checked)} />
          Adaptado a lectura fácil
        </label>
      </div>
      <h4>OA que trabaja</h4>
      <div className="check-list compact">
        {oas.length === 0 && <p className="muted small">No hay OA cargados para esa asignatura y nivel.</p>}
        {oas.map((o) => (
          <label key={o.id} className="check-item">
            <input type="checkbox" checked={form.objetivoIds.includes(o.id)} onChange={() => toggleOa(o.id)} />
            <span>
              <OaTag oa={o} compacto /> <span className="small">{o.descripcion}</span>
            </span>
          </label>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={guardar} disabled={!form.titulo.trim()}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}

/** Lista con filtros, visor y formulario. Se usa en la biblioteca y dentro de cada curso. */
export function MaterialesExplorador({ curso }: { curso?: { id: number; nivelId: number } }) {
  const [lista, setLista] = useState<Material[] | null>(null);
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [filtro, setFiltro] = useState({ asignaturaId: '', nivelId: '', tipo: '', q: '' });
  const [abierto, setAbierto] = useState<number | null>(null);
  const [editando, setEditando] = useState<Material | null | 'nuevo'>(null);

  const cargar = () => {
    const qs = new URLSearchParams();
    if (curso) qs.set('cursoId', String(curso.id));
    Object.entries(filtro).forEach(([k, v]) => v && qs.set(k, v));
    api<Material[]>(`/materiales?${qs}`).then(setLista).catch(() => setLista([]));
  };
  useEffect(() => {
    api<Asignatura[]>('/asignaturas').then(setAsignaturas);
    api<Nivel[]>('/niveles').then(setNiveles);
  }, []);
  useEffect(() => {
    const t = setTimeout(cargar, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, curso?.id]);

  return (
    <>
      <div className="toolbar">
        <select value={filtro.asignaturaId} onChange={(e) => setFiltro({ ...filtro, asignaturaId: e.target.value })} aria-label="Asignatura">
          <option value="">Todas las asignaturas</option>
          {asignaturas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        {!curso && (
          <select value={filtro.nivelId} onChange={(e) => setFiltro({ ...filtro, nivelId: e.target.value })} aria-label="Nivel">
            <option value="">Todos los niveles</option>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        )}
        <select value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_MATERIAL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input placeholder="Buscar por título…" value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} />
        <button className="btn btn-primary" onClick={() => setEditando('nuevo')}>
          + Nuevo material
        </button>
      </div>
      {curso && <p className="muted small">Se muestran los materiales de este curso y los de la biblioteca que sirven a su nivel u OA.</p>}
      {lista?.length === 0 && <div className="empty">No hay materiales con esos filtros.</div>}
      <div className="material-grid">
        {lista?.map((m) => (
          <MaterialCard key={m.id} m={m} onOpen={() => setAbierto(m.id)} />
        ))}
      </div>
      {abierto && (
        <MaterialViewer
          id={abierto}
          onClose={() => setAbierto(null)}
          onEdit={(m) => {
            setAbierto(null);
            setEditando(m);
          }}
          onDeleted={() => {
            setAbierto(null);
            cargar();
          }}
        />
      )}
      {editando && (
        <MaterialForm
          material={editando === 'nuevo' ? null : editando}
          curso={curso}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </>
  );
}
