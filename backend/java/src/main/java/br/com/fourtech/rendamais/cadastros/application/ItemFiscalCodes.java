package br.com.fourtech.rendamais.cadastros.application;

import br.com.fourtech.rendamais.cadastros.api.ItemFiscalCodesApi;
import br.com.fourtech.rendamais.cadastros.domain.Item;
import br.com.fourtech.rendamais.cadastros.domain.ItemData;
import br.com.fourtech.rendamais.cadastros.domain.Partner;
import br.com.fourtech.rendamais.kernel.NotFoundException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Implementação de {@link ItemFiscalCodesApi}: a gravação passa pelo {@link ItemService#update}, como na ficha do item. */
@Component
class ItemFiscalCodes implements ItemFiscalCodesApi {

    private static final int ALL = 100_000;

    private final ItemRepository repository;
    private final ItemService items;

    ItemFiscalCodes(ItemRepository repository, ItemService items) {
        this.repository = repository;
        this.items = items;
    }

    @Override
    @Transactional(readOnly = true)
    public List<FiscalItem> fiscalItems() {
        return repository.list(null, null, null, null, ALL).stream()
                .map(s -> new FiscalItem(s.id(), s.code(), s.description(), s.nature().name(), s.category(), s.status() == Partner.Status.ATIVO,
                        s.ncm(), s.serviceCode(), s.version()))
                .sorted(Comparator.comparing(FiscalItem::code)).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<FiscalItem> fiscalItem(UUID id) {
        return repository.findById(id).map(ItemFiscalCodes::of);
    }

    @Override
    @Transactional
    public FiscalItem updateCodes(UUID id, String ncm, String serviceCode) {
        Item current = repository.findById(id).orElseThrow(() -> new NotFoundException("Item não encontrado."));
        String n = blank(ncm) ? null : ncm.replaceAll("[.\\s-]", "");
        String s = blank(serviceCode) ? null : serviceCode.strip();
        boolean product = current.nature() == Item.Nature.MATERIAL;
        if (product ? Objects.equals(n, current.ncm()) : Objects.equals(s, current.serviceCode())) return of(current);
        ItemData data = new ItemData(current.description(), current.nature().name(), current.uom(), current.category().id().toString(),
                current.stockControlled(), current.referenceCost() == null ? null : current.referenceCost().toPlainString(),
                product ? n : null, product ? null : s,
                current.conversions().stream().map(c -> new ItemData.ConversionData(c.id().toString(), c.fromUom(), c.factor().toPlainString()))
                        .toList());
        return of(items.update(id, current.version(), data));
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static FiscalItem of(Item i) {
        return new FiscalItem(i.id(), i.code(), i.description(), i.nature().name(), i.category().name(), i.status() == Partner.Status.ATIVO,
                i.ncm(), i.serviceCode(), i.version());
    }
}
