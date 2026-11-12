# Limpeza de links nos créditos das dependências

O projeto remove automaticamente o domínio bloqueado e seus subdomínios dos campos `author`, `contributors` e `maintainers` dos arquivos `package.json` em `node_modules`, preservando nomes e informações funcionais.

A limpeza ocorre após `npm install` e `npm ci` pelo `postinstall`, e antes de `npm run build` pelo `prebuild`. Para executá-la manualmente, use `npm run sanitize:package-links`.

Se o domínio aparecer fora dos créditos, o comando falha e exige revisão, sem alterar scripts ou endereços de dependências automaticamente. Links simbólicos não são percorridos. O mecanismo não altera os pacotes no registro npm nem bloqueia conexões de rede. Instalações com `--ignore-scripts` não executam a limpeza automática; nesse caso, execute o comando manual antes de usar o projeto.

Teste: `npm run test:package-links`.

## Prevenção de recorrência

O build agora exige auditoria antes e depois da geração dos arquivos. O workflow
do Azure também executa os testes da política e a auditoria. A verificação inclui
`dist`, source maps, testes e domínios sem protocolo ou com barras escapadas.
O relatório lista apenas hosts e contagens, sem caminhos de URL ou credenciais.

O `postinstall` só age depois da extração dos pacotes: existe uma janela em que
o OneDrive pode analisar o conteúdo original antes da limpeza. `.gitignore` não
controla a sincronização do OneDrive. Mantenha o checkout e `node_modules` em uma
pasta fora do OneDrive e use Git para versionar o código. Outras cópias antigas,+lixeiras, versões e itens em quarentena precisam ser tratados com a equipe de TI.
Esta alteração se limita ao checkout atual; não modifica o OneDrive nem a quarentena.

Não use `--ignore-scripts` sem executar a limpeza e a auditoria manualmente.
O mecanismo não certifica a reputação de todos os domínios nem substitui `npm audit`.
