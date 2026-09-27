package br.com.fourtech.rendamais.plataforma.eventos;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Liga a entrega periódica da outbox. */
@Configuration
@EnableScheduling
class SchedulingConfig { }
