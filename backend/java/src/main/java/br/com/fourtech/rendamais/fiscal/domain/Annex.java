package br.com.fourtech.rendamais.fiscal.domain;

/** Anexos do Simples Nacional (LC 123/2006). A receita de cada linha de nota cai num anexo pela classificação do item. */
public enum Annex {
    I("Anexo I — Comércio"), II("Anexo II — Indústria"), III("Anexo III — Serviços"), IV("Anexo IV — Serviços"),
    V("Anexo V — Serviços");

    private final String label;

    Annex(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** Anexo pelo nome (I a V); nulo se não for um anexo. */
    public static Annex parse(String raw) {
        if (raw == null) return null;
        for (Annex a : values()) if (a.name().equals(raw.strip())) return a;
        return null;
    }
}
