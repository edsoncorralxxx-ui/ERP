package br.com.fourtech.rendamais.documentos.domain;

import br.com.fourtech.rendamais.kernel.AllocationPolicy;
import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.Money;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Nota proposta pelo caixa (decisão do PO na Review da Sprint 6, PD-023): o valor da nota é o recebido que ainda não tem
 * nota, e o sistema monta o resto. Os vínculos vão às parcelas na ordem de vencimento, até o a emitir de cada uma; as
 * linhas repartem o valor na proporção das linhas do pedido (equipamento e material viram Produto, serviço vira
 * Serviço), com os centavos que sobram a partir da primeira linha. A soma das linhas e a dos vínculos é sempre
 * exatamente o valor da nota.
 */
public final class InvoiceProposal {

    /** Parcela do pedido com o que falta emitir (recebido − faturado, nunca negativo), na ordem de vencimento. */
    public record Parcel(UUID titleId, long toIssueCents) { }

    /** Linha do pedido: EQUIPAMENTO, MATERIAL ou SERVICO, com o total em centavos. */
    public record OrderLine(String kind, String description, long totalCents) { }

    public record Result(List<BusinessDocument.LinkRequest> links, List<BusinessDocument.Line> lines, long productCents,
                         long serviceCents) { }

    private InvoiceProposal() { }

    /** Tipo da nota para uma linha do pedido: equipamento e material são Produto; serviço é Serviço. */
    public static BusinessDocument.LineKind kindOf(String orderLineKind) {
        return "SERVICO".equals(orderLineKind) ? BusinessDocument.LineKind.SERVICO : BusinessDocument.LineKind.PRODUTO;
    }

    /**
     * Parte de produto de um valor recebido, na proporção do produto no pedido, arredondada (HALF_EVEN, PD-002); o
     * serviço fica com o resto, para os dois somarem exatamente o recebido (notas separadas, Sprint 7).
     */
    public static long productShare(long receivedCents, long productTotalCents, long serviceTotalCents) {
        if (serviceTotalCents <= 0) return receivedCents;
        if (productTotalCents <= 0) return 0;
        return BigDecimal.valueOf(receivedCents).multiply(BigDecimal.valueOf(productTotalCents))
                .divide(BigDecimal.valueOf(productTotalCents + serviceTotalCents), 0, java.math.RoundingMode.HALF_EVEN).longValueExact();
    }

    public static long toIssue(List<Parcel> parcels) {
        return parcels.stream().mapToLong(Parcel::toIssueCents).sum();
    }

    /** Proposta para {@code amountCents} (maior que zero e até o a emitir do pedido — conferido por quem chama). */
    public static Result of(long amountCents, List<Parcel> parcels, List<OrderLine> orderLines) {
        List<BusinessDocument.LinkRequest> links = new ArrayList<>();
        long rest = amountCents;
        for (Parcel p : parcels) {
            if (rest == 0) break;
            long part = Math.min(rest, p.toIssueCents());
            if (part > 0) {
                links.add(new BusinessDocument.LinkRequest(p.titleId(), Money.ofCents(part, Currency.BRL)));
                rest -= part;
            }
        }
        List<OrderLine> weighted = orderLines.stream().filter(l -> l.totalCents() > 0).toList();
        List<BusinessDocument.Line> lines = new ArrayList<>();
        long product = 0;
        long service = 0;
        if (amountCents > 0 && !weighted.isEmpty()) {
            List<Money> parts = Money.ofCents(amountCents, Currency.BRL).allocate(
                    weighted.stream().map(l -> BigDecimal.valueOf(l.totalCents())).toList(), AllocationPolicy.RESIDUAL_FROM_FIRST);
            for (int i = 0; i < weighted.size(); i++) {
                Money part = parts.get(i);
                if (part.isZero()) continue;
                BusinessDocument.LineKind kind = kindOf(weighted.get(i).kind());
                if (kind == BusinessDocument.LineKind.SERVICO) service += part.cents();
                else product += part.cents();
                lines.add(new BusinessDocument.Line(lines.size() + 1, weighted.get(i).description(), kind, part));
            }
        }
        return new Result(links, lines, product, service);
    }
}
