package br.com.fourtech.rendamais.comercial.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * Proposta comercial versionada (formulário "propostas" do B01). A revisão em rascunho é editável; emitida, fica imutável
 * e qualquer mudança cria a próxima revisão, preservando as anteriores. A proposta termina ganha (convertida em pedido)
 * ou perdida (com motivo).
 */
public record Proposal(UUID id, String code, UUID opportunityId, UUID customerId, UUID unitId, String unitName, String title, Status status,
                       String outcomeReason, List<Revision> revisions, long version, Instant createdAt, String createdBy,
                       Instant updatedAt, String updatedBy) {

    public enum Status { ABERTA, GANHA, PERDIDA }

    public enum RevisionStatus { RASCUNHO, EMITIDA }

    public record Revision(UUID id, int number, RevisionStatus status, LocalDate validUntil, String paymentTerms,
                           List<SalesLine> lines, long totalCents, Instant issuedAt, String issuedBy) {
        public Revision {
            lines = List.copyOf(lines);
        }
    }

    /**
     * Dados informados para a revisão em rascunho. Datas no formato AAAA-MM-DD. {@code opportunityId}: a oportunidade da
     * proposta (Sprint 11); só vale no cadastro.
     */
    public record Data(String opportunityId, String customerId, String unitId, String title, String validUntil, String paymentTerms,
                       List<SalesLine.Data> lines) { }

    /** Cliente e unidade já conferidos pelo caso de uso (cliente ativo, unidade dele). */
    public record Customer(UUID id, UUID unitId, String unitName) { }

    public Proposal {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(status);
        revisions = List.copyOf(revisions);
    }

    public static Proposal draft(String code, UUID opportunityId, Customer customer, Data data,
                                 Function<UUID, Optional<SalesLine.ItemInfo>> items, Instant now, String actor) {
        Valid v = validate(data, items, Set.of(), Set.of());
        Revision r = new Revision(UUID.randomUUID(), 1, RevisionStatus.RASCUNHO, v.validUntil, v.paymentTerms, v.lines,
                SalesLine.total(v.lines), null, null);
        return new Proposal(UUID.randomUUID(), code, opportunityId, customer.id(), customer.unitId(), customer.unitName(), v.title, Status.ABERTA,
                null, List.of(r), 1, now, actor, now, actor);
    }

    public Revision current() {
        return revisions.get(revisions.size() - 1);
    }

    public Optional<Revision> revision(int number) {
        return revisions.stream().filter(r -> r.number() == number).findFirst();
    }

    /** Altera a revisão em rascunho; revisão emitida é imutável (crie a próxima revisão). */
    public Proposal update(Customer customer, Data data, Function<UUID, Optional<SalesLine.ItemInfo>> items, Instant now, String actor) {
        requireOpen();
        Revision cur = current();
        if (cur.status() == RevisionStatus.EMITIDA) {
            throw new InvalidStateException("A revisão " + cur.number() + " da proposta " + code
                    + " já foi emitida e não muda. Crie uma nova revisão para alterar.");
        }
        if (!customer.id().equals(customerId) && revisions.size() > 1) {
            throw new RuleViolationException("PROPOSAL_INVALID", "O cliente não muda depois da primeira revisão emitida.",
                    List.of(new FieldIssue("customerId", "Fixo desde a revisão 1.")));
        }
        Set<UUID> known = new HashSet<>();
        Set<UUID> knownItems = new HashSet<>();
        revisions.forEach(r -> r.lines().forEach(l -> {
            known.add(l.id());
            if (l.itemId() != null) knownItems.add(l.itemId());
        }));
        Valid v = validate(data, items, knownItems, known);
        Revision r = new Revision(cur.id(), cur.number(), RevisionStatus.RASCUNHO, v.validUntil, v.paymentTerms, v.lines,
                SalesLine.total(v.lines), null, null);
        return with(customer, v.title, status, outcomeReason, replaceCurrent(r), now, actor);
    }

    /** IssueProposalRevision: congela a revisão em rascunho. */
    public Proposal issue(Instant now, String actor) {
        requireOpen();
        Revision cur = current();
        if (cur.status() == RevisionStatus.EMITIDA) return this;
        Revision r = new Revision(cur.id(), cur.number(), RevisionStatus.EMITIDA, cur.validUntil(), cur.paymentTerms(), cur.lines(),
                cur.totalCents(), now, actor);
        return with(customer(), title, status, outcomeReason, replaceCurrent(r), now, actor);
    }

    /** Nova revisão em rascunho, copiada da última emitida. */
    public Proposal newRevision(Instant now, String actor) {
        requireOpen();
        Revision cur = current();
        if (cur.status() == RevisionStatus.RASCUNHO) {
            throw new InvalidStateException("A revisão " + cur.number() + " ainda está em rascunho; altere-a ou emita-a antes.");
        }
        List<Revision> all = new ArrayList<>(revisions);
        all.add(new Revision(UUID.randomUUID(), cur.number() + 1, RevisionStatus.RASCUNHO, cur.validUntil(), cur.paymentTerms(),
                cur.lines().stream().map(SalesLine::copy).toList(), cur.totalCents(), null, null));
        return with(customer(), title, status, outcomeReason, all, now, actor);
    }

    /** Perdida, com motivo. */
    public Proposal lose(String reason, Instant now, String actor) {
        requireOpen();
        String why = SalesLine.text(reason);
        if (why == null || why.length() > 500) {
            throw new RuleViolationException("PROPOSAL_INVALID", "Informe o motivo da perda.",
                    List.of(new FieldIssue("reason", why == null ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        return with(customer(), title, Status.PERDIDA, why, revisions, now, actor);
    }

    /** Ganha: a revisão emitida vigente virou pedido. */
    public Proposal win(Instant now, String actor) {
        requireOpen();
        if (current().status() != RevisionStatus.EMITIDA) {
            throw new InvalidStateException("Emita a revisão " + current().number() + " antes de converter a proposta em pedido.");
        }
        return with(customer(), title, Status.GANHA, null, revisions, now, actor);
    }

    public Map<String, String[]> diff(Proposal other) {
        Map<String, String[]> d = new LinkedHashMap<>();
        Map<String, String> a = flat();
        Map<String, String> b = other.flat();
        b.forEach((k, v) -> {
            if (!Objects.equals(a.get(k), v)) d.put(k, new String[]{a.get(k), v});
        });
        return d;
    }

    Map<String, String> flat() {
        Map<String, String> m = new LinkedHashMap<>();
        Revision r = current();
        m.put("title", title);
        m.put("unit", unitName);
        m.put("status", status.name());
        m.put("revision", Integer.toString(r.number()));
        m.put("revisionStatus", r.status().name());
        m.put("validUntil", r.validUntil().toString());
        m.put("paymentTerms", r.paymentTerms());
        m.put("lines", SalesLine.summary(r.lines()));
        m.put("totalCents", Long.toString(r.totalCents()));
        return m;
    }

    /** Proposta vazia, para registrar o cadastro como mudanças a partir do nada. */
    public static Map<String, String[]> created(Proposal p) {
        Map<String, String[]> d = new LinkedHashMap<>();
        p.flat().forEach((k, v) -> {
            if (v != null) d.put(k, new String[]{null, v});
        });
        return d;
    }

    private Customer customer() {
        return new Customer(customerId, unitId, unitName);
    }

    private List<Revision> replaceCurrent(Revision r) {
        List<Revision> all = new ArrayList<>(revisions);
        all.set(all.size() - 1, r);
        return all;
    }

    private Proposal with(Customer c, String newTitle, Status newStatus, String reason, List<Revision> revs, Instant now, String actor) {
        return new Proposal(id, code, opportunityId, c.id(), c.unitId(), c.unitName(), newTitle, newStatus, reason, revs, version + 1, createdAt,
                createdBy, now, actor);
    }

    private void requireOpen() {
        if (status != Status.ABERTA) {
            throw new InvalidStateException("A proposta " + code + " está " + (status == Status.GANHA ? "ganha" : "perdida")
                    + " e não muda mais.");
        }
    }

    private record Valid(String title, LocalDate validUntil, String paymentTerms, List<SalesLine> lines) { }

    private static Valid validate(Data data, Function<UUID, Optional<SalesLine.ItemInfo>> items, Set<UUID> knownItems, Set<UUID> known) {
        List<FieldIssue> issues = new ArrayList<>();
        String title = SalesLine.text(data.title());
        if (title == null) issues.add(new FieldIssue("title", "Informe o título da proposta."));
        else if (title.length() > 200) issues.add(new FieldIssue("title", "Máximo de 200 caracteres."));
        LocalDate validUntil = date(data.validUntil(), "validUntil", "Informe a validade.", issues);
        String terms = SalesLine.text(data.paymentTerms());
        if (terms != null && terms.length() > 500) issues.add(new FieldIssue("paymentTerms", "Máximo de 500 caracteres."));
        List<SalesLine> lines = SalesLine.validate(data.lines(), items, knownItems, known, issues);
        if (!issues.isEmpty()) throw new RuleViolationException("PROPOSAL_INVALID", "Corrija os campos indicados.", issues);
        return new Valid(title, validUntil, terms, lines);
    }

    static LocalDate date(String raw, String field, String required, List<FieldIssue> issues) {
        String t = SalesLine.text(raw);
        if (t == null) {
            if (required != null) issues.add(new FieldIssue(field, required));
            return null;
        }
        try {
            LocalDate d = LocalDate.parse(t);
            if (d.getYear() < 2000 || d.getYear() > 2100) {
                issues.add(new FieldIssue(field, "Data fora do intervalo aceito."));
                return null;
            }
            return d;
        } catch (DateTimeParseException e) {
            issues.add(new FieldIssue(field, "Data inválida."));
            return null;
        }
    }
}
