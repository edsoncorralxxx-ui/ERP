package br.com.fourtech.rendamais.cadastros.domain;

import br.com.fourtech.rendamais.kernel.DomainException.FieldIssue;
import br.com.fourtech.rendamais.kernel.RuleViolationException;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Tabelas editáveis dos cadastros (componente "tabela editável" do mock): unidades de medida, categorias, marcas, bancos,
 * condições e formas de pagamento, moedas e tipos de documento. Cada tabela tem código, descrição, colunas próprias
 * (validadas por uma {@link Ficha}) e a marca de ativo; a tabela inteira é gravada de uma vez.
 */
public enum TabelaAuxiliar {
    UNIDADE("Unidades de medida", 10, true, new Ficha(
            Ficha.Campo.opcao("quantityKind", "Quantidade", "Massa", "Comprimento", "Área", "Volume", "Tempo"),
            Ficha.Campo.inteiro("decimals", 0, 6))),
    CATEGORIA("Categorias", 10, true, new Ficha(
            Ficha.Campo.texto("parent", 100),
            Ficha.Campo.opcao("appliesTo", "Produto", "Material", "Serviço"))),
    MARCA("Marcas", 20, true, new Ficha(
            Ficha.Campo.texto("manufacturer", 120),
            Ficha.Campo.texto("country", 60))),
    BANCO("Bancos", 20, false, new Ficha(
            Ficha.Campo.texto("agency", 20),
            Ficha.Campo.texto("account", 30),
            Ficha.Campo.opcao("usage", "Recebimentos", "Pagamentos", "Aplicações", "Recebimentos e pagamentos"))),
    CONDICAO_PAGAMENTO("Condições de pagamento", 20, true, new Ficha(
            Ficha.Campo.inteiro("installments", 1, 60),
            Ficha.Campo.inteiro("firstDueDays", 0, 999),
            Ficha.Campo.inteiro("intervalDays", 0, 999),
            Ficha.Campo.decimal("earlyDiscountPercent", 2, "0", "100"))),
    FORMA_PAGAMENTO("Formas de pagamento", 20, true, new Ficha(
            Ficha.Campo.opcao("kind", "Boleto", "Pix", "Transferência", "Cartão", "Dinheiro", "Cheque", "Depósito"),
            Ficha.Campo.texto("defaultAccount", 120),
            Ficha.Campo.booleano("issuesSlip"))),
    MOEDA("Moedas", 5, true, new Ficha(
            Ficha.Campo.texto("symbol", 5),
            Ficha.Campo.inteiro("decimals", 0, 6),
            Ficha.Campo.booleano("local"))),
    TIPO_DOCUMENTO("Tipos de documento", 10, true, new Ficha(
            Ficha.Campo.opcao("module", "Vendas", "Compras", "Produção", "Renda+", "Manutenção", "Qualidade", "Financeiro", "Fiscal",
                    "Engenharia", "Projetos", "Estoque", "Pós-venda"),
            Ficha.Campo.texto("prefix", 10),
            Ficha.Campo.formato("nextNumber", 10, "\\d{1,10}", "Próximo número só com algarismos."),
            Ficha.Campo.booleano("requiresApproval")));

    private final String label;
    private final int codeMax;
    private final boolean uniqueCode;
    private final Ficha columns;

    TabelaAuxiliar(String label, int codeMax, boolean uniqueCode, Ficha columns) {
        this.label = label;
        this.codeMax = codeMax;
        this.uniqueCode = uniqueCode;
        this.columns = columns;
    }

    public String label() {
        return label;
    }

    public Ficha columns() {
        return columns;
    }

    /** {@code unidades}, {@code condicoes}… (chave da janela) ou o nome do enum. */
    public static TabelaAuxiliar of(String raw) {
        String k = raw == null ? "" : raw.strip().toLowerCase(Locale.ROOT);
        return switch (k) {
            case "unidades", "unidade" -> UNIDADE;
            case "categorias", "categoria" -> CATEGORIA;
            case "marcas", "marca" -> MARCA;
            case "bancos", "banco" -> BANCO;
            case "condicoes", "condicao_pagamento" -> CONDICAO_PAGAMENTO;
            case "formas", "forma_pagamento" -> FORMA_PAGAMENTO;
            case "moedas", "moeda" -> MOEDA;
            case "tipos-documento", "tipo_documento" -> TIPO_DOCUMENTO;
            default -> throw new br.com.fourtech.rendamais.kernel.NotFoundException("Tabela não encontrada.");
        };
    }

    /** Linha informada; {@code id} vazio numa linha nova. */
    public record Row(String id, String code, String description, Map<String, Object> attrs, Boolean active) { }

    /** Linha validada. */
    public record Valid(String id, String code, String description, Map<String, Object> attrs, boolean active) { }

    /** Valida a tabela inteira: código e descrição obrigatórios, código sem repetir (menos nos bancos), colunas próprias. */
    public List<Valid> validate(List<Row> rows) {
        List<FieldIssue> issues = new ArrayList<>();
        List<Valid> out = new ArrayList<>();
        Set<String> codes = new HashSet<>();
        if (rows == null) rows = List.of();
        if (rows.size() > 500) issues.add(new FieldIssue("rows", "Máximo de 500 linhas."));
        int locals = 0;
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            String f = "rows[" + i + "].";
            String code = r.code() == null ? null : r.code().strip();
            if (code == null || code.isEmpty()) issues.add(new FieldIssue(f + "code", "Informe o código."));
            else if (code.length() > codeMax) issues.add(new FieldIssue(f + "code", "Máximo de " + codeMax + " caracteres."));
            else if (this == UNIDADE || this == CATEGORIA) {
                code = code.toUpperCase(Locale.ROOT);
                if (!code.matches("[A-Z0-9]{1,10}")) issues.add(new FieldIssue(f + "code", "Use letras e algarismos, sem espaços."));
            }
            if (code != null && !code.isEmpty() && uniqueCode && !codes.add(code.toUpperCase(Locale.ROOT))) {
                issues.add(new FieldIssue(f + "code", "Código repetido na tabela."));
            }
            String desc = r.description() == null ? null : r.description().strip();
            int max = this == UNIDADE ? 60 : this == CATEGORIA ? 100 : 120;
            if (desc == null || desc.isEmpty()) issues.add(new FieldIssue(f + "description", "Informe a descrição."));
            else if (desc.length() > max) issues.add(new FieldIssue(f + "description", "Máximo de " + max + " caracteres."));
            Map<String, Object> attrs = columns.validar(r.attrs(), f + "attrs.", issues);
            if (Boolean.TRUE.equals(attrs.get("local"))) locals++;
            out.add(new Valid(r.id() == null || r.id().isBlank() ? null : r.id(), code, desc, attrs, r.active() == null || r.active()));
        }
        if (this == MOEDA && locals > 1) issues.add(new FieldIssue("rows", "Só uma moeda pode ser a moeda local."));
        if (!issues.isEmpty()) throw new RuleViolationException("REFERENCE_TABLE_INVALID", "Corrija as linhas indicadas.", issues);
        return out;
    }
}
