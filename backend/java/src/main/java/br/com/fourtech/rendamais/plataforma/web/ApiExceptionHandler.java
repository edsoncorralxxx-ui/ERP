package br.com.fourtech.rendamais.plataforma.web;

import br.com.fourtech.rendamais.kernel.DomainException;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import br.com.fourtech.rendamais.kernel.RuleViolationException;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

@RestControllerAdvice
class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(VersionConflictException.class)
    ResponseEntity<ApiError> versionConflict(VersionConflictException e) {
        return error(HttpStatus.PRECONDITION_FAILED, e);
    }

    @ExceptionHandler(RuleViolationException.class)
    ResponseEntity<ApiError> ruleViolation(RuleViolationException e) {
        return error(HttpStatus.UNPROCESSABLE_CONTENT, e);
    }

    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> notFound(NotFoundException e) {
        return error(HttpStatus.NOT_FOUND, e);
    }

    @ExceptionHandler(PreconditionRequiredException.class)
    ResponseEntity<ApiError> preconditionRequired(PreconditionRequiredException e) {
        return body(HttpStatus.PRECONDITION_REQUIRED, "PRECONDITION_REQUIRED", e.getMessage(), List.of());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, IllegalArgumentException.class})
    ResponseEntity<ApiError> badRequest(Exception e) {
        return body(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Requisição em formato inválido.", List.of());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ApiError> mediaType(Exception e) {
        return body(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "VALIDATION_FAILED", "Envie o corpo em JSON.", List.of());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ApiError> method(Exception e) {
        return body(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "Operação não suportada neste recurso.", List.of());
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ApiError> noResource(Exception e) {
        return body(HttpStatus.NOT_FOUND, "NOT_FOUND", "Recurso não encontrado.", List.of());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> unexpected(Exception e) {
        log.error("Erro inesperado [{}]", CorrelationId.current(), e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "Erro inesperado no servidor. Informe o código de correlação ao suporte.", List.of());
    }

    private ResponseEntity<ApiError> error(HttpStatus status, DomainException e) {
        List<ApiError.Detail> details = e.details().stream().map(d -> new ApiError.Detail(d.field(), d.message())).toList();
        return body(status, e.code(), e.getMessage(), details);
    }

    private ResponseEntity<ApiError> body(HttpStatus status, String code, String message, List<ApiError.Detail> details) {
        return ResponseEntity.status(status).body(new ApiError(code, message, details, CorrelationId.current(), false));
    }
}
