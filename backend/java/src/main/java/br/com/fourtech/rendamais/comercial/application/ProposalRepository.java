package br.com.fourtech.rendamais.comercial.application;

import br.com.fourtech.rendamais.comercial.domain.Proposal;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência das propostas com as suas revisões e linhas. */
public interface ProposalRepository {

    record Summary(Proposal proposal, String customerCode, String customerName) { }

    /** Próximo número de proposta: PR00001. */
    String nextCode();

    void insert(Proposal proposal);

    /** Regrava a proposta com todas as revisões se a versão armazenada ainda for {@code expectedVersion}. */
    boolean update(Proposal proposal, long expectedVersion);

    Optional<Summary> findById(UUID id);

    Optional<Proposal> findByIdForUpdate(UUID id);

    List<Summary> list(String search, Proposal.Status status, int limit);
}
