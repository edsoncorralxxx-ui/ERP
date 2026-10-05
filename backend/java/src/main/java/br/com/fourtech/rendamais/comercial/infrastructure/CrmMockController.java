package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.ActivityService;
import br.com.fourtech.rendamais.comercial.application.CrmPanelService;
import br.com.fourtech.rendamais.comercial.application.OpportunityDetailsService;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Rotas do CRM refeito pelo mock (Sprint 13): atividades e agenda, detalhes da oportunidade (contato, necessidade do
 * cliente, itens de interesse, documentos), painel comercial, quadros de leads e de oportunidades e a qualificação do lead.
 */
@RestController
class CrmMockController {

    private final ActivityService activities;
    private final OpportunityDetailsService details;
    private final CrmPanelService panel;

    CrmMockController(ActivityService activities, OpportunityDetailsService details, CrmPanelService panel) {
        this.activities = activities;
        this.details = details;
        this.panel = panel;
    }

    record FinishRequest(String notes) { }

    record VersionDto(String version) { }

    // ───────────── Atividades ─────────────

    @GetMapping("/api/v1/crm/activities")
    List<ActivityService.Activity> activities(@RequestParam(value = "from", required = false) LocalDate from,
                                              @RequestParam(value = "to", required = false) LocalDate to,
                                              @RequestParam(value = "owner", required = false) String owner,
                                              @RequestParam(value = "kind", required = false) String kind,
                                              @RequestParam(value = "partnerId", required = false) UUID partnerId,
                                              @RequestParam(value = "leadId", required = false) UUID leadId,
                                              @RequestParam(value = "opportunityId", required = false) UUID opportunityId) {
        return activities.list(new ActivityService.Filter(from, to, owner, kind, partnerId, leadId, opportunityId));
    }

    @GetMapping("/api/v1/crm/activities/{id}")
    ResponseEntity<ActivityService.Activity> activity(@PathVariable UUID id) {
        return respond(HttpStatus.OK, activities.get(id));
    }

    @PostMapping("/api/v1/crm/activities")
    ResponseEntity<ActivityService.Activity> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                                      @RequestBody ActivityService.Data body) {
        return respond(HttpStatus.CREATED, activities.register(key, body));
    }

    @PutMapping("/api/v1/crm/activities/{id}")
    ResponseEntity<ActivityService.Activity> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                    @RequestBody ActivityService.Data body) {
        return respond(HttpStatus.OK, activities.update(id, Versions.required(ifMatch), body));
    }

    @PostMapping("/api/v1/crm/activities/{id}/completion")
    ResponseEntity<ActivityService.Activity> complete(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                      @RequestBody(required = false) FinishRequest body) {
        return respond(HttpStatus.OK, activities.finish(id, Versions.required(ifMatch), true, body == null ? null : body.notes()));
    }

    @PostMapping("/api/v1/crm/activities/{id}/cancellation")
    ResponseEntity<ActivityService.Activity> cancel(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                    @RequestBody(required = false) FinishRequest body) {
        return respond(HttpStatus.OK, activities.finish(id, Versions.required(ifMatch), false, body == null ? null : body.notes()));
    }

    @GetMapping("/api/v1/crm/activities/{id}/history")
    List<HistoryEntry> activityHistory(@PathVariable UUID id) {
        return activities.history(id).stream().map(HistoryEntry::of).toList();
    }

    // ───────────── Oportunidade ─────────────

    @GetMapping("/api/v1/opportunities/{id}/details")
    ResponseEntity<OpportunityDetailsService.Details> details(@PathVariable UUID id) {
        OpportunityDetailsService.Details d = details.get(id);
        return ResponseEntity.ok().eTag("\"" + d.version() + "\"").body(d);
    }

    @PutMapping("/api/v1/opportunities/{id}/details")
    ResponseEntity<OpportunityDetailsService.Details> updateDetails(@PathVariable UUID id,
                                                                    @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                                    @RequestBody OpportunityDetailsService.Data body) {
        OpportunityDetailsService.Details d = details.update(id, Versions.required(ifMatch), body);
        return ResponseEntity.ok().eTag("\"" + d.version() + "\"").body(d);
    }

    // ───────────── Painel e quadros ─────────────

    @GetMapping("/api/v1/crm/dashboard")
    CrmPanelService.Dashboard dashboard(@RequestParam(value = "month", required = false) String month,
                                        @RequestParam(value = "owner", required = false) String owner) {
        return panel.dashboard(month, owner);
    }

    @GetMapping("/api/v1/crm/opportunity-board")
    List<CrmPanelService.OpportunityRow> opportunityBoard(@RequestParam(value = "owner", required = false) String owner) {
        return panel.opportunities(owner);
    }

    @GetMapping("/api/v1/crm/lead-board")
    List<CrmPanelService.LeadRow> leadBoard() {
        return panel.leads();
    }

    @PutMapping("/api/v1/leads/{id}/qualification")
    ResponseEntity<VersionDto> qualify(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                       @RequestBody CrmPanelService.Qualification body) {
        long v = panel.qualify(id, Versions.required(ifMatch), body);
        return ResponseEntity.ok().eTag("\"" + v + "\"").body(new VersionDto(Long.toString(v)));
    }

    private static ResponseEntity<ActivityService.Activity> respond(HttpStatus status, ActivityService.Activity a) {
        return ResponseEntity.status(status).eTag("\"" + a.version() + "\"").body(a);
    }
}
