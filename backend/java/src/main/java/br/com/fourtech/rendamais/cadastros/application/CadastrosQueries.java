package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.cadastros.api.PartnerQueryApi;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.UUID;

/** Implementação das consultas públicas de cadastros; a permissão é conferida pelo caso de uso que as chama. */
@Component
class CadastrosQueries implements PartnerQueryApi, ItemQueryApi {

    private final PartnerRepository partners;
    private final ItemRepository items;

    CadastrosQueries(PartnerRepository partners, ItemRepository items) {
        this.partners = partners;
        this.items = items;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CustomerRef> customer(UUID id) {
        return partners.findById(id).filter(p -> p.hasRole(Partner.Role.CLIENTE)).map(p -> new CustomerRef(p.id(), p.code(),
                p.legalName(), p.status(Partner.Role.CLIENTE) == Partner.Status.ATIVO,
                p.units().stream().map(u -> new UnitRef(u.id(), u.name(), u.city(), u.state())).toList()));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<SupplierRef> supplier(UUID id) {
        return partners.findById(id).filter(p -> p.hasRole(Partner.Role.FORNECEDOR)).map(p -> new SupplierRef(p.id(), p.code(),
                p.legalName(), p.status(Partner.Role.FORNECEDOR) == Partner.Status.ATIVO));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ItemRef> item(UUID id) {
        return items.findById(id).map(i -> new ItemRef(i.id(), i.code(), i.description(), i.nature().name(), i.uom(),
                i.status() == Partner.Status.ATIVO, i.referenceCost()));
    }
}
