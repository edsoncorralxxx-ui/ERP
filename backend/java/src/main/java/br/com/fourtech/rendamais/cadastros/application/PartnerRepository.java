package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.domain.Partner;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos parceiros (clientes e fornecedores). */
public interface PartnerRepository {

    /**
     * Linha da lista de clientes ou de fornecedores; {@code status} é a situação do papel listado. {@code categories} e
     * {@code leadTimeDays} só interessam à lista de fornecedores.
     */
    record Summary(UUID id, String code, String legalName, String tradeName, String cnpj, String city, String state,
                   int units, Partner.Status status, long version, String categories, Integer leadTimeDays) { }

    /** Próximo código do parceiro pelo papel com que ele nasce: C00001 (cliente) ou F00001 (fornecedor). */
    String nextCode(Partner.Role role);

    void insert(Partner partner);

    /** Grava a nova versão (com papéis, unidades, contatos e categorias) se a versão armazenada ainda for {@code expectedVersion}. */
    boolean update(Partner partner, long expectedVersion);

    Optional<Partner> findById(UUID id);

    Optional<Partner> findByIdForUpdate(UUID id);

    /** Outro parceiro com o mesmo CNPJ, com qualquer papel. */
    Optional<UUID> findIdByCnpj(String cnpj, UUID exceptId);

    /** Busca por código, razão social, nome fantasia ou CNPJ entre os parceiros com o papel; {@code status} nulo traz todos. */
    List<Summary> list(String search, Partner.Role role, Partner.Status status, int limit);
}
