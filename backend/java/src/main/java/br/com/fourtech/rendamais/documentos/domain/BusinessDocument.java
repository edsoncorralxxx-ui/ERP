package br.com.fourtech.rendamais.documentos.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Documento fiscal emitido fora do Renda+ e registrado (conceito FATURAMENTO do B01, formulário "documentos"). O
 * total é a soma exata das linhas. O documento não cria título: vincula-se às parcelas existentes com um valor por
 * vínculo (PD-023), e a soma dos vínculos ativos nunca passa do total. O limite de cada parcela (faturado ≤ valor da
 * parcela) é conferido pelo serviço, com as parcelas bloqueadas. Cancelar desfaz todos os vínculos e preserva o
 * documento; desfazer um vínculo o preserva como desfeito, com motivo.
 */
public final class BusinessDocument {

    public enum Direction { SAIDA, ENTRADA }

    public enum Status { ATIVO, CANCELADO }

    public enum LineKind { PRODUTO, SERVICO }

    /** Natureza da operação (classificação manual; lista inicial a confirmar com o contador). */
    public enum OperationNature { VENDA_PRODUCAO, VENDA_MERCADORIA, PRESTACAO_SERVICO, REMESSA }

    public record Line(int seq, String description, LineKind kind, Money amount) {
        public Line {
            Objects.requireNonNull(description);
            Objects.requireNonNull(kind);
            Objects.requireNonNull(amount);
        }
    }

    public enum LinkStatus { ATIVO, DESFEITO }

    public record Link(UUID id, UUID titleId, Money amount, LinkStatus status, String removedReason, Instant removedAt,
                       String removedBy, Instant createdAt, String createdBy) {
        public Link {
            Objects.requireNonNull(id);
            Objects.requireNonNull(titleId);
            Objects.requireNonNull(amount);
            Objects.requireNonNull(status);
        }

        boolean active() {
            return status == LinkStatus.ATIVO;
        }

        Link removed(String reason, Instant at, String by) {
            return new Link(id, titleId, amount, LinkStatus.DESFEITO, reason, at, by, createdAt, createdBy);
        }
    }

    /** Pedido de vínculo: parcela e valor. */
    public record LinkRequest(UUID titleId, Money amount) { }

    private final UUID id;
    private final String code;
    private final Direction direction;
    private final UUID partnerId;
    private final String series;
    private final String number;
    private final LocalDate issueDate;
    private final YearMonth competence;
    private final List<Line> lines;
    private final Money total;
    private final List<Link> links;
    private final String notes;
    private final OperationNature operationNature;
    private final UUID projectId;
    private final int classificationRev;
    private final Status status;
    private final String cancelReason;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public BusinessDocument(UUID id, String code, Direction direction, UUID partnerId, String series, String number,
                            LocalDate issueDate, YearMonth competence, List<Line> lines, Money total, List<Link> links, String notes,
                            OperationNature operationNature, UUID projectId, int classificationRev, Status status,
                            String cancelReason, long version, Instant createdAt, String createdBy, Instant updatedAt,
                            String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.direction = Objects.requireNonNull(direction);
        this.partnerId = Objects.requireNonNull(partnerId);
        this.series = Objects.requireNonNull(series);
        this.number = Objects.requireNonNull(number);
        this.issueDate = Objects.requireNonNull(issueDate);
        this.competence = Objects.requireNonNull(competence);
        this.lines = List.copyOf(lines);
        this.total = Objects.requireNonNull(total);
        this.links = List.copyOf(links);
        this.notes = notes;
        this.operationNature = operationNature;
        this.projectId = projectId;
        this.classificationRev = classificationRev;
        this.status = Objects.requireNonNull(status);
        this.cancelReason = cancelReason;
        this.version = version;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /** Novo documento de saída: total = Σ linhas (cada linha maior que zero). Os vínculos vêm depois, pelo serviço. */
    public static BusinessDocument register(String code, Direction direction, UUID partnerId, String series, String number,
                                            LocalDate issueDate, YearMonth competence, List<Line> lines, String notes,
                                            Instant now, String actor) {
        if (lines.isEmpty()) {
            throw new RuleViolationException("DOCUMENT_INVALID", "Informe ao menos uma linha com valor.",
                    List.of(new FieldIssue("lines", "Obrigatório.")));
        }
        Money sum = Money.zero(Currency.BRL);
        for (Line l : lines) {
            if (l.amount().isNegative() || l.amount().isZero()) {
                throw new RuleViolationException("DOCUMENT_INVALID", "O valor de cada linha deve ser maior que zero.",
                        List.of(new FieldIssue("lines[" + (l.seq() - 1) + "].amountCents", "Deve ser maior que zero.")));
            }
            sum = sum.plus(l.amount());
        }
        return new BusinessDocument(UUID.randomUUID(), code, direction, partnerId, series, number, issueDate, competence, lines,
                sum, List.of(), notes, null, null, 0, Status.ATIVO, null, 1, now, actor, now, actor);
    }

    /** Σ vínculos ativos. */
    public Money linked() {
        return links.stream().filter(Link::active).map(Link::amount).reduce(Money.zero(Currency.BRL), Money::plus);
    }

    /** Valor do documento ainda sem vínculo. */
    public Money unlinked() {
        return total.minus(linked());
    }

    public List<Link> activeLinks() {
        return links.stream().filter(Link::active).toList();
    }

    /**
     * Acrescenta vínculos: documento ativo; cada parcela uma vez no pedido e sem vínculo ativo neste documento;
     * valores maiores que zero; Σ vínculos ≤ total (LINK_EXCEEDS_DOCUMENT, com o que resta na nota).
     */
    public BusinessDocument addLinks(List<LinkRequest> requests, Instant now, String actor) {
        requireActive("receber vínculos");
        if (requests.isEmpty()) {
            throw new RuleViolationException("DOCUMENT_INVALID", "Informe ao menos uma parcela para vincular.",
                    List.of(new FieldIssue("links", "Obrigatório.")));
        }
        Set<UUID> seen = new HashSet<>();
        activeLinks().forEach(l -> seen.add(l.titleId()));
        Money added = Money.zero(Currency.BRL);
        List<Link> all = new ArrayList<>(links);
        for (int i = 0; i < requests.size(); i++) {
            LinkRequest r = requests.get(i);
            String f = "links[" + i + "]";
            if (r.amount().isNegative() || r.amount().isZero()) {
                throw new RuleViolationException("DOCUMENT_INVALID", "O valor de cada vínculo deve ser maior que zero.",
                        List.of(new FieldIssue(f + ".amountCents", "Deve ser maior que zero.")));
            }
            if (!seen.add(r.titleId())) {
                throw new RuleViolationException("DOCUMENT_INVALID", "Cada parcela aparece uma vez só nos vínculos do documento; "
                        + "para mudar o valor, desfaça o vínculo e vincule de novo.",
                        List.of(new FieldIssue(f + ".titleId", "Parcela já vinculada a este documento.")));
            }
            added = added.plus(r.amount());
            all.add(new Link(UUID.randomUUID(), r.titleId(), r.amount(), LinkStatus.ATIVO, null, null, null, now, actor));
        }
        Money free = unlinked();
        if (added.compareTo(free) > 0) {
            throw new RuleViolationException("LINK_EXCEEDS_DOCUMENT", "Os vínculos somam " + added.toBrl() + ", mas restam "
                    + free.toBrl() + " sem vínculo no documento " + number + " (total " + total.toBrl() + ").",
                    List.of(new FieldIssue("links", "Resta no documento: " + free.toBrl() + ".")));
        }
        return with(all, status, cancelReason, operationNature, projectId, classificationRev, now, actor);
    }

    /** Desfaz um vínculo ativo, com motivo; desfazer de novo é tratado pelo serviço (devolve o documento como está). */
    public BusinessDocument removeLink(UUID linkId, String reason, Instant now, String actor) {
        requireActive("ter vínculos desfeitos");
        List<Link> all = links.stream().map(l -> l.id().equals(linkId) && l.active() ? l.removed(reason, now, actor) : l).toList();
        return with(all, status, cancelReason, operationNature, projectId, classificationRev, now, actor);
    }

    /** Cancela com motivo: todos os vínculos ativos ficam desfeitos com o mesmo motivo. */
    public BusinessDocument cancel(String reason, Instant now, String actor) {
        if (status == Status.CANCELADO) return this;
        List<Link> all = links.stream().map(l -> l.active() ? l.removed(reason, now, actor) : l).toList();
        return with(all, Status.CANCELADO, reason, operationNature, projectId, classificationRev, now, actor);
    }

    /** Classificação manual: natureza da operação e projeto; cada reclassificação é uma nova revisão. */
    public BusinessDocument classify(OperationNature nature, UUID project, Instant now, String actor) {
        requireActive("ser classificado");
        Objects.requireNonNull(nature);
        return with(links, status, cancelReason, nature, project, classificationRev + 1, now, actor);
    }

    private void requireActive(String what) {
        if (status != Status.ATIVO) {
            throw new InvalidStateException("O documento " + code + " (nº " + number + ") está cancelado e não pode " + what + ".");
        }
    }

    private BusinessDocument with(List<Link> newLinks, Status newStatus, String reason, OperationNature nature, UUID project,
                                  int rev, Instant now, String actor) {
        return new BusinessDocument(id, code, direction, partnerId, series, number, issueDate, competence, lines, total, newLinks,
                notes, nature, project, rev, newStatus, reason, version + 1, createdAt, createdBy, now, actor);
    }

    public UUID id() { return id; }
    public String code() { return code; }
    public Direction direction() { return direction; }
    public UUID partnerId() { return partnerId; }
    public String series() { return series; }
    public String number() { return number; }
    public LocalDate issueDate() { return issueDate; }
    public YearMonth competence() { return competence; }
    public List<Line> lines() { return lines; }
    public Money total() { return total; }
    public List<Link> links() { return links; }
    public String notes() { return notes; }
    public OperationNature operationNature() { return operationNature; }
    public UUID projectId() { return projectId; }
    public int classificationRev() { return classificationRev; }
    public Status status() { return status; }
    public String cancelReason() { return cancelReason; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
