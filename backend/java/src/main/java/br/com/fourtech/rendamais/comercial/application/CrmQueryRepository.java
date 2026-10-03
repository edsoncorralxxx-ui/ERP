package br.com.fourtech.rendamais.comercial.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Leituras da agenda e do funil do CRM (Sprint 11). */
public interface CrmQueryRepository {

    /** Prospecção aberta com próxima ação, ou oportunidade aberta (com ou sem próxima ação). */
    record AgendaRow(String kind, UUID id, String code, String name, String party, String owner, String stage,
                     LocalDate nextActionDate, String nextActionNote) { }

    /** Oportunidade aberta com o potencial e a etapa atual. */
    record OpenRow(UUID id, String stage, long potentialCents) { }

    /** Oportunidade fechada (ganha ou perdida) com a data e o motivo. */
    record ClosedRow(UUID id, String status, long potentialCents, Instant closedAt, String lossReason) { }

    /** Passagem por etapa, para a conversão (IND-016). */
    record Passage(UUID opportunityId, String toStage, String status, Instant changedAt) { }

    List<AgendaRow> agenda(String owner);

    List<OpenRow> open(String owner);

    List<ClosedRow> closed(Instant from, Instant to, String owner);

    List<Passage> passages(String owner);
}
