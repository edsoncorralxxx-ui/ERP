package br.com.fourtech.rendamais.plataforma.sessao;

import br.com.fourtech.rendamais.acesso.domain.User;
import br.com.fourtech.rendamais.plataforma.web.PreconditionRequiredException;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Usuários e perfis (Administração). Exige a permissão user.admin. A senha nunca volta na resposta. */
@RestController
@RequestMapping("/api/v1/users")
class UserAdminController {

    private final SessionApplicationService service;

    UserAdminController(SessionApplicationService service) {
        this.service = service;
    }

    record UserResponse(String id, String username, String displayName, String profile, boolean active, boolean locked,
                        String version, Instant updatedAt, String updatedBy) {
        static UserResponse of(User u) {
            return new UserResponse(u.id().toString(), u.username(), u.displayName(), u.profile().name(), u.active(),
                    u.lockedAt(Instant.now()), Long.toString(u.version()), u.updatedAt(), u.updatedBy());
        }
    }

    record CreateRequest(String username, String displayName, String profile, String password) { }

    record UpdateRequest(String displayName, String profile, Boolean active) { }

    record PasswordRequest(String password) { }

    @GetMapping
    List<UserResponse> list() {
        return service.listUsers().stream().map(UserResponse::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<UserResponse> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.getUser(id));
    }

    @PostMapping
    ResponseEntity<UserResponse> create(@RequestBody CreateRequest body) {
        return respond(HttpStatus.CREATED, service.createUser(body.username(), body.displayName(), body.profile(), body.password()));
    }

    @PutMapping("/{id}")
    ResponseEntity<UserResponse> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                        @RequestBody UpdateRequest body) {
        if (ifMatch == null || ifMatch.isBlank()) {
            throw new PreconditionRequiredException();
        }
        return respond(HttpStatus.OK, service.updateUser(id, Versions.parse(ifMatch), body.displayName(), body.profile(),
                body.active() == null || body.active()));
    }

    @PostMapping("/{id}/password")
    ResponseEntity<UserResponse> resetPassword(@PathVariable UUID id, @RequestBody PasswordRequest body) {
        return respond(HttpStatus.OK, service.resetPassword(id, body.password()));
    }

    private static ResponseEntity<UserResponse> respond(HttpStatus status, User u) {
        return ResponseEntity.status(status).eTag("\"" + u.version() + "\"").body(UserResponse.of(u));
    }
}
