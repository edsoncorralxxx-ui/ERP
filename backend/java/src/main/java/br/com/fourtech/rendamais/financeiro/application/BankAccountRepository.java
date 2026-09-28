package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.BankAccount;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das contas financeiras. */
public interface BankAccountRepository {

    /** Conta com o saldo atual: abertura + movimentos de caixa. */
    record WithBalance(BankAccount account, long balanceCents) { }

    /** Próximo código de conta: CT002 (a CT001 é o caixa criado com o banco). */
    String nextCode();

    void insert(BankAccount account);

    boolean nameExists(String name);

    Optional<BankAccount> findById(UUID id);

    Optional<WithBalance> findWithBalance(UUID id);

    List<WithBalance> list(boolean includeInactive);
}
