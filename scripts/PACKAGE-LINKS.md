# Verificação de URLs

`npm run sanitize:package-links` remove os domínios de `package-link-policy.json`
da documentação e dos créditos dos manifestos em node_modules. Também roda em
postinstall e prebuild. Ocorrências em outros campos do manifesto interrompem a
limpeza e exigem revisão. Código executável não é alterado.

`npm run audit:package-links` verifica arquivos de texto do projeto e das
dependências, incluindo código. Retorna código 1 quando encontra domínio
bloqueado. IPs literais, punycode e credenciais em URLs são indicadores para
revisão, não prova de ameaça. Exemplos e testes podem gerar falsos positivos.
A suíte também é verificada; os endereços de teste são montados em memória.
Builds, source maps, referências sem protocolo e URLs escapadas são verificados.
Somente a lista de indicadores e o relatório gerado são excluídos, além do Git
e de arquivos de ambiente privados. Links não são acessados e segredos da URL não são impressos.

Para acrescentar um domínio confirmado pela equipe de segurança, edite
blockedDomains no JSON e execute a limpeza, a auditoria e o build.
Não há consulta a serviço de reputação: domínios desconhecidos podem passar
pela triagem. Esta rotina não substitui o antivírus ou a análise de dependências.
