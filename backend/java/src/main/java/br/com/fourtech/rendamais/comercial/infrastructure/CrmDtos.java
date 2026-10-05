package br.com.fourtech.rendamais.comercial.infrastructure;

import br.com.fourtech.rendamais.comercial.application.LeadRepository;
import br.com.fourtech.rendamais.comercial.application.OpportunityRepository;
import br.com.fourtech.rendamais.comercial.domain.Crm;
import br.com.fourtech.rendamais.comercial.domain.Interaction;
import br.com.fourtech.rendamais.comercial.domain.Lead;
import br.com.fourtech.rendamais.comercial.domain.Opportunity;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Contratos JSON do CRM (Sprint 11). Valores em centavos como texto; datas AAAA-MM-DD. */
final class CrmDtos {

    private CrmDtos() { }

    record LeadDto(String id, String code, String companyName, String tradeName, String city, String state, String hasRenda,
                   Integer rating, String stage, String discardReason, String owner, String source, String contactName,
                   String contactPhone, String contactEmail, String notes, String customerId, String customerCode,
                   String customerName, LocalDate nextActionDate, String nextActionNote, LocalDate lastInteraction,
                   int openOpportunities, boolean imported, String version, Instant createdAt, String createdBy,
                   Instant updatedAt, String updatedBy) {
        static LeadDto of(LeadRepository.Summary s) {
            Lead l = s.lead();
            return new LeadDto(l.id().toString(), l.code(), l.companyName(), l.tradeName(), l.city(), l.state(), l.hasRenda().name(),
                    l.rating(), l.stage().name(), l.discardReason(), l.owner(), l.source().name(), l.contactName(),
                    l.contactPhone(), l.contactEmail(), l.notes(), l.partnerId() == null ? null : l.partnerId().toString(),
                    s.customerCode(), s.customerName(), l.nextAction().date(), l.nextAction().note(), l.lastInteraction(),
                    s.openOpportunities(), l.importId() != null, Long.toString(l.version()), l.createdAt(), l.createdBy(),
                    l.updatedAt(), l.updatedBy());
        }
    }

    record InteractionDto(String id, String leadId, String opportunityId, String kind, LocalDate occurredOn, String contactName,
                          String summary, LocalDate nextActionDate, String nextActionNote, Instant createdAt, String createdBy) {
        static InteractionDto of(Interaction i) {
            return new InteractionDto(i.id().toString(), i.leadId() == null ? null : i.leadId().toString(),
                    i.opportunityId() == null ? null : i.opportunityId().toString(), i.kind().name(), i.occurredOn(),
                    i.contactName(), i.summary(), i.nextAction().date(), i.nextAction().note(), i.createdAt(), i.createdBy());
        }
    }

    record InteractionRequest(String kind, String occurredOn, String contactName, String summary, String nextActionDate,
                              String nextActionNote) {
        Interaction.Data toData() {
            return new Interaction.Data(null, null, kind, occurredOn, contactName, summary, nextActionDate, nextActionNote);
        }
    }

    record StageDto(String code, String name, int position, String closePercent, String version, Instant updatedAt,
                    String updatedBy) {
        static StageDto of(OpportunityRepository.Stage s) {
            return new StageDto(s.code(), s.name(), s.position(), s.closePercent().toPlainString(), Long.toString(s.version()),
                    s.updatedAt(), s.updatedBy());
        }
    }

    record CompetitorDto(String name, String threat, String notes) { }

    record OpportunityDto(String id, String code, String name, String leadId, String leadCode, String leadName,
                          String customerId, String customerCode, String customerName, String unitId, String unitName,
                          String owner, String source, String interest, String potentialCents, String weightedCents,
                          String closePercent, LocalDate expectedClose, String stage, String stageName, String status,
                          String lossReason, String lossNote, Instant closedAt, String wonOrderCode, LocalDate nextActionDate,
                          String nextActionNote, LocalDate lastInteraction, String notes, List<CompetitorDto> competitors,
                          String version, Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        static OpportunityDto of(OpportunityRepository.Summary s, List<OpportunityRepository.Stage> stages) {
            Opportunity o = s.opportunity();
            OpportunityRepository.Stage st = stages.stream().filter(x -> x.code().equals(o.stage())).findFirst().orElse(null);
            BigDecimal pct = switch (o.status()) {
                case GANHA -> BigDecimal.valueOf(100);
                case PERDIDA -> BigDecimal.ZERO;
                case ABERTA -> st == null ? BigDecimal.ZERO : st.closePercent();
            };
            return new OpportunityDto(o.id().toString(), o.code(), o.name(), str(o.leadId()), s.leadCode(), s.leadName(),
                    str(o.customerId()), s.customerCode(), s.customerName(), str(o.unitId()), o.unitName(), o.owner(),
                    o.source().name(), o.interest().name(), Long.toString(o.potentialCents()),
                    Long.toString(Crm.weighted(o.potentialCents(), pct)), pct.setScale(2).toPlainString(), o.expectedClose(),
                    o.stage(), st == null ? o.stage() : st.name(), o.status().name(),
                    o.lossReason() == null ? null : o.lossReason().name(), o.lossNote(), o.closedAt(), o.wonOrderCode(),
                    o.nextAction().date(), o.nextAction().note(), o.lastInteraction(), o.notes(),
                    o.competitors().stream().map(c -> new CompetitorDto(c.name(), c.threat().name(), c.notes())).toList(),
                    Long.toString(o.version()), o.createdAt(), o.createdBy(), o.updatedAt(), o.updatedBy());
        }
    }

    record StageChangeDto(String id, String fromStage, String toStage, String toStageName, String status, String closePercent,
                          String potentialCents, String weightedCents, Instant changedAt, String changedBy, String fromStageName,
                          String note) {
        static StageChangeDto of(OpportunityRepository.StageChange c, List<OpportunityRepository.Stage> stages) {
            String name = stages.stream().filter(s -> s.code().equals(c.toStage())).map(OpportunityRepository.Stage::name)
                    .findFirst().orElse(c.toStage());
            return new StageChangeDto(c.id().toString(), c.fromStage(), c.toStage(), name, c.status().name(),
                    c.closePercent().setScale(2).toPlainString(), Long.toString(c.potentialCents()),
                    Long.toString(c.weightedCents()), c.changedAt(), c.changedBy(),
                    c.fromStage() == null ? null : stages.stream().filter(s -> s.code().equals(c.fromStage())).map(OpportunityRepository.Stage::name)
                            .findFirst().orElse(c.fromStage()), c.note());
        }
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
