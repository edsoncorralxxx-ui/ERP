package br.com.fourtech.rendamais.plataforma.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Estado do servidor para o rodapé do aplicativo. Não expõe detalhes de infraestrutura. */
@RestController
class StatusController {

    /** Fuso da empresa: as datas de negócio (recebimento, emissão) são conferidas nele. */
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("America/Sao_Paulo");

    private final JdbcClient jdbc;
    private final String serverVersion;
    private final Clock clock;

    StatusController(JdbcClient jdbc, @Value("${renda.version:desconhecida}") String serverVersion, Clock clock) {
        this.jdbc = jdbc;
        this.serverVersion = serverVersion;
        this.clock = clock;
    }

    /** {@code businessDate}: o dia de hoje no fuso da empresa, que o app usa como sugestão nos campos de data. */
    record Status(String status, String apiVersion, String serverVersion, String database, Instant serverTime,
                  LocalDate businessDate) { }

    @GetMapping("/api/v1/status")
    Status status() {
        String database;
        try {
            jdbc.sql("select 1").query(Integer.class).single();
            database = "UP";
        } catch (RuntimeException e) {
            database = "DOWN";
        }
        return new Status("UP".equals(database) ? "UP" : "DEGRADED", "v1", serverVersion, database, clock.instant(),
                LocalDate.now(clock.withZone(BUSINESS_ZONE)));
    }
}
