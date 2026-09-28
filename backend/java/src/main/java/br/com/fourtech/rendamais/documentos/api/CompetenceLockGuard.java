package br.com.fourtech.rendamais.documentos.api;

import java.time.YearMonth;

/**
 * Porta implementada pelo módulo fiscal (decisão do PO na Sprint 7): nota com competência fechada não é registrada nem
 * cancelada. Chamada dentro da transação do documento; a implementação segura a competência até o fim dela, para que
 * um fechamento simultâneo espere a nota terminar.
 */
public interface CompetenceLockGuard {

    /** Recusa ({@code TAX_PERIOD_CLOSED}) se a competência estiver fechada; {@code operation} vai na mensagem. */
    void checkOpen(YearMonth competence, String operation);
}
