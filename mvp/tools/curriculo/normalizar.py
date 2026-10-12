"""Normaliza la extracción de parse_bases.py al formato que importa Metis.

Uso: python3 -I normalizar.py <extraccion.csv> <salida.csv>
"""
import csv
import re
import sys
from collections import Counter, defaultdict

# Nombre en el PDF -> (código interno único, prefijo del código oficial MINEDUC, nombre en Metis, área)
FG, ELECT, DIF = "Formación general", "Formación general electiva (3° y 4° medio)", "Formación diferenciada HC (3° y 4° medio)"
CATALOGO = {
    "Lenguaje y Comunicación": ("LE", "LE", "Lenguaje y Comunicación", FG),
    "Lengua y Literatura": ("LL", "LE", "Lengua y Literatura", FG),
    "Matemática": ("MA", "MA", "Matemática", FG),
    "Ciencias Naturales": ("CN", "CN", "Ciencias Naturales", FG),
    "Historia, Geografía y Ciencias Sociales": ("HI", "HI", "Historia, Geografía y Ciencias Sociales", FG),
    "Idioma Extranjero Inglés": ("IN", "IN", "Inglés", FG),
    "Idioma Extranjero: Inglés": ("IN", "IN", "Inglés", FG),
    "Inglés": ("IN", "IN", "Inglés", FG),
    "Artes Visuales": ("AR", "AR", "Artes Visuales", FG),
    "Música": ("MU", "MU", "Música", FG),
    "Educación Física y Salud": ("EF", "EF", "Educación Física y Salud", FG),
    "Tecnología": ("TE", "TE", "Tecnología", FG),
    "Orientación": ("OR", "OR", "Orientación", FG),
    # 3° y 4° medio, plan común
    "Educación Ciudadana": ("EC", "EC", "Educación Ciudadana", FG),
    "Filosofía": ("FI", "FI", "Filosofía", FG),
    "Ciencias para la Ciudadanía#1": ("CCB", "CCB", "Ciencias para la Ciudadanía: Bienestar y Salud", FG),
    "Ciencias para la Ciudadanía#2": ("CCS", "CCS", "Ciencias para la Ciudadanía: Seguridad, Prevención y Autocuidado", FG),
    "Ciencias para la Ciudadanía#3": ("CCA", "CCA", "Ciencias para la Ciudadanía: Ambiente y Sostenibilidad", FG),
    "Ciencias para la Ciudadanía#4": ("CCT", "CCT", "Ciencias para la Ciudadanía: Tecnología y Sociedad", FG),
    # 3° y 4° medio, plan común electivo
    "Danza": ("DA", "DA", "Danza", ELECT),
    "Teatro": ("TT", "TT", "Teatro", ELECT),
    "Chile y la Región Latinoamericana": ("CRL", "CRL", "Chile y la Región Latinoamericana", ELECT),
    "Mundo Global": ("MG", "MG", "Mundo Global", ELECT),
    # 3° y 4° medio, formación diferenciada humanístico-científica
    "Artes Visuales, Audiovisuales y Multimediales": ("AAM", "AAM", "Artes Visuales, Audiovisuales y Multimediales", DIF),
    "Creación y Composición Musical": ("CCM", "CCM", "Creación y Composición Musical", DIF),
    "Diseño y Arquitectura": ("DAR", "DAR", "Diseño y Arquitectura", DIF),
    "Interpretación y Creación en Danza": ("ICD", "ICD", "Interpretación y Creación en Danza", DIF),
    "Interpretación y Creación en Teatro": ("ICT", "ICT", "Interpretación y Creación en Teatro", DIF),
    "Interpretación Musical": ("IMU", "IMU", "Interpretación Musical", DIF),
    "Biología de los Ecosistemas": ("BE", "BE", "Biología de los Ecosistemas", DIF),
    "Biología Celular y Molecular": ("BCM", "BCM", "Biología Celular y Molecular", DIF),
    "Ciencias de la Salud": ("CS", "CS", "Ciencias de la Salud", DIF),
    "Física": ("FIS", "FIS", "Física", DIF),
    "Química": ("QUI", "QUI", "Química", DIF),
    "Promoción de Estilos de Vida Activos y Saludables": ("PEV", "PEV", "Promoción de Estilos de Vida Activos y Saludables", DIF),
    "Ciencias del Ejercicio Físico y Deportivo": ("CEF", "CEF", "Ciencias del Ejercicio Físico y Deportivo", DIF),
    "Expresión Corporal": ("ECO", "ECO", "Expresión Corporal", DIF),
    "Estética": ("EST", "EST", "Estética", DIF),
    "Filosofía Política": ("FPO", "FPO", "Filosofía Política", DIF),
    "Seminario de Filosofía": ("SFI", "SFI", "Seminario de Filosofía", DIF),
    "Comprensión Histórica del Presente": ("CHP", "CHP", "Comprensión Histórica del Presente", DIF),
    "Geografía, Territorio y Desafíos Socioambientales": ("GTD", "GTD", "Geografía, Territorio y Desafíos Socioambientales", DIF),
    "Economía y Sociedad": ("ESO", "ESO", "Economía y Sociedad", DIF),
    "Taller de Literatura": ("TLI", "TLI", "Taller de Literatura", DIF),
    "Lectura y Escritura Especializadas": ("LEE", "LEE", "Lectura y Escritura Especializadas", DIF),
    "Participación y Argumentación en Democracia": ("PAD", "PAD", "Participación y Argumentación en Democracia", DIF),
    "Límites, Derivadas e Integrales": ("LDI", "LDI", "Límites, Derivadas e Integrales", DIF),
    "Probabilidades y Estadística Descriptiva e Inferencial": ("PED", "PED", "Probabilidades y Estadística Descriptiva e Inferencial", DIF),
    "Pensamiento Computacional y Programación": ("PCP", "PCP", "Pensamiento Computacional y Programación", DIF),
    "Geometría 3D": ("GEO", "GEO", "Geometría 3D", DIF),
}

# Ejes que el PDF corta en dos líneas o rotula fuera de la columna.
EJES_FIJOS = {("EF", ""): "Habilidades motrices", ("EF", "motrices"): "Habilidades motrices"}
BASURA_EJE = re.compile(r"^(ú|•)|\?|New York|Literacy|^\d|^Conocimiento y comprensión$")


def canon_ejes(filas):
    por_asig = defaultdict(Counter)
    for f in filas:
        por_asig[(f["codigo"], f["fuente"])][f["eje"]] += 1
    canon = {}
    for cod, c in por_asig.items():
        buenos = [e for e, n in c.items() if e and n >= 3 and not BASURA_EJE.search(e) and re.match(r"^[A-ZÁÉÍÓÚÑ]", e)
                  and not re.search(r"\s(y|el|la|de|del|e)$", e)]
        canon[cod] = sorted(buenos, key=lambda e: -len(e))
    for f in filas:
        e = re.sub(r"\s+\d+$", "", f["eje"]).strip()
        e = re.sub(r"^Módulo\s*", "", e)
        e = EJES_FIJOS.get((f["codigo"], e), e)
        if f["codigo"] == "AR" and "2019" not in f["fuente"]:
            e = {"Expresar y crear": "Expresar y crear visualmente", "Apreciar y responder": "Apreciar y responder frente al arte"}.get(e, e)
        if f["asignatura_nombre"].startswith("Ciencias para la Ciudadanía: "):
            e = f["asignatura_nombre"].split(": ", 1)[1]
        cands = canon[(f["codigo"], f["fuente"])]
        if e and e not in cands and not BASURA_EJE.search(e):
            for c in cands:
                if c.lower() == e.lower() or c.startswith(e + " ") or c.endswith(" " + e) or e.startswith(c + " "):
                    e = c
                    break
        f["eje"] = "" if BASURA_EJE.search(e) else e
    # Sin eje: el del OA anterior del mismo curso y asignatura (o el siguiente si es el primero).
    grupos = defaultdict(list)
    for f in filas:
        grupos[(f["codigo"], f["nivel"])].append(f)
    for g in grupos.values():
        g.sort(key=lambda f: f["numero"])
        for i, f in enumerate(g):
            if not f["eje"]:
                vecinos = [x["eje"] for x in g[i - 1::-1] if x["eje"]] if i else []
                vecinos += [x["eje"] for x in g[i + 1:] if x["eje"]]
                f["eje"] = vecinos[0] if vecinos else ""
    # Variantes de mayúsculas dentro de una asignatura ("Números y Operaciones" / "Números y operaciones").
    for cod in {f["codigo"] for f in filas}:
        variantes = defaultdict(Counter)
        for f in filas:
            if f["codigo"] == cod:
                variantes[f["eje"].lower()][f["eje"]] += 1
        for f in filas:
            if f["codigo"] == cod:
                f["eje"] = variantes[f["eje"].lower()].most_common(1)[0][0]


def main():
    entrada, salida = sys.argv[1], sys.argv[2]
    filas, faltan = [], set()
    for x in csv.DictReader(open(entrada, encoding="utf-8")):
        if x["descripcion"].startswith("Cabe señalar"):
            continue
        cat = CATALOGO.get(x["asignatura_nombre"])
        if not cat:
            faltan.add(x["asignatura_nombre"])
            continue
        codigo, prefijo, nombre, area = cat
        if x["nivel"] in ("3M", "4M", "3M-4M") and codigo in ("AR", "MU", "EF"):
            # En 3° y 4° medio son del plan común electivo: asignatura propia en Metis, mismo prefijo oficial.
            codigo, area = codigo + "E", ELECT
        niveles = ["3M", "4M"] if x["nivel"] == "3M-4M" else [x["nivel"]]
        for nv in niveles:
            filas.append({"codigo": codigo, "asignatura_nombre": nombre, "prefijo": prefijo, "area": area, "nivel": nv,
                          "numero": int(x["numero"]), "eje": x["eje"], "descripcion": x["descripcion"], "fuente": x["fuente"]})
    if faltan:
        sys.exit(f"Asignaturas sin catálogo: {sorted(faltan)}")
    canon_ejes(filas)
    claves = Counter((f["codigo"], f["nivel"], f["numero"]) for f in filas)
    duplicadas = [k for k, n in claves.items() if n > 1]
    if duplicadas:
        sys.exit(f"OA duplicados: {duplicadas[:10]}")
    orden_nivel = {f"{i}B": i for i in range(1, 9)} | {f"{i}M": 8 + i for i in range(1, 5)}
    filas.sort(key=lambda f: (orden_nivel[f["nivel"]], f["codigo"], f["numero"]))
    with open(salida, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["asignatura", "asignatura_nombre", "prefijo", "area", "nivel", "numero", "eje", "descripcion", "fuente"])
        for f in filas:
            w.writerow([f["codigo"], f["asignatura_nombre"], f["prefijo"], f["area"], f["nivel"], f["numero"], f["eje"], f["descripcion"], f["fuente"]])
    print(f"{len(filas)} OA, {len({f['codigo'] for f in filas})} asignaturas -> {salida}", file=sys.stderr)


if __name__ == "__main__":
    main()
