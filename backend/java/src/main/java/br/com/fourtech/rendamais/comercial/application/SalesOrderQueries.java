package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.comercial.api.SalesOrderQueryApi;
import br.com.fourtech.rendamais.comercial.domain.SalesOrder;
import br.com.fourtech.rendamais.financeiro.api.TitleQueryApi;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/** Implementação de {@link SalesOrderQueryApi}: pedidos confirmados com linhas e títulos das parcelas. */
@Service
class SalesOrderQueries implements SalesOrderQueryApi {

    private static final List<SalesOrder.Status> CONFIRMED =
            List.of(SalesOrder.Status.CONFIRMED, SalesOrder.Status.IN_EXECUTION, SalesOrder.Status.COMPLETED);

    private final SalesOrderRepository repository;
    private final TitleQueryApi titles;

    SalesOrderQueries(SalesOrderRepository repository, TitleQueryApi titles) {
        this.repository = repository;
        this.titles = titles;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OrderRef> confirmed(UUID orderId) {
        return repository.findById(orderId).filter(s -> CONFIRMED.contains(s.order().status()))
                .map(s -> refs(List.of(s)).getFirst());
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderRef> confirmedOrders(String search) {
        String term = search == null || search.isBlank() ? null : search.strip();
        return refs(repository.list(term, null, 500).stream().filter(s -> CONFIRMED.contains(s.order().status())).toList());
    }

    private List<OrderRef> refs(List<SalesOrderRepository.Summary> orders) {
        List<String> origins = orders.stream().flatMap(s -> s.order().installments().stream()
                .map(i -> SalesOrderService.originId(s.order().id(), i.seq()))).toList();
        Map<String, UUID> byOrigin = titles.byOrigin(SalesOrderService.INSTALLMENT_ORIGIN, origins).stream()
                .collect(Collectors.toMap(TitleQueryApi.TitleView::originId, TitleQueryApi.TitleView::id));
        return orders.stream().map(s -> {
            SalesOrder o = s.order();
            List<UUID> ids = o.installments().stream().map(i -> byOrigin.get(SalesOrderService.originId(o.id(), i.seq())))
                    .filter(java.util.Objects::nonNull).toList();
            return new OrderRef(o.id(), o.code(), o.customerId(), s.customerCode(), s.customerName(), o.status().name(), o.totalCents(),
                    o.confirmation() == null ? null : o.confirmation().projectId(),
                    o.lines().stream().map(l -> new LineRef(l.kind().name(), l.itemId(), l.description(), l.totalCents())).toList(), ids);
        }).toList();
    }
}
