package br.com.fourtech.rendamais.comercial.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Pedido de venda (formulário "pedidos" do B01, agregado SalesOrder). Em rascunho, linhas e parcelas mudam livremente;
 * a confirmação acontece uma única vez (INV-SO-5), exige as invariantes INV-SO-1..3 e congela o pedido — depois disso só
 * aditivo (fora desta sprint) ou cancelamento.
 */
public record SalesOrder(UUID id, String code, UUID customerId, UUID unitId, String unitName, UUID proposalId,
                         Integer proposalRevision, LocalDate contractDate, LocalDate promisedDate, String notes,
                         List<SalesLine> lines, List<Installment> installments, Status status, Confirmation confirmation,
                         Cancellation cancellation, long version, Instant createdAt, String createdBy, Instant updatedAt,
                         String updatedBy) {

    public enum Status { DRAFT, CONFIRMED, IN_EXECUTION, COMPLETED, CANCELLED }

    public record Installment(int seq, LocalDate dueDate, long amountCents, String milestone) {
        String summary() {
            return seq + ": " + dueDate + " " + amountCents + (milestone == null ? "" : " (" + milestone + ")");
        }
    }

    public record Confirmation(Instant at, String by, String snapshotHash, UUID projectId) { }

    public record Cancellation(Instant at, String by, String reason) { }

    public record InstallmentData(String dueDate, String amountCents, String milestone) { }

    /** Dados informados para o pedido em rascunho. Datas no formato AAAA-MM-DD; valores em centavos. */
    public record Data(String customerId, String unitId, String contractDate, String promisedDate, String notes,
                       List<SalesLine.Data> lines, List<InstallmentData> installments) { }

    public static final int MAX_INSTALLMENTS = 120;

    public SalesOrder {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(status);
        lines = List.copyOf(lines);
        installments = List.copyOf(installments);
    }

    public static SalesOrder draft(String code, Proposal.Customer customer, Data data,
                                   Function<UUID, Optional<SalesLine.ItemInfo>> items, Instant now, String actor) {
        Valid v = validate(data, items, Set.of(), Set.of());
        return new SalesOrder(UUID.randomUUID(), code, customer.id(), customer.unitId(), customer.unitName(), null, null,
                v.contractDate, v.promisedDate, v.notes, v.lines, v.installments, Status.DRAFT, null, null, 1, now, actor, now, actor);
    }

    /** ConvertProposalToOrder: pedido em rascunho com as linhas da revisão emitida, sem parcelas ainda. */
    public static SalesOrder fromProposal(String code, Proposal proposal, Proposal.Customer customer, LocalDate contractDate,
                                          Instant now, String actor) {
        Proposal.Revision r = proposal.current();
        return new SalesOrder(UUID.randomUUID(), code, customer.id(), customer.unitId(), customer.unitName(), proposal.id(),
                r.number(), contractDate, null, null, r.lines().stream().map(SalesLine::copy).toList(), List.of(), Status.DRAFT,
                null, null, 1, now, actor, now, actor);
    }

    public long totalCents() {
        return SalesLine.total(lines);
    }

    public long scheduledCents() {
        long t = 0;
        for (Installment i : installments) t = Math.addExact(t, i.amountCents());
        return t;
    }

    /** Linhas, preços e parcelas só mudam em rascunho (INV-SO-4). */
    public SalesOrder update(Proposal.Customer customer, Data data, Function<UUID, Optional<SalesLine.ItemInfo>> items,
                             Instant now, String actor) {
        requireDraft("alterado");
        if (proposalId != null && !customer.id().equals(customerId)) {
            throw new RuleViolationException("ORDER_INVALID", "O cliente do pedido vem da proposta e não muda.",
                    List.of(new FieldIssue("customerId", "Fixo pela proposta.")));
        }
        Set<UUID> knownItems = lines.stream().map(SalesLine::itemId).filter(Objects::nonNull).collect(Collectors.toSet());
        Set<UUID> knownIds = lines.stream().map(SalesLine::id).collect(Collectors.toSet());
        Valid v = validate(data, items, knownItems, knownIds);
        return new SalesOrder(id, code, customer.id(), customer.unitId(), customer.unitName(), proposalId, proposalRevision,
                v.contractDate, v.promisedDate, v.notes, v.lines, v.installments, status, null, null, version + 1, createdAt,
                createdBy, now, actor);
    }

    /**
     * Confere as invariantes da confirmação: ao menos uma linha (INV-SO-1, já garantida na validação) e parcelas que
     * somam exatamente o total (INV-SO-3). Violação: 422 ORDER_INVALID, sem efeito nenhum.
     */
    public void checkConfirmable() {
        requireDraft("confirmado");
        List<FieldIssue> issues = new ArrayList<>();
        if (lines.isEmpty()) issues.add(new FieldIssue("lines", "Inclua ao menos uma linha."));
        if (totalCents() <= 0) issues.add(new FieldIssue("lines", "O total do pedido deve ser maior que zero."));
        if (installments.isEmpty()) issues.add(new FieldIssue("installments", "Informe as parcelas."));
        else if (scheduledCents() != totalCents()) {
            issues.add(new FieldIssue("installments", "A soma das parcelas (" + brl(scheduledCents()) + ") difere do total do pedido ("
                    + brl(totalCents()) + ") em " + brl(totalCents() - scheduledCents()) + "."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("ORDER_INVALID", "O pedido não pode ser confirmado.", issues);
    }

    /** Retrato das linhas e parcelas confirmadas (SHA-256), guardado na confirmação. */
    public String snapshotHash() {
        String text = code + "|" + customerId + "|" + unitId + "|" + SalesLine.summary(lines) + "|"
                + installments.stream().map(Installment::summary).collect(Collectors.joining(";"));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public SalesOrder confirm(UUID projectId, Instant now, String actor) {
        checkConfirmable();
        return new SalesOrder(id, code, customerId, unitId, unitName, proposalId, proposalRevision, contractDate, promisedDate, notes,
                lines, installments, Status.CONFIRMED, new Confirmation(now, actor, snapshotHash(), projectId), null, version + 1,
                createdAt, createdBy, now, actor);
    }

    public SalesOrder cancel(String reason, Instant now, String actor) {
        if (status == Status.CANCELLED) return this;
        if (status == Status.COMPLETED) throw new InvalidStateException("O pedido " + code + " já foi concluído e não é cancelado.");
        return new SalesOrder(id, code, customerId, unitId, unitName, proposalId, proposalRevision, contractDate, promisedDate, notes,
                lines, installments, Status.CANCELLED, confirmation, new Cancellation(now, actor, reason), version + 1, createdAt,
                createdBy, now, actor);
    }

    public Map<String, String[]> diff(SalesOrder other) {
        Map<String, String[]> d = new LinkedHashMap<>();
        Map<String, String> a = flat();
        Map<String, String> b = other.flat();
        b.forEach((k, v) -> {
            if (!Objects.equals(a.get(k), v)) d.put(k, new String[]{a.get(k), v});
        });
        return d;
    }

    public static Map<String, String[]> created(SalesOrder o) {
        Map<String, String[]> d = new LinkedHashMap<>();
        d.put("code", new String[]{null, o.code()});
        o.flat().forEach((k, v) -> {
            if (v != null) d.put(k, new String[]{null, v});
        });
        return d;
    }

    Map<String, String> flat() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("unit", unitName);
        m.put("contractDate", contractDate.toString());
        m.put("promisedDate", promisedDate == null ? null : promisedDate.toString());
        m.put("notes", notes);
        m.put("lines", SalesLine.summary(lines));
        m.put("installments", installments.isEmpty() ? null : installments.stream().map(Installment::summary).collect(Collectors.joining("; ")));
        m.put("totalCents", Long.toString(totalCents()));
        m.put("status", status.name());
        return m;
    }

    private void requireDraft(String what) {
        if (status != Status.DRAFT) {
            throw new InvalidStateException("O pedido " + code + " está " + label(status) + " e não pode ser " + what
                    + ". Depois da confirmação, mudanças só por aditivo.");
        }
    }

    static String label(Status s) {
        return switch (s) {
            case DRAFT -> "em rascunho";
            case CONFIRMED -> "confirmado";
            case IN_EXECUTION -> "em execução";
            case COMPLETED -> "concluído";
            case CANCELLED -> "cancelado";
        };
    }

    /** R$ 23.579,23 */
    static String brl(long cents) {
        String sign = cents < 0 ? "-" : "";
        long abs = Math.abs(cents);
        String inteiro = String.format("%,d", abs / 100).replace(',', '.');
        return sign + "R$ " + inteiro + "," + String.format("%02d", abs % 100);
    }

    private record Valid(LocalDate contractDate, LocalDate promisedDate, String notes, List<SalesLine> lines,
                         List<Installment> installments) { }

    private static Valid validate(Data data, Function<UUID, Optional<SalesLine.ItemInfo>> items, Set<UUID> knownItems, Set<UUID> knownIds) {
        List<FieldIssue> issues = new ArrayList<>();
        LocalDate contract = Proposal.date(data.contractDate(), "contractDate", "Informe a data de contratação.", issues);
        LocalDate promised = Proposal.date(data.promisedDate(), "promisedDate", null, issues);
        if (contract != null && promised != null && promised.isBefore(contract)) {
            issues.add(new FieldIssue("promisedDate", "O prazo prometido não pode ser anterior à contratação."));
        }
        String notes = SalesLine.text(data.notes());
        if (notes != null && notes.length() > 1000) issues.add(new FieldIssue("notes", "Máximo de 1000 caracteres."));
        List<SalesLine> lines = SalesLine.validate(data.lines(), items, knownItems, knownIds, issues);

        List<InstallmentData> raw = data.installments() == null ? List.of() : data.installments();
        if (raw.size() > MAX_INSTALLMENTS) issues.add(new FieldIssue("installments", "Máximo de " + MAX_INSTALLMENTS + " parcelas."));
        List<Installment> installments = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            InstallmentData d = raw.get(i);
            String f = "installments[" + i + "].";
            LocalDate due = Proposal.date(d.dueDate(), f + "dueDate", "Informe o vencimento.", issues);
            if (due != null && contract != null && due.isBefore(contract)) {
                issues.add(new FieldIssue(f + "dueDate", "Vencimento anterior à data de contratação."));
            }
            String a = SalesLine.text(d.amountCents());
            long amount = 0;
            if (a == null || !a.matches("\\d{1,15}")) issues.add(new FieldIssue(f + "amountCents", a == null ? "Informe o valor." : "Valor inválido."));
            else if ((amount = Long.parseLong(a)) <= 0) issues.add(new FieldIssue(f + "amountCents", "Valor deve ser maior que zero."));
            String milestone = SalesLine.text(d.milestone());
            if (milestone != null && milestone.length() > 200) issues.add(new FieldIssue(f + "milestone", "Máximo de 200 caracteres."));
            if (due != null && amount > 0) installments.add(new Installment(i + 1, due, amount, milestone));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("ORDER_INVALID", "Corrija os campos indicados.", issues);
        return new Valid(contract, promised, notes, lines, installments);
    }
}
