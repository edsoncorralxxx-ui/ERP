package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.PartnerService;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** API de clientes e unidades (S2-07; ficha do mock na Sprint 13). As rotas estão em {@link PartnerEndpoints}. */
@RestController
@RequestMapping("/api/v1/customers")
class CustomerController extends PartnerEndpoints {

    CustomerController(PartnerService service) {
        super(service, Partner.Role.CLIENTE);
    }
}
