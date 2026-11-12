export const DEFAULT_TICKET_REASONS = [
  'Ajuste de Pasta',
  'Ajuste PW Web',
  'Arquivo sem state',
  'Configuração Projeto',
  'Correção de script',
  'Criação de projeto',
  'Criação de usuário',
  'Exclusão PW',
  'Falha de acesso',
  'Falha no Portal PW',
  'Falha no PW',
  'Falta de acesso a pasta Unidade',
  'Gerenciamento PW',
  'Instalação do PW',
  'Liberação de acesso',
  'Remoção de acesso',
];

function cleanReason(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function reasonKey(value: string): string {
  return cleanReason(value).toLocaleLowerCase('pt-BR');
}

export function getTicketReasonOptions(history: string[]): string[] {
  const options = new Map<string, string>();
  for (const reason of [...DEFAULT_TICKET_REASONS, ...history]) {
    const key = reasonKey(reason);
    if (key && !options.has(key)) options.set(key, cleanReason(reason));
  }
  return [...options.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function resolveTicketReason(value: string, options: string[]): string {
  return options.find((option) => reasonKey(option) === reasonKey(value)) ?? cleanReason(value);
}
