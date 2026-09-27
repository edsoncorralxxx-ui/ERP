package br.com.fourtech.rendamais.cadastros.api;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Consulta pública de parceiros para os outros módulos (porta {@code PartnerQueryApi} do B01). Lê na transação do
 * chamador, para que a conferência de cliente e unidade ativos (INV-SO-6) valha no momento da confirmação.
 */
public interface PartnerQueryApi {

    record UnitRef(UUID id, String name, String city, String state) { }

    /** Cliente com a situação do papel de cliente ({@code active}) e as unidades cadastradas hoje. */
    record CustomerRef(UUID id, String code, String name, boolean active, List<UnitRef> units) {
        public Optional<UnitRef> unit(UUID unitId) {
            return units.stream().filter(u -> u.id().equals(unitId)).findFirst();
        }
    }

    /** Parceiro com o papel de cliente; vazio se não existe ou nunca foi cliente. */
    Optional<CustomerRef> customer(UUID id);
}
