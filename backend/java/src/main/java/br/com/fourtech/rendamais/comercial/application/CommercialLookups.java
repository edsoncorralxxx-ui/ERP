package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.cadastros.api.PartnerQueryApi;
import br.com.fourtech.rendamais.comercial.domain.Proposal;
import br.com.fourtech.rendamais.comercial.domain.SalesLine;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

/** Cliente, unidade e itens dos documentos comerciais, lidos pelas APIs públicas de cadastros. */
@Component
class CommercialLookups {

    private final PartnerQueryApi partners;
    private final ItemQueryApi items;

    CommercialLookups(PartnerQueryApi partners, ItemQueryApi items) {
        this.partners = partners;
        this.items = items;
    }

    Function<UUID, Optional<SalesLine.ItemInfo>> items() {
        return id -> items.item(id).map(i -> new SalesLine.ItemInfo(i.id(), i.code(), i.description(), i.nature(), i.uom(), i.active()));
    }

    /**
     * Cliente e unidade para o documento. Cliente precisa existir e estar ativo, a não ser que seja o que o documento já
     * tem ({@code current}); a unidade, quando informada (obrigatória se {@code unitRequired}), precisa ser dele (INV-SO-6).
     */
    Proposal.Customer customer(String code, String rawCustomer, String rawUnit, boolean unitRequired, UUID current) {
        UUID customerId = uuid(rawCustomer);
        if (customerId == null) throw invalid(code, "customerId", rawCustomer == null || rawCustomer.isBlank() ? "Escolha o cliente." : "Cliente inválido.");
        PartnerQueryApi.CustomerRef c = partners.customer(customerId)
                .orElseThrow(() -> invalid(code, "customerId", "Cliente não encontrado."));
        if (!c.active() && !customerId.equals(current)) throw invalid(code, "customerId", "O cliente " + c.code() + " está inativo.");
        UUID unitId = uuid(rawUnit);
        if (unitId == null) {
            if (unitRequired || (rawUnit != null && !rawUnit.isBlank())) {
                throw invalid(code, "unitId", rawUnit == null || rawUnit.isBlank() ? "Escolha a unidade do cliente." : "Unidade inválida.");
            }
            return new Proposal.Customer(customerId, null, null);
        }
        PartnerQueryApi.UnitRef u = c.unit(unitId)
                .orElseThrow(() -> invalid(code, "unitId", "A unidade não pertence ao cliente " + c.code() + "."));
        return new Proposal.Customer(customerId, u.id(), u.name());
    }

    /** Conferência da confirmação (INV-SO-6): cliente ativo e unidade dele, lidos agora, na transação. */
    Optional<String> confirmationProblem(UUID customerId, UUID unitId) {
        Optional<PartnerQueryApi.CustomerRef> c = partners.customer(customerId);
        if (c.isEmpty()) return Optional.of("Cliente não encontrado.");
        if (!c.get().active()) return Optional.of("O cliente " + c.get().code() + " está inativo.");
        if (c.get().unit(unitId).isEmpty()) return Optional.of("A unidade do pedido não pertence mais ao cliente " + c.get().code() + ".");
        return Optional.empty();
    }

    String customerName(UUID customerId) {
        return partners.customer(customerId).map(PartnerQueryApi.CustomerRef::name).orElse("");
    }

    private static UUID uuid(String raw) {
        try {
            return raw == null || raw.isBlank() ? null : UUID.fromString(raw.strip());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static RuleViolationException invalid(String code, String field, String message) {
        return new RuleViolationException(code, "Corrija os campos indicados.", List.of(new FieldIssue(field, message)));
    }
}
