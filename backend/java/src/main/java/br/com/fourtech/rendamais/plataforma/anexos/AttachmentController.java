package br.com.fourtech.rendamais.plataforma.anexos;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Anexos (Sprint 13, aba Documentos do parceiro e do item): o arquivo vai em base64 no JSON (até 10 MB) e fica guardado no
 * banco. Ver e baixar: {@code attachment.read}; anexar e remover: {@code attachment.update}.
 */
@RestController
class AttachmentController {

    static final Set<String> OWNERS = Set.of("partner", "item", "employee", "opportunity", "lead");
    static final int MAX = 10 * 1024 * 1024;

    private final JdbcClient jdbc;
    private final AuditTrail audit;
    private final Clock clock;

    AttachmentController(JdbcClient jdbc, AuditTrail audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    record AttachmentDto(String id, String kind, String fileName, String contentType, int sizeBytes, String uploadedAt, String uploadedBy) { }

    record UploadRequest(String ownerEntity, String ownerId, String kind, String fileName, String contentType, String contentBase64) { }

    record ContentDto(String fileName, String contentType, String contentBase64) { }

    @GetMapping("/api/v1/attachments")
    @Transactional(readOnly = true)
    public List<AttachmentDto> list(@RequestParam("ownerEntity") String owner, @RequestParam("ownerId") UUID ownerId) {
        CurrentUserHolder.require(Permissions.ATTACHMENT_READ);
        return jdbc.sql("""
                select id, kind, file_name, content_type, size_bytes, uploaded_at, uploaded_by from attachment
                 where owner_entity = :o and owner_id = :id order by uploaded_at, file_name
                """).param("o", owner).param("id", ownerId).query((rs, n) -> new AttachmentDto(rs.getObject("id", UUID.class).toString(),
                rs.getString("kind"), rs.getString("file_name"), rs.getString("content_type"), rs.getInt("size_bytes"),
                rs.getTimestamp("uploaded_at").toInstant().toString(), rs.getString("uploaded_by"))).list();
    }

    @PostMapping("/api/v1/attachments")
    @Transactional
    public ResponseEntity<AttachmentDto> upload(@RequestBody UploadRequest r) {
        CurrentUser user = CurrentUserHolder.require(Permissions.ATTACHMENT_UPDATE);
        List<FieldIssue> issues = new java.util.ArrayList<>();
        if (r == null || !OWNERS.contains(r.ownerEntity())) issues.add(new FieldIssue("ownerEntity", "Cadastro inválido."));
        UUID owner = null;
        try {
            owner = UUID.fromString(r == null ? "" : r.ownerId());
        } catch (RuntimeException e) {
            issues.add(new FieldIssue("ownerId", "Registro inválido."));
        }
        String kind = r == null || r.kind() == null ? "" : r.kind().strip();
        if (kind.isEmpty() || kind.length() > 60) issues.add(new FieldIssue("kind", kind.isEmpty() ? "Informe o tipo do documento." : "Máximo de 60 caracteres."));
        String name = r == null || r.fileName() == null ? "" : r.fileName().strip();
        if (name.isEmpty() || name.length() > 200) issues.add(new FieldIssue("fileName", "Nome do arquivo inválido."));
        byte[] content = null;
        try {
            content = Base64.getDecoder().decode(r == null || r.contentBase64() == null ? "" : r.contentBase64());
            if (content.length > MAX) issues.add(new FieldIssue("contentBase64", "Arquivo maior que 10 MB."));
        } catch (IllegalArgumentException e) {
            issues.add(new FieldIssue("contentBase64", "Conteúdo inválido."));
        }
        if (!issues.isEmpty()) throw new RuleViolationException("ATTACHMENT_INVALID", "Corrija os campos indicados.", issues);
        UUID id = UUID.randomUUID();
        String type = r.contentType() == null || r.contentType().isBlank() ? "application/octet-stream" : r.contentType().strip();
        Timestamp at = Timestamp.from(clock.instant());
        jdbc.sql("""
                insert into attachment (id, owner_entity, owner_id, kind, file_name, content_type, size_bytes, content, uploaded_at, uploaded_by)
                values (:id, :o, :oid, :k, :f, :t, :s, :c, :at, :by)
                """).param("id", id).param("o", r.ownerEntity()).param("oid", owner).param("k", kind).param("f", name)
                .param("t", type.length() > 100 ? type.substring(0, 100) : type).param("s", content.length).param("c", content)
                .param("at", at).param("by", user.displayName()).update();
        audit.record(new AuditEntry(user.username(), "ATTACHMENT_ADDED", r.ownerEntity(), owner.toString(), 0, null,
                Map.of("anexo", new AuditEntry.Change(null, kind + " — " + name)), CorrelationId.current()));
        return ResponseEntity.status(HttpStatus.CREATED).body(new AttachmentDto(id.toString(), kind, name, type, content.length,
                at.toInstant().toString(), user.displayName()));
    }

    @GetMapping("/api/v1/attachments/{id}/content")
    @Transactional(readOnly = true)
    public ContentDto content(@PathVariable UUID id) {
        CurrentUserHolder.require(Permissions.ATTACHMENT_READ);
        return jdbc.sql("select file_name, content_type, content from attachment where id = :id").param("id", id)
                .query((rs, n) -> new ContentDto(rs.getString("file_name"), rs.getString("content_type"),
                        Base64.getEncoder().encodeToString(rs.getBytes("content")))).optional()
                .orElseThrow(() -> new NotFoundException("Anexo não encontrado."));
    }

    @DeleteMapping("/api/v1/attachments/{id}")
    @Transactional
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        CurrentUser user = CurrentUserHolder.require(Permissions.ATTACHMENT_UPDATE);
        record Owner(String entity, UUID id, String label) { }
        Owner o = jdbc.sql("select owner_entity, owner_id, kind || ' — ' || file_name as label from attachment where id = :id").param("id", id)
                .query((rs, n) -> new Owner(rs.getString(1), rs.getObject(2, UUID.class), rs.getString(3))).optional()
                .orElseThrow(() -> new NotFoundException("Anexo não encontrado."));
        jdbc.sql("delete from attachment where id = :id").param("id", id).update();
        audit.record(new AuditEntry(user.username(), "ATTACHMENT_REMOVED", o.entity(), o.id().toString(), 0, null,
                Map.of("anexo", new AuditEntry.Change(o.label(), null)), CorrelationId.current()));
        return ResponseEntity.noContent().build();
    }
}
