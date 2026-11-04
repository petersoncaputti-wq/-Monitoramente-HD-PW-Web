# Limpeza de links nos créditos das dependências

O projeto remove automaticamente o domínio bloqueado e seus subdomínios dos campos `author`, `contributors` e `maintainers` dos arquivos `package.json` em `node_modules`, preservando nomes e informações funcionais.

A limpeza ocorre após `npm install` e `npm ci` pelo `postinstall`, e antes de `npm run build` pelo `prebuild`. Para executá-la manualmente, use `npm run sanitize:package-links`.

Se o domínio aparecer fora dos créditos, o comando falha e exige revisão, sem alterar scripts ou endereços de dependências automaticamente. Links simbólicos não são percorridos. O mecanismo não altera os pacotes no registro npm nem bloqueia conexões de rede. Instalações com `--ignore-scripts` não executam a limpeza automática; nesse caso, execute o comando manual antes de usar o projeto.

Teste: `npm run test:package-links`.
