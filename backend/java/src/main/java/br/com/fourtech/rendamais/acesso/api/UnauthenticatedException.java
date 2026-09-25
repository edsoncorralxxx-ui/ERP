package br.com.fourtech.rendamais.acesso.api;

import br.com.fourtech.rendamais.kernel.DomainException;

import java.util.List;

/** Sem sessão válida, ou credenciais recusadas (HTTP 401). */
public class UnauthenticatedException extends DomainException {

    public UnauthenticatedException(String code, String message) {
        super(code, message, List.of());
    }

    public static UnauthenticatedException sessionRequired() {
        return new UnauthenticatedException("UNAUTHENTICATED", "Sessão expirada ou inexistente. Entre novamente.");
    }
}
