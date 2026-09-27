package br.com.fourtech.rendamais.plataforma.web;

/** Comando de edição sem cabeçalho If-Match (HTTP 428). */
public class PreconditionRequiredException extends RuntimeException {
    public PreconditionRequiredException() {
        super("Informe a versão do registro no cabeçalho If-Match para evitar sobrescrever alterações de outra pessoa.");
    }
}
