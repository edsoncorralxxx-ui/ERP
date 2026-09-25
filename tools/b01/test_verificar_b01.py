"""Testes do verificador do B01: casos negativos devem ser detectados.

Uso: python3 -m unittest discover -s tools/b01
"""
import unittest

import verificar_b01 as v


def base():
    catalogos = {n: v.carregar(f"{n}.json") for n in ("modulos", "conceitos", "eventos", "indicadores", "pendencias", "formularios", "menu")}
    telas = v.ler_csv(v.MAPA_TELAS, "Tela ID")
    recursos = v.ler_csv(v.MATRIZ_AN, "ID")
    adrs = sorted({p["adr"] for p in catalogos["pendencias"]["pendencias"]})
    return catalogos, telas, recursos, adrs


def executar(catalogos, telas, recursos, adrs):
    return v.Verificador(catalogos, telas, recursos, adrs).executar()


def modulo(c, mid):
    return next(m for m in c["modulos"]["modulos"] if m["id"] == mid)


def formulario(c, fid):
    return next(f for f in c["formularios"]["formularios"] if f["id"] == fid)


class TestVerificador(unittest.TestCase):
    def setUp(self):
        self.c, self.telas, self.recursos, self.adrs = base()

    def erros(self):
        return executar(self.c, self.telas, self.recursos, self.adrs)

    def test_catalogos_atuais_consistentes(self):
        self.assertEqual(self.erros(), [])

    def test_detecta_ciclo_entre_modulos(self):
        modulo(self.c, "financeiro")["dependsOn"].append("comercial")
        self.assertTrue(any("ciclo entre módulos" in e for e in self.erros()))

    def test_detecta_formulario_ausente(self):
        self.c["formularios"]["formularios"] = [f for f in self.c["formularios"]["formularios"] if f["id"] != "pedidos"]
        self.assertTrue(any("formulários sem contrato: pedidos" in e for e in self.erros()))

    def test_detecta_dinheiro_sem_brl(self):
        campo = next(cp for cp in formulario(self.c, "pedidos")["campos"] if cp["nome"] == "total")
        campo["unidade"] = "reais"
        self.assertTrue(any("dinheiro exige unidade BRL" in e for e in self.erros()))

    def test_detecta_pendencia_inexistente(self):
        formulario(self.c, "pedidos")["validacoes"].append({"regra": "x", "pendencia": "PD-999"})
        self.assertTrue(any("PD-999" in e for e in self.erros()))

    def test_detecta_evento_de_modulo_nao_dependente(self):
        cmd = formulario(self.c, "clientes")["comandos"][0]
        cmd["eventos"] = ["SettlementPosted"]
        self.assertTrue(any("não pode emitir SettlementPosted" in e for e in self.erros()))

    def test_detecta_consumidor_sem_dependencia(self):
        ev = next(e for e in self.c["eventos"]["eventos"] if e["type"] == "SettlementPosted")
        ev["consumidores"].append("cadastros")
        self.assertTrue(any("consumidor cadastros não depende" in e for e in self.erros()))

    def test_detecta_razao_sem_politica_de_denominador(self):
        ind = next(i for i in self.c["indicadores"]["indicadores"] if i["id"] == "IND-004")
        ind["zeroDenominator"] = None
        self.assertTrue(any("NOT_CALCULABLE" in e for e in self.erros()))

    def test_detecta_ausente_tratado_como_zero(self):
        self.c["indicadores"]["indicadores"][0]["missingPolicy"] = "ZERO"
        self.assertTrue(any("ausente não é zero" in e for e in self.erros()))

    def test_detecta_ciclo_entre_indicadores(self):
        ind = next(i for i in self.c["indicadores"]["indicadores"] if i["id"] == "IND-001")
        ind["dependencias"] = ["IND-004"]
        self.assertTrue(any("ciclo entre indicadores" in e for e in self.erros()))

    def test_detecta_permissao_nao_declarada(self):
        formulario(self.c, "pedidos")["permissoes"].remove("sales_order.confirm")
        self.assertTrue(any("sales_order.confirm não declarada" in e for e in self.erros()))

    def test_detecta_tela_fora_do_menu(self):
        for m in self.c["menu"]["modulos"]:
            m["itens"] = [i for i in m["itens"] if i.get("tela") != "pedidos"]
        self.assertTrue(any("tela sem lugar no menu lateral: pedidos" in e for e in self.erros()))

    def test_detecta_recurso_analitico_fora_do_menu(self):
        for m in self.c["menu"]["modulos"]:
            m["itens"] = [i for i in m["itens"] if i.get("recurso") != "AN-033"]
        self.assertTrue(any("recurso analítico sem lugar no menu lateral: AN-033" in e for e in self.erros()))

    def test_detecta_modulo_fora_da_ordem_do_design_system(self):
        mods = self.c["menu"]["modulos"]
        mods[0], mods[1] = mods[1], mods[0]
        self.assertTrue(any("Barra lateral do design system" in e for e in self.erros()))

    def test_encontrar_ciclo_simples(self):
        self.assertIsNone(v.encontrar_ciclo({"a": ["b"], "b": []}))
        self.assertEqual(v.encontrar_ciclo({"a": ["b"], "b": ["a"]}), ["a", "b", "a"])


if __name__ == "__main__":
    unittest.main()
