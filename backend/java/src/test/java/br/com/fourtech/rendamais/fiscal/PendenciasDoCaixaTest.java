package br.com.fourtech.rendamais.fiscal;

import br.com.fourtech.rendamais.IntegrationTest;
import br.com.fourtech.rendamais.financeiro.api.CashFlowPendingSource;
import br.com.fourtech.rendamais.fiscal.application.TaxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.lang.reflect.Constructor;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Sprint 9: competência encerrada, a partir do início da receita, sem guia DAS vira pendência do fluxo de
 * caixa no mês do vencimento do DAS (o seguinte); a conferida não. Usa um início de receita anterior ao padrão.
 */
class PendenciasDoCaixaTest extends IntegrationTest {

    @Autowired
    TaxRepository repository;

    @BeforeEach
    void limpa() {
        limpaDocumentos();
    }

    private CashFlowPendingSource fonte(String inicio) throws Exception {
        Class<?> c = Class.forName("br.com.fourtech.rendamais.fiscal.application.TaxCashFlowPendings");
        Constructor<?> k = c.getDeclaredConstructor(TaxRepository.class, String.class);
        k.setAccessible(true);
        return (CashFlowPendingSource) k.newInstance(repository, inicio);
    }

    @Test
    void competenciaEncerradaSemConferenciaEPendenciaNoMesDoVencimento() throws Exception {
        // Julho/2026 com guia; junho e agosto não. Hoje: 30/09/2026 (setembro ainda aberto, não é pendência).
        TaxRepository.Period julho = repository.lockOrCreate(YearMonth.of(2026, 7), Instant.now(), "teste");
        repository.insertGuide(new TaxRepository.DasGuide(UUID.randomUUID(), julho.id(), 1, null, 100_000, 0, 0, LocalDate.of(2026, 8, 20),
                null, null, null, Instant.now(), "teste"));
        var p = fonte("2026-06").pendingBetween(YearMonth.of(2026, 5), YearMonth.of(2026, 12), LocalDate.of(2026, 9, 30));
        assertThat(p).extracting(CashFlowPendingSource.Pending::reference).containsExactly("2026-06", "2026-08");
        assertThat(p).extracting(CashFlowPendingSource.Pending::month).containsExactly(YearMonth.of(2026, 7), YearMonth.of(2026, 9));
        assertThat(p.getFirst().category()).isEqualTo("IMPOSTOS_SIMPLES");
        assertThat(p.getFirst().message()).contains("06/2026", "sem guia DAS");
        // Antes do início da receita não há pendência; horizonte sem competência encerrada também não.
        assertThat(fonte("2026-09").pendingBetween(YearMonth.of(2026, 5), YearMonth.of(2026, 12), LocalDate.of(2026, 9, 30))).isEmpty();
        assertThat(fonte("2026-06").pendingBetween(YearMonth.of(2026, 5), YearMonth.of(2026, 6), LocalDate.of(2026, 9, 30))).isEmpty();
    }
}
