package br.com.fourtech.rendamais.cadastros.infrastructure;

import br.com.fourtech.rendamais.cadastros.api.EmployeeDirectory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
class JdbcEmployeeDirectory implements EmployeeDirectory {

    private final JdbcClient jdbc;

    JdbcEmployeeDirectory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean isActive(String name) {
        return name != null && jdbc.sql("select count(*) from employee where name = :n and status = 'ATIVO'").param("n", name.strip())
                .query(Long.class).single() > 0;
    }

    @Override
    public List<String> activeNames() {
        return jdbc.sql("select name from employee where status = 'ATIVO' order by name").query(String.class).list();
    }
}
