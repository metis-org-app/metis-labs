'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { confirmar } from '@/components/confirm';
import type { Asignatura, Curso, Nivel, Oa } from '@/lib/types';
import { Empty, ErrorBox, Modal, PageHead } from '@/components/ui';

type OaForm = { id?: number; asignaturaId: number; nivelId: number; numero: number; eje: string; descripcion: string };

export default function CurriculumPage() {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [asignaturaId, setAsignaturaId] = useState('');
  const [nivelId, setNivelId] = useState('');
  const [q, setQ] = useState('');
  const [oas, setOas] = useState<Oa[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [cursoDestino, setCursoDestino] = useState('');
  const [editar, setEditar] = useState<OaForm | null>(null);
  const [importar, setImportar] = useState(false);

  useEffect(() => {
    api<Asignatura[]>('/asignaturas').then(setAsignaturas).catch(() => undefined);
    api<Nivel[]>('/niveles').then(setNiveles).catch(() => undefined);
    api<Curso[]>('/cursos').then(setCursos).catch(() => undefined);
  }, []);

  const cargar = useCallback(() => {
    const qs = new URLSearchParams();
    if (asignaturaId) qs.set('asignaturaId', asignaturaId);
    if (nivelId) qs.set('nivelId', nivelId);
    if (q.trim()) qs.set('q', q.trim());
    return api<Oa[]>(`/oas?${qs}`).then(setOas).catch((e) => setError(e.message));
  }, [asignaturaId, nivelId, q]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const porNivel = useMemo(() => {
    const m = new Map<string, Oa[]>();
    for (const oa of oas) m.set(oa.nivel, [...(m.get(oa.nivel) ?? []), oa]);
    return [...m.entries()];
  }, [oas]);

  const toggle = (id: number) =>
    setMarcados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const asignar = async () => {
    setError(null);
    try {
      const r = await api<{ asignados: number; yaExistian: number }>(`/cursos/${cursoDestino}/oas`, {
        method: 'POST',
        json: { objetivoIds: [...marcados] },
      });
      const curso = cursos.find((c) => String(c.id) === cursoDestino);
      setMensaje(`${r.asignados} OA asignados a ${curso?.nombre}${r.yaExistian ? ` (${r.yaExistian} ya estaban)` : ''}.`);
      setMarcados(new Set());
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const eliminar = async (oa: Oa) => {
    if (!(await confirmar(`¿Eliminar ${oa.codigo} de ${oa.asignatura} ${oa.nivel} del currículum?`))) return;
    try {
      await api(`/oas/${oa.id}`, { method: 'DELETE' });
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const nuevoOa = () =>
    setEditar({
      asignaturaId: Number(asignaturaId) || asignaturas[0]?.id || 1,
      nivelId: Number(nivelId) || niveles[0]?.id || 1,
      numero: 1,
      eje: '',
      descripcion: '',
    });

  return (
    <>
      <PageHead
        icon="📚"
        title="Objetivos de Aprendizaje · Currículum Nacional"
        subtitle="Mantenedor de OA por asignatura y nivel (Bases Curriculares MINEDUC)"
        action={
          <div className="head-actions">
            <button className="btn btn-ghost" onClick={() => setImportar(true)}>
              Importar CSV
            </button>
            <button className="btn btn-primary" onClick={nuevoOa}>
              + Nuevo OA
            </button>
          </div>
        }
      />

      <div className="card">
        <div className="form-grid form-3">
          <label>
            Asignatura
            <select value={asignaturaId} onChange={(e) => setAsignaturaId(e.target.value)}>
              <option value="">Todas las asignaturas</option>
              {asignaturas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nivel
            <select value={nivelId} onChange={(e) => setNivelId(e.target.value)}>
              <option value="">Todos los niveles</option>
              {niveles.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Buscar
            <input placeholder="Código (OA3) o descripción…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="result-bar">
        <span>
          Mostrando <strong>{oas.length}</strong> objetivos de aprendizaje
        </span>
        <div className="assign-bar">
          <span>{marcados.size} seleccionados</span>
          <select value={cursoDestino} onChange={(e) => setCursoDestino(e.target.value)}>
            <option value="">Asignar a curso…</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.anio})
              </option>
            ))}
          </select>
          <button className="btn btn-green btn-sm" disabled={!cursoDestino || marcados.size === 0} onClick={asignar}>
            Asignar
          </button>
        </div>
      </div>
      <ErrorBox error={error} />
      {mensaje && (
        <div className="alert alert-ok" onClick={() => setMensaje(null)}>
          {mensaje}
        </div>
      )}

      {oas.length === 0 && <Empty>No hay OA con esos filtros. Puedes crearlos o importarlos desde un CSV.</Empty>}
      {porNivel.map(([nivel, lista]) => (
        <section key={nivel}>
          <div className="nivel-head">
            {nivel} <span className="muted small">({lista.length} OAs)</span>
          </div>
          <div className="oa-grid">
            {lista.map((oa) => (
              <div key={oa.id} className={`oa-card ${marcados.has(oa.id) ? 'checked' : ''}`}>
                <div className="oa-head">
                  <label className="oa-check">
                    <input type="checkbox" checked={marcados.has(oa.id)} onChange={() => toggle(oa.id)} />
                    <span className="oa-code">{oa.codigo}</span>
                  </label>
                  <span className="oa-subject">{oa.asignatura}</span>
                </div>
                {oa.eje && <div className="oa-eje-line">{oa.eje}</div>}
                <p className="oa-desc">{oa.descripcion}</p>
                <div className="oa-foot">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditar({ id: oa.id, asignaturaId: oa.asignaturaId, nivelId: oa.nivelId, numero: oa.numero, eje: oa.eje ?? '', descripcion: oa.descripcion })}
                  >
                    Editar
                  </button>
                  <button className="icon-btn" title="Eliminar" onClick={() => eliminar(oa)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {editar && (
        <OaModal
          form={editar}
          asignaturas={asignaturas}
          niveles={niveles}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            cargar();
          }}
        />
      )}
      {importar && (
        <ImportarModal
          onClose={() => setImportar(false)}
          onDone={(msg) => {
            setImportar(false);
            setMensaje(msg);
            cargar();
          }}
        />
      )}
    </>
  );
}

function OaModal({ form: inicial, asignaturas, niveles, onClose, onSaved }: { form: OaForm; asignaturas: Asignatura[]; niveles: Nivel[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(inicial);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    const body = { asignaturaId: form.asignaturaId, nivelId: form.nivelId, numero: form.numero, eje: form.eje || null, descripcion: form.descripcion };
    try {
      if (form.id) await api(`/oas/${form.id}`, { method: 'PUT', json: body });
      else await api('/oas', { method: 'POST', json: body });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title={form.id ? 'Editar OA' : 'Nuevo OA'} onClose={onClose} wide>
      <div className="form-grid form-3">
        <label>
          Asignatura
          <select value={form.asignaturaId} onChange={(e) => setForm({ ...form, asignaturaId: Number(e.target.value) })}>
            {asignaturas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nivel
          <select value={form.nivelId} onChange={(e) => setForm({ ...form, nivelId: Number(e.target.value) })}>
            {niveles.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Número (OA)
          <input type="number" min={1} value={form.numero} onChange={(e) => setForm({ ...form, numero: Number(e.target.value) })} />
        </label>
        <label className="span-3">
          Eje
          <input value={form.eje} placeholder="Ej: Ciencias de la vida" onChange={(e) => setForm({ ...form, eje: e.target.value })} />
        </label>
        <label className="span-3">
          Descripción
          <textarea rows={4} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        </label>
      </div>
      <ErrorBox error={error} />
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={guardar}>
          Guardar
        </button>
      </div>
    </Modal>
  );
}

function ImportarModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  const leerArchivo = async (file: File | undefined) => {
    if (file) setCsv(await file.text());
  };

  const importar = async () => {
    setError(null);
    try {
      const r = await api<{ creados: number; actualizados: number; errores: string[] }>('/oas/importar', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: csv,
      });
      if (r.errores.length) setErrores(r.errores);
      else onDone(`Importación lista: ${r.creados} OA creados, ${r.actualizados} actualizados.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Importar OA desde CSV" onClose={onClose} wide>
      <p className="small">
        Columnas: <code>asignatura,nivel,numero,eje,descripcion</code>. Asignatura por código (LEN, MAT, CN, HIS) y nivel por código (1B…8B,
        1M…4M). Usa comillas si la descripción tiene comas. Los OA existentes se actualizan.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => leerArchivo(e.target.files?.[0])} />
      <textarea rows={8} className="mono" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'asignatura,nivel,numero,eje,descripcion\nCN,2B,1,Ciencias de la vida,"Observar, describir y clasificar..."'} />
      <ErrorBox error={error} />
      {errores.length > 0 && (
        <div className="alert">
          Se importaron las filas válidas. Filas con problemas:
          <ul>
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Cerrar
        </button>
        <button className="btn btn-primary" disabled={!csv.trim()} onClick={importar}>
          Importar
        </button>
      </div>
    </Modal>
  );
}
