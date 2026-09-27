"""Gera as páginas HTML dos diagramas do backend a partir dos Markdown em docs/backend.

- 17-diagramas-de-classes-e-padroes.md → diagramas-de-classes.html
- 18-diagramas-de-atividades-e-sequencias.md → diagramas-de-atividades-e-sequencias.html
- 19-diagramas-do-sistema-completo.md → diagramas-do-sistema-completo.html

O Markdown é a fonte; a página só reapresenta o mesmo conteúdo com navegação e selos.
Uso: python3 tools/diagramas/gerar_pagina.py
"""
import html
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
DOCS = RAIZ / "docs" / "backend"
MODELO = Path(__file__).with_name("pagina.html")


def contar(partes, trecho):
    return sum(p.count(trecho) for p in partes)


PAGINAS = [
    {
        "origem": "17-diagramas-de-classes-e-padroes.md",
        "destino": "diagramas-de-classes.html",
        "titulo": "Classes e padrões Renda+",
        "h1": "Classes e padrões <b>Renda+</b>",
        "numeros": lambda p: [(contar(p, 'class="mermaid"'), "diagramas"),
                              (contar(p, "selo--uso"), "técnicas em uso"),
                              (contar(p, "selo--plan"), "técnicas planejadas")],
    },
    {
        "origem": "18-diagramas-de-atividades-e-sequencias.md",
        "destino": "diagramas-de-atividades-e-sequencias.html",
        "titulo": "Fluxos do backend Renda+",
        "h1": "Atividades e sequências <b>Renda+</b>",
        "numeros": lambda p: [(contar(p, 'class="mermaid"'), "diagramas"),
                              (contar(p, "\nflowchart"), "de atividades"),
                              (contar(p, "\nsequenceDiagram"), "de sequência")],
    },
    {
        "origem": "19-diagramas-do-sistema-completo.md",
        "destino": "diagramas-do-sistema-completo.html",
        "titulo": "Mapa do sistema Renda+",
        "h1": "Sistema completo <b>Renda+</b>",
        "numeros": lambda p: [(contar(p, 'class="mermaid"'), "diagramas"),
                              (24, "módulos"),
                              (contar(p, "\nclassDiagram"), "de classes"),
                              (contar(p, "\nflowchart") + contar(p, "\nsequenceDiagram") + contar(p, "\nstateDiagram"),
                               "de fluxo e estados")],
    },
]


def inline(texto):
    t = html.escape(texto, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", t)


def slug(texto):
    t = texto.lower()
    for a, b in zip("áàâãéêíóôõúç", "aaaaeeiooouc"):
        t = t.replace(a, b)
    return "s-" + re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def celula(texto):
    conteudo = inline(texto)
    if texto.startswith("Em uso"):
        return f'<td><span class="selo selo--uso">{conteudo}</span></td>'
    if texto.startswith("Planejado"):
        return f'<td><span class="selo selo--plan">{conteudo}</span></td>'
    return f"<td>{conteudo}</td>"


def tabela(linhas):
    cab = [c.strip() for c in linhas[0].strip("|").split("|")]
    corpo = [[c.strip() for c in l.strip("|").split("|")] for l in linhas[2:]]
    th = "".join(f"<th>{inline(c)}</th>" for c in cab)
    tr = "".join("<tr>" + "".join(celula(c) for c in l) + "</tr>" for l in corpo)
    return f'<div class="tabela"><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


def converter(md):
    linhas = md.splitlines()
    partes, nav = [], []
    intro = []
    secao_aberta = False
    i = 0
    while i < len(linhas):
        l = linhas[i]
        if l.startswith("# "):
            i += 1
            continue
        if l.startswith("## "):
            if secao_aberta:
                partes.append("</section>")
                secao_aberta = False
            titulo = l[3:]
            ident = slug(titulo.split("—")[0])
            nav.append((ident, titulo, []))
            partes.append(f'<h2 class="parte" id="{ident}">{inline(titulo)}</h2>')
        elif l.startswith("### "):
            if secao_aberta:
                partes.append("</section>")
            titulo = l[4:]
            ident = slug(titulo)
            if nav:
                nav[-1][2].append((ident, titulo))
            partes.append(f'<section class="bloco" id="{ident}"><h3>{inline(titulo)}</h3>')
            secao_aberta = True
        elif l.startswith("```mermaid"):
            j = i + 1
            while not linhas[j].startswith("```"):
                j += 1
            codigo = "\n".join(linhas[i + 1:j])
            partes.append(f'<div class="diagrama"><pre class="mermaid">\n{html.escape(codigo, quote=False)}\n</pre></div>')
            i = j
        elif l.startswith("|"):
            j = i
            while j < len(linhas) and linhas[j].startswith("|"):
                j += 1
            partes.append(tabela(linhas[i:j]))
            i = j - 1
        elif l.strip():
            destino = intro if not nav else partes
            destino.append(f"<p>{inline(l)}</p>")
        i += 1
    if secao_aberta:
        partes.append("</section>")
    return intro, nav, partes


def gerar(pagina):
    intro, nav, partes = converter((DOCS / pagina["origem"]).read_text(encoding="utf-8"))

    def item(ident, titulo, subs):
        links = "".join(f'<li><a href="#{s}">{inline(t)}</a></li>' for s, t in subs)
        return f'<li><a href="#{ident}" class="nav-parte">{inline(titulo)}</a><ul>{links}</ul></li>'

    numeros = pagina["numeros"](partes)
    blocos = "".join(f"<div><strong>{n}</strong><span>{r}</span></div>" for n, r in numeros)
    html_final = (MODELO.read_text(encoding="utf-8")
                  .replace("__TITULO__", pagina["titulo"])
                  .replace("__H1__", pagina["h1"])
                  .replace("__INTRO__", "".join(intro))
                  .replace("__NUMEROS__", blocos)
                  .replace("__NAV__", "".join(item(*n) for n in nav))
                  .replace("__CONTEUDO__", "\n".join(partes)))
    (DOCS / pagina["destino"]).write_text(html_final, encoding="utf-8")
    print(", ".join(f"{n} {r}" for n, r in numeros) + f" → docs/backend/{pagina['destino']}")


def main():
    for pagina in PAGINAS:
        gerar(pagina)


if __name__ == "__main__":
    main()
