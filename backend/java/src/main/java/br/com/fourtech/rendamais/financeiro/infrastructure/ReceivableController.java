package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.FinancialTitleRepository;
import br.com.fourtech.rendamais.financeiro.application.TitleService;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Consulta de contas a receber: os títulos gerados pela confirmação do pedido, com o recebido e o saldo. Valores em
 * centavos como texto de inteiro (ADR-006). Recebimento e estorno ficam em {@code /api/v1/settlements}.
 */
@RestController
@RequestMapping("/api/v1/receivables")
class ReceivableController {

    /** Vencido é comparado com a data de hoje no fuso da empresa. */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final TitleService service;
    private final Clock clock;

    ReceivableController(TitleService service, Clock clock) {
        this.service = service;
        this.clock = clock;
    }

    record ReceivableDto(String id, String code, String customerId, String customerCode, String customerName, String originType,
                         String originId, String origin, String projectId, String category, String competence,
                         LocalDate issueDate, LocalDate dueDate, String originalCents, String receivedCents, String balanceCents,
                         String status, boolean overdue, String cancelReason, String version, Instant createdAt, String createdBy) {
        static ReceivableDto of(FinancialTitleRepository.Summary s, LocalDate today) {
            FinancialTitle t = s.title();
            return new ReceivableDto(t.id().toString(), t.code(), t.counterpartyId().toString(), s.counterpartyCode(),
                    s.counterpartyName(), t.originType(), t.originId(), t.originLabel(),
                    t.projectId() == null ? null : t.projectId().toString(), t.category(), t.competence().toString(),
                    t.issueDate(), t.dueDate(), t.original().centsAsString(), t.received().centsAsString(),
                    t.balance().centsAsString(), t.status().name(), t.isOverdue(today), t.cancelReason(),
                    Long.toString(t.version()), t.createdAt(), t.createdBy());
        }
    }

    /**
     * {@code status}: ATIVOS (padrão: todos menos os cancelados), ABERTOS (com saldo), VENCIDOS, LIQUIDADOS, CANCELADOS
     * ou TODOS. {@code includeCancelled=true} sem {@code status} equivale a TODOS (compatível com a Sprint 4).
     */
    @GetMapping
    List<ReceivableDto> list(@RequestParam(value = "search", required = false) String search,
                             @RequestParam(value = "projectId", required = false) UUID projectId,
                             @RequestParam(value = "customerId", required = false) UUID customerId,
                             @RequestParam(value = "status", required = false) String status,
                             @RequestParam(value = "includeCancelled", defaultValue = "false") boolean includeCancelled) {
        LocalDate today = LocalDate.now(clock.withZone(BUSINESS_ZONE));
        return service.listReceivables(search, projectId, customerId, filter(status, includeCancelled), today).stream()
                .map(s -> ReceivableDto.of(s, today)).toList();
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static FinancialTitleRepository.Filter filter(String status, boolean includeCancelled) {
        if (status == null || status.isBlank()) {
            return includeCancelled ? FinancialTitleRepository.Filter.ALL : FinancialTitleRepository.Filter.ACTIVE;
        }
        return switch (status.strip().toUpperCase(Locale.ROOT)) {
            case "ATIVOS" -> FinancialTitleRepository.Filter.ACTIVE;
            case "ABERTOS" -> FinancialTitleRepository.Filter.OPEN;
            case "VENCIDOS" -> FinancialTitleRepository.Filter.OVERDUE;
            case "LIQUIDADOS" -> FinancialTitleRepository.Filter.SETTLED;
            case "CANCELADOS" -> FinancialTitleRepository.Filter.CANCELLED;
            case "TODOS" -> FinancialTitleRepository.Filter.ALL;
            default -> throw new IllegalArgumentException("Situação inválida: " + status);
        };
    }

    @GetMapping("/{id}")
    ReceivableDto get(@PathVariable UUID id) {
        return ReceivableDto.of(service.get(id), LocalDate.now(clock.withZone(BUSINESS_ZONE)));
    }
}
