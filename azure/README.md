# Backend no Azure

O Supabase permanece apenas como provedor de identidade. As tabelas `public` e todos os
dados do painel ficam no Azure Database for PostgreSQL Flexible Server.

## Variaveis do App Service

Cadastre em **App Service > Configuracoes > Variaveis de ambiente**:

- `DATABASE_URL`: connection string completa do Azure, com `sslmode=require`;
- `DATABASE_POOL_MAX`: `10` para iniciar;
- `VITE_SUPABASE_URL`: URL atual do projeto Supabase;
- `VITE_SUPABASE_ANON_KEY`: chave publica atual;
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta, usada somente no backend para administrar identidades;
- `NODE_ENV`: `production`.

Nunca use prefixo `VITE_` na connection string do banco. Se a senha tiver caracteres
reservados em URL, eles devem ser percent-encoded.

## Implantacao

1. Mantenha o App Service integrado a `monitoramentohdpwdatabaseAppSubnet`.
2. Use Node.js LTS e habilite a automacao de build.
3. Configure o comando de inicializacao como `npm start`.
4. O build executa `tsc -b && vite build`; sincronizacoes locais nao rodam durante deploy.
5. Valide `GET /api/health`, que deve retornar `database: connected`.
6. Valide login, dashboard, importacoes, CRUD de chamados e administracao de usuarios.

O esquema idempotente esta em `schema.sql` e pode ser reaplicado com `npm run db:migrate`.
Os scripts antigos que escrevem diretamente no Supabase foram mantidos somente com o
prefixo `legacy:supabase` e nao devem ser usados depois do cutover.
