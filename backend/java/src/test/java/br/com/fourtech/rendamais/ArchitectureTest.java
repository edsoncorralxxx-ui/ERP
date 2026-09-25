package br.com.fourtech.rendamais;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * Garante no build as fronteiras definidas no B01 (docs/backend/b01/modulos.json, ADR-016):
 * cada módulo só usa os módulos dos quais declara depender.
 */
class ArchitectureTest {

    private static final String BASE = "br.com.fourtech.rendamais";
    private static Map<String, Set<String>> dependsOn;
    private static JavaClasses classes;

    @BeforeAll
    static void load() throws Exception {
        Path json = Path.of("../../docs/backend/b01/modulos.json");
        assertThat(json).as("catálogo de módulos do B01").exists();
        JsonNode root = JsonMapper.builder().build().readTree(Files.readString(json));
        dependsOn = new HashMap<>();
        for (JsonNode m : root.get("modulos")) {
            Set<String> deps = new HashSet<>();
            m.get("dependsOn").forEach(d -> deps.add(d.asString()));
            dependsOn.put(m.get("id").asString(), deps);
        }
        classes = new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages(BASE);
    }

    @Test
    void pacotesDePrimeiroNivelSaoModulosDeclarados() {
        Set<String> found = new HashSet<>();
        classes.forEach(c -> {
            String rest = c.getPackageName().substring(BASE.length());
            if (rest.startsWith(".")) {
                found.add(rest.substring(1).split("\\.")[0]);
            }
        });
        assertThat(dependsOn.keySet()).containsAll(found);
    }

    @Test
    void moduloSoDependeDosModulosDeclarados() {
        List<String> violations = new ArrayList<>();
        for (String module : dependsOn.keySet()) {
            for (String other : dependsOn.keySet()) {
                if (other.equals(module) || dependsOn.get(module).contains(other)) {
                    continue;
                }
                try {
                    noClasses().that().resideInAPackage(BASE + "." + module + "..")
                            .should().dependOnClassesThat().resideInAPackage(BASE + "." + other + "..")
                            .allowEmptyShould(true)
                            .check(classes);
                } catch (AssertionError e) {
                    violations.add(module + " → " + other + ": " + e.getMessage());
                }
            }
        }
        assertThat(violations).as("dependências proibidas entre módulos").isEmpty();
    }

    @Test
    void kernelEJavaPuro() {
        noClasses().that().resideInAPackage(BASE + ".kernel..")
                .should().dependOnClassesThat().resideInAnyPackage("org.springframework..", "jakarta..", "java.sql..", "tools.jackson..")
                .check(classes);
    }

    @Test
    void dominioNaoDependeDeFrameworkNemDeBanco() {
        noClasses().that().resideInAPackage("..domain..")
                .should().dependOnClassesThat().resideInAnyPackage("org.springframework..", "jakarta.persistence..", "java.sql..", "tools.jackson..")
                .allowEmptyShould(true)
                .check(classes);
    }
}
