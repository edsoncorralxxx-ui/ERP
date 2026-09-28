package br.com.fourtech.rendamais.financeiro.application;

import br.com.fourtech.rendamais.financeiro.domain.BankAccount;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das contas financeiras e dos movimentos de caixa. */
public interface BankAccountRepository {

    /** Conta com o saldo atual (saldo inicial + movimentos) e a quantidade de movimentos. */
    record Summary(BankAccount account, long balanceCents, long movements) { }

    /** Movimento de caixa com o saldo acumulado da conta até ele. */
    record Movement(UUID id, LocalDate effectiveDate, long amountCents, String kind, UUID settlementId, String settlementCode,
                    String description, long runningCents, Instant createdAt, String createdBy) { }

    String nextCode();

    void insert(BankAccount account);

    void update(BankAccount account, long expectedVersion);

    Optional<Summary> find(UUID id);

    /** Bloqueia a conta contra alteração (FOR SHARE), para a baixa conferir a situação na mesma transação. */
    Optional<BankAccount> findForShare(UUID id);

    /** Movimento de entrada gerado pela liquidação, que o estorno inverte. */
    Optional<UUID> settlementMovement(UUID settlementId);

    Optional<BankAccount> findByName(String name);

    List<Summary> list(boolean includeInactive);

    List<Movement> movements(UUID accountId, LocalDate from, LocalDate to);

    void insertMovement(UUID id, UUID accountId, LocalDate effectiveDate, long amountCents, String kind, UUID settlementId,
                        UUID reversesId, String description, Instant now, String actor);
}
