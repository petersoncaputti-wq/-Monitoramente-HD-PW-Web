# SAML 2.0 — Microsoft Entra ID

Integração preparada, desativada por padrão (`SAML_ENABLED=false`). O painel é o Service Provider (SP), e o Microsoft Entra ID é o Identity Provider (IdP). Não é necessário trocar o banco ou os perfis locais.

## Dados para o administrador do Entra

Considerando `SAML_PUBLIC_ORIGIN=https://seu-painel.azurewebsites.net`:

| Campo no Entra | Valor |
|---|---|
| Identificador (Entity ID) | `https://seu-painel.azurewebsites.net/api/auth/saml/metadata` (ou `SAML_SP_ENTITY_ID` explicitamente configurado) |
| URL de resposta (ACS) | `https://seu-painel.azurewebsites.net/api/auth/saml/acs` |
| URL de entrada | `https://seu-painel.azurewebsites.net/api/auth/saml/login` |
| Metadados do SP | `https://seu-painel.azurewebsites.net/api/auth/saml/metadata` |
| URL de logout SAML | Não configurar nesta versão |

1. Crie uma aplicação empresarial própria no tenant corporativo e configure o SSO SAML com esses valores. Use o domínio HTTPS real e estável do painel.
2. Em **Certificado de assinatura SAML**, selecione **Assinar resposta SAML e asserção** e SHA-256. Baixe o certificado Base64 e forneça seu conteúdo PEM ao responsável pelo painel. A chave privada do Entra nunca é necessária no painel.
3. Envie estes atributos, únicos, na asserção:
   - `http://schemas.microsoft.com/identity/claims/tenantid`: tenant ID.
   - `http://schemas.microsoft.com/identity/claims/objectidentifier`: `user.objectid` (Object ID do usuário neste tenant).
4. Exija atribuição à aplicação e atribua os usuários/grupos autorizados. Configure MFA e Acesso Condicional no Entra conforme a política da organização. A aplicação não impõe um método de senha no AuthnContext.
5. O início do login é sempre pelo painel/URL de entrada. Respostas SAML não solicitadas (IdP-initiated) são rejeitadas; o atalho corporativo deve abrir a URL de entrada.

## Preparação no painel

1. Aplique `azure/saml-schema.sql` com credenciais de migração: localmente, `npm run db:migrate-saml`; no SSH, com variáveis já disponíveis, `node scripts/migrate-saml.mjs`. O script concede à conta da aplicação somente leitura dos vínculos e acesso aos registros transitórios de autenticação.
2. Cadastre o usuário local usando o gerenciamento já existente e defina seu perfil. A integração não cria contas nem altera permissões por claims de e-mail/grupo.
3. Configure as variáveis somente no servidor:

```dotenv
SAML_ENABLED=false
SAML_PUBLIC_ORIGIN=https://seu-painel.azurewebsites.net
SAML_ENTRA_TENANT_ID=<uuid-do-tenant>
SAML_IDP_CERT=<certificado-publico-PEM-do-Entra>
```

`SAML_IDP_CERT` aceita linhas reais ou `\n` literais. Para rotação, concatene o certificado atual e o próximo. Certificados fora da validade não são utilizados. Não use variáveis `VITE_`.

4. Vincule cada identidade explicitamente usando credenciais de migração:

```bash
node scripts/link-saml-user.mjs usuario@empresa.com <object-id-do-usuario-no-Entra>
```

Localmente: `npm run auth:link-saml-user -- usuario@empresa.com <object-id>`. O tenant vem de `SAML_ENTRA_TENANT_ID`. O script não substitui vínculos conflitantes. Para convidados B2B, utilize o Object ID da conta convidada no tenant configurado.

5. Publique, configure `SAML_ENABLED=true` e reinicie a aplicação. O botão **Entrar com Microsoft** aparece quando a configuração é válida. A rota de metadados também fica disponível. Se o certificado ou configuração forem inválidos, somente o login corporativo fica indisponível; o acesso local permanece.
6. Homologue com uma conta comum antes de ampliar a atribuição. Guarde um acesso administrativo local para recuperação.

### Assinatura das solicitações pelo painel (opcional)

Se o Entra exigir AuthnRequests assinadas, configure `SAML_SP_PRIVATE_KEY` e `SAML_SP_CERT` com um par PEM exclusivo do painel, protegido no servidor. O certificado público aparece nos metadados; a chave nunca é enviada ao navegador. A assinatura usa SHA-256. Sem esse par, as solicitações são enviadas sem assinatura, e as respostas/as asserções do Entra continuam obrigatoriamente assinadas.

## Controles implementados

- Validação de assinatura por Node-SAML com certificados configurados, audiência, emissor do tenant e prazo da asserção.
- Destinatário e confirmação bearer validados na asserção assinada.
- `InResponseTo` obrigatório, vinculado à solicitação do mesmo fluxo.
- Estado e vínculo com navegador de uso único, consumidos atomicamente no PostgreSQL, inclusive entre réplicas. Cookie transitório `__Host-monitoramento_saml`, `HttpOnly; Secure; SameSite=None`, com duração de 10 minutos. A sessão normal mantém seu cookie restrito.
- Identificação por tenant + Object ID; somente usuários locais ativos e previamente vinculados entram. E-mail e grupos não concedem acesso nem perfil administrativo.
- Sessão local nova, com duração máxima de oito horas ou o limite local/SessionNotOnOrAfter, prevalecendo o menor.
- Limite de tentativas, limite de tamanho da resposta e mensagens públicas sem XML, claims ou segredos. Não habilite logs de depuração da biblioteca em produção.

## Limites e operação

O logout encerra somente a sessão do painel; não encerra a sessão Microsoft nem implementa Single Logout (SLO). Uma nova entrada pode reutilizar a sessão do Entra. Acesso local continua habilitado nesta etapa de preparação; políticas de MFA do Entra não se aplicam a esse caminho local. Exigir SSO para todos é uma decisão posterior, com política de recuperação própria.

Não há sincronização SCIM nem revogação instantânea de uma sessão local por desativação exclusiva no Entra. Desativar o usuário no painel bloqueia suas sessões nas próximas requisições. Os vínculos não são feitos automaticamente por e-mail. Uma tentativa SAML por navegador de cada vez: iniciar outra substitui o cookie transitório. O painel utiliza o Entra público (`login.microsoftonline.com`), não nuvens soberanas.

Para desativar, configure `SAML_ENABLED=false` e reinicie. Nenhuma tabela precisa ser removida. O certificado deve ser atualizado antes de expirar. Registros transitórios expirados são limpos ao iniciar novos logins.

## Homologação

- Login de usuário vinculado; usuário sem vínculo e usuário inativo negados.
- Usuário comum não recebe privilégios por claims de grupo/perfil.
- Assinatura inválida, certificado diferente, tenant/emissor/audiência/destinatário incorretos, asserção expirada e replay rejeitados.
- Retorno sem cookie/RelayState correspondente rejeitado, inclusive em duas requisições concorrentes.
- Página reconhece a sessão criada no callback, mesmo sem sessionStorage anterior.
- Verificar login real, MFA/Acesso Condicional, rotação de certificado, logout local e múltiplas réplicas no Azure antes de produção.

Referências: [configuração SAML no Entra](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/add-application-portal-setup-sso) e [Node-SAML](https://github.com/node-saml/node-saml).
