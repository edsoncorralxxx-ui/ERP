package br.com.fourtech.rendamais.plataforma.eventos;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Evento gravado na outbox, como os consumidores o recebem. */
public record DomainEvent(UUID id, String type, String aggregateType, String aggregateId, Map<String, Object> payload,
                          Instant occurredAt, String actor, String correlationId) { }
