package br.com.fourtech.rendamais;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.acesso.application.SessionService;
import br.com.fourtech.rendamais.acesso.application.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Base dos testes com PostgreSQL real. Usa o banco indicado em RENDA_TEST_JDBC_URL (e RENDA_TEST_DB_USER /
 * RENDA_TEST_DB_PASSWORD) quando definido; caso contrário sobe um PostgreSQL 16 via Testcontainers (exige Docker).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class IntegrationTest {

    /** Administrador e usuário de consulta usados pelos testes de API. */
    protected static final String ADMIN = "admin.teste";
    protected static final String CONSULTA = "consulta.teste";
    protected static final String SENHA = "senha-de-teste-123";

    @Autowired
    protected UserService userService;

    @Autowired
    protected SessionService sessionService;

    @Autowired
    protected JdbcClient jdbc;

    /** Garante o usuário (ativo, desbloqueado, com a senha de teste) e abre uma sessão para ele. */
    protected String login(String username, Profile profile) {
        boolean exists = jdbc.sql("select exists(select 1 from app_user where username = :u)").param("u", username)
                .query(Boolean.class).single();
        if (!exists) {
            userService.create(username, username, profile.name(), SENHA, "teste");
        }
        jdbc.sql("update app_user set active = true, failed_attempts = 0, locked_until = null, profile = :p where username = :u")
                .param("p", profile.name()).param("u", username).update();
        var result = sessionService.login(username, SENHA);
        if (result instanceof SessionService.LoginResult.Success s) {
            return s.token();
        }
        throw new IllegalStateException("login de teste falhou: " + result);
    }

    /**
     * Apaga documentos e vínculos (Sprint 6), recebimentos, estornos, movimentos e contas criadas nos testes (Sprint 5) e pedidos, propostas, projetos,
     * equipamentos e títulos (Sprint 4), que referenciam parceiros e itens.
     */
    protected void limpaDocumentos() {
        // Fiscal (Sprint 7): competências, simulações, conferências, fechamentos e revisões criadas nos testes.
        jdbc.sql("delete from tax_period_closure").update();
        jdbc.sql("delete from accountant_confirmation").update();
        jdbc.sql("delete from tax_simulation").update();
        jdbc.sql("delete from tax_period").update();
        jdbc.sql("delete from tax_parameter_revision where revision > 1").update();
        jdbc.sql("delete from document_title_invoicing").update();
        jdbc.sql("delete from document_title_link").update();
        jdbc.sql("delete from document_line").update();
        jdbc.sql("delete from business_document").update();
        jdbc.sql("delete from settlement_reversal").update();
        jdbc.sql("delete from cash_movement").update();
        jdbc.sql("delete from transfer").update();
        jdbc.sql("delete from settlement_allocation").update();
        jdbc.sql("delete from settlement").update();
        jdbc.sql("delete from bank_account where created_by <> 'sistema'").update();
        jdbc.sql("update bank_account set status = 'ATIVO'").update();
        jdbc.sql("delete from financial_title").update();
        // Contas a pagar (Sprint 8): categorias criadas nos testes; as semeadas voltam ao estado original.
        jdbc.sql("delete from financial_category where created_by <> 'sistema'").update();
        jdbc.sql("update financial_category set status = 'ATIVO'").update();
        jdbc.sql("delete from equipment").update();
        jdbc.sql("delete from project").update();
        jdbc.sql("delete from sales_order").update();
        jdbc.sql("delete from proposal").update();
    }

    protected String adminToken() {
        return login(ADMIN, Profile.ADMINISTRADOR);
    }

    private static PostgreSQLContainer container;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("RENDA_TEST_JDBC_URL");
        if (url != null && !url.isBlank()) {
            registry.add("spring.datasource.url", () -> url);
            registry.add("spring.datasource.username", () -> env("RENDA_TEST_DB_USER", "renda"));
            registry.add("spring.datasource.password", () -> env("RENDA_TEST_DB_PASSWORD", "renda"));
        } else {
            if (container == null) {
                container = new PostgreSQLContainer("postgres:16-alpine");
                container.start();
            }
            registry.add("spring.datasource.url", container::getJdbcUrl);
            registry.add("spring.datasource.username", container::getUsername);
            registry.add("spring.datasource.password", container::getPassword);
        }
        registry.add("spring.flyway.clean-disabled", () -> "false");
        // Os testes chamam a entrega da outbox diretamente; o agendamento automático ficaria disputando os mesmos eventos.
        registry.add("renda.outbox.poll-ms", () -> "86400000");
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? fallback : v;
    }
}
