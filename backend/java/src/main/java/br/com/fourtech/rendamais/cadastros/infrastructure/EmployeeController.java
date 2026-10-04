package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.application.EmployeeService;
import br.com.fourtech.rendamais.cadastros.domain.Employee;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.plataforma.web.HistoryEntry;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

import static br.com.fourtech.rendamais.cadastros.infrastructure.ApiSupport.version;

/** API de colaboradores (Sprint 13). POST exige Idempotency-Key; PUT, inativação e reativação exigem If-Match. */
@RestController
@RequestMapping("/api/v1/employees")
class EmployeeController {

    private final EmployeeService service;

    EmployeeController(EmployeeService service) {
        this.service = service;
    }

    record EmployeeDto(String id, String code, String name, String department, String jobTitle, String costCenter,
                       String admissionDate, String email, String phone, String status, String version) {
        static EmployeeDto of(Employee e) {
            return new EmployeeDto(e.id().toString(), e.code(), e.name(), e.department(), e.jobTitle(), e.costCenter(),
                    e.admissionDate() == null ? null : e.admissionDate().toString(), e.email(), e.phone(), e.status().name(),
                    Long.toString(e.version()));
        }
    }

    @GetMapping
    List<EmployeeDto> list(@RequestParam(value = "search", required = false) String search,
                           @RequestParam(value = "status", defaultValue = "ATIVO") String status) {
        return service.list(search, ApiSupport.status(status)).stream().map(EmployeeDto::of).toList();
    }

    @GetMapping("/{id}")
    ResponseEntity<EmployeeDto> get(@PathVariable UUID id) {
        return respond(HttpStatus.OK, service.get(id));
    }

    @PostMapping
    ResponseEntity<EmployeeDto> register(@RequestHeader(value = "Idempotency-Key", required = false) String key,
                                         @RequestBody Employee.Data body) {
        return respond(HttpStatus.CREATED, service.register(key, body));
    }

    @PutMapping("/{id}")
    ResponseEntity<EmployeeDto> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                       @RequestBody Employee.Data body) {
        return respond(HttpStatus.OK, service.update(id, version(ifMatch), body));
    }

    @PostMapping("/{id}/deactivate")
    ResponseEntity<EmployeeDto> deactivate(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.setStatus(id, version(ifMatch), Partner.Status.INATIVO));
    }

    @PostMapping("/{id}/reactivate")
    ResponseEntity<EmployeeDto> reactivate(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(HttpStatus.OK, service.setStatus(id, version(ifMatch), Partner.Status.ATIVO));
    }

    @GetMapping("/{id}/history")
    List<HistoryEntry> history(@PathVariable UUID id) {
        return service.history(id).stream().map(HistoryEntry::of).toList();
    }

    private static ResponseEntity<EmployeeDto> respond(HttpStatus status, Employee e) {
        return ResponseEntity.status(status).eTag("\"" + e.version() + "\"").body(EmployeeDto.of(e));
    }
}
