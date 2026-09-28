package br.com.fourtech.rendamais.documentos.application;

import br.com.fourtech.rendamais.documentos.domain.BusinessDocument;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos documentos, dos vínculos e do faturado de cada parcela. */
public interface DocumentRepository {

    /** Parcela de um vínculo, com o código e a descrição do título. */
    record TitleRef(UUID titleId, String code, String label) { }

    /** Documento com o nome do parceiro, o código do projeto classificado, o pedido de origem e as parcelas dos vínculos. */
    record Summary(BusinessDocument document, String partnerCode, String partnerName, String projectCode, String orderCode,
                   Map<UUID, TitleRef> titles) { }

    /** Vínculo visto pela parcela: documento e valor. */
    record TitleLink(UUID titleId, UUID documentId, String documentCode, String series, String number, java.time.LocalDate issueDate,
                     long amountCents) { }

    /** Filtro de situação da lista: ACTIVE, CANCELLED ou ALL. */
    enum Filter { ACTIVE, CANCELLED, ALL }

    /** Próximo código interno: DF00001. */
    String nextCode();

    void insert(BusinessDocument document);

    /** Grava o cabeçalho (situação, classificação, versão) e os vínculos novos ou desfeitos; confere a versão lida. */
    void update(BusinessDocument document, long expectedVersion);

    /** Documento bloqueado para alteração. */
    Optional<BusinessDocument> findForUpdate(UUID id);

    Optional<Summary> find(UUID id);

    /** Busca por código, número ou parceiro; filtros nulos não filtram. */
    List<Summary> list(String search, Filter filter, YearMonth competence, UUID partnerId, int limit);

    /** Código do documento ativo com o mesmo número (direção, parceiro, série e número). */
    Optional<String> findActiveNumber(BusinessDocument.Direction direction, UUID partnerId, String series, String number);

    /**
     * Garante a linha de faturado de cada parcela (limite = valor original) e bloqueia todas em ordem crescente de id;
     * devolve o faturado atual de cada uma. Quem chega depois espera e vê o faturado já atualizado.
     */
    Map<UUID, Long> lockInvoicing(Map<UUID, Long> limitsByTitle);

    void setInvoiced(UUID titleId, long invoicedCents);

    /** Faturado atual das parcelas (zero para as que nunca tiveram vínculo). */
    Map<UUID, Long> invoiced(List<UUID> titleIds);

    /** Vínculos ativos das parcelas, de documentos ativos. */
    List<TitleLink> activeLinks(List<UUID> titleIds);
}
