package br.com.fourtech.rendamais.documentos.application;

import br.com.fourtech.rendamais.financeiro.api.TitleCancellationGuard;
import br.com.fourtech.rendamais.kernel.InvalidStateException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Parcela com documento vinculado não é cancelada (PD-003, doc 13 §3: "nenhum documento vinculado"). Bloqueia o
 * faturado das parcelas antes de conferir: um vínculo simultâneo ou termina antes (e o cancelamento é recusado) ou
 * espera e encontra a parcela já cancelada.
 */
@Component
class InvoicedTitleGuard implements TitleCancellationGuard {

    private final DocumentRepository repository;

    InvoicedTitleGuard(DocumentRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void checkCancellable(List<Cancelling> titles) {
        Map<UUID, Long> invoiced = repository.lockInvoicing(titles.stream()
                .collect(Collectors.toMap(Cancelling::titleId, Cancelling::originalCents)));
        List<Cancelling> blocked = titles.stream().filter(t -> invoiced.getOrDefault(t.titleId(), 0L) > 0).toList();
        if (blocked.isEmpty()) return;
        Map<UUID, List<DocumentRepository.TitleLink>> links = repository.activeLinks(blocked.stream().map(Cancelling::titleId).toList())
                .stream().collect(Collectors.groupingBy(DocumentRepository.TitleLink::titleId));
        String detail = blocked.stream().map(t -> "A parcela " + t.code() + " está vinculada " + links.getOrDefault(t.titleId(), List.of())
                        .stream().map(l -> "à nota nº " + l.number() + " (" + l.documentCode() + ")").collect(Collectors.joining(" e ")))
                .collect(Collectors.joining("; "));
        throw new InvalidStateException(detail + "; cancele a nota ou desfaça o vínculo antes.");
    }
}
