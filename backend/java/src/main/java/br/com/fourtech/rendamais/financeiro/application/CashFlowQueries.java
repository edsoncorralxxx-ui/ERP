package br.com.fourtech.rendamais.financeiro.application;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Consultas do fluxo de caixa (IND-009 e IND-010). Valores em centavos, sempre positivos (entradas e saídas separadas); as
 * somas da grade são feitas sobre estas mesmas linhas, para que a composição de cada valor sempre confira com ele.
 * {@code accountId} nulo = consolidado (transferências se anulam e ficam de fora do realizado); {@code category} não nulo
 * recorta pelas categorias dos títulos (o realizado pelas alocações; transferências e saldos iniciais ficam de fora).
 */
public interface CashFlowQueries {

    /** Saldo realizado no fim do dia {@code date}: saldos iniciais vigentes + movimentos até a data. */
    long realizedBalance(LocalDate date, UUID accountId);

    /** Linha da composição de um valor. {@code targetKind}: receivable, payable, bank-account ou transfer. */
    record Line(String targetKind, UUID targetId, String code, LocalDate date, String description, String party, long amountCents) { }

    /** Movimentos (ou alocações, com categoria) de entrada ({@code incoming}) ou saída entre as datas. */
    List<Line> realizedLines(LocalDate from, LocalDate to, UUID accountId, String category, boolean incoming);

    /** Títulos a receber ({@code incoming}) ou a pagar com saldo e vencimento entre as datas. */
    List<Line> titleLines(LocalDate from, LocalDate to, String category, boolean incoming);

    /** Saldo realizado de cada conta no fim do dia {@code date} (composição do saldo inicial). */
    List<Line> accountBalances(LocalDate date, UUID accountId);
}
