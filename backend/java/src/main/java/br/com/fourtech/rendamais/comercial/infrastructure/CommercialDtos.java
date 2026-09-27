package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.domain.SalesLine;

import java.util.List;

/** Linha comercial na API: quantidade e preço como texto decimal com ponto, valores em centavos como texto de inteiro. */
final class CommercialDtos {

    private CommercialDtos() { }

    record LineDto(String id, String kind, String itemId, String itemCode, String description, String quantity, String uom,
                   String unitPrice, String discountCents, String grossCents, String totalCents) {
        static LineDto of(SalesLine l) {
            return new LineDto(l.id().toString(), l.kind().name(), l.itemId() == null ? null : l.itemId().toString(), l.itemCode(),
                    l.description(), l.quantity().toPlainString(), l.uom(), l.unitPrice().toPlainString(),
                    Long.toString(l.discountCents()), Long.toString(l.grossCents()), Long.toString(l.totalCents()));
        }

        SalesLine.Data toData() {
            return new SalesLine.Data(id, kind, itemId, description, quantity, unitPrice, discountCents);
        }
    }

    static List<SalesLine.Data> data(List<LineDto> lines) {
        return lines == null ? List.of() : lines.stream().map(LineDto::toData).toList();
    }

    static List<LineDto> dtos(List<SalesLine> lines) {
        return lines.stream().map(LineDto::of).toList();
    }
}
