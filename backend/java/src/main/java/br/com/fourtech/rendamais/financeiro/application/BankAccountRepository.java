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

    /**
     * Movimento de caixa com o saldo acumulado da conta até ele. Vem de uma liquidação ({@code settlementId}) ou de uma
     * transferência ({@code transferId}); {@code sourceCode} é o código de quem o gerou (RC, PG ou TR).
     */
    record Movement(UUID id, LocalDate effectiveDate, long amountCents, String kind, UUID settlementId, UUID transferId, String sourceCode,
                    String description, long runningCents, Instant createdAt, String createdBy) { }

    /** Saldo realizado da conta numa data (IND-009): saldo inicial, se já vigente, + movimentos até a data. */
    record BalanceAt(BankAccount account, long balanceCents) { }

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

    /** Movimento de uma transferência (TRANSFER ou TRANSFER_REVERSAL). */
    void insertTransferMovement(UUID id, UUID accountId, LocalDate effectiveDate, long amountCents, String kind, UUID transferId,
                                UUID reversesId, String description, Instant now, String actor);

    /** Contas bloqueadas contra alteração (FOR SHARE), em ordem crescente de id. */
    List<BankAccount> findForShare(List<UUID> ids);

    /** Saldos de todas as contas (ativas e inativas) na data. */
    List<BalanceAt> balancesAt(LocalDate date);
}
