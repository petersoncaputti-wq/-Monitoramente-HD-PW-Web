// Erro com status HTTP e mensagem segura para o usuário.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (message) => new HttpError(400, message);

// Erros conhecidos viram respostas 4xx claras; o resto vira 500 genérico,
// com o detalhe registrado só no log do servidor.
const POSTGRES_ERRORS = {
  '22P02': [400, 'Valor inválido na requisição.'], // ex.: UUID mal formado
  22007: [400, 'Data inválida na requisição.'],
  22008: [400, 'Data fora do intervalo permitido.'],
  23505: [409, 'Já existe um registro com estes dados.'],
  23503: [409, 'O registro está vinculado a outro dado e não pode ser alterado.'],
};

export function httpErrorHandler(error, _request, response, next) {
  if (response.headersSent) return next(error);
  if (error instanceof HttpError) return response.status(error.status).json({ error: error.message });
  if (error?.type === 'entity.too.large')
    return response.status(413).json({ error: 'O arquivo ou a requisição excede o tamanho permitido.' });
  if (error?.type === 'entity.parse.failed')
    return response.status(400).json({ error: 'JSON inválido na requisição.' });
  const known = POSTGRES_ERRORS[error?.code];
  if (known) return response.status(known[0]).json({ error: known[1] });
  console.error(error);
  return response.status(500).json({ error: 'Erro interno do servidor.' });
}
