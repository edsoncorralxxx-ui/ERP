package br.com.fourtech.rendamais.acesso.application;

/** Porta do hash de senha (Argon2id na infraestrutura). */
public interface PasswordHasher {
    String hash(String password);

    boolean matches(String password, String hash);
}
