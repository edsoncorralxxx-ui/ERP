package br.com.fourtech.rendamais.auditoria.api;

/** Porta pública: registra uma operação confirmada. Deve ser chamada dentro da transação do comando. */
public interface AuditTrail {
    void record(AuditEntry entry);
}
