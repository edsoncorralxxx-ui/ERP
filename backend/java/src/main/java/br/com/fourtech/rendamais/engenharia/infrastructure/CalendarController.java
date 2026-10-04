package br.com.fourtech.rendamais.engenharia.infrastructure;

import br.com.fourtech.rendamais.engenharia.application.CalendarService;
import br.com.fourtech.rendamais.plataforma.web.Versions;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/** Calendários e feriados (Sprint 13). Alterações exigem If-Match com a versão do calendário. */
@RestController
class CalendarController {

    private final CalendarService service;

    CalendarController(CalendarService service) {
        this.service = service;
    }

    record HolidaysRequest(List<CalendarService.Holiday> rows) { }

    record CopyRequest(int from, int to) { }

    @GetMapping("/api/v1/calendars")
    List<CalendarService.Calendar> list() {
        return service.list();
    }

    @PostMapping("/api/v1/calendars")
    ResponseEntity<CalendarService.Calendar> register(@RequestBody CalendarService.CalendarData body) {
        CalendarService.Calendar c = service.register(body);
        return ResponseEntity.status(HttpStatus.CREATED).eTag("\"" + c.version() + "\"").body(c);
    }

    @PutMapping("/api/v1/calendars/{id}")
    ResponseEntity<CalendarService.Calendar> update(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                    @RequestBody CalendarService.CalendarData body) {
        return respond(service.update(id, Versions.required(ifMatch), body));
    }

    @GetMapping("/api/v1/calendars/{id}/holidays")
    List<CalendarService.Holiday> holidays(@PathVariable UUID id, @RequestParam("year") int year) {
        return service.holidays(id, year);
    }

    @PutMapping("/api/v1/calendars/{id}/holidays/{year}")
    ResponseEntity<CalendarService.Calendar> replaceHolidays(@PathVariable UUID id, @PathVariable int year,
                                                             @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                             @RequestBody HolidaysRequest body) {
        return respond(service.replaceHolidays(id, Versions.required(ifMatch), year, body == null ? List.of() : body.rows()));
    }

    @PostMapping("/api/v1/calendars/{id}/holidays/{year}/national")
    ResponseEntity<CalendarService.Calendar> importNational(@PathVariable UUID id, @PathVariable int year,
                                                            @RequestHeader(value = "If-Match", required = false) String ifMatch) {
        return respond(service.importNational(id, Versions.required(ifMatch), year));
    }

    @PostMapping("/api/v1/calendars/{id}/copy")
    ResponseEntity<CalendarService.Calendar> copy(@PathVariable UUID id, @RequestHeader(value = "If-Match", required = false) String ifMatch,
                                                  @RequestBody CopyRequest body) {
        return respond(service.copyYear(id, Versions.required(ifMatch), body.from(), body.to()));
    }

    private static ResponseEntity<CalendarService.Calendar> respond(CalendarService.Calendar c) {
        return ResponseEntity.ok().eTag("\"" + c.version() + "\"").body(c);
    }
}
