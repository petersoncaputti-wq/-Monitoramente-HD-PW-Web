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
        [string]$Name,
        [string]$Path
    )

    $value = $Values[$Name]

    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Configure $Name no arquivo $Path. Exemplo: PW_DATASOURCE_NAME=NomeDoDatasource"
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

function Get-OptionalValue {
    param(
        [hashtable]$Values,
        [string]$Name,
        [string]$DefaultValue
    )

    $value = $Values[$Name]

    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
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
$datasourceName = Get-RequiredValue -Values $envValues -Name "PW_DATASOURCE_NAME" -Path $EnvPath
$authMode = (Get-OptionalValue -Values $envValues -Name "PW_AUTH_MODE" -DefaultValue "password").ToLowerInvariant()
$inactiveDays = Get-OptionalIntValue -Values $envValues -Name "PW_INACTIVE_DAYS" -DefaultValue 180

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$loggedIn = $false

try {
    Import-Module PWPS_DAB -ErrorAction Stop

    switch ($authMode) {
        "password" {
            $username = Get-RequiredValue -Values $envValues -Name "PW_USERNAME" -Path $EnvPath
            $password = Get-RequiredValue -Values $envValues -Name "PW_PASSWORD" -Path $EnvPath
            $securePassword = ConvertTo-SecureString $password -AsPlainText -Force

            New-PWLogin `
                -DatasourceName $datasourceName `
                -Password $securePassword `
                -UserName $username `
                -ErrorAction Stop | Out-Null
        }
        "sso" {
            New-PWLogin `
                -DatasourceName $datasourceName `
                -DoNotCreateWorkingDirectory `
                -NonAdminLogin `
                -ErrorAction Stop | Out-Null
        }
        "ims" {
            New-PWLogin `
                -DatasourceName $datasourceName `
                -BentleyIMS `
                -ErrorAction Stop | Out-Null
        }
        "gui" {
            New-PWLogin `
                -DatasourceName $datasourceName `
                -UseGui `
                -NonAdminLogin `
                -DoNotCreateWorkingDirectory `
                -ErrorAction Stop | Out-Null
        }
        default {
            throw "PW_AUTH_MODE invalido no arquivo $EnvPath. Use password, sso, ims ou gui."
        }
    }

    $usuarioAtual = Get-PWCurrentUser -ErrorAction Stop

    $loggedIn = $true
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

        $elegivelExclusao = "Não"
        $motivo = ""

        if ($statusAcesso -eq "Inativo" -and $possuiExcecaoInatividade) {
            $motivosExcecao = @()

            if ($usuarioNovo) {
                $motivosExcecao += "usuário criado há menos de 30 dias"
            }

            if ($descricaoEcs) {
                $motivosExcecao += "descrição contém ECS"
            }

            $motivo = "Exceção de inatividade: " + ($motivosExcecao -join " e ")
        }

        if ($statusFinal -eq "Inativo" -and $consultaAcesso.Consulta -eq "OK") {
            $elegivelExclusao = "Sim"
            if ($statusAcesso -eq "Inativo" -and $estaDesabilitado) {
                $motivo = "Usuário sem login nos últimos $inactiveDays dias e já inativo/desabilitado no ProjectWise"
            }
            elseif ($statusAcesso -eq "Inativo") {
                $motivo = "Usuário sem login nos últimos $inactiveDays dias"
            }
            else {
                $motivo = "Usuário já inativo/desabilitado no ProjectWise"
            }
        }

        if ($consultaAcesso.Consulta -eq "Erro") {
            $motivo = "Não elegível: erro ao consultar Audit Trail - $($consultaAcesso.Mensagem)"
        }

        if (($id -ne "" -and $idUsuarioAtual -ne "" -and $id -eq $idUsuarioAtual) -or ($nome -ne "" -and $nomeUsuarioAtual -ne "" -and $nome -ieq $nomeUsuarioAtual)) {
            $elegivelExclusao = "Não"
            $motivo = "Não elegível: usuário conectado na sessão atual"
        }

        $resultados.Add([PSCustomObject]@{
            Nome                 = $nome
            Email                = $email
            ID                   = $id
            "Data criação"       = Format-DataProjetoWise $dataCriacao
            Descricao            = $descricao
            "Ultimo acesso"      = $consultaAcesso.UltimoAcesso
            Status               = $statusFinal
            "Status acesso"      = $statusAcesso
            "Status ProjectWise" = $statusProjectWise
            "Elegivel exclusao"  = $elegivelExclusao
            Motivo               = $motivo
            "Ação executada"     = ""
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
