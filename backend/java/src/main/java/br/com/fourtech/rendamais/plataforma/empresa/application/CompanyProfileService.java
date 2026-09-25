package br.com.fourtech.rendamais.plataforma.empresa.application;

import br.com.fourtech.rendamais.acesso.api.CurrentUserHolder;
import br.com.fourtech.rendamais.acesso.api.Permissions;
import br.com.fourtech.rendamais.auditoria.api.AuditEntry;
import br.com.fourtech.rendamais.auditoria.api.AuditTrail;
import br.com.fourtech.rendamais.kernel.VersionConflictException;
import br.com.fourtech.rendamais.plataforma.empresa.domain.CompanyProfile;
import br.com.fourtech.rendamais.plataforma.empresa.domain.CompanyProfileData;
import br.com.fourtech.rendamais.plataforma.web.CorrelationId;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;

/** Caso de uso: consultar e atualizar os dados da empresa com controle de versão e auditoria. */
@Service
public class CompanyProfileService {

    private final CompanyProfileRepository repository;
    private final AuditTrail audit;
    private final Clock clock;

    public CompanyProfileService(CompanyProfileRepository repository, AuditTrail audit, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public CompanyProfile get() {
        CurrentUserHolder.require(Permissions.COMPANY_READ);
        return repository.get();
    }

    @Transactional
    public CompanyProfile update(long expectedVersion, CompanyProfileData data) {
        String actor = CurrentUserHolder.require(Permissions.COMPANY_UPDATE).username();
        CompanyProfile current = repository.getForUpdate();
        if (current.version() != expectedVersion) {
            throw new VersionConflictException("company_profile", expectedVersion, current.version());
        }
        CompanyProfile updated = current.update(data, clock.instant(), actor);
        if (!repository.save(updated, expectedVersion)) {
            throw new VersionConflictException("company_profile", expectedVersion, repository.get().version());
        }
        Map<String, AuditEntry.Change> changes = new LinkedHashMap<>();
        current.diff(updated).forEach((field, v) -> changes.put(field, new AuditEntry.Change(v[0], v[1])));
        audit.record(new AuditEntry(actor, "COMPANY_PROFILE_UPDATED", "company_profile", updated.id().toString(),
                updated.version(), null, changes, CorrelationId.current()));
        return updated;
    }
}
