package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.cadastros.api.PartnerQueryApi;
import br.com.fourtech.rendamais.financeiro.domain.FinancialCategory;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.projetos.api.ProjectQueryApi;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Títulos a pagar manuais (formulário "pagar", RegisterPayableTitle e CancelTitle). Uma parcela é um título, como no
 * contas a receber; as parcelas de um registro compartilham a origem {@code MANUAL:{registro}:{parcela}}. Pagamento e
 * estorno ficam no {@link SettlementService}; o DAS nasce do fiscal pela {@code TitleIssuanceApi}.
 */
@Service
public class PayableService {

    /** Origem dos títulos lançados à mão na tela de contas a pagar. */
    public static final String MANUAL_ORIGIN = "MANUAL";
    static final int MAX_INSTALLMENTS = 120;

    private final FinancialTitleRepository repository;
    private final FinancialCategoryRepository categories;
    private final TitleService titles;
    private final PartnerQueryApi partners;
    private final ProjectQueryApi projects;
    private final CommandReceipts receipts;
    private final Clock clock;

    public PayableService(FinancialTitleRepository repository, FinancialCategoryRepository categories, TitleService titles,
                          PartnerQueryApi partners, ProjectQueryApi projects, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.categories = categories;
        this.titles = titles;
        this.partners = partners;
        this.projects = projects;
        this.receipts = receipts;
        this.clock = clock;
    }

    /** Corpo do RegisterPayableTitle: valores em centavos como texto de inteiro (ADR-006), datas AAAA-MM-DD. */
    public record RegisterRequest(String supplierId, String category, String competence, String projectId, String description,
                                  String documentNumber, String issueDate, String totalCents, List<InstallmentRequest> installments,
                                  String notes) { }

    public record InstallmentRequest(String dueDate, String amountCents) { }

    /** RegisterPayableTitle: registra as parcelas; a mesma chave devolve os mesmos títulos. */
    @Transactional
    public List<FinancialTitleRepository.Summary> register(String idempotencyKey, RegisterRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterPayableTitle", r);
        if (done.isPresent()) return summaries(repository.findByOriginPrefix(MANUAL_ORIGIN, done.get() + ":"));

        List<FieldIssue> issues = new ArrayList<>();
        if (r == null) throw new RuleViolationException("PAYABLE_INVALID", "Informe os dados do título.", List.of());
        UUID supplierId = uuid(r.supplierId(), "supplierId", "Informe o beneficiário.", issues);
        PartnerQueryApi.SupplierRef supplier = null;
        if (supplierId != null) {
            supplier = partners.supplier(supplierId).orElse(null);
            if (supplier == null) issues.add(new FieldIssue("supplierId", "Fornecedor não encontrado."));
            else if (!supplier.active()) issues.add(new FieldIssue("supplierId", "O fornecedor " + supplier.code() + " está inativo."));
        }
        FinancialCategory category = null;
        String categoryCode = text(r.category());
        if (categoryCode == null) {
            issues.add(new FieldIssue("category", "Informe a categoria."));
        } else {
            category = categories.findByCode(categoryCode).orElse(null);
            if (category == null) issues.add(new FieldIssue("category", "Categoria não encontrada."));
            else if (category.direction() != FinancialCategory.Direction.DESPESA) {
                issues.add(new FieldIssue("category", "Use uma categoria de despesa."));
            } else if (category.status() != FinancialCategory.Status.ATIVO) {
                issues.add(new FieldIssue("category", "A categoria " + category.name() + " está inativa."));
            }
        }
        YearMonth competence = null;
        String rawCompetence = text(r.competence());
        if (rawCompetence == null) {
            issues.add(new FieldIssue("competence", "Informe a competência."));
        } else {
            try {
                competence = YearMonth.parse(rawCompetence);
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("competence", "Use AAAA-MM."));
            }
        }
        UUID projectId = null;
        if (text(r.projectId()) != null) {
            projectId = uuid(r.projectId(), "projectId", null, issues);
            if (projectId != null && projects.projectById(projectId).isEmpty()) {
                issues.add(new FieldIssue("projectId", "Projeto não encontrado."));
            }
        }
        String description = text(r.description());
        if (description != null && description.length() > 150) issues.add(new FieldIssue("description", "Máximo de 150 caracteres."));
        String documentNumber = text(r.documentNumber());
        if (documentNumber != null && documentNumber.length() > 60) issues.add(new FieldIssue("documentNumber", "Máximo de 60 caracteres."));
        String notes = text(r.notes());
        if (notes != null && notes.length() > 500) issues.add(new FieldIssue("notes", "Máximo de 500 caracteres."));
        LocalDate today = LocalDate.now(clock.withZone(SettlementService.BUSINESS_ZONE));
        LocalDate issueDate = today;
        if (text(r.issueDate()) != null) {
            try {
                issueDate = LocalDate.parse(r.issueDate().strip());
            } catch (RuntimeException e) {
                issues.add(new FieldIssue("issueDate", "Data inválida."));
            }
        }
        Money total = null;
        try {
            total = Money.parseCents(text(r.totalCents()), Currency.BRL);
            if (total.isZero() || total.isNegative()) {
                issues.add(new FieldIssue("totalCents", "Deve ser maior que zero."));
                total = null;
            }
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("totalCents", "Informe o valor total."));
        }
        List<InstallmentRequest> raw = r.installments() == null ? List.of() : r.installments();
        if (raw.isEmpty()) issues.add(new FieldIssue("installments", "Informe ao menos uma parcela."));
        if (raw.size() > MAX_INSTALLMENTS) issues.add(new FieldIssue("installments", "Máximo de " + MAX_INSTALLMENTS + " parcelas."));
        List<LocalDate> dues = new ArrayList<>();
        List<Money> amounts = new ArrayList<>();
        Money sum = Money.zero(Currency.BRL);
        for (int i = 0; i < raw.size() && i < MAX_INSTALLMENTS; i++) {
            InstallmentRequest in = raw.get(i);
            String f = "installments[" + i + "]";
            LocalDate due = null;
            try {
                due = LocalDate.parse(in == null || in.dueDate() == null ? "" : in.dueDate().strip());
            } catch (RuntimeException e) {
                issues.add(new FieldIssue(f + ".dueDate", "Informe o vencimento."));
            }
            Money amount = null;
            try {
                amount = Money.parseCents(in == null ? null : text(in.amountCents()), Currency.BRL);
                if (amount.isZero() || amount.isNegative()) {
                    issues.add(new FieldIssue(f + ".amountCents", "Deve ser maior que zero."));
                    amount = null;
                }
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue(f + ".amountCents", "Informe o valor da parcela."));
            }
            if (amount != null) sum = sum.plus(amount);
            dues.add(due);
            amounts.add(amount);
        }
        if (total != null && issues.stream().noneMatch(x -> x.field().startsWith("installments")) && !sum.equals(total)) {
            issues.add(new FieldIssue("installments", "A soma das parcelas (" + sum.toBrl() + ") difere do total (" + total.toBrl()
                    + ")."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("PAYABLE_INVALID", "Corrija os campos indicados.", issues);

        String group = UUID.randomUUID().toString();
        String base = description != null ? description
                : documentNumber != null ? supplier.name() + " — documento " + documentNumber
                : supplier.name() + " — " + category.name();
        int n = raw.size();
        Instant now = clock.instant();
        List<FinancialTitle> created = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String label = n == 1 ? base : base + " — parcela " + (i + 1) + "/" + n;
            if (label.length() > 200) label = label.substring(0, 200);
            FinancialTitle t = FinancialTitle.payable(repository.nextPayableCode(), supplierId, MANUAL_ORIGIN, group + ":" + (i + 1), label,
                    projectId, category.code(), competence, issueDate, dues.get(i), amounts.get(i), documentNumber, notes, now,
                    user.username());
            repository.insert(t);
            titles.created(t, user.username());
            created.add(t);
        }
        receipts.complete(user.username(), key, group);
        return summaries(created);
    }

    /** CancelTitle: só título manual, sem pagamento válido, com motivo e a versão lida; cancelar de novo não muda nada. */
    @Transactional
    public FinancialTitleRepository.Summary cancel(UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_CANCEL);
        FinancialTitle t = repository.findByIdsForUpdate(List.of(id)).stream().findFirst()
                .filter(x -> x.direction() == FinancialTitle.Direction.PAYABLE)
                .orElseThrow(() -> new NotFoundException("Título a pagar não encontrado."));
        if (t.lifecycle() == FinancialTitle.Lifecycle.CANCELLED) return get(id);
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("PAYABLE_INVALID", "Informe o motivo do cancelamento.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        if (!MANUAL_ORIGIN.equals(t.originType())) {
            throw new InvalidStateException("O título " + t.code() + " foi gerado por " + t.originLabel()
                    + " e é cancelado pela origem (no DAS, por uma nova conferência do contador).");
        }
        if (t.version() != expectedVersion) throw new VersionConflictException(TitleService.ENTITY, expectedVersion, t.version());
        FinancialTitle after = t.cancel(why, clock.instant(), user.username());
        repository.update(after);
        titles.cancelled(after, why, user.username());
        return get(id);
    }

    @Transactional(readOnly = true)
    public FinancialTitleRepository.Summary get(UUID id) {
        CurrentUserHolder.require(Permissions.FINANCIAL_TITLE_READ);
        return repository.findById(id).filter(s -> s.title().direction() == FinancialTitle.Direction.PAYABLE)
                .orElseThrow(() -> new NotFoundException("Título a pagar não encontrado."));
    }

    private List<FinancialTitleRepository.Summary> summaries(List<FinancialTitle> list) {
        return list.stream().map(t -> repository.findById(t.id()).orElseThrow()).toList();
    }

    private static String text(String raw) {
        return raw == null || raw.isBlank() ? null : raw.strip();
    }

    private static UUID uuid(String raw, String field, String missing, List<FieldIssue> issues) {
        if (raw == null || raw.isBlank()) {
            if (missing != null) issues.add(new FieldIssue(field, missing));
            return null;
        }
        try {
            return UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue(field, "Identificador inválido."));
            return null;
        }
    }
}
