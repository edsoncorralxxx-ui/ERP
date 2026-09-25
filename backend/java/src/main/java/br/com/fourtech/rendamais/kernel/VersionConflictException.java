package br.com.fourtech.rendamais.kernel;

import java.util.List;

/** O registro foi alterado desde a versão lida pelo cliente (HTTP 412). */
public class VersionConflictException extends DomainException {

    private final long currentVersion;

    public VersionConflictException(String entity, long expected, long current) {
        super("VERSION_MISMATCH",
                "O registro foi alterado por outra pessoa ou janela. Versão lida: " + expected + "; versão atual: " + current + ".",
                List.of(new FieldIssue("version", "atual=" + current)));
        this.currentVersion = current;
    }

    public long currentVersion() {
        return currentVersion;
    }
}
