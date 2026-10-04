import { useEffect, useRef, useState, type PointerEvent } from 'react';

/** `abre`: a ação abre outra janela, e a dica termina com reticências (componente Dica). */
type Tool = { name: string; title: string; abre?: boolean } | 'sep';

/** Ferramentas que já têm ação, pelo nome do ícone; as demais ficam indisponíveis. */
export type ToolActions = Partial<Record<string, () => void>>;

type Dica = { texto: string; x: number; y: number };

/**
 * Barra de ferramentas na ordem clássica do design system. Ferramentas ainda não implementadas ficam
 * indisponíveis (cinza), como a barra original até um documento estar aberto. Cada botão tem a sua Dica de ferramenta
 * (`rp-tip--ferramenta`), que aparece logo abaixo e à direita do ponteiro.
 */
export function Toolbar({ actions }: { actions: ToolActions }) {
  const [dica, setDica] = useState<Dica | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(espera.current), []);

  const mostrar = (texto: string) => (e: PointerEvent) => {
    const { clientX: x, clientY: y } = e;
    clearTimeout(espera.current);
    setDica((d) => (d ? { texto, x, y } : null));
    espera.current = setTimeout(() => setDica({ texto, x, y }), 500);
  };
  const esconder = () => {
    clearTimeout(espera.current);
    setDica(null);
  };

  // Ordem e nomes da barra do mock Renda+ ERP (cockpit inicial); o separador vem antes da ferramenta marcada.
  const tools: Tool[] = [
    { name: 'visualizar', title: 'Visualizar', abre: true },
    { name: 'imprimir', title: 'Imprimir', abre: true },
    { name: 'email', title: 'Enviar e-mail', abre: true },
    { name: 'telefone', title: 'Telefonar', abre: true },
    { name: 'exportar-planilha', title: 'Exportar para planilha', abre: true },
    { name: 'exportar-pdf', title: 'Exportar para PDF', abre: true },
    'sep',
    { name: 'mover', title: 'Mover' },
    { name: 'bloquear', title: 'Bloquear tela' },
    'sep',
    { name: 'buscar', title: 'Buscar', abre: true },
    { name: 'novo', title: 'Novo' },
    { name: 'primeiro', title: 'Primeiro registro' },
    { name: 'anterior', title: 'Registro anterior' },
    { name: 'proximo', title: 'Próximo registro' },
    { name: 'ultimo', title: 'Último registro' },
    'sep',
    { name: 'filtro', title: 'Filtrar', abre: true },
    { name: 'ordenar', title: 'Ordenar', abre: true },
    'sep',
    { name: 'editar', title: 'Editar' },
    { name: 'excluir', title: 'Excluir' },
    { name: 'configuracoes', title: 'Configurações do formulário', abre: true },
    { name: 'consulta', title: 'Consulta', abre: true },
    'sep',
    { name: 'python', title: 'Console Python', abre: true },
    { name: 'banco-dados', title: 'Banco de dados', abre: true },
    'sep',
    { name: 'alerta', title: 'Alertas', abre: true },
    { name: 'calendario', title: 'Calendário', abre: true },
    { name: 'ajuda', title: 'Ajuda', abre: true },
    'sep',
    { name: 'ia-assistente', title: 'Assistente de IA', abre: true },
  ];
  return (
    <div className="rp-toolbar" role="toolbar" aria-label="Ferramentas">
      {tools.map((t, i) =>
        t === 'sep' ? (
          <span key={`s${i}`} className="rp-tool-sep" />
        ) : (
          <button
            key={t.name}
            type="button"
            className="rp-tool"
            aria-label={t.title}
            disabled={!actions[t.name]}
            onClick={() => {
              esconder();
              actions[t.name]?.();
            }}
            onPointerEnter={mostrar(t.abre ? `${t.title}...` : t.title)}
            onPointerMove={mostrar(t.abre ? `${t.title}...` : t.title)}
            onPointerLeave={esconder}
          >
            <i className={`rp-ico rp-ico-${t.name}`} />
          </button>
        ),
      )}
      {dica && (
        <span className="rp-tip rp-tip--ferramenta rp-dica-ferramenta" role="tooltip" style={{ left: dica.x + 12, top: dica.y + 18 }}>
          {dica.texto}
        </span>
      )}
    </div>
  );
}
