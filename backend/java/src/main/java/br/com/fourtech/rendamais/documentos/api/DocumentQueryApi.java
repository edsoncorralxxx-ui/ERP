package br.com.fourtech.rendamais.documentos.api;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Consulta pública das notas de saída para outros módulos (fiscal: receita por competência e por anexo, IND-005). Só
 * notas ativas (não canceladas); lê na transação do chamador e não confere permissão — quem chama confere a sua.
 */
public interface DocumentQueryApi {

    /** Receita de uma competência pelas linhas das notas, por anexo do Simples (I a V), e quantas notas. */
    record Revenue(Map<String, Long> byAnnex, int documents) {
        public Revenue {
            byAnnex = Map.copyOf(byAnnex);
        }

        public long totalCents() {
            return byAnnex.values().stream().mapToLong(Long::longValue).sum();
        }

        public long cents(String annex) {
            return byAnnex.getOrDefault(annex, 0L);
        }
    }

    /**
     * Parte de uma nota ativa num anexo: as linhas da nota daquele anexo somadas. {@code kind} é o tipo da nota (PRODUTO,
     * SERVICO ou MISTO); {@code defaultLines} conta as linhas com o anexo padrão (item sem classificação);
     * {@code authorization} é AUTORIZADA ou PENDENTE.
     */
    record AnnexPart(UUID documentId, String code, String kind, String series, String number, LocalDate issueDate, String customerCode,
                     String customerName, String orderCode, String description, String annex, long cents, int defaultLines,
                     String authorization, long version) { }

    /** Receita das competências de {@code from} a {@code to} (inclusive) que têm nota ativa. */
    Map<YearMonth, Revenue> revenue(YearMonth from, YearMonth to);

    /** Notas ativas da competência por anexo, pela data de emissão. */
    List<AnnexPart> parts(YearMonth competence);
}
