package br.com.fourtech.rendamais;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.yaml.snakeyaml.Yaml;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import static org.assertj.core.api.Assertions.assertThat;

/** Toda rota da API está no contrato docs/backend/api/openapi.yaml, com o mesmo método, e vice-versa (DoD item 4). */
class OpenApiContractTest extends IntegrationTest {

    @Autowired
    RequestMappingHandlerMapping mapping;

    @Test
    @SuppressWarnings("unchecked")
    void rotasDoServidorEDoContratoSaoAsMesmas() throws Exception {
        Map<String, Object> doc = new Yaml().load(Files.readString(Path.of("../../docs/backend/api/openapi.yaml")));
        Set<String> documented = new TreeSet<>();
        ((Map<String, Map<String, Object>>) doc.get("paths")).forEach((path, ops) -> ops.keySet().stream()
                .filter(k -> Set.of("get", "post", "put", "delete", "patch").contains(k))
                .forEach(m -> documented.add(m.toUpperCase(Locale.ROOT) + " " + path)));

        Set<String> served = new TreeSet<>();
        mapping.getHandlerMethods().forEach((info, handler) -> {
            if (info.getPathPatternsCondition() == null) return;
            info.getPathPatternsCondition().getPatternValues().stream().filter(p -> p.startsWith("/api/"))
                    .forEach(p -> info.getMethodsCondition().getMethods().forEach(m -> served.add(m.name() + " " + p)));
        });
        assertThat(served).as("rotas do servidor").isNotEmpty();
        assertThat(documented).isEqualTo(served);
    }
}
