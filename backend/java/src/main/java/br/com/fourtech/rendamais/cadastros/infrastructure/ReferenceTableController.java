package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.ReferenceTableService;
import br.com.fourtech.rendamais.cadastros.domain.TabelaAuxiliar;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

import static br.com.fourtech.rendamais.cadastros.infrastructure.ApiSupport.version;

/**
 * Tabelas editáveis dos cadastros (Sprint 13): {@code unidades}, {@code categorias}, {@code marcas}, {@code bancos},
 * {@code condicoes}, {@code formas}, {@code moedas}, {@code tipos-documento}. PUT grava a tabela inteira com If-Match.
 */
@RestController
class ReferenceTableController {

    private final ReferenceTableService service;

    ReferenceTableController(ReferenceTableService service) {
        this.service = service;
    }

    record RowDto(String id, String code, String description, Map<String, Object> attrs, Boolean active, Long usage) { }

    record TableDto(String table, String title, String version, List<RowDto> rows) {
        static TableDto of(ReferenceTableService.Table t) {
            return new TableDto(t.table().name(), t.table().label(), Long.toString(t.version()),
                    t.rows().stream().map(r -> new RowDto(r.id(), r.code(), r.description(), r.attrs(), r.active(), r.usage())).toList());
        }
    }

    record ReplaceRequest(List<RowDto> rows) { }

    @GetMapping("/api/v1/reference-tables/{table}")
    ResponseEntity<TableDto> get(@PathVariable String table) {
        ReferenceTableService.Table t = service.get(TabelaAuxiliar.of(table));
        return ResponseEntity.ok().eTag("\"" + t.version() + "\"").body(TableDto.of(t));
    }

    @PutMapping("/api/v1/reference-tables/{table}")
    ResponseEntity<TableDto> replace(@PathVariable String table, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                     @RequestBody ReplaceRequest body) {
        List<TabelaAuxiliar.Row> rows = body == null || body.rows() == null ? List.of()
                : body.rows().stream().map(r -> new TabelaAuxiliar.Row(r.id(), r.code(), r.description(), r.attrs(), r.active())).toList();
        ReferenceTableService.Table t = service.replace(TabelaAuxiliar.of(table), version(ifMatch), rows);
        return ResponseEntity.ok().eTag("\"" + t.version() + "\"").body(TableDto.of(t));
    }
}
