package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.comercial.domain.Crm;
import br.com.fourtech.rendamais.comercial.domain.Lead;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Carga da lista de prospecção (Sprint 11, como a "Lista de Fecularias"): primeiro a prévia com os problemas, depois a
 * confirmação. O mesmo arquivo (hash) não carrega duas vezes. Nomes repetidos ou parecidos viram aviso e são carregados
 * separados — podem ser duas unidades legítimas; nada é unido sozinho. Linha com erro (empresa vazia, estrela fora de 1 a
 * 5, UF ou "possui Renda+" inválidos) não é carregada.
 */
@Service
public class LeadImportService {

    private static final int MAX_CONTENT = 2 * 1024 * 1024;

    public record ImportRequest(String fileName, String content) { }

    /** Problema de uma linha do arquivo: ERRO (a linha não entra) ou AVISO (entra como está). */
    public record Problem(String severity, int line, String message) { }

    public record Line(int line, String companyName, String tradeName, String city, String state, String hasRenda, Integer rating,
                       String contactName, String contactPhone, String contactEmail, String notes, boolean blocked) { }

    public record Preview(LeadImportRepository.LeadImport leadImport, String source, int lineCount, int toLoad, int blocked,
                          int warnings, List<Line> lines, List<Problem> problems, List<String> createdCodes) { }

    private final LeadImportRepository repository;
    private final LeadRepository leads;
    private final LeadService leadService;
    private final AuditTrail audit;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final JsonMapper json;
    private final java.time.Clock clock;

    public LeadImportService(LeadImportRepository repository, LeadRepository leads, LeadService leadService, AuditTrail audit,
                             Outbox outbox, CommandReceipts receipts, JsonMapper json, java.time.Clock clock) {
        this.repository = repository;
        this.leads = leads;
        this.leadService = leadService;
        this.audit = audit;
        this.outbox = outbox;
        this.receipts = receipts;
        this.json = json;
        this.clock = clock;
    }

    /** Envia o arquivo e devolve a prévia; nada é cadastrado. O mesmo arquivo devolve a mesma carga. */
    @Transactional
    public Preview upload(ImportRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_CREATE);
        String content = r == null || r.content() == null ? "" : r.content();
        if (content.isBlank()) throw invalid("content", "Escolha o arquivo da lista.");
        if (content.length() > MAX_CONTENT) throw invalid("content", "Arquivo grande demais (máximo de 2 MB).");
        String fileName = r.fileName() == null || r.fileName().isBlank() ? "prospeccao.json" : r.fileName().strip();
        if (fileName.length() > 200) fileName = fileName.substring(fileName.length() - 200);
        parse(content);
        String hash = sha256(content);
        if (repository.findByHash(hash).isEmpty()) {
            repository.insert(new LeadImportRepository.LeadImport(UUID.randomUUID(), fileName, hash, content, "PREVIA",
                    clock.instant(), user.username(), null, null));
        }
        LeadImportRepository.LeadImport i = repository.findByHash(hash).orElseThrow();
        return preview(i);
    }

    @Transactional(readOnly = true)
    public Preview get(UUID id) {
        CurrentUserHolder.require(Permissions.LEAD_READ);
        return preview(repository.find(id).orElseThrow(LeadImportService::notFound));
    }

    /** Cadastra as linhas sem erro; confirmar de novo devolve a mesma carga. */
    @Transactional
    public Preview confirm(String idempotencyKey, UUID id) {
        CurrentUser user = CurrentUserHolder.require(Permissions.LEAD_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        receipts.claim(user.username(), key, "ImportLeads", id.toString());
        LeadImportRepository.LeadImport imp = repository.findForUpdate(id).orElseThrow(LeadImportService::notFound);
        if ("CONFIRMADA".equals(imp.status())) {
            receipts.complete(user.username(), key, imp.id().toString());
            return preview(imp);
        }
        Preview p = preview(imp);
        int created = 0;
        for (Line l : p.lines()) {
            if (l.blocked()) continue;
            leadService.insert(user, new Lead.Data(l.companyName(), l.tradeName(), l.city(), l.state(), l.hasRenda(), l.rating(),
                    "IDENTIFICADO", null, Crm.Source.LISTA.name(), l.contactName(), l.contactPhone(), l.contactEmail(),
                    notes(p.source(), imp.fileName(), l), null, null), imp.id());
            created++;
        }
        repository.confirm(imp.id(), clock.instant(), user.username());
        audit.record(new AuditEntry(user.username(), "LEADS_IMPORTED", "lead_import", imp.id().toString(), 1, null,
                Map.of("file", new AuditEntry.Change(null, imp.fileName()),
                        "leads", new AuditEntry.Change(null, Integer.toString(created))), CorrelationId.current()));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("importId", imp.id().toString());
        payload.put("leads", created);
        payload.put("blocked", p.blocked());
        outbox.append("LeadsImported", "lead_import", imp.id().toString(), payload, user.username());
        receipts.complete(user.username(), key, imp.id().toString());
        return preview(repository.find(imp.id()).orElseThrow());
    }

    private static String notes(String source, String fileName, Line l) {
        String origin = "Carga de " + (source == null ? fileName : source) + ", linha " + l.line();
        return l.notes() == null ? origin : (l.notes() + "\n" + origin);
    }

    // ───────────── Prévia ─────────────

    private Preview preview(LeadImportRepository.LeadImport imp) {
        Parsed parsed = parse(imp.content());
        boolean confirmed = "CONFIRMADA".equals(imp.status());
        List<Problem> problems = new ArrayList<>(parsed.problems);
        if (!confirmed) {
            Map<String, LeadRepository.NameRef> existing = new HashMap<>();
            for (LeadRepository.NameRef n : leads.names()) existing.putIfAbsent(Crm.comparableName(n.companyName()), n);
            for (Line l : parsed.lines) {
                if (l.blocked()) continue;
                LeadRepository.NameRef e = existing.get(Crm.comparableName(l.companyName()));
                if (e != null) {
                    problems.add(new Problem("AVISO", l.line(), "\"" + l.companyName() + "\" parece a prospecção já cadastrada "
                            + e.code() + " — " + e.companyName() + (e.city() == null ? "" : " (" + e.city() + ")")
                            + ". Será carregada separada; confira se é a mesma empresa."));
                }
            }
        }
        problems.sort((a, b) -> a.line() != b.line() ? Integer.compare(a.line(), b.line()) : a.severity().compareTo(b.severity()));
        int blocked = (int) parsed.lines.stream().filter(Line::blocked).count();
        int warnings = (int) problems.stream().filter(p -> p.severity().equals("AVISO")).count();
        return new Preview(imp, parsed.source, parsed.lines.size(), parsed.lines.size() - blocked, blocked, warnings, parsed.lines,
                problems, confirmed ? repository.createdCodes(imp.id()) : List.of());
    }

    private record Parsed(String source, List<Line> lines, List<Problem> problems) { }

    private Parsed parse(String content) {
        JsonNode root;
        try {
            root = json.readTree(content);
        } catch (RuntimeException e) {
            throw invalid("content", "O arquivo não é um JSON válido.");
        }
        if (root == null || !root.isObject() || !root.path("prospeccoes").isArray()) {
            throw invalid("content", "O arquivo não traz a lista \"prospeccoes\".");
        }
        String source = str(root.get("origem"));
        List<Line> lines = new ArrayList<>();
        List<Problem> problems = new ArrayList<>();
        Map<String, List<Line>> byName = new LinkedHashMap<>();
        int n = 0;
        for (JsonNode p : root.path("prospeccoes")) {
            n++;
            List<String> errors = new ArrayList<>();
            String company = str(p.get("empresa"));
            if (company == null) errors.add("Empresa vazia.");
            else if (company.length() > 200) errors.add("Empresa com mais de 200 caracteres.");
            String uf = str(p.get("uf"));
            if (uf != null) {
                uf = uf.toUpperCase(Locale.ROOT);
                if (!List.of("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE",
                        "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO").contains(uf)) {
                    errors.add("UF \"" + uf + "\" inválida.");
                }
            }
            String renda = renda(str(p.get("possuiRendaMais")));
            if (renda == null) errors.add("\"Possui Renda+\" deve ser SIM, NÃO ou vazio; veio \"" + str(p.get("possuiRendaMais")) + "\".");
            Integer rating = null;
            JsonNode stars = p.get("estrelas");
            String rawStars = str(stars);
            if (rawStars != null) {
                try {
                    rating = Integer.parseInt(rawStars);
                    if (rating < 1 || rating > 5) {
                        errors.add("Estrelas " + rating + " fora de 1 a 5 (vazio fica como desconhecido, nunca zero).");
                        rating = null;
                    }
                } catch (NumberFormatException e) {
                    errors.add("Estrelas \"" + rawStars + "\" não é um número de 1 a 5.");
                }
            }
            String notes = str(p.get("observacao"));
            if (notes != null && notes.length() > 1800) errors.add("Observação com mais de 1.800 caracteres.");
            if (errors.isEmpty()) {
                // As mesmas regras do cadastro na tela (tamanhos, e-mail): o que o cadastro recusaria não entra.
                try {
                    Lead.register("PS00000", new Lead.Data(company, str(p.get("nomeComercial")), str(p.get("cidade")), uf, renda,
                            rating, null, "carga", null, str(p.get("contato")), str(p.get("telefone")), str(p.get("email")), notes,
                            null, null), "carga", null, null, clock.instant(), "carga");
                } catch (RuleViolationException e) {
                    e.details().forEach(d -> errors.add(label(d.field()) + ": " + d.message()));
                }
            }
            Line l = new Line(n, company, str(p.get("nomeComercial")), str(p.get("cidade")), uf, renda, rating, str(p.get("contato")),
                    str(p.get("telefone")), str(p.get("email")), notes, !errors.isEmpty());
            lines.add(l);
            for (String e : errors) problems.add(new Problem("ERRO", n, e + " A linha não será carregada."));
            if (company != null) byName.computeIfAbsent(Crm.comparableName(company), k -> new ArrayList<>()).add(l);
        }
        byName.values().forEach(same -> {
            if (same.size() < 2) return;
            for (int i = 1; i < same.size(); i++) {
                Line l = same.get(i);
                Line first = same.get(0);
                boolean sameCity = norm(l.city()).equals(norm(first.city()));
                problems.add(new Problem("AVISO", l.line(), sameCity
                        ? "Mesmo nome e cidade da linha " + first.line() + " (\"" + first.companyName() + "\"). Pode ser outra unidade "
                        + "ou repetição; as duas serão carregadas."
                        : "Mesmo nome da linha " + first.line() + " em outra cidade (" + (first.city() == null ? "sem cidade" : first.city())
                        + " × " + (l.city() == null ? "sem cidade" : l.city()) + "). As duas serão carregadas."));
            }
        });
        if (lines.isEmpty()) throw invalid("prospeccoes", "A lista está vazia.");
        return new Parsed(source, lines, problems);
    }

    private static String label(String field) {
        return switch (field) {
            case "tradeName" -> "Nome comercial";
            case "city" -> "Cidade";
            case "contactName" -> "Contato";
            case "contactPhone" -> "Telefone";
            case "contactEmail" -> "E-mail";
            default -> field;
        };
    }

    private static String renda(String raw) {
        if (raw == null) return "DESCONHECIDO";
        String t = norm(raw);
        return switch (t) {
            case "SIM", "S" -> "SIM";
            case "NAO", "N" -> "NAO";
            case "DESCONHECIDO", "?" -> "DESCONHECIDO";
            default -> null;
        };
    }

    private static String norm(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT).strip();
    }

    private static String str(JsonNode n) {
        if (n == null || n.isNull()) return null;
        String t = n.isTextual() ? n.asString() : n.toString();
        t = t.strip();
        return t.isEmpty() ? null : t;
    }

    private static String sha256(String content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static RuleViolationException invalid(String field, String message) {
        return new RuleViolationException("LEAD_IMPORT_INVALID", message, List.of(new FieldIssue(field, message)));
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Carga da lista não encontrada.");
    }
}
