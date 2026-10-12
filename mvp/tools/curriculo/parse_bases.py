"""Extrae los Objetivos de Aprendizaje de los PDF oficiales de Bases Curriculares (texto de `pdftotext -layout`).

Uso: python3 -I parse_bases.py <dir_txt> <salida.csv> [--debug]
"""
import csv
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ORDINAL = {"Primero": 1, "Segundo": 2, "Tercero": 3, "Cuarto": 4, "Séptimo": 7, "Octavo": 8}
BULLET = re.compile(r"^[•›•›●–]\s*")
PAUSA = re.compile(r"^(Introducción|Actitudes|Habilidades|Orientaciones|Organización curricular|Glosario|Anexo|Bibliografía|Referencias|"
                   r"Objetivos de Aprendizaje Transversales|Propósitos formativos|Enfoque|Ejemplos de|Nota:)\b")
# Palabras reales que empiezan con "ú"; cualquier otra "ú" pegada es la viñeta del PDF de 1° a 6° básico.
PALABRA_U = re.compile(r"ú(ltim|nic|til)", re.I)
ROTULOS_IGNORADOS = {"Ejes", "Eje", "Ejes temáticos", "Habilidades", "Actitudes", "Conocimiento y comprensión", "Objetivos de Aprendizaje"}


def segmentos(linea):
    return [(m.start(), m.group()) for m in re.finditer(r"\S(?:.*?\S)?(?=\s{2,}|\s*$)", linea)]


def es_espaciado(texto):
    """Subtítulos con letras separadas, como "C uer p o h u m an o y s alud"."""
    toks = texto.split()
    if len(toks) < 4 or re.search(r"[=;,:.()]", texto):
        return False
    sueltas = sum(len(t) == 1 for t in toks) / len(toks)
    promedio = sum(len(t) for t in toks) / len(toks)
    return sueltas > 0.4 and promedio < 2.6


class Vocabulario:
    def __init__(self, texto):
        self.palabras = Counter(w.lower() for w in re.findall(r"[a-záéíóúñü]+", texto, re.I))
        self.guiones = set(w.lower() for w in re.findall(r"[a-záéíóúñü]+-[a-záéíóúñü]+", texto, re.I))

    def __contains__(self, w):
        return self.palabras[w.lower()] > 0


def limpiar(lineas, notas, vocab, bullet_u):
    if bullet_u:
        # pdftotext a veces deja la viñeta "ú" sola en la línea siguiente a la que encabeza.
        previas = []
        for l in lineas:
            if l.strip() == "ú" and previas:
                previas[-1] = "• " + previas[-1].strip()
            elif l.strip() != "ú":
                previas.append(l)
        lineas = previas
    out = []
    for l in lineas:
        l = l.strip()
        if not l:
            continue
        es_bullet = bool(BULLET.match(l))
        if bullet_u and l.startswith("ú"):
            if not PALABRA_U.match(l):
                es_bullet = True
                l = "•" + l[1:]
        if es_bullet:
            out.append("• " + BULLET.sub("", l).strip())
            continue
        if out and out[-1].endswith("-") and re.match(r"^[a-záéíóúñü]", l):
            previo = re.search(r"([A-Za-záéíóúñüÁÉÍÓÚÑ]+)-$", out[-1])
            siguiente = re.match(r"([a-záéíóúñü]+)", l)
            a, b = (previo.group(1) if previo else ""), siguiente.group(1)
            conservar = previo and ((len(a) <= 3 and len(b) <= 3) or (f"{a}-{b}".lower() in vocab.guiones and (a + b).lower() not in vocab))
            out[-1] = out[-1] + l if conservar else out[-1][:-1] + l
            continue
        if out:
            out[-1] += " " + l
        else:
            out.append(l)
    t = "\n".join(out)
    if bullet_u:
        def viñeta(m):
            return m.group(0) if PALABRA_U.match(m.group(0)) else "\n• " + m.group(2)
        t = re.sub(r"(?:(?<=\s)|(?<=^))ú(\s*)([a-záéíóúñ]+)", viñeta, t, flags=re.M)
        t = re.sub(r"[ \t]*\n• ", "\n• ", t)
    for n in notas:
        t = re.sub(rf"([a-záéíóúñ\)»”.]){n}(?=[\s.,;:]|$)", r"\1", t)
    t = re.sub(r"\b([a-záéíóúñ]+)- ([a-záéíóúñ]+)\b", lambda m: m[1] + m[2] if (m[1] + m[2]) in vocab else f"{m[1]}-{m[2]}", t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" +([.,;:])", r"\1", t)
    return t.strip()


class Parser:
    def __init__(self, vocab, bullet_u=False, debug=False):
        self.vocab, self.bullet_u, self.debug = vocab, bullet_u, debug
        self.oas, self.vistos = [], defaultdict(set)
        self.asig = self.curso = None
        self.activo = False
        self.esperado = 1
        self.actual = None
        self.eje = None
        self.eje_buf, self.eje_linea, self.eje_inicio = [], None, None
        self.tras_pagina = False
        self.titulo_en_curso = False

    def log(self, *a):
        if self.debug:
            print(*a, file=sys.stderr)

    def cerrar(self):
        if self.actual:
            self.actual["texto"] = limpiar(self.actual["lineas"], self.actual["notas"], self.vocab, self.bullet_u)
            self.oas.append(self.actual)
            self.vistos[(self.asig, self.curso)].add(self.actual["numero"])
            self.actual = None

    def fijar(self, asig, curso):
        asig, curso = asig or self.asig, curso or self.curso
        if (asig, curso) != (self.asig, self.curso):
            self.cerrar()
            self.asig, self.curso = asig, curso
            self.activo = False
            self.esperado = max(self.vistos[(asig, curso)], default=0) + 1
            self.eje, self.eje_buf = None, []
            self.log(f"--> {asig} | {curso}")

    def iniciar_seccion(self):
        self.cerrar()
        self.activo = True
        self.esperado = max(self.vistos[(self.asig, self.curso)], default=0) + 1

    def pausar(self):
        self.cerrar()

    def fragmento_eje(self, texto, i, largo_max=45):
        if es_espaciado(texto) or len(texto) > largo_max or texto in ROTULOS_IGNORADOS or texto[0].isdigit() or texto.endswith((".", ":")):
            return
        if re.fullmatch(r"[1-4]° medio", texto):
            return
        if self.eje_linea is None or i - self.eje_linea > 3:
            self.eje_buf, self.eje_inicio = [], i
        self.eje_buf.append(texto)
        self.eje_linea = i
        etiqueta = " ".join(self.eje_buf)
        etiqueta = re.sub(r"(\w)- (\w)", r"\1\2", etiqueta)
        if self.actual and self.actual["linea"] >= self.eje_inicio:
            self.actual["eje"] = etiqueta
        self.eje = etiqueta

    def inicio_oa(self, segs):
        """Devuelve (indice_segmento, texto) si la línea empieza el OA esperado."""
        for k, (col, s) in enumerate(segs):
            m = re.match(rf"^({self.esperado})\.?(?:\s+(.*))?$", s)
            if not m:
                continue
            resto = " ".join(x for _, x in segs[k + 1:])
            texto = ((m.group(2) or "") + " " + resto).strip()
            if texto and not re.match(r"^[A-ZÁÉÍÓÚÑ¿«“\"(]", texto):
                return None
            return k, texto
        return None

    def salto(self, lineas_vacias, cambio_pagina):
        if cambio_pagina:
            self.tras_pagina = True
        if self.actual and self.actual["lineas"]:
            ultima = self.actual["lineas"][-1].rstrip()
            if ultima.endswith(".") and (cambio_pagina or lineas_vacias >= 3):
                self.pausar()

    def linea(self, i, raw, siguiente):
        segs = [x for x in segmentos(raw) if x[1] not in RELLENO]
        if not segs or not self.activo or not self.asig or not self.curso:
            return
        if re.match(r"^\s*[A-ZÁÉÍÓÚ][^\d•]{3,60}\s{2,}\d{1,3}\s*$", raw) or raw.strip() in ("Básico", "Medio", "básico", "medio") \
                or raw.strip() in ORDINAL or raw.strip() in ("Quinto", "Sexto"):
            self.pausar()
            return
        if H16.match(raw) or re.search(r"\b(Básico|Medio)\s+(Primero|Segundo|Tercero|Cuarto|Quinto|Sexto|Séptimo|Octavo)\b", raw) \
                or re.match(r"^\s*(Primero|Segundo|Tercero|Cuarto|Quinto|Sexto)\s+(Básico|básico)\s*$", raw):
            self.pausar()
            return

        inicio = self.inicio_oa(segs)
        if inicio:
            k, texto = inicio
            self.cerrar()
            col_txt = segs[k + 1][0] if len(segs) > k + 1 and re.fullmatch(r"\d{1,2}\.?", segs[k][1]) else segs[k][0] + len(str(self.esperado)) + 1
            self.actual = {"asig": self.asig, "curso": self.curso, "numero": self.esperado, "eje": self.eje,
                           "lineas": [texto] if texto else [], "col": col_txt, "linea": i, "notas": set()}
            self.esperado += 1
            self.tras_pagina = False
            for _, frag in segs[:k]:
                self.fragmento_eje(frag, i)
            return

        primero = segs[0][1]
        if PAUSA.match(primero) or re.match(r"^[a-zñ]\.?\s{1,4}[A-ZÁÉÍÓÚ¿]", " ".join(s for _, s in segs[-1:])):
            self.pausar()
            for _, s in segs:
                if not PAUSA.match(s) and not re.match(r"^[a-zñ]\.?\s", s) and len(segs) > 1 and segs[0][0] < 30:
                    self.fragmento_eje(s, i)
            return

        # Rótulo de eje en la columna del texto, justo antes del siguiente OA (ej. "Números").
        texto_linea = " ".join(s for _, s in segs)
        cerrado = not self.actual or not self.actual["lineas"] or self.actual["lineas"][-1].rstrip().endswith((".", ")"))
        sig1, sig2 = siguiente if siguiente else (None, None)
        if len(segs) == 1 and len(texto_linea) <= 110 and cerrado and not texto_linea.endswith((".", ";")):
            # Título de unidad o eje largo en su propia línea, a veces en dos (ej. Historia 7° a 2° medio).
            continua = self.titulo_en_curso and self.eje_linea is not None and i - self.eje_linea <= 3
            mayus = re.match(r"^[A-ZÁÉÍÓÚÑ]", texto_linea)
            sig_oa = sig1 is not None and self.inicio_oa(segmentos(sig1))
            sig2_oa = sig2 is not None and sig1 is not None and len(segmentos(sig1)) == 1 and len(sig1.strip()) <= 110 \
                and not sig1.strip().endswith((".", ";")) and self.inicio_oa(segmentos(sig2))
            if (mayus and (sig_oa or sig2_oa)) or (continua and sig_oa):
                self.cerrar()
                if not continua:
                    self.eje_linea = None
                self.fragmento_eje(texto_linea, i, largo_max=220)
                self.titulo_en_curso = True
                return
        self.titulo_en_curso = False
        siguiente = sig1
        if siguiente is not None and len(segs) <= 2 and len(texto_linea) <= 45 and not texto_linea.endswith((".", ",", ";", ":")) \
                and re.match(r"^[A-ZÁÉÍÓÚÑ]", segs[-1][1]) and self.inicio_oa(segmentos(siguiente)):
            self.cerrar()
            for _, s in segs:
                self.fragmento_eje(s, i)
            return

        if not self.actual:
            if len(segs) == 1 and segs[0][0] < 30:
                self.fragmento_eje(segs[0][1], i)
            return

        # Tras un cambio de página la columna del texto puede moverse: si la página sigue con una viñeta, se toma su columna.
        if self.tras_pagina and len(segs) == 1 and (BULLET.match(segs[0][1]) or segs[0][1].startswith("ú")):
            self.actual["col"] = segs[0][0] + 2
        # Corta la línea en la columna del texto del OA: lo de la izquierda es rótulo de eje.
        col = self.actual["col"]
        contenido = []
        if segs[0][0] < col - 6 and len(raw) > col:
            corte = col
            while corte > col - 4 and corte > 0 and raw[corte - 1] != " ":
                corte -= 1
            izquierda, derecha = raw[:corte], raw[corte:]
            for _, frag in segmentos(izquierda):
                self.fragmento_eje(frag, i)
            if derecha.strip():
                contenido.append(derecha.strip())
        else:
            for c, s in segs:
                if c < col - 6:
                    self.fragmento_eje(s, i)
                else:
                    contenido.append(s)
        if not contenido:
            return
        texto = " ".join(contenido)
        tras_pagina, self.tras_pagina = self.tras_pagina, False
        hubo_vinetas = any(BULLET.match(l.strip()) or l.strip().startswith("ú") for l in self.actual["lineas"])
        sangria = segs[-1][0] if contenido and segs[-1][1] == contenido[-1] else col
        if re.match(r"^[A-ZÁÉÍÓÚÑ]", texto) and not BULLET.match(texto) and (tras_pagina or (hubo_vinetas and sangria <= col + 1)):
            self.pausar()
            return
        if es_espaciado(texto):
            return
        nota = re.match(r"^(\d{1,2})\s+[A-ZÁÉÍÓÚ]", texto)
        if nota and int(nota.group(1)) != self.esperado:
            self.actual["notas"].add(nota.group(1))
            return
        self.actual["lineas"].append(texto)


RELLENO = {"Organizadores", "temáticos", "Organizadores temáticos"}


def es_ruido(s):
    return s in RELLENO or "Bases Curriculares" in s or re.fullmatch(r"\d{1,3}", s) is not None or s.startswith(("Los estudiantes serán capaces", "Se espera que los"))


def siguiente_no_vacia(lineas, i):
    """Las dos líneas no vacías siguientes de la página."""
    sig = []
    for j in range(i + 1, min(i + 10, len(lineas))):
        if lineas[j].strip() and not es_ruido(lineas[j].strip()):
            sig.append(lineas[j])
            if len(sig) == 2:
                break
    return (sig + [None, None])[:2]


def recorrer(paginas, p, encabezado, marcador_curso=None):
    """paginas: lista de listas de líneas. encabezado(lineas_pagina) -> (asig, curso) o None."""
    hdrs = [encabezado(pg) for pg in paginas]
    curso_pend = None
    n = 0
    for pi, pg in enumerate(paginas):
        vacias = 0
        primera_de_pagina = True
        for li, raw in enumerate(pg):
            n += 1
            s = raw.strip()
            if not s:
                vacias += 1
                continue
            if not es_ruido(s):
                p.salto(vacias, primera_de_pagina)
                primera_de_pagina = False
            vacias = 0
            if marcador_curso:
                r = marcador_curso(s, curso_pend, n)
                if r is not None:
                    curso_pend, fijado = r
                    if fijado:
                        p.fijar(None, fijado)
                    continue
            if re.match(r"^Objetivos de Aprendizaje\b", s) and "Transversales" not in s:
                h = hdrs[pi] or (hdrs[pi + 1] if pi + 1 < len(hdrs) else None)
                if h:
                    p.fijar(*h)
                p.iniciar_seccion()
                continue
            if es_ruido(s) or s in ROTULOS_IGNORADOS:
                continue
            p.linea(n, raw, siguiente_no_vacia(pg, li))
    p.cerrar()


# ---------- 1° a 6° básico (2012) ----------
H16 = re.compile(r"^\s*(?:\d{1,3}\s{2,})?(?P<asig>[A-ZÁÉÍÓÚÑ][^\d|]{3,60}?)\s{2,}(?P<n>[1-6])\s*[º°]\s*[bB]ásico(?:\s{2,}\d{1,3})?\s*$")


def enc_1_6(lineas):
    for raw in lineas[:12]:
        m = H16.match(raw)
        if m and "Bases Curriculares" not in raw:
            return m.group("asig").strip(), f"{m.group('n')}B"
    return None


# ---------- 7° básico a 2° medio (2015) ----------
def enc_7_2(lineas):
    for raw in lineas:
        m = re.search(r"7° básico a 2° medio\s*\|\s*(?P<asig>[^|]+?)\s*(?:\d{1,3})?\s*$", raw)
        if m and m.group("asig").strip() != "Introducción":
            return m.group("asig").strip(), None
    return None


def marcador_7_2(s, pend, n):
    if s in ORDINAL:
        return (ORDINAL[s], n), None
    if pend and s in ("básico", "medio") and n - pend[1] <= 3:
        return None, f"{pend[0]}{'B' if s == 'básico' else 'M'}"
    return None


# ---------- 3° y 4° medio (2019) ----------
CURSO_34 = re.compile(r"^\s*(?:Módulo\s+)?(3|4)\s*[°º]\s*(?:(o|y)\s*(?:4\s*[°º])\s*)?medio\b")
TITULOS_34_IGNORADOS = {"Conocimiento y comprensión", "Habilidades", "Objetivos de", "Aprendizaje", "Objetivos de Aprendizaje"}


def recorrer_34(paginas, p, hasta=283):
    """Formación General (por curso) y Diferenciada Humanístico-Científica (3° o 4° medio)."""
    titulo, en_titulo, base_modulo, n_modulo = [], False, None, 0
    n = 0
    for pi, pg in enumerate(paginas[:hasta]):
        h = re.match(r"^\s*(?P<asig>\S.*?)\s{2,}Objetivos de Aprendizaje\s{2,}\d", pg[0] if pg else "")
        if not h:
            h = next((re.match(r"^\s*(?P<asig>\S.*?)\s{2,}Objetivos de Aprendizaje\s*$", l) for l in pg[:3] if l.strip()), None)
        asig_pagina = h.group("asig").strip() if h else None
        if not asig_pagina and pg and pg[0].strip() and not pg[0].strip()[0].isdigit() and any(l.strip() == "Objetivos de Aprendizaje" for l in pg[1:3]):
            asig_pagina = pg[0].strip()
        vacias, primera = 0, True
        for li, raw in enumerate(pg):
            n += 1
            s = raw.strip()
            if not s:
                vacias += 1
                continue
            if not es_ruido(s):
                p.salto(vacias, primera)
                primera = False
            vacias = 0
            if s == "Objetivos de Aprendizaje" or s == "Objetivos de":
                titulo, en_titulo = [], True
                p.pausar()
                continue
            if re.match(r"^(Notas|Referencias|Propósitos formativos|Enfoque de la asignatura|Organización curricular|Glosario)\b", s):
                p.pausar()
                en_titulo = False
                continue
            if "Se espera que los estudiantes sean capaces de" in s:
                m = CURSO_34.match(raw)
                if not m:
                    continue
                curso = f"{m.group(1)}M" if not m.group(2) else "3M-4M"
                nombre = " ".join(titulo).strip() or asig_pagina
                nombre = re.sub(r"\s*\d+$", "", nombre or "")
                if len(nombre) > 70:
                    nombre = asig_pagina or ""
                en_titulo = False
                base_modulo, n_modulo = nombre, 0
                p.fijar(nombre, curso)
                p.iniciar_seccion()
                continue
            if en_titulo:
                if s not in TITULOS_34_IGNORADOS and not es_ruido(s) and not s.startswith("Bases Curriculares"):
                    titulo.append(s)
                continue
            if re.match(r"^\s*Módulo\s{2,}1\s{2,}", raw) and base_modulo:
                n_modulo += 1
                p.fijar(f"{base_modulo}#{n_modulo}", p.curso)
                p.iniciar_seccion()
            if es_ruido(s) or s in ROTULOS_IGNORADOS:
                continue
            p.linea(n, raw, siguiente_no_vacia(pg, li))
    p.cerrar()


DOCS = [
    ("Bases_Curriculares_1_a_6_Basico", enc_1_6, None, True, "Bases Curriculares 1° a 6° básico (2012)"),
    ("Bases_Curriculares_7_Basico_a_2_Medio", enc_7_2, marcador_7_2, False, "Bases Curriculares 7° básico a 2° medio (2015)"),
    ("Bases_Curriculares_3_y_4_Medio", None, None, True, "Bases Curriculares 3° y 4° medio (2019)"),
]


def procesar(carpeta, debug):
    filas, reporte = [], []
    for nombre, enc, marc, bullet_u, fuente in DOCS:
        crudo = (carpeta / f"{nombre}.layout.txt").read_text(encoding="utf-8")
        paginas = [pg.split("\n") for pg in crudo.split("\f")]
        p = Parser(Vocabulario(crudo), bullet_u, debug)
        if enc is None:
            recorrer_34(paginas, p)
        elif enc is enc_7_2:
            # En 7°-2° la asignatura viene del encabezado de página; el curso, del marcador "Séptimo básico", etc.
            def enc_wrap(pg, _enc=enc):
                h = _enc(pg)
                return (h[0], p.curso) if h else None
            recorrer(paginas, p, enc_wrap, marc)
        else:
            recorrer(paginas, p, enc, marc)
        for oa in p.oas:
            oa["fuente"] = fuente
        filas += p.oas
        reporte.append((fuente, p.oas))
    return filas, reporte


def main():
    carpeta, salida = Path(sys.argv[1]), Path(sys.argv[2])
    filas, reporte = procesar(carpeta, "--debug" in sys.argv)
    for fuente, oas in reporte:
        grupos = defaultdict(list)
        for oa in oas:
            grupos[(oa["asig"], oa["curso"])].append(oa["numero"])
        print(f"== {fuente}", file=sys.stderr)
        for (a, c), nums in sorted(grupos.items()):
            ok = nums == list(range(1, len(nums) + 1))
            print(f"   {a:45} {c:4} {len(nums):3} OA {'ok' if ok else 'SALTOS ' + str(nums)}", file=sys.stderr)
    with salida.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["asignatura_nombre", "nivel", "numero", "eje", "descripcion", "fuente"])
        for oa in filas:
            w.writerow([oa["asig"], oa["curso"], oa["numero"], oa["eje"] or "", oa["texto"], oa["fuente"]])
    print(f"{len(filas)} OA -> {salida}", file=sys.stderr)


if __name__ == "__main__":
    main()
