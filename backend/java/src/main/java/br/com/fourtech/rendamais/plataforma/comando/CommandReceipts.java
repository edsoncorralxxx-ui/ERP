package br.com.fourtech.rendamais.plataforma.comando;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

/**
 * Recibo de comando (US-205): o cliente manda uma chave de idempotência; repetir o comando com a mesma chave devolve
 * o mesmo resultado em vez de criar outro registro — inclusive quando a resposta anterior se perdeu na rede.
 *
 * <p>Uso, dentro da transação do comando: {@link #claim} antes de executar; se devolver um id, o comando já foi feito
 * e basta reler o registro; se não, executar e chamar {@link #complete}. A chave é reservada com um insert, então
 * duas tentativas simultâneas se serializam no banco: a segunda espera a primeira e enxerga o resultado dela.
 */
@Component
public class CommandReceipts {

    private final JdbcClient jdbc;
    private final JsonMapper json;

    public CommandReceipts(JdbcClient jdbc, JsonMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    /** Chave obrigatória nos comandos de criação: de 8 a 100 letras, números, hífen ou sublinhado. */
    public static String requireKey(String key) {
        if (key == null || !key.strip().matches("[A-Za-z0-9_-]{8,100}")) {
            throw new RuleViolationException("IDEMPOTENCY_KEY_REQUIRED",
                    "Envie o cabeçalho Idempotency-Key (8 a 100 caracteres) para que o comando não se repita por engano.",
                    List.of(new FieldIssue("Idempotency-Key", "Obrigatório.")));
        }
        return key.strip();
    }

    /**
     * Reserva a chave. Vazio: comando novo, pode executar. Presente: o comando já foi executado e este é o id
     * do registro criado. Mesma chave com outro conteúdo é rejeitada.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<String> claim(String actor, String key, String command, Object request) {
        String hash = hash(request);
        int inserted = jdbc.sql("""
                insert into command_receipt (actor, idempotency_key, command, request_hash)
                values (:actor, :key, :command, :hash) on conflict do nothing
                """)
                .param("actor", actor).param("key", key).param("command", command).param("hash", hash).update();
        if (inserted == 1) {
            return Optional.empty();
        }
        record Existing(String command, String requestHash, String resourceId) { }
        Existing e = jdbc.sql("select command, request_hash, resource_id from command_receipt where actor = :actor and idempotency_key = :key")
                .param("actor", actor).param("key", key)
                .query((rs, n) -> new Existing(rs.getString(1), rs.getString(2), rs.getString(3))).single();
        if (!e.command().equals(command) || !e.requestHash().equals(hash)) {
            throw new RuleViolationException("IDEMPOTENCY_KEY_REUSED",
                    "Esta chave de idempotência já foi usada com outro conteúdo. Gere uma nova chave para um novo comando.",
                    List.of(new FieldIssue("Idempotency-Key", "Reutilizada.")));
        }
        return Optional.ofNullable(e.resourceId());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void complete(String actor, String key, String resourceId) {
        jdbc.sql("update command_receipt set resource_id = :id where actor = :actor and idempotency_key = :key")
                .param("id", resourceId).param("actor", actor).param("key", key).update();
    }

    private String hash(Object request) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(request).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
