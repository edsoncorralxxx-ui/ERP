package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.domain.TabelaAuxiliar;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Tabelas editáveis dos cadastros (Sprint 13). Todos leem ({@code catalog.read}); só o Administrador grava
 * ({@code catalog.admin}), a tabela inteira de uma vez, com a versão lida (If-Match). Linha removida que está em uso
 * (unidade de um item, categoria de um item) é recusada: inative em vez de remover.
 */
@Service
public class ReferenceTableService {

    static final String ENTITY = "reference_table";

    private final ReferenceTableRepository repository;
    private final AuditTrail audit;
    private final Outbox outbox;
    private final Clock clock;

    public ReferenceTableService(ReferenceTableRepository repository, AuditTrail audit, Outbox outbox, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.outbox = outbox;
        this.clock = clock;
    }

    public record Table(TabelaAuxiliar table, long version, List<ReferenceTableRepository.Entry> rows) { }

    @Transactional(readOnly = true)
    public Table get(TabelaAuxiliar table) {
        CurrentUserHolder.require(Permissions.CATALOG_READ);
        return new Table(table, repository.version(table, false), repository.rows(table));
    }

    @Transactional
    public Table replace(TabelaAuxiliar table, long expectedVersion, List<TabelaAuxiliar.Row> rows) {
        CurrentUser user = CurrentUserHolder.require(Permissions.CATALOG_ADMIN);
        long current = repository.version(table, true);
        if (current != expectedVersion) throw new VersionConflictException(ENTITY, expectedVersion, current);
        List<TabelaAuxiliar.Valid> valid = table.validate(rows);
        List<ReferenceTableRepository.Entry> before = repository.rows(table);
        long version = repository.replace(table, valid, clock.instant(), user.username());
        List<ReferenceTableRepository.Entry> after = repository.rows(table);
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        String a = summary(before), b = summary(after);
        if (!Objects.equals(a, b)) changes.put("rows", new AuditEntry.Change(a, b));
        audit.record(new AuditEntry(user.username(), "REFERENCE_TABLE_UPDATED", ENTITY, table.name(), version, null, changes,
                CorrelationId.current()));
        outbox.append("ReferenceTableUpdated", ENTITY, table.name(), Map.of("table", table.name(), "rows", after.size()),
                user.username());
        return new Table(table, version, after);
    }

    private static String summary(List<ReferenceTableRepository.Entry> rows) {
        return rows.stream().map(r -> r.code() + " " + r.description() + (r.active() ? "" : " (inativo)"))
                .collect(Collectors.joining("; "));
    }
}
