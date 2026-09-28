package br.com.fourtech.rendamais.financeiro.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Consulta pública de títulos pela origem ou pelo id (porta {@code TitleQueryApi} do B01). */
public interface TitleQueryApi {

    /**
     * {@code status}: OPEN, PARTIAL, SETTLED, RENEGOTIATED ou CANCELLED; saldo em centavos. {@code direction}:
     * RECEIVABLE ou PAYABLE.
     */
    record TitleView(UUID id, String code, String originId, String label, LocalDate dueDate, String competence,
                     long originalCents, long receivedCents, long balanceCents, String status, String direction,
                     UUID counterpartyId, UUID projectId) { }

    List<TitleView> byOrigin(String originType, List<String> originIds);

    /** Títulos pelos ids, na ordem de vencimento; ids inexistentes ficam de fora. Lê na transação do chamador. */
    List<TitleView> byIds(List<UUID> ids);

    /** Títulos a receber do parceiro, não cancelados, na ordem de vencimento. */
    List<TitleView> activeReceivablesOf(UUID counterpartyId);
}
