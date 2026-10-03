package br.com.fourtech.rendamais.acesso.application;

import br.com.fourtech.rendamais.acesso.api.UserDirectory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/** Usuários ativos, em ordem de nome, para a escolha do responsável. */
@Component
class ActiveUserDirectory implements UserDirectory {

    private final UserRepository users;

    ActiveUserDirectory(UserRepository users) {
        this.users = users;
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserRef> activeUsers() {
        return users.findAll().stream().filter(u -> u.active())
                .map(u -> new UserRef(u.username(), u.displayName()))
                .sorted(Comparator.comparing(UserRef::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }
}
