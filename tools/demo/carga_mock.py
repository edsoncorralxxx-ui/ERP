#!/usr/bin/env python3
"""Gera a carga de demonstração com os dados do mock Renda+ ERP MOCK (Sprint 13).

Saída: backend/java/src/main/resources/demo/carga-mock.sql, executada pelo servidor quando RENDA_DEMO=recarregar
(plataforma.demo.DemoDataLoader), depois de apagar os dados de negócio. Os identificadores são estáveis (uuid5), para
a mesma carga gerar sempre os mesmos registros. Uso: python3 tools/demo/carga_mock.py [--verificar]
"""
import hashlib
import json
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "backend" / "java" / "src" / "main" / "resources" / "demo" / "carga-mock.sql"
FISCAL = json.loads((RAIZ / "docs" / "scrum" / "sprints" / "exemplos" / "fiscal-exemplo.json").read_text(encoding="utf-8"))
NS = uuid.UUID("6f1c6c2e-8d8e-4c55-9a9b-2f0d6e4a1301")
QUEM = "carga-mock"
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


def digitos(s):
    return "".join(c for c in s if c.isalnum())


def cnpj_valido(fmt):
    """CNPJ do mock com os dígitos verificadores corrigidos (o mock usa números fictícios com DV inválido)."""
    base = digitos(fmt)[:12]
    def dv(nums, pesos):
        r = sum(int(n) * p for n, p in zip(nums, pesos)) % 11
        return "0" if r < 2 else str(11 - r)
    d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    d2 = dv(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
    return base + d1 + d2


def cents(v):
    return int(round(float(v) * 100))


# Colaboradores -----------------------------------------------------------------------------------------------------

COLABORADORES = [
    ("0101", "Carlos Eduardo Pereira", "Comercial", "Executivo de vendas — MS", "1.3 Comercial", "2021-02-03"),
    ("0102", "Aline Santos", "Engenharia", "Projetista de automação", "2.1 Engenharia", "2022-06-15"),
    ("0103", "Rafael Lima", "Comercial", "Executivo de vendas — PR", "1.3 Comercial", "2023-01-10"),
    ("0104", "Beatriz Costa", "Financeiro", "Analista financeira", "1.2 Financeiro", "2020-08-01"),
    ("0105", "Lucas Fernandes", "Qualidade", "Técnico de metrologia", "3.4 Qualidade", "2024-03-20"),
    ("0106", "Patrícia Gomes", "Comercial", "Gerente comercial", "1.3 Comercial", "2019-11-05"),
    ("0107", "Diego Moreira", "Instalações", "Técnico de campo", "4.1 Instalação", "2022-07-12"),
]


def colaboradores():
    sec("Colaboradores")
    ins("employee", [dict(id=uid("employee", c), code=c, name=n, department=d, job_title=f, cost_center=cc, admission_date=a,
                          email=n.split()[0].lower().replace("í", "i").replace("á", "a") + "@renda.ind.br", phone=None,
                          status="ATIVO", version=1, created_at=ts(a), created_by=QUEM, updated_at=ts(a), updated_by=QUEM)
                     for c, n, d, f, cc, a in COLABORADORES])


# Tabelas auxiliares ------------------------------------------------------------------------------------------------

UNIDADES = [("UN", "Unidade", "QUANTIDADE", 0, True), ("KIT", "Kit", "QUANTIDADE", 0, True), ("CX", "Caixa", "QUANTIDADE", 0, True),
            ("KG", "Quilograma", "MASSA", 3, True), ("M", "Metro", "COMPRIMENTO", 3, True), ("M2", "Metro quadrado", "AREA", 3, True),
            ("L", "Litro", "VOLUME", 3, True), ("H", "Hora", "TEMPO", 2, True), ("MES", "Mês", "TEMPO", 0, True),
            ("SV", "Serviço", "QUANTIDADE", 0, True), ("PC", "Peça", "QUANTIDADE", 0, False), ("T", "Tonelada", "MASSA", 3, True)]

# código, descrição, superior, aplica-se a
CATEGORIAS = [("BAL", "Balanças de renda", None, "PRODUTO"), ("COL", "Coletores", "Balanças de renda", "PRODUTO"),
              ("PNL", "Painéis e automação", None, "PRODUTO"), ("ACS", "Acessórios", None, "PRODUTO"),
              ("REP", "Peças de reposição", None, "PRODUTO"), ("CHP", "Chapas", "Aço inox", "MATERIAL"),
              ("INS", "Instrumentação", None, "MATERIAL"), ("PNE", "Pneumática", None, "MATERIAL"),
              ("ELE", "Elétricos", None, "MATERIAL"), ("SVI", "Instalação", None, "SERVICO"),
              ("AFR", "Aferição", None, "SERVICO"), ("MAN", "Manutenção", None, "SERVICO"),
              # Usadas pelos itens do mock, fora da tabela de categorias desenhada.
              ("TUB", "Tubos", "Aço inox", "MATERIAL"), ("FIX", "Fixadores", None, "MATERIAL"),
              ("AST", "Assistência", None, "SERVICO"), ("TRN", "Treinamento", None, "SERVICO"), ("CTR", "Contratos", None, "SERVICO")]

AUXILIARES = {
    "MARCA": [("RDP", "Renda+", {"manufacturer": "Fabricação própria", "country": "Brasil"}),
              ("MRC1", "[MARCA DA CÉLULA DE CARGA]", {"manufacturer": "[FABRICANTE 1]", "country": "Brasil"}),
              ("MRC2", "[MARCA DO CLP]", {"manufacturer": "[FABRICANTE 2]", "country": "Alemanha"}),
              ("MRC3", "[MARCA PNEUMÁTICA]", {"manufacturer": "[FABRICANTE 3]", "country": "Japão"})],
    "BANCO": [("[000]", "[BANCO PRINCIPAL]", {"agency": "[0000]", "account": "[00000-0]", "usage": "Recebimentos"}),
              ("[000]", "[BANCO 2]", {"agency": "[0000]", "account": "[00000-0]", "usage": "Pagamentos"}),
              ("[000]", "[BANCO 3]", {"agency": "[0000]", "account": "[00000-0]", "usage": "Aplicações"})],
    "CONDICAO_PAGAMENTO": [
        ("AV", "À vista", {"installments": 1, "firstDueDays": 0, "intervalDays": 0, "earlyDiscountPercent": "0.00"}),
        ("15", "15 dias", {"installments": 1, "firstDueDays": 15, "intervalDays": 0, "earlyDiscountPercent": "0.00"}),
        ("28", "28 dias", {"installments": 1, "firstDueDays": 28, "intervalDays": 0, "earlyDiscountPercent": "0.00"}),
        ("30", "30 dias", {"installments": 1, "firstDueDays": 30, "intervalDays": 0, "earlyDiscountPercent": "1.00"}),
        ("3060", "30/60 dias", {"installments": 2, "firstDueDays": 30, "intervalDays": 30, "earlyDiscountPercent": "0.00"}),
        ("306090", "30/60/90 dias", {"installments": 3, "firstDueDays": 30, "intervalDays": 30, "earlyDiscountPercent": "0.00"}),
        ("E30", "Entrada + 30 dias", {"installments": 2, "firstDueDays": 0, "intervalDays": 30, "earlyDiscountPercent": "0.00"}),
        ("P40", "40% pedido, 60% na entrega", {"installments": 2, "firstDueDays": 0, "intervalDays": 60, "earlyDiscountPercent": "0.00"}),
        ("P352", "30% pedido, 50% entrega, 20% comissionamento", {"installments": 3, "firstDueDays": 0, "intervalDays": 45,
                                                                  "earlyDiscountPercent": "0.00"})],
    "FORMA_PAGAMENTO": [
        ("BOL", "Boleto bancário", {"kind": "Boleto", "defaultAccount": "[BANCO PRINCIPAL]", "issuesSlip": True}),
        ("PIX", "Pix", {"kind": "Pix", "defaultAccount": "[BANCO PRINCIPAL]"}),
        ("TED", "Transferência bancária", {"kind": "Transferência", "defaultAccount": "[BANCO 2]"}),
        ("CRT", "Cartão de crédito", {"kind": "Cartão"}),
        ("DIN", "Dinheiro", {"kind": "Dinheiro", "defaultAccount": "Caixa"}),
        ("CHQ", "Cheque", {"kind": "Cheque", "defaultAccount": "[BANCO 2]"}, False)],
    "MOEDA": [("BRL", "Real", {"symbol": "R$", "decimals": 2, "local": True}), ("USD", "Dólar americano", {"symbol": "US$", "decimals": 2}),
              ("EUR", "Euro", {"symbol": "€", "decimals": 2}, False)],
    "TIPO_DOCUMENTO": [
        ("PV", "Pedido de venda", {"module": "Vendas", "prefix": "PV-", "nextNumber": "000124", "requiresApproval": True}),
        ("PC", "Pedido de compra", {"module": "Compras", "prefix": "PC-", "nextNumber": "000419", "requiresApproval": True}),
        ("OP", "Ordem de produção", {"module": "Produção", "prefix": "OP-", "nextNumber": "000087"}),
        ("AFE", "Certificado de aferição", {"module": "Renda+", "prefix": "AF-", "nextNumber": "001204"}),
        ("OS", "Ordem de serviço", {"module": "Manutenção", "prefix": "OS-", "nextNumber": "000233"}),
        ("PRP", "Proposta comercial", {"module": "Vendas", "prefix": "PRO-", "nextNumber": "000312", "requiresApproval": True}),
        ("NC", "Não conformidade", {"module": "Qualidade", "prefix": "NC-", "nextNumber": "000045"})],
}


def auxiliares():
    sec("Unidades de medida, categorias e tabelas auxiliares")
    ins("unit_of_measure", [dict(code=c, name=n, quantity_kind=k, decimals=d, status="ATIVO" if a else "INATIVO", version=1,
                                 created_at=ts("2025-01-02", f"08:{i:02d}"), created_by=QUEM)
                            for i, (c, n, k, d, a) in enumerate(UNIDADES)])
    ins("item_category", [dict(id=uid("category", c), code=c, name=n, parent_name=p, applies_to=a, status="ATIVO", version=1,
                               created_at=ts("2025-01-02"), created_by=QUEM) for c, n, p, a in CATEGORIAS])
    linhas = []
    for tabela, regs in AUXILIARES.items():
        for pos, r in enumerate(regs):
            ativo = r[3] if len(r) > 3 else True
            linhas.append(dict(id=uid("ref", tabela, pos), table_code=tabela, position=pos, code=r[0], description=r[1], attrs=r[2],
                               active=ativo, created_at=ts("2025-01-02"), created_by=QUEM))
    ins("reference_entry", linhas)


# Parceiros ---------------------------------------------------------------------------------------------------------

# código, razão social, fantasia, CNPJ, cidade, UF, grupo
CLIENTES = [
    ("C00012", "Fecularia Vale do Paranapanema Ltda.", "Vale do Paranapanema", "11.111.111/0001-11", "Cândido Mota", "SP", "Fecularias"),
    ("C00015", "Cooperativa Agroindustrial Noroeste", "Coop. Noroeste", "22.222.222/0001-22", "Paranavaí", "PR", "Cooperativas"),
    ("C00018", "Amidos Ivinhema Indústria S.A.", "Amidos Ivinhema", "33.333.333/0001-33", "Ivinhema", "MS", "Fecularias"),
    ("C00021", "Farinheira Santa Helena Ltda.", "Santa Helena", "44.444.444/0001-44", "Cruzeiro do Oeste", "PR", "Farinheiras"),
    ("C00024", "Fécula Horizonte Ltda.", "Fécula Horizonte", "55.555.555/0001-55", "Naviraí", "MS", "Fecularias"),
    ("C00027", "Indústria de Farinha Três Rios Ltda.", "Três Rios", "66.666.666/0001-66", "Umuarama", "PR", "Farinheiras"),
    ("C00030", "Polvilho Forte Comércio Ltda.", "Polvilho Forte", "77.777.777/0001-77", "Conchas", "SP", "Polvilharias"),
    ("C00033", "Amido Pantanal Participações S.A.", "Amido Pantanal", "88.888.888/0001-88", "Nova Andradina", "MS", "Fecularias"),
    ("C00036", "Farinheira Boa Esperança Ltda.", "Boa Esperança", "99.999.999/0001-99", "Cruz das Almas", "BA", "Farinheiras"),
    ("C00039", "Casa de Farinha Campo Novo", "Campo Novo", "10.101.010/0001-10", "Santarém", "PA", "Farinheiras"),
    ("C00042", "Fecularia Primavera S.A.", "Primavera", "12.121.212/0001-12", "Maracaju", "MS", "Fecularias"),
    ("C00045", "Associação dos Produtores de Mandioca do Vale", "APMV", "13.131.313/0001-13", "Tupã", "SP", "Associações"),
]
CLIENTES_INATIVOS = {"C00039"}

PERFIL_CLIENTE = {
    "C00012": dict(stateRegistration="10.111.111-1", phone1="(18) 3000-0001", mobile="(18) 90000-0001", email="financeiro@exemplo.com.br",
                   site="www.exemplo.com.br", industry="Fecularia", dailyCapacityTons=600, responsible="Patrícia Gomes",
                   defaultCarrier="Transportes Rota Noroeste Ltda.", territory="Oeste Paulista", origin="Feira do setor de mandioca",
                   notes="Pico de safra de maio a agosto: visitas técnicas e manutenções só fora do horário de recebimento.",
                   paymentCondition="P352", paymentMethod="BOL", priceList="T2026-PAD", defaultDiscountPercent="3.00",
                   lateInterestPercent="1.00", creditLimitCents=25000000, taxRegime="Lucro real", icmsTaxpayer="Contribuinte",
                   cnae="1063-5/00", cnaeDescription="Fabricação de farinha de mandioca e derivados", nfeEmail="financeiro@exemplo.com.br"),
    "C00015": dict(stateRegistration="90.222.222-2", phone1="(44) 3000-0015", mobile="(44) 90000-0015", dailyCapacityTons=1200,
                   territory="Noroeste do Paraná", responsible="Rafael Lima", industry="Fecularia e farinheira", taxRegime="Lucro real",
                   origin="Prospecção ativa", priceList="T2026-COOP", paymentCondition="306090", paymentMethod="BOL",
                   notes="Quatro moegas de recebimento; padroniza as balanças em todas as unidades."),
    "C00018": dict(stateRegistration="28.333.333-3", phone1="(67) 3000-0018", mobile="(67) 90000-0018", dailyCapacityTons=800,
                   territory="Mato Grosso do Sul", responsible="Carlos Eduardo Pereira", industry="Fecularia", origin="Cliente da base",
                   paymentCondition="P40", paymentMethod="BOL", priceList="T2026-PAD",
                   notes="Balança instalada em 2024; contrato de aferição em negociação."),
    "C00021": dict(stateRegistration="90.444.444-4", phone1="(44) 3000-0021", mobile="(44) 90000-0021", dailyCapacityTons=250,
                   territory="Noroeste do Paraná", responsible="Rafael Lima", industry="Farinheira", taxRegime="Lucro presumido",
                   origin="Indicação", paymentCondition="3060", paymentMethod="BOL", priceList="T2026-PAD",
                   notes="Recebimento só pela manhã durante a safra."),
    "C00024": dict(stateRegistration="28.555.555-5", phone1="(67) 3000-0024", mobile="(67) 90000-0024", dailyCapacityTons=700,
                   territory="Mato Grosso do Sul", responsible="Carlos Eduardo Pereira", industry="Fecularia", origin="Cliente da base",
                   paymentCondition="30", paymentMethod="BOL", priceList="T2026-PAD"),
}
for c in CLIENTES:
    PERFIL_CLIENTE.setdefault(c[0], {})
    p = PERFIL_CLIENTE[c[0]]
    p.setdefault("industry", {"Fecularias": "Fecularia", "Farinheiras": "Farinheira", "Polvilharias": "Polvilharia",
                              "Cooperativas": "Fecularia e farinheira", "Associações": "Associação de produtores"}[c[6]])
    p.setdefault("responsible", "Patrícia Gomes")
    p.setdefault("taxRegime", "Lucro presumido" if c[6] != "Associações" else "Isento")
    p.setdefault("icmsTaxpayer", "Contribuinte" if c[6] != "Associações" else "Não contribuinte")
    p.setdefault("paymentMethod", "BOL")
    p.setdefault("priceList", "T2026-COOP" if c[6] in ("Cooperativas", "Associações") else "T2026-PAD")

# código, razão social, fantasia, CNPJ, cidade, UF, categoria, prazo, perfil
FORNECEDORES = [
    ("F00101", "Aços Inox Paulista Ltda.", "Inox Paulista", "21.212.121/0001-21", "Sorocaba", "SP", "Aço inox", 28,
     dict(stateRegistration="210.210.210.210", industry="Siderurgia", phone1="(15) 3000-0101",
          notes="Chapas 304 com certificado de usina em todo lote.")),
    ("F00104", "Eletro Componentes Sul Ltda.", "Eletro Sul", "23.232.323/0001-23", "Joinville", "SC", "Componentes elétricos", 35,
     dict(stateRegistration="230.230.230.230", industry="Distribuição elétrica", phone1="(47) 3000-0104", mobile="(19) 90000-0002",
          email="vendas@exemplo.com.br", site="www.exemplo.com.br", responsible="Beatriz Costa",
          defaultCarrier="Logística Cargas Pesadas S.A.", territory="Sudeste", origin="Indicação",
          notes="CLP e inversores com firmware homologado.")),
    ("F00107", "Células de Carga Precisão Indústria S.A.", "Precisão Células de Carga", "24.242.424/0001-24", "Campinas", "SP",
     "Instrumentação", 42,
     dict(stateRegistration="240.240.240.240", industry="Instrumentação industrial", phone1="(19) 3000-0002", mobile="(19) 90000-0002",
          email="vendas@exemplo.com.br", site="www.exemplo.com.br", responsible="Beatriz Costa",
          defaultCarrier="Logística Cargas Pesadas S.A.", territory="Sudeste", origin="Indicação", paymentCondition="28",
          paymentMethod="TED", bankAgency="[BANCO] / [AGÊNCIA]", bankAccount="[CONTA]", pixKey="[CHAVE PIX]", taxRegime="Lucro real",
          cnae="2651-5/00", cnaeDescription="Fabricação de aparelhos de medida e teste",
          notes="Lead time médio de 42 dias para células de carga de 50 kg IP68.")),
    ("F00110", "Pneumática Oeste Automação Ltda.", "Pneumática Oeste", "25.252.525/0001-25", "Maringá", "PR", "Pneumática", 28,
     dict(stateRegistration="90.252.525-2", industry="Automação pneumática", phone1="(44) 3000-0110",
          notes="Cilindros da comporta do coletor em estoque consignado.")),
    ("F00113", "Usinagem e Caldeiraria Paranavaí", None, "26.262.626/0001-26", "Paranavaí", "PR", "Caldeiraria", 21, {}),
    ("F00116", "Pintura Industrial Norte", None, "27.272.727/0001-27", "Londrina", "PR", "Serviços de pintura", 30, {}),
    ("F00119", "Parafusos e Fixadores Brasil", None, "28.282.828/0001-28", "Guarulhos", "SP", "Fixadores", 28, {}),
    ("F00122", "Laboratório de Metrologia Certa Ltda.", None, "29.292.929/0001-29", "Curitiba", "PR", "Calibração RBC", 30, {}),
]
FORNECEDORES_INATIVOS = {"F00116"}

# código, razão social, fantasia, CNPJ, modal, cidade, UF, perfil
TRANSPORTADORAS = [
    ("T0010", "Transportes Rota Noroeste Ltda.", "Rota Noroeste", "36.262.626/0001-26", "Rodoviário", "Paranavaí", "PR",
     dict(stateRegistration="26.262.626-2", phone1="(44) 3000-0003", mobile="(44) 90000-0003", email="operacao@exemplo.com.br",
          site="www.exemplo.com.br", industry="Transporte de cargas", responsible="Carlos Eduardo Pereira", territory="Noroeste do Paraná",
          origin="Cotação", paymentCondition="15", paymentMethod="BOL", bankAgency="[BANCO] / [AGÊNCIA]", bankAccount="[CONTA]",
          pixKey="[CHAVE PIX]", taxRegime="Simples Nacional", cnae="4930-2/02",
          cnaeDescription="Transporte rodoviário de carga intermunicipal",
          notes="Balança completa viaja em caixa de madeira; agendar com 3 dias.")),
    ("T0011", "Logística Cargas Pesadas S.A.", "Cargas Pesadas", "31.313.131/0001-31", "Rodoviário", "Curitiba", "PR",
     dict(stateRegistration="90.313.131-3", phone1="(41) 3000-0011", territory="Sul", industry="Transporte de cargas",
          notes="Carretas com rampa para a balança montada.")),
    ("T0012", "Expresso Pantanal Cargas", "Expresso Pantanal", "32.323.232/0001-32", "Rodoviário", "Dourados", "MS",
     dict(stateRegistration="28.323.232-3", phone1="(67) 3000-0012", territory="Mato Grosso do Sul", industry="Transporte de cargas")),
    ("T0013", "Aéreo Rápido Encomendas", None, "34.343.434/0001-34", "Aéreo", "São Paulo", "SP", dict(industry="Transporte de cargas")),
]
TRANSPORTADORAS_INATIVAS = {"T0013"}

# Contatos: empresa (código), nome, cargo, telefone, e-mail, principal, recebe NF-e
CONTATOS = [
    ("C00012", "Mariana Rocha", "Gerente industrial", "(18) 90000-0001", "mariana@exemplo.com.br", True, False),
    ("C00012", "Rodrigo Teixeira", "Encarregado do recebimento de mandioca", "(18) 90000-0011", "rodrigo@exemplo.com.br", False, False),
    ("C00012", "Camila Duarte", "Compras", "(18) 90000-0012", "camila@exemplo.com.br", False, True),
    ("C00015", "Otávio Nunes", "Gerente de recebimento", "(44) 90000-0002", "otavio@exemplo.com.br", True, False),
    ("C00018", "Juliana Martins", "Coordenadora de qualidade", "(67) 90000-0003", "juliana@exemplo.com.br", False, False),
    ("C00018", "Sérgio Almeida", "Diretor industrial", "(67) 90000-0018", "sergio@exemplo.com.br", True, False),
    ("C00021", "João Batista", "Proprietário", "(44) 90000-0004", "joao@exemplo.com.br", True, False),
    ("C00024", "Helena Prado", "Diretora administrativa", "(67) 90000-0006", "helena@exemplo.com.br", True, False),
    ("C00027", "Antônio Ferraz", "Gerente de produção", "(44) 90000-0027", "antonio@exemplo.com.br", True, False),
    ("C00030", "Marcos Teles", "Sócio-gerente", "(15) 90000-0030", "marcos@exemplo.com.br", True, False),
    ("C00033", "Luciana Motta", "Gerente de projetos", "(67) 90000-0101", "luciana@exemplo.com.br", True, False),
    ("C00036", "Fábio Reis", "Encarregado de produção", "(75) 90000-0036", "fabio@exemplo.com.br", True, False),
    ("C00039", "Célia Ramos", "Proprietária", "(93) 90000-0039", "celia@exemplo.com.br", True, False),
    ("C00042", "Renata Lopes", "Gerente industrial", "(67) 90000-0042", "renata@exemplo.com.br", True, False),
    ("C00045", "Paulo Vieira", "Presidente", "(14) 90000-0045", "paulo@exemplo.com.br", True, False),
    ("F00104", "Fernanda Souza", "Vendedora", "(47) 90000-0005", "fernanda@exemplo.com.br", False, False),
    ("F00104", "Sônia Martins", "Gerente de contas", "(47) 90000-0104", "sonia@exemplo.com.br", True, False),
    ("F00107", "Fernanda Souza", "Vendedora", "(19) 90000-0107", "fernanda.souza@exemplo.com.br", True, False),
    ("T0010", "Central de operações", "Agendamento de coletas", "(44) 3000-0003", "operacao@exemplo.com.br", True, False),
]

ENDERECOS = {
    "C00012": [("COBRANCA", "Rua [ENDEREÇO]", "120", "Centro", "Cândido Mota", "SP", "19880000", True),
               ("ENTREGA", "Rodovia [ENDEREÇO], km 8 — Moega 1", "s/n", "Zona rural", "Cândido Mota", "SP", "19880000", True),
               ("UNIDADE", "Unidade de Assis — recebimento", "s/n", "Distrito industrial", "Assis", "SP", "19800000", False)],
}


def parceiros():
    sec("Parceiros: clientes, fornecedores e transportadoras")
    partner, role, unit, contact, supplied = [], [], [], [], []
    dia_criacao = {}

    def novo(code, razao, fantasia, cnpj, papel, ativo, grupo, perfil, prazo=None, cidade=None, uf=None, criado="2025-03-12"):
        pid = uid("partner", code)
        dia_criacao[code] = criado
        partner.append(dict(id=pid, code=code, legal_name=razao, trade_name=fantasia, cnpj=cnpj_valido(cnpj), group_name=grupo,
                            supplier_lead_time_days=prazo, supplier_payment_terms=None, status="ATIVO" if ativo else "INATIVO",
                            profile={k: v for k, v in perfil.items() if v is not None}, version=1, created_at=ts(criado, "16:45"),
                            created_by="Beatriz Costa", updated_at=ts(criado, "16:45"), updated_by="Beatriz Costa"))
        role.append(dict(partner_id=pid, role=papel, status="ATIVO" if ativo else "INATIVO", since=ts(criado, "16:45")))
        enderecos = ENDERECOS.get(code) or [("COBRANCA", None, None, None, cidade, uf, None, True)]
        for i, (k, rua, num, bairro, cid, est, cep, padrao) in enumerate(enderecos):
            nome = rua if k == "UNIDADE" and rua else {"COBRANCA": "Cobrança", "ENTREGA": "Entrega", "UNIDADE": "Unidade",
                                                       "FATURAMENTO": "Faturamento"}[k] + (f" — {cid}" if cid else "")
            unit.append(dict(id=uid("unit", code, i), partner_id=pid, position=i, name=nome, street=rua, number=num, district=bairro,
                             city=cid, state=est, postal_code=cep, cnpj=None, kind=k, is_default=padrao))
        return pid

    for c in CLIENTES:
        novo(c[0], c[1], c[2], c[3], "CLIENTE", c[0] not in CLIENTES_INATIVOS, c[6], PERFIL_CLIENTE[c[0]], cidade=c[4], uf=c[5])
    for f in FORNECEDORES:
        perfil = dict(f[8])
        perfil["supplierCategory"] = f[6]
        perfil.setdefault("paymentCondition", "28")
        perfil.setdefault("paymentMethod", "TED")
        pid = novo(f[0], f[1], f[2], f[3], "FORNECEDOR", f[0] not in FORNECEDORES_INATIVOS, None, perfil, prazo=f[7], cidade=f[4], uf=f[5])
        cat = {"Aço inox": "CHP", "Componentes elétricos": "ELE", "Instrumentação": "INS", "Pneumática": "PNE", "Fixadores": "FIX"}.get(f[6])
        if cat:
            supplied.append(dict(partner_id=pid, category_id=uid("category", cat), position=0))
    for t in TRANSPORTADORAS:
        perfil = dict(t[7])
        perfil["modal"] = t[4]
        novo(t[0], t[1], t[2], t[3], "TRANSPORTADORA", t[0] not in TRANSPORTADORAS_INATIVAS, None, perfil, cidade=t[5], uf=t[6])
    pos = {}
    for code, nome, cargo, tel, mail, princ, nfe in CONTATOS:
        i = pos.get(code, 0)
        pos[code] = i + 1
        contact.append(dict(id=uid("contact", code, i), partner_id=uid("partner", code), position=i, name=nome, role=cargo, phone=tel,
                            email=mail, is_primary=princ, receives_invoices=nfe))
    ins("partner", partner)
    ins("partner_role", role)
    ins("partner_unit", unit)
    ins("partner_contact", contact)
    ins("partner_supplied_category", supplied)
    out.append("select setval('customer_code_seq', 45), setval('supplier_code_seq', 122), setval('carrier_code_seq', 13);")
    out.append("")
    # Histórico da ficha do C00012 como no mock (aba Histórico).
    out.append("""insert into audit_event (actor, action, entity_type, entity_id, entity_version, reason, changes, correlation_id, occurred_at) values
  ('Beatriz Costa', 'PARTNER_REGISTERED', 'partner', '%(p)s', 1, null, '{"code": {"antes": null, "depois": "C00012"}, "legalName": {"antes": null, "depois": "Fecularia Vale do Paranapanema Ltda."}}'::jsonb, 'carga-mock', '2025-03-12 16:45:00-03'),
  ('Beatriz Costa', 'PARTNER_UPDATED', 'partner', '%(p)s', 2, null, '{"creditLimitCents": {"antes": "R$ 150.000,00", "depois": "R$ 250.000,00"}}'::jsonb, 'carga-mock', '2026-07-08 09:10:00-03'),
  ('Patrícia Gomes', 'PARTNER_UPDATED', 'partner', '%(p)s', 3, null, '{"paymentCondition": {"antes": "30 dias", "depois": "30/60/90 dias"}}'::jsonb, 'carga-mock', '2026-09-22 14:32:00-03');
""" % {"p": uid("partner", "C00012")})


# Itens -------------------------------------------------------------------------------------------------------------

# código, descrição, categoria, marca, UM, em estoque, preço de venda, ativo, perfil
PRODUTOS = [
    ("PA-1000", "Balança de renda Renda+ R50 — automática, 50 kg", "BAL", "RDP", "UN", 198000.00, True, "104380.20",
     dict(complement="5 ciclos de 10 kg por renda · coletor CA-10 · painel PR-12 com IHM", gtin="[GTIN]", manufacturer="Fabricação própria",
          manufacturerPartNumber="R50-A", warrantyMonths=12, traceability="Número de série", grossWeightKg="420.000", netWeightKg="385.000",
          dimensions="1,60 × 1,10 × 2,40 m", notes="Capacidade: uma renda de 50 kg a cada ~5 min. Acompanha certificado de aferição com pesos-padrão.",
          salesUom="UN", unitsPerPackage=1, commissionPercent="3.00", maxDiscountPercent="5.00", preferredSupplier="—", supplierItemCode="—",
          purchaseUom="UN", conversionFactor="1.000000", leadTimeDays=45, minLot="1.000", valuationMethod="Custo médio ponderado",
          defaultWarehouse="01", minStock="2.000", maxStock="8.000", engineeringProduct="PE-R50", bomReference="BOM-R50", bomRevision="C",
          drawing="DES-R50-001", routing="RT-01 — Caldeiraria, montagem e teste de ciclo", standardHours="112.0", spedType="04 — Produto acabado",
          ipiRate="0.00")),
    ("PA-1010", "Balança de renda Renda+ R50 Compacta", "BAL", "RDP", "UN", 128000.00, True, "71200.00",
     dict(warrantyMonths=12, traceability="Número de série", spedType="04 — Produto acabado", defaultWarehouse="02")),
    ("PA-1100", "Coletor automático de amostras CA-10", "COL", "RDP", "UN", 38500.00, True, "19800.00",
     dict(warrantyMonths=12, traceability="Número de série", spedType="04 — Produto acabado", defaultWarehouse="02")),
    ("PA-1200", "Painel de controle PR-12 com IHM", "PNL", "RDP", "UN", 42300.00, True, "22000.00",
     dict(warrantyMonths=12, traceability="Número de série", spedType="04 — Produto acabado", defaultWarehouse="02")),
    ("PA-1300", "Kit de pesos-padrão para aferição (5 × 10 kg)", "ACS", "RDP", "KIT", 6850.00, True, "3900.00",
     dict(traceability="Lote", spedType="00 — Mercadoria para revenda", defaultWarehouse="01")),
    ("PA-1310", "Célula de carga 50 kg (reposição)", "REP", "RDP", "UN", 1480.00, True, "980.00",
     dict(traceability="Lote", spedType="00 — Mercadoria para revenda", defaultWarehouse="01")),
    ("PA-0900", "Balança de renda hidrostática semiautomática H5", "BAL", "RDP", "UN", 69000.00, False, "38000.00",
     dict(spedType="04 — Produto acabado")),
]
ESTOQUE_PRODUTO = {"PA-1000": 3, "PA-1010": 2, "PA-1100": 5, "PA-1200": 6, "PA-1300": 8, "PA-1310": 22, "PA-0900": 0}

# código, descrição, categoria, UM, código de serviço, preço, custo padrão, perfil
SERVICOS = [
    ("SV-010", "Instalação e comissionamento na moega de recebimento", "SVI", "SV", "14.06", 22000.00, "11800.00",
     dict(complement="Montagem, testes de ciclo e treinamento inicial", warrantyMonths=3, traceability="Nenhuma",
          notes="Na safra, agendar fora do horário de recebimento de mandioca.", salesUom="SV", unitsPerPackage=1, commissionPercent="5.00",
          maxDiscountPercent="5.00", issExigibility="Exigível", issIncidence="Município do tomador", issRate="5.00")),
    ("SV-020", "Aferição com pesos-padrão em campo", "AFR", "SV", "14.01", 1800.00, "720.00",
     dict(salesUom="SV", issExigibility="Exigível", issIncidence="Município do prestador", issRate="3.00")),
    ("SV-030", "Visita técnica corretiva", "AST", "H", "14.01", 380.00, "150.00", dict(salesUom="H", issExigibility="Exigível")),
    ("SV-040", "Treinamento de operadores do recebimento", "TRN", "H", "08.02", 290.00, "110.00", dict(salesUom="H", issExigibility="Exigível")),
    ("SV-050", "Contrato de manutenção e aferição trimestral", "CTR", "MES", "14.01", 1500.00, "640.00",
     dict(salesUom="MES", issExigibility="Exigível")),
    ("SV-060", "Manutenção preventiva do coletor e da comporta", "MAN", "SV", "14.01", 2400.00, "980.00",
     dict(salesUom="SV", issExigibility="Exigível")),
]

# código, descrição, categoria, marca, UM, em estoque, mínimo, custo médio, NCM
MATERIAIS = [
    ("MP-2001", "Chapa de aço inox 304 2 mm", "CHP", None, "KG", "820", "500", "42.80", "72193300"),
    ("MP-2002", 'Tubo de aço inox 304 3"', "TUB", None, "M", "96", "120", "118.15", "73064000"),
    ("SN-5001", "Célula de carga single point 50 kg IP68", "INS", "MRC1", "UN", "12", "10", "980.00", "90318099"),
    ("EL-3001", "Controlador lógico programável CLP-16", "ELE", "MRC2", "UN", "9", "6", "3480.00", "85371019"),
    ("EL-3005", "Indicador de pesagem digital IP-4", "INS", "MRC1", "UN", "7", "5", "1260.00", "90318099"),
    ("PN-6001", "Cilindro pneumático 63 × 200 mm (comporta do coletor)", "PNE", "MRC3", "UN", "14", "10", "612.00", "84123100"),
    ("PN-6002", "Válvula solenoide 5/2 vias 24 Vcc", "PNE", "MRC3", "UN", "3", "8", "245.00", "84812090"),
    ("FX-4001", "Parafuso sextavado inox M8x25", "FIX", None, "UN", "3400", "1000", "0.86", "73181500"),
    ("EL-3010", "Inversor de frequência 5 cv", "ELE", "MRC2", "UN", "3", "4", "2890.00", "85044090"),
]
PERFIL_EL3001 = dict(complement="16 entradas digitais, 8 saídas a relé", gtin="[GTIN]", manufacturer="[FABRICANTE]",
                     manufacturerPartNumber="CLP16-R8", warrantyMonths=12, traceability="Lote", grossWeightKg="0.650", netWeightKg="0.480",
                     dimensions="0,12 × 0,09 × 0,07 m", notes="Usar somente firmware homologado pela engenharia.", purchaseUom="UN",
                     conversionFactor="1.000000", leadTimeDays=35, minLot="1.000", preferredSupplier="Eletro Componentes Sul Ltda.",
                     supplierItemCode="CLP-16R8", valuationMethod="Custo médio ponderado", defaultWarehouse="01", spedType="01 — Matéria-prima")


FORNECEDOR_PREFERIDO = {"CHP": "Aços Inox Paulista Ltda.", "TUB": "Aços Inox Paulista Ltda.", "ELE": "Eletro Componentes Sul Ltda.",
                        "INS": "Células de Carga Precisão Indústria S.A.", "PNE": "Pneumática Oeste Automação Ltda.",
                        "FIX": "Parafusos e Fixadores Brasil"}


def itens():
    sec("Itens: produtos, serviços e materiais")
    fiscal = {x["codigo"]: x for k in FISCAL["classificacao"] for x in FISCAL["classificacao"][k]}
    item = []
    for i, (c, d, cat, marca, um, preco, ativo, custo, perfil) in enumerate(PRODUTOS):
        p = dict(brand=marca, stockItem=True, salesItem=True, purchaseItem=True, manufactured=cat in ("BAL", "COL", "PNL"),
                 salePriceCents=cents(preco), **perfil)
        f = fiscal.get(c)
        item.append(dict(id=uid("item", c), code=c, description=d, nature="MATERIAL", item_type="PRODUTO", uom_code=um,
                         category_id=uid("category", cat), stock_controlled=True, reference_cost=custo,
                         ncm=(f or {}).get("ncm") or ("84238200" if cat == "BAL" else None), service_code=None,
                         status="ATIVO" if ativo else "INATIVO", profile=p, version=1, created_at=ts("2025-01-10"), created_by=QUEM,
                         updated_at=ts("2025-01-10"), updated_by=QUEM))
    for c, d, cat, um, cod, preco, custo, perfil in SERVICOS:
        p = dict(salesItem=True, salePriceCents=cents(preco), **perfil)
        item.append(dict(id=uid("item", c), code=c, description=d, nature="SERVICO", item_type="SERVICO", uom_code=um,
                         category_id=uid("category", cat), stock_controlled=False, reference_cost=custo, ncm=None, service_code=cod,
                         status="ATIVO", profile=p, version=1, created_at=ts("2025-01-10"), created_by=QUEM, updated_at=ts("2025-01-10"),
                         updated_by=QUEM))
    for c, d, cat, marca, um, est, minimo, custo, ncm in MATERIAIS:
        p = dict(brand=marca, stockItem=True, purchaseItem=True, minStock=f"{float(minimo):.3f}", spedType="01 — Matéria-prima",
                 defaultWarehouse="01", valuationMethod="Custo médio ponderado", preferredSupplier=FORNECEDOR_PREFERIDO.get(cat, "—"))
        if c == "EL-3001":
            p.update(PERFIL_EL3001)
            p["stockItem"] = p["salesItem"] = p["purchaseItem"] = p["manufactured"] = True
        item.append(dict(id=uid("item", c), code=c, description=d, nature="MATERIAL", item_type="MATERIAL", uom_code=um,
                         category_id=uid("category", cat), stock_controlled=True, reference_cost=custo, ncm=ncm, service_code=None,
                         status="ATIVO", profile={k: v for k, v in p.items() if v is not None}, version=1, created_at=ts("2025-01-10"),
                         created_by=QUEM, updated_at=ts("2025-01-10"), updated_by=QUEM))
    for x in item:
        x["profile"] = {k: v for k, v in x["profile"].items() if v is not None}
    ins("item", item)
    out.append("select setval('material_code_seq', 1), setval('service_code_seq', 1);")
    out.append("")
    # Classificação fiscal (Sprint 12) dos itens do exemplo.
    perfis = []
    for x in FISCAL["classificacao"]["produtosEMateriais"]:
        anexo = x["anexo"] if x["tipo"] == "PRODUTO" else "INSUMO"
        perfis.append(dict(item_id=uid("item", x["codigo"]), cfop_internal=x["cfopInterno"], cfop_interstate=x["cfopInterestadual"],
                           csosn=x["csosn"], origin=x["origem"], annex=anexo, nbs=None, iss_retention=None,
                           review=x["situacao"] == "REVISAR", review_note="Conferir o NCM com o contador." if x["situacao"] == "REVISAR" else None,
                           version=1, created_at=ts("2026-09-01"), created_by=QUEM))
    for x in FISCAL["classificacao"]["servicos"]:
        perfis.append(dict(item_id=uid("item", x["codigo"]), cfop_internal=None, cfop_interstate=None, csosn=None, origin=None,
                           annex=x["anexo"], nbs=x["nbs"], iss_retention=x["retencaoIss"], review=False, review_note=None, version=1,
                           created_at=ts("2026-09-01"), created_by=QUEM))
    out.append("-- item_fiscal_profile: colunas conferidas na V18.")
    ins("item_fiscal_profile", perfis)


# Estoque -----------------------------------------------------------------------------------------------------------

DEPOSITOS = [("01", "Almoxarifado central", "PROPRIO", "Rua [ENDEREÇO], Galpão A", "Diego Moreira", 4200, 180, 62),
             ("02", "Produto acabado", "PROPRIO", "Rua [ENDEREÇO], Galpão B", "Lucas Fernandes", 12000, 320, 38),
             ("03", "Em poder de terceiros", "TERCEIROS", "Diversos", "Beatriz Costa", None, None, None),
             ("04", "Quarentena / qualidade", "PROPRIO", "Rua [ENDEREÇO], Galpão A", "Lucas Fernandes", 800, 30, 20),
             ("05", "Trânsito", "VIRTUAL", None, None, None, None, None)]
# código, descrição, nível, superior (código da localização ou do depósito), capacidade kg, volume m³, ocupação %
LOCALIZACOES = [
    ("A", "Área A — Matéria-prima", "AREA", "01", 2400, 90, 71), ("A-01", "Rua 01", "RUA", "A", 1200, 45, 80),
    ("A-01-01", "Estante 01", "ESTANTE", "A-01", 600, 20, 85), ("A-01-01-1", "Posição 1", "POSICAO", "A-01-01", 200, 6, 90),
    ("A-01-01-2", "Posição 2", "POSICAO", "A-01-01", 200, 6, 75), ("A-02", "Rua 02", "RUA", "A", 1200, 45, 58),
    ("A-02-03", "Estante 03", "ESTANTE", "A-02", 600, 20, 64), ("A-02-03-1", "Posição 1", "POSICAO", "A-02-03", 200, 6, 70),
    ("C", "Área C — Elétricos", "AREA", "01", 1800, 90, 49), ("C-01", "Rua 01", "RUA", "C", 900, 45, 52),
    ("B", "Área B — Expedição", "AREA", "02", 12000, 320, 38), ("B-01-01-1", "Baia 1", "POSICAO", "B", 3000, 80, 55),
    ("Q-01-01-1", "Posição Q1", "POSICAO", "04", 200, 6, 35)]
# item, depósito, localização, lote, em estoque, reservado, em pedido
SALDOS = [("EL-3001", "01", "A-02-03-1", "L2609-04", "7", "4", "10"), ("EL-3010", "01", "A-02-03-1", "L2608-11", "3", "0", "0"),
          ("MP-2001", "01", "A-01-01-1", "L2607-02", "820", "0", "0"), ("MP-2002", "01", "A-01-01-2", "L2608-06", "96", "0", "0"),
          ("PA-1000", "02", "B-01-01-1", "RM200-0231", "3", "2", "0"), ("PA-1100", "02", "B-01-01-1", "PC12-0112", "5", "0", "0"),
          ("PA-1000", "03", None, None, "1", "0", "0"), ("EL-3001", "04", "Q-01-01-1", "L2609-05", "2", "2", "0"),
          ("SN-5001", "01", "C-01", None, "12", "4", "18"), ("EL-3005", "01", "C-01", None, "7", "0", "0"),
          ("PN-6001", "01", "C-01", None, "14", "0", "0"), ("PN-6002", "01", "C-01", None, "3", "0", "8"),
          ("FX-4001", "01", "A-01-01-2", None, "3400", "0", "0"), ("PA-1010", "02", "B", None, "2", "1", "0"),
          ("PA-1200", "02", "B", None, "6", "0", "0"), ("PA-1300", "01", "A", None, "8", "0", "0"), ("PA-1310", "01", "C-01", None, "22", "0", "0")]


def estoque():
    sec("Estoque: depósitos, localizações e saldos informados")
    ins("warehouse", [dict(id=uid("wh", c), code=c, name=n, kind=k, address=e, responsible=r, status="ATIVO", capacity_kg=cap, volume_m3=vol,
                           occupancy_percent=occ, version=1, created_at=ts("2025-01-05"), created_by=QUEM) for c, n, k, e, r, cap, vol, occ in DEPOSITOS])
    deps = {d[0] for d in DEPOSITOS}
    locs, wh_of = [], {}
    for pos, (c, n, nivel, sup, cap, vol, occ) in enumerate(LOCALIZACOES):
        wh = sup if sup in deps else wh_of[sup]
        wh_of[c] = wh
        locs.append(dict(id=uid("loc", c), warehouse_id=uid("wh", wh), parent_id=None if sup in deps else uid("loc", sup), code=c, name=n,
                         level=nivel, capacity_kg=cap, volume_m3=vol, occupancy_percent=occ, blocked_entry=False, blocked_exit=False,
                         quarantine_only=wh == "04", position=pos, version=1, created_at=ts("2025-01-05"), created_by=QUEM))
    ins("stock_location", locs)
    custo = {m[0]: m[7] for m in MATERIAIS}
    custo.update({p[0]: p[7] for p in PRODUTOS})
    ins("item_stock_balance", [dict(id=uid("bal", i), item_id=uid("item", it), warehouse_id=uid("wh", w), location_id=uid("loc", l) if l else None,
                                    lot=lot, on_hand=oh, reserved=r, on_order=oo, average_cost=custo.get(it), updated_at=ts("2026-09-24"),
                                    updated_by=QUEM) for i, (it, w, l, lot, oh, r, oo) in enumerate(SALDOS)])


# Calendários e tabelas de preço ------------------------------------------------------------------------------------

def pascoa(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e, f = b // 4, b % 4, (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    return date(y, (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1)


def feriados(y, empresa=True):
    p = pascoa(y)
    f = [(date(y, 1, 1), "Confraternização universal", "NACIONAL"), (p - timedelta(48), "Carnaval", "PONTO_FACULTATIVO"),
         (p - timedelta(47), "Carnaval", "PONTO_FACULTATIVO"), (p - timedelta(2), "Paixão de Cristo", "NACIONAL"),
         (date(y, 4, 21), "Tiradentes", "NACIONAL"), (date(y, 5, 1), "Dia do Trabalho", "NACIONAL"),
         (p + timedelta(60), "Corpus Christi", "PONTO_FACULTATIVO"), (date(y, 9, 7), "Independência do Brasil", "NACIONAL"),
         (date(y, 10, 12), "Nossa Senhora Aparecida", "NACIONAL"), (date(y, 11, 2), "Finados", "NACIONAL"),
         (date(y, 11, 15), "Proclamação da República", "NACIONAL"), (date(y, 11, 20), "Dia Nacional de Zumbi e da Consciência Negra", "NACIONAL"),
         (date(y, 12, 25), "Natal", "NACIONAL")]
    if empresa:
        f += [(date(y, 12, 24), "Véspera de Natal (meio expediente)", "EMPRESA"),
              (date(y, 12, 31), "Véspera de Ano-Novo (meio expediente)", "EMPRESA")]
    return sorted(f)


def calendarios():
    sec("Calendários, feriados e tabelas de preço")
    cals = [("Padrão — fábrica", "SSSSSNN", "07:30", "17:18", "12:00", "13:00"), ("Equipe de instalação", "SSSSSSN", "07:00", "17:00", "12:00", "13:00"),
            ("Administrativo", "SSSSSNN", "08:00", "18:00", "12:00", "13:30")]
    ins("work_calendar", [dict(id=uid("cal", n), name=n, state=None, city=None, workdays=w, start_time=s, end_time=e, break_start=bs, break_end=be,
                               position=i, version=1, created_at=ts("2025-01-02"), created_by=QUEM) for i, (n, w, s, e, bs, be) in enumerate(cals)])
    hol = []
    for n, *_ in cals:
        for y in (2026, 2027):
            for d, desc, k in feriados(y, empresa=n != "Equipe de instalação"):
                hol.append(dict(id=uid("hol", n, d), calendar_id=uid("cal", n), day=d.isoformat(), description=desc, kind=k))
    ins("calendar_holiday", hol)
    tabelas = [("T2026-PAD", "Tabela 2026 — Padrão", 1.0), ("T2026-COOP", "Tabela 2026 — Cooperativas e associações", 0.95)]
    ins("price_list", [dict(id=uid("pl", c), code=c, name=n, valid_from="2026-01-01", valid_to="2026-12-31", active=True,
                            created_at=ts("2025-12-15"), created_by="Patrícia Gomes") for c, n, _ in tabelas])
    precos = []
    for c, _, _, _, _, preco, ativo, *_ in PRODUTOS:
        if ativo:
            for t, _, f in tabelas:
                precos.append(dict(price_list_id=uid("pl", t), item_id=uid("item", c), price_cents=cents(preco * f),
                                   updated_at=ts("2026-01-02"), updated_by="Patrícia Gomes"))
    for c, _, _, _, _, preco, *_ in SERVICOS:
        for t, _, f in tabelas:
            precos.append(dict(price_list_id=uid("pl", t), item_id=uid("item", c), price_cents=cents(preco * f), updated_at=ts("2026-01-02"),
                               updated_by="Patrícia Gomes"))
    ins("price_list_entry", precos)


# CRM ---------------------------------------------------------------------------------------------------------------

HOJE = date(2026, 9, 24)  # o "hoje" do mock (RENDA_DEMO_DATE=2026-09-24T09:31)
ETAPA = {"Prospecção": "PROSPECCAO", "Qualificação": "QUALIFICACAO", "Visita técnica": "VISITA_TECNICA", "Proposta": "PROPOSTA",
         "Negociação": "NEGOCIACAO"}
PCT = {"PROSPECCAO": 10, "QUALIFICACAO": 25, "VISITA_TECNICA": 40, "PROPOSTA": 60, "NEGOCIACAO": 80}
ORDEM = ["PROSPECCAO", "QUALIFICACAO", "VISITA_TECNICA", "PROPOSTA", "NEGOCIACAO"]
ORIGEM = {"Site": "SITE", "Feira do setor de mandioca": "FEIRA", "Indicação": "INDICACAO", "Prospecção ativa": "PROSPECCAO_ATIVA",
          "Cliente da base": "CLIENTE_ATUAL"}
SITUACAO_LEAD = {"Novo": "IDENTIFICADO", "Em contato": "CONTATADO", "Qualificado": "INTERESSADO", "Descartado": "DESCARTADO"}

# nº, cliente, título, valor, etapa, previsão, responsável, dias sem atividade, origem, contato
OPORTUNIDADES = [
    ("OP-000231", "C00012", "2 balanças Renda+ R50 para as moegas de recebimento", 483140, "Negociação", "2026-09-30", "Patrícia Gomes", 2, "Feira do setor de mandioca", "Mariana Rocha"),
    ("OP-000226", "C00021", "Balança Renda+ R50 Compacta — 1 moega", 150000, "Negociação", "2026-09-28", "Rafael Lima", 4, "Indicação", "João Batista"),
    ("OP-000228", "C00018", "Ampliação — 2ª linha de recebimento", 236500, "Proposta", "2026-10-10", "Carlos Eduardo Pereira", 6, "Cliente da base", "Sérgio Almeida"),
    ("OP-000219", "C00024", "Contrato de manutenção e aferição — 3 balanças", 64800, "Proposta", "2026-10-15", "Carlos Eduardo Pereira", 21, "Cliente da base", "Helena Prado"),
    ("OP-000224", "C00015", "Balança Renda+ R50 para a unidade de Paranavaí", 248000, "Visita técnica", "2026-10-31", "Rafael Lima", 3, "Prospecção ativa", "Otávio Nunes"),
    ("OP-000221", "C00042", "Trocar a balança hidrostática manual — 2 moegas", 412000, "Visita técnica", "2026-11-14", "Carlos Eduardo Pereira", 9, "Indicação", "Renata Lopes"),
    ("OP-000235", "C00027", "Balança Renda+ R50 Compacta", 136000, "Qualificação", "2026-11-20", "Rafael Lima", 1, "Feira do setor de mandioca", "Antônio Ferraz"),
    ("OP-000237", "C00033", "Renda+ para a fecularia nova de Nova Andradina", 452000, "Qualificação", "2026-11-30", "Patrícia Gomes", 5, "Site", "Luciana Motta"),
    ("OP-000236", "C00036", "Balança Renda+ R50 Compacta — Recôncavo", 128000, "Prospecção", "2026-12-15", "Carlos Eduardo Pereira", 12, "Prospecção ativa", "Fábio Reis"),
    ("OP-000239", "C00045", "Balança Renda+ R50 Compacta para uso da associação", 128000, "Prospecção", "2026-12-20", "Patrícia Gomes", 0, "Site", "Paulo Vieira"),
    ("OP-000217", "C00030", "Coletor automático adicional CA-10", 38500, "Ganha", "2026-09-12", "Patrícia Gomes", 12, "Cliente da base", "Marcos Teles"),
    ("OP-000214", "C00039", "Balança Renda+ R50 Compacta", 128000, "Perdida", "2026-09-05", "Rafael Lima", 19, "Indicação", "Célia Ramos"),
]

# nº, nome, empresa, cidade, UF, origem, interesse, pontuação, situação, responsável, dias sem contato, telefone, e-mail, moagem
LEADS = [
    ("L-0412", "Luciana Motta", "Amido Pantanal Participações S.A.", "Nova Andradina", "MS", "Site", "Balança Renda+ R50", 86, "Qualificado", "Patrícia Gomes", 1, "(67) 90000-0101", "luciana@exemplo.com.br", 800),
    ("L-0418", "Diego Carvalho", "Farinheira Três Irmãos", "Cianorte", "PR", "Feira do setor de mandioca", "Balança Renda+ R50 Compacta", 72, "Em contato", "Rafael Lima", 3, "(44) 90000-0102", "diego@exemplo.com.br", 120),
    ("L-0421", "Tereza Albuquerque", "Fecularia Pantanal", "Glória de Dourados", "MS", "Indicação", "Balança Renda+ R50", 81, "Em contato", "Carlos Eduardo Pereira", 2, "(67) 90000-0103", "tereza@exemplo.com.br", 550),
    ("L-0423", "Ricardo Menezes", "Polvilharia Boa Nata", "Pouso Alegre", "MG", "Site", "Coletor automático CA-10", 58, "Novo", "Patrícia Gomes", 0, "(35) 90000-0104", "ricardo@exemplo.com.br", 90),
    ("L-0424", "Vanessa Queiroz", "Farinheira Terra Roxa", "Tapejara", "PR", "Feira do setor de mandioca", "Balança Renda+ R50 Compacta", 64, "Novo", "Rafael Lima", 0, "(44) 90000-0105", "vanessa@exemplo.com.br", 150),
    ("L-0409", "André Siqueira", "Fecularia Vista Alegre", "Assis", "SP", "Prospecção ativa", "Contrato de manutenção e aferição", 41, "Em contato", "Patrícia Gomes", 11, "(18) 90000-0106", "andre@exemplo.com.br", 300),
    ("L-0402", "Marta Figueiredo", "Casa de Farinha Recanto", "Vitória da Conquista", "BA", "Site", "Balança Renda+ R50 Compacta", 22, "Descartado", "Carlos Eduardo Pereira", 26, "(77) 90000-0107", "marta@exemplo.com.br", 15),
    ("L-0425", "Henrique Bastos", "Cooperativa Mandioca Sul", "Santa Rosa do Sul", "SC", "Indicação", "Balança Renda+ R50", 77, "Novo", "Carlos Eduardo Pereira", 0, "(48) 90000-0108", "henrique@exemplo.com.br", 400),
]

# tipo, assunto, dia, início, duração (min), oportunidade, responsável, situação, anotações
TIPO_ATIV = {"Visita técnica": "VISITA_TECNICA", "Reunião": "REUNIAO", "Ligação": "LIGACAO", "E-mail": "EMAIL", "Tarefa": "TAREFA"}
ATIVIDADES = [
    ("Ligação", "Primeiro contato após a feira", "2026-08-14", "10:00", 30, "OP-000231", "Patrícia Gomes", "CONCLUIDA", None),
    ("Visita técnica", "Levantamento da moega de recebimento", "2026-09-02", "08:00", 180, "OP-000231", "Patrícia Gomes", "CONCLUIDA", None),
    ("Visita técnica", "Levantamento da moega de recebimento", "2026-09-21", "08:00", 180, "OP-000224", "Rafael Lima", "CONCLUIDA", None),
    ("Ligação", "Retorno sobre a proposta da 2ª linha", "2026-09-21", "14:00", 30, "OP-000228", "Carlos Eduardo Pereira", "CONCLUIDA", None),
    ("Reunião", "Apresentação do retorno para a diretoria", "2026-09-22", "10:00", 90, "OP-000231", "Patrícia Gomes", "CONCLUIDA", None),
    ("E-mail", "Enviar layout de instalação nas 2 moegas", "2026-09-22", "15:00", 30, "OP-000221", "Carlos Eduardo Pereira", "CONCLUIDA", None),
    ("Tarefa", "Revisar valores do contrato de aferição", "2026-09-23", "09:00", 60, "OP-000219", "Carlos Eduardo Pereira", "PLANEJADA", None),
    ("Ligação", "Qualificar lead da feira", "2026-09-23", "11:00", 30, "OP-000235", "Rafael Lima", "CONCLUIDA", None),
    ("Reunião", "Negociação de prazo e forma de pagamento", "2026-09-24", "09:00", 90, "OP-000231", "Patrícia Gomes", "PLANEJADA",
     "Levar a planilha de retorno com prazo de 24 meses. Diretoria pediu 5% de desconto à vista."),
    ("Ligação", "Confirmar visita técnica", "2026-09-24", "11:00", 30, "OP-000221", "Carlos Eduardo Pereira", "PLANEJADA", None),
    ("Visita técnica", "Demonstração da balança em funcionamento", "2026-09-24", "14:00", 150, "OP-000226", "Rafael Lima", "PLANEJADA", None),
    ("E-mail", "Enviar catálogo da Renda+ Compacta", "2026-09-24", "16:30", 30, "OP-000236", "Carlos Eduardo Pereira", "PLANEJADA", None),
    ("Reunião", "Definir local da balança na unidade", "2026-09-25", "09:00", 120, "OP-000224", "Rafael Lima", "PLANEJADA", None),
    ("Ligação", "Primeiro contato", "2026-09-25", "14:00", 30, "OP-000239", "Patrícia Gomes", "PLANEJADA", None),
    ("Tarefa", "Preparar minuta do contrato", "2026-09-25", "15:00", 90, "OP-000231", "Patrícia Gomes", "PLANEJADA", None),
]

# Histórico de etapas da OP-000231 (aba do mock): quando, de, para, observação.
ETAPAS_231 = [("2026-08-04 14:22", None, "PROSPECCAO", "Criada a partir do lead"), ("2026-08-10 11:30", "PROSPECCAO", "QUALIFICACAO", None),
              ("2026-08-18 09:05", "QUALIFICACAO", "VISITA_TECNICA", None),
              ("2026-09-02 16:40", "VISITA_TECNICA", "PROPOSTA", "Levantamento da moega concluído"),
              ("2026-09-19 10:12", "PROPOSTA", "NEGOCIACAO", "Cliente pediu revisão de prazo")]


# Oportunidades fechadas nos últimos 24 meses (taxa de conversão e séries do painel): mês de fechamento, ganha?, valor.
FECHADAS = [("2024-10", False, 128000), ("2024-11", True, 236000), ("2024-12", False, 98000), ("2025-01", False, 150000),
            ("2025-02", True, 412000), ("2025-03", False, 64000), ("2025-04", False, 128000), ("2025-05", True, 198000),
            ("2025-06", False, 136000), ("2025-08", False, 248000), ("2025-09", False, 120000),
            ("2025-10", False, 128000), ("2025-11", True, 236500), ("2025-12", False, 150000), ("2026-01", False, 98000),
            ("2026-02", True, 198000), ("2026-03", False, 412000), ("2026-04", False, 64800), ("2026-05", True, 248000),
            ("2026-06", False, 136000), ("2026-07", False, 128000), ("2026-07", False, 98000), ("2026-08", True, 150000), ("2026-08", False, 452000),
            ("2026-08", False, 88000)]
MOTIVOS = ["PRECO", "PRAZO", "CONCORRENTE", "SEM_ORCAMENTO", "DESISTIU"]


def historico(opps, mudancas):
    clientes = [c[0] for c in CLIENTES]
    donos = ["Patrícia Gomes", "Rafael Lima", "Carlos Eduardo Pereira"]
    for n, (mes, ganha, valor) in enumerate(FECHADAS):
        cod = f"OP-{150 + n:06d}"
        fim = date(int(mes[:4]), int(mes[5:]), 10 + n % 15)
        criada = fim - timedelta(days=75)
        st = "NEGOCIACAO" if ganha else ORDEM[1 + n % 4]
        status = "GANHA" if ganha else "PERDIDA"
        motivo = None if ganha else MOTIVOS[n % len(MOTIVOS)]
        opps.append(dict(id=uid("opp", cod), code=cod, name="Balança Renda+ R50" + (" Compacta" if valor < 200000 else ""), lead_id=None,
                         customer_id=uid("partner", clientes[n % len(clientes)]), unit_id=None, unit_name=None, owner=donos[n % 3],
                         source=list(ORIGEM.values())[n % 5], interest="MEDIO", potential_cents=cents(valor), expected_close=str(fim),
                         stage=st, status=status, loss_reason=motivo, loss_note=None, closed_at=ts(str(fim), "17:00"), won_order_code=None,
                         next_action_date=None, next_action_note=None, last_interaction=str(fim), notes=None, version=1,
                         created_at=ts(str(criada)), created_by=QUEM, updated_at=ts(str(fim)), updated_by=QUEM, contact_name=None, need={}))
        de = None
        for k in range(ORDEM.index(st) + 1):
            dia = criada + timedelta(days=12 * k)
            mudancas.append(dict(id=uid("stage", cod, k), opportunity_id=uid("opp", cod), from_stage=de, to_stage=ORDEM[k], status="ABERTA",
                                 close_percent=PCT[ORDEM[k]], potential_cents=cents(valor), weighted_cents=round(cents(valor) * PCT[ORDEM[k]] / 100),
                                 changed_at=ts(str(dia)), changed_by=donos[n % 3], note=None))
            de = ORDEM[k]
        mudancas.append(dict(id=uid("stage", cod, "fim"), opportunity_id=uid("opp", cod), from_stage=st, to_stage=st, status=status,
                             close_percent=100 if ganha else 0, potential_cents=cents(valor), weighted_cents=cents(valor) if ganha else 0,
                             changed_at=ts(str(fim), "17:00"), changed_by=donos[n % 3], note=None))


def crm():
    sec("CRM: leads, oportunidades, etapas, itens de interesse, atividades e meta")
    leads = []
    for (cod, nome, emp, cid, uf, orig, inter, score, sit, resp, dias, tel, mail, moagem) in LEADS:
        ult = HOJE - timedelta(days=dias)
        leads.append(dict(id=uid("lead", cod), code=cod, company_name=emp, trade_name=None, city=cid, state=uf, has_renda="NAO",
                          rating=None, stage=SITUACAO_LEAD[sit], discard_reason="Moagem pequena demais para a balança" if sit == "Descartado" else None,
                          owner=resp, source=ORIGEM[orig], contact_name=nome, contact_phone=tel, contact_email=mail, notes=None,
                          partner_id=uid("partner", "C00033") if cod == "L-0412" else None, next_action_date=None, next_action_note=None,
                          last_interaction=str(ult), import_id=None, version=1, created_at=ts(str(ult - timedelta(days=20))), created_by=QUEM,
                          updated_at=ts(str(ult)), updated_by=QUEM, daily_capacity_tons=moagem, score=score, interest_item=inter))
    ins("lead", leads)
    out.append("select setval('lead_code_seq', 425);")
    out.append("")

    opps, mudancas, itens = [], [], []
    for (cod, cli, titulo, valor, etapa, prev, resp, dias, orig, contato) in OPORTUNIDADES:
        ganha, perdida = etapa == "Ganha", etapa == "Perdida"
        st = "NEGOCIACAO" if ganha else "PROPOSTA" if perdida else ETAPA[etapa]
        status = "GANHA" if ganha else "PERDIDA" if perdida else "ABERTA"
        ultima = HOJE - timedelta(days=dias)
        fechada = ts(prev, "17:00") if status != "ABERTA" else None
        criada = date(2026, 8, 4) if cod == "OP-000231" else ultima - timedelta(days=30 + 14 * ORDEM.index(st))
        need = {"industry": "Fecularia", "dailyCapacityTons": 600, "receivingPits": 2, "installationSite": "Moega de recebimento",
                "power": "380 V trifásica", "desiredStart": "2027-03-01", "mainCompetitor": "[CONCORRENTE A]"} if cod == "OP-000231" else {}
        opps.append(dict(id=uid("opp", cod), code=cod, name=titulo, lead_id=uid("lead", "L-0412") if cod == "OP-000237" else None,
                         customer_id=uid("partner", cli), unit_id=None, unit_name=None, owner=resp, source=ORIGEM[orig], interest="ALTO" if valor > 300000 else "MEDIO",
                         potential_cents=cents(valor), expected_close=prev, stage=st, status=status,
                         loss_reason="PRECO" if perdida else None, loss_note="Cliente comprou balança mais simples, de outro fornecedor" if perdida else None,
                         closed_at=fechada, won_order_code=None, next_action_date=None, next_action_note=None, last_interaction=str(ultima),
                         notes="Pico de safra de maio a agosto: instalação só fora do horário de recebimento." if cod == "OP-000231" else None,
                         version=1, created_at=ts(str(criada), "14:22"), created_by=QUEM, updated_at=ts(str(ultima)), updated_by=QUEM,
                         contact_name=contato, need=need))
        # Histórico de etapas: a OP-000231 como no mock; as demais avançam uma etapa a cada 6 dias até a atual.
        if cod == "OP-000231":
            passos = [(quando, de, para, obs) for quando, de, para, obs in ETAPAS_231]
        else:
            alvo = ORDEM.index(st)
            passos, de = [], None
            for k in range(alvo + 1):
                dia = criada + timedelta(days=14 * k) if k < alvo else ultima
                passos.append((f"{dia} 09:{10 + k:02d}", de, ORDEM[k], "Criada pelo responsável" if k == 0 else None))
                de = ORDEM[k]
        for k, (quando, de, para, obs) in enumerate(passos):
            p = PCT[para]
            mudancas.append(dict(id=uid("stage", cod, k), opportunity_id=uid("opp", cod), from_stage=de, to_stage=para, status="ABERTA",
                                 close_percent=p, potential_cents=cents(valor), weighted_cents=round(cents(valor) * p / 100),
                                 changed_at=f"{quando}:00-03", changed_by=resp, note=obs))
        if status != "ABERTA":
            mudancas.append(dict(id=uid("stage", cod, "fim"), opportunity_id=uid("opp", cod), from_stage=st, to_stage=st, status=status,
                                 close_percent=100 if ganha else 0, potential_cents=cents(valor), weighted_cents=cents(valor) if ganha else 0,
                                 changed_at=fechada, changed_by=resp, note="Pedido confirmado" if ganha else "Perdida por preço"))
    historico(opps, mudancas)
    ins("opportunity", opps)
    ins("opportunity_stage_change", mudancas)
    out.append("select setval('opportunity_code_seq', 239);")
    out.append("")
    for k, (item, desc, uom, qtd, preco) in enumerate([("PA-1000", "Balança de renda Renda+ R50", "UN", "2", "198000"),
                                                      ("SV-010", "Instalação e comissionamento na moega de recebimento", "SV", "2", "22000"),
                                                      ("SV-040", "Treinamento de operadores", "H", "16", "290"),
                                                      ("PA-1100", "Coletor automático de amostras CA-10", "UN", "1", "38500")]):
        itens.append(dict(opportunity_id=uid("opp", "OP-000231"), position=k, item_id=uid("item", item), item_code=item, description=desc,
                          uom=uom, quantity=qtd, unit_price=preco))
    ins("opportunity_item", itens)

    ativ = []
    cliente = {o[0]: o[1] for o in OPORTUNIDADES}
    for k, (tipo, assunto, dia, hora, dur, op, resp, sit, notas) in enumerate(ATIVIDADES):
        ativ.append(dict(id=uid("ativ", k), kind=TIPO_ATIV[tipo], subject=assunto, day=dia, start_time=hora, duration_min=dur,
                         partner_id=uid("partner", cliente[op]), lead_id=None, opportunity_id=uid("opp", op), owner=resp, status=sit, notes=notas,
                         completed_at=ts(dia, "18:00") if sit == "CONCLUIDA" else None, version=1, created_at=ts(dia, "07:00"),
                         created_by=QUEM, updated_at=ts(dia, "07:00"), updated_by=QUEM))
    ins("crm_activity", ativ)

    metas = []
    for mes, meta in [("2026-07-01", 400000), ("2026-08-01", 420000), ("2026-09-01", 450000), ("2026-10-01", 480000)]:
        metas.append(dict(id=uid("meta", mes), month=mes, owner=None, target_cents=cents(meta), updated_at=ts("2026-01-05"), updated_by="Beatriz Costa"))
    ins("sales_target", metas)


# Negócios: faturamento, pedidos, projetos, propostas, contas e títulos -----------------------------------------------

# Notas de saída de out/2025 a ago/2026 pela receita do exemplo fiscal (anexo I revenda, II industrialização, III
# serviços); setembro/2026 com as notas do mock (Cockpit-Dados e Fiscal). Meta de faturamento do gráfico do cockpit.
META_FATURAMENTO = {"2025-09": 300, "2025-10": 260, "2025-11": 260, "2025-12": 300, "2026-01": 180, "2026-02": 180, "2026-03": 220,
                    "2026-04": 280, "2026-05": 340, "2026-06": 380, "2026-07": 400, "2026-08": 380, "2026-09": 370}
CLIENTES_NOTA = ["C00015", "C00018", "C00021", "C00024", "C00027", "C00030", "C00033", "C00036", "C00042", "C00012", "C00045"]
COMPACTA_EM = {"2026-04", "2026-06", "2026-07", "2026-08"}
# Notas ligadas a pedidos da carteira (o saldo do pedido é o total menos o faturado): competência → pedido.
R50_DO_PEDIDO = {"2026-06": "PV-000118", "2026-07": "PV-000118", "2026-08": "PV-000118"}
ITEM_NOTA = {"Coletor automático CA-10": "PA-1100", "Peças de reposição — células de carga": "PA-1310",
             "Balança Renda+ R50 — 50% na entrega": "PA-1000", "Contrato de manutenção — setembro": "SV-050",
             "Balança Renda+ R50 Compacta": "PA-1010", "Aferição com pesos-padrão": "SV-020", "Instalação e comissionamento": "SV-010",
             "Instalação e treinamento": "SV-010"}
NOTA_DO_PEDIDO = {"004880": "PV-000124"}

# Pedidos da carteira (Cockpit-Dados): nº, cliente, confirmação, entrega, etapa do projeto, linhas (tipo, item, descrição, qtd, UM, unitário)
# e séries dos equipamentos. O saldo do mock é o total menos as notas ligadas.
PEDIDOS = [
    ("PV-000118", "C00012", "2026-05-20", "2026-09-29", "PRODUCAO",
     [("EQUIPAMENTO", "PA-1000", "Balança de renda Renda+ R50", "2", "UN", "181070"), ("SERVICO", "SV-010", "Instalação e comissionamento", "1", "SV", "22000")],
     ["0231-A", "0231-B"]),
    ("PV-000121", "C00018", "2026-07-14", "2026-10-15", "PRODUCAO",
     [("EQUIPAMENTO", "PA-1000", "Balança de renda Renda+ R50 — 2ª linha", "1", "UN", "198000"),
      ("SERVICO", "SV-010", "Instalação e comissionamento", "1", "SV", "22000"), ("SERVICO", "SV-040", "Treinamento de operadores", "56.896552", "H", "290")],
     ["0228-A"]),
    ("PV-000122", "C00021", "2026-08-05", "2026-10-22", "PRODUCAO",
     [("EQUIPAMENTO", "PA-1010", "Balança de renda Renda+ R50 Compacta", "1", "UN", "128000"),
      ("SERVICO", "SV-010", "Instalação e comissionamento", "1", "SV", "22000")], ["0226-A"]),
    ("PV-000124", "C00015", "2026-09-02", "2026-11-10", "PRODUCAO",
     [("EQUIPAMENTO", "PA-1000", "Balança de renda Renda+ R50 — Paranavaí", "1", "UN", "198000"),
      ("MATERIAL", "PA-1100", "Coletor automático de amostras CA-10", "1", "UN", "38500"), ("SERVICO", "SV-020", "Aferição com pesos-padrão", "1", "SV", "11500")],
     ["0236-A"]),
    ("PV-000125", "C00042", "2026-08-26", "2026-12-12", "ENGENHARIA",
     [("EQUIPAMENTO", "PA-1000", "Balança de renda Renda+ R50", "2", "UN", "206000")], ["0240-A", "0240-B"]),
    ("PV-000126", "C00033", "2026-06-30", "2027-01-20", "ENGENHARIA",
     [("EQUIPAMENTO", "PA-1000", "Balança de renda Renda+ R50 — fecularia nova", "2", "UN", "198000"),
      ("SERVICO", "SV-010", "Instalação e comissionamento", "2", "SV", "22000"), ("SERVICO", "SV-040", "Treinamento de operadores", "41.37931", "H", "290")],
     ["0241-A", "0241-B"]),
    ("PV-000127", "C00024", "2026-09-15", "2026-10-01", "PLANEJADO",
     [("SERVICO", "SV-050", "Contrato de manutenção e aferição — 36 meses", "36", "MES", "1500")], []),
    ("PV-000128", "C00027", "2026-09-18", "2026-10-05", "INSTALACAO",
     [("SERVICO", "SV-010", "Instalação da R50 Compacta", "1", "SV", "22000")], []),
]
MODELOS = [("MD00001", "Balança Renda+ R50", "PA-1000"), ("MD00002", "Balança Renda+ R50 Compacta", "PA-1010"),
           ("MD00003", "Coletor automático CA-10", "PA-1100"), ("MD00004", "Balança hidrostática H5", "PA-0900")]

# Contas (Cockpit-Dados): código, nome, tipo, banco, agência, conta, saldo em 24/09/2026.
CONTAS = [("CT001", "[BANCO PRINCIPAL] — movimento", "BANCO", "[BANCO PRINCIPAL]", "[0000]", "[00000-0]", 512480.20),
          ("CT002", "[BANCO 2] — pagamentos", "BANCO", "[BANCO 2]", "[0000]", "[00000-0]", 188230.10),
          ("CT003", "[BANCO 3] — aplicação", "BANCO", "[BANCO 3]", "[0000]", "[00000-0]", 138400.00),
          ("CT004", "Caixa da fábrica", "CAIXA", None, None, None, 3199.70)]
# Fluxo de caixa do mock (mil R$), out/2025 a set/2026: entradas no CT001; saídas pagas pelo CT002, abastecido por
# transferência do CT001 no mesmo dia. Setembro fecha 4,1% abaixo de agosto, como no indicador do mock.
MESES_CAIXA = ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]
ENTRADAS = [250, 270, 360, 200, 170, 190, 260, 350, 420, 450, 400, 410]
SAIDAS = [230, 240, 280, 240, 215, 235, 280, 320, 360, 380, 390, 445.99]
FORNECEDORES_PAGOS = [("F00101", "MATERIAIS", 0.38), ("F00104", "MATERIAIS", 0.27), ("F00107", "MATERIAIS", 0.2), ("F00113", "SERVICOS_TERCEIROS", 0.15)]
# Títulos em aberto: cliente/fornecedor, valor, emissão, vencimento, descrição.
A_RECEBER = [("C00012", 48675.39, "2026-09-10", "2026-10-10", "Saldo da 2ª parcela — PV-000118"),
             ("C00024", 28400.00, "2026-08-04", "2026-09-03", "NF-e 004812 — peças e aferição"),
             ("C00030", 35800.00, "2026-08-08", "2026-09-07", "NF-e 004826 — painel PR-12"),
             ("C00021", 80760.00, "2026-09-24", "2026-10-24", "NFS-e 000518 — instalação e treinamento"),
             ("C00027", 128000.00, "2026-09-18", "2026-10-18", "NF-e 004893 — R50 Compacta")]
A_PAGAR = [("F00107", "MATERIAIS", 18400.00, "2026-08-28", "2026-09-28", "Células de carga 50 kg — pedido PC-000418"),
           ("F00101", "MATERIAIS", 12350.00, "2026-09-01", "2026-09-30", "Tubos e chapas inox 304"),
           ("F00122", "SERVICOS_TERCEIROS", 2800.00, "2026-09-15", "2026-10-15", "Calibração RBC dos pesos-padrão")]


def mes_seguinte(m):
    y, mm = int(m[:4]), int(m[5:])
    return f"{y + (mm == 12)}-{1 if mm == 12 else mm + 1:02d}"


def negocios():
    sec("Negócios: modelos, pedidos, projetos, equipamentos e propostas")
    ins("equipment_model", [dict(id=uid("model", c), code=c, name=n, status="ATIVO", version=1, created_at=ts("2025-01-10"), created_by=QUEM)
                            for c, n, _ in MODELOS])
    modelo = {it: (uid("model", c), n) for c, n, it in MODELOS}
    pedidos, linhas, projetos, equips, parcelas = [], [], [], [], []
    for n, (cod, cli, conf, entrega, etapa, itens_pv, series) in enumerate(PEDIDOS):
        oid, pid = uid("so", cod), uid("project", cod)
        total = 0
        eq_seq = 0
        for k, (kind, item, desc, qtd, um, unit) in enumerate(itens_pv):
            lt = int(round(float(qtd) * float(unit) * 100))
            total += lt
            lid = uid("sol", cod, k)
            linhas.append(dict(id=lid, order_id=oid, position=k + 1, kind=kind, item_id=uid("item", item), description=desc, quantity=qtd, uom=um,
                               unit_price=unit, discount_cents=0, line_total_cents=lt))
            if kind == "EQUIPAMENTO":
                for j in range(int(float(qtd))):
                    serie = series[eq_seq]
                    eq_seq += 1
                    equips.append(dict(id=uid("equip", cod, serie), code=f"EQ{len(equips) + 1:05d}", project_id=pid, order_line_id=lid, line_seq=j + 1,
                                       model=modelo[item][1], model_id=modelo[item][0], item_id=uid("item", item), customer_id=uid("partner", cli),
                                       unit_id=uid("unit", cli, 0), unit_name=None, serial_number=serie, notes=None, status="ATIVO", accepted_on=None,
                                       warranty_start=None, version=1, created_at=ts(conf, "10:30"), created_by=QUEM))
        unit_name = ENDERECOS.get(cli, [("COBRANCA",)])[0]
        nome_unid = {c[0]: c for c in CLIENTES}[cli][4]
        un = f"Cobrança — {nome_unid}"
        for e in equips:
            if e["unit_name"] is None:
                e["unit_name"] = un
        pedidos.append(dict(id=oid, code=cod, customer_id=uid("partner", cli), unit_id=uid("unit", cli, 0), unit_name=un, proposal_id=None,
                            proposal_revision=None, contract_date=conf, promised_date=entrega, notes=None, status="CONFIRMED", total_cents=total,
                            confirmed_at=ts(conf, "15:00"), confirmed_by="Beatriz Costa",
                            snapshot_hash=hashlib.sha256(cod.encode()).hexdigest(), project_id=pid, cancelled_at=None, cancelled_by=None,
                            cancel_reason=None, version=2, created_at=ts(conf, "11:00"), created_by="Beatriz Costa", updated_at=ts(conf, "15:00"),
                            updated_by="Beatriz Costa"))
        parcelas.append(dict(order_id=oid, seq=1, due_date=entrega, amount_cents=total, milestone="Na entrega"))
        projetos.append(dict(id=pid, code=f"PJ{n + 1:05d}", name=f"{cod} — " + itens_pv[0][2], order_id=oid, order_code=cod,
                             customer_id=uid("partner", cli), unit_id=uid("unit", cli, 0), unit_name=un, stage=etapa, contract_delivery=entrega,
                             contract_cents=total, closed_reason=None, version=1, created_at=ts(conf, "15:00"), created_by="Beatriz Costa"))
    ins("sales_order", pedidos)
    ins("sales_order_line", linhas)
    ins("sales_order_installment", parcelas)
    ins("project", projetos)
    ins("equipment", equips)

    # Propostas das oportunidades em Proposta e Negociação: revisão 2 (08/09, 4% acima) substituída pela 3 (19/09).
    props, revs, plinhas = [], [], []
    for (cod, cli, titulo, valor, etapa, *_r) in OPORTUNIDADES:
        if etapa not in ("Proposta", "Negociação"):
            continue
        pcod = "PRO-000" + str(300 + int(cod[-2:]))
        prid = uid("proposal", pcod)
        nome_unid = {c[0]: c for c in CLIENTES}[cli][4]
        props.append(dict(id=prid, code=pcod, customer_id=uid("partner", cli), unit_id=uid("unit", cli, 0), unit_name=f"Cobrança — {nome_unid}",
                          title=titulo, status="ABERTA", outcome_reason=None, current_revision=3, version=3, created_at=ts("2026-08-25", "10:00"),
                          created_by=QUEM, updated_at=ts("2026-09-19", "10:12"), updated_by=QUEM, opportunity_id=uid("opp", cod)))
        for rev, dia, fator in [(2, "2026-09-08", 1.04), (3, "2026-09-19", 1.0)]:
            rid = uid("proprev", pcod, rev)
            tot = int(round(valor * fator * 100))
            revs.append(dict(id=rid, proposal_id=prid, revision=rev, status="EMITIDA", valid_until="2026-10-31", payment_terms="30% no pedido, 70% na entrega",
                             total_cents=tot, issued_at=ts(dia, "10:12"), issued_by=QUEM))
            plinhas.append(dict(id=uid("propline", pcod, rev), revision_id=rid, position=1, kind="EQUIPAMENTO" if valor > 100000 else "SERVICO",
                                item_id=None, description=titulo[:200], quantity="1", uom="UN" if valor > 100000 else "SV",
                                unit_price=f"{valor * fator:.2f}", discount_cents=0, line_total_cents=tot))
    ins("proposal", props)
    ins("proposal_revision", revs)
    ins("proposal_line", plinhas)

    sec("Faturamento: notas de saída de setembro/2025 a setembro/2026 e meta mensal")
    docs, dlinhas = [], []
    num = {"NF": 4600, "NFS": 380}
    precos = {"PA-1000": 99000, "PA-1010": 128000}

    def nota(serie, numero, cli, dia, linhas_nota, pedido=None, autorizacao="AUTORIZADA"):
        did = uid("doc", serie, numero)
        total = sum(v for _, _, _, v in linhas_nota)
        docs.append(dict(id=did, code=f"DF{len(docs) + 1:05d}", direction="SAIDA", partner_id=uid("partner", cli), series=serie, number=numero,
                         issue_date=dia, competence=dia[:7], total_cents=total, linked_cents=0, notes=None,
                         operation_nature="PRESTACAO_SERVICO" if serie == "NFS" else "VENDA_PRODUCAO", project_id=uid("project", pedido) if pedido else None,
                         classification_rev=1, status="ATIVO", cancel_reason=None, version=1, created_at=ts(dia, "16:00"), created_by=QUEM,
                         order_id=uid("so", pedido) if pedido else None, authorization_status=autorizacao,
                         authorization_protocol=None if autorizacao == "PENDENTE" else f"1352600{numero}"))
        for k, (desc, item, anexo, v) in enumerate(linhas_nota):
            dlinhas.append(dict(document_id=did, seq=k + 1, description=desc, kind="SERVICO" if anexo == "III" else "PRODUTO", amount_cents=v,
                                item_id=uid("item", item) if item else None, annex=anexo, annex_source="CLASSIFICACAO"))

    rot = 0
    for h in FISCAL["historicoReceita"]:
        m = h["competencia"]
        if m < "2025-09":
            continue
        a1, a2, a3 = cents(h["anexoI"]), cents(h["anexoII"]), cents(h["anexoIII"])
        prod = []
        if m in COMPACTA_EM:
            prod.append(("Balança Renda+ R50 Compacta", "PA-1010", cents(128000)))
        livre = a2 - sum(p[2] for p in prod)
        r50 = min(2, livre // cents(99000))
        for _ in range(r50):
            prod.append(("Balança Renda+ R50 — 50% do contrato", "PA-1000", cents(99000)))
        resto = a2 - sum(p[2] for p in prod)
        dias = [f"{m}-{d:02d}" for d in (6, 13, 20, 27)]
        # Uma nota por equipamento; o restante da industrialização em coletores e painéis.
        for k, (desc, item, v) in enumerate(prod):
            num["NF"] += 1
            pedido = R50_DO_PEDIDO.get(m) if item == "PA-1000" and k == len(prod) - 1 else None
            cli = "C00012" if pedido else CLIENTES_NOTA[rot % len(CLIENTES_NOTA)]
            rot += 1
            nota("1", f"{num['NF']:06d}", cli, dias[k % 4], [(desc, item, "II", v)], pedido)
        if resto > 0:
            num["NF"] += 1
            metade = resto // 2
            nota("1", f"{num['NF']:06d}", CLIENTES_NOTA[rot % len(CLIENTES_NOTA)], dias[1],
                 [("Coletor automático de amostras CA-10", "PA-1100", "II", metade), ("Painel de controle PR-12 com IHM", "PA-1200", "II", resto - metade),
                  ("Células de carga e peças de reposição", "PA-1310", "I", a1)])
            rot += 1
        contrato = cents(4500)
        num["NFS"] += 1
        nota("NFS", f"{num['NFS']:06d}", "C00024", dias[2], [("Contrato de manutenção — " + m, "SV-050", "III", contrato)])
        num["NFS"] += 1
        nota("NFS", f"{num['NFS']:06d}", CLIENTES_NOTA[rot % len(CLIENTES_NOTA)], dias[3],
             [("Instalação e comissionamento", "SV-010", "III", (a3 - contrato) * 7 // 10),
              ("Aferição e treinamento de operadores", "SV-020", "III", (a3 - contrato) - (a3 - contrato) * 7 // 10)])
        rot += 1
    clientes_nome = {c[1]: c[0] for c in CLIENTES}
    for n in FISCAL["notasSetembro2026"]:
        serie = "NFS" if n["modelo"] == "NFS-e" else "1"
        cli = clientes_nome[n["cliente"]]
        nota(serie, n["numero"], cli, n["emissao"], [(n["descricao"], ITEM_NOTA[n["descricao"]], n["anexo"], cents(n["valor"]))],
             NOTA_DO_PEDIDO.get(n["numero"]), n["autorizacao"])
    ins("business_document", docs)
    ins("document_line", dlinhas)
    ins("billing_target", [dict(month=f"{m}-01", target_cents=cents(v * 1000), updated_at=ts("2025-08-20"), updated_by="Beatriz Costa")
                           for m, v in META_FATURAMENTO.items()])

    sec("Financeiro: contas, recebimentos e pagamentos de 12 meses, transferências e títulos em aberto")
    abertura = {c[0]: cents(c[6]) for c in CONTAS}
    abertura["CT001"] -= cents(sum(ENTRADAS) * 1000) - cents(sum(SAIDAS) * 1000)
    ins("bank_account", [dict(id=uid("conta", c), code=c, name=n, kind=k, bank=b, agency=ag, account_number=cc, opening_cents=abertura[c],
                              opening_on="2025-09-30", status="ATIVO", version=1, created_at=ts("2025-09-30"), created_by=QUEM)
                         for c, n, k, b, ag, cc, _ in CONTAS])
    titulos, liq, aloc, movs, transf = [], [], [], [], []
    seq = {"CR": 0, "CP": 0, "RC": 0, "PG": 0, "TR": 0}

    def titulo(direcao, parte, cat, valor, emissao, venc, rotulo, recebido):
        pre = "CR" if direcao == "RECEIVABLE" else "CP"
        seq[pre] += 1
        tid = uid("titulo", pre, seq[pre])
        titulos.append(dict(id=tid, code=f"{pre}{seq[pre]:05d}", direction=direcao, counterparty_id=uid("partner", parte), origin_type="MANUAL",
                            origin_id=f"carga-{pre}-{seq[pre]}", origin_label=rotulo, project_id=None, category=cat, competence=emissao[:7],
                            issue_date=emissao, due_date=venc, original_cents=valor, lifecycle="ACTIVE", cancel_reason=None, version=1 + (recebido > 0),
                            created_at=ts(emissao), created_by=QUEM, received_cents=recebido, document_number=None, notes=None))
        return tid

    def liquida(direcao, tid, parte, conta, valor, dia):
        pre = "RC" if direcao == "RECEIVABLE" else "PG"
        seq[pre] += 1
        sid = uid("liq", pre, seq[pre])
        liq.append(dict(id=sid, code=f"{pre}{seq[pre]:05d}", direction=direcao, account_id=uid("conta", conta), counterparty_id=uid("partner", parte),
                        effective_date=dia, total_cents=valor, credit_cents=0, notes=None, status="POSTED", version=1, created_at=ts(dia, "11:00"),
                        created_by=QUEM))
        aloc.append(dict(settlement_id=sid, title_id=tid, amount_cents=valor))
        movs.append(dict(id=uid("mov", pre, seq[pre]), account_id=uid("conta", conta), effective_date=dia, amount_cents=valor if direcao == "RECEIVABLE" else -valor,
                         kind="SETTLEMENT", settlement_id=sid, reverses_id=None, transfer_id=None,
                         description=("Recebimento " if direcao == "RECEIVABLE" else "Pagamento ") + f"{pre}{seq[pre]:05d}", created_at=ts(dia, "11:00"),
                         created_by=QUEM))

    for i, m in enumerate(MESES_CAIXA):
        ent, sai = cents(ENTRADAS[i] * 1000), cents(SAIDAS[i] * 1000)
        fim = "20" if m == "2026-09" else "25"
        partes = [ent * 45 // 100, ent * 35 // 100]
        partes.append(ent - sum(partes))
        for k, v in enumerate(partes):
            cli = CLIENTES_NOTA[(i * 3 + k) % len(CLIENTES_NOTA)]
            dia = f"{m}-{(5, 15, int(fim))[k]:02d}"
            ant = f"{MESES_CAIXA[i - 1] if i else '2025-09'}-{(5, 15, 25)[k]:02d}"
            tid = titulo("RECEIVABLE", cli, "RECEITA_VENDA", v, ant, dia, "Parcela de venda — carga de demonstração", v)
            liquida("RECEIVABLE", tid, cli, "CT001", v, dia)
        pagos = 0
        for k, (forn, cat, fr) in enumerate(FORNECEDORES_PAGOS):
            v = sai - pagos if k == len(FORNECEDORES_PAGOS) - 1 else int(sai * fr)
            pagos += v
            dia = f"{m}-{(8, 12, 18, int(fim) - 1)[k]:02d}"
            tid = titulo("PAYABLE", forn, cat, v, f"{m}-01", dia, "Compra de materiais e serviços — carga de demonstração", v)
            liquida("PAYABLE", tid, forn, "CT002", v, dia)
        # O CT001 abastece o CT002 no início do mês com o que será pago.
        seq["TR"] += 1
        trid = uid("transf", seq["TR"])
        dia = f"{m}-02"
        transf.append(dict(id=trid, code=f"TR{seq['TR']:05d}", from_account_id=uid("conta", "CT001"), to_account_id=uid("conta", "CT002"),
                           effective_date=dia, amount_cents=sai, notes="Provisão para os pagamentos do mês", status="POSTED", reversal_reason=None,
                           reversal_date=None, reversed_at=None, reversed_by=None, version=1, created_at=ts(dia, "08:30"), created_by=QUEM))
        for conta, sinal in (("CT001", -1), ("CT002", 1)):
            movs.append(dict(id=uid("movtr", seq["TR"], conta), account_id=uid("conta", conta), effective_date=dia, amount_cents=sinal * sai,
                             kind="TRANSFER", settlement_id=None, reverses_id=None, transfer_id=trid, description=f"Transferência TR{seq['TR']:05d}",
                             created_at=ts(dia, "08:30"), created_by=QUEM))
    for cli, v, emi, venc, rotulo in A_RECEBER:
        titulo("RECEIVABLE", cli, "RECEITA_VENDA", cents(v), emi, venc, rotulo, 0)
    for forn, cat, v, emi, venc, rotulo in A_PAGAR:
        titulo("PAYABLE", forn, cat, cents(v), emi, venc, rotulo, 0)
    ins("financial_title", titulos)
    ins("settlement", liq)
    ins("settlement_allocation", aloc)
    ins("transfer", transf)
    ins("cash_movement", movs)
    out.append(f"select setval('sales_order_code_seq', 128), setval('project_code_seq', {len(PEDIDOS)}), setval('equipment_code_seq', {len(equips)}), "
               f"setval('proposal_code_seq', 339), setval('equipment_model_code_seq', {len(MODELOS)}), setval('business_document_code_seq', {len(docs)}), "
               f"setval('bank_account_code_seq', {len(CONTAS)}), setval('receivable_code_seq', {seq['CR']}), setval('payable_code_seq', {seq['CP']}), "
               f"setval('settlement_code_seq', {seq['RC']}), setval('payment_code_seq', {seq['PG']}), setval('transfer_code_seq', {seq['TR']});")
    out.append("")


def fiscal():
    sec("Fiscal: histórico de receita do Simples e obrigações do exemplo")
    ins("tax_revenue_history", [dict(competence=h["competencia"], annex1_cents=cents(h["anexoI"]), annex2_cents=cents(h["anexoII"]),
                                     annex3_cents=cents(h["anexoIII"]), annex4_cents=0, annex5_cents=0, source="DIGITADO",
                                     informed_by="Contabilidade", notes=None, version=1, created_at=ts("2026-09-02"), created_by="Beatriz Costa")
                                for h in FISCAL["historicoReceita"]])
    # As obrigações dos modelos ficam ligadas ao modelo (a geração do mês não as repete); a opção por IBS e CBS é avulsa.
    linhas = []
    for n, o in enumerate(FISCAL["obrigacoes"], start=1):
        feita = o["situacao"] in ("ENTREGUE", "PAGO")
        modelo = f"(select id from tax_obligation_template where name = {q(o['obrigacao'])})"
        kind = f"coalesce((select kind from tax_obligation_template where name = {q(o['obrigacao'])}), 'DECLARACAO')"
        linhas.append(f"  ({q(uid('obrig', n))}, {q(f'OB{n:05d}')}, {modelo}, {q(o['obrigacao'])}, {q(o['competencia'])}, {q(o['vencimento'])}, "
                      f"{q(o['esfera'])}, {kind}, {q(o['responsavel'])}, {q(o.get('detalhe'))}, {q(o['situacao'])}, "
                      f"{q(o['vencimento'] if feita else None)}, 1, {q(ts('2026-09-01'))}, {q(QUEM)})")
    out.append("insert into tax_obligation (id, code, template_id, name, competence, due_date, sphere, kind, responsible, detail, status, "
               "delivered_on, version, created_at, created_by) values")
    out.append(",\n".join(linhas) + ";")
    out.append(f"select setval('tax_obligation_code_seq', {len(FISCAL['obrigacoes'])});")
    out.append("")


def anexos():
    sec("Anexos do C00012 (aba Documentos)")
    pdf = "JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDwgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCnRyYWlsZXIKPDwgL1Jvb3QgMSAwIFIgPj4KJSVFT0YK"
    linhas = []
    for i, (kind, nome, dia, quem) in enumerate([("Contrato social", "contrato-social.pdf", "2025-03-12", "Beatriz Costa"),
                                                 ("Cartão CNPJ", "cartao-cnpj.pdf", "2025-03-12", "Beatriz Costa"),
                                                 ("Proposta assinada", "proposta-assinada.pdf", "2026-07-08", "Patrícia Gomes")]):
        linhas.append(f"  ('{uid('att', i)}', 'partner', '{uid('partner', 'C00012')}', '{kind}', '{nome}', 'application/pdf', 90, "
                      f"decode('{pdf}', 'base64'), '{ts(dia, '17:0' + str(i))}', '{quem}')")
    out.append("insert into attachment (id, owner_entity, owner_id, kind, file_name, content_type, size_bytes, content, uploaded_at, uploaded_by) values")
    out.append(",\n".join(linhas) + ";")
    out.append("")


def gerar():
    out.append("-- Carga de demonstração com os dados do mock Renda+ ERP MOCK. Gerado por tools/demo/carga_mock.py; não edite à mão.")
    out.append("-- Executada pelo servidor com RENDA_DEMO=recarregar, depois de apagar os dados de negócio (plataforma.demo.DemoDataLoader).")
    out.append("")
    colaboradores()
    auxiliares()
    parceiros()
    itens()
    estoque()
    calendarios()
    anexos()
    crm()
    negocios()
    fiscal()
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    texto = gerar()
    if "--verificar" in sys.argv:
        if not SAIDA.exists() or SAIDA.read_text(encoding="utf-8") != texto:
            print("carga-mock.sql desatualizado: rode python3 tools/demo/carga_mock.py")
            sys.exit(1)
        print("carga-mock.sql em dia")
    else:
        SAIDA.parent.mkdir(parents=True, exist_ok=True)
        SAIDA.write_text(texto, encoding="utf-8")
        print(f"{SAIDA.relative_to(RAIZ)}: {len(texto.splitlines())} linhas")
