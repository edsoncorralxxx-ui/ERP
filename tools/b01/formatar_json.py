"""Formata os catálogos JSON do B01 de forma legível e estável.

Objetos e listas cuja forma compacta cabe em LARGURA caracteres ficam em uma
linha; os demais são expandidos. Uso: python3 tools/b01/formatar_json.py [--verificar]
"""
import json
import sys
from pathlib import Path

LARGURA = 140
PASTA = Path(__file__).resolve().parents[2] / "docs" / "backend" / "b01"


def _compacto(valor):
    return json.dumps(valor, ensure_ascii=False, separators=(", ", ": "))


def formatar(valor, nivel=0):
    recuo = "  " * nivel
    texto = _compacto(valor)
    if not isinstance(valor, (dict, list)) or len(texto) + len(recuo) <= LARGURA:
        return texto
    filho = "  " * (nivel + 1)
    if isinstance(valor, dict):
        partes = [f"{filho}{json.dumps(k, ensure_ascii=False)}: {formatar(v, nivel + 1)}" for k, v in valor.items()]
        return "{\n" + ",\n".join(partes) + "\n" + recuo + "}"
    partes = [f"{filho}{formatar(v, nivel + 1)}" for v in valor]
    return "[\n" + ",\n".join(partes) + "\n" + recuo + "]"


def main():
    verificar = "--verificar" in sys.argv
    divergentes = []
    for arquivo in sorted(PASTA.glob("*.json")):
        original = arquivo.read_text(encoding="utf-8")
        esperado = formatar(json.loads(original)) + "\n"
        if original != esperado:
            divergentes.append(arquivo.name)
            if not verificar:
                arquivo.write_text(esperado, encoding="utf-8")
    if verificar and divergentes:
        print("Arquivos fora do formato:", ", ".join(divergentes))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
