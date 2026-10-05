package br.com.fourtech.rendamais.comercial.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Oportunidade de venda (conceito OPORTUNIDADE do B01), no desenho do SAP Business One: potencial, previsão de fechamento,
 * nível de interesse, etapa do funil com percentual de fechamento, concorrentes e o resumo (ganha ou perdida). A próxima
 * ação é opcional (Sprint 13: no mock ela é a próxima atividade da agenda). Ganha quando uma proposta dela vira pedido.
 */
public record Opportunity(UUID id, String code, String name, UUID leadId, UUID customerId, UUID unitId, String unitName,
                          String owner, Crm.Source source, Interest interest, long potentialCents, LocalDate expectedClose,
                          String stage, Status status, LossReason lossReason, String lossNote, Instant closedAt,
                          String wonOrderCode, Crm.NextAction nextAction, LocalDate lastInteraction, String notes,
                          List<Competitor> competitors, long version, Instant createdAt, String createdBy, Instant updatedAt,
                          String updatedBy) {

    public enum Status { ABERTA, GANHA, PERDIDA }

    public enum Interest { BAIXO, MEDIO, ALTO }

    /** Motivos de perda: lista fixa (decisão do PO em 03/10/2026); "Outro" exige o texto. */
    public enum LossReason { PRECO, PRAZO, CONCORRENTE, SEM_ORCAMENTO, DESISTIU, OUTRO }

    public enum Threat { BAIXA, MEDIA, ALTA }

    public record Competitor(String name, Threat threat, String notes) { }

    public record CompetitorData(String name, String threat, String notes) { }

    /** Com quem é a oportunidade: a prospecção, o cliente (com a unidade) ou os dois, depois da conversão. */
    public record Party(UUID leadId, UUID customerId, UUID unitId, String unitName) { }

    public record Data(String name, String leadId, String customerId, String unitId, String owner, String source, String interest,
                       String potentialCents, String expectedClose, String notes, String nextActionDate, String nextActionNote,
                       List<CompetitorData> competitors) { }

    public Opportunity {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(status);
        nextAction = nextAction == null ? Crm.NextAction.NONE : nextAction;
        competitors = List.copyOf(competitors);
    }

    /** OpenOpportunity: começa na primeira etapa do funil, com a próxima ação. */
    public static Opportunity open(String code, Party party, Data data, String firstStage, String defaultOwner, LocalDate today,
                                   Instant now, String actor) {
        Valid v = validate(data, defaultOwner, today);
        return new Opportunity(UUID.randomUUID(), code, v.name, party.leadId(), party.customerId(), party.unitId(),
                party.unitName(), v.owner, v.source, v.interest, v.potentialCents, v.expectedClose, firstStage, Status.ABERTA,
                null, null, null, null, v.nextAction, null, v.notes, v.competitors, 1, now, actor, now, actor);
    }

    /** Oportunidade criada junto com uma proposta feita sem ela: já na etapa Proposta, sem próxima ação além da validade. */
    public static Opportunity forProposal(String code, Party party, String name, long potentialCents, LocalDate validUntil,
                                          String stage, Instant now, String actor) {
        return new Opportunity(UUID.randomUUID(), code, name, party.leadId(), party.customerId(), party.unitId(), party.unitName(),
                actor, Crm.Source.OUTRO, Interest.MEDIO, potentialCents, validUntil, stage, Status.ABERTA, null, null, null, null,
                new Crm.NextAction(validUntil, "Acompanhar a proposta até a validade"), null, null, List.of(), 1, now, actor,
                now, actor);
    }

    public boolean isOpen() {
        return status == Status.ABERTA;
    }

    /** Altera os dados (não a etapa nem a situação). Precisa continuar com a próxima ação. */
    public Opportunity update(Party party, Data data, LocalDate today, Instant now, String actor) {
        requireOpen();
        Valid v = validate(data, owner, null);
        if (!v.nextAction.equals(nextAction) && v.nextAction.date().isBefore(today)) {
            throw invalid("nextActionDate", "A próxima ação não pode ser antes de hoje.");
        }
        return new Opportunity(id, code, v.name, party.leadId(), party.customerId(), party.unitId(), party.unitName(), v.owner,
                v.source, v.interest, v.potentialCents, v.expectedClose, stage, status, null, null, null, null, v.nextAction,
                lastInteraction, v.notes, v.competitors, version + 1, createdAt, createdBy, now, actor);
    }

    /** Muda de etapa (avança ou volta), com a nova próxima ação. */
    public Opportunity changeStage(String newStage, Crm.NextAction next, Instant now, String actor) {
        requireOpen();
        return with(newStage, Status.ABERTA, null, null, null, null, next, lastInteraction, now, actor);
    }

    /** Leva a oportunidade a uma etapa sem pedir outra próxima ação (proposta emitida). */
    public Opportunity reach(String newStage, Instant now, String actor) {
        if (!isOpen() || newStage.equals(stage)) return this;
        return with(newStage, Status.ABERTA, null, null, null, null, nextAction, lastInteraction, now, actor);
    }

    public Opportunity lose(String rawReason, String rawNote, Instant now, String actor) {
        requireOpen();
        List<FieldIssue> issues = new ArrayList<>();
        LossReason reason = Crm.choice(LossReason.class, rawReason, "lossReason", null, "Escolha o motivo da perda.", issues);
        String note = Crm.text(rawNote, "lossNote", 500, reason == LossReason.OUTRO ? "Descreva o motivo." : null, issues);
        if (!issues.isEmpty()) throw new RuleViolationException("OPPORTUNITY_INVALID", "Corrija os campos indicados.", issues);
        return with(stage, Status.PERDIDA, reason, note, now, null, Crm.NextAction.NONE, lastInteraction, now, actor);
    }

    /** Ganha: a proposta dela virou o pedido {@code orderCode}. */
    public Opportunity win(String orderCode, Instant now, String actor) {
        if (status == Status.GANHA) return this;
        requireOpen();
        return with(stage, Status.GANHA, null, null, now, orderCode, Crm.NextAction.NONE, lastInteraction, now, actor);
    }

    public Opportunity interacted(LocalDate on, Crm.NextAction next, Instant now, String actor) {
        LocalDate last = lastInteraction == null || on.isAfter(lastInteraction) ? on : lastInteraction;
        return with(stage, status, lossReason, lossNote, closedAt, wonOrderCode, isOpen() ? next : nextAction, last, now, actor);
    }

    public Opportunity linkCustomer(UUID newCustomerId, UUID newUnitId, String newUnitName, Instant now, String actor) {
        if (newCustomerId.equals(customerId)) return this;
        return new Opportunity(id, code, name, leadId, newCustomerId, newUnitId, newUnitName, owner, source, interest,
                potentialCents, expectedClose, stage, status, lossReason, lossNote, closedAt, wonOrderCode, nextAction,
                lastInteraction, notes, competitors, version + 1, createdAt, createdBy, now, actor);
    }

    public Map<String, String> flat() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("lead", leadId == null ? null : leadId.toString());
        m.put("customer", customerId == null ? null : customerId.toString());
        m.put("unit", unitName);
        m.put("owner", owner);
        m.put("source", source.name());
        m.put("interest", interest.name());
        m.put("potentialCents", Long.toString(potentialCents));
        m.put("expectedClose", expectedClose == null ? null : expectedClose.toString());
        m.put("stage", stage);
        m.put("status", status.name());
        m.put("lossReason", lossReason == null ? null : lossReason.name());
        m.put("lossNote", lossNote);
        m.put("wonOrder", wonOrderCode);
        m.put("nextActionDate", nextAction.date() == null ? null : nextAction.date().toString());
        m.put("nextActionNote", nextAction.note());
        m.put("notes", notes);
        m.put("competitors", competitors.isEmpty() ? null : competitors.stream()
                .map(c -> c.name() + " (" + c.threat().name() + ")").collect(Collectors.joining("; ")));
        return m;
    }

    private Opportunity with(String newStage, Status newStatus, LossReason reason, String note, Instant closed, String order,
                             Crm.NextAction next, LocalDate last, Instant now, String actor) {
        return new Opportunity(id, code, name, leadId, customerId, unitId, unitName, owner, source, interest, potentialCents,
                expectedClose, newStage, newStatus, reason, note, closed, order, next, last, notes, competitors, version + 1,
                createdAt, createdBy, now, actor);
    }

    private void requireOpen() {
        if (!isOpen()) {
            throw new InvalidStateException("A oportunidade " + code + " está " + (status == Status.GANHA ? "ganha" : "perdida")
                    + " e não muda mais.");
        }
    }

    private record Valid(String name, String owner, Crm.Source source, Interest interest, long potentialCents,
                         LocalDate expectedClose, String notes, Crm.NextAction nextAction, List<Competitor> competitors) { }

    private static Valid validate(Data d, String defaultOwner, LocalDate today) {
        List<FieldIssue> issues = new ArrayList<>();
        String name = Crm.text(d.name(), "name", 200, "Dê um nome à oportunidade.", issues);
        String owner = Crm.text(d.owner(), "owner", 100, null, issues);
        if (owner == null) owner = defaultOwner;
        Crm.Source source = Crm.choice(Crm.Source.class, d.source(), "source", Crm.Source.OUTRO, null, issues);
        Interest interest = Crm.choice(Interest.class, d.interest(), "interest", Interest.MEDIO, null, issues);
        long potential = 0;
        String rawPotential = SalesLine.text(d.potentialCents());
        if (rawPotential != null) {
            try {
                potential = Long.parseLong(rawPotential);
                if (potential < 0) issues.add(new FieldIssue("potentialCents", "O potencial não pode ser negativo."));
            } catch (NumberFormatException e) {
                issues.add(new FieldIssue("potentialCents", "Valor inválido."));
            }
        }
        LocalDate expected = Crm.date(d.expectedClose(), "expectedClose", null, issues);
        String notes = Crm.text(d.notes(), "notes", 2000, null, issues);
        // Opcional desde a Sprint 13: a próxima ação do mock é a próxima atividade planejada na agenda.
        Crm.NextAction next = Crm.nextAction(d.nextActionDate(), d.nextActionNote(), false, today, issues);
        List<Competitor> competitors = new ArrayList<>();
        List<CompetitorData> raw = d.competitors() == null ? List.of() : d.competitors();
        for (int i = 0; i < raw.size(); i++) {
            CompetitorData c = raw.get(i);
            String cn = Crm.text(c.name(), "competitors[" + i + "].name", 120, "Informe o concorrente.", issues);
            Threat t = Crm.choice(Threat.class, c.threat(), "competitors[" + i + "].threat", Threat.MEDIA, null, issues);
            String cnotes = Crm.text(c.notes(), "competitors[" + i + "].notes", 300, null, issues);
            if (cn != null) competitors.add(new Competitor(cn, t, cnotes));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("OPPORTUNITY_INVALID", "Corrija os campos indicados.", issues);
        return new Valid(name, owner, source, interest, potential, expected, notes, next, competitors);
    }

    static RuleViolationException invalid(String field, String message) {
        return new RuleViolationException("OPPORTUNITY_INVALID", "Corrija os campos indicados.",
                List.of(new FieldIssue(field, message)));
    }
}
