package br.com.fourtech.rendamais.kernel;

import java.util.List;

/** Erro de negócio com código estável e mensagem em português. */
public abstract class DomainException extends RuntimeException {

    private final String code;
    private final List<FieldIssue> details;

    protected DomainException(String code, String message, List<FieldIssue> details) {
        super(message);
        this.code = code;
        this.details = List.copyOf(details);
    }

    public String code() {
        return code;
    }

    public List<FieldIssue> details() {
        return details;
    }

    /** Detalhe de um campo ou valor relacionado ao erro. */
    public record FieldIssue(String field, String message) { }
}
