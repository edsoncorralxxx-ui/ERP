package br.com.fourtech.rendamais.plataforma;

import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Relógio do servidor. Com {@code RENDA_DEMO_DATE=AAAA-MM-DDTHH:MM} (horário de Brasília), o relógio começa nesse instante
 * e anda normalmente: é o "hoje" da demonstração com os dados do mock (24/09/2026).
 */
@Configuration
class ClockConfig {
    @Bean
    Clock clock(@Value("${renda.demo.date:}") String demoDate) {
        Clock real = Clock.systemUTC();
        if (demoDate == null || demoDate.isBlank()) return real;
        LocalDateTime alvo = LocalDateTime.parse(demoDate.strip());
        Duration desvio = Duration.between(real.instant(), alvo.atZone(ZoneId.of("America/Sao_Paulo")).toInstant());
        LoggerFactory.getLogger(ClockConfig.class).warn("Relógio de demonstração: o servidor considera agora {} (RENDA_DEMO_DATE)", alvo);
        return Clock.offset(real, desvio);
    }
}
