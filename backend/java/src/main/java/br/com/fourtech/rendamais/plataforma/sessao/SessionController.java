package br.com.fourtech.rendamais.plataforma.sessao;

import br.com.fourtech.rendamais.acesso.api.CurrentUser;
import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Profile;
import br.com.fourtech.rendamais.acesso.application.SessionService;
import br.com.fourtech.rendamais.acesso.application.SessionService.LoginResult;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/**
 * Sessão do usuário (ADR-005). POST entra; GET diz quem é e o que pode; DELETE sai.
 * O token só aparece na resposta do login; o app do Mac o guarda no processo principal.
 */
@RestController
@RequestMapping("/api/v1/session")
class SessionController {

    private final SessionApplicationService service;

    SessionController(SessionApplicationService service) {
        this.service = service;
    }

    record LoginRequest(String username, String password) { }

    record UserInfo(String id, String username, String displayName, String profile, String profileLabel, List<String> permissions) {
        static UserInfo of(CurrentUser u) {
            Profile p = u.profile();
            return new UserInfo(u.id().toString(), u.username(), u.displayName(), p.name(), p.label(), sorted(p.permissions()));
        }
    }

    record LoginResponse(String token, Instant expiresAt, long idleTimeoutSeconds, UserInfo user) { }

    record PasswordChange(String currentPassword, String newPassword) { }

    @PostMapping
    LoginResponse login(@RequestBody LoginRequest body) {
        LoginResult.Success s = service.login(body.username(), body.password());
        return new LoginResponse(s.token(), s.expiresAt(), SessionService.IDLE_TIMEOUT.toSeconds(), UserInfo.of(s.user()));
    }

    @GetMapping
    UserInfo me() {
        return UserInfo.of(CurrentUserHolder.get());
    }

    /** Sair ou bloquear a tela: a sessão deixa de valer na hora. */
    @DeleteMapping
    ResponseEntity<Void> logout(@RequestParam(value = "reason", defaultValue = "SAIR") String reason) {
        service.logout("BLOQUEIO".equals(reason) ? "BLOQUEIO" : "SAIR");
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password")
    ResponseEntity<Void> changePassword(@RequestBody PasswordChange body) {
        service.changeOwnPassword(body.currentPassword(), body.newPassword());
        return ResponseEntity.noContent().build();
    }

    private static List<String> sorted(Set<String> s) {
        return s.stream().sorted().toList();
    }
}
