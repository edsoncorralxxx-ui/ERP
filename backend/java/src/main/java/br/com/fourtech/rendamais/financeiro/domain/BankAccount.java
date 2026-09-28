package br.com.fourtech.rendamais.financeiro.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Conta financeira (caixa ou conta bancária) onde os recebimentos entram. O saldo é o saldo inicial mais os movimentos
 * de caixa; saldo inicial e data só mudam enquanto a conta não tem movimento, para não reescrever o passado.
 */
public record BankAccount(UUID id, String code, String name, Kind kind, String bank, String agency, String accountNumber,
                          long openingCents, LocalDate openingOn, Status status, long version, Instant createdAt, String createdBy,
                          Instant updatedAt, String updatedBy) {

    public enum Kind { CAIXA, BANCO }

    public enum Status { ATIVO, INATIVO }

    /** Dados editáveis, já validados pelo serviço. */
    public record Data(String name, Kind kind, String bank, String agency, String accountNumber, long openingCents,
                       LocalDate openingOn, Status status) { }
}
