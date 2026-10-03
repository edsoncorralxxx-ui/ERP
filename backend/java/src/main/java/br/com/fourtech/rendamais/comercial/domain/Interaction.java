package br.com.fourtech.rendamais.comercial.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Interação com a empresa (atividade do SAP B1): ligação, e-mail, WhatsApp, visita, reunião ou nota, ligada à prospecção e
 * ou à oportunidade, com a próxima ação combinada. Fica como foi registrada; corrigir é registrar outra.
 */
public record Interaction(UUID id, UUID leadId, UUID opportunityId, Kind kind, LocalDate occurredOn, String contactName,
                          String summary, Crm.NextAction nextAction, Instant createdAt, String createdBy) {

    public enum Kind { LIGACAO, EMAIL, WHATSAPP, VISITA, REUNIAO, NOTA }

    public record Data(String leadId, String opportunityId, String kind, String occurredOn, String contactName, String summary,
                       String nextActionDate, String nextActionNote) { }

    public Interaction {
        nextAction = nextAction == null ? Crm.NextAction.NONE : nextAction;
    }

    /**
     * Interação conferida. {@code nextRequired}: a oportunidade aberta sempre precisa da próxima ação (decisão do PO em
     * 03/10/2026).
     */
    public static Interaction record(UUID leadId, UUID opportunityId, Data d, boolean nextRequired, LocalDate today, Instant now,
                                     String actor) {
        List<FieldIssue> issues = new ArrayList<>();
        Kind kind = Crm.choice(Kind.class, d.kind(), "kind", null, "Escolha o tipo.", issues);
        LocalDate on = Crm.date(d.occurredOn(), "occurredOn", null, issues);
        if (on == null && SalesLine.text(d.occurredOn()) == null) on = today;
        if (on != null && on.isAfter(today)) {
            issues.add(new FieldIssue("occurredOn", "A interação já aconteceu: a data não pode ser futura. Para o que vai acontecer, use a próxima ação."));
        }
        String contact = Crm.text(d.contactName(), "contactName", 120, null, issues);
        String summary = Crm.text(d.summary(), "summary", 2000, "Resuma o que foi conversado.", issues);
        Crm.NextAction next = Crm.nextAction(d.nextActionDate(), d.nextActionNote(), nextRequired, today, issues);
        if (!issues.isEmpty()) throw new RuleViolationException("INTERACTION_INVALID", "Corrija os campos indicados.", issues);
        return new Interaction(UUID.randomUUID(), leadId, opportunityId, kind, on, contact, summary, next, now, actor);
    }
}
