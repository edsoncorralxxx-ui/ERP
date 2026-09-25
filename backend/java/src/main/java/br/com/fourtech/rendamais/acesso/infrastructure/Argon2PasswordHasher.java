package br.com.fourtech.rendamais.acesso.infrastructure;

import br.com.fourtech.rendamais.acesso.application.PasswordHasher;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Component;

/** Argon2id com os parâmetros recomendados pelo Spring Security Crypto (ADR-005). */
@Component
class Argon2PasswordHasher implements PasswordHasher {

    private final Argon2PasswordEncoder encoder = Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8();

    @Override
    public String hash(String password) {
        return encoder.encode(password);
    }

    @Override
    public boolean matches(String password, String hash) {
        return hash != null && encoder.matches(password, hash);
    }
}
