package br.com.fourtech.rendamais.fiscal.infrastructure;

import br.com.fourtech.rendamais.fiscal.application.ClassificationService;
import br.com.fourtech.rendamais.fiscal.application.TaxSetupRepository;
import br.com.fourtech.rendamais.fiscal.application.TaxSetupService;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
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
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tabelas e parâmetros do Simples: dados da empresa no Simples e limites (If-Match), atividades e anexos, opção IBS/CBS
 * de 2027 e o histórico de receita anterior ao Renda+ (digitado com If-Match ou carregado do arquivo, com prévia).
 */
@RestController
@RequestMapping("/api/v1")
class FiscalSetupController {

    private final TaxSetupService service;
    private final ClassificationService classification;

    FiscalSetupController(TaxSetupService service, ClassificationService classification) {
        this.service = service;
        this.classification = classification;
    }

    record ProfileDto(String regime, LocalDate optedSince, String cnaeMain, String cnaeSecondary, String revenueRecognition,
                      String nfseIssuer, String annualLimitCents, String sublimitCents, String tolerance, String alertThreshold,
                      String version, Instant updatedAt, String updatedBy) { }

    record ActivityDto(String id, int position, String name, String framing, String annex, String annexLabel, String taxes, String status,
                       long items, String version) { }

    record OptionDto(String id, String period, String choice, LocalDate deadline, LocalDate withdrawalUntil, String notes,
                     Instant createdAt, String createdBy) { }

    record IbsCbsDto(String period, LocalDate deadline, LocalDate validFrom, LocalDate validTo, LocalDate withdrawalUntil,
                     OptionDto current, List<OptionDto> history) { }

    record SetupDto(ProfileDto profile, List<ActivityDto> activities, IbsCbsDto ibsCbs, String revenueStart) { }

    record HistoryDto(String competence, String annexICents, String annexIICents, String annexIIICents, String annexIVCents,
                      String annexVCents, String totalCents, String source, String informedBy, String notes, String version,
                      Instant updatedAt, String updatedBy) {
        static HistoryDto of(TaxSetupRepository.History h) {
            long[] a = h.annexCents();
            return new HistoryDto(h.competence().toString(), Long.toString(a[0]), Long.toString(a[1]), Long.toString(a[2]), Long.toString(a[3]),
                    Long.toString(a[4]), Long.toString(h.totalCents()), h.source(), h.informedBy(), h.notes(), Long.toString(h.version()),
                    h.updatedAt() == null ? h.createdAt() : h.updatedAt(), h.updatedBy() == null ? h.createdBy() : h.updatedBy());
        }
    }

    record ImportLineDto(int line, String competence, Map<String, String> annexes, String totalCents, String problem, String warning) { }

    record ImportDto(String fileName, String hash, boolean alreadyLoaded, boolean confirmed, int months, List<ImportLineDto> lines,
                     List<String> problems) { }

    @GetMapping("/tax-setup")
    ResponseEntity<SetupDto> setup() {
        return respond(HttpStatus.OK, service.setup());
    }

    @GetMapping("/tax-setup/history")
    List<HistoryEntry> setupHistory() {
        return service.profileHistory().stream().map(HistoryEntry::of).toList();
    }

    @PutMapping("/tax-setup/profile")
    ResponseEntity<SetupDto> profile(@RequestHeader(value = "If-Match", required = false) String ifMatch,
                                     @RequestBody(required = false) TaxSetupService.ProfileRequest body) {
        return respond(HttpStatus.OK, service.updateProfile(Versions.required(ifMatch), body));
    }

    @PostMapping("/tax-activities")
    ResponseEntity<SetupDto> addActivity(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                         @RequestBody(required = false) TaxSetupService.ActivityRequest body) {
        return respond(HttpStatus.CREATED, service.addActivity(key, body));
    }

    @PutMapping("/tax-activities/{id}")
    ResponseEntity<SetupDto> updateActivity(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                            @RequestBody(required = false) TaxSetupService.ActivityRequest body) {
        return respond(HttpStatus.OK, service.updateActivity(id, Versions.required(ifMatch), body));
    }

    @PostMapping("/tax-ibs-cbs-options")
    ResponseEntity<SetupDto> option(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                    @RequestBody(required = false) TaxSetupService.OptionRequest body) {
        return respond(HttpStatus.CREATED, service.registerOption(key, body));
    }

    @GetMapping("/tax-revenue-history")
    List<HistoryDto> history() {
        return service.history().stream().map(HistoryDto::of).toList();
    }

    @PutMapping("/tax-revenue-history/{competence}")
    ResponseEntity<HistoryDto> recordHistory(@PathVariable String competence,
                                             @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                             @RequestBody(required = false) TaxSetupService.HistoryRequest body) {
        TaxSetupRepository.History h = service.recordHistory(competence, Versions.required(ifMatch), body);
        return ResponseEntity.ok().eTag("\"" + h.version() + "\"").body(HistoryDto.of(h));
    }

    @PostMapping("/tax-revenue-history/imports")
    ResponseEntity<ImportDto> importHistory(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                            @RequestBody(required = false) TaxSetupService.ImportRequest body) {
        TaxSetupService.ImportPreview p = service.importHistory(key, body);
        return ResponseEntity.status(p.confirmed() ? HttpStatus.CREATED : HttpStatus.OK).body(new ImportDto(p.fileName(), p.hash(),
                p.alreadyLoaded(), p.confirmed(), p.months(), p.lines().stream().map(l -> new ImportLineDto(l.line(), l.competence(),
                annexes(l.annexCents()), Long.toString(l.totalCents()), l.problem(), l.warning())).toList(), p.problems()));
    }

    private static Map<String, String> annexes(long[] cents) {
        Map<String, String> m = new java.util.LinkedHashMap<>();
        for (Annex a : Annex.values()) m.put(a.name(), Long.toString(cents[a.ordinal()]));
        return m;
    }

    private ResponseEntity<SetupDto> respond(HttpStatus status, TaxSetupService.Setup s) {
        TaxSetupRepository.Profile p = s.profile();
        Map<UUID, Long> counts = classification.itemsByActivity();
        List<OptionDto> options = s.options().stream().map(o -> new OptionDto(o.id().toString(), o.period(), o.choice(), o.deadline(),
                o.withdrawalUntil(), o.notes(), o.createdAt(), o.createdBy())).toList();
        SetupDto dto = new SetupDto(new ProfileDto(p.regime(), p.optedSince(), p.cnaeMain(), p.cnaeSecondary(), p.revenueRecognition(),
                p.nfseIssuer(), Long.toString(p.annualLimitCents()), Long.toString(p.sublimitCents()),
                p.tolerance().stripTrailingZeros().toPlainString(), p.alertThreshold().stripTrailingZeros().toPlainString(),
                Long.toString(p.version()), p.updatedAt(), p.updatedBy()),
                s.activities().stream().map(a -> new ActivityDto(a.id().toString(), a.position(), a.name(), a.framing(), a.annex(),
                        Annex.parse(a.annex()).label(), a.taxes(), a.status(), counts.getOrDefault(a.id(), 0L), Long.toString(a.version()))).toList(),
                new IbsCbsDto(TaxSetupService.IBS_PERIOD, TaxSetupService.IBS_DEADLINE, TaxSetupService.IBS_FROM, TaxSetupService.IBS_TO,
                        TaxSetupService.IBS_WITHDRAWAL, options.isEmpty() ? null : options.getFirst(), options),
                s.revenueStart().toString());
        return ResponseEntity.status(status).eTag("\"" + p.version() + "\"").body(dto);
    }
}
