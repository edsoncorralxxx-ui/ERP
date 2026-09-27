package br.com.fourtech.rendamais.financeiro.api;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Consulta pública de títulos pela origem (porta {@code TitleQueryApi} do B01). */
public interface TitleQueryApi {

    /** {@code status}: OPEN, PARTIAL, SETTLED, RENEGOTIATED ou CANCELLED; saldo em centavos. */
    record TitleView(UUID id, String code, String originId, String label, LocalDate dueDate, String competence,
                     long originalCents, long receivedCents, long balanceCents, String status) { }

    List<TitleView> byOrigin(String originType, List<String> originIds);
}
