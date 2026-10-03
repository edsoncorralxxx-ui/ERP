package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.OpportunityRepository;
import br.com.fourtech.rendamais.comercial.application.OpportunityService;
import br.com.fourtech.rendamais.comercial.domain.Opportunity;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.CompetitorDto;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.InteractionDto;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.InteractionRequest;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.OpportunityDto;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.StageChangeDto;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
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

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Oportunidades (S11): abrir com Idempotency-Key; alterar, mudar de etapa e marcar como perdida com If-Match; interações com
 * Idempotency-Key; abas Etapas, Propostas e Histórico.
 */
@RestController
@RequestMapping("/api/v1/opportunities")
class OpportunityController {

    private final OpportunityService service;

    OpportunityController(OpportunityService service) {
        this.service = service;
    }

    record OpportunityRequest(String name, String leadId, String customerId, String unitId, String owner, String source,
                              String interest, String potentialCents, String expectedClose, String notes, String nextActionDate,
                              String nextActionNote, List<CompetitorDto> competitors) {
        Opportunity.Data toData() {
            return new Opportunity.Data(name, leadId, customerId, unitId, owner, source, interest, potentialCents, expectedClose,
                    notes, nextActionDate, nextActionNote, competitors == null ? List.of()
                    : competitors.stream().map(c -> new Opportunity.CompetitorData(c.name(), c.threat(), c.notes())).toList());
        }
    }

    record StageRequest(String stage, String nextActionDate, String nextActionNote) { }

    record LossRequest(String lossReason, String lossNote) { }

    @GetMapping
    List<OpportunityDto> list(@RequestParam(value = "search", required = false) String search,
                              @RequestParam(value = "status", required = false) String status,
                              @RequestParam(value = "stage", required = false) String stage,
                              @RequestParam(value = "leadId", required = false) UUID leadId,
                              @RequestParam(value = "customerId", required = false) UUID customerId) {
        Opportunity.Status s = status == null || status.isBlank() || "TODAS".equalsIgnoreCase(status) ? null
                : Opportunity.Status.valueOf(status.toUpperCase(Locale.ROOT));
        var stages = service.stages();
        return service.list(search, s, stage, leadId, customerId).stream().map(o -> OpportunityDto.of(o, stages)).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<OpportunityDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<OpportunityDto> open(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                        @RequestBody OpportunityRequest body) {
        return respond(HttpStatus.CREATED, service.open(key, body.toData()));
    }

    @PutMapping("/{id}")
    ResponseEntity<OpportunityDto> update(@PathVariable UUID id,
                                          @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                          @RequestBody OpportunityRequest body) {
        return respond(HttpStatus.OK, service.update(id, Versions.required(ifMatch), body.toData()));
    }

    @PostMapping("/{id}/stage")
    ResponseEntity<OpportunityDto> stage(@PathVariable UUID id,
                                         @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                         @RequestBody StageRequest body) {
        return respond(HttpStatus.OK, service.changeStage(id, Versions.required(ifMatch), body.stage(), body.nextActionDate(),
                body.nextActionNote()));
    }

    @PostMapping("/{id}/loss")
    ResponseEntity<OpportunityDto> loss(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                        @RequestBody LossRequest body) {
        return respond(HttpStatus.OK, service.lose(id, Versions.required(ifMatch), body.lossReason(), body.lossNote()));
    }

    @GetMapping("/{id}/interactions")
    List<InteractionDto> interactions(@PathVariable UUID id) {
        return service.interactions(id).stream().map(InteractionDto::of).toList();
    }

    @PostMapping("/{id}/interactions")
    ResponseEntity<InteractionDto> recordInteraction(@PathVariable UUID id,
                                                     @RequestHeader(value = "Idempotency-Key", required = false) String key,
                                                     @RequestBody InteractionRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(InteractionDto.of(service.recordInteraction(id, key, body.toData())));
    }

    @GetMapping("/{id}/stages")
    List<StageChangeDto> stageChanges(@PathVariable UUID id) {
        var stages = service.stages();
        return service.stageChanges(id).stream().map(c -> StageChangeDto.of(c, stages)).toList();
    }

    @GetMapping("/{id}/proposals")
    List<ProposalController.ProposalSummary> proposals(@PathVariable UUID id) {
        return service.proposals(id).stream().map(ProposalController.ProposalSummary::of).toList();
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private ResponseEntity<OpportunityDto> respond(HttpStatus status, OpportunityRepository.Summary s) {
        return ResponseEntity.status(status).eTag("\"" + s.opportunity().version() + "\"")
                .body(OpportunityDto.of(s, service.stages()));
    }
}
