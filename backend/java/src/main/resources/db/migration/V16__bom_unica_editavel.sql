-- Sprint 10, Review (decisão do PO em 02/10/2026): a BOM deixa de ter revisões. Cada BOM tem um conteúdo só, editável a
-- qualquer momento; o histórico fica na auditoria. Fica a revisão mais recente de cada BOM (o último trabalho feito);
-- as linhas de submontagem, as BOMs dos equipamentos e as cargas do arquivo passam a apontar para ela.

create temporary table bom_revision_keep on commit drop as
select distinct on (bom_id) bom_id, id as keep_id
  from bom_revision
 order by bom_id, revision desc;

update bom_line l set child_revision_id = k.keep_id
  from bom_revision c join bom_revision_keep k on k.bom_id = c.bom_id
 where l.child_revision_id = c.id and c.id <> k.keep_id;

update equipment_bom e set revision_id = k.keep_id
  from bom_revision c join bom_revision_keep k on k.bom_id = c.bom_id
 where e.revision_id = c.id and c.id <> k.keep_id;

update equipment_bom_line e set child_revision_id = k.keep_id
  from bom_revision c join bom_revision_keep k on k.bom_id = c.bom_id
 where e.child_revision_id = c.id and c.id <> k.keep_id;

update bom_import i set revision_id = k.keep_id
  from bom_revision c join bom_revision_keep k on k.bom_id = c.bom_id
 where i.revision_id = c.id and c.id <> k.keep_id;

update bom_revision set based_on_id = null;

delete from bom_line l using bom_revision r, bom_revision_keep k
 where l.revision_id = r.id and r.bom_id = k.bom_id and r.id <> k.keep_id;

delete from bom_revision r using bom_revision_keep k where r.bom_id = k.bom_id and r.id <> k.keep_id;

-- O conteúdo que fica vale para tudo (aplicar ao equipamento, custo planejado).
update bom_revision set status = 'APPROVED', approved_at = coalesce(approved_at, updated_at, created_at),
       approved_by = coalesce(approved_by, updated_by, created_by);

drop index bom_revision_one_draft;
create unique index bom_revision_one_per_bom on bom_revision (bom_id);
