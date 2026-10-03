package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.acesso.api.UserDirectory;
import br.com.fourtech.rendamais.comercial.application.CrmQueries;
import br.com.fourtech.rendamais.comercial.application.OpportunityService;
import br.com.fourtech.rendamais.comercial.infrastructure.CrmDtos.StageDto;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Agenda, funil de vendas, responsáveis e etapas do funil (S11). */
@RestController
class CrmController {

    private final CrmQueries queries;
    private final OpportunityService opportunities;

    CrmController(CrmQueries queries, OpportunityService opportunities) {
        this.queries = queries;
        this.opportunities = opportunities;
    }

    record AgendaDto(String bucket, String kind, String id, String code, String name, String party, String owner, String stage,
                     LocalDate nextActionDate, String nextActionNote) { }

    record StageTotalDto(String code, String name, String closePercent, int count, String potentialCents, String weightedCents) { }

    record ClosedDto(int count, String potentialCents) { }

    record ConversionDto(String code, String name, int entered, int advanced, String rate) { }

    record FunnelDto(LocalDate from, LocalDate to, List<StageTotalDto> stages, int openCount, String openPotentialCents,
                     String openWeightedCents, ClosedDto won, ClosedDto lost, Map<String, ClosedDto> lostByReason,
                     List<ConversionDto> conversion) { }

    record StageRequest(String name, String closePercent) { }

    @GetMapping("/api/v1/crm/agenda")
    List<AgendaDto> agenda(@RequestParam(value = "owner", required = false) String owner) {
        return queries.agenda(owner).stream().map(i -> new AgendaDto(i.bucket().name(), i.row().kind(), i.row().id().toString(),
                i.row().code(), i.row().name(), i.row().party(), i.row().owner(), i.row().stage(), i.row().nextActionDate(),
                i.row().nextActionNote())).toList();
    }

    @GetMapping("/api/v1/crm/funnel")
    FunnelDto funnel(@RequestParam(value = "from", required = false) String from,
                     @RequestParam(value = "to", required = false) String to,
                     @RequestParam(value = "owner", required = false) String owner) {
        CrmQueries.Funnel f = queries.funnel(from, to, owner);
        Map<String, ClosedDto> byReason = new LinkedHashMap<>();
        f.lostByReason().forEach((k, v) -> byReason.put(k, closed(v)));
        return new FunnelDto(f.from(), f.to(), f.stages().stream().map(s -> new StageTotalDto(s.code(), s.name(),
                s.closePercent().setScale(2).toPlainString(), s.count(), Long.toString(s.potentialCents()),
                Long.toString(s.weightedCents()))).toList(), f.openCount(), Long.toString(f.openPotentialCents()),
                Long.toString(f.openWeightedCents()), closed(f.won()), closed(f.lost()), byReason,
                f.conversion().stream().map(c -> new ConversionDto(c.code(), c.name(), c.entered(), c.advanced(),
                        c.rate() == null ? null : c.rate().toPlainString())).toList());
    }

    @GetMapping("/api/v1/crm/owners")
    List<UserDirectory.UserRef> owners() {
        return opportunities.owners();
    }

    @GetMapping("/api/v1/opportunity-stages")
    List<StageDto> stages() {
        return opportunities.stages().stream().map(StageDto::of).toList();
    }

    @PutMapping("/api/v1/opportunity-stages/{code}")
    ResponseEntity<StageDto> updateStage(@PathVariable String code, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                         @RequestBody StageRequest body) {
        var s = opportunities.updateStage(code, Versions.required(ifMatch), body.name(), body.closePercent());
        return ResponseEntity.ok().eTag("\"" + s.version() + "\"").body(StageDto.of(s));
    }

    @GetMapping("/api/v1/opportunity-stages/{code}/history")
    List<HistoryEntry> stageHistory(@PathVariable String code) {
        return opportunities.stageHistory(code).stream().map(HistoryEntry::of).toList();
    }

    private static ClosedDto closed(CrmQueries.Closed c) {
        return new ClosedDto(c.count(), Long.toString(c.potentialCents()));
    }
}
