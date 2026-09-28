package br.com.fourtech.rendamais.financeiro.domain;

import br.com.fourtech.rendamais.kernel.Currency;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.Money;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Conta financeira (caixa ou banco) onde os recebimentos entram. Saldo = abertura + movimentos de caixa. Nesta fase
 * é um cadastro mínimo; extrato, conciliação e transferências entram com "Contas e conciliação".
 */
public record BankAccount(UUID id, String code, String name, String bank, Money opening, LocalDate openingOn, boolean active,
                          long version, Instant createdAt, String createdBy) {

    public BankAccount {
        Objects.requireNonNull(id);
        Objects.requireNonNull(code);
        Objects.requireNonNull(name);
        Objects.requireNonNull(opening);
        Objects.requireNonNull(openingOn);
    }

    /** Dados digitados, ainda sem conversão: os problemas voltam por campo. */
    public record Data(String name, String bank, String openingCents, String openingOn) { }

    public static BankAccount create(String code, Data d, Instant now, String actor) {
        List<FieldIssue> issues = new ArrayList<>();
        String name = d.name() == null ? "" : d.name().strip();
        if (name.isEmpty()) issues.add(new FieldIssue("name", "Obrigatório."));
        else if (name.length() > 120) issues.add(new FieldIssue("name", "Máximo de 120 caracteres."));
        String bank = d.bank() == null || d.bank().isBlank() ? null : d.bank().strip();
        if (bank != null && bank.length() > 120) issues.add(new FieldIssue("bank", "Máximo de 120 caracteres."));
        Money opening = Money.zero(Currency.BRL);
        if (d.openingCents() != null && !d.openingCents().isBlank()) {
            try {
                opening = Money.parseCents(d.openingCents().strip(), Currency.BRL);
            } catch (IllegalArgumentException e) {
                issues.add(new FieldIssue("openingCents", "Valor inválido."));
            }
        }
        LocalDate openingOn = null;
        try {
            openingOn = d.openingOn() == null || d.openingOn().isBlank() ? null : LocalDate.parse(d.openingOn().strip());
            if (openingOn == null) issues.add(new FieldIssue("openingOn", "Obrigatório."));
        } catch (RuntimeException e) {
            issues.add(new FieldIssue("openingOn", "Data inválida."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("BANK_ACCOUNT_INVALID", "Corrija os campos indicados.", issues);
        return new BankAccount(UUID.randomUUID(), code, name, bank, opening, openingOn, true, 1, now, actor);
    }
}
