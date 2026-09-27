package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.plataforma.web.Versions;

import java.util.Locale;

/** Peças comuns às APIs de cadastros: versão do If-Match e filtro de situação. */
final class ApiSupport {

    private ApiSupport() { }

    record DeactivateRequest(String reason) { }

    /** Versão lida pelo cliente; sem If-Match a alteração é recusada com 428. */
    static long version(String ifMatch) {
        return Versions.required(ifMatch);
    }

    /** ATIVO (padrão), INATIVO ou TODOS (nulo). */
    static Partner.Status status(String raw) {
        return "TODOS".equalsIgnoreCase(raw) ? null : Partner.Status.valueOf(raw.toUpperCase(Locale.ROOT));
    }
}
