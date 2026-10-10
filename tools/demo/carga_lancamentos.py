#!/usr/bin/env python3
"""Gera a carga dos dados reais da planilha GESTÃO IMPOSTOS — Lançamentos Mensais.

Entrada: tools/demo/lancamentos-mensais.csv (a planilha já corrigida; uma linha por lançamento). Saída:
backend/java/src/main/resources/demo/carga-lancamentos.sql, executada pelo servidor com RENDA_DEMO=lancamentos
(plataforma.demo.DemoDataLoader), depois de apagar os dados de negócio e repor os registros de sistema
(demo/base-sistema.sql).

O que a carga cria a partir da planilha:
- clientes (uma empresa por cliente; as plantas, como Amafil Pérola 2, viram unidades do cliente);
- itens (Balança Renda+, esteira, painel, unidade coletora, materiais elétricos e os serviços de montagem);
- um pedido confirmado por cliente e unidade, com uma linha e uma parcela por lançamento, e o projeto do pedido;
- equipamentos com número de série provisório (BR-AA-NNN, ES-, PE-, UC-) para as linhas de equipamento;
- um título a receber por parcela; até COMPETENCIA_FATURADA, recebido no Caixa no último dia do mês;
- uma nota por lançamento até COMPETENCIA_FATURADA (número e data a informar: PL-NNNN, último dia do mês), vinculada
  à parcela recebida;
- o histórico de receita do Simples por anexo (II produto, III serviço) antes do início da receita no Renda+;
- a apuração de cada competência até COMPETENCIA_FATURADA: PGDAS-D transmitido e DAS com o imposto da planilha
  (vence no dia 20 do mês seguinte; pago no vencimento quando vence antes de HOJE). As competências com DAS pago
  ficam encerradas; a última fica em apuração com o DAS a pagar.

O que a planilha não traz fica vazio para completar no sistema: CNPJ, endereços, contatos, NCM, número das notas.
Os identificadores são estáveis (uuid5). Uso: python3 tools/demo/carga_lancamentos.py [--verificar]
"""
import calendar
import csv
import hashlib
import json
import sys
import uuid
from collections import OrderedDict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
ENTRADA = RAIZ / "tools" / "demo" / "lancamentos-mensais.csv"
SAIDA = RAIZ / "backend" / "java" / "src" / "main" / "resources" / "demo" / "carga-lancamentos.sql"
NS = uuid.UUID("2b7f0f3c-5d1e-4c8a-9f3e-7a6b5c4d3e21")
QUEM = "carga-planilha"
# Última competência com nota emitida; as seguintes (10/2026 em diante) ficam no pedido para faturar.
COMPETENCIA_FATURADA = "2026-09"
# Primeira competência com a receita pelas notas (RENDA_FISCAL_REVENUE_START); antes dela vale o histórico.
INICIO_RECEITA = "2026-09"
# Data da carga: DAS que vence antes dela já está pago.
HOJE = "2026-10-10"
# Registros de sistema da base (demo/base-sistema.sql): conta Caixa e beneficiário do DAS.
CAIXA = "00000000-0000-0000-0000-00000000ca01"
RECEITA_FEDERAL = "00000000-0000-0000-0000-0000000000da"
ORIGEM_PARCELA = "SALES_ORDER_INSTALLMENT"
ORIGEM_DAS = "TAX_PERIOD"
out = []


def uid(*partes):
    return str(uuid.uuid5(NS, ":".join(str(p) for p in partes)))


def q(v):
    """Literal SQL."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def ins(tabela, linhas):
    if not linhas:
        return
    cols = list(linhas[0].keys())
    out.append(f"insert into {tabela} ({', '.join(cols)}) values")
    out.append(",\n".join("  (" + ", ".join(q(l[c]) for c in cols) + ")" for l in linhas) + ";")
    out.append("")


def sec(titulo):
    out.append(f"-- {titulo} " + "-" * max(0, 110 - len(titulo)))
    out.append("")


def ts(d, hora="09:00"):
    return f"{d} {hora}:00-03"


def cents(texto):
    """'165.000,00' → 16500000."""
    t = texto.strip().replace(".", "").replace(",", ".")
    return int(round(float(t) * 100))


def brl(c):
    s = f"{c / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {s}"


def ultimo_dia(comp):
    y, m = int(comp[:4]), int(comp[5:])
    return f"{comp}-{calendar.monthrange(y, m)[1]:02d}"


def mes_seguinte(comp):
    y, m = int(comp[:4]), int(comp[5:])
    return f"{y + 1}-01" if m == 12 else f"{y}-{m + 1:02d}"


def meses(de, ate):
    y, m = int(de[:4]), int(de[5:])
    while f"{y}-{m:02d}" <= ate:
        yield f"{y}-{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


# Planilha --------------------------------------------------------------------------------------------------------

def ler():
    with ENTRADA.open(encoding="utf-8") as f:
        linhas = list(csv.DictReader(f, delimiter=";"))
    lanc = []
    for n, l in enumerate(linhas, start=2):
        mm, aaaa = l["Competência"].split("/")
        r = dict(linha=n, comp=f"{aaaa}-{mm}", desc=l["Descrição"], cliente=l["Cliente"], unidade=l["Unidade"] or None,
                 categoria=l["Categoria"], tipo=l["Tipo"], valor=cents(l["Valor (R$)"]), aliquota=l["Alíquota efetiva"],
                 imposto=cents(l["Imposto (R$)"]), custo=[cents(l[k]) for k in ("Custo mat. elétrico (R$)", "Custo mat. mecânico (R$)",
                                                                                  "Custo mtg. elétrica (R$)", "Custo mtg. mecânica (R$)")],
                 custo_total=cents(l["Custo total (R$)"]), resultado=cents(l["Resultado líquido (R$)"]),
                 socios=[cents(l[k]) for k in ("Sergio (R$)", "Everton (R$)", "Edson (R$)", "Rafael (R$)", "Caixa (R$)")],
                 obs=l["Observação"] or None)
        # A conta da planilha precisa fechar: custo total = soma dos custos; resultado = valor − imposto − custo.
        erros = []
        if sum(r["custo"]) != r["custo_total"]:
            erros.append("custo total diferente da soma dos custos")
        if r["valor"] - r["imposto"] - r["custo_total"] != r["resultado"]:
            erros.append("resultado diferente de valor − imposto − custo total")
        aliq = float(r["aliquota"].rstrip("%").replace(",", ".")) / 100
        if abs(r["valor"] * aliq - r["imposto"]) > 10:  # até R$ 0,10 pelo arredondamento da alíquota exibida
            erros.append("imposto diferente de valor × alíquota")
        if erros:
            raise SystemExit(f"{ENTRADA.name}, linha {n}: " + "; ".join(erros))
        lanc.append(r)
    return lanc


# Cadastros --------------------------------------------------------------------------------------------------------

# Cidade e UF das plantas cujo nome é um município conhecido do Paraná; as demais ficam para completar.
CIDADE_DA_UNIDADE = {"Cidade Gaúcha": ("Cidade Gaúcha", "PR"), "Maria Helena": ("Maria Helena", "PR"), "Pérola 1": ("Pérola", "PR"),
                     "Pérola 2": ("Pérola", "PR"), "Altônia": ("Altônia", "PR"), "Terra Boa": ("Terra Boa", "PR"),
                     "Terra Roxa": ("Terra Roxa", "PR")}

# código, descrição, categoria, tipo, UM, custo de referência, observação
CATEGORIAS = [("BAL", "Balanças Renda+", "PRODUTO"), ("MEC", "Mecânica — esteiras e coletores", "PRODUTO"),
              ("ELE", "Elétrica — painéis e materiais", "PRODUTO"), ("SMC", "Montagem e instalação mecânica", "SERVICO"),
              ("SEL", "Montagem e instalação elétrica", "SERVICO")]
ITENS = [
    ("P00001", "Balança Renda+", "BAL", "PRODUTO", "UN", "70000.00",
     "Custo de referência por balança (planilha): materiais elétricos R$ 30.022,60; materiais mecânicos R$ 20.477,40; "
     "montagem elétrica R$ 11.500,00; montagem mecânica R$ 8.000,00."),
    ("P00002", "Esteira transportadora", "MEC", "PRODUTO", "UN", None, "Medidas na descrição do pedido (ex.: 400x4500, com desviador)."),
    ("P00003", "Painel elétrico", "ELE", "PRODUTO", "UN", None, None),
    ("P00004", "Unidade coletora de raízes", "MEC", "PRODUTO", "UN", None, None),
    ("P00005", "Materiais elétricos", "ELE", "MATERIAL", "UN", None, "Venda avulsa de materiais."),
    ("S00001", "Montagem e instalação mecânica", "SMC", "SERVICO", "SV", None, None),
    ("S00002", "Montagem e instalação elétrica", "SEL", "SERVICO", "SV", None, None),
]
# Modelo e prefixo da série dos itens que viram equipamento.
MODELOS = OrderedDict([("P00001", ("MD00001", "Balança Renda+", "BR")), ("P00002", ("MD00002", "Esteira transportadora", "ES")),
                       ("P00003", ("MD00003", "Painel elétrico", "PE")), ("P00004", ("MD00004", "Unidade coletora de raízes", "UC"))])


def classificar(r):
    """Tipo da linha do pedido e item do lançamento."""
    d = r["desc"].lower()
    if r["categoria"] == "BALANÇA RENDA+":
        return "EQUIPAMENTO", "P00001"
    if r["tipo"] == "SERVIÇO":
        return "SERVICO", "S00001" if r["categoria"] == "MECÂNICA" else "S00002"
    if "esteira" in d:
        return "EQUIPAMENTO", "P00002"
    if "painel" in d:
        return "EQUIPAMENTO", "P00003"
    if "coletora" in d:
        return "EQUIPAMENTO", "P00004"
    if "materiais" in d:
        return "MATERIAL", "P00005"
    return "MATERIAL", None  # montagem lançada como produto: sem item, conferir


def cadastros(lanc):
    sec("Unidade de serviço, categorias e itens")
    out.append("insert into unit_of_measure (code, name, quantity_kind, decimals) values ('SV', 'Serviço', 'QUANTIDADE', 0) "
               "on conflict (code) do nothing;")
    out.append("")
    ins("item_category", [dict(id=uid("category", c), code=c, name=n, parent_name=None, applies_to=a, status="ATIVO", version=1,
                               created_at=ts("2025-03-01"), created_by=QUEM) for c, n, a in CATEGORIAS])
    itens = []
    for c, d, cat, tipo, um, custo, obs in ITENS:
        servico = tipo == "SERVICO"
        perfil = dict(salesItem=True, traceability="Número de série" if c in MODELOS else "Nenhuma", notes=obs)
        itens.append(dict(id=uid("item", c), code=c, description=d, nature="SERVICO" if servico else "MATERIAL", item_type=tipo,
                          uom_code=um, category_id=uid("category", cat), stock_controlled=False, reference_cost=custo, ncm=None,
                          service_code=None, status="ATIVO", profile={k: v for k, v in perfil.items() if v is not None}, version=1,
                          created_at=ts("2025-03-01"), created_by=QUEM, updated_at=ts("2025-03-01"), updated_by=QUEM))
    ins("item", itens)

    sec("Clientes e unidades (CNPJ, endereço e contatos a completar)")
    clientes = OrderedDict()
    for r in sorted(lanc, key=lambda x: (x["comp"], x["linha"])):
        clientes.setdefault(r["cliente"], [])
        if r["unidade"] and r["unidade"] not in clientes[r["cliente"]]:
            clientes[r["cliente"]].append(r["unidade"])
    partner, role, unit = [], [], []
    codigo = {}
    for n, (nome, plantas) in enumerate(clientes.items(), start=1):
        cod = f"C{n:05d}"
        codigo[nome] = cod
        primeiro = min(r["comp"] for r in lanc if r["cliente"] == nome)
        criado = ts(f"{primeiro}-01")
        pid = uid("partner", nome)
        partner.append(dict(id=pid, code=cod, legal_name=nome, trade_name=nome, cnpj=None, group_name=None,
                            supplier_lead_time_days=None, supplier_payment_terms=None, status="ATIVO",
                            profile={"notes": "Cadastro da planilha de lançamentos mensais: completar razão social, CNPJ, endereço e contatos."},
                            version=1, created_at=criado, created_by=QUEM, updated_at=criado, updated_by=QUEM))
        role.append(dict(partner_id=pid, role="CLIENTE", status="ATIVO", since=criado))
        unit.append(dict(id=uid("unit", nome, None), partner_id=pid, position=0, name="Matriz", street=None, number=None, district=None,
                         city=None, state=None, postal_code=None, cnpj=None, kind="COBRANCA", is_default=True))
        for i, p in enumerate(plantas, start=1):
            cid, uf = CIDADE_DA_UNIDADE.get(p, (None, None))
            unit.append(dict(id=uid("unit", nome, p), partner_id=pid, position=i, name=p, street=None, number=None, district=None,
                             city=cid, state=uf, postal_code=None, cnpj=None, kind="UNIDADE", is_default=False))
    ins("partner", partner)
    ins("partner_role", role)
    ins("partner_unit", unit)
    out.append(f"select setval('customer_code_seq', {len(clientes)}), setval('material_code_seq', 5), setval('service_code_seq', 2);")
    out.append("")
    return codigo


# Pedidos, projetos, equipamentos e notas -------------------------------------------------------------------------

def etapa_do_projeto(ultima):
    if ultima < COMPETENCIA_FATURADA:
        return "ACEITO"
    if ultima == COMPETENCIA_FATURADA:
        return "INSTALACAO"
    return "PRODUCAO" if ultima == "2026-10" else "ENGENHARIA"


def negocios(lanc, codigo):
    sec("Modelos de equipamento")
    ins("equipment_model", [dict(id=uid("model", c), code=c, name=n, status="ATIVO", version=1, created_at=ts("2025-03-01"), created_by=QUEM)
                            for c, n, _ in MODELOS.values()])

    # Um pedido por cliente e unidade, na ordem do primeiro lançamento.
    grupos = OrderedDict()
    for r in sorted(lanc, key=lambda x: (x["comp"], x["linha"])):
        grupos.setdefault((r["cliente"], r["unidade"]), []).append(r)

    pedidos, linhas, parcelas, projetos, equips, docs, dlinhas = [], [], [], [], [], [], []
    serie = {}
    n_doc = 0
    for n, ((cli, und), rs) in enumerate(grupos.items(), start=1):
        cod = f"PV-{n:06d}"
        oid, pjid = uid("so", cod), uid("project", cod)
        pid, unid = uid("partner", cli), uid("unit", cli, und)
        nome_unid = und or "Matriz"
        inicio, fim = rs[0]["comp"], max(r["comp"] for r in rs)
        contrato, entrega = f"{inicio}-01", ultimo_dia(fim)
        linha_de = {}
        pos = 0
        for r in rs:
            kind, item = classificar(r)
            r["kind"] = kind
            # Complemento da balança: soma na linha da balança do mesmo pedido (um equipamento só).
            if r["obs"] and r["obs"].startswith("Complemento") and ("P00001" in linha_de):
                lid = linha_de["P00001"]
                l = next(x for x in linhas if x["id"] == lid)
                l["line_total_cents"] += r["valor"]
                l["unit_price"] = f"{l['line_total_cents'] / 100:.2f}"
                r["line_id"] = lid
                continue
            pos += 1
            lid = uid("sol", cod, pos)
            r["line_id"] = lid
            if item:
                linha_de.setdefault(item, lid)
            linhas.append(dict(id=lid, order_id=oid, position=pos, kind=kind, item_id=uid("item", item) if item else None,
                               description=r["desc"][:200], quantity="1", uom="SV" if kind == "SERVICO" else "UN",
                               unit_price=f"{r['valor'] / 100:.2f}", discount_cents=0, line_total_cents=r["valor"]))
            if kind == "EQUIPAMENTO":
                mcod, mnome, pre = MODELOS[item]
                ano = r["comp"][2:4]
                serie[(pre, ano)] = serie.get((pre, ano), 0) + 1
                numero = f"{pre}-{ano}-{serie[(pre, ano)]:03d}"
                equips.append(dict(id=uid("equip", cod, pos), code=f"EQ{len(equips) + 1:05d}", project_id=pjid, order_line_id=lid, line_seq=1,
                                   model=mnome, model_id=uid("model", mcod), item_id=uid("item", item), customer_id=pid, unit_id=unid,
                                   unit_name=nome_unid, serial_number=numero,
                                   notes=f"{r['desc']}. Número de série provisório gerado na carga da planilha: trocar pelo da plaqueta.",
                                   status="ATIVO", accepted_on=None, warranty_start=None, version=1, created_at=ts(contrato, "10:30"),
                                   created_by=QUEM))
        for k, r in enumerate(rs, start=1):
            r.update(order_id=oid, order_code=cod, seq=k, parcelas=len(rs), pid=pid, pjid=pjid, contrato=contrato)
            parcelas.append(dict(order_id=oid, seq=k, due_date=ultimo_dia(r["comp"]), amount_cents=r["valor"],
                                 milestone=f"{r['desc'][:150]} — {r['comp'][5:]}/{r['comp'][:4]}"))
        total = sum(r["valor"] for r in rs)
        assert total == sum(l["line_total_cents"] for l in linhas if l["order_id"] == oid)
        rotulo = f"{cli}" + (f" — {und}" if und else "")
        principal = next((r for r in rs if r["categoria"] == "BALANÇA RENDA+"), next((r for r in rs if r["kind"] == "EQUIPAMENTO"), rs[0]))
        obs = [r["obs"] for r in rs if r["obs"]]
        notas = ("Pedido montado da planilha de lançamentos mensais: datas de contrato e entrega pela competência dos lançamentos. "
                 + " ".join(obs)).strip()[:1000]
        pedidos.append(dict(id=oid, code=cod, customer_id=pid, unit_id=unid, unit_name=nome_unid, proposal_id=None, proposal_revision=None,
                            contract_date=contrato, promised_date=entrega, notes=notas, status="CONFIRMED", total_cents=total,
                            confirmed_at=ts(contrato, "15:00"), confirmed_by=QUEM, snapshot_hash=hashlib.sha256(cod.encode()).hexdigest(),
                            project_id=pjid, cancelled_at=None, cancelled_by=None, cancel_reason=None, version=2,
                            created_at=ts(contrato, "11:00"), created_by=QUEM, updated_at=ts(contrato, "15:00"), updated_by=QUEM))
        projetos.append(dict(id=pjid, code=f"PJ{n:05d}", name=f"{principal['desc'].split(' — ')[0]} — {rotulo}"[:200], order_id=oid,
                             order_code=cod, customer_id=pid, unit_id=unid, unit_name=nome_unid, stage=etapa_do_projeto(fim),
                             contract_delivery=entrega, contract_cents=total, closed_reason=None, version=1, created_at=ts(contrato, "15:00"),
                             created_by=QUEM))
        # Uma nota por lançamento já faturado.
        for r in rs:
            if r["comp"] > COMPETENCIA_FATURADA:
                continue
            n_doc += 1
            did = uid("doc", n_doc)
            r["doc_id"] = did
            servico = r["tipo"] == "SERVIÇO"
            dia = ultimo_dia(r["comp"])
            docs.append(dict(id=did, code=f"DF{n_doc:05d}", direction="SAIDA", partner_id=pid, series="NFS" if servico else "1",
                             number=f"PL-{n_doc:04d}", issue_date=dia, competence=r["comp"], total_cents=r["valor"], linked_cents=r["valor"],
                             notes="Nota da planilha de lançamentos: informar o número e a data de emissão reais.",
                             operation_nature="PRESTACAO_SERVICO" if servico else "VENDA_PRODUCAO", project_id=pjid, classification_rev=1,
                             status="ATIVO", cancel_reason=None, version=1, created_at=ts(dia, "16:00"), created_by=QUEM, order_id=oid,
                             authorization_status="AUTORIZADA", authorization_protocol=None))
            item = classificar(r)[1]
            dlinhas.append(dict(document_id=did, seq=1, description=r["desc"][:200], kind="SERVICO" if servico else "PRODUTO",
                                amount_cents=r["valor"], item_id=uid("item", item) if item else None, annex="III" if servico else "II",
                                annex_source="PADRAO"))
    ins("sales_order", pedidos)
    ins("sales_order_line", linhas)
    ins("sales_order_installment", parcelas)
    ins("project", projetos)
    ins("equipment", equips)
    sec(f"Notas de saída dos lançamentos até {COMPETENCIA_FATURADA[5:]}/{COMPETENCIA_FATURADA[:4]} (número e data a informar)")
    ins("business_document", docs)
    ins("document_line", dlinhas)
    out.append(f"select setval('sales_order_code_seq', {len(pedidos)}), setval('project_code_seq', {len(projetos)}), "
               f"setval('equipment_code_seq', {len(equips)}), setval('equipment_model_code_seq', {len(MODELOS)}), "
               f"setval('business_document_code_seq', {n_doc});")
    out.append("")


# Financeiro -------------------------------------------------------------------------------------------------------

class Liquidacoes:
    """Recebimentos e pagamentos no Caixa: liquidação, alocação e movimento de caixa."""

    def __init__(self):
        self.liq, self.aloc, self.movs = [], [], []
        self.seq = {"RC": 0, "PG": 0}

    def liquidar(self, direcao, titulo_id, parte, valor, dia, rotulo):
        pre = "RC" if direcao == "RECEIVABLE" else "PG"
        self.seq[pre] += 1
        cod = f"{pre}{self.seq[pre]:05d}"
        sid = uid("liq", cod)
        self.liq.append(dict(id=sid, code=cod, direction=direcao, account_id=CAIXA, counterparty_id=parte, effective_date=dia, total_cents=valor,
                             credit_cents=0, notes=rotulo, status="POSTED", version=1, created_at=ts(dia, "11:00"), created_by=QUEM))
        self.aloc.append(dict(settlement_id=sid, title_id=titulo_id, amount_cents=valor))
        self.movs.append(dict(id=uid("mov", cod), account_id=CAIXA, effective_date=dia, amount_cents=valor if direcao == "RECEIVABLE" else -valor,
                              kind="SETTLEMENT", settlement_id=sid, reverses_id=None, transfer_id=None,
                              description=("Recebimento " if direcao == "RECEIVABLE" else "Pagamento ") + cod, created_at=ts(dia, "11:00"),
                              created_by=QUEM))


def titulo(cod, direcao, parte, origem, origem_id, rotulo, projeto, categoria, competencia, emissao, venc, valor, recebido):
    return dict(id=uid("titulo", cod), code=cod, direction=direcao, counterparty_id=parte, origin_type=origem, origin_id=origem_id,
                origin_label=rotulo[:200], project_id=projeto, category=categoria, competence=competencia, issue_date=emissao, due_date=venc,
                original_cents=valor, received_cents=recebido, lifecycle="ACTIVE", cancel_reason=None, document_number=None, notes=None,
                version=2 if recebido else 1, created_at=ts(emissao), created_by=QUEM)


def financeiro(lanc, liq):
    sec(f"Contas a receber: um título por parcela; recebidas no Caixa as parcelas até {COMPETENCIA_FATURADA[5:]}/{COMPETENCIA_FATURADA[:4]}")
    titulos, links, faturado = [], [], []
    for n, r in enumerate(sorted(lanc, key=lambda x: (x["order_code"], x["seq"])), start=1):
        cod = f"CR{n:05d}"
        venc = ultimo_dia(r["comp"])
        recebida = r["comp"] <= COMPETENCIA_FATURADA
        rotulo = f"Pedido {r['order_code']} — parcela {r['seq']}/{r['parcelas']} — {r['desc'][:150]} — {r['comp'][5:]}/{r['comp'][:4]}"
        t = titulo(cod, "RECEIVABLE", r["pid"], ORIGEM_PARCELA, f"{r['order_id']}:{r['seq']}", rotulo, r["pjid"], "RECEITA_VENDA", r["comp"],
                   r["contrato"], venc, r["valor"], r["valor"] if recebida else 0)
        titulos.append(t)
        if recebida:
            liq.liquidar("RECEIVABLE", t["id"], r["pid"], r["valor"], venc, f"Recebimento da parcela {r['seq']} do pedido {r['order_code']}")
            links.append(dict(id=uid("link", cod), document_id=r["doc_id"], title_id=t["id"], amount_cents=r["valor"], status="ATIVO",
                              removed_reason=None, removed_at=None, removed_by=None, created_at=ts(venc, "16:00"), created_by=QUEM))
            faturado.append(dict(title_id=t["id"], limit_cents=r["valor"], invoiced_cents=r["valor"]))
    ins("financial_title", titulos)
    out.append("-- Notas vinculadas às parcelas recebidas (todo o recebido já faturado).")
    ins("document_title_link", links)
    ins("document_title_invoicing", faturado)
    return len(titulos)


# Fiscal -----------------------------------------------------------------------------------------------------------

def fiscal(lanc):
    sec("Fiscal: receita por anexo antes do início da receita no Renda+ (alíquota e imposto da planilha nas observações)")
    primeiro = min(r["comp"] for r in lanc)
    hist = []
    for m in meses(primeiro, max(r["comp"] for r in lanc)):
        if m >= INICIO_RECEITA:
            break
        rs = [r for r in lanc if r["comp"] == m]
        prod = sum(r["valor"] for r in rs if r["tipo"] == "PRODUTO")
        serv = sum(r["valor"] for r in rs if r["tipo"] == "SERVIÇO")
        if rs:
            aliq = {t: sorted({r["aliquota"] for r in rs if r["tipo"] == t}) for t in ("PRODUTO", "SERVIÇO")}
            partes = [f"alíquota efetiva {'produto' if t == 'PRODUTO' else 'serviço'} {', '.join(a)}" for t, a in aliq.items() if a]
            nota = f"Planilha de lançamentos: {'; '.join(partes)}; imposto {brl(sum(r['imposto'] for r in rs))}."
        else:
            nota = "Sem lançamentos na planilha neste mês: conferir com o contador."
        hist.append(dict(competence=m, annex1_cents=0, annex2_cents=prod, annex3_cents=serv, annex4_cents=0, annex5_cents=0, source="DIGITADO",
                         informed_by="Planilha de lançamentos", notes=nota, version=1, created_at=ts(f"{m}-01"), created_by=QUEM))
    ins("tax_revenue_history", hist)


def apuracao(lanc, liq):
    sec("Fiscal: apuração por competência — PGDAS-D transmitido e DAS com o imposto da planilha; encerradas as de DAS pago")
    periodos, declaracoes, guias, das, fechamentos = [], [], [], [], []
    for m in meses(min(r["comp"] for r in lanc), COMPETENCIA_FATURADA):
        rs = [r for r in lanc if r["comp"] == m]
        receita = sum(r["valor"] for r in rs)
        servico = sum(r["valor"] for r in rs if r["tipo"] == "SERVIÇO")
        imposto = sum(r["imposto"] for r in rs)
        rotulo = f"{m[5:]}/{m[:4]}"
        venc = f"{mes_seguinte(m)}-20"
        transmitido = min(f"{mes_seguinte(m)}-10", HOJE)
        pago = venc < HOJE
        pid = uid("periodo", m)
        periodos.append(dict(id=pid, competence=m, status="ENCERRADA" if pago else "EM_APURACAO", informed_rbt12_cents=None, informed_by=None,
                             informed_notes=None, version=3 if pago else 2, created_at=ts(f"{m}-01"), created_by=QUEM,
                             updated_at=ts(transmitido, "17:00"), updated_by=QUEM))
        declaracoes.append(dict(id=uid("pgdas", m), period_id=pid, seq=1, transmitted_on=transmitido, receipt_number="A informar",
                                declared_revenue_cents=receita, notes="PGDAS-D da planilha de lançamentos: informar o número do recibo.",
                                created_at=ts(transmitido, "10:00"), created_by=QUEM))
        guia_id = None
        if imposto > 0:
            guia_id = uid("das", m)
            t = titulo(f"CP{len(das) + 1:05d}", "PAYABLE", RECEITA_FEDERAL, ORIGEM_DAS, f"{m}:1", f"DAS {rotulo}", None, "IMPOSTOS_SIMPLES", m,
                       transmitido, venc, imposto, imposto if pago else 0)
            das.append(t)
            guias.append(dict(id=guia_id, period_id=pid, seq=1, document_number=None, amount_cents=imposto, fine_cents=0, interest_cents=0,
                              due_date=venc, notes="DAS com o imposto da planilha de lançamentos.", simulation_id=None, title_id=t["id"],
                              created_at=ts(transmitido, "10:30"), created_by=QUEM))
            if pago:
                liq.liquidar("PAYABLE", t["id"], RECEITA_FEDERAL, imposto, venc, f"Pagamento do DAS {rotulo}")
        if pago:
            fechamentos.append(dict(id=uid("fechamento", m), period_id=pid, action="FECHAMENTO", reason=None,
                                    product_revenue_cents=receita - servico, service_revenue_cents=servico, simulation_id=None,
                                    confirmation_id=guia_id, occurred_at=ts(venc, "17:00"), actor=QUEM))
    ins("tax_period", periodos)
    ins("tax_pgdas_declaration", declaracoes)
    ins("financial_title", das)
    ins("tax_das_guide", guias)
    ins("tax_period_closure", fechamentos)
    return len(das)


def liquidacoes(lanc, liq, n_receber, n_pagar):
    sec("Recebimentos e pagamentos no Caixa (conta aberta no primeiro mês da planilha)")
    out.append(f"update bank_account set opening_on = '{min(r['comp'] for r in lanc)}-01' where id = '{CAIXA}';")
    out.append("")
    ins("settlement", liq.liq)
    ins("settlement_allocation", liq.aloc)
    ins("cash_movement", liq.movs)
    out.append(f"select setval('receivable_code_seq', {n_receber}), setval('payable_code_seq', {n_pagar}), "
               f"setval('settlement_code_seq', {max(liq.seq['RC'], 1)}, {str(liq.seq['RC'] > 0).lower()}), "
               f"setval('payment_code_seq', {max(liq.seq['PG'], 1)}, {str(liq.seq['PG'] > 0).lower()});")
    out.append("")


def gerar():
    lanc = ler()
    out.append("-- Dados reais da planilha GESTÃO IMPOSTOS — Lançamentos Mensais (tools/demo/lancamentos-mensais.csv). Gerado por")
    out.append("-- tools/demo/carga_lancamentos.py; não edite à mão. Executada pelo servidor com RENDA_DEMO=lancamentos, depois de apagar os")
    out.append("-- dados de negócio e repor os registros de sistema (demo/base-sistema.sql).")
    out.append("")
    codigo = cadastros(lanc)
    negocios(lanc, codigo)
    liq = Liquidacoes()
    n_receber = financeiro(lanc, liq)
    fiscal(lanc)
    n_pagar = apuracao(lanc, liq)
    liquidacoes(lanc, liq, n_receber, n_pagar)
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    texto = gerar()
    if "--verificar" in sys.argv:
        if not SAIDA.exists() or SAIDA.read_text(encoding="utf-8") != texto:
            print("carga-lancamentos.sql desatualizado: rode python3 tools/demo/carga_lancamentos.py")
            sys.exit(1)
        print("carga-lancamentos.sql em dia")
    else:
        SAIDA.parent.mkdir(parents=True, exist_ok=True)
        SAIDA.write_text(texto, encoding="utf-8")
        print(f"{SAIDA.relative_to(RAIZ)}: {len(texto.splitlines())} linhas")
