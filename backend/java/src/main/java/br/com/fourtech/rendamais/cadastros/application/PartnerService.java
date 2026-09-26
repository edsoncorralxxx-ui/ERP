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
 * Casos de uso de parceiros nos papéis de cliente e fornecedor (formulários "clientes" e "fornecedores" do B01):
 * cadastrar (idempotente), editar com versão, inativar o papel e dar o outro papel a um parceiro existente. Cada comando
 * confere a permissão, grava auditoria com o usuário e o evento na outbox, tudo na mesma transação.
 */
@Service
public class PartnerService {

    static final String ENTITY = "partner";

    private final PartnerRepository repository;
    private final CatalogService catalog;
    private final AuditTrail audit;
    private final AuditQuery auditQuery;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public PartnerService(PartnerRepository repository, CatalogService catalog, AuditTrail audit, AuditQuery auditQuery,
                          Outbox outbox, CommandReceipts receipts, Clock clock) {
        this.repository = repository;
        this.catalog = catalog;
        this.audit = audit;
        this.auditQuery = auditQuery;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    /** Dados de fornecedor como vêm da API: categorias pelos ids, ainda não conferidas. */
    public record SupplierInput(Integer leadTimeDays, String paymentTerms, List<String> categoryIds) { }

    /** Conteúdo do comando guardado no recibo: a mesma chave com outro papel ou outros dados é recusada. */
    record RegisterRequest(Partner.Role role, PartnerData data, SupplierInput supplier) { }

    @Transactional(readOnly = true)
    public List<PartnerRepository.Summary> list(Partner.Role role, String search, Partner.Status status) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        return repository.list(search == null ? null : search.strip(), role, status, 500);
    }

    /** O parceiro, que precisa ter o papel pedido (a ficha do fornecedor não abre um cliente que não é fornecedor). */
    @Transactional(readOnly = true)
    public Partner get(Partner.Role role, UUID id) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        return find(role, id);
    }

    @Transactional(readOnly = true)
    public List<AuditQuery.AuditRecord> history(Partner.Role role, UUID id) {
        CurrentUserHolder.require(Permissions.PARTNER_READ);
        find(role, id);
        return auditQuery.history(ENTITY, id.toString());
    }

    /**
     * RegisterPartner: repetir com a mesma chave devolve o mesmo parceiro (US-205). CNPJ de parceiro que ainda não tem
     * este papel não cria outro cadastro: o erro {@code PARTNER_OTHER_ROLE} aponta o parceiro para o app oferecer
     * {@link #enable}.
     */
    @Transactional
    public Partner register(Partner.Role role, String idempotencyKey, PartnerData data, SupplierInput supplier) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PARTNER_CREATE);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterPartner", new RegisterRequest(role, data, supplier));
        if (done.isPresent()) {
            return find(role, UUID.fromString(done.get()));
        }
        Instant now = clock.instant();
        PartnerData full = withSupplier(data, supplier, List.of());
        Partner partner = Partner.register(repository.nextCode(role), role, full, now, user.username());
        checkUniqueCnpj(partner, role);
        try {
            repository.insert(partner);
        } catch (DuplicateKeyException e) {
            throw duplicateCnpj(null, role);
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        partner.diff(emptyLike(partner)).forEach((f, v) -> {
            if (v[0] != null) changes.put(f, new AuditEntry.Change(null, v[0]));
        });
        changes.put("code", new AuditEntry.Change(null, partner.code()));
        record(user, "PARTNER_REGISTERED", partner, null, changes);
        outbox.append("PartnerRegistered", ENTITY, partner.id().toString(),
                Map.of("partnerId", partner.id().toString(), "roles", List.of(role.name())), user.username());
        receipts.complete(user.username(), key, partner.id().toString());
        return partner;
    }

    /** UpdatePartner com a versão lida (If-Match); edição desatualizada é rejeitada sem gravar nada. */
    @Transactional
    public Partner update(Partner.Role role, UUID id, long expectedVersion, PartnerData data, SupplierInput supplier) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PARTNER_UPDATE);
        Partner current = repository.findByIdForUpdate(id).filter(p -> p.hasRole(role)).orElseThrow(() -> notFound(role));
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        }
        Partner updated = current.update(withSupplier(data, supplier, current.supplier().categories()), clock.instant(),
                user.username());
        checkUniqueCnpj(updated, role);
        try {
            if (!repository.update(updated, expectedVersion)) {
                throw new VersionConflictException(ENTITY, expectedVersion, find(role, id).version());
            }
        } catch (DuplicateKeyException e) {
            throw duplicateCnpj(null, role);
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        current.diff(updated).forEach((f, v) -> changes.put(f, new AuditEntry.Change(v[0], v[1])));
        record(user, "PARTNER_UPDATED", updated, null, changes);
        outbox.append("PartnerUpdated", ENTITY, id.toString(),
                Map.of("partnerId", id.toString(), "changedFields", List.copyOf(changes.keySet())), user.username());
        return updated;
    }

    /** DeactivatePartner no papel: idempotente, e o outro papel do parceiro continua como está. */
    @Transactional
    public Partner deactivate(Partner.Role role, UUID id, long expectedVersion, String reason) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PARTNER_DEACTIVATE);
        Partner current = repository.findByIdForUpdate(id).filter(p -> p.hasRole(role)).orElseThrow(() -> notFound(role));
        if (current.status(role) == Partner.Status.INATIVO) {
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
        Partner inactive = current.deactivate(role, clock.instant(), user.username());
        repository.update(inactive, expectedVersion);
        record(user, "PARTNER_DEACTIVATED", inactive, why, Map.of(statusField(role),
                new AuditEntry.Change(Partner.Status.ATIVO.name(), Partner.Status.INATIVO.name())));
        outbox.append("PartnerDeactivated", ENTITY, id.toString(),
                Map.of("partnerId", id.toString(), "role", role.name(), "reason", why), user.username());
        return inactive;
    }

    /**
     * Dá o papel a um parceiro já cadastrado (o cliente passa a ser também fornecedor, e vice-versa) ou reativa o papel
     * inativo. Idempotente: se o papel já está ativo, nada muda.
     */
    @Transactional
    public Partner enable(Partner.Role role, UUID id, long expectedVersion) {
        CurrentUser user = CurrentUserHolder.require(Permissions.PARTNER_UPDATE);
        Partner current = repository.findByIdForUpdate(id).orElseThrow(() -> new NotFoundException("Parceiro não encontrado."));
        if (current.status(role) == Partner.Status.ATIVO) {
            return current;
        }
        if (current.version() != expectedVersion) {
            throw new VersionConflictException(ENTITY, expectedVersion, current.version());
        }
        Partner enabled = current.enable(role, clock.instant(), user.username());
        repository.update(enabled, expectedVersion);
        Partner.Status before = current.status(role);
        record(user, "PARTNER_ROLE_ENABLED", enabled, null, Map.of(statusField(role),
                new AuditEntry.Change(before == null ? null : before.name(), Partner.Status.ATIVO.name())));
        outbox.append("PartnerUpdated", ENTITY, id.toString(),
                Map.of("partnerId", id.toString(), "changedFields", List.of(statusField(role))), user.username());
        return enabled;
    }

    private PartnerData withSupplier(PartnerData data, SupplierInput supplier, List<Partner.Category> current) {
        if (supplier == null) return data;
        List<Partner.Category> categories = catalog.resolveCategories(supplier.categoryIds(), current, "suppliedCategories");
        return new PartnerData(data.legalName(), data.tradeName(), data.cnpj(), data.group(), data.units(), data.contacts(),
                new PartnerData.SupplierData(supplier.leadTimeDays(), supplier.paymentTerms(), categories));
    }

    private Partner find(Partner.Role role, UUID id) {
        return repository.findById(id).filter(p -> p.hasRole(role)).orElseThrow(() -> notFound(role));
    }

    private void checkUniqueCnpj(Partner p, Partner.Role role) {
        if (p.cnpj() == null) return;
        repository.findIdByCnpj(p.cnpj().value(), p.id()).flatMap(repository::findById).ifPresent(other -> {
            throw duplicateCnpj(other, role);
        });
    }

    /**
     * {@code other} nulo quando o banco já recusou o insert (transação abortada): não dá para consultar o outro. Se o
     * outro parceiro ainda não tem o papel, o erro diz qual é ele, para o app oferecer dar o papel sem duplicar.
     */
    private RuleViolationException duplicateCnpj(Partner other, Partner.Role role) {
        if (other == null) {
            return new RuleViolationException("PARTNER_CNPJ_DUPLICATE", "Já existe um parceiro com este CNPJ.",
                    List.of(new FieldIssue("cnpj", "CNPJ já cadastrado.")));
        }
        // "C00001 — Aços Paraná Ltda." já termina em ponto: não repete o ponto no fim da frase.
        String who = other.code() + " — " + other.legalName().replaceAll("\\.+$", "");
        if (!other.hasRole(role)) {
            Partner.Role has = other.roles().keySet().iterator().next();
            return new RuleViolationException("PARTNER_OTHER_ROLE",
                    "Este CNPJ já é do " + has.label() + " " + who + ". Você pode torná-lo também " + role.label() + ".",
                    List.of(new FieldIssue("cnpj", "CNPJ já cadastrado como " + has.label() + " em " + who + "."),
                            new FieldIssue("partnerId", other.id().toString()),
                            new FieldIssue("version", Long.toString(other.version()))));
        }
        return new RuleViolationException("PARTNER_CNPJ_DUPLICATE", "Já existe um " + role.label() + " com este CNPJ: " + who + ".",
                List.of(new FieldIssue("cnpj", "CNPJ já cadastrado em " + who + ".")));
    }

    private static String statusField(Partner.Role role) {
        return role == Partner.Role.CLIENTE ? "customerStatus" : "supplierStatus";
    }

    private void record(CurrentUser user, String action, Partner p, String reason, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, ENTITY, p.id().toString(), p.version(), reason, changes,
                CorrelationId.current()));
    }

    /** Parceiro vazio para listar, no cadastro, os campos preenchidos como mudanças a partir do nada. */
    private static Partner emptyLike(Partner p) {
        return new Partner(p.id(), p.code(), "", null, null, null, Map.of(), Partner.SupplierTerms.EMPTY, List.of(), List.of(),
                0, null, null, null, null);
    }

    private static NotFoundException notFound(Partner.Role role) {
        return new NotFoundException(role == Partner.Role.CLIENTE ? "Cliente não encontrado." : "Fornecedor não encontrado.");
    }
}
