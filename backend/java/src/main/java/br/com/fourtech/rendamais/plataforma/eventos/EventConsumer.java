package br.com.fourtech.rendamais.plataforma.eventos;

/**
 * Consumidor de eventos da outbox. {@link #handle} roda na transação que também registra o consumo, então cada
 * evento é processado uma única vez por consumidor, mesmo que seja entregue de novo.
 */
public interface EventConsumer {

    /** Nome estável, usado no registro de consumo. */
    String name();

    boolean accepts(String eventType);

    void handle(DomainEvent event);
}
