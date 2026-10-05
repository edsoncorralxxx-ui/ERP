package br.com.fourtech.rendamais.plataforma.demo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Carga de demonstração (Sprint 13): com {@code RENDA_DEMO=recarregar}, ao subir o servidor apaga os dados de negócio e
 * carrega os dados do mock Renda+ ERP MOCK ({@code demo/carga-mock.sql}, gerado por tools/demo/carga_mock.py). Ficam os
 * usuários e as sessões, o histórico das migrações e as tabelas de referência das migrações (etapas do funil, parâmetros
 * do Simples Nacional, modelos de obrigação, categorias financeiras, contas, atividades e perfil fiscal da empresa).
 * Sem a variável, não faz nada. Tudo numa transação: se a carga falhar, o banco fica como estava.
 */
@Component
class DemoDataLoader implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoDataLoader.class);

    /** Tabelas que a carga não apaga. */
    static final Set<String> FICAM = Set.of("flyway_schema_history", "app_user", "user_session", "opportunity_stage", "reference_table",
            "tax_parameter_revision", "tax_obligation_template", "financial_category", "tax_activity",
            "tax_company_profile", "company_profile");

    private final JdbcClient jdbc;
    private final DataSource dataSource;
    private final TransactionTemplate tx;
    private final String modo;

    DemoDataLoader(JdbcClient jdbc, DataSource dataSource, TransactionTemplate tx, @Value("${renda.demo:}") String modo) {
        this.jdbc = jdbc;
        this.dataSource = dataSource;
        this.tx = tx;
        this.modo = modo == null ? "" : modo.strip();
    }

    @Override
    public void run(ApplicationArguments args) {
        if (modo.isEmpty()) return;
        if (!modo.equals("recarregar")) {
            log.warn("RENDA_DEMO={} ignorado: o único valor aceito é 'recarregar'", modo);
            return;
        }
        tx.executeWithoutResult(s -> {
            List<String> tabelas = jdbc.sql("select tablename from pg_tables where schemaname = current_schema() order by tablename")
                    .query(String.class).list().stream().filter(t -> !FICAM.contains(t)).toList();
            jdbc.sql("truncate table " + tabelas.stream().map(t -> "\"" + t + "\"").collect(Collectors.joining(", ")) + " restart identity")
                    .update();
            for (String seq : jdbc.sql("select sequence_name from information_schema.sequences where sequence_schema = current_schema()")
                    .query(String.class).list()) {
                jdbc.sql("select setval('\"" + seq + "\"', 1, false)").query(Long.class).single();
            }
            new ResourceDatabasePopulator(new ClassPathResource("demo/carga-mock.sql")).execute(dataSource);
            log.info("Carga de demonstração do mock aplicada: {} tabelas apagadas e recarregadas", tabelas.size());
        });
    }
}
