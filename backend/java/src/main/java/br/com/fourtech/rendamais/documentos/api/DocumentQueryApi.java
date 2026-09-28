package br.com.fourtech.rendamais.documentos.api;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Consulta pública das notas de saída para outros módulos (fiscal: receita por competência, IND-005). Só notas ativas
 * (não canceladas); lê na transação do chamador e não confere permissão — quem chama confere a sua.
 */
public interface DocumentQueryApi {

    /** Receita de uma competência pelas linhas das notas: produto, serviço e quantas notas. */
    record Revenue(long productCents, long serviceCents, int documents) {
        public long totalCents() {
            return productCents + serviceCents;
        }
    }

    /** Nota ativa da competência, com o tipo (PRODUTO, SERVICO ou MISTO) e a parte de produto e de serviço. */
    record DocumentRef(UUID id, String code, String kind, String series, String number, LocalDate issueDate, String customerCode,
                       String customerName, String orderCode, long productCents, long serviceCents, long totalCents) { }

    /** Receita das competências de {@code from} a {@code to} (inclusive) que têm nota ativa. */
    Map<YearMonth, Revenue> revenue(YearMonth from, YearMonth to);

    /** Notas ativas da competência, pela data de emissão. */
    List<DocumentRef> documents(YearMonth competence);
}
