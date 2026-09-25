package br.com.fourtech.rendamais.kernel;

import java.util.List;

/** Violação de regra de negócio ou de validação de campos (HTTP 422). */
public class RuleViolationException extends DomainException {
    public RuleViolationException(String code, String message, List<FieldIssue> details) {
        super(code, message, details);
    }
}
