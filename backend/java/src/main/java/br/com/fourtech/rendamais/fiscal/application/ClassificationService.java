package br.com.fourtech.rendamais.fiscal.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.ItemFiscalCodesApi;
import br.com.fourtech.rendamais.documentos.api.AnnexResolver;
import br.com.fourtech.rendamais.documentos.api.DocumentAnnexApi;
import br.com.fourtech.rendamais.fiscal.domain.Annex;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Classificação fiscal dos itens (Sprint 12, mock "Classificação fiscal de itens"): o perfil fiscal do item (CFOP,
 * CSOSN, origem, anexo, NBS, retenção de ISS) e a situação calculada — Sem classificação (falta campo obrigatório),
 * Revisar (marcado ou NBS ausente no serviço) ou Classificado. O anexo da classificação é o que vai para a linha da nota
 * ({@link AnnexResolver}); item sem classificação usa o padrão (equipamento e material no II, serviço no III).
 */
@Service
public class ClassificationService implements AnnexResolver {

    static final String ENTITY = "item_fiscal_profile";
    public static final Set<String> CSOSN = Set.of("101", "102", "103", "201", "202", "203", "300", "400", "500", "900");
    public static final Set<String> ISS = Set.of("SIM", "NAO", "CONFORME_MUNICIPIO");

    private final ClassificationRepository repository;
    private final ItemFiscalCodesApi items;
    private final TaxSetupRepository setup;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final Clock clock;
    private final DocumentAnnexApi documents;
    private final TaxRepository periods;

    public ClassificationService(ClassificationRepository repository, ItemFiscalCodesApi items, TaxSetupRepository setup, AuditTrail audit,
                                 AuditQuery auditQuery, Outbox outbox, Clock clock, DocumentAnnexApi documents, TaxRepository periods) {
        this.documents = documents;
        this.periods = periods;
        this.repository = repository;
        this.items = items;
        this.setup = setup;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.clock = clock;
    }

    public record UpdateRequest(String ncm, String serviceCode, String cfopInternal, String cfopInterstate, String csosn, String origin,
                                String annex, String activityId, String nbs, String issRetention, Boolean review, String reviewNote) { }

    /** Item com o perfil fiscal (nulo se nunca classificado), a situação e o que falta ou deve ser revisto. */
    public record ItemView(ItemFiscalCodesApi.FiscalItem item, ClassificationRepository.Profile profile, String activityName,
                           String status, List<String> reasons) {
        public long version() {
            return profile == null ? 0 : profile.version();
        }

        /** Produto (vendido) ou Material (insumo, não tributa na saída); serviço é Serviço. */
        public String type() {
            if ("SERVICO".equals(item.nature())) return "SERVICO";
            return profile != null && "INSUMO".equals(profile.annex()) ? "MATERIAL" : "PRODUTO";
        }
    }

    @Transactional(readOnly = true)
    public List<ItemView> list() {
        CurrentUserHolder.require(Permissions.TAX_READ);
        Map<UUID, ClassificationRepository.Profile> profiles = repository.all();
        Map<UUID, String> activities = setup.activities().stream().collect(Collectors.toMap(TaxSetupRepository.Activity::id,
                TaxSetupRepository.Activity::name));
        return items.fiscalItems().stream().filter(ItemFiscalCodesApi.FiscalItem::active)
                .map(i -> view(i, profiles.get(i.id()), activities)).toList();
    }

    @Transactional(readOnly = true)
    public ItemView get(UUID itemId) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        ItemFiscalCodesApi.FiscalItem i = items.fiscalItem(itemId).orElseThrow(() -> new NotFoundException("Item não encontrado."));
        Map<UUID, String> activities = setup.activities().stream().collect(Collectors.toMap(TaxSetupRepository.Activity::id,
                TaxSetupRepository.Activity::name));
        return view(i, repository.find(itemId).orElse(null), activities);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID itemId) {
        CurrentUserHolder.require(Permissions.TAX_READ);
        return auditQuery.history(ENTITY, itemId.toString());
    }

    /** Quantos itens ativos estão em cada atividade. */
    @Transactional(readOnly = true)
    public Map<UUID, Long> itemsByActivity() {
        Map<UUID, Long> out = new HashMap<>();
        Set<UUID> active = items.fiscalItems().stream().filter(ItemFiscalCodesApi.FiscalItem::active).map(ItemFiscalCodesApi.FiscalItem::id)
                .collect(Collectors.toSet());
        repository.all().values().stream().filter(p -> p.activityId() != null && active.contains(p.itemId()))
                .forEach(p -> out.merge(p.activityId(), 1L, Long::sum));
        return out;
    }

    static ItemView view(ItemFiscalCodesApi.FiscalItem i, ClassificationRepository.Profile p, Map<UUID, String> activities) {
        List<String> missing = new ArrayList<>();
        List<String> review = new ArrayList<>();
        boolean service = "SERVICO".equals(i.nature());
        if (service) {
            if (i.serviceCode() == null) missing.add("Item da LC 116 ausente.");
            if (p == null || p.annex() == null) missing.add("Anexo ausente.");
            if (p == null || p.issRetention() == null) missing.add("Retenção de ISS ausente.");
            if (p == null || p.nbs() == null) review.add("NBS ausente: a NBS entra na NFS-e e será base do IBS e da CBS a partir de 2027.");
        } else {
            boolean input = p != null && "INSUMO".equals(p.annex());
            if (i.ncm() == null) missing.add("NCM ausente.");
            if (p == null || p.cfopInternal() == null || p.cfopInterstate() == null) missing.add("CFOP ausente.");
            if (p == null || p.origin() == null) missing.add("Origem ausente.");
            if (p == null || p.annex() == null) missing.add("Anexo ausente.");
            if (!input && (p == null || p.csosn() == null)) missing.add("CSOSN ausente.");
        }
        if (p != null && p.review()) review.addFirst(p.reviewNote() == null ? "Marcado para revisar." : p.reviewNote());
        String status = !missing.isEmpty() ? "SEM_CLASSIFICACAO" : !review.isEmpty() ? "REVISAR" : "CLASSIFICADO";
        List<String> reasons = new ArrayList<>(missing);
        reasons.addAll(review);
        return new ItemView(i, p, p == null || p.activityId() == null ? null : activities.get(p.activityId()), status, List.copyOf(reasons));
    }

    /** Grava o perfil fiscal (If-Match com a versão do perfil; 0 quando ainda não há) e o NCM ou o item da LC 116 no cadastro. */
    @Transactional
    public ItemView update(UUID itemId, long expectedVersion, UpdateRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.TAX_CLASSIFICATION_UPDATE);
        ItemFiscalCodesApi.FiscalItem item = items.fiscalItem(itemId).orElseThrow(() -> new NotFoundException("Item não encontrado."));
        boolean service = "SERVICO".equals(item.nature());
        List<FieldIssue> issues = new ArrayList<>();
        String cfopIn = cfop(r == null ? null : r.cfopInternal(), "cfopInternal", issues);
        String cfopOut = cfop(r == null ? null : r.cfopInterstate(), "cfopInterstate", issues);
        String csosn = blank(r == null ? null : r.csosn());
        if (csosn != null && !CSOSN.contains(csosn)) issues.add(new FieldIssue("csosn", "CSOSN inválido."));
        String origin = blank(r == null ? null : r.origin());
        if (origin != null) {
            origin = origin.substring(0, 1);
            if (!origin.matches("[0-8]")) issues.add(new FieldIssue("origin", "Origem de 0 a 8."));
        }
        String annex = blank(r == null ? null : r.annex());
        if (annex != null && !"INSUMO".equals(annex) && Annex.parse(annex) == null) issues.add(new FieldIssue("annex", "Use I a V ou INSUMO."));
        UUID activity = null;
        String rawActivity = blank(r == null ? null : r.activityId());
        if (rawActivity != null) {
            try {
                UUID id = UUID.fromString(rawActivity);
                TaxSetupRepository.Activity a = setup.activities().stream().filter(x -> x.id().equals(id)).findFirst().orElse(null);
                if (a == null || !"ATIVO".equals(a.status())) issues.add(new FieldIssue("activityId", "Atividade inexistente ou inativa."));
                else {
                    activity = id;
                    if (annex == null) annex = a.annex();
                    else if (!annex.equals(a.annex())) issues.add(new FieldIssue("annex", "A atividade escolhida é do " + Annex.parse(a.annex()).label() + "."));
                }
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("activityId", "Atividade inválida."));
            }
        }
        String nbs = blank(r == null ? null : r.nbs());
        if (nbs != null && !nbs.matches("\\d\\.\\d{4}\\.\\d{2}\\.\\d{2}")) issues.add(new FieldIssue("nbs", "NBS no formato 1.2345.67.89."));
        String iss = blank(r == null ? null : r.issRetention());
        if (iss != null && !ISS.contains(iss)) issues.add(new FieldIssue("issRetention", "Use SIM, NAO ou CONFORME_MUNICIPIO."));
        if (service) {
            if (cfopIn != null || cfopOut != null) issues.add(new FieldIssue("cfopInternal", "CFOP é só de produto."));
            if (csosn != null) issues.add(new FieldIssue("csosn", "CSOSN é só de produto."));
            if (origin != null) issues.add(new FieldIssue("origin", "Origem é só de produto."));
            if ("INSUMO".equals(annex)) issues.add(new FieldIssue("annex", "Serviço vendido fica num anexo de I a V."));
        } else {
            if (nbs != null) issues.add(new FieldIssue("nbs", "NBS é só de serviço."));
            if (iss != null) issues.add(new FieldIssue("issRetention", "Retenção de ISS é só de serviço."));
        }
        boolean review = r != null && Boolean.TRUE.equals(r.review());
        String note = FiscalService.notes(r == null ? null : r.reviewNote(), issues);
        if (note != null && issues.stream().anyMatch(x -> x.field().equals("notes"))) {
            issues.replaceAll(x -> x.field().equals("notes") ? new FieldIssue("reviewNote", x.message()) : x);
        }
        FiscalService.invalid(issues);
        ClassificationRepository.Profile current = repository.findForUpdate(itemId).orElse(null);
        long version = current == null ? 0 : current.version();
        if (version != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, version);
        // NCM e item da LC 116 ficam no cadastro do item, com as regras e a trilha dele.
        ItemFiscalCodesApi.FiscalItem codes = items.updateCodes(itemId, service ? null : r == null ? null : r.ncm(),
                service ? (r == null ? null : r.serviceCode()) : null);
        Instant at = clock.instant();
        ClassificationRepository.Profile p = new ClassificationRepository.Profile(itemId, cfopIn, cfopOut, csosn, origin, annex, activity,
                nbs, iss, review, review ? note : null, version + 1, current == null ? at : current.createdAt(),
                current == null ? user.username() : current.createdBy(), current == null ? null : at, current == null ? null : user.username());
        if (current == null) repository.insert(p);
        else repository.update(p, version);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        diff(changes, "cfopInternal", current == null ? null : current.cfopInternal(), cfopIn);
        diff(changes, "cfopInterstate", current == null ? null : current.cfopInterstate(), cfopOut);
        diff(changes, "csosn", current == null ? null : current.csosn(), csosn);
        diff(changes, "origin", current == null ? null : current.origin(), origin);
        diff(changes, "annex", current == null ? null : current.annex(), annex);
        diff(changes, "nbs", current == null ? null : current.nbs(), nbs);
        diff(changes, "issRetention", current == null ? null : current.issRetention(), iss);
        diff(changes, "review", current == null ? null : Boolean.toString(current.review()), Boolean.toString(review));
        if (!Objects.equals(item.ncm(), codes.ncm())) diff(changes, "ncm", item.ncm(), codes.ncm());
        if (!Objects.equals(item.serviceCode(), codes.serviceCode())) diff(changes, "serviceCode", item.serviceCode(), codes.serviceCode());
        // Notas já registradas com o anexo padrão deste item passam ao anexo da classificação (competências em apuração).
        int reclassified = Annex.parse(annex) == null ? 0 : documents.applyItemAnnex(itemId, annex, periods.closedCompetences());
        if (reclassified > 0) diff(changes, "documentLines", null, reclassified + (reclassified == 1 ? " linha de nota" : " linhas de nota") + " no Anexo " + annex);
        audit.record(new AuditEntry(user.username(), "ITEM_FISCAL_PROFILE_UPDATED", ENTITY, itemId.toString(), p.version(), note, changes,
                CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("itemId", itemId.toString());
        payload.put("annex", annex);
        payload.put("changedFields", List.copyOf(changes.keySet()));
        payload.put("reclassifiedLines", reclassified);
        outbox.append("ItemFiscalProfileUpdated", ENTITY, itemId.toString(), payload, user.username());
        return get(itemId);
    }

    /** Anexo da linha da nota: classificação do item; equipamento é fabricação própria (II); sem classificação, o padrão. */
    @Override
    public Resolved resolve(String orderLineKind, UUID itemId) {
        if ("EQUIPAMENTO".equals(orderLineKind)) return new Resolved(Annex.II.name(), "EQUIPAMENTO");
        if (itemId != null) {
            ClassificationRepository.Profile p = repository.find(itemId).orElse(null);
            if (p != null && Annex.parse(p.annex()) != null) return new Resolved(p.annex(), "CLASSIFICACAO");
        }
        return new Resolved("SERVICO".equals(orderLineKind) ? Annex.III.name() : Annex.II.name(), "PADRAO");
    }

    private static String cfop(String raw, String field, List<FieldIssue> issues) {
        String v = blank(raw);
        if (v == null) return null;
        v = v.replace(".", "");
        if (!v.matches("[1-7]\\d{3}")) {
            issues.add(new FieldIssue(field, "CFOP com 4 dígitos (ex.: 5.101)."));
            return null;
        }
        return v;
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }

    private static void diff(Map<String, AuditEntry.Change> changes, String field, String before, String after) {
        if (!Objects.equals(before, after)) changes.put(field, new AuditEntry.Change(before, after));
    }
}
