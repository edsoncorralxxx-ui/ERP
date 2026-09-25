package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditQuery;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.cadastros.domain.PartnerData;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Casos de uso de clientes (formulário "clientes" do B01): cadastrar (idempotente), editar com versão e inativar.
 * Cada comando confere a permissão, grava auditoria com o usuário e o evento na outbox, tudo na mesma transação.
 */
@Service
public class CustomerService {

    static final String ENTITY = "partner";

    private final PartnerRepository repository;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public CustomerService(PartnerRepository repository, AuditTrail audit, AuditQuery auditQuery, Outbox outbox,
                           CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<PartnerRepository.Summary> list(String search, Partner.Status status) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        return repository.list(search == null ? null : search.strip(), status, 500);
    }

    @Transactional(readOnly = true)
    public Partner get(UUID id) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        return find(id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(UUID id) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        find(id);
        return auditQuery.history(ENTITY, id.toString());
    }

    /** RegisterPartner: repetir com a mesma chave devolve o mesmo cliente (US-205). */
    @Transactional
    public Partner register(String idempotencyKey, PartnerData data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PARTNER_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterPartner", data);
        if (done.isPresent()) {
            return find(UUID.fromString(done.get()));
        }
        Instant now = clock.instant();
        Partner partner = Partner.register(repository.nextCustomerCode(), data, now, user.username());
        checkUniqueCnpj(partner);
        try {
            repository.insert(partner);
        } catch (DuplicateKeyException e) {
            throw duplicateCnpj(partner, false);
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        partner.diff(emptyLike(partner)).forEach((f, v) -> {
            if (v[0] != null) changes.put(f, new AuditEntry.Change(null, v[0]));
        });
        changes.put("code", new AuditEntry.Change(null, partner.code()));
        record(user, "PARTNER_REGISTERED", partner, null, changes);
        outbox.append("PartnerRegistered", ENTITY, partner.id().toString(),
                Map.of("partnerId", partner.id().toString(), "roles", List.of("CLIENTE")), user.username());
        receipts.complete(user.username(), key, partner.id().toString());
        return partner;
    }

    /** UpdatePartner com a versão lida (If-Match); edição desatualizada é rejeitada sem gravar nada. */
    @Transactional
    public Partner update(UUID id, long expectedVersion, PartnerData data) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PARTNER_UPDATE);
        Partner current = repository.findByIdForUpdate(id).orElseThrow(CustomerService::notFound);
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        }
        Partner updated = current.update(data, clock.instant(), user.username());
        checkUniqueCnpj(updated);
        try {
            if (!repository.update(updated, expectedVersion)) {
                throw new VersionConflictException(ENTITY, expectedVersion, find(id).version());
            }
        } catch (DuplicateKeyException e) {
            throw duplicateCnpj(updated, false);
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        current.diff(updated).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        record(user, "PARTNER_UPDATED", updated, null, changes);
        outbox.append("PartnerUpdated", ENTITY, id.toString(),
                Map.of("partnerId", id.toString(), "changedFields", List.copyOf(changes.keySet())), user.username());
        return updated;
    }

    /** DeactivatePartner: idempotente — inativar um cliente já inativo não grava nada de novo. */
    @Transactional
    public Partner deactivate(UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PARTNER_DEACTIVATE);
        Partner current = repository.findByIdForUpdate(id).orElseThrow(CustomerService::notFound);
        if (current.status() == Partner.Status.INATIVO) {
            return current;
        }
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        }
        String why = reason == null ? "" : reason.strip();
        if (why.isEmpty() || why.length() > 500) {
            throw new RuleViolationException("PARTNER_INVALID", "Informe o motivo da inativação.",
                    List.of(new FieldIssue("reason", why.isEmpty() ? "Obrigatório." : "Máximo de 500 caracteres.")));
        }
        Partner inactive = current.deactivate(clock.instant(), user.username());
        repository.update(inactive, expectedVersion);
        record(user, "PARTNER_DEACTIVATED", inactive, why,
                Map.of("status", new AuditEntry.Change(Partner.Status.ATIVO.name(), Partner.Status.INATIVO.name())));
        outbox.append("PartnerDeactivated", ENTITY, id.toString(), Map.of("partnerId", id.toString(), "reason", why),
                user.username());
        return inactive;
    }

    private Partner find(UUID id) {
        return repository.findById(id).orElseThrow(CustomerService::notFound);
    }

    private void checkUniqueCnpj(Partner p) {
        if (p.cnpj() != null && repository.findByCnpj(p.cnpj().value(), p.id()).isPresent()) {
            throw duplicateCnpj(p, true);
        }
    }

    /** {@code lookup} falso quando o banco já recusou o insert (transação abortada): não dá para consultar o outro. */
    private RuleViolationException duplicateCnpj(Partner p, boolean lookup) {
        String other = lookup ? repository.findByCnpj(p.cnpj().value(), p.id()).map(s -> s.code() + " — " + s.legalName())
                .orElse("outro cliente") : "outro cliente";
        return new RuleViolationException("PARTNER_CNPJ_DUPLICATE", "Já existe um cliente com este CNPJ: " + other + ".",
                List.of(new FieldIssue("cnpj", "CNPJ já cadastrado em " + other + ".")));
    }

    private void record(CurrentUser user, String action, Partner p, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, p.id().toString(), p.version(), reason, changes,
                CorrelationId.current()));
    }

    /** Parceiro vazio para listar, no cadastro, os campos preenchidos como mudanças a partir do nada. */
    private static Partner emptyLike(Partner p) {
        return new Partner(p.id(), p.code(), "", null, null, null, p.status(), List.of(), List.of(), 0, null, null, null, null);
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Cliente não encontrado.");
    }
}
