package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.cadastros.api.ItemFiscalCodesApi;
import br.com.fourtech.rendamais.fiscal.application.ClassificationRepository;
import br.com.fourtech.rendamais.fiscal.application.ClassificationService;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Classificação fiscal dos itens ativos: lista com a situação e o que falta, ficha e gravação (If-Match com a versão do perfil). */
@RestController
@RequestMapping("/api/v1/fiscal-classification")
class ClassificationController {

    private final ClassificationService service;

    ClassificationController(ClassificationService service) {
        this.service = service;
    }

    record ItemDto(String itemId, String code, String description, String nature, String type, String category, String ncm,
                   String serviceCode, String cfopInternal, String cfopInterstate, String csosn, String origin, String annex,
                   String activityId, String activityName, String nbs, String issRetention, boolean review, String reviewNote,
                   String status, List<String> reasons, String version) {
        static ItemDto of(ClassificationService.ItemView v) {
            ItemFiscalCodesApi.FiscalItem i = v.item();
            ClassificationRepository.Profile p = v.profile();
            return new ItemDto(i.id().toString(), i.code(), i.description(), i.nature(), v.type(), i.category(), i.ncm(), i.serviceCode(),
                    p == null ? null : p.cfopInternal(), p == null ? null : p.cfopInterstate(), p == null ? null : p.csosn(),
                    p == null ? null : p.origin(), p == null ? null : p.annex(), p == null || p.activityId() == null ? null : p.activityId().toString(),
                    v.activityName(), p == null ? null : p.nbs(), p == null ? null : p.issRetention(), p != null && p.review(),
                    p == null ? null : p.reviewNote(), v.status(), v.reasons(), Long.toString(v.version()));
        }
    }

    @GetMapping
    List<ItemDto> list() {
        return service.list().stream().map(ItemDto::of).toList();
    }

    @GetMapping("/{itemId}")
    ResponseEntity<ItemDto> get(@PathVariable UUID itemId) {
        ClassificationService.ItemView v = service.get(itemId);
        return ResponseEntity.ok().eTag("\"" + v.version() + "\"").body(ItemDto.of(v));
    }

    @GetMapping("/{itemId}/history")
    List<HistoryEntry> history(@PathVariable UUID itemId) {
        return service.history(itemId).stream().map(HistoryEntry::of).toList();
    }

    @PutMapping("/{itemId}")
    ResponseEntity<ItemDto> update(@PathVariable UUID itemId, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                   @RequestBody(required = false) ClassificationService.UpdateRequest body) {
        ClassificationService.ItemView v = service.update(itemId, Versions.required(ifMatch), body);
        return ResponseEntity.ok().eTag("\"" + v.version() + "\"").body(ItemDto.of(v));
    }
}
