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
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return v == null || v.isBlank() ? fallback : v;
    }
}
