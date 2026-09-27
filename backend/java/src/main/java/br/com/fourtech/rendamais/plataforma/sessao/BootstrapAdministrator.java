package br.com.fourtech.rendamais.plataforma.sessao;

import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.acesso.application.UserService;
import br.com.fourtech.rendamais.acesso.domain.User;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Primeiro administrador (ADR-005): criado na inicialização a partir de RENDA_BOOTSTRAP_ADMIN_USER e
 * RENDA_BOOTSTRAP_ADMIN_PASSWORD, somente quando ainda não existe nenhum usuário. Não há senha padrão.
 */
@Component
class BootstrapAdministrator implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BootstrapAdministrator.class);
    static final String ACTOR = "instalacao";

    private final UserService users;
    private final AuditTrail audit;
    private final String username;
    private final String password;

    BootstrapAdministrator(UserService users, AuditTrail audit,
                           @Value("${renda.bootstrap-admin.username:}") String username,
                           @Value("${renda.bootstrap-admin.password:}") String password) {
        this.users = users;
        this.audit = audit;
        this.username = username;
        this.password = password;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (users.count() > 0) {
            return;
        }
        if (username.isBlank() || password.isBlank()) {
            log.warn("Nenhum usuário cadastrado. Defina RENDA_BOOTSTRAP_ADMIN_USER e RENDA_BOOTSTRAP_ADMIN_PASSWORD e reinicie o "
                    + "servidor para criar o primeiro administrador.");
            return;
        }
        User admin = users.create(username, "Administrador", Profile.ADMINISTRADOR.name(), password, ACTOR);
        audit.record(new AuditEntry(ACTOR, "USER_CREATED", "app_user", admin.id().toString(), admin.version(), null,
                Map.of("username", new AuditEntry.Change(null, admin.username()),
                        "profile", new AuditEntry.Change(null, admin.profile().name())), null));
        log.info("Primeiro administrador criado: {}", admin.username());
    }
}
