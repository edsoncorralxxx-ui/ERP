package br.com.fourtech.rendamais.plataforma.empresa.domain;

import br.com.fourtech.rendamais.kernel.Cnpj;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Dados cadastrais da empresa (um CNPJ na versão inicial). Imutável: {@link #update} valida e
 * devolve uma nova versão.
 */
public final class CompanyProfile {

    private static final Set<String> UFS = Set.of("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
            "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO");

    private final UUID id;
    private final String legalName;
    private final String tradeName;
    private final Cnpj cnpj;
    private final Address address;
    private final String phone;
    private final String email;
    private final boolean configured;
    private final long version;
    private final Instant updatedAt;
    private final String updatedBy;

    public CompanyProfile(UUID id, String legalName, String tradeName, Cnpj cnpj, Address address, String phone,
                          String email, boolean configured, long version, Instant updatedAt, String updatedBy) {
        this.id = Objects.requireNonNull(id);
        this.legalName = legalName;
        this.tradeName = tradeName;
        this.cnpj = cnpj;
        this.address = address == null ? Address.empty() : address;
        this.phone = phone;
        this.email = email;
        this.configured = configured;
        this.version = version;
        this.updatedAt = updatedAt;
        this.updatedBy = updatedBy;
    }

    /** Valida os dados e devolve a próxima versão. Reúne todos os problemas antes de rejeitar. */
    public CompanyProfile update(CompanyProfileData data, Instant now, String actor) {
        List<FieldIssue> issues = new ArrayList<>();
        String legal = text(data.legalName());
        if (legal == null) {
            issues.add(new FieldIssue("legalName", "Informe a razão social."));
        } else if (legal.length() > 200) {
            issues.add(new FieldIssue("legalName", "Máximo de 200 caracteres."));
        }
        String trade = limit(text(data.tradeName()), 200, "tradeName", issues);
        Cnpj parsedCnpj = null;
        String rawCnpj = text(data.cnpj());
        if (rawCnpj != null) {
            try {
                parsedCnpj = Cnpj.of(rawCnpj);
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("cnpj", e.getMessage() + "."));
            }
        }
        Address a = data.address() == null ? Address.empty() : data.address();
        String state = text(a.state());
        if (state != null) {
            state = state.toUpperCase();
            if (!UFS.contains(state)) {
                issues.add(new FieldIssue("address.state", "UF inválida."));
            }
        }
        String cep = text(a.postalCode());
        if (cep != null) {
            cep = cep.replaceAll("[.\\-\\s]", "");
            if (!cep.matches("\\d{8}")) {
                issues.add(new FieldIssue("address.postalCode", "CEP deve ter 8 dígitos."));
            }
        }
        Address normalized = new Address(limit(text(a.street()), 200, "address.street", issues),
                limit(text(a.number()), 20, "address.number", issues),
                limit(text(a.complement()), 100, "address.complement", issues),
                limit(text(a.district()), 100, "address.district", issues),
                limit(text(a.city()), 100, "address.city", issues), state, cep);
        String ph = limit(text(data.phone()), 30, "phone", issues);
        String mail = text(data.email());
        if (mail != null && (mail.length() > 200 || !mail.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+"))) {
            issues.add(new FieldIssue("email", "E-mail inválido."));
        }
        if (!issues.isEmpty()) {
            throw new RuleViolationException("COMPANY_PROFILE_INVALID", "Corrija os campos indicados.", issues);
        }
        return new CompanyProfile(id, legal, trade, parsedCnpj, normalized, ph, mail, true, version + 1, now, actor);
    }

    /** Diferenças campo a campo em relação a outra versão (para auditoria). */
    public Map<String, String[]> diff(CompanyProfile other) {
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
        m.put("cnpj", cnpj == null ? null : cnpj.value());
        m.put("address.street", address.street());
        m.put("address.number", address.number());
        m.put("address.complement", address.complement());
        m.put("address.district", address.district());
        m.put("address.city", address.city());
        m.put("address.state", address.state());
        m.put("address.postalCode", address.postalCode());
        m.put("phone", phone);
        m.put("email", email);
        return m;
    }

    private static String text(String s) {
        if (s == null) {
            return null;
        }
        String t = s.strip();
        return t.isEmpty() ? null : t;
    }

    private static String limit(String s, int max, String field, List<FieldIssue> issues) {
        if (s != null && s.length() > max) {
            issues.add(new FieldIssue(field, "Máximo de " + max + " caracteres."));
        }
        return s;
    }

    public UUID id() { return id; }
    public String legalName() { return legalName; }
    public String tradeName() { return tradeName; }
    public Cnpj cnpj() { return cnpj; }
    public Address address() { return address; }
    public String phone() { return phone; }
    public String email() { return email; }
    public boolean configured() { return configured; }
    public long version() { return version; }
    public Instant updatedAt() { return updatedAt; }
    public String updatedBy() { return updatedBy; }
}
