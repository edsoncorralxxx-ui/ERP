package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.api.CustomerRegistrationApi;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.cadastros.domain.PartnerData;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/** Cliente cadastrado pela conversão da prospecção (Sprint 11): o mesmo caso de uso da ficha do cliente. */
@Component
class CustomerRegistration implements CustomerRegistrationApi {

    private final PartnerService partners;

    CustomerRegistration(PartnerService partners) {
        this.partners = partners;
    }

    @Override
    public UUID register(String idempotencyKey, NewCustomer c) {
        List<PartnerData.UnitData> units = List.of(new PartnerData.UnitData(null, c.unitName(), null, null, null, c.city(),
                c.state(), null, null));
        List<PartnerData.ContactData> contacts = c.contactName() == null ? List.of()
                : List.of(new PartnerData.ContactData(null, c.contactName(), null, c.contactPhone(), c.contactEmail()));
        PartnerData data = new PartnerData(c.legalName(), c.tradeName(), null, null, units, contacts);
        return partners.register(Partner.Role.CLIENTE, idempotencyKey, data, null).id();
    }
}
