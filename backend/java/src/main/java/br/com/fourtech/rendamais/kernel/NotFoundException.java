package br.com.fourtech.rendamais.kernel;

import java.util.List;

/** Registro inexistente ou fora do escopo do usuário (HTTP 404). */
public class NotFoundException extends DomainException {
    public NotFoundException(String message) {
        super("NOT_FOUND", message, List.of());
    }
}
