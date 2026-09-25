"""Verifica a consistência dos catálogos do B01 (docs/backend/b01).

Critérios de aceite verificáveis:
  - grafo de módulos existe e é acíclico;
  - todo formulário inicial (32 áreas do mapa 03) tem contrato completo;
  - conceitos, eventos, indicadores, recursos AN e pendências referenciados existem;
  - consumidor de evento depende do módulo produtor; comando só emite eventos do
    próprio módulo ou de módulo do qual depende;
  - indicadores sem ciclos, com política de ausentes e denominador zero;
  - regras sem dados apontam para pendência registrada com ADR existente.

Uso: python3 tools/b01/verificar_b01.py [--diagrama]
Somente biblioteca padrão.
"""
import csv
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
B01 = RAIZ / "docs" / "backend" / "b01"
MAPA_TELAS = RAIZ / "docs" / "backend" / "03-mapa-32-telas-backend.csv"
MATRIZ_AN = RAIZ / "docs" / "backend" / "08-matriz-funcionalidades-analiticas.csv"
ADR = RAIZ / "docs" / "adr"

TIPOS_CAMPO = {"texto", "codigo", "ref", "dinheiro", "quantidade", "precoUnitario", "fracao", "data",
               "instante", "competencia", "enum", "booleano", "inteiro", "anexo", "lista"}
ORIGENS = {"usuario", "sistema", "derivado", "importacao", "referencia"}
TIPOS_FORM = {"cadastro", "documento", "consulta", "painel"}
PERMISSAO = re.compile(r"^[a-z][a-z_]*\.[a-z][a-z_]*$")
COMANDO = re.compile(r"^[A-Z][A-Za-z]+$")
# Ordem dos 30 módulos da Barra lateral do design system (design-system/components/BarraLateral/README.md).
MODULOS_MENU = ["Cockpit", "Dashboard", "Cadastros", "CRM", "Vendas", "Engenharia", "Compras", "Estoque", "MRP", "Produção",
                "Projetos", "Instalações", "Equipamentos", "Renda+", "Qualidade", "Manutenção", "Pós-venda", "Financeiro",
                "Faturamento", "Fiscal", "Custos", "Contabilidade / Controladoria", "Tarefas", "BI & Relatórios", "Documentos",
                "Integrações", "Recursos Humanos", "Patrimônio", "Administração", "Configurações"]


def carregar(nome, pasta=B01):
    with open(pasta / nome, encoding="utf-8") as f:
        return json.load(f)


def ler_csv(caminho, coluna):
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        return [linha[coluna] for linha in csv.DictReader(f, delimiter=";")]


def encontrar_ciclo(grafo):
    """Retorna uma lista de nós formando ciclo, ou None. grafo: {nó: [dependências]}."""
    BRANCO, CINZA, PRETO = 0, 1, 2
    cor = {n: BRANCO for n in grafo}
    pilha = []

    def visitar(n):
        cor[n] = CINZA
        pilha.append(n)
        for d in grafo.get(n, []):
            if cor.get(d, PRETO) == CINZA:
                return pilha[pilha.index(d):] + [d]
            if cor.get(d) == BRANCO:
                ciclo = visitar(d)
                if ciclo:
                    return ciclo
        pilha.pop()
        cor[n] = PRETO
        return None

    for n in grafo:
        if cor[n] == BRANCO:
            ciclo = visitar(n)
            if ciclo:
                return ciclo
    return None


class Verificador:
    def __init__(self, catalogos, telas, recursos_an, adrs):
        self.c = catalogos
        self.telas = telas
        self.recursos_an = set(recursos_an)
        self.adrs = set(adrs)
        self.erros = []

    def erro(self, msg):
        self.erros.append(msg)

    @staticmethod
    def _ids(lista, chave, nome, erro):
        vistos = set()
        for x in lista:
            if x[chave] in vistos:
                erro(f"{nome}: identificador duplicado {x[chave]}")
            vistos.add(x[chave])
        return vistos

    def executar(self):
        modulos = self.c["modulos"]["modulos"]
        self.mod_ids = self._ids(modulos, "id", "módulos", self.erro)
        self.deps = {m["id"]: m["dependsOn"] for m in modulos}
        self.conceitos = self._ids(self.c["conceitos"]["conceitos"], "id", "conceitos", self.erro)
        self.eventos = {e["type"]: e for e in self.c["eventos"]["eventos"]}
        self._ids(self.c["eventos"]["eventos"], "type", "eventos", self.erro)
        self.indicadores = {i["id"]: i for i in self.c["indicadores"]["indicadores"]}
        self._ids(self.c["indicadores"]["indicadores"], "id", "indicadores", self.erro)
        self.pendencias = self._ids(self.c["pendencias"]["pendencias"], "id", "pendências", self.erro)

        self.verificar_modulos()
        self.verificar_conceitos()
        self.verificar_eventos()
        self.verificar_indicadores()
        self.verificar_pendencias()
        self.verificar_formularios()
        if "menu" in self.c:
            self.verificar_menu()
        return self.erros

    def depende(self, a, b):
        return a == b or b in self.deps.get(a, [])

    def verificar_modulos(self):
        for m, ds in self.deps.items():
            for d in ds:
                if d == m:
                    self.erro(f"módulo {m} depende de si mesmo")
                elif d not in self.mod_ids:
                    self.erro(f"módulo {m} depende de módulo inexistente {d}")
        ciclo = encontrar_ciclo(self.deps)
        if ciclo:
            self.erro("ciclo entre módulos: " + " → ".join(ciclo))

    def verificar_conceitos(self):
        for c in self.c["conceitos"]["conceitos"]:
            if c["modulo"] not in self.mod_ids:
                self.erro(f"conceito {c['id']}: módulo inexistente {c['modulo']}")
            for n in c.get("naoConfundirCom", []):
                if n not in self.conceitos:
                    self.erro(f"conceito {c['id']}: naoConfundirCom inexistente {n}")

    def verificar_eventos(self):
        for t, e in self.eventos.items():
            if e["produtor"] not in self.mod_ids:
                self.erro(f"evento {t}: produtor inexistente {e['produtor']}")
            if e["conceito"] not in self.conceitos:
                self.erro(f"evento {t}: conceito inexistente {e['conceito']}")
            for cons in e["consumidores"]:
                if cons not in self.mod_ids:
                    self.erro(f"evento {t}: consumidor inexistente {cons}")
                elif not self.depende(cons, e["produtor"]):
                    self.erro(f"evento {t}: consumidor {cons} não depende do produtor {e['produtor']}")

    def verificar_indicadores(self):
        grafo = {}
        for i, ind in self.indicadores.items():
            for c in ind["conceitos"]:
                if c not in self.conceitos:
                    self.erro(f"indicador {i}: conceito inexistente {c}")
            for d in ind["dependencias"]:
                if d not in self.indicadores:
                    self.erro(f"indicador {i}: dependência inexistente {d}")
            grafo[i] = [d for d in ind["dependencias"] if d in self.indicadores]
            if ind.get("missingPolicy") != "UNKNOWN":
                self.erro(f"indicador {i}: missingPolicy deve ser UNKNOWN (ausente não é zero)")
            razao = any(p in ind["unidade"] for p in ("fração", "razão"))
            if razao and ind.get("zeroDenominator") != "NOT_CALCULABLE":
                self.erro(f"indicador {i}: razão exige zeroDenominator NOT_CALCULABLE")
            if ind.get("pendencia") and ind["pendencia"] not in self.pendencias:
                self.erro(f"indicador {i}: pendência inexistente {ind['pendencia']}")
            if not ind.get("formula") or not ind.get("baseTemporal"):
                self.erro(f"indicador {i}: fórmula e base temporal obrigatórias")
        ciclo = encontrar_ciclo(grafo)
        if ciclo:
            self.erro("ciclo entre indicadores: " + " → ".join(ciclo))

    def verificar_pendencias(self):
        for p in self.c["pendencias"]["pendencias"]:
            for campo in ("pergunta", "premissaB01", "bloqueia", "responsavel"):
                if not p.get(campo):
                    self.erro(f"pendência {p['id']}: campo {campo} vazio")
            if p["adr"] not in self.adrs:
                self.erro(f"pendência {p['id']}: ADR inexistente {p['adr']}")

    def verificar_formularios(self):
        forms = self.c["formularios"]["formularios"]
        ids = [f["id"] for f in forms]
        faltando = sorted(set(self.telas) - set(ids))
        extras = sorted(set(ids) - set(self.telas))
        if faltando:
            self.erro("formulários sem contrato: " + ", ".join(faltando))
        if extras:
            self.erro("formulários fora do mapa de telas: " + ", ".join(extras))
        if len(ids) != len(set(ids)):
            self.erro("formulários duplicados")
        for f in forms:
            self.verificar_formulario(f)

    def verificar_formulario(self, f):
        fid = f["id"]
        for chave in ("versao", "nome", "tipo", "modulo", "conceito", "significado", "campos", "classificacoes",
                      "validacoes", "comandos", "indicadores", "analises", "acoes", "permissoes"):
            if chave not in f:
                self.erro(f"formulário {fid}: falta {chave}")
                return
        if f["tipo"] not in TIPOS_FORM:
            self.erro(f"formulário {fid}: tipo inválido {f['tipo']}")
        if f["modulo"] not in self.mod_ids:
            self.erro(f"formulário {fid}: módulo inexistente {f['modulo']}")
        if f["conceito"] not in self.conceitos:
            self.erro(f"formulário {fid}: conceito inexistente {f['conceito']}")
        if not f["campos"]:
            self.erro(f"formulário {fid}: sem campos")
        nomes = set()
        for cp in f["campos"]:
            self.verificar_campo(fid, cp)
            if cp["nome"] in nomes:
                self.erro(f"formulário {fid}: campo duplicado {cp['nome']}")
            nomes.add(cp["nome"])
        for v in f["validacoes"]:
            if v.get("pendencia") and v["pendencia"] not in self.pendencias:
                self.erro(f"formulário {fid}: pendência inexistente {v['pendencia']}")
        if f["tipo"] in ("cadastro", "documento") and not f["comandos"]:
            self.erro(f"formulário {fid}: cadastro/documento sem comandos")
        for cmd in f["comandos"]:
            self.verificar_comando(f, cmd)
        for i in f["indicadores"]:
            if i not in self.indicadores:
                self.erro(f"formulário {fid}: indicador inexistente {i}")
        for a in f["analises"]:
            if a not in self.recursos_an:
                self.erro(f"formulário {fid}: recurso analítico inexistente {a}")
        for p in f["permissoes"]:
            if not PERMISSAO.match(p):
                self.erro(f"formulário {fid}: permissão mal formada {p}")
        if not any(p.endswith(".read") for p in f["permissoes"]):
            self.erro(f"formulário {fid}: falta permissão de leitura")

    def verificar_campo(self, fid, cp):
        nome = cp.get("nome", "?")
        for chave in ("nome", "tipo", "obrigatorio", "origem"):
            if chave not in cp:
                self.erro(f"formulário {fid}, campo {nome}: falta {chave}")
                return
        t = cp["tipo"]
        if t not in TIPOS_CAMPO:
            self.erro(f"formulário {fid}, campo {nome}: tipo inválido {t}")
        if cp["origem"] not in ORIGENS:
            self.erro(f"formulário {fid}, campo {nome}: origem inválida {cp['origem']}")
        if t == "ref" and cp.get("conceito") not in self.conceitos:
            self.erro(f"formulário {fid}, campo {nome}: ref sem conceito válido")
        if t == "dinheiro" and cp.get("unidade") != "BRL":
            self.erro(f"formulário {fid}, campo {nome}: dinheiro exige unidade BRL")
        if t == "quantidade" and not cp.get("unidade"):
            self.erro(f"formulário {fid}, campo {nome}: quantidade exige unidade")
        if t == "precoUnitario" and cp.get("precisao") is None:
            self.erro(f"formulário {fid}, campo {nome}: preço unitário exige precisão")
        if t == "enum" and not cp.get("valores"):
            self.erro(f"formulário {fid}, campo {nome}: enum sem valores")
        if t == "lista" and not cp.get("itens"):
            self.erro(f"formulário {fid}, campo {nome}: lista sem descrição de itens")

    def verificar_comando(self, f, cmd):
        fid = f["id"]
        mod = cmd.get("modulo", f["modulo"])
        if not COMANDO.match(cmd["nome"]):
            self.erro(f"formulário {fid}: nome de comando inválido {cmd['nome']}")
        if mod not in self.mod_ids:
            self.erro(f"formulário {fid}, comando {cmd['nome']}: módulo inexistente {mod}")
            return
        if not PERMISSAO.match(cmd["permissao"]):
            self.erro(f"formulário {fid}, comando {cmd['nome']}: permissão mal formada")
        if mod == f["modulo"] and cmd["permissao"] not in f["permissoes"]:
            self.erro(f"formulário {fid}, comando {cmd['nome']}: permissão {cmd['permissao']} não declarada")
        if not cmd["eventos"]:
            self.erro(f"formulário {fid}, comando {cmd['nome']}: sem eventos")
        for ev in cmd["eventos"]:
            e = self.eventos.get(ev)
            if not e:
                self.erro(f"formulário {fid}, comando {cmd['nome']}: evento inexistente {ev}")
            elif not self.depende(mod, e["produtor"]):
                self.erro(f"formulário {fid}, comando {cmd['nome']}: {mod} não pode emitir {ev} de {e['produtor']}")


def _verificar_menu(self):
    menu = self.c["menu"]["modulos"]
    nomes = [m["nome"] for m in menu]
    if nomes != MODULOS_MENU:
        self.erro("menu: módulos diferentes da Barra lateral do design system (nomes ou ordem)")
    forms = {f["id"]: f for f in self.c["formularios"]["formularios"]}
    telas_no_menu, recursos_no_menu = set(), set()
    for m in menu:
        if not m["itens"]:
            self.erro(f"menu: módulo {m['nome']} sem itens")
        for it in m["itens"]:
            destino = [k for k in ("tela", "recurso", "acao", "nota") if it.get(k)]
            if len(destino) != 1:
                self.erro(f"menu: item {it.get('rotulo')} precisa de exatamente um destino (tela, recurso, acao ou nota)")
                continue
            if not it.get("rotulo") or not it.get("fase"):
                self.erro(f"menu: item em {m['nome']} sem rótulo ou fase")
            if it.get("tela"):
                if it["tela"] not in forms:
                    self.erro(f"menu: tela inexistente {it['tela']}")
                else:
                    telas_no_menu.add(it["tela"])
                    recursos_no_menu.update(forms[it["tela"]]["analises"])
            if it.get("recurso"):
                if it["recurso"] not in self.recursos_an:
                    self.erro(f"menu: recurso inexistente {it['recurso']}")
                recursos_no_menu.add(it["recurso"])
    for t in sorted(set(self.telas) - telas_no_menu):
        self.erro(f"menu: tela sem lugar no menu lateral: {t}")
    for a in sorted(self.recursos_an - recursos_no_menu):
        self.erro(f"menu: recurso analítico sem lugar no menu lateral: {a}")
    self.cobertura_menu = (len(telas_no_menu & set(self.telas)), len(recursos_no_menu & self.recursos_an))


Verificador.verificar_menu = _verificar_menu


def diagrama(modulos):
    linhas = ["flowchart TD"]
    for m in modulos:
        if m["id"] == "kernel":
            continue
        for d in m["dependsOn"]:
            if d in ("kernel", "plataforma", "acesso", "auditoria") and m["id"] not in ("plataforma", "auditoria", "acesso"):
                continue
            linhas.append(f"    {m['id']} --> {d}")
    return "\n".join(linhas)


def main():
    catalogos = {n: carregar(f"{n}.json") for n in ("modulos", "conceitos", "eventos", "indicadores", "pendencias", "formularios", "menu")}
    if "--diagrama" in sys.argv:
        print(diagrama(catalogos["modulos"]["modulos"]))
        return 0
    telas = ler_csv(MAPA_TELAS, "Tela ID")
    recursos = ler_csv(MATRIZ_AN, "ID")
    adrs = [p.name.split("-")[0] + "-" + p.name.split("-")[1] for p in ADR.glob("ADR-*.md")]
    verificador = Verificador(catalogos, telas, recursos, adrs)
    erros = verificador.executar()
    f = catalogos["formularios"]["formularios"]
    comandos = sum(len(x["comandos"]) for x in f)
    print(f"módulos: {len(catalogos['modulos']['modulos'])} | conceitos: {len(catalogos['conceitos']['conceitos'])} | "
          f"eventos: {len(catalogos['eventos']['eventos'])} | indicadores: {len(catalogos['indicadores']['indicadores'])} | "
          f"pendências: {len(catalogos['pendencias']['pendencias'])} | formulários: {len(f)}/{len(telas)} | comandos: {comandos}")
    if hasattr(verificador, "cobertura_menu"):
        t, a = verificador.cobertura_menu
        itens = sum(len(m["itens"]) for m in catalogos["menu"]["modulos"])
        print(f"menu lateral: {len(catalogos['menu']['modulos'])} módulos, {itens} itens | telas cobertas: {t}/{len(telas)} | recursos AN cobertos: {a}/{len(recursos)}")
    if erros:
        print(f"FALHOU: {len(erros)} problema(s)")
        for e in erros:
            print(" -", e)
        return 1
    print("OK: catálogos do B01 consistentes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
