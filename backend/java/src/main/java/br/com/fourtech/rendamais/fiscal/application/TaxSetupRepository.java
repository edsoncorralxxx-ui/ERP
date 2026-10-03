package br.com.fourtech.rendamais.fiscal.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos dados da empresa no Simples, das atividades, da opção IBS/CBS e do histórico de receita. */
public interface TaxSetupRepository {

    /** Dados da empresa no Simples (uma linha); limites em centavos, excesso tolerado e aviso como fração. */
    record Profile(String regime, LocalDate optedSince, String cnaeMain, String cnaeSecondary, String revenueRecognition,
                   String nfseIssuer, long annualLimitCents, long sublimitCents, BigDecimal tolerance, BigDecimal alertThreshold,
                   long version, Instant updatedAt, String updatedBy) { }

    record Activity(UUID id, int position, String name, String framing, String annex, String taxes, String status, long version,
                    Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) { }

    record IbsCbsOption(UUID id, String period, String choice, LocalDate deadline, LocalDate withdrawalUntil, String notes,
                        Instant createdAt, String createdBy) { }

    /** Receita de uma competência anterior ao Renda+, por anexo (índice 0 = Anexo I). */
    record History(YearMonth competence, long[] annexCents, String source, String informedBy, String notes, long version,
                   Instant createdAt, String createdBy, Instant updatedAt, String updatedBy) {
        public long totalCents() {
            long t = 0;
            for (long c : annexCents) t += c;
            return t;
        }
    }

    Profile profile();

    void updateProfile(Profile p, long expectedVersion);

    List<Activity> activities();

    Optional<Activity> activity(UUID id);

    void insertActivity(Activity a);

    void updateActivity(Activity a, long expectedVersion);

    /** Opções registradas, da mais recente para a mais antiga. */
    List<IbsCbsOption> ibsCbsOptions();

    void insertIbsCbsOption(IbsCbsOption o);

    Map<YearMonth, History> history(YearMonth from, YearMonth to);

    /** Competência do histórico bloqueada para alteração. */
    Optional<History> historyForUpdate(YearMonth competence);

    void insertHistory(History h);

    void updateHistory(History h, long expectedVersion);

    /** Arquivo já carregado com o mesmo conteúdo. */
    boolean importExists(String hash);

    void insertImport(UUID id, String hash, String fileName, int months, Instant at, String by);
}
