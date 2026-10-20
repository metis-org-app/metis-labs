# Exporta la base sembrada por la API .NET a JSON para la demo de presentación (web/demo/datos).
# Uso: con la API recién levantada sobre una base vacía (así queda solo la semilla),
#   python3 tools/demo/exportar_semilla.py web/demo/datos
# La conexión se toma de las variables PGHOST, PGPORT, PGUSER, PGPASSWORD y PGDATABASE (por defecto la del docker-compose).
import json, os, subprocess, sys
out = sys.argv[1]
env = {**os.environ, 'PGHOST': os.environ.get('PGHOST', 'localhost'), 'PGPORT': os.environ.get('PGPORT', '5432'),
       'PGUSER': os.environ.get('PGUSER', 'metis'), 'PGPASSWORD': os.environ.get('PGPASSWORD', 'metis'), 'PGDATABASE': os.environ.get('PGDATABASE', 'metis')}
def q(sql):
    r = subprocess.run(['psql','-At','-c',sql],capture_output=True,text=True,check=True,env=env)
    return json.loads(r.stdout or 'null') or []
def tabla(t, orden='"Id"'):
    return q(f'select coalesce(json_agg(x order by {orden}),\'[]\') from (select * from "{t}") x')
def camel(d):
    if isinstance(d, list): return [camel(x) for x in d]
    if isinstance(d, dict): return {k[0].lower()+k[1:]: camel(v) for k,v in d.items()}
    return d
ahora = q("select to_json(now())")
sem = {
  'exportadoEn': ahora,
  'profesores': [{k:v for k,v in p.items() if k!='passwordHash'} for p in camel(tabla('Profesores'))],
  'asignaturas': camel(tabla('Asignaturas')),
  'niveles': camel(tabla('Niveles')),
  'cursos': camel(tabla('Cursos')),
  'cursoObjetivos': camel(tabla('CursoObjetivos','"CursoId","ObjetivoId"')),
  'estudiantes': camel(tabla('Estudiantes')),
  'exclusiones': camel(tabla('Exclusiones','"CursoId","ObjetivoId","EstudianteId"')),
  'planificaciones': camel(tabla('Planificaciones')),
  'planificacionObjetivos': camel(tabla('PlanificacionObjetivos','"PlanificacionId","ObjetivosId"')),
  'materiales': camel(tabla('Materiales')),
  'materialObjetivos': camel(tabla('MaterialObjetivos','"MaterialId","ObjetivosId"')),
  'evaluaciones': camel(tabla('Evaluaciones')),
  'preguntas': camel(tabla('Preguntas')),
  'intentos': camel(tabla('Intentos')),
  'mensajes': camel(tabla('Mensajes')),
}
json.dump(sem, open(f'{out}/semilla.json','w'), ensure_ascii=False, separators=(',',':'))
# OA en formato compacto: [id, asignaturaId, nivelId, numero, eje, descripcion, fuente]; fuente se indexa para no repetirla.
oas = camel(tabla('Objetivos'))
fuentes = sorted({o['fuente'] for o in oas if o['fuente']})
filas = [[o['id'],o['asignaturaId'],o['nivelId'],o['numero'],o['eje'],o['descripcion'],fuentes.index(o['fuente']) if o['fuente'] else None] for o in oas]
json.dump({'fuentes':fuentes,'oas':filas}, open(f'{out}/oas.json','w'), ensure_ascii=False, separators=(',',':'))
print({k:len(v) for k,v in sem.items() if isinstance(v,list)}, len(oas))
