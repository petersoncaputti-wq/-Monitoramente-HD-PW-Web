param(
    [string]$EnvPath = (Join-Path (Split-Path -Parent $PSScriptRoot) ".env.local"),
    [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) "public\dados\usuarios-pw-explorer.csv")
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
    param([string]$Path)

    $values = @{}

    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()

        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmed.IndexOf("=")

        if ($separatorIndex -lt 0) {
            continue
        }

        $key = $trimmed.Substring(0, $separatorIndex).Trim()
        $value = $trimmed.Substring($separatorIndex + 1).Trim().Trim('"').Trim("'")
        $values[$key] = $value
    }

    return $values
}

function Get-RequiredValue {
    param(
        [hashtable]$Values,
        [string]$Name
    )

    $value = $Values[$Name]

    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Configure $Name no arquivo .env.local."
    }

    return $value
}

function Get-OptionalIntValue {
    param(
        [hashtable]$Values,
        [string]$Name,
        [int]$DefaultValue
    )

    $value = $Values[$Name]

    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return [int]$value
}

function Get-ValorSeguroPropriedade {
    param(
        [object]$Objeto,
        [string[]]$PossiveisNomes
    )

    if (-not $Objeto) {
        return ""
    }

    foreach ($nome in $PossiveisNomes) {
        $propriedade = $Objeto.PSObject.Properties[$nome]
        if ($propriedade -and $null -ne $propriedade.Value) {
            $valor = $propriedade.Value.ToString().Trim()
            if ($valor -ne "") {
                return $valor
            }
        }
    }

    return ""
}

function Get-StatusUsuario {
    param(
        [object]$UltimoAcesso,
        [datetime]$DataLimite
    )

    if ([string]::IsNullOrWhiteSpace([string]$UltimoAcesso)) {
        return "Inativo"
    }

    if ([string]$UltimoAcesso -eq "Sem registro") {
        return "Inativo"
    }

    $dataUltimoAcesso = [datetime]::MinValue
    $culturaBrasil = [System.Globalization.CultureInfo]::GetCultureInfo("pt-BR")

    if ([datetime]::TryParse([string]$UltimoAcesso, $culturaBrasil, [System.Globalization.DateTimeStyles]::None, [ref]$dataUltimoAcesso)) {
        if ($dataUltimoAcesso.Date -ge $DataLimite.Date) {
            return "Ativo"
        }
    }

    return "Inativo"
}

function Get-DataSeguroPropriedade {
    param(
        [object]$Objeto,
        [string[]]$PossiveisNomes
    )

    if (-not $Objeto) {
        return $null
    }

    foreach ($nome in $PossiveisNomes) {
        $propriedade = $Objeto.PSObject.Properties[$nome]
        if ($propriedade -and $null -ne $propriedade.Value) {
            if ($propriedade.Value -is [datetime]) {
                return $propriedade.Value
            }

            $data = [datetime]::MinValue
            if ([datetime]::TryParse([string]$propriedade.Value, [ref]$data)) {
                return $data
            }
        }
    }

    return $null
}

function Format-DataProjetoWise {
    param([object]$Valor)

    if ($null -eq $Valor) {
        return ""
    }

    if ($Valor -is [datetime]) {
        return $Valor.ToString("dd/MM/yyyy")
    }

    $data = [datetime]::MinValue
    if ([datetime]::TryParse([string]$Valor, [ref]$data)) {
        return $data.ToString("dd/MM/yyyy")
    }

    return [string]$Valor
}

function Get-UltimoAcessoUsuario {
    param(
        [object]$Usuario,
        [string]$StartDate,
        [string]$EndDate
    )

    try {
        $auditoria = Get-PWUserAuditTrailRecords `
            -Users $Usuario `
            -StartDate $StartDate `
            -EndDate $EndDate `
            -WarningAction SilentlyContinue `
            -ErrorAction Stop

        $ultimoLogin = @($auditoria |
            Where-Object { $_.Action -eq "User Login" } |
            Sort-Object ActionDate -Descending |
            Select-Object -First 1)

        if (-not $ultimoLogin -or $ultimoLogin.Count -eq 0) {
            return [PSCustomObject]@{
                UltimoAcesso = "Sem registro"
                Consulta     = "OK"
                Mensagem     = ""
            }
        }

        $actionDate = $ultimoLogin[0].ActionDate

        if ($actionDate -is [datetime]) {
            $ultimoAcesso = $actionDate.ToString("dd/MM/yyyy")
        }
        else {
            $dataUltimoAcesso = [datetime]::MinValue
            if ([datetime]::TryParse([string]$actionDate, [ref]$dataUltimoAcesso)) {
                $ultimoAcesso = $dataUltimoAcesso.ToString("dd/MM/yyyy")
            }
            else {
                $ultimoAcesso = [string]$actionDate
            }
        }

        return [PSCustomObject]@{
            UltimoAcesso = $ultimoAcesso
            Consulta     = "OK"
            Mensagem     = ""
        }
    }
    catch {
        return [PSCustomObject]@{
            UltimoAcesso = "Erro ao consultar Audit Trail"
            Consulta     = "Erro"
            Mensagem     = $_.Exception.Message
        }
    }
}

$envValues = Read-DotEnv -Path $EnvPath
$datasourceName = Get-RequiredValue -Values $envValues -Name "PW_DATASOURCE_NAME"
$username = Get-RequiredValue -Values $envValues -Name "PW_USERNAME"
$password = Get-RequiredValue -Values $envValues -Name "PW_PASSWORD"
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$inactiveDays = Get-OptionalIntValue -Values $envValues -Name "PW_INACTIVE_DAYS" -DefaultValue 180

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$loggedIn = $false

try {
    Import-Module PWPS_DAB -ErrorAction Stop

    New-PWLogin `
        -DatasourceName $datasourceName `
        -UserName $username `
        -Password $securePassword `
        -DoNotCreateWorkingDirectory | Out-Null

    $loggedIn = $true
    $usuarioAtual = Get-PWCurrentUser -ErrorAction SilentlyContinue
    $idUsuarioAtual = Get-ValorSeguroPropriedade -Objeto $usuarioAtual -PossiveisNomes @("ID", "Id", "UserID", "UserId")
    $nomeUsuarioAtual = Get-ValorSeguroPropriedade -Objeto $usuarioAtual -PossiveisNomes @("Name", "UserName", "LoginName")

    $dataLimiteStatus = (Get-Date).Date.AddDays(-$inactiveDays)
    $dataLimiteNovoUsuario = (Get-Date).Date.AddDays(-30)
    $startDate = $dataLimiteStatus.ToString("yyyy-MM-dd")
    $endDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")

    $usuarios = @(Get-PWUsersByMatch)
    $usuariosDesabilitados = @(Get-PWUsersByMatch -Disabled -ErrorAction SilentlyContinue)
    $idsDesabilitados = @{}
    $nomesDesabilitados = @{}

    foreach ($usuarioDesabilitado in $usuariosDesabilitados) {
        $idDesabilitado = Get-ValorSeguroPropriedade -Objeto $usuarioDesabilitado -PossiveisNomes @("ID", "Id", "UserID", "UserId")
        $nomeDesabilitado = Get-ValorSeguroPropriedade -Objeto $usuarioDesabilitado -PossiveisNomes @("Name", "UserName", "LoginName")

        if (-not [string]::IsNullOrWhiteSpace($idDesabilitado)) {
            $idsDesabilitados[$idDesabilitado] = $true
        }

        if (-not [string]::IsNullOrWhiteSpace($nomeDesabilitado)) {
            $nomesDesabilitados[$nomeDesabilitado.ToLowerInvariant()] = $true
        }
    }

    $resultados = New-Object System.Collections.Generic.List[object]

    foreach ($usuario in $usuarios) {
        $nome = Get-ValorSeguroPropriedade -Objeto $usuario -PossiveisNomes @("Name", "UserName", "LoginName")
        $email = Get-ValorSeguroPropriedade -Objeto $usuario -PossiveisNomes @("Email", "EmailAddress")
        $id = Get-ValorSeguroPropriedade -Objeto $usuario -PossiveisNomes @("ID", "Id", "UserID", "UserId")
        $descricao = Get-ValorSeguroPropriedade -Objeto $usuario -PossiveisNomes @("Description", "Descricao")
        $dataCriacao = Get-DataSeguroPropriedade -Objeto $usuario -PossiveisNomes @("CreationDate", "CreatedDate", "Created", "CreateDate")

        $consultaAcesso = Get-UltimoAcessoUsuario -Usuario $usuario -StartDate $startDate -EndDate $endDate
        $statusAcesso = Get-StatusUsuario -UltimoAcesso $consultaAcesso.UltimoAcesso -DataLimite $dataLimiteStatus

        $estaDesabilitado = $false
        if ($id -ne "" -and $idsDesabilitados.ContainsKey($id)) {
            $estaDesabilitado = $true
        }
        if ($nome -ne "" -and $nomesDesabilitados.ContainsKey($nome.ToLowerInvariant())) {
            $estaDesabilitado = $true
        }

        $statusProjectWise = if ($estaDesabilitado) { "Inativo/Desabilitado" } else { "Ativo/Habilitado" }
        $usuarioNovo = $false
        if ($null -ne $dataCriacao) {
            $usuarioNovo = $dataCriacao.Date -ge $dataLimiteNovoUsuario
        }

        $descricaoEcs = $descricao -match '(?i)ECS'
        $possuiExcecaoInatividade = -not $estaDesabilitado -and ($usuarioNovo -or $descricaoEcs)
        $statusFinal = if ($estaDesabilitado) {
            "Inativo"
        }
        elseif ($statusAcesso -eq "Inativo" -and -not $possuiExcecaoInatividade) {
            "Inativo"
        }
        else {
            "Ativo"
        }

        $elegivelExclusao = "Nao"
        $motivo = ""

        if ($statusAcesso -eq "Inativo" -and $possuiExcecaoInatividade) {
            $motivosExcecao = @()

            if ($usuarioNovo) {
                $motivosExcecao += "usuario criado ha menos de 30 dias"
            }

            if ($descricaoEcs) {
                $motivosExcecao += "descricao contem ECS"
            }

            $motivo = "Excecao de inatividade: " + ($motivosExcecao -join " e ")
        }

        if ($statusFinal -eq "Inativo" -and $consultaAcesso.Consulta -eq "OK") {
            $elegivelExclusao = "Sim"
            if ($statusAcesso -eq "Inativo" -and $estaDesabilitado) {
                $motivo = "Usuario sem login nos ultimos $inactiveDays dias e ja inativo/desabilitado no ProjectWise"
            }
            elseif ($statusAcesso -eq "Inativo") {
                $motivo = "Usuario sem login nos ultimos $inactiveDays dias"
            }
            else {
                $motivo = "Usuario ja inativo/desabilitado no ProjectWise"
            }
        }

        if ($consultaAcesso.Consulta -eq "Erro") {
            $motivo = "Nao elegivel: erro ao consultar Audit Trail - $($consultaAcesso.Mensagem)"
        }

        if (($id -ne "" -and $idUsuarioAtual -ne "" -and $id -eq $idUsuarioAtual) -or ($nome -ne "" -and $nomeUsuarioAtual -ne "" -and $nome -ieq $nomeUsuarioAtual)) {
            $elegivelExclusao = "Nao"
            $motivo = "Nao elegivel: usuario conectado na sessao atual"
        }

        $resultados.Add([PSCustomObject]@{
            Nome                 = $nome
            Email                = $email
            ID                   = $id
            "Data criacao"       = Format-DataProjetoWise $dataCriacao
            Descricao            = $descricao
            "Ultimo acesso"      = $consultaAcesso.UltimoAcesso
            Status               = $statusFinal
            "Status acesso"      = $statusAcesso
            "Status ProjectWise" = $statusProjectWise
            "Elegivel exclusao"  = $elegivelExclusao
            Motivo               = $motivo
            "Acao executada"     = ""
            Resultado            = ""
        })
    }

    $resultados |
        Sort-Object Nome |
        Export-Csv -LiteralPath $OutputPath -NoTypeInformation -Encoding UTF8

    [PSCustomObject]@{
        outputPath = $OutputPath
        users = $resultados.Count
        inactiveDays = $inactiveDays
        exportedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json -Compress
}
finally {
    if ($loggedIn) {
        Undo-PWLogin | Out-Null
    }
}
