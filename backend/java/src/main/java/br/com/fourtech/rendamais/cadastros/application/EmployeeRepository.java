package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.domain.Employee;
import br.com.fourtech.rendamais.cadastros.domain.Partner;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Porta de persistência dos colaboradores. */
public interface EmployeeRepository {

    void insert(Employee e);

    boolean update(Employee e, long expectedVersion);

    Optional<Employee> findById(UUID id);

    boolean codeExists(String code);

    /** Busca por matrícula, nome, departamento ou função; {@code status} nulo traz todos. */
    List<Employee> list(String search, Partner.Status status);
}
