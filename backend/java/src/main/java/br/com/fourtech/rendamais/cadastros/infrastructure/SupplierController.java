package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.PartnerRepository;
import br.com.fourtech.rendamais.cadastros.application.PartnerService;
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
 * API de fornecedores (S3-02): o mesmo parceiro do cliente, no papel de fornecedor. POST exige Idempotency-Key; PUT,
 * inativação e "tornar fornecedor" exigem If-Match. A ficha do fornecedor não edita as unidades do cliente.
 */
@RestController
@RequestMapping("/api/v1/suppliers")
class SupplierController {

    private static final Partner.Role ROLE = Partner.Role.FORNECEDOR;

    private final PartnerService service;

    SupplierController(PartnerService service) {
        this.service = service;
    }

    record ContactDto(String id, String name, String role, String phone, String email) { }

    record CategoryDto(String id, String name) { }

    record SupplierRequest(String legalName, String tradeName, String cnpj, String group, Integer leadTimeDays,
                           String paymentTerms, List<String> suppliedCategoryIds, List<ContactDto> contacts) {
        PartnerData toData() {
            return new PartnerData(legalName, tradeName, cnpj, group, null,
                    contacts == null ? null : contacts.stream().map(c -> new PartnerData.ContactData(c.id(), c.name(), c.role(),
                            c.phone(), c.email())).toList());
        }

        PartnerService.SupplierInput supplier() {
            return new PartnerService.SupplierInput(leadTimeDays, paymentTerms,
                    suppliedCategoryIds == null ? List.of() : suppliedCategoryIds);
        }
    }

    record SupplierResponse(String id, String code, String legalName, String tradeName, String cnpj, String cnpjFormatted,
                            String group, String status, boolean customer, Integer leadTimeDays, String paymentTerms,
                            List<CategoryDto> suppliedCategories, List<ContactDto> contacts, String version, Instant createdAt,
                            String createdBy, Instant updatedAt, String updatedBy) {
        static SupplierResponse of(Partner p) {
            return new SupplierResponse(p.id().toString(), p.code(), p.legalName(), p.tradeName(),
                    p.cnpj() == null ? null : p.cnpj().value(), p.cnpj() == null ? null : p.cnpj().formatted(), p.group(),
                    p.status(ROLE).name(), p.status(Partner.Role.CLIENTE) == Partner.Status.ATIVO,
                    p.supplier().leadTimeDays(), p.supplier().paymentTerms(),
                    p.supplier().categories().stream().map(c -> new CategoryDto(c.id().toString(), c.name())).toList(),
                    p.contacts().stream().map(c -> new ContactDto(c.id().toString(), c.name(), c.role(), c.phone(), c.email()))
                            .toList(),
                    Long.toString(p.version()), p.createdAt(), p.createdBy(), p.updatedAt(), p.updatedBy());
        }
    }

    record SupplierSummary(String id, String code, String legalName, String tradeName, String cnpjFormatted, String city,
                           String state, String suppliedCategories, Integer leadTimeDays, String status, String version) {
        static SupplierSummary of(PartnerRepository.Summary s) {
            return new SupplierSummary(s.id().toString(), s.code(), s.legalName(), s.tradeName(), s.cnpj(), s.city(), s.state(),
                    s.categories(), s.leadTimeDays(), s.status().name(), Long.toString(s.version()));
        }
    }

    @GetMapping
    List<SupplierSummary> list(@RequestParam(value = "search", required = false) String search,
                               @RequestParam(value = "status", defaultValue = "ATIVO") String status) {
        return service.list(ROLE, search, ApiSupport.status(status)).stream().map(SupplierSummary::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<SupplierResponse> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(ROLE, id));
    }

    @PostMapping
    ResponseEntity<SupplierResponse> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                              @RequestBody SupplierRequest body) {
        return respond(HttpStatus.CREATED, service.register(ROLE, key, body.toData(), body.supplier()));
    }

    @PutMapping("/{id}")
    ResponseEntity<SupplierResponse> update(@PathVariable UUID id,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                            @RequestBody SupplierRequest body) {
        return respond(HttpStatus.OK, service.update(ROLE, id, version(ifMatch), body.toData(), body.supplier()));
    }

    @PostMapping("/{id}/deactivate")
    ResponseEntity<SupplierResponse> deactivate(@PathVariable UUID id,
                                                @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                @RequestBody(required = false) ApiSupport.DeactivateRequest body) {
        return respond(HttpStatus.OK, service.deactivate(ROLE, id, version(ifMatch), body == null ? null : body.reason()));
    }

    /** Torna fornecedor um parceiro já cadastrado (por exemplo, um cliente), sem duplicar o cadastro. */
    @PostMapping("/{id}/enable")
    ResponseEntity<SupplierResponse> enable(@PathVariable UUID id,
                                            @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.enable(ROLE, id, version(ifMatch)));
    }

    @GetMapping("/{id}/history")
    List<ApiSupport.HistoryEntry> history(@PathVariable UUID id) {
        return service.history(ROLE, id).stream().map(ApiSupport.HistoryEntry::of).toList();
    }

    private static ResponseEntity<SupplierResponse> respond(HttpStatus status, Partner p) {
        return ResponseEntity.status(status).eTag("\"" + p.version() + "\"").body(SupplierResponse.of(p));
    }
}
