package br.com.fourtech.rendamais.financeiro.api;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * Pendências do fluxo de caixa informadas por outros módulos: obrigações que ainda não viraram título e que o caixa
 * mostra como pendência, nunca como zero (formulário "caixa"). O módulo que conhece a obrigação implementa esta porta
 * (ex.: o fiscal, para a competência encerrada sem guia DAS); o financeiro não depende dele.
 */
public interface CashFlowPendingSource {

    /** {@code month}: mês do fluxo em que a obrigação cai; {@code reference}: o que a origina (ex.: competência AAAA-MM). */
    record Pending(YearMonth month, String category, String reference, String message) { }

    /** Pendências com mês entre {@code from} e {@code to}, olhando a data de hoje. */
    List<Pending> pendingBetween(YearMonth from, YearMonth to, LocalDate today);
}
