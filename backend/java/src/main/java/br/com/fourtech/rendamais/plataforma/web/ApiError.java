package br.com.fourtech.rendamais.plataforma.web;

import java.util.List;

/** Corpo padronizado de erro da API (documento 13, §1). Nunca contém stack trace, SQL ou segredos. */
public record ApiError(String code, String message, List<Detail> details, String correlationId, boolean retryable) {
    public record Detail(String field, String message) { }
}
