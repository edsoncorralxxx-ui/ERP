#!/usr/bin/env python3
"""Gera a carga de demonstração com os dados do mock Renda+ ERP MOCK (Sprint 13).

Saída: backend/java/src/main/resources/demo/carga-mock.sql, executada pelo servidor quando RENDA_DEMO=recarregar
(plataforma.demo.DemoDataLoader), depois de apagar os dados de negócio. Os identificadores são estáveis (uuid5), para
a mesma carga gerar sempre os mesmos registros. Uso: python3 tools/demo/carga_mock.py [--verificar]
"""
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
    ("EL-3010", "Inversor de frequência 5 cv", "ELE", "MRC2", "UN", "3", "2", "2890.00", "85044090"),
]
PERFIL_EL3001 = dict(complement="16 entradas digitais, 8 saídas a relé", gtin="[GTIN]", manufacturer="[FABRICANTE]",
                     manufacturerPartNumber="CLP16-R8", warrantyMonths=12, traceability="Lote", grossWeightKg="0.650", netWeightKg="0.480",
                     dimensions="0,12 × 0,09 × 0,07 m", notes="Usar somente firmware homologado pela engenharia.", purchaseUom="UN",
                     conversionFactor="1.000000", leadTimeDays=35, minLot="1.000", preferredSupplier="Eletro Componentes Sul Ltda.",
                     supplierItemCode="CLP-16R8", valuationMethod="Custo médio ponderado", defaultWarehouse="01", spedType="01 — Matéria-prima")


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
                 defaultWarehouse="01", valuationMethod="Custo médio ponderado")
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
