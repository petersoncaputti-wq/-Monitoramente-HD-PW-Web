# Papeis de acesso

## Administrador

Pode:

- Visualizar todas as abas do painel.
- Importar CSV diario de armazenamento.
- Recarregar dados do Supabase.
- Acessar Configurações.
- Criar usuários.
- Editar nome e permissão de usuários.
- Excluir usuários.
- Alterar os proprios dados pessoais e senha.

Não pode pela interface:

- Excluir a propria conta.
- Alterar o proprio email de login.

## Usuário padrão

Pode:

- Visualizar as abas operacionais do painel.
- Recarregar dados visiveis.
- Alterar os proprios dados pessoais e senha.

Não pode:

- Importar CSV.
- Acessar a gestão de usuários.
- Criar, editar ou excluir usuários.
- Alterar permissoes.

## Modelo tecnico

- O papel fica em `public.app_profiles.role`.
- Valores permitidos: `admin` e `user`.
- A leitura de dados operacionais exige usuário autenticado.
- Operacoes administrativas usam endpoint backend com `SUPABASE_SERVICE_ROLE_KEY`.
- A `SUPABASE_SERVICE_ROLE_KEY` nunca deve ficar no frontend.
