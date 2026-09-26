import { useState } from 'react';
import { Dialog } from '../../shell/Dialog';

/** Inativar com motivo obrigatório (Caixa de mensagem com um campo). */
export function DialogoInativar({ rotulo, texto, idCampo, onConfirmar, onCancelar }: {
  rotulo: string;
  texto: string;
  idCampo: string;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const confirmar = () => {
    if (!motivo.trim()) setErro('Informe o motivo da inativação.');
    else onConfirmar(motivo.trim());
  };
  return (
    <Dialog
      icon="aviso"
      label={rotulo}
      onEscape={onCancelar}
      buttons={[
        { label: 'Inativar', primary: true, onClick: confirmar },
        { label: 'Cancelar', onClick: onCancelar },
      ]}
    >
      {texto}
      <br />
      <div className="rp-form rp-msgbox__form">
        <label className="rp-label" htmlFor={idCampo}>Motivo</label>
        <input
          id={idCampo}
          className="rp-field"
          maxLength={500}
          value={motivo}
          aria-invalid={!!erro}
          onChange={(e) => (setMotivo(e.target.value), setErro(null))}
          onKeyDown={(e) => e.key === 'Enter' && confirmar()}
        />
      </div>
      {erro && (
        <span className="rp-campo-erro">
          <i className="rp-ico rp-ico-status-erro" aria-hidden="true" /> {erro}
        </span>
      )}
    </Dialog>
  );
}

/** Conflito de versão: o registro mudou em outra janela ou estação e nada foi gravado. */
export function DialogoConflito({ rotulo, objeto, versao, onRecarregar, onContinuar }: {
  rotulo: string;
  objeto: string;
  versao: string;
  onRecarregar: () => void;
  onContinuar: () => void;
}) {
  return (
    <Dialog
      icon="aviso"
      label={rotulo}
      onEscape={onContinuar}
      buttons={[
        { label: 'Recarregar', primary: true, onClick: onRecarregar },
        { label: 'Continuar editando', onClick: onContinuar },
      ]}
    >
      {objeto} foi alterado em outra janela ou estação (versão atual {versao}) e suas alterações não foram gravadas.
      <br />
      Deseja recarregar a versão do servidor? Isso descarta o que você digitou.
    </Dialog>
  );
}

/**
 * CNPJ de um parceiro que já existe com o outro papel: em vez de duplicar o cadastro, oferece dar o papel a ele
 * (cliente e fornecedor são papéis do mesmo parceiro).
 */
export function DialogoOutroPapel({ mensagem, papel, onSim, onNao }: { mensagem: string; papel: string; onSim: () => void; onNao: () => void }) {
  return (
    <Dialog
      icon="info"
      label={`Parceiro já cadastrado`}
      onEscape={onNao}
      buttons={[
        { label: 'Sim', primary: true, onClick: onSim },
        { label: 'Não', onClick: onNao },
      ]}
    >
      {mensagem}
      <br />
      Deseja torná-lo também {papel}? A ficha dele abre nesta janela; o que você digitou aqui não é gravado.
    </Dialog>
  );
}
