import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** Abre a Seleção do design system (lista suspensa desenhada, não a nativa) e escolhe a opção pelo rótulo. */
export async function escolher(user: UserEvent, campo: HTMLElement, opcao: string | RegExp): Promise<void> {
  await user.click(campo);
  await user.click(await screen.findByRole('option', { name: opcao }));
}
