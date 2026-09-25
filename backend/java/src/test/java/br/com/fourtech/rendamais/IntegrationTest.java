package br.com.fourtech.rendamais;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Base dos testes com PostgreSQL real. Usa o banco indicado em RENDA_TEST_JDBC_URL (e RENDA_TEST_DB_USER /
 * RENDA_TEST_DB_PASSWORD) quando definido; caso contrário sobe um PostgreSQL 16 via Testcontainers (exige Docker).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class IntegrationTest {

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
