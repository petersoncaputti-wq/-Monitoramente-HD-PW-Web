# Atualizacao de usuarios do PW Explorer

O botao "Atualizar" da aba de usuarios PW Explorer executa o script local
`scripts/export-pw-users.ps1`, conecta no ProjectWise com o modulo `PWPS_DAB`
e gera:

`public/dados/usuarios-pw-explorer.xlsx`

Antes de usar o botao, crie um arquivo `.env.local` na raiz do projeto com as
credenciais do ProjectWise:

```env
PW_DATASOURCE_NAME=NomeDoDatasourceProjectWise
PW_AUTH_MODE=password
PW_USERNAME=seu_usuario
PW_PASSWORD=sua_senha
PW_INACTIVE_DAYS=180
```

`PW_INACTIVE_DAYS` e opcional; quando nao informado, o painel considera 180 dias
para classificar inatividade.

`PW_AUTH_MODE` aceita `password`, `sso`, `ims` ou `gui`. Use `password` para
usuario e senha do ProjectWise, `sso` para login integrado do Windows,
`ims` para Bentley IMS e `gui` para abrir a janela de login local.

Tambem ha um arquivo `.env.example` com o modelo das variaveis. Depois de
alterar o `.env.local`, reinicie o `npm run dev` e tente atualizar novamente.
