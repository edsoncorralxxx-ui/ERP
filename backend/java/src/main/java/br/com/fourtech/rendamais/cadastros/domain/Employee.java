package br.com.fourtech.rendamais.cadastros.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Colaborador (cadastro "Colaboradores" do mock): matrícula, nome, departamento, função, centro de custo e admissão. É
 * de onde saem o vendedor ou comprador responsável do parceiro e o responsável das oportunidades e atividades do CRM.
 */
public record Employee(UUID id, String code, String name, String department, String jobTitle, String costCenter,
                       LocalDate admissionDate, String email, String phone, Partner.Status status, long version, Instant createdAt,
                       String createdBy, Instant updatedAt, String updatedBy) {

    /** Dados informados (antes da validação); data no formato AAAA-MM-DD. */
    public record Data(String code, String name, String department, String jobTitle, String costCenter, String admissionDate,
                       String email, String phone) { }

    public static Employee register(Data d, Instant now, String actor) {
        Employee v = validate(d, UUID.randomUUID(), Partner.Status.ATIVO, 1, now, actor, now, actor);
        return v;
    }

    public Employee update(Data d, Instant now, String actor) {
        Employee v = validate(d, id, status, version + 1, createdAt, createdBy, now, actor);
        if (!v.code.equals(code)) {
            throw new RuleViolationException("EMPLOYEE_INVALID", "A matrícula não muda depois do cadastro.",
                    List.of(new FieldIssue("code", "A matrícula não muda.")));
        }
        return v;
    }

    public Employee withStatus(Partner.Status s, Instant now, String actor) {
        return new Employee(id, code, name, department, jobTitle, costCenter, admissionDate, email, phone, s, version + 1,
                createdAt, createdBy, now, actor);
    }

    public Map<String, String[]> diff(Employee other) {
        Map<String, String[]> d = new LinkedHashMap<>();
        Map<String, String> a = flat(), b = other.flat();
        a.forEach((k, v) -> {
            if (!Objects.equals(v, b.get(k))) d.put(k, new String[]{v, b.get(k)});
        });
        return d;
    }

    Map<String, String> flat() {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("code", code);
        m.put("name", name);
        m.put("department", department);
        m.put("jobTitle", jobTitle);
        m.put("costCenter", costCenter);
        m.put("admissionDate", admissionDate == null ? null : admissionDate.toString());
        m.put("email", email);
        m.put("phone", phone);
        m.put("status", status == null ? null : status.name());
        return m;
    }

    private static Employee validate(Data d, UUID id, Partner.Status status, long version, Instant createdAt, String createdBy,
                                     Instant updatedAt, String updatedBy) {
        List<FieldIssue> issues = new ArrayList<>();
        String code = text(d.code(), 20, "code", issues);
        if (code == null) issues.add(new FieldIssue("code", "Informe a matrícula."));
        else if (!code.matches("[A-Za-z0-9-]+")) issues.add(new FieldIssue("code", "Matrícula com letras, números e hífen."));
        String name = text(d.name(), 120, "name", issues);
        if (name == null) issues.add(new FieldIssue("name", "Informe o nome."));
        LocalDate admission = null;
        String raw = d.admissionDate() == null ? null : d.admissionDate().strip();
        if (raw != null && !raw.isEmpty()) {
            try {
                admission = LocalDate.parse(raw);
            } catch (DateTimeParseException e) {
                issues.add(new FieldIssue("admissionDate", "Data inválida."));
            }
        }
        String email = text(d.email(), 200, "email", issues);
        if (email != null && !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) issues.add(new FieldIssue("email", "E-mail inválido."));
        Employee e = new Employee(id, code == null ? "" : code, name == null ? "" : name, text(d.department(), 60, "department", issues),
                text(d.jobTitle(), 100, "jobTitle", issues), text(d.costCenter(), 60, "costCenter", issues), admission, email,
                text(d.phone(), 30, "phone", issues), status, version, createdAt, createdBy, updatedAt, updatedBy);
        if (!issues.isEmpty()) throw new RuleViolationException("EMPLOYEE_INVALID", "Corrija os campos indicados.", issues);
        return e;
    }

    private static String text(String s, int max, String field, List<FieldIssue> issues) {
        if (s == null) return null;
        String t = s.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) issues.add(new FieldIssue(field, "Máximo de " + max + " caracteres."));
        return t;
    }
}
