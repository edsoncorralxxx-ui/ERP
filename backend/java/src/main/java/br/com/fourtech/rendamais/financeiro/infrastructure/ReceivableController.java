package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.FinancialTitleRepository;
import br.com.fourtech.rendamais.financeiro.application.TitleService;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
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
import java.util.UUID;

/**
 * Consulta de contas a receber (Sprint 4: os títulos gerados pela confirmação do pedido). Valores em centavos como
 * texto de inteiro (ADR-006). Recebimento e estorno entram na Sprint 5.
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

    @GetMapping
    List<ReceivableDto> list(@RequestParam(value = "search", required = false) String search,
                             @RequestParam(value = "projectId", required = false) UUID projectId,
                             @RequestParam(value = "customerId", required = false) UUID customerId,
                             @RequestParam(value = "includeCancelled", defaultValue = "false") boolean includeCancelled) {
        LocalDate today = LocalDate.now(clock.withZone(BUSINESS_ZONE));
        return service.listReceivables(search, projectId, customerId, includeCancelled).stream()
                .map(s -> ReceivableDto.of(s, today)).toList();
    }

    @GetMapping("/{id}")
    ReceivableDto get(@PathVariable UUID id) {
        return ReceivableDto.of(service.get(id), LocalDate.now(clock.withZone(BUSINESS_ZONE)));
    }
}
