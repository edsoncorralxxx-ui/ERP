package br.com.fourtech.rendamais.plataforma.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

/** Estado do servidor para o rodapé do aplicativo. Não expõe detalhes de infraestrutura. */
@RestController
class StatusController {

    private final JdbcClient jdbc;
    private final String serverVersion;

    StatusController(JdbcClient jdbc, @Value("${renda.version:desconhecida}") String serverVersion) {
        this.jdbc = jdbc;
        this.serverVersion = serverVersion;
    }

    record Status(String status, String apiVersion, String serverVersion, String database, Instant serverTime) { }

    @GetMapping("/api/v1/status")
    Status status() {
        String database;
        try {
            jdbc.sql("select 1").query(Integer.class).single();
            database = "UP";
        } catch (RuntimeException e) {
            database = "DOWN";
        }
        return new Status("UP".equals(database) ? "UP" : "DEGRADED", "v1", serverVersion, database, Instant.now());
    }
}
