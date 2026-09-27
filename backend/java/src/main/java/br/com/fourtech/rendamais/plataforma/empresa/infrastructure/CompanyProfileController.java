package br.com.fourtech.rendamais.plataforma.empresa.infrastructure;

import br.com.fourtech.rendamais.plataforma.empresa.application.CompanyProfileService;
import br.com.fourtech.rendamais.plataforma.empresa.domain.Address;
import br.com.fourtech.rendamais.plataforma.empresa.domain.CompanyProfile;
import br.com.fourtech.rendamais.plataforma.empresa.domain.CompanyProfileData;
import br.com.fourtech.rendamais.plataforma.web.PreconditionRequiredException;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/** API dos dados da empresa: GET com ETag; PUT exige If-Match com a versão lida. */
@RestController
@RequestMapping("/api/v1/company-profile")
class CompanyProfileController {

    private final CompanyProfileService service;

    CompanyProfileController(CompanyProfileService service) {
        this.service = service;
    }

    record AddressDto(String street, String number, String complement, String district, String city, String state,
                      String postalCode) { }

    record CompanyProfileRequest(String legalName, String tradeName, String cnpj, AddressDto address, String phone,
                                 String email) { }

    record CompanyProfileResponse(String id, String legalName, String tradeName, String cnpj, String cnpjFormatted,
                                  AddressDto address, String phone, String email, boolean configured, String version,
                                  Instant updatedAt, String updatedBy) { }

    @GetMapping
    ResponseEntity<CompanyProfileResponse> get() {
        return respond(service.get());
    }

    @PutMapping
    ResponseEntity<CompanyProfileResponse> put(@RequestHeader(value = "If-Match", required = false) String ifMatch,
                                               @RequestBody CompanyProfileRequest body) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new PreconditionRequiredException();
        }
        long expected = Versions.parse(ifMatch);
        AddressDto a = body.address();
        Address address = a == null ? Address.empty()
                : new Address(a.street(), a.number(), a.complement(), a.district(), a.city(), a.state(), a.postalCode());
        CompanyProfile updated = service.update(expected,
                new CompanyProfileData(body.legalName(), body.tradeName(), body.cnpj(), address, body.phone(), body.email()));
        return respond(updated);
    }

    private static ResponseEntity<CompanyProfileResponse> respond(CompanyProfile p) {
        Address a = p.address();
        CompanyProfileResponse r = new CompanyProfileResponse(p.id().toString(), p.legalName(), p.tradeName(),
                p.cnpj() == null ? null : p.cnpj().value(), p.cnpj() == null ? null : p.cnpj().formatted(),
                new AddressDto(a.street(), a.number(), a.complement(), a.district(), a.city(), a.state(), a.postalCode()),
                p.phone(), p.email(), p.configured(), Long.toString(p.version()), p.updatedAt(), p.updatedBy());
        return ResponseEntity.ok().eTag("\"" + p.version() + "\"").body(r);
    }
}
