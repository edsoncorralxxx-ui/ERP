package br.com.fourtech.rendamais.engenharia.application;

import br.com.fourtech.rendamais.engenharia.domain.Bom;
import br.com.fourtech.rendamais.engenharia.domain.BomLine;
import br.com.fourtech.rendamais.engenharia.domain.BomRevision;
import br.com.fourtech.rendamais.engenharia.domain.EquipmentBom;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das BOMs, revisões, linhas, cargas do arquivo e BOMs dos equipamentos. */
public interface BomRepository {

    // ───────────── BOM e revisões ─────────────

    String nextBomCode();

    void insert(Bom bom);

    Optional<Bom> findBom(UUID id);

    Optional<Bom> findBomByName(String name);

    Optional<Bom> findBomByModel(UUID modelId);

    /** BOMs com a busca no código, no nome ou no nome do modelo. */
    List<Bom> listBoms(String search, int limit);

    void insert(BomRevision revision);

    boolean update(BomRevision revision, long expectedVersion);

    Optional<BomRevision> findRevision(UUID id);

    Optional<BomRevision> findRevisionForUpdate(UUID id);

    List<BomRevision> revisionsOf(UUID bomId);

    Optional<BomRevision> approvedOf(UUID bomId);

    Optional<BomRevision> draftOf(UUID bomId);

    int nextRevisionNumber(UUID bomId);

    List<BomLine> linesOf(UUID revisionId);

    void replaceLines(UUID revisionId, List<BomLine> lines);

    /** Revisões que usam a revisão como submontagem. */
    List<UUID> parentsOf(UUID revisionId);

    /** Revisões aprovadas de outras BOMs que usam uma revisão da BOM {@code bomId} diferente de {@code revisionId}. */
    List<UUID> approvedParentsUsingOtherRevision(UUID bomId, UUID revisionId);

    /** Apaga o rascunho e as linhas dele; a carga do arquivo que o criou perde a referência. */
    void deleteDraft(UUID revisionId);

    // ───────────── Carga do arquivo ─────────────

    record BomImport(UUID id, String fileName, String fileHash, String content, String product, String status, UUID revisionId,
                     Instant createdAt, String createdBy, Instant confirmedAt, String confirmedBy) { }

    Optional<BomImport> findImportByHash(String hash);

    Optional<BomImport> findImport(UUID id);

    Optional<BomImport> findImportForUpdate(UUID id);

    void insert(BomImport bomImport);

    void confirm(UUID importId, UUID revisionId, Instant now, String actor);

    // ───────────── BOM do equipamento ─────────────

    Optional<EquipmentBom> equipmentBomOf(UUID equipmentId);

    Optional<EquipmentBom> equipmentBomForUpdate(UUID equipmentId);

    void insert(EquipmentBom bom);

    void update(EquipmentBom bom);

    List<EquipmentBom.Line> equipmentLines(UUID equipmentBomId);

    void deleteEquipmentLines(UUID equipmentBomId);

    void insertEquipmentLines(List<EquipmentBom.Line> lines);

    void updateEquipmentLine(EquipmentBom.Line line);

    /** BOMs aplicadas aos equipamentos indicados. */
    List<EquipmentBom> equipmentBoms(Collection<UUID> equipmentIds);
}
