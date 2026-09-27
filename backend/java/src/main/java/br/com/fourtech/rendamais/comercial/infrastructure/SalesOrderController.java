package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.SalesOrderRepository;
import br.com.fourtech.rendamais.comercial.application.SalesOrderService;
import br.com.fourtech.rendamais.comercial.domain.SalesOrder;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Pedidos e contratos (S4): rascunho com Idempotency-Key; alteração e cancelamento com If-Match; confirmação com
 * Idempotency-Key e If-Match, que devolve o pedido com o projeto, os equipamentos e os títulos gerados.
 */
@RestController
@RequestMapping("/api/v1/sales-orders")
class SalesOrderController {

    private final SalesOrderService service;

    SalesOrderController(SalesOrderService service) {
        this.service = service;
    }

    record InstallmentDto(Integer seq, String dueDate, String amountCents, String milestone) { }

    record OrderRequest(String customerId, String unitId, String contractDate, String promisedDate, String notes,
                        List<CommercialDtos.LineDto> lines, List<InstallmentDto> installments) {
        SalesOrder.Data toData() {
            return new SalesOrder.Data(customerId, unitId, contractDate, promisedDate, notes, CommercialDtos.data(lines),
                    installments == null ? List.of() : installments.stream()
                            .map(i -> new SalesOrder.InstallmentData(i.dueDate(), i.amountCents(), i.milestone())).toList());
        }
    }

    record EquipmentRef(String id, String code, String model, String serialNumber, String status) { }

    record TitleRef(String id, String code, String label, LocalDate dueDate, String competence, String originalCents,
                    String balanceCents, String status) { }

    record OrderDto(String id, String code, String customerId, String customerCode, String customerName, String unitId,
                    String unitName, String proposalId, String proposalCode, Integer proposalRevision, LocalDate contractDate,
                    LocalDate promisedDate, String notes, String status, String totalCents, String scheduledCents,
                    List<CommercialDtos.LineDto> lines, List<InstallmentDto> installments, Instant confirmedAt, String confirmedBy,
                    String projectId, String projectCode, String projectStage, List<EquipmentRef> equipment, List<TitleRef> titles,
                    Instant cancelledAt, String cancelledBy, String cancelReason, String version, Instant createdAt,
                    String createdBy, Instant updatedAt, String updatedBy) {
        static OrderDto of(SalesOrderService.OrderView v) {
            SalesOrderRepository.Summary s = v.summary();
            SalesOrder o = s.order();
            var project = v.project();
            return new OrderDto(o.id().toString(), o.code(), o.customerId().toString(), s.customerCode(), s.customerName(),
                    o.unitId().toString(), o.unitName(), o.proposalId() == null ? null : o.proposalId().toString(), s.proposalCode(),
                    o.proposalRevision(), o.contractDate(), o.promisedDate(), o.notes(), o.status().name(),
                    Long.toString(o.totalCents()), Long.toString(o.scheduledCents()), CommercialDtos.dtos(o.lines()),
                    o.installments().stream().map(i -> new InstallmentDto(i.seq(), i.dueDate().toString(),
                            Long.toString(i.amountCents()), i.milestone())).toList(),
                    o.confirmation() == null ? null : o.confirmation().at(), o.confirmation() == null ? null : o.confirmation().by(),
                    project.map(p -> p.id().toString()).orElse(null), project.map(p -> p.code()).orElse(null),
                    project.map(p -> p.stage()).orElse(null),
                    project.map(p -> p.equipment().stream().map(e -> new EquipmentRef(e.id().toString(), e.code(), e.model(),
                            e.serialNumber(), e.status())).toList()).orElse(List.of()),
                    v.titles().stream().map(t -> new TitleRef(t.id().toString(), t.code(), t.label(), t.dueDate(), t.competence(),
                            Long.toString(t.originalCents()), Long.toString(t.balanceCents()), t.status())).toList(),
                    o.cancellation() == null ? null : o.cancellation().at(), o.cancellation() == null ? null : o.cancellation().by(),
                    o.cancellation() == null ? null : o.cancellation().reason(), Long.toString(o.version()), o.createdAt(),
                    o.createdBy(), o.updatedAt(), o.updatedBy());
        }
    }

    record OrderSummary(String id, String code, String customerCode, String customerName, String unitName, String proposalCode,
                        LocalDate contractDate, String totalCents, String status, String version) {
        static OrderSummary of(SalesOrderRepository.Summary s) {
            SalesOrder o = s.order();
            return new OrderSummary(o.id().toString(), o.code(), s.customerCode(), s.customerName(), o.unitName(), s.proposalCode(),
                    o.contractDate(), Long.toString(o.totalCents()), o.status().name(), Long.toString(o.version()));
        }
    }

    record CancelRequest(String reason) { }

    @GetMapping
    List<OrderSummary> list(@RequestParam(value = "search", required = false) String search,
                            @RequestParam(value = "status", required = false) String status) {
        SalesOrder.Status s = status == null || status.isBlank() || "TODOS".equalsIgnoreCase(status) ? null
                : SalesOrder.Status.valueOf(status.toUpperCase(Locale.ROOT));
        return service.list(search, s).stream().map(OrderSummary::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<OrderDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<OrderDto> draft(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                   @RequestBody OrderRequest body) {
        return respond(HttpStatus.CREATED, service.draft(key, body.toData()));
    }

    @PutMapping("/{id}")
    ResponseEntity<OrderDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                    @RequestBody OrderRequest body) {
        return respond(HttpStatus.OK, service.update(id, Versions.required(ifMatch), body.toData()));
    }

    @PostMapping("/{id}/confirmations")
    ResponseEntity<OrderDto> confirm(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                     @RequestHeader(value = "Idempotency-Key", required = false) String key) {
        return respond(HttpStatus.OK, service.confirm(id, Versions.required(ifMatch), key));
    }

    @PostMapping("/{id}/cancellations")
    ResponseEntity<OrderDto> cancel(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                    @RequestBody(required = false) CancelRequest body) {
        return respond(HttpStatus.OK, service.cancel(id, Versions.required(ifMatch), body == null ? null : body.reason()));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    static ResponseEntity<OrderDto> respond(HttpStatus status, SalesOrderService.OrderView v) {
        return ResponseEntity.status(status).eTag("\"" + v.summary().order().version() + "\"").body(OrderDto.of(v));
    }
}
