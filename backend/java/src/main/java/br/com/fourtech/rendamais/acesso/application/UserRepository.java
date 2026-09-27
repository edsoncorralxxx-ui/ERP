package br.com.fourtech.rendamais.acesso.application;

import br.com.fourtech.rendamais.acesso.domain.User;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos usuários. */
public interface UserRepository {

    Optional<User> findByUsernameForUpdate(String username);

    Optional<User> findById(UUID id);

    Optional<User> findByIdForUpdate(UUID id);

    List<User> findAll();

    String passwordHash(UUID id);

    long count();

    long countActiveAdministrators();

    boolean usernameExists(String username);

    void insert(User user, String passwordHash, String createdBy);

    /** Grava se a versão armazenada ainda for {@code expectedVersion}. */
    boolean update(User user, long expectedVersion);

    void updatePassword(UUID id, String passwordHash);

    /** Tentativas e bloqueio: não mudam a versão do cadastro. */
    void updateLoginState(User user);
}
