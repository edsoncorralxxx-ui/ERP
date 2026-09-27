package br.com.fourtech.rendamais.acesso.api;

import br.com.fourtech.rendamais.kernel.DomainException;

import java.util.List;

/** O perfil do usuário não permite a ação (HTTP 403). A negativa é registrada na auditoria. */
public class AccessDeniedException extends DomainException {

    private final String permission;
    private final String username;

    public AccessDeniedException(String username, String permission) {
        super("FORBIDDEN", "Seu perfil não permite esta operação (" + permission + ").",
                List.of(new FieldIssue("permission", permission)));
        this.permission = permission;
        this.username = username;
    }

    public String permission() {
        return permission;
    }

    public String username() {
        return username;
    }
}
