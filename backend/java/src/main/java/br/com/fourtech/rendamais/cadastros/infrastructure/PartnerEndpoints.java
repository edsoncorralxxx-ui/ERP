package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.PartnerRepository;
import br.com.fourtech.rendamais.cadastros.application.PartnerService;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.cadastros.domain.PartnerData;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static br.com.fourtech.rendamais.cadastros.infrastructure.ApiSupport.version;

/**
 * Rotas comuns aos papéis do parceiro (clientes, fornecedores e transportadoras: ficha "Dados mestre do parceiro" do
 * mock). POST exige Idempotency-Key; PUT, inativação e "tornar…" exigem If-Match com a versão lida. A situação devolvida
 * é a do papel da rota. Lista ausente no PUT (unidades, contatos) e {@code profile} ausente mantêm o que o parceiro tem.
 */
abstract class PartnerEndpoints {

    private final PartnerService service;
    private final Partner.Role role;

    PartnerEndpoints(PartnerService service, Partner.Role role) {
        this.service = service;
        this.role = role;
    }

    /** {@code cnpj} só dígitos (ou com máscara) na entrada; na saída, só dígitos e {@code cnpjFormatted} com máscara. */
    record UnitDto(String id, String name, String street, String number, String district, String city, String state,
                   String postalCode, String cnpj, String cnpjFormatted, String kind, Boolean isDefault) { }

    record ContactDto(String id, String name, String role, String phone, String email, Boolean primary, Boolean receivesInvoices) { }

    record CategoryDto(String id, String name) { }

    /**
     * {@code code} só no cadastro, para a série Manual. Dados de fornecedor ({@code leadTimeDays}, {@code paymentTerms},
     * {@code suppliedCategoryIds}) só valem na rota de fornecedores.
     */
    record PartnerRequest(String code, String legalName, String tradeName, String cnpj, String group, List<UnitDto> units,
                          List<ContactDto> contacts, Integer leadTimeDays, String paymentTerms, List<String> suppliedCategoryIds,
                          Map<String, Object> profile) {
        PartnerData toData() {
            return new PartnerData(legalName, tradeName, cnpj, group,
                    units == null ? null : units.stream().map(u -> new PartnerData.UnitData(u.id(), u.name(), u.street(),
                            u.number(), u.district(), u.city(), u.state(), u.postalCode(), u.cnpj(), u.kind(), u.isDefault())).toList(),
                    contacts == null ? null : contacts.stream().map(c -> new PartnerData.ContactData(c.id(), c.name(),
                            c.role(), c.phone(), c.email(), c.primary(), c.receivesInvoices())).toList(),
                    null, profile);
        }
    }

    record PartnerResponse(String id, String code, String legalName, String tradeName, String cnpj, String cnpjFormatted,
                           String group, String status, boolean customer, boolean supplier, boolean carrier, Integer leadTimeDays,
                           String paymentTerms, List<CategoryDto> suppliedCategories, List<UnitDto> units, List<ContactDto> contacts,
                           Map<String, Object> profile, String version, Instant createdAt, String createdBy, Instant updatedAt,
                           String updatedBy) {
        static PartnerResponse of(Partner p, Partner.Role role) {
            return new PartnerResponse(p.id().toString(), p.code(), p.legalName(), p.tradeName(),
                    p.cnpj() == null ? null : p.cnpj().value(), p.cnpj() == null ? null : p.cnpj().formatted(), p.group(),
                    p.status(role).name(), p.status(Partner.Role.CLIENTE) == Partner.Status.ATIVO,
                    p.status(Partner.Role.FORNECEDOR) == Partner.Status.ATIVO, p.status(Partner.Role.TRANSPORTADORA) == Partner.Status.ATIVO,
                    p.supplier().leadTimeDays(), p.supplier().paymentTerms(),
                    p.supplier().categories().stream().map(c -> new CategoryDto(c.id().toString(), c.name())).toList(),
                    p.units().stream().map(u -> new UnitDto(u.id().toString(), u.name(), u.street(), u.number(), u.district(),
                            u.city(), u.state(), u.postalCode(), u.cnpj() == null ? null : u.cnpj().value(),
                            u.cnpj() == null ? null : u.cnpj().formatted(), u.kind().name(), u.isDefault())).toList(),
                    p.contacts().stream().map(c -> new ContactDto(c.id().toString(), c.name(), c.role(), c.phone(), c.email(),
                            c.primary(), c.receivesInvoices())).toList(),
                    p.profile(), Long.toString(p.version()), p.createdAt(), p.createdBy(), p.updatedAt(), p.updatedBy());
        }
    }

    record PartnerSummary(String id, String code, String legalName, String tradeName, String cnpjFormatted, String city,
                          String state, int units, String suppliedCategories, Integer leadTimeDays, String status, String version) {
        static PartnerSummary of(PartnerRepository.Summary s) {
            return new PartnerSummary(s.id().toString(), s.code(), s.legalName(), s.tradeName(), s.cnpj(), s.city(), s.state(),
                    s.units(), s.categories(), s.leadTimeDays(), s.status().name(), Long.toString(s.version()));
        }
    }

    private PartnerService.SupplierInput supplier(PartnerRequest body) {
        if (role != Partner.Role.FORNECEDOR) return null;
        return new PartnerService.SupplierInput(body.leadTimeDays(), body.paymentTerms(),
                body.suppliedCategoryIds() == null ? List.of() : body.suppliedCategoryIds());
    }

    @GetMapping
    List<PartnerSummary> list(@RequestParam(value = "search", required = false) String search,
                              @RequestParam(value = "status", defaultValue = "ATIVO") String status) {
        return service.list(role, search, ApiSupport.status(status)).stream().map(PartnerSummary::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<PartnerResponse> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(role, id));
    }

    @PostMapping
    ResponseEntity<PartnerResponse> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                             @RequestBody PartnerRequest body) {
        return respond(HttpStatus.CREATED, service.register(role, key, body.toData(), supplier(body), body.code()));
    }

    @PutMapping("/{id}")
    ResponseEntity<PartnerResponse> update(@PathVariable UUID id,
                                           @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                           @RequestBody PartnerRequest body) {
        return respond(HttpStatus.OK, service.update(role, id, version(ifMatch), body.toData(), supplier(body)));
    }

    @PostMapping("/{id}/deactivate")
    ResponseEntity<PartnerResponse> deactivate(@PathVariable UUID id,
                                               @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                               @RequestBody(required = false) ApiSupport.DeactivateRequest body) {
        return respond(HttpStatus.OK, service.deactivate(role, id, version(ifMatch), body == null ? null : body.reason()));
    }

    /** Dá o papel da rota a um parceiro já cadastrado (o cliente vira também fornecedor…), sem duplicar o cadastro. */
    @PostMapping("/{id}/enable")
    ResponseEntity<PartnerResponse> enable(@PathVariable UUID id,
                                           @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.enable(role, id, version(ifMatch)));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(role, id).stream().map(HistoryEntry::of).toList();
    }

    private ResponseEntity<PartnerResponse> respond(HttpStatus status, Partner p) {
        return ResponseEntity.status(status).eTag("\"" + p.version() + "\"").body(PartnerResponse.of(p, role));
    }
}
