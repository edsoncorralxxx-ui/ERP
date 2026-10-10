package br.com.fourtech.rendamais.financeiro.api;

import br.com.fourtech.rendamais.kernel.Money;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;

/**
 * Emissão e cancelamento de títulos por outros módulos (porta {@code TitleIssuanceApi} do B01). Roda na transação do
 * chamador: se a operação de origem desfaz, os títulos somem junto. O financeiro não conhece o módulo de origem; guarda
 * só a origem opaca ({@code originType} + {@code originId}), única por título (INV-FT-3).
 */
public interface TitleIssuanceApi {

    /** Uma parcela: {@code originId} identifica a origem do título (ex.: "{pedido}:{seq}"). */
    record Installment(String originId, LocalDate dueDate, Money amount, String label) { }

    record IssueRequest(String originType, UUID counterpartyId, UUID projectId, LocalDate issueDate, String category,
                        List<Installment> installments) { }

    /** Emite um título a receber por parcela; a origem que já tem título devolve o existente, sem criar outro. */
    List<UUID> issueReceivables(IssueRequest request);

    /**
     * Pedido de títulos a pagar (ex.: DAS da competência conferida): a competência é a da obrigação, não a do
     * vencimento; {@code category} é o código de uma categoria de despesa.
     */
    record PayableRequest(String originType, UUID counterpartyId, UUID projectId, LocalDate issueDate, String category,
                          YearMonth competence, List<Installment> installments) { }

    /** Emite um título a pagar por parcela; a origem que já tem título devolve o existente, sem criar outro. */
    List<UUID> issuePayables(PayableRequest request);

    /**
     * Novo cronograma das parcelas de uma origem: {@code installments} é o cronograma completo (cada parcela atualiza o
     * título da sua origem, reativa o cancelado ou cria um novo) e {@code removedOriginIds} as origens que saíram (os
     * títulos são cancelados com {@code reason}). Recusa tudo, sem mudar nada, se um título tiver valor recebido maior que
     * o novo valor, nota vinculada e o valor mudar, ou recebimento e precisar ser cancelado. Devolve os ids na ordem das parcelas.
     */
    record ScheduleRequest(String originType, UUID counterpartyId, UUID projectId, LocalDate issueDate, String category,
                           List<Installment> installments, List<String> removedOriginIds, String reason) { }

    List<UUID> reschedule(ScheduleRequest request);

    /**
     * Cancela os títulos ativos das origens, com motivo. Recusa (sem cancelar nenhum) se algum título tiver valor
     * recebido — a premissa B01 (PD-003) bloqueia o cancelamento com efeitos. Devolve os ids cancelados.
     */
    List<UUID> cancelOpen(String originType, List<String> originIds, String reason);
}
