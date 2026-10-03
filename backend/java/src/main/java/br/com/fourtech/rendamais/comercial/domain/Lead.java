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

/**
 * Prospecção (formulário "prospeccao" do B01, conceito LEAD): empresa ou unidade-alvo com classificação, etapa e próxima
 * ação. Não é venda nem cliente; vira cliente por {@link #linkCustomer} (como o lead do SAP B1 que passa a cliente).
 */
public record Lead(UUID id, String code, String companyName, String tradeName, String city, String state, HasRenda hasRenda,
                   Integer rating, Stage stage, String discardReason, String owner, Crm.Source source, String contactName,
                   String contactPhone, String contactEmail, String notes, UUID partnerId, Crm.NextAction nextAction,
                   LocalDate lastInteraction, UUID importId, long version, Instant createdAt, String createdBy,
                   Instant updatedAt, String updatedBy) {

    public enum HasRenda { SIM, NAO, DESCONHECIDO }

    public enum Stage { IDENTIFICADO, CONTATADO, INTERESSADO, DESCARTADO }

    /** Dados informados. Estrela vazia é desconhecida (nunca zero); datas AAAA-MM-DD. */
    public record Data(String companyName, String tradeName, String city, String state, String hasRenda, Integer rating,
                       String stage, String owner, String source, String contactName, String contactPhone, String contactEmail,
                       String notes, String nextActionDate, String nextActionNote) { }

    public Lead {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(stage);
        nextAction = nextAction == null ? Crm.NextAction.NONE : nextAction;
    }

    public static Lead register(String code, Data data, String defaultOwner, UUID importId, LocalDate today, Instant now,
                                String actor) {
        Valid v = validate(data, defaultOwner, today, true);
        if (v.stage == Stage.DESCARTADO) {
            throw invalid("stage", "Cadastre a prospecção numa etapa aberta; o descarte pede o motivo.");
        }
        return new Lead(UUID.randomUUID(), code, v.companyName, v.tradeName, v.city, v.state, v.hasRenda, v.rating, v.stage, null,
                v.owner, v.source, v.contactName, v.contactPhone, v.contactEmail, v.notes, null, v.nextAction, null, importId, 1,
                now, actor, now, actor);
    }

    /** Altera os dados. Uma prospecção descartada volta a ficar aberta quando recebe uma etapa aberta. */
    public Lead update(Data data, LocalDate today, Instant now, String actor) {
        Valid v = validate(data, owner, null, false);
        if (v.stage == Stage.DESCARTADO && stage != Stage.DESCARTADO) {
            throw invalid("stage", "Use Descartar, com o motivo.");
        }
        if (v.nextAction.isSet() && !v.nextAction.equals(nextAction) && v.nextAction.date().isBefore(today)) {
            throw invalid("nextActionDate", "A próxima ação não pode ser antes de hoje.");
        }
        String reason = v.stage == Stage.DESCARTADO ? discardReason : null;
        return new Lead(id, code, v.companyName, v.tradeName, v.city, v.state, v.hasRenda, v.rating, v.stage, reason, v.owner,
                v.source, v.contactName, v.contactPhone, v.contactEmail, v.notes, partnerId, v.nextAction, lastInteraction,
                importId, version + 1, createdAt, createdBy, now, actor);
    }

    /** Descarta com motivo; a próxima ação deixa de valer. */
    public Lead discard(String reason, Instant now, String actor) {
        if (stage == Stage.DESCARTADO) return this;
        String why = SalesLine.text(reason);
        if (why == null || why.length() > 500) {
            throw invalid("reason", why == null ? "Informe o motivo do descarte." : "Máximo de 500 caracteres.");
        }
        return new Lead(id, code, companyName, tradeName, city, state, hasRenda, rating, Stage.DESCARTADO, why, owner, source,
                contactName, contactPhone, contactEmail, notes, partnerId, Crm.NextAction.NONE, lastInteraction, importId,
                version + 1, createdAt, createdBy, now, actor);
    }

    /** Interação registrada: a próxima ação passa a ser a dela, e a prospecção identificada passa a contatada. */
    public Lead interacted(LocalDate on, Crm.NextAction next, Instant now, String actor) {
        if (stage == Stage.DESCARTADO) {
            throw new InvalidStateException("A prospecção " + code + " está descartada. Reabra-a antes de registrar contato.");
        }
        Stage s = stage == Stage.IDENTIFICADO ? Stage.CONTATADO : stage;
        LocalDate last = lastInteraction == null || on.isAfter(lastInteraction) ? on : lastInteraction;
        return new Lead(id, code, companyName, tradeName, city, state, hasRenda, rating, s, discardReason, owner, source,
                contactName, contactPhone, contactEmail, notes, partnerId, next, last, importId, version + 1, createdAt,
                createdBy, now, actor);
    }

    /** O cliente criado a partir desta prospecção (ou um cliente que já existia). */
    public Lead linkCustomer(UUID customerId, Instant now, String actor) {
        if (customerId.equals(partnerId)) return this;
        return new Lead(id, code, companyName, tradeName, city, state, hasRenda, rating, stage, discardReason, owner, source,
                contactName, contactPhone, contactEmail, notes, customerId, nextAction, lastInteraction, importId, version + 1,
                createdAt, createdBy, now, actor);
    }

    /** Quando a oportunidade aberta a partir dela é aberta, a prospecção passa a Interessado. */
    public Lead interested(Instant now, String actor) {
        if (stage == Stage.INTERESSADO) return this;
        if (stage == Stage.DESCARTADO) {
            throw new InvalidStateException("A prospecção " + code + " está descartada. Reabra-a antes de abrir uma oportunidade.");
        }
        return new Lead(id, code, companyName, tradeName, city, state, hasRenda, rating, Stage.INTERESSADO, discardReason, owner,
                source, contactName, contactPhone, contactEmail, notes, partnerId, nextAction, lastInteraction, importId,
                version + 1, createdAt, createdBy, now, actor);
    }

    public Map<String, String> flat() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("companyName", companyName);
        m.put("tradeName", tradeName);
        m.put("city", city);
        m.put("state", state);
        m.put("hasRenda", hasRenda.name());
        m.put("rating", rating == null ? null : rating.toString());
        m.put("stage", stage.name());
        m.put("discardReason", discardReason);
        m.put("owner", owner);
        m.put("source", source.name());
        m.put("contactName", contactName);
        m.put("contactPhone", contactPhone);
        m.put("contactEmail", contactEmail);
        m.put("notes", notes);
        m.put("customer", partnerId == null ? null : partnerId.toString());
        m.put("nextActionDate", nextAction.date() == null ? null : nextAction.date().toString());
        m.put("nextActionNote", nextAction.note());
        return m;
    }

    private record Valid(String companyName, String tradeName, String city, String state, HasRenda hasRenda, Integer rating,
                         Stage stage, String owner, Crm.Source source, String contactName, String contactPhone,
                         String contactEmail, String notes, Crm.NextAction nextAction) { }

    private static Valid validate(Data d, String defaultOwner, LocalDate today, boolean creating) {
        List<FieldIssue> issues = new ArrayList<>();
        String company = Crm.text(d.companyName(), "companyName", 200, "Informe a empresa.", issues);
        String trade = Crm.text(d.tradeName(), "tradeName", 200, null, issues);
        String city = Crm.text(d.city(), "city", 120, null, issues);
        String uf = Crm.state(d.state(), issues);
        HasRenda renda = Crm.choice(HasRenda.class, d.hasRenda(), "hasRenda", HasRenda.DESCONHECIDO, null, issues);
        Integer rating = d.rating();
        if (rating != null && (rating < 1 || rating > 5)) {
            issues.add(new FieldIssue("rating", "De 1 a 5 estrelas, ou vazio quando não se sabe."));
            rating = null;
        }
        Stage stage = Crm.choice(Stage.class, d.stage(), "stage", Stage.IDENTIFICADO, null, issues);
        String owner = Crm.text(d.owner(), "owner", 100, null, issues);
        if (owner == null) owner = defaultOwner;
        Crm.Source source = Crm.choice(Crm.Source.class, d.source(), "source", Crm.Source.OUTRO, null, issues);
        String contact = Crm.text(d.contactName(), "contactName", 120, null, issues);
        String phone = Crm.text(d.contactPhone(), "contactPhone", 40, null, issues);
        String email = Crm.text(d.contactEmail(), "contactEmail", 200, null, issues);
        if (email != null && !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) issues.add(new FieldIssue("contactEmail", "E-mail inválido."));
        String notes = Crm.text(d.notes(), "notes", 2000, null, issues);
        Crm.NextAction next = Crm.nextAction(d.nextActionDate(), d.nextActionNote(), false, creating ? today : null, issues);
        if (!issues.isEmpty()) throw new RuleViolationException("LEAD_INVALID", "Corrija os campos indicados.", issues);
        return new Valid(company, trade, city, uf, renda, rating, stage, owner, source, contact, phone, email, notes, next);
    }

    public static RuleViolationException invalid(String field, String message) {
        return new RuleViolationException("LEAD_INVALID", "Corrija os campos indicados.", List.of(new FieldIssue(field, message)));
    }
}
