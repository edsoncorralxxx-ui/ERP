package br.com.fourtech.rendamais.cadastros.domain;

import br.com.fourtech.rendamais.kernel.Cnpj;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Parceiro de negócios com unidades e contatos (formulários "clientes" e "fornecedores", B01). Cliente e fornecedor são
 * papéis do mesmo parceiro, cada um com a sua situação: inativar um papel não mexe no outro. Imutável: cada operação
 * valida e devolve uma nova versão. CNPJ é opcional e nunca inventado; a unicidade é conferida pelo caso de uso.
 */
public final class Partner {

    public enum Status { ATIVO, INATIVO }

    public enum Role {
        CLIENTE("cliente"), FORNECEDOR("fornecedor"), TRANSPORTADORA("transportadora");

        private final String label;

        Role(String label) {
            this.label = label;
        }

        /** Nome do papel em minúsculas, para as mensagens ("cliente", "fornecedor"). */
        public String label() {
            return label;
        }
    }

    /** Categoria de item já conferida pelo caso de uso (existe e está ativa). */
    public record Category(UUID id, String name) { }

    /** Dados do papel de fornecedor: prazo de referência em dias, condições de pagamento e categorias fornecidas. */
    public record SupplierTerms(Integer leadTimeDays, String paymentTerms, List<Category> categories) {
        public static final SupplierTerms EMPTY = new SupplierTerms(null, null, List.of());

        public SupplierTerms {
            categories = List.copyOf(categories);
        }
    }

    /** Tipo do endereço (aba Endereços do mock). */
    public enum UnitKind {
        COBRANCA("Cobrança"), ENTREGA("Entrega"), UNIDADE("Unidade"), FATURAMENTO("Faturamento");

        private final String label;

        UnitKind(String label) {
            this.label = label;
        }

        public String label() {
            return label;
        }
    }

    /**
     * Unidade (endereço) do parceiro; o CNPJ da unidade (filial ou outro estabelecimento) é opcional e nunca inventado.
     * {@code isDefault}: o endereço padrão do tipo.
     */
    public record Unit(UUID id, String name, String street, String number, String district, String city, String state,
                       String postalCode, Cnpj cnpj, UnitKind kind, boolean isDefault) {
        public Unit(UUID id, String name, String street, String number, String district, String city, String state,
                    String postalCode, Cnpj cnpj) {
            this(id, name, street, number, district, city, state, postalCode, cnpj, UnitKind.UNIDADE, false);
        }

        /** Texto legível com todos os campos preenchidos, usado no histórico. */
        String summary() {
            List<String> parts = new ArrayList<>();
            if (cnpj != null) parts.add("CNPJ " + cnpj.formatted());
            if (street != null) parts.add(street + (number == null ? "" : ", " + number));
            if (district != null) parts.add(district);
            if (city != null || state != null) parts.add((city == null ? "" : city) + (state == null ? "" : "/" + state));
            if (postalCode != null) parts.add("CEP " + postalCode.substring(0, 5) + "-" + postalCode.substring(5));
            if (kind != UnitKind.UNIDADE) parts.addFirst(kind.label());
            if (isDefault) parts.add("padrão");
            return parts.isEmpty() ? name : name + " — " + String.join(", ", parts);
        }
    }

    /** Contato; {@code primary} é o contato principal (um por parceiro) e {@code receivesInvoices} recebe NF-e e boletos. */
    public record Contact(UUID id, String name, String role, String phone, String email, boolean primary, boolean receivesInvoices) {
        public Contact(UUID id, String name, String role, String phone, String email) {
            this(id, name, role, phone, email, false, false);
        }

        String summary() {
            List<String> parts = new ArrayList<>();
            if (role != null) parts.add(role);
            if (phone != null) parts.add(phone);
            if (email != null) parts.add(email);
            if (primary) parts.add("principal");
            if (receivesInvoices) parts.add("recebe NF-e e boletos");
            return parts.isEmpty() ? name : name + " — " + String.join(", ", parts);
        }
    }

    /**
     * Campos da ficha do mock sem regra própria (cabeçalho, abas Geral, Pagamento e Fiscal), guardados em
     * {@code partner.profile}. Valores de lista vêm das tabelas auxiliares (condição e forma de pagamento, tabela de
     * preços: códigos) ou de listas fixas (regime, ICMS, modal).
     */
    public static final Ficha PROFILE = new Ficha(
            Ficha.Campo.texto("stateRegistration", 20),
            Ficha.Campo.texto("supplierCategory", 100),
            Ficha.Campo.opcao("modal", "Rodoviário", "Aéreo", "Ferroviário", "Aquaviário", "Multimodal"),
            Ficha.Campo.texto("phone1", 30),
            Ficha.Campo.texto("phone2", 30),
            Ficha.Campo.texto("mobile", 30),
            Ficha.Campo.email("email"),
            Ficha.Campo.texto("site", 200),
            Ficha.Campo.texto("industry", 60),
            Ficha.Campo.inteiro("dailyCapacityTons", 0, 100000),
            Ficha.Campo.texto("responsible", 120),
            Ficha.Campo.texto("defaultCarrier", 200),
            Ficha.Campo.texto("territory", 100),
            Ficha.Campo.texto("origin", 60),
            Ficha.Campo.texto("notes", 2000),
            Ficha.Campo.booleano("blocked"),
            Ficha.Campo.data("blockedFrom"),
            Ficha.Campo.data("blockedTo"),
            Ficha.Campo.texto("blockedReason", 300),
            Ficha.Campo.texto("paymentCondition", 20),
            Ficha.Campo.texto("paymentMethod", 20),
            Ficha.Campo.texto("priceList", 20),
            Ficha.Campo.decimal("defaultDiscountPercent", 2, "0", "100"),
            Ficha.Campo.decimal("lateInterestPercent", 2, "0", "100"),
            Ficha.Campo.centavos("creditLimitCents"),
            Ficha.Campo.texto("pixKey", 120),
            Ficha.Campo.texto("bankAgency", 60),
            Ficha.Campo.texto("bankAccount", 40),
            Ficha.Campo.opcao("taxRegime", "Simples Nacional", "Lucro presumido", "Lucro real", "MEI", "Isento"),
            Ficha.Campo.opcao("icmsTaxpayer", "Contribuinte", "Isento", "Não contribuinte"),
            Ficha.Campo.texto("municipalRegistration", 30),
            Ficha.Campo.formato("cnae", 10, "\\d{4}-\\d/\\d{2}", "CNAE no formato 0000-0/00."),
            Ficha.Campo.texto("cnaeDescription", 200),
            Ficha.Campo.email("nfeEmail"),
            Ficha.Campo.booleano("withholdIss"),
            Ficha.Campo.booleano("withholdIrrf"),
            Ficha.Campo.booleano("withholdPis"),
            Ficha.Campo.booleano("withholdCofins"),
            Ficha.Campo.booleano("withholdCsll"),
            Ficha.Campo.booleano("withholdInss"));

    static final int MAX_ITEMS = 50;
    private static final Set<String> UFS = Set.of("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
            "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO");

    private final UUID id;
    private final String code;
    private final String legalName;
    private final String tradeName;
    private final Cnpj cnpj;
    private final String group;
    private final Map<Role, Status> roles;
    private final SupplierTerms supplier;
    private final List<Unit> units;
    private final List<Contact> contacts;
    private final Map<String, Object> profile;
    private final long version;
    private final Instant createdAt;
    private final String createdBy;
    private final Instant updatedAt;
    private final String updatedBy;

    public Partner(UUID id, String code, String legalName, String tradeName, Cnpj cnpj, String group, Map<Role, Status> roles,
                   SupplierTerms supplier, List<Unit> units, List<Contact> contacts, long version, Instant createdAt,
                   String createdBy, Instant updatedAt, String updatedBy) {
        this(id, code, legalName, tradeName, cnpj, group, roles, supplier, units, contacts, Map.of(), version, createdAt, createdBy,
                updatedAt, updatedBy);
    }

    public Partner(UUID id, String code, String legalName, String tradeName, Cnpj cnpj, String group, Map<Role, Status> roles,
                   SupplierTerms supplier, List<Unit> units, List<Contact> contacts, Map<String, Object> profile, long version,
                   Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.code = Objects.requireNonNull(code);
        this.legalName = Objects.requireNonNull(legalName);
        this.tradeName = tradeName;
        this.cnpj = cnpj;
        this.group = group;
        EnumMap<Role, Status> r = new EnumMap<>(Role.class);
        r.putAll(roles);
        this.roles = Collections.unmodifiableMap(r);
        this.supplier = supplier == null ? SupplierTerms.EMPTY : supplier;
        this.units = List.copyOf(units);
        this.contacts = List.copyOf(contacts);
        this.profile = profile == null ? Map.of() : Collections.unmodifiableMap(new LinkedHashMap<>(profile));
        this.version = version;
        this.createdAt = createdAt;
        this.createdBy = createdBy;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /** Novo parceiro com um papel ativo, versão 1, com o código dado pelo sistema. */
    public static Partner register(String code, Role role, PartnerData data, Instant now, String actor) {
        Valid v = validate(data, SupplierTerms.EMPTY, List.of(), List.of(), Map.of());
        return new Partner(UUID.randomUUID(), code, v.legalName, v.tradeName, v.cnpj, v.group, Map.of(role, Status.ATIVO),
                v.supplier, v.units, v.contacts, v.profile, 1, now, actor, now, actor);
    }

    /**
     * Próxima versão com os dados informados. Unidades e contatos com id conhecido mantêm a identidade; a parte que não
     * veio nos dados (lista nula, dados de fornecedor nulos) continua como está.
     */
    public Partner update(PartnerData data, Instant now, String actor) {
        Valid v = validate(data, supplier, units, contacts, profile);
        return new Partner(id, code, v.legalName, v.tradeName, v.cnpj, v.group, roles, v.supplier, v.units, v.contacts, v.profile,
                version + 1, createdAt, createdBy, now, actor);
    }

    /** Inativa o papel preservando o histórico; o parceiro referenciado nunca é apagado e o outro papel segue igual. */
    public Partner deactivate(Role role, Instant now, String actor) {
        return withRole(role, Status.INATIVO, now, actor);
    }

    /** Dá ao parceiro existente um papel novo (ou reativa o papel inativo), sem duplicar o cadastro. */
    public Partner enable(Role role, Instant now, String actor) {
        return withRole(role, Status.ATIVO, now, actor);
    }

    private Partner withRole(Role role, Status status, Instant now, String actor) {
        EnumMap<Role, Status> r = new EnumMap<>(Role.class);
        r.putAll(roles);
        r.put(role, status);
        return new Partner(id, code, legalName, tradeName, cnpj, group, r, supplier, units, contacts, profile, version + 1,
                createdAt, createdBy, now, actor);
    }

    /** Situação do papel; nula quando o parceiro não tem esse papel. */
    public Status status(Role role) {
        return roles.get(role);
    }

    public boolean hasRole(Role role) {
        return roles.containsKey(role);
    }

    /** Situação do parceiro: ativo se ao menos um papel está ativo. */
    public Status status() {
        return roles.containsValue(Status.ATIVO) ? Status.ATIVO : Status.INATIVO;
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
        m.put("customerStatus", roles.containsKey(Role.CLIENTE) ? roles.get(Role.CLIENTE).name() : null);
        m.put("supplierStatus", roles.containsKey(Role.FORNECEDOR) ? roles.get(Role.FORNECEDOR).name() : null);
        m.put("carrierStatus", roles.containsKey(Role.TRANSPORTADORA) ? roles.get(Role.TRANSPORTADORA).name() : null);
        m.put("units", units.isEmpty() ? null : units.stream().map(Unit::summary).collect(Collectors.joining("; ")));
        m.put("contacts", contacts.isEmpty() ? null : contacts.stream().map(Contact::summary).collect(Collectors.joining("; ")));
        m.put("leadTimeDays", supplier.leadTimeDays() == null ? null : supplier.leadTimeDays().toString());
        m.put("paymentTerms", supplier.paymentTerms());
        m.put("suppliedCategories", supplier.categories().isEmpty() ? null
                : supplier.categories().stream().map(Category::name).collect(Collectors.joining("; ")));
        m.putAll(PROFILE.plano(profile));
        return m;
    }

    private record Valid(String legalName, String tradeName, Cnpj cnpj, String group, SupplierTerms supplier, List<Unit> units,
                         List<Contact> contacts, Map<String, Object> profile) { }

    private static Valid validate(PartnerData data, SupplierTerms knownSupplier, List<Unit> knownUnits, List<Contact> knownContacts,
                                  Map<String, Object> knownProfile) {
        List<FieldIssue> issues = new ArrayList<>();
        Map<String, Object> profile = data.profile() == null ? knownProfile : PROFILE.validar(data.profile(), "profile.", issues);
        if (Boolean.TRUE.equals(profile.get("blocked")) && profile.get("blockedReason") == null) {
            issues.add(new FieldIssue("profile.blockedReason", "Informe o motivo do bloqueio."));
        }
        if (profile.get("blockedFrom") != null && profile.get("blockedTo") != null
                && profile.get("blockedFrom").toString().compareTo(profile.get("blockedTo").toString()) > 0) {
            issues.add(new FieldIssue("profile.blockedTo", "O fim do bloqueio é antes do início."));
        }
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
        SupplierTerms supplier = knownSupplier;
        if (data.supplier() != null) {
            PartnerData.SupplierData s = data.supplier();
            Integer days = s.leadTimeDays();
            if (days != null && (days < 0 || days > 365)) {
                issues.add(new FieldIssue("leadTimeDays", "Prazo entre 0 e 365 dias."));
            }
            String terms = limit(text(s.paymentTerms()), 200, "paymentTerms", issues);
            List<Category> categories = s.categories() == null ? List.of() : List.copyOf(new LinkedHashSet<>(s.categories()));
            if (categories.size() > MAX_ITEMS) {
                issues.add(new FieldIssue("suppliedCategories", "Máximo de " + MAX_ITEMS + " categorias."));
            }
            supplier = new SupplierTerms(days, terms, categories);
        }
        // Lista ausente mantém a atual: a ficha do fornecedor não edita as unidades do cliente.
        List<PartnerData.UnitData> unitData = data.units() == null ? null : data.units();
        List<PartnerData.ContactData> contactData = data.contacts() == null ? null : data.contacts();
        if (unitData == null) {
            unitData = knownUnits.stream().map(u -> new PartnerData.UnitData(u.id().toString(), u.name(), u.street(), u.number(),
                    u.district(), u.city(), u.state(), u.postalCode(), u.cnpj() == null ? null : u.cnpj().value(), u.kind().name(),
                    u.isDefault())).toList();
        }
        if (contactData == null) {
            contactData = knownContacts.stream().map(c -> new PartnerData.ContactData(c.id().toString(), c.name(), c.role(),
                    c.phone(), c.email(), c.primary(), c.receivesInvoices())).toList();
        }
        if (unitData.size() > MAX_ITEMS) issues.add(new FieldIssue("units", "Máximo de " + MAX_ITEMS + " unidades."));
        if (contactData.size() > MAX_ITEMS) issues.add(new FieldIssue("contacts", "Máximo de " + MAX_ITEMS + " contatos."));

        Set<UUID> unitIds = knownUnits.stream().map(Unit::id).collect(Collectors.toSet());
        List<Unit> units = new ArrayList<>();
        Set<String> unitCnpjs = new HashSet<>();
        for (int i = 0; i < unitData.size(); i++) {
            PartnerData.UnitData u = unitData.get(i);
            String f = "units[" + i + "].";
            UnitKind kind = UnitKind.UNIDADE;
            if (u.kind() != null && !u.kind().isBlank()) {
                try {
                    kind = UnitKind.valueOf(u.kind().strip().toUpperCase(Locale.ROOT));
                } catch (IllegalArgumentException e) {
                    issues.add(new FieldIssue(f + "kind", "Tipo de endereço inválido."));
                }
            }
            String name = text(u.name());
            if (name == null && u.kind() == null) issues.add(new FieldIssue(f + "name", "Informe o nome da unidade."));
            if (name == null) name = kind.label() + (text(u.city()) == null ? "" : " — " + text(u.city()));
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
            Cnpj unitCnpj = null;
            String rawUnitCnpj = text(u.cnpj());
            if (rawUnitCnpj != null) {
                try {
                    unitCnpj = Cnpj.of(rawUnitCnpj);
                    if (!unitCnpjs.add(unitCnpj.value())) {
                        issues.add(new FieldIssue(f + "cnpj", "CNPJ repetido em outra unidade deste cliente."));
                    }
                } catch (IllegalArgumentException e) {
                    issues.add(new FieldIssue(f + "cnpj", e.getMessage() + "."));
                }
            }
            units.add(new Unit(keep(u.id(), unitIds), name, limit(text(u.street()), 200, f + "street", issues),
                    limit(text(u.number()), 20, f + "number", issues), limit(text(u.district()), 100, f + "district", issues),
                    limit(text(u.city()), 100, f + "city", issues), state, cep, unitCnpj, kind, Boolean.TRUE.equals(u.isDefault())));
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
                    limit(text(c.phone()), 30, f + "phone", issues), mail, Boolean.TRUE.equals(c.primary()),
                    Boolean.TRUE.equals(c.receivesInvoices())));
        }
        if (contacts.stream().filter(Contact::primary).count() > 1) {
            issues.add(new FieldIssue("contacts", "Marque só um contato principal."));
        }
        if (!issues.isEmpty()) {
            throw new RuleViolationException("PARTNER_INVALID", "Corrija os campos indicados.", issues);
        }
        return new Valid(legal, trade, cnpj, group, supplier, units, contacts, profile);
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
    public Map<Role, Status> roles() { return roles; }
    public SupplierTerms supplier() { return supplier; }
    public List<Unit> units() { return units; }
    public List<Contact> contacts() { return contacts; }
    public Map<String, Object> profile() { return profile; }
    public long version() { return version; }
    public Instant createdAt() { return createdAt; }
    public String createdBy() { return createdBy; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
