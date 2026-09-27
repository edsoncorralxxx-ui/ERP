package br.com.fourtech.rendamais.acesso.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.util.ArrayList;
import java.util.List;

/** Regras mínimas de senha (ADR-005): 10 a 128 caracteres e diferente do nome de usuário. */
public final class PasswordPolicy {

    public static final int MIN = 10;
    public static final int MAX = 128;

    private PasswordPolicy() { }

    public static void check(String field, String password, String username, List<FieldIssue> issues) {
        if (password == null || password.length() < MIN) {
            issues.add(new FieldIssue(field, "A senha precisa de pelo menos " + MIN + " caracteres."));
        } else if (password.length() > MAX) {
            issues.add(new FieldIssue(field, "Máximo de " + MAX + " caracteres."));
        } else if (username != null && password.strip().equalsIgnoreCase(username)) {
            issues.add(new FieldIssue(field, "A senha não pode ser igual ao nome de usuário."));
        }
    }

    public static void require(String field, String password, String username) {
        List<FieldIssue> issues = new ArrayList<>();
        check(field, password, username, issues);
        if (!issues.isEmpty()) {
            throw new RuleViolationException("PASSWORD_INVALID", "A senha não atende às regras.", issues);
        }
    }
}
