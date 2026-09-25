type Tool = { name: string; title: string; action?: () => void } | 'sep';

/**
 * Barra de ferramentas na ordem clássica do design system. Ferramentas ainda não implementadas ficam
 * indisponíveis (cinza), como a barra original até um documento estar aberto.
 */
export function Toolbar({ onHelp }: { onHelp: () => void }) {
  const tools: Tool[] = [
    { name: 'visualizar', title: 'Visualizar impressão' },
    { name: 'imprimir', title: 'Imprimir' },
    { name: 'email', title: 'Enviar e-mail' },
    { name: 'celular', title: 'Enviar SMS' },
    { name: 'fax', title: 'Enviar fax' },
    { name: 'exportar-planilha', title: 'Exportar para planilha' },
    { name: 'exportar-word', title: 'Exportar para Word' },
    { name: 'exportar-pdf', title: 'Exportar para PDF' },
    { name: 'mover', title: 'Iniciar' },
    { name: 'bloquear', title: 'Bloquear tela' },
    'sep',
    { name: 'buscar', title: 'Buscar' },
    { name: 'novo', title: 'Novo' },
    { name: 'primeiro', title: 'Primeiro registro' },
    { name: 'anterior', title: 'Registro anterior' },
    { name: 'proximo', title: 'Próximo registro' },
    { name: 'ultimo', title: 'Último registro' },
    { name: 'filtro', title: 'Filtrar' },
    'sep',
    { name: 'ordenar', title: 'Ordenar' },
    { name: 'documento-base', title: 'Documento-base' },
    { name: 'documento-destino', title: 'Documento-destino' },
    { name: 'lucro-bruto', title: 'Lucro bruto' },
    { name: 'meios-pagamento', title: 'Meios de pagamento' },
    'sep',
    { name: 'editar', title: 'Editar' },
    { name: 'configuracoes', title: 'Configurações do formulário' },
    { name: 'consulta', title: 'Consulta' },
    { name: 'alerta', title: 'Alertas' },
    { name: 'calendario', title: 'Calendário' },
    'sep',
    { name: 'ajuda', title: 'Ajuda — sobre o Renda+ ERP', action: onHelp },
    'sep',
    { name: 'ia-assistente', title: 'Assistente de IA (futuro)' },
  ];
  return (
    <div className="rp-toolbar" role="toolbar" aria-label="Ferramentas">
      {tools.map((t, i) =>
        t === 'sep' ? (
          <span key={`s${i}`} className="rp-tool-sep" />
        ) : (
          <button key={t.name} type="button" className="rp-tool" title={t.title} aria-label={t.title} disabled={!t.action} onClick={t.action}>
            <i className={`rp-ico rp-ico-${t.name}`} />
          </button>
        ),
      )}
    </div>
  );
}
