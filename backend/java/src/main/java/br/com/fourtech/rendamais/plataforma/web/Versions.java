package br.com.fourtech.rendamais.plataforma.web;

/** Leitura do cabeçalho If-Match ("3", W/"3") como número de versão. */
public final class Versions {

    private Versions() { }

    public static long parse(String ifMatch) {
        String v = ifMatch.strip();
        if (v.startsWith("W/")) {
            v = v.substring(2);
        }
        v = v.replace("\"", "");
        if (!v.matches("\\d{1,18}")) {
            throw new IllegalArgumentException("If-Match inválido");
        }
        return Long.parseLong(v);
    }
}
