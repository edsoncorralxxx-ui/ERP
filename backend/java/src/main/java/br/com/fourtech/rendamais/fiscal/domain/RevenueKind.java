package br.com.fourtech.rendamais.fiscal.domain;

/** Tipo da receita e da nota: Produto (NF-e) ou Serviço (NFS-e), cada um no seu anexo. */
public enum RevenueKind {
    PRODUTO("produto"), SERVICO("serviço");

    private final String label;

    RevenueKind(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
