# Revisão de URLs — 09/11/2026

## Atualização: remoção do mapa híbrido

Após a revisão inicial, foi solicitada a remoção do mapa híbrido. A opção e seu
carregamento vetorial foram removidos, preservando Mapa e Satélite com Leaflet.
Foram desinstalados `esri-leaflet`, `esri-leaflet-vector` e `maplibre-gl`, com
atualização do lockfile e remoção de 43 pacotes da instalação local.
`npm ls` confirmou ausência de `kind-of`, `global-prefix` e das bibliotecas
removidas. Não há referências a esses pacotes no código da aplicação ou lockfile.
Build, testes de inventário/ficha/mapa e testes da política de URLs passaram.
O relato abaixo registra a situação anterior à remoção. Cópias antigas no
OneDrive não foram alteradas.

## Evidências e escopo

Revisados os pontos de URL e chamadas de rede em `src`, `server`, `api`, scripts
e workflow de publicação, além de uma varredura textual das dependências e build.
O inventário reproduzível está em `package-link-audit.json`.
Não houve acesso aos domínios bloqueados, ao OneDrive corporativo ou à quarentena.

O caminho do alerta com `nanomatch` não existe na árvore instalada deste checkout.
`npm ls nanomatch kind-of --all` identifica a cadeia atual:
`maplibre-gl@4.7.1 → global-prefix@4.0.0 → kind-of@6.0.3`.
Os créditos do manifesto local de `kind-of` já estavam higienizados antes desta revisão.
Isso não identifica qual cópia foi examinada pelo OneDrive nem comprova ausência de comprometimento da estação.

## Correções

- Removidas URLs bloqueadas literais dos testes; os casos são montados em memória
  e gravados somente em diretório temporário, removido ao final.
- Auditoria ampliada para build, source maps, testes, formatos adicionais,
  domínios sem protocolo e URLs escapadas. Código suspeito bloqueia o processo;
  não é reescrito automaticamente.
- Auditoria obrigatória antes e depois do build e validação no CI do Azure.
- Inventário de hosts e testes de regressão para as novas regras.

O mapa híbrido usa `esri-leaflet-vector`, que declara MapLibre 2/3/4 como peer.
Não foi substituída a biblioteca: remover MapLibre quebraria essa funcionalidade,
e trocar por outra versão principal exige validar a integração. O achado local
é referência de créditos já removida, não evidência de execução dessa URL.

## URLs funcionais e limites

As URLs fixas do código consultado correspondem aos mapas OpenStreetMap/Esri,
Google Fonts, API Kartado e identidade Microsoft. URIs de claims SAML são
identificadores. Endereços vindos de configuração e dados remotos não têm seu
conteúdo validado por uma varredura textual. Nenhum desses serviços recebe um
certificado de reputação por esta revisão.

Cinco indicadores adicionais correspondem a exemplos em declarações de tipos
do Node e a uma credencial fictícia em teste de inventário; não são credenciais
operacionais. A lista local de bloqueio conserva os indicadores como dados inertes.

## Validação

- Testes de higienização e bloqueio: aprovados, incluindo script de instalação,
  build/source map, domínio sem protocolo, URL escapada e domínio de sufixo distinto.
- Build TypeScript/Vite: aprovado; permanece aviso de tamanho de chunks.
- Integrações de inventário, ficha e mapa: aprovadas.
- SAML: aprovado.
- Auditoria local: sem ocorrências dos domínios bloqueados fora da política.
- `npm audit --json`: duas tentativas falharam com `ECONNRESET` no endpoint do npm.
  A análise de vulnerabilidades publicadas está pendente e não pode ser considerada aprovada.

## Ação operacional necessária

Evitar checkouts com dependências dentro de pastas sincronizadas pelo OneDrive.
A limpeza pós-instalação não elimina a janela entre extração e análise pelo antivírus.
O checkout atual fica em Downloads; confirmar com TI se essa pasta é sincronizada.
Pedir à TI o caminho completo e a data do novo evento para localizar outras cópias
ou versões antigas. Não restaurar a quarentena apenas para silenciar o alerta.
