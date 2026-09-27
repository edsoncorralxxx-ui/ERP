import { api } from '../api/client';
import type { Project } from '../api/types';
import { dataDaApi, numero, reais } from '../format';
import { useWindow } from '../windows/WindowContext';
import { JanelaLista, type Situacao } from './comum/JanelaLista';
import { seloEstagio } from './comum/Selos';
import { PEDIDOS_ALTERADOS } from './SalesOrdersWindow';

const carregar = async (busca: string, situacao: Situacao) => {
  const q = new URLSearchParams({ includeClosed: String(situacao === 'TODOS') });
  if (busca) q.set('search', busca);
  return (await api.get<Project[]>(`/api/v1/projects?${q.toString()}`)).data;
};

/** Carteira de projetos: projetos com estágio, cliente e valor contratado (base: pedido confirmado). */
export function ProjectsWindow() {
  const win = useWindow();
  return (
    <JanelaLista<Project>
      nome={['projeto', 'projetos']}
      rotulo="Carteira de projetos"
      placeholder="Código, nome, pedido ou cliente"
      carregar={carregar}
      evento={PEDIDOS_ALTERADOS}
      abrir={(id) => win.open('project', id)}
      rotuloLinha={(p) => `Abrir projeto ${p.code}`}
      situacoes={[
        { valor: 'ABERTOS', rotulo: 'Em andamento' },
        { valor: 'TODOS', rotulo: 'Todos, com encerrados' },
      ]}
      selo={(p) => seloEstagio(p.stage)}
      total={(linhas) => `Valor contratado: ${reais(linhas.filter((p) => p.stage !== 'ENCERRADO').reduce((t, p) => t + BigInt(p.contractCents), 0n).toString())}`}
      filtros={[
        {
          chave: 'estagio',
          rotulo: 'Estágio',
          opcoes: [
            { valor: 'PLANEJADO', rotulo: 'Planejado' },
            { valor: 'ENGENHARIA', rotulo: 'Engenharia' },
            { valor: 'SUPRIMENTOS', rotulo: 'Suprimentos' },
            { valor: 'PRODUCAO', rotulo: 'Produção' },
            { valor: 'INSTALACAO', rotulo: 'Instalação' },
            { valor: 'ACEITO', rotulo: 'Aceito' },
            { valor: 'ENCERRADO', rotulo: 'Encerrado' },
          ],
          testa: (p, v) => p.stage === v,
        },
      ]}
      colunas={[
        { titulo: 'Projeto', valor: (p) => p.code },
        { titulo: 'Nome', valor: (p) => p.name },
        { titulo: 'Cliente', valor: (p) => `${p.customerCode} — ${p.customerName}` },
        { titulo: 'Pedido', valor: (p) => p.orderCode },
        { titulo: 'Entrega contratual', valor: (p) => dataDaApi(p.contractDelivery) },
        { titulo: 'Equipamentos', num: true, valor: (p) => numero(p.equipmentCount) },
        { titulo: 'Valor contratado', num: true, valor: (p) => reais(p.contractCents) },
      ]}
    />
  );
}
