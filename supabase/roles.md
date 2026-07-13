# Papeis de acesso

## Administrador

Pode:

- Visualizar todas as abas do painel.
- Importar CSV diario de armazenamento.
- Recarregar dados do Supabase.
- Acessar Configuracoes.
- Criar usuarios.
- Editar nome e permissao de usuarios.
- Excluir usuarios.
- Alterar os proprios dados pessoais e senha.

Nao pode pela interface:

- Excluir a propria conta.
- Alterar o proprio email de login.

## Usuario padrao

Pode:

- Visualizar as abas operacionais do painel.
- Recarregar dados visiveis.
- Alterar os proprios dados pessoais e senha.

Nao pode:

- Importar CSV.
- Acessar a gestao de usuarios.
- Criar, editar ou excluir usuarios.
- Alterar permissoes.

## Modelo tecnico

- O papel fica em `public.app_profiles.role`.
- Valores permitidos: `admin` e `user`.
- A leitura de dados operacionais exige usuario autenticado.
- Operacoes administrativas usam endpoint backend com `SUPABASE_SERVICE_ROLE_KEY`.
- A `SUPABASE_SERVICE_ROLE_KEY` nunca deve ficar no frontend.
