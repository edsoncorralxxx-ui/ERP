package br.com.fourtech.rendamais.cadastros.domain;

import br.com.fourtech.rendamais.kernel.Cnpj;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Parceiro no papel de cliente, com unidades e contatos (formulário "clientes", B01). Imutável: cada operação valida e
 * devolve uma nova versão. CNPJ é opcional e nunca inventado; a unicidade é conferida pelo caso de uso.
 */
public final class Partner {

    public enum Status { ATIVO, INATIVO }

    public record Unit(UUID id, String name, String street, String number, String district, String city, String state,
                       String postalCode) {
        /** Texto legível com todos os campos preenchidos, usado no histórico. */
        String summary() {
            List<String> parts = new ArrayList<>();
            if (street != null) parts.add(street + (number == null ? "" : ", " + number));
            if (district != null) parts.add(district);
            if (city != null || state != null) parts.add((city == null ? "" : city) + (state == null ? "" : "/" + state));
            if (postalCode != null) parts.add("CEP " + postalCode.substring(0, 5) + "-" + postalCode.substring(5));
            return parts.isEmpty() ? name : name + " — " + String.join(", ", parts);
        }
    }

    public record Contact(UUID id, String name, String role, String phone, String email) {
        String summary() {
            List<String> parts = new ArrayList<>();
            if (role != null) parts.add(role);
            if (phone != null) parts.add(phone);
            if (email != null) parts.add(email);
            return parts.isEmpty() ? name : name + " — " + String.join(", ", parts);
        }
    }

    static final int MAX_ITEMS = 50;
    private static final Set<String> UFS = Set.of("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
            "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO");

    private final UUID id;
    private final String code;
    private final String legalName;
    private final String tradeName;
    private final Cnpj cnpj;
    private final String group;
    private final Status status;
    private final List<Unit> units;
    private final List<Contact> contacts;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public Partner(UUID id, String code, String legalName, String tradeName, Cnpj cnpj, String group, Status status,
                   List<Unit> units, List<Contact> contacts, long version, Instant createdAt, String createdBy,
                   Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.legalName = Objects.requireNonNull(legalName);
        this.tradeName = tradeName;
        this.cnpj = cnpj;
        this.group = group;
        this.status = Objects.requireNonNull(status);
        this.units = List.copyOf(units);
        this.contacts = List.copyOf(contacts);
        this.version = version;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /** Novo cliente ativo, versão 1, com o código dado pelo sistema. */
    public static Partner register(String code, PartnerData data, Instant now, String actor) {
        Valid v = validate(data, List.of(), List.of());
        return new Partner(UUID.randomUUID(), code, v.legalName, v.tradeName, v.cnpj, v.group, Status.ATIVO, v.units,
                v.contacts, 1, now, actor, now, actor);
    }

    /** Próxima versão com os dados informados. Unidades e contatos com id conhecido mantêm a identidade. */
    public Partner update(PartnerData data, Instant now, String actor) {
        Valid v = validate(data, units, contacts);
        return new Partner(id, code, v.legalName, v.tradeName, v.cnpj, v.group, status, v.units, v.contacts, version + 1,
                createdAt, createdBy, now, actor);
    }

    /** Inativa preservando o histórico; o cliente referenciado nunca é apagado. */
    public Partner deactivate(Instant now, String actor) {
        return new Partner(id, code, legalName, tradeName, cnpj, group, Status.INATIVO, units, contacts, version + 1,
                createdAt, createdBy, now, actor);
    }

    /** Diferenças campo a campo, para a auditoria e o evento PartnerUpdated. */
    public Map<String, String[]> diff(Partner other) {
        Map<String, String[]> d = new LinkedHashMap<>();
        Map<String, String> a = flat();
        Map<String, String> b = other.flat();
        a.forEach((k, v) -> {
            if (!Objects.equals(v, b.get(k))) {
                d.put(k, new String[]{v, b.get(k)});
            }
        });
        return d;
    }

    private Map<String, String> flat() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("legalName", legalName);
        m.put("tradeName", tradeName);
        m.put("cnpj", cnpj == null ? null : cnpj.formatted());
        m.put("group", group);
        m.put("status", status.name());
        m.put("units", units.isEmpty() ? null : units.stream().map(Unit::summary).collect(Collectors.joining("; ")));
        m.put("contacts", contacts.isEmpty() ? null : contacts.stream().map(Contact::summary).collect(Collectors.joining("; ")));
        return m;
    }

    private record Valid(String legalName, String tradeName, Cnpj cnpj, String group, List<Unit> units, List<Contact> contacts) { }

    private static Valid validate(PartnerData data, List<Unit> knownUnits, List<Contact> knownContacts) {
        List<FieldIssue> issues = new ArrayList<>();
        String legal = text(data.legalName());
        if (legal == null) {
            issues.add(new FieldIssue("legalName", "Informe a razão social."));
        }
        limit(legal, 200, "legalName", issues);
        String trade = limit(text(data.tradeName()), 200, "tradeName", issues);
        String group = limit(text(data.group()), 100, "group", issues);
        Cnpj cnpj = null;
        String raw = text(data.cnpj());
        if (raw != null) {
            try {
                cnpj = Cnpj.of(raw);
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("cnpj", e.getMessage() + "."));
            }
        }
        List<PartnerData.UnitData> unitData = data.units() == null ? List.of() : data.units();
        List<PartnerData.ContactData> contactData = data.contacts() == null ? List.of() : data.contacts();
        if (unitData.size() > MAX_ITEMS) issues.add(new FieldIssue("units", "Máximo de " + MAX_ITEMS + " unidades."));
        if (contactData.size() > MAX_ITEMS) issues.add(new FieldIssue("contacts", "Máximo de " + MAX_ITEMS + " contatos."));

        Set<UUID> unitIds = knownUnits.stream().map(Unit::id).collect(Collectors.toSet());
        List<Unit> units = new ArrayList<>();
        for (int i = 0; i < unitData.size(); i++) {
            PartnerData.UnitData u = unitData.get(i);
            String f = "units[" + i + "].";
            String name = text(u.name());
            if (name == null) issues.add(new FieldIssue(f + "name", "Informe o nome da unidade."));
            limit(name, 120, f + "name", issues);
            String state = text(u.state());
            if (state != null) {
                state = state.toUpperCase(Locale.ROOT);
                if (!UFS.contains(state)) issues.add(new FieldIssue(f + "state", "UF inválida."));
            }
            String cep = text(u.postalCode());
            if (cep != null) {
                cep = cep.replaceAll("[.\\-\\s]", "");
                if (!cep.matches("\\d{8}")) issues.add(new FieldIssue(f + "postalCode", "CEP deve ter 8 dígitos."));
            }
            units.add(new Unit(keep(u.id(), unitIds), name, limit(text(u.street()), 200, f + "street", issues),
                    limit(text(u.number()), 20, f + "number", issues), limit(text(u.district()), 100, f + "district", issues),
                    limit(text(u.city()), 100, f + "city", issues), state, cep));
        }

        Set<UUID> contactIds = knownContacts.stream().map(Contact::id).collect(Collectors.toSet());
        List<Contact> contacts = new ArrayList<>();
        for (int i = 0; i < contactData.size(); i++) {
            PartnerData.ContactData c = contactData.get(i);
            String f = "contacts[" + i + "].";
            String name = text(c.name());
            if (name == null) issues.add(new FieldIssue(f + "name", "Informe o nome do contato."));
            limit(name, 120, f + "name", issues);
            String mail = text(c.email());
            if (mail != null && (mail.length() > 200 || !mail.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"))) {
                issues.add(new FieldIssue(f + "email", "E-mail inválido."));
            }
            contacts.add(new Contact(keep(c.id(), contactIds), name, limit(text(c.role()), 100, f + "role", issues),
                    limit(text(c.phone()), 30, f + "phone", issues), mail));
        }
        if (!issues.isEmpty()) {
            throw new RuleViolationException("PARTNER_INVALID", "Corrija os campos indicados.", issues);
        }
        return new Valid(legal, trade, cnpj, group, units, contacts);
    }

    /** Mantém o id só se ele pertence a este cliente; qualquer outro valor vira um item novo. */
    private static UUID keep(String raw, Set<UUID> known) {
        if (raw != null) {
            try {
                UUID id = UUID.fromString(raw);
                if (known.contains(id)) return id;
            } catch (IllegalArgumentException ignored) {
                // id desconhecido: item novo
            }
        }
        return UUID.randomUUID();
    }

    private static String text(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }

    private static String limit(String s, int max, String field, List<FieldIssue> issues) {
        if (s != null && s.length() > max) issues.add(new FieldIssue(field, "Máximo de " + max + " caracteres."));
        return s;
    }

    public UUID id() { return id; }
    public String code() { return code; }
    public String legalName() { return legalName; }
    public String tradeName() { return tradeName; }
    public Cnpj cnpj() { return cnpj; }
    public String group() { return group; }
    public Status status() { return status; }
    public List<Unit> units() { return units; }
    public List<Contact> contacts() { return contacts; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
