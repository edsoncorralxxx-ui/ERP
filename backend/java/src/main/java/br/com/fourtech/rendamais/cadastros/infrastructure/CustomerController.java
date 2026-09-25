package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.PartnerService;
import br.com.fourtech.rendamais.cadastros.application.PartnerRepository;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.cadastros.domain.PartnerData;
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
import java.util.List;
import java.util.UUID;

import static br.com.fourtech.rendamais.cadastros.infrastructure.ApiSupport.version;

/**
 * API de clientes e unidades (S2-07). POST exige Idempotency-Key; PUT, inativação e "tornar cliente" exigem If-Match
 * com a versão lida. A situação devolvida é a do papel de cliente.
 */
@RestController
@RequestMapping("/api/v1/customers")
class CustomerController {

    private static final Partner.Role ROLE = Partner.Role.CLIENTE;

    private final PartnerService service;

    CustomerController(PartnerService service) {
        this.service = service;
    }

    record UnitDto(String id, String name, String street, String number, String district, String city, String state,
                   String postalCode) { }

    record ContactDto(String id, String name, String role, String phone, String email) { }

    record CustomerRequest(String legalName, String tradeName, String cnpj, String group, List<UnitDto> units,
                           List<ContactDto> contacts) {
        PartnerData toData() {
            return new PartnerData(legalName, tradeName, cnpj, group,
                    units == null ? null : units.stream().map(u -> new PartnerData.UnitData(u.id(), u.name(), u.street(),
                            u.number(), u.district(), u.city(), u.state(), u.postalCode())).toList(),
                    contacts == null ? null : contacts.stream().map(c -> new PartnerData.ContactData(c.id(), c.name(),
                            c.role(), c.phone(), c.email())).toList());
        }
    }

    record CustomerResponse(String id, String code, String legalName, String tradeName, String cnpj, String cnpjFormatted,
                            String group, String status, boolean supplier, List<UnitDto> units, List<ContactDto> contacts,
                            String version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        static CustomerResponse of(Partner p) {
            return new CustomerResponse(p.id().toString(), p.code(), p.legalName(), p.tradeName(),
                    p.cnpj() == null ? null : p.cnpj().value(), p.cnpj() == null ? null : p.cnpj().formatted(), p.group(),
                    p.status(ROLE).name(), p.status(Partner.Role.FORNECEDOR) == Partner.Status.ATIVO,
                    p.units().stream().map(u -> new UnitDto(u.id().toString(), u.name(), u.street(), u.number(), u.district(),
                            u.city(), u.state(), u.postalCode())).toList(),
                    p.contacts().stream().map(c -> new ContactDto(c.id().toString(), c.name(), c.role(), c.phone(), c.email()))
                            .toList(),
                    Long.toString(p.version()), p.createdAt(), p.createdBy(), p.updatedAt(), p.updatedBy());
        }
    }

    record CustomerSummary(String id, String code, String legalName, String tradeName, String cnpjFormatted, String city,
                           String state, int units, String status, String version) {
        static CustomerSummary of(PartnerRepository.Summary s) {
            return new CustomerSummary(s.id().toString(), s.code(), s.legalName(), s.tradeName(), s.cnpj(), s.city(), s.state(),
                    s.units(), s.status().name(), Long.toString(s.version()));
        }
    }

    @GetMapping
    List<CustomerSummary> list(@RequestParam(value = "search", required = false) String search,
                               @RequestParam(value = "status", defaultValue = "ATIVO") String status) {
        return service.list(ROLE, search, ApiSupport.status(status)).stream().map(CustomerSummary::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<CustomerResponse> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(ROLE, id));
    }

    @PostMapping
    ResponseEntity<CustomerResponse> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                              @RequestBody CustomerRequest body) {
        return respond(HttpStatus.CREATED, service.register(ROLE, key, body.toData(), null));
    }

    @PutMapping("/{id}")
    ResponseEntity<CustomerResponse> update(@PathVariable UUID id,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                            @RequestBody CustomerRequest body) {
        return respond(HttpStatus.OK, service.update(ROLE, id, version(ifMatch), body.toData(), null));
    }

    @PostMapping("/{id}/deactivate")
    ResponseEntity<CustomerResponse> deactivate(@PathVariable UUID id,
                                                @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                @RequestBody(required = false) ApiSupport.DeactivateRequest body) {
        return respond(HttpStatus.OK, service.deactivate(ROLE, id, version(ifMatch), body == null ? null : body.reason()));
    }

    /** Torna cliente um parceiro já cadastrado (por exemplo, um fornecedor), sem duplicar o cadastro. */
    @PostMapping("/{id}/enable")
    ResponseEntity<CustomerResponse> enable(@PathVariable UUID id,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.enable(ROLE, id, version(ifMatch)));
    }

    @GetMapping("/{id}/history")
    List<ApiSupport.HistoryEntry> history(@PathVariable UUID id) {
        return service.history(ROLE, id).stream().map(ApiSupport.HistoryEntry::of).toList();
    }

    private static ResponseEntity<CustomerResponse> respond(HttpStatus status, Partner p) {
        return ResponseEntity.status(status).eTag("\"" + p.version() + "\"").body(CustomerResponse.of(p));
    }
}
