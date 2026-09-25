package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.domain.Partner;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos parceiros (clientes nesta fase). */
public interface PartnerRepository {

    /** Linha da lista de clientes. */
    record Summary(UUID id, String code, String legalName, String tradeName, String cnpj, String city, String state,
                   int units, Partner.Status status, long version) { }

    String nextCustomerCode();

    void insert(Partner partner);

    /** Grava a nova versão (com unidades e contatos) se a versão armazenada ainda for {@code expectedVersion}. */
    boolean update(Partner partner, long expectedVersion);

    Optional<Partner> findById(UUID id);

    Optional<Partner> findByIdForUpdate(UUID id);

    /** Outro parceiro com o mesmo CNPJ (para a mensagem de duplicidade). */
    Optional<Summary> findByCnpj(String cnpj, UUID exceptId);

    /** Busca por código, razão social, nome fantasia ou CNPJ; {@code status} nulo traz todos. */
    List<Summary> list(String search, Partner.Status status, int limit);
}
