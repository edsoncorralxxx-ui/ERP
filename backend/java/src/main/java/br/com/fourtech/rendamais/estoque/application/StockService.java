package br.com.fourtech.rendamais.estoque.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.cadastros.api.ItemQueryApi;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.comando.CommandReceipts;
import br.com.fourtech.rendamais.plataforma.eventos.Outbox;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Depósitos, localizações e saldos (Sprint 13, mock "Localizações de estoque" e aba Estoque do item). Todos leem
 * ({@code stock.read}); só o Administrador mantém ({@code stock.admin}). Os saldos são informados até o módulo de
 * movimentos: nenhum saldo nasce de documento ainda.
 */
@Service
public class StockService {

    static final String WAREHOUSE = "warehouse";
    static final String LOCATION = "stock_location";
    public static final Set<String> KINDS = Set.of("PROPRIO", "TERCEIROS", "VIRTUAL");
    public static final List<String> LEVELS = List.of("AREA", "RUA", "ESTANTE", "POSICAO");

    private final StockRepository repository;
    private final ItemQueryApi items;
    private final AuditTrail audit;
    private final Outbox outbox;
    private final CommandReceipts receipts;
    private final Clock clock;

    public StockService(StockRepository repository, ItemQueryApi items, AuditTrail audit, Outbox outbox, CommandReceipts receipts,
                        Clock clock) {
        this.repository = repository;
        this.items = items;
        this.audit = audit;
        this.outbox = outbox;
        this.receipts = receipts;
        this.clock = clock;
    }

    public record WarehouseData(String code, String name, String kind, String address, String responsible, String capacityKg,
                                String volumeM3, String occupancyPercent, Boolean active) { }

    public record LocationData(String warehouseId, String parentId, String code, String name, String level, String capacityKg,
                               String volumeM3, String occupancyPercent, Boolean blockedEntry, Boolean blockedExit, Boolean quarantineOnly) { }

    public record BalanceData(String warehouseId, String locationId, String lot, String onHand, String reserved, String onOrder,
                              String averageCost) { }

    @Transactional(readOnly = true)
    public List<StockRepository.Warehouse> warehouses(String status) {
        CurrentUserHolder.require(Permissions.STOCK_READ);
        return repository.warehouses(status);
    }

    @Transactional(readOnly = true)
    public StockRepository.Warehouse warehouse(UUID id) {
        CurrentUserHolder.require(Permissions.STOCK_READ);
        return repository.warehouse(id, false).orElseThrow(() -> new NotFoundException("Depósito não encontrado."));
    }

    @Transactional(readOnly = true)
    public List<StockRepository.Location> locations() {
        CurrentUserHolder.require(Permissions.STOCK_READ);
        return repository.locations();
    }

    @Transactional(readOnly = true)
    public List<StockRepository.Balance> balances(UUID itemId, UUID warehouseId, UUID locationId) {
        CurrentUserHolder.require(Permissions.STOCK_READ);
        return repository.balances(itemId, warehouseId, locationId);
    }

    @Transactional(readOnly = true)
    public List<StockRepository.Total> totals() {
        CurrentUserHolder.require(Permissions.STOCK_READ);
        return repository.totals();
    }

    @Transactional
    public StockRepository.Warehouse registerWarehouse(String idempotencyKey, WarehouseData d) {
        CurrentUser user = CurrentUserHolder.require(Permissions.STOCK_ADMIN);
        String key = CommandReceipts.requireKey(idempotencyKey);
        var done = receipts.claim(user.username(), key, "RegisterWarehouse", d);
        if (done.isPresent()) return warehouse(UUID.fromString(done.get()));
        StockRepository.Warehouse w = validWarehouse(UUID.randomUUID(), d, 1, null);
        if (repository.warehouseCodeExists(w.code())) {
            throw new RuleViolationException("WAREHOUSE_CODE_DUPLICATE", "Já existe o depósito " + w.code() + ".",
                    List.of(new FieldIssue("code", "Código já usado.")));
        }
        repository.insertWarehouse(w, clock.instant(), user.username());
        audit(user, "WAREHOUSE_REGISTERED", WAREHOUSE, w.id(), 1, Map.of("code", new AuditEntry.Change(null, w.code()),
                "name", new AuditEntry.Change(null, w.name())));
        outbox.append("WarehouseRegistered", WAREHOUSE, w.id().toString(), Map.of("warehouseId", w.id().toString()), user.username());
        receipts.complete(user.username(), key, w.id().toString());
        return repository.warehouse(w.id(), false).orElseThrow();
    }

    @Transactional
    public StockRepository.Warehouse updateWarehouse(UUID id, long expectedVersion, WarehouseData d) {
        CurrentUser user = CurrentUserHolder.require(Permissions.STOCK_ADMIN);
        StockRepository.Warehouse current = repository.warehouse(id, true).orElseThrow(() -> new NotFoundException("Depósito não encontrado."));
        if (current.version() != expectedVersion) throw new VersionConflictException(WAREHOUSE, expectedVersion, current.version());
        StockRepository.Warehouse w = validWarehouse(id, d, current.version() + 1, current.code());
        repository.updateWarehouse(w, expectedVersion, clock.instant(), user.username());
        Map<String, AuditEntry.Change> changes = changes(Map.of("name", current.name(), "kind", current.kind(),
                "address", nz(current.address()), "responsible", nz(current.responsible()), "status", current.status()),
                Map.of("name", w.name(), "kind", w.kind(), "address", nz(w.address()), "responsible", nz(w.responsible()), "status", w.status()));
        audit(user, "WAREHOUSE_UPDATED", WAREHOUSE, id, w.version(), changes);
        outbox.append("WarehouseUpdated", WAREHOUSE, id.toString(), Map.of("warehouseId", id.toString()), user.username());
        return repository.warehouse(id, false).orElseThrow();
    }

    @Transactional
    public StockRepository.Location registerLocation(LocationData d) {
        CurrentUser user = CurrentUserHolder.require(Permissions.STOCK_ADMIN);
        StockRepository.Location l = validLocation(UUID.randomUUID(), d, 1, null);
        repository.insertLocation(l, clock.instant(), user.username());
        audit(user, "STOCK_LOCATION_REGISTERED", LOCATION, l.id(), 1, Map.of("code", new AuditEntry.Change(null, l.code()),
                "name", new AuditEntry.Change(null, l.name())));
        outbox.append("StockLocationRegistered", LOCATION, l.id().toString(), Map.of("locationId", l.id().toString()), user.username());
        return repository.location(l.id(), false).orElseThrow();
    }

    @Transactional
    public StockRepository.Location updateLocation(UUID id, long expectedVersion, LocationData d) {
        CurrentUser user = CurrentUserHolder.require(Permissions.STOCK_ADMIN);
        StockRepository.Location current = repository.location(id, true).orElseThrow(() -> new NotFoundException("Localização não encontrada."));
        if (current.version() != expectedVersion) throw new VersionConflictException(LOCATION, expectedVersion, current.version());
        StockRepository.Location l = validLocation(id, d, current.version() + 1, current);
        repository.updateLocation(l, expectedVersion, clock.instant(), user.username());
        Map<String, AuditEntry.Change> changes = changes(
                Map.of("code", current.code(), "name", current.name(), "level", current.level(), "capacityKg", nz(current.capacityKg()),
                        "volumeM3", nz(current.volumeM3()), "occupancyPercent", nz(current.occupancyPercent()),
                        "blocked", current.blockedEntry() + "/" + current.blockedExit() + "/" + current.quarantineOnly()),
                Map.of("code", l.code(), "name", l.name(), "level", l.level(), "capacityKg", nz(l.capacityKg()), "volumeM3", nz(l.volumeM3()),
                        "occupancyPercent", nz(l.occupancyPercent()), "blocked", l.blockedEntry() + "/" + l.blockedExit() + "/" + l.quarantineOnly()));
        audit(user, "STOCK_LOCATION_UPDATED", LOCATION, id, l.version(), changes);
        outbox.append("StockLocationUpdated", LOCATION, id.toString(), Map.of("locationId", id.toString()), user.username());
        return repository.location(id, false).orElseThrow();
    }

    /** Remove a localização sem subníveis nem saldos. */
    @Transactional
    public void deleteLocation(UUID id, long expectedVersion) {
        CurrentUser user = CurrentUserHolder.require(Permissions.STOCK_ADMIN);
        StockRepository.Location current = repository.location(id, true).orElseThrow(() -> new NotFoundException("Localização não encontrada."));
        if (current.version() != expectedVersion) throw new VersionConflictException(LOCATION, expectedVersion, current.version());
        if (current.children() > 0) throw new InvalidStateException("Remova primeiro os subníveis de " + current.code() + ".");
        if (current.balances() > 0) throw new InvalidStateException("Há itens guardados em " + current.code() + ".");
        repository.deleteLocation(id);
        audit(user, "STOCK_LOCATION_REMOVED", LOCATION, id, current.version(), Map.of("code", new AuditEntry.Change(current.code(), null)));
        outbox.append("StockLocationRemoved", LOCATION, id.toString(), Map.of("locationId", id.toString()), user.username());
    }

    /** Substitui os saldos informados do item (aba Estoque), por depósito, localização e lote. */
    @Transactional
    public List<StockRepository.Balance> replaceBalances(UUID itemId, List<BalanceData> rows) {
        CurrentUser user = CurrentUserHolder.require(Permissions.STOCK_ADMIN);
        items.item(itemId).orElseThrow(() -> new NotFoundException("Item não encontrado."));
        List<FieldIssue> issues = new ArrayList<>();
        List<StockRepository.Balance> valid = new ArrayList<>();
        List<StockRepository.Location> all = repository.locations();
        for (int i = 0; i < (rows == null ? 0 : rows.size()); i++) {
            BalanceData b = rows.get(i);
            String f = "rows[" + i + "].";
            UUID wh = uuid(b.warehouseId(), f + "warehouseId", issues);
            if (wh != null && repository.warehouse(wh, false).isEmpty()) issues.add(new FieldIssue(f + "warehouseId", "Depósito inexistente."));
            UUID loc = b.locationId() == null || b.locationId().isBlank() ? null : uuid(b.locationId(), f + "locationId", issues);
            if (loc != null && all.stream().noneMatch(x -> x.id().equals(loc) && x.warehouseId().equals(wh))) {
                issues.add(new FieldIssue(f + "locationId", "A localização não é desse depósito."));
            }
            valid.add(new StockRepository.Balance(UUID.randomUUID(), itemId, null, null, null, wh, null, null, loc,
                    null, b.lot() == null || b.lot().isBlank() ? null : b.lot().strip(), qty(b.onHand(), f + "onHand", issues),
                    qty(b.reserved(), f + "reserved", issues), qty(b.onOrder(), f + "onOrder", issues),
                    b.averageCost() == null || b.averageCost().isBlank() ? null : qty(b.averageCost(), f + "averageCost", issues)));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("STOCK_BALANCE_INVALID", "Corrija as linhas indicadas.", issues);
        repository.replaceBalances(itemId, valid, clock.instant(), user.username());
        audit(user, "STOCK_BALANCE_INFORMED", "item_stock", itemId, 1, Map.of("rows", new AuditEntry.Change(null, Integer.toString(valid.size()))));
        outbox.append("StockBalanceInformed", "item_stock", itemId.toString(), Map.of("itemId", itemId.toString()), user.username());
        return repository.balances(itemId, null, null);
    }

    private StockRepository.Warehouse validWarehouse(UUID id, WarehouseData d, long version, String fixedCode) {
        List<FieldIssue> issues = new ArrayList<>();
        String code = text(d.code(), 10, "code", issues);
        if (fixedCode != null) code = fixedCode;
        else if (code == null) issues.add(new FieldIssue("code", "Informe o código."));
        String name = text(d.name(), 100, "name", issues);
        if (name == null) issues.add(new FieldIssue("name", "Informe o nome."));
        String kind = d.kind() == null ? "PROPRIO" : d.kind().strip().toUpperCase(java.util.Locale.ROOT);
        if (!KINDS.contains(kind)) issues.add(new FieldIssue("kind", "Tipo deve ser PROPRIO, TERCEIROS ou VIRTUAL."));
        BigDecimal cap = num(d.capacityKg(), "capacityKg", issues), vol = num(d.volumeM3(), "volumeM3", issues),
                occ = num(d.occupancyPercent(), "occupancyPercent", issues);
        if (occ != null && occ.compareTo(BigDecimal.valueOf(100)) > 0) issues.add(new FieldIssue("occupancyPercent", "Ocupação até 100%."));
        if (!issues.isEmpty()) throw new RuleViolationException("WAREHOUSE_INVALID", "Corrija os campos indicados.", issues);
        return new StockRepository.Warehouse(id, code, name, kind, text(d.address(), 200, "address", issues),
                text(d.responsible(), 120, "responsible", issues), Boolean.FALSE.equals(d.active()) ? "INATIVO" : "ATIVO", cap, vol, occ,
                version, 0, 0);
    }

    private StockRepository.Location validLocation(UUID id, LocationData d, long version, StockRepository.Location current) {
        List<FieldIssue> issues = new ArrayList<>();
        UUID wh = current != null ? current.warehouseId() : uuid(d.warehouseId(), "warehouseId", issues);
        if (current == null && wh != null && repository.warehouse(wh, false).isEmpty()) issues.add(new FieldIssue("warehouseId", "Depósito inexistente."));
        UUID parent = current != null ? current.parentId() : (d.parentId() == null || d.parentId().isBlank() ? null : uuid(d.parentId(), "parentId", issues));
        String parentLevel = null;
        if (current == null && parent != null) {
            StockRepository.Location p = repository.location(parent, false).orElse(null);
            if (p == null || !p.warehouseId().equals(wh)) issues.add(new FieldIssue("parentId", "Nível superior inexistente ou de outro depósito."));
            else parentLevel = p.level();
        }
        String code = text(d.code(), 30, "code", issues);
        if (code == null) issues.add(new FieldIssue("code", "Informe o código."));
        else if (repository.locationCodeExists(code, id)) issues.add(new FieldIssue("code", "Código já usado em outra localização."));
        String name = text(d.name(), 100, "name", issues);
        if (name == null) issues.add(new FieldIssue("name", "Informe a descrição."));
        String level = d.level() == null ? null : d.level().strip().toUpperCase(java.util.Locale.ROOT);
        if (level == null || !LEVELS.contains(level)) issues.add(new FieldIssue("level", "Nível deve ser AREA, RUA, ESTANTE ou POSICAO."));
        else if (parentLevel != null && LEVELS.indexOf(level) <= LEVELS.indexOf(parentLevel)) {
            issues.add(new FieldIssue("level", "O subnível precisa ser abaixo do nível superior."));
        }
        BigDecimal cap = num(d.capacityKg(), "capacityKg", issues), vol = num(d.volumeM3(), "volumeM3", issues),
                occ = num(d.occupancyPercent(), "occupancyPercent", issues);
        if (occ != null && occ.compareTo(BigDecimal.valueOf(100)) > 0) issues.add(new FieldIssue("occupancyPercent", "Ocupação até 100%."));
        if (!issues.isEmpty()) throw new RuleViolationException("STOCK_LOCATION_INVALID", "Corrija os campos indicados.", issues);
        return new StockRepository.Location(id, wh, parent, code, name, level, cap, vol, occ, Boolean.TRUE.equals(d.blockedEntry()),
                Boolean.TRUE.equals(d.blockedExit()), Boolean.TRUE.equals(d.quarantineOnly()), current == null ? 0 : current.position(),
                version, 0, 0);
    }

    private static Map<String, AuditEntry.Change> changes(Map<String, String> before, Map<String, String> after) {
        Map<String, AuditEntry.Change> m = new LinkedHashMap<>();
        before.forEach((k, v) -> {
            if (!Objects.equals(v, after.get(k))) m.put(k, new AuditEntry.Change(v, after.get(k)));
        });
        return m;
    }

    private void audit(CurrentUser user, String action, String entity, UUID id, long version, Map<String, AuditEntry.Change> changes) {
        audit.record(new AuditEntry(user.username(), action, entity, id.toString(), version, null, changes, CorrelationId.current()));
    }

    private static String nz(Object o) {
        return o == null ? "" : o instanceof BigDecimal b ? b.stripTrailingZeros().toPlainString() : o.toString();
    }

    private static String text(String s, int max, String field, List<FieldIssue> issues) {
        if (s == null) return null;
        String t = s.strip();
        if (t.isEmpty()) return null;
        if (t.length() > max) issues.add(new FieldIssue(field, "Máximo de " + max + " caracteres."));
        return t;
    }

    private static BigDecimal num(String s, String field, List<FieldIssue> issues) {
        if (s == null || s.isBlank()) return null;
        try {
            BigDecimal v = new BigDecimal(s.strip());
            if (v.signum() < 0) issues.add(new FieldIssue(field, "Não pode ser negativo."));
            if (v.stripTrailingZeros().scale() > 3) issues.add(new FieldIssue(field, "Máximo de 3 casas decimais."));
            return v;
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue(field, "Número inválido."));
            return null;
        }
    }

    private static BigDecimal qty(String s, String field, List<FieldIssue> issues) {
        if (s == null || s.isBlank()) return BigDecimal.ZERO;
        try {
            BigDecimal v = new BigDecimal(s.strip());
            if (v.signum() < 0) issues.add(new FieldIssue(field, "Não pode ser negativo."));
            return v;
        } catch (NumberFormatException e) {
            issues.add(new FieldIssue(field, "Número inválido."));
            return BigDecimal.ZERO;
        }
    }

    private static UUID uuid(String s, String field, List<FieldIssue> issues) {
        try {
            return UUID.fromString(s);
        } catch (RuntimeException e) {
            issues.add(new FieldIssue(field, "Informe o registro."));
            return null;
        }
    }
}
