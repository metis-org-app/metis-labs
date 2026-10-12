'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Asignatura, Curso, Nivel, Oa } from '@/lib/types';
import { confirmar } from '@/components/confirm';
import { Empty, ErrorBox, Modal, OaTag, PageHead } from '@/components/ui';

type OaForm = { id?: number; asignaturaId: number; nivelId: number; numero: number; eje: string; descripcion: string };

export default function CurriculumPage() {
  const [asignaturas, setAsignaturas] = useState<Asignatura[]>([]);
  const [niveles, setNiveles] = useState<Nivel[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [filtro, setFiltro] = useState({ asignaturaId: '', nivelId: '', q: '' });
  const [oas, setOas] = useState<Oa[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [cursoDestino, setCursoDestino] = useState('');
  const [editar, setEditar] = useState<OaForm | null>(null);
  const [importar, setImportar] = useState(false);

  useEffect(() => {
    api<Asignatura[]>('/asignaturas').then(setAsignaturas);
    // El currículum completo tiene casi 1.800 OA: se parte mostrando el primer nivel.
    api<Nivel[]>('/niveles').then((n) => {
      setNiveles(n);
      setFiltro((f) => (f.nivelId ? f : { ...f, nivelId: String(n[0]?.id ?? '') }));
    });
    api<Curso[]>('/cursos').then(setCursos);
  }, []);

  // Asignaturas con OA en el nivel elegido, agrupadas por área (plan común, electivos y diferenciados de 3° y 4° medio).
  const [asignaturasNivel, setAsignaturasNivel] = useState<Asignatura[] | null>(null);
  useEffect(() => {
    if (!filtro.nivelId) return setAsignaturasNivel(null);
    api<Asignatura[]>(`/asignaturas?nivelId=${filtro.nivelId}`).then(setAsignaturasNivel);
  }, [filtro.nivelId]);
  const opcionesAsig = asignaturasNivel ?? asignaturas;
  const areas = useMemo(() => {
    const m = new Map<string, Asignatura[]>();
    for (const a of opcionesAsig) m.set(a.area ?? 'Otras', [...(m.get(a.area ?? 'Otras') ?? []), a]);
    return [...m.entries()];
  }, [opcionesAsig]);

  const cargar = useCallback(() => {
    if (!niveles.length) return;
    const qs = new URLSearchParams();
    Object.entries(filtro).forEach(([k, v]) => v && qs.set(k, v.trim()));
    return api<Oa[]>(`/oas?${qs}`).then(setOas).catch((e) => setError(e.message));
  }, [filtro, niveles.length]);
  useEffect(() => {
    const t = setTimeout(cargar, 200);
    return () => clearTimeout(t);
  }, [cargar]);

  // Agrupado por nivel y luego por asignatura.
  const grupos = useMemo(() => {
    const porNivel = new Map<string, Map<string, Oa[]>>();
    for (const o of oas ?? []) {
      const n = porNivel.get(o.nivel) ?? new Map<string, Oa[]>();
      n.set(o.asignatura, [...(n.get(o.asignatura) ?? []), o]);
      porNivel.set(o.nivel, n);
    }
    return [...porNivel.entries()].map(([nivel, m]) => [nivel, [...m.entries()]] as const);
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
      const r = await api<{ asignados: number; yaExistian: number }>(`/cursos/${cursoDestino}/oas`, { method: 'POST', json: { objetivoIds: [...marcados] } });
      const curso = cursos.find((c) => String(c.id) === cursoDestino);
      setMensaje(`${r.asignados} OA asignados a ${curso?.nombre}${r.yaExistian ? ` (${r.yaExistian} ya estaban)` : ''}.`);
      setMarcados(new Set());
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const eliminar = async (oa: Oa) => {
    if (!(await confirmar(`¿Eliminar ${oa.codigoOficial} del currículum?`))) return;
    try {
      await api(`/oas/${oa.id}`, { method: 'DELETE' });
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <PageHead
        title="Currículum"
        subtitle="Objetivos de Aprendizaje de las Bases Curriculares, por nivel y asignatura. El código sigue el formato del MINEDUC: asignatura, nivel y número de OA."
        action={
          <>
            <button className="btn btn-ghost" onClick={() => setImportar(true)}>
              Importar CSV
            </button>
            <button
              className="btn btn-primary"
              onClick={() =>
                setEditar({ asignaturaId: Number(filtro.asignaturaId) || asignaturas[0]?.id || 1, nivelId: Number(filtro.nivelId) || niveles[0]?.id || 1, numero: 1, eje: '', descripcion: '' })
              }
            >
              + Nuevo OA
            </button>
          </>
        }
      />

      <div className="toolbar">
        <select value={filtro.nivelId} onChange={(e) => setFiltro({ ...filtro, nivelId: e.target.value, asignaturaId: '' })} aria-label="Nivel">
          <option value="">Todos los niveles (lento)</option>
          {niveles.map((n) => (
            <option key={n.id} value={n.id}>
              {n.nombre}
            </option>
          ))}
        </select>
        <select value={filtro.asignaturaId} onChange={(e) => setFiltro({ ...filtro, asignaturaId: e.target.value })} aria-label="Asignatura">
          <option value="">Todas las asignaturas</option>
          {areas.map(([area, lista]) => (
            <optgroup key={area} label={area}>
              {lista.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <input placeholder="Buscar: CN01 OA 03, “plantas”…" value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} />
      </div>

      {marcados.size > 0 && (
        <div className="assign-bar">
          <span>{marcados.size} OA seleccionados</span>
          <select value={cursoDestino} onChange={(e) => setCursoDestino(e.target.value)} aria-label="Curso destino">
            <option value="">Elegir curso…</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.anio})
              </option>
            ))}
          </select>
          <button className="btn btn-green btn-sm" disabled={!cursoDestino} onClick={asignar}>
            Asignar al curso
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setMarcados(new Set())}>
            Cancelar
          </button>
        </div>
      )}
      <ErrorBox error={error} />
      {mensaje && (
        <div className="alert alert-ok" onClick={() => setMensaje(null)}>
          {mensaje}
        </div>
      )}
      {oas?.length === 0 && <Empty>No hay OA con esos filtros. Puedes crearlos o importarlos desde un CSV.</Empty>}

      {grupos.map(([nivel, asigs]) => (
        <section key={nivel} className="nivel-bloque">
          <h2 className="nivel-head">{nivel}</h2>
          {asigs.map(([asignatura, lista]) => (
            <div key={asignatura} className="card oa-grupo">
              <h3>
                {asignatura} <span className="muted small">{lista.length} OA</span>
              </h3>
              <ul className="oa-list">
                {lista.map((o) => (
                  <li key={o.id} className={marcados.has(o.id) ? 'checked' : ''}>
                    <input type="checkbox" checked={marcados.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Seleccionar ${o.codigoOficial}`} />
                    <div className="oa-main">
                      <div className="oa-row-head">
                        <OaTag oa={o} />
                        {o.eje && <span className="muted small">Eje: {o.eje}</span>}
                        {o.fuente && <span className="muted small fuente">{o.fuente}</span>}
                      </div>
                      <p className="oa-desc">{o.descripcion}</p>
                      <div className="oa-cursos small">
                        {o.cursos && o.cursos.length > 0 ? (
                          <>
                            En tus cursos:{' '}
                            {o.cursos.map((c) => (
                              <Link key={c.id} href={`/cursos/${c.id}?tab=curriculo`} className="chip">
                                {c.nombre} {c.anio}
                              </Link>
                            ))}
                          </>
                        ) : (
                          <span className="muted">No asignado a tus cursos</span>
                        )}
                      </div>
                    </div>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditar({ id: o.id, asignaturaId: o.asignaturaId, nivelId: o.nivelId, numero: o.numero, eje: o.eje ?? '', descripcion: o.descripcion })}>
                        Editar
                      </button>
                      <button className="icon-btn" title="Eliminar" onClick={() => eliminar(o)}>
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
  const asig = asignaturas.find((a) => a.id === form.asignaturaId);
  const nivel = niveles.find((n) => n.id === form.nivelId);
  const codigo = asig && nivel ? `${asig.prefijo ?? asig.codigo}${/^\d+B$/.test(nivel.codigo) ? nivel.codigo.replace('B', '').padStart(2, '0') : nivel.codigo} OA ${String(form.numero).padStart(2, '0')}` : '';

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
          Número de OA
          <input type="number" min={1} value={form.numero} onChange={(e) => setForm({ ...form, numero: Number(e.target.value) })} />
          {codigo && <span className="hint-inline">Código: {codigo}</span>}
        </label>
        <label className="span-3">
          Eje
          <input value={form.eje} placeholder="Ej: Ciencias de la vida" onChange={(e) => setForm({ ...form, eje: e.target.value })} />
        </label>
        <label className="span-3">
          Descripción (texto oficial)
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

  const importar = async () => {
    setError(null);
    try {
      const r = await api<{ creados: number; actualizados: number; errores: string[]; asignaturasCreadas: number }>('/oas/importar', {
        method: 'POST',
        headers: { 'content-type': 'text/csv' },
        body: csv,
      });
      if (r.errores.length) setErrores(r.errores);
      else
        onDone(
          `Importación lista: ${r.creados} OA creados y ${r.actualizados} actualizados${r.asignaturasCreadas ? `, ${r.asignaturasCreadas} asignaturas nuevas` : ''}.`,
        );
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Importar OA desde CSV" onClose={onClose} wide>
      <p className="small">
        Columnas: <code>asignatura,nivel,numero,eje,descripcion</code> y, opcionalmente, <code>asignatura_nombre,prefijo,area,fuente</code> (se leen por el
        encabezado). Asignatura con su código en Metis (LE, LL, MA, CN, HI, IN…) y nivel como 1B…8B o 1M…4M. Si la asignatura no existe y viene{' '}
        <code>asignatura_nombre</code>, se crea. Usa comillas si la descripción tiene comas o saltos de línea. Si el OA ya existe, se actualiza.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={async (e) => e.target.files?.[0] && setCsv(await e.target.files[0].text())} />
      <textarea rows={8} className="mono" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'asignatura,nivel,numero,eje,descripcion\nCN,2B,1,Ciencias de la vida,"Observar, describir y clasificar…"'} />
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
