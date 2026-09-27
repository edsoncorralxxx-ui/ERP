package br.com.fourtech.rendamais.kernel;

import java.util.List;

/** A situação atual do registro não permite a operação (HTTP 409, INVALID_STATE_TRANSITION). */
public class InvalidStateException extends DomainException {
    public InvalidStateException(String message) {
        super("INVALID_STATE_TRANSITION", message, List.of());
    }
}
