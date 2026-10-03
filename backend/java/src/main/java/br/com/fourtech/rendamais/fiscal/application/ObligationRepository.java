package br.com.fourtech.rendamais.fiscal.application;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das obrigações fiscais e acessórias e dos modelos recorrentes. */
public interface ObligationRepository {

    /** Modelo recorrente: MENSAL vence no dia {@code dueDay} do mês seguinte (31 = último dia); ANUAL em dueDay/dueMonth do ano seguinte. */
    record Template(UUID id, String code, String name, String sphere, String kind, String periodicity, int dueDay, int dueMonth,
                    String responsible, String detail, String initialStatus, boolean active) { }

    record Obligation(UUID id, String code, UUID templateId, String templateCode, String name, String competence, LocalDate dueDate,
                      String sphere, String kind, String responsible, String detail, String status, LocalDate deliveredOn,
                      String receiptNumber, String notes, long version, Instant createdAt, String createdBy, Instant updatedAt,
                      String updatedBy) { }

    List<Template> templates();

    String nextCode();

    /** Cria a ocorrência do modelo na competência se ainda não existir (uma por modelo e competência). */
    void ensure(Obligation o);

    /** Obrigações com vencimento no intervalo (nulos não limitam), pelo vencimento. */
    List<Obligation> list(LocalDate from, LocalDate to);

    Optional<Obligation> find(UUID id);

    Optional<Obligation> findForUpdate(UUID id);

    /** Ocorrência do modelo na competência. */
    Optional<Obligation> byTemplate(String templateCode, String competence);

    void insert(Obligation o);

    void update(Obligation o, long expectedVersion);
}
