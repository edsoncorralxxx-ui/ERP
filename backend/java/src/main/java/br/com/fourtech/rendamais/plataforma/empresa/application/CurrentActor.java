package br.com.fourtech.rendamais.plataforma.empresa.application;

/**
 * Ator da operação. Até o login (Sprint 2) todas as operações são atribuídas ao ator local de desenvolvimento.
 */
public final class CurrentActor {
    public static final String DESENVOLVIMENTO_LOCAL = "desenvolvimento-local";

    private CurrentActor() { }

    public static String name() {
        return DESENVOLVIMENTO_LOCAL;
    }
}
