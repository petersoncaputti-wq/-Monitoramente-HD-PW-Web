import express from 'express';

// Rotas de importação recebem o arquivo dentro do JSON (texto ou base64).
export const LARGE_BODY_PATHS = ['/api/storage-import', '/api/pw-users-import', '/api/e365-import'];

// Somente as importações aceitam corpo grande; as demais rotas ficam em 1 MB.
// O body-parser não reprocessa um corpo já lido, então o limite maior
// precisa ser registrado antes do global.
export function useBodyParsers(app) {
  app.use(LARGE_BODY_PATHS, express.json({ limit: '25mb' }));
  app.use(express.json({ limit: '1mb' }));
}
