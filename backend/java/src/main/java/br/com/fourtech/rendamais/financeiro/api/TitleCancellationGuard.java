package br.com.fourtech.rendamais.financeiro.api;

import java.util.List;
import java.util.UUID;

/**
 * Conferência pedida a outros módulos antes de o financeiro cancelar títulos (ex.: documentos recusa cancelar parcela
 * com nota vinculada — PD-003). O módulo que tem o efeito implementa esta porta; o financeiro não depende dele.
 * Chamada na transação do cancelamento, com os títulos já bloqueados; recusa lançando
 * {@link br.com.fourtech.rendamais.kernel.InvalidStateException} com a explicação.
 */
public interface TitleCancellationGuard {

    /** Título a cancelar: id, código e valor original em centavos. */
    record Cancelling(UUID titleId, String code, long originalCents) { }

    void checkCancellable(List<Cancelling> titles);
}
