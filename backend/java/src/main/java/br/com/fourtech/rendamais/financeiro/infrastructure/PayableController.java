package br.com.fourtech.rendamais.financeiro.infrastructure;

import br.com.fourtech.rendamais.financeiro.application.FinancialTitleRepository;
import br.com.fourtech.rendamais.financeiro.application.PayableService;
import br.com.fourtech.rendamais.financeiro.application.TitleService;
import br.com.fourtech.rendamais.financeiro.domain.FinancialTitle;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
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
 * Contas a pagar: títulos manuais (RegisterPayableTitle, com Idempotency-Key), o DAS gerado pelo fiscal e o cancelamento
 * do título manual. Pagamento e estorno ficam em {@code /api/v1/settlements} com {@code direction} PAYABLE. Valores em
 * centavos como texto de inteiro (ADR-006).
 */
@RestController
@RequestMapping("/api/v1/payables")
class PayableController {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final PayableService payables;
    private final TitleService titles;
    private final Clock clock;

    PayableController(PayableService payables, TitleService titles, Clock clock) {
        this.payables = payables;
        this.titles = titles;
        this.clock = clock;
    }

    record PayableDto(String id, String code, String supplierId, String supplierCode, String supplierName, String originType,
                      String originId, String origin, String projectId, String category, String competence, String documentNumber,
                      String notes, LocalDate issueDate, LocalDate dueDate, String originalCents, String paidCents,
                      String balanceCents, String status, boolean overdue, String cancelReason, String version, Instant createdAt,
                      String createdBy) {
        static PayableDto of(FinancialTitleRepository.Summary s, LocalDate today) {
            FinancialTitle t = s.title();
            return new PayableDto(t.id().toString(), t.code(), t.counterpartyId().toString(), s.counterpartyCode(), s.counterpartyName(),
                    t.originType(), t.originId(), t.originLabel(), t.projectId() == null ? null : t.projectId().toString(), t.category(),
                    t.competence().toString(), t.documentNumber(), t.notes(), t.issueDate(), t.dueDate(), t.original().centsAsString(),
                    t.received().centsAsString(), t.balance().centsAsString(), t.status().name(), t.isOverdue(today),
                    t.cancelReason(), Long.toString(t.version()), t.createdAt(), t.createdBy());
        }
    }

    record CancellationRequest(String reason) { }

    /**
     * {@code status}: ATIVOS (padrão: todos menos os cancelados), ABERTOS (com saldo), VENCIDOS, A_VENCER, PAGOS,
     * CANCELADOS ou TODOS.
     */
    @GetMapping
    List<PayableDto> list(@RequestParam(value = "search", required = false) String search,
                          @RequestParam(value = "projectId", required = false) UUID projectId,
                          @RequestParam(value = "supplierId", required = false) UUID supplierId,
                          @RequestParam(value = "status", required = false) String status) {
        LocalDate today = today();
        return titles.list(FinancialTitle.Direction.PAYABLE, search, projectId, supplierId, filter(status), today).stream()
                .map(s -> PayableDto.of(s, today)).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<PayableDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, payables.get(id));
    }

    /** Registra o título com as parcelas (uma parcela = um título); devolve os títulos criados na ordem das parcelas. */
    @PostMapping
    ResponseEntity<List<PayableDto>> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                              @RequestBody PayableService.RegisterRequest body) {
        LocalDate today = today();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(payables.register(key, body).stream().map(s -> PayableDto.of(s, today)).toList());
    }

    @PostMapping("/{id}/cancellation")
    ResponseEntity<PayableDto> cancel(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                      @RequestBody(required = false) CancellationRequest body) {
        return respond(HttpStatus.OK, payables.cancel(id, Versions.required(ifMatch), body == null ? null : body.reason()));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        payables.get(id);
        return titles.history(id).stream().map(HistoryEntry::of).toList();
    }

    private ResponseEntity<PayableDto> respond(HttpStatus status, FinancialTitleRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.title().version() + "\"").body(PayableDto.of(s, today()));
    }

    private LocalDate today() {
        return LocalDate.now(clock.withZone(BUSINESS_ZONE));
    }

    private static FinancialTitleRepository.Filter filter(String status) {
        if (status == null || status.isBlank()) return FinancialTitleRepository.Filter.ACTIVE;
        return switch (status.strip().toUpperCase(Locale.ROOT)) {
            case "ATIVOS" -> FinancialTitleRepository.Filter.ACTIVE;
            case "ABERTOS" -> FinancialTitleRepository.Filter.OPEN;
            case "VENCIDOS" -> FinancialTitleRepository.Filter.OVERDUE;
            case "A_VENCER" -> FinancialTitleRepository.Filter.DUE;
            case "PAGOS" -> FinancialTitleRepository.Filter.SETTLED;
            case "CANCELADOS" -> FinancialTitleRepository.Filter.CANCELLED;
            case "TODOS" -> FinancialTitleRepository.Filter.ALL;
            default -> throw new IllegalArgumentException("Situação inválida: " + status);
        };
    }
}
