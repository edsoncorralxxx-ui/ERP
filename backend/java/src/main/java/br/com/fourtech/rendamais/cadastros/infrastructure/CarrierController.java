package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.PartnerService;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** API de transportadoras (Sprint 13): o parceiro no papel de transportadora. As rotas estão em {@link PartnerEndpoints}. */
@RestController
@RequestMapping("/api/v1/carriers")
class CarrierController extends PartnerEndpoints {

    CarrierController(PartnerService service) {
        super(service, Partner.Role.TRANSPORTADORA);
    }
}
