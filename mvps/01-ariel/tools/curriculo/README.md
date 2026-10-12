# Extractor del currículum oficial

Genera `data/oas.csv` a partir de los PDF oficiales de las Bases Curriculares del MINEDUC.

## Fuentes

Descarga los PDF desde [curriculumnacional.cl](https://www.curriculumnacional.cl) (sección Bases Curriculares) y guárdalos con estos nombres:

| Archivo | Documento |
|---|---|
| `Bases_Curriculares_1_a_6_Basico.pdf` | Bases Curriculares 1° a 6° básico (2012) |
| `Bases_Curriculares_7_Basico_a_2_Medio.pdf` | Bases Curriculares 7° básico a 2° medio (2015) |
| `Bases_Curriculares_3_y_4_Medio.pdf` | Bases Curriculares 3° y 4° medio (2019) |

Los PDF separados de Orientación (1° básico a II medio) y de Filosofía (3° y 4° medio) repiten OA que ya están en estos tres documentos, así que no se procesan.

## Uso

Requiere `pdftotext` (poppler-utils) y Python 3.

```bash
mkdir -p txt
for f in pdfs/*.pdf; do pdftotext -layout "$f" "txt/$(basename "${f%.pdf}").layout.txt"; done
python3 parse_bases.py txt extraccion.csv        # muestra los OA por asignatura y nivel, y avisa si hay saltos en la numeración
python3 normalizar.py extraccion.csv ../../data/oas.csv
```

- `parse_bases.py` lee el texto con la diagramación de cada documento y extrae los OA: el número, el eje (o la unidad, en Historia de 7° a II medio) y la descripción. Reconstruye las palabras cortadas con guion, convierte las viñetas del PDF en "•" y omite notas al pie, encabezados y textos de otras secciones.
- `normalizar.py` aplica el catálogo de asignaturas de Metis: código, prefijo oficial, nombre y área. También unifica los nombres de eje cortados en el PDF y separa en 3° y 4° medio las asignaturas definidas para "3° o 4° medio". Falla si encuentra una asignatura fuera del catálogo o dos OA con la misma clave.

## Revisión

Se revisó que la numeración de cada asignatura y nivel sea continua, se compararon los totales con los documentos y se leyó una muestra de OA. Los OA de Inglés de 7° a II medio son largos porque incluyen ejemplos en inglés: es así en el original. Si notas una diferencia con curriculumnacional.cl, corrígela en `data/oas.csv` o vuelve a importar ese OA desde *Currículum → Importar CSV*.
