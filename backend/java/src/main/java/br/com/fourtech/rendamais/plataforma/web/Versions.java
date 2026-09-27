package br.com.fourtech.rendamais.plataforma.web;

/** Leitura do cabeçalho If-Match ("3", W/"3") como número de versão. */
public final class Versions {

    private Versions() { }

    /** Versão lida pelo cliente; sem If-Match a alteração é recusada com 428. */
    public static long required(String ifMatch) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new PreconditionRequiredException();
        }
        return parse(ifMatch);
    }

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
