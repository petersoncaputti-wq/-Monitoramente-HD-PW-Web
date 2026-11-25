# Endpoint do coletor de armazenamento

`POST /api/storage-readings` recebe uma leitura por requisição e grava no PostgreSQL existente. Não exige migração adicional quando `storage_readings` e seu índice único já estão instalados. A tela atual consulta essa mesma tabela; a atualização periódica da tela é uma etapa separada.

## Configuração

Gere uma chave com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
Configure `STORAGE_COLLECTOR_TOKEN` no ambiente do backend (localmente em `.env.local`) e reinicie o servidor. Use uma chave exclusiva, de pelo menos 32 caracteres. Não use prefixo `VITE_` nem inclua a chave no repositório ou no frontend. Em produção, utilize HTTPS.

O endpoint retorna 503 sem chave configurada, 401 para credencial incorreta, 400 para dados inválidos e 200 após gravar. Limite: 60 requisições por minuto por IP; ao receber 429, aguarde o intervalo indicado antes de reenviar.

## Envio pelo PowerShell

Depois da gravação do CSV no script existente, acrescente:

```powershell
# Configure essas variáveis no ambiente da conta que executa a tarefa.
$endpoint = $env:STORAGE_COLLECTOR_URL # https://seu-painel/api/storage-readings
$token = $env:STORAGE_COLLECTOR_TOKEN

try {
    if (-not $endpoint -or -not $token) { throw "Configure URL e token do coletor." }
    $json = $data | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri $endpoint -Method Post `
        -Headers @{ Authorization = "Bearer $token" } `
        -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($json)) `
        -TimeoutSec 30 -ErrorAction Stop | Out-Null
    Write-Output "OK: Leitura enviada ao painel."
} catch {
    Write-Error "Falha no envio ao painel; CSV preservado. $($_.Exception.Message)"
    exit 1
}
```

O corpo usa os mesmos campos do script original: `Data`, `Hora`, `Computador`, `Unidade`, `TotalGB`, `UsadoGB`, `LivreGB`, `PercentualUsado`, `PercentualLivre`. Valores numéricos devem ser números JSON. Data e hora são interpretadas como horário de São Paulo (UTC-03:00). A capacidade deve ser positiva; totais e percentuais devem ser consistentes, com tolerância ao arredondamento de duas casas.

Reenviar a mesma data/hora, computador e unidade atualiza a leitura sem duplicação. Nomes de computador e unidade são normalizados para maiúsculas. Este exemplo preserva o CSV em falhas, mas ainda não implementa fila nem reenvio automático de pendências. A chave permite enviar leituras de armazenamento, sem conceder acesso às demais APIs ou ao banco.

## Verificação local

Execute `node scripts/test-storage-readings.mjs`. Os testes HTTP usam persistência simulada; para validar o ambiente publicado, envie uma leitura real e confira sua presença na tela de armazenamento.
