<# 
.SYNOPSIS
Exporta dados dos projetos do ProjectWise Explorer para CSV no layout do modelo de criacao de projeto.

.EXAMPLE
.\scripts\Export-PWExplorerProjects.ps1 -UseGui

.EXAMPLE
.\scripts\Export-PWExplorerProjects.ps1 -DatasourceName "Servidor:Datasource" -BentleyIMS -NonAdminLogin

.EXAMPLE
.\scripts\Export-PWExplorerProjects.ps1 -DatasourceName "Servidor:Datasource" -FolderPath "Projetos\2026" -OutputPath ".\exports\projetos-pw.csv"
#>

[CmdletBinding()]
param(
    [string]$DatasourceName,
    [string]$FolderPath,
    [string]$ProjectTypeName,
    [string]$OutputPath = ".\exports\modelo-criacao-projeto-$((Get-Date).ToString('yyyyMMdd-HHmmss')).csv",
    [string]$UserName,
    [securestring]$Password,
    [switch]$UseGui,
    [switch]$BentleyIMS,
    [switch]$NonAdminLogin,
    [switch]$OnlyConnectedProjects,
    [switch]$OnlyNonConnectedProjects,
    [switch]$KeepSessionOpen,
    [switch]$IncludeDiagnostics
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FirstValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,

        [Parameter(Mandatory = $true)]
        [string[]]$Names
    )

    foreach ($name in $Names) {
        $property = $InputObject.PSObject.Properties[$name]
        if ($null -ne $property -and $null -ne $property.Value -and "$($property.Value)".Trim().Length -gt 0) {
            return $property.Value
        }
    }

    return $null
}

function ConvertTo-NormalizedKey {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return ''
    }

    $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
    $builder = [System.Text.StringBuilder]::new()

    foreach ($char in $normalized.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark -and [char]::IsLetterOrDigit($char)) {
            [void]$builder.Append([char]::ToLowerInvariant($char))
        }
    }

    return $builder.ToString()
}

function Get-ProjectBagValues {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Project
    )

    $values = @{}
    $propertyBags = @(
        'ProjectProperties',
        'Properties',
        'CustomProperties',
        'ProjectPropertyValues'
    )

    foreach ($bagName in $propertyBags) {
        $bag = $Project.PSObject.Properties[$bagName]
        if ($null -eq $bag -or $null -eq $bag.Value) {
            continue
        }

        if ($bag.Value -is [System.Collections.IDictionary]) {
            foreach ($key in $bag.Value.Keys) {
                if ($null -ne $key) {
                    $values[(ConvertTo-NormalizedKey "$key")] = $bag.Value[$key]
                }
            }

            continue
        }

        foreach ($item in @($bag.Value)) {
            $name = Get-FirstValue -InputObject $item -Names @('Name', 'PropertyName', 'ColumnName', 'AttributeName')
            $value = Get-FirstValue -InputObject $item -Names @('Value', 'PropertyValue', 'ColumnValue', 'AttributeValue')

            if ($null -ne $name) {
                $values[(ConvertTo-NormalizedKey "$name")] = $value
            }
        }
    }

    return $values
}

function Get-MappedValue {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Project,

        [Parameter(Mandatory = $true)]
        [hashtable]$BagValues,

        [Parameter(Mandatory = $true)]
        [string[]]$Candidates
    )

    foreach ($candidate in $Candidates) {
        $property = $Project.PSObject.Properties[$candidate]
        if ($null -ne $property -and $null -ne $property.Value -and "$($property.Value)".Trim().Length -gt 0) {
            return $property.Value
        }
    }

    foreach ($candidate in $Candidates) {
        $key = ConvertTo-NormalizedKey $candidate
        if ($BagValues.ContainsKey($key) -and $null -ne $BagValues[$key] -and "$($BagValues[$key])".Trim().Length -gt 0) {
            return $BagValues[$key]
        }
    }

    return ''
}

function Get-ProjectPath {
    param([object]$Project)

    $path = Get-FirstValue -InputObject $Project -Names @('FullPath', 'Path', 'FolderPath')
    if ($null -ne $path -and "$path".Trim().Length -gt 0) {
        return "$path"
    }

    try {
        $method = $Project.PSObject.Methods['GetFullPath']
        if ($null -ne $method) {
            $fullPath = $Project.GetFullPath()
            if ($null -ne $fullPath) {
                return "$fullPath"
            }
        }
    }
    catch {
        return ''
    }

    return ''
}

function Get-PathSegment {
    param(
        [string]$Path,
        [int]$Index
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ''
    }

    $segments = @($Path -split '[\\/]' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($segments.Count -le $Index) {
        return ''
    }

    return $segments[$Index]
}

function Get-ConcessionAcronym {
    param([string]$ConcessionName)

    $known = @{
        'ecoviasaraguaia' = 'ECA'
        'ecoviasdocerrado' = 'ECO050'
        'ecoviasdosimigrantes' = 'ECOVIAS'
        'ecopistas' = 'ECP'
        'ecoponte' = 'ECPONTE'
        'ecosul' = 'ECS'
        'ecoriominas' = 'ECRIO'
        'ecorodovias' = 'ECO'
    }

    $key = ConvertTo-NormalizedKey $ConcessionName
    if ($known.ContainsKey($key)) {
        return $known[$key]
    }

    return ''
}

function Add-PropertyIfPresent {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.Specialized.OrderedDictionary]$Row,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [object]$Value
    )

    if ($null -ne $Value) {
        $Row[$Name] = $Value
    }
}

function Add-Diagnostics {
    param(
        [Parameter(Mandatory = $true)]
        [System.Collections.Specialized.OrderedDictionary]$Row,

        [Parameter(Mandatory = $true)]
        [object]$Project
    )

    Add-PropertyIfPresent -Row $Row -Name 'PW_Caminho' -Value (Get-ProjectPath -Project $Project)
    Add-PropertyIfPresent -Row $Row -Name 'PW_IDProjeto' -Value (Get-FirstValue -InputObject $Project -Names @('ProjectID', 'ProjectId', 'ID', 'FolderID', 'FolderId'))
    Add-PropertyIfPresent -Row $Row -Name 'PW_GUID' -Value (Get-FirstValue -InputObject $Project -Names @('GUID', 'Guid', 'ProjectGUID', 'ProjectGuid'))
    Add-PropertyIfPresent -Row $Row -Name 'PW_TipoProjeto' -Value (Get-FirstValue -InputObject $Project -Names @('ProjectTypeName', 'ProjectType', 'RichProjectTypeName'))
}

if ($OnlyConnectedProjects -and $OnlyNonConnectedProjects) {
    throw 'Use apenas um filtro: -OnlyConnectedProjects ou -OnlyNonConnectedProjects.'
}

Import-Module pwps_dab

$loginWasCreated = $false

try {
    $isLoggedIn = $false
    try {
        $loginStatus = Get-PWLoginStatus
        $isLoggedIn = [bool]$loginStatus
    }
    catch {
        $isLoggedIn = $false
    }

    if (-not $isLoggedIn) {
        $loginParams = @{}

        if ($UseGui) {
            $loginParams.UseGui = $true
        }
        else {
            if ([string]::IsNullOrWhiteSpace($DatasourceName)) {
                throw 'Informe -DatasourceName "Servidor:Datasource" ou use -UseGui para escolher o datasource na tela de login.'
            }

            $loginParams.DatasourceName = $DatasourceName

            if (-not [string]::IsNullOrWhiteSpace($UserName)) {
                $loginParams.UserName = $UserName

                if ($null -eq $Password) {
                    $Password = Read-Host -Prompt 'Senha do ProjectWise' -AsSecureString
                }

                $loginParams.Password = $Password
            }

            if ($BentleyIMS) {
                $loginParams.BentleyIMS = $true
            }
        }

        if ($NonAdminLogin) {
            $loginParams.NonAdminLogin = $true
        }

        $loginParams.DoNotCreateWorkingDirectory = $true

        $loginOk = New-PWLogin @loginParams
        if (-not $loginOk) {
            throw 'Nao foi possivel fazer login no ProjectWise.'
        }

        $loginWasCreated = $true
    }

    $searchParams = @{
        PopulatePaths = $true
        PopulateProjectProperties = $true
    }

    if (-not [string]::IsNullOrWhiteSpace($FolderPath)) {
        $searchParams.FolderPath = $FolderPath
    }

    if (-not [string]::IsNullOrWhiteSpace($ProjectTypeName)) {
        $searchParams.ProjectTypeName = $ProjectTypeName
    }

    if ($OnlyConnectedProjects) {
        $searchParams.OnlyConnectedProjects = $true
    }

    if ($OnlyNonConnectedProjects) {
        $searchParams.OnlyNonConnectedProjects = $true
    }

    Write-Host 'Buscando Work Areas/Rich Projects no ProjectWise...'
    $projects = @(Get-PWRichProjects @searchParams)

    $rows = foreach ($project in $projects) {
        $bagValues = Get-ProjectBagValues -Project $project
        $path = Get-ProjectPath -Project $project
        $concessionName = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @(
            'Nome Concessao',
            'NomeConcessao',
            'Concessao',
            'Concessionaria',
            'Concessionária',
            'Unidade',
            'Empresa',
            'PROJECT_Nome_Concessao',
            'PROJECT_Concessao'
        )

        if ([string]::IsNullOrWhiteSpace($concessionName)) {
            $concessionName = Get-PathSegment -Path $path -Index 0
        }

        $siglaConcessao = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @(
            'Sigla Concessao',
            'SiglaConcessao',
            'Sigla',
            'CodConcessao',
            'CodigoConcessao',
            'Código Concessao',
            'PROJECT_Sigla_Concessao',
            'PROJECT_Sigla'
        )

        if ([string]::IsNullOrWhiteSpace($siglaConcessao)) {
            $siglaConcessao = Get-ConcessionAcronym -ConcessionName $concessionName
        }

        $row = [ordered]@{
            'Nome Concessao' = $concessionName
            'Sigla Concessao' = $siglaConcessao
            'Nome Projeto' = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @('Nome Projeto', 'NomeProjeto', 'ProjectName', 'Name', 'FolderName', 'PROJECT_Project_Name', 'PROJECT_Nome_Projeto')
            'Descricao' = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @('Descricao', 'Descrição', 'Description', 'ProjectDescription', 'Desc', 'PROJECT_Descricao')
            'Projetista' = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @('Projetista', 'Designer', 'Empresa Projetista', 'EmpresaProjetista', 'PROJECT_Projetista')
            'Gestor Engenharia' = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @('Gestor Engenharia', 'GestorEngenharia', 'Gestor', 'Coordenador Engenharia', 'PROJECT_Gestor_Engenharia')
            'Assistente Engenharia' = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @('Assistente Engenharia', 'AssistenteEngenharia', 'Assistente', 'PROJECT_Assistente_Engenharia')
            'Poder Concedente' = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @('Poder Concedente', 'PoderConcedente', 'Agencia Reguladora', 'Agência Reguladora', 'Concedente', 'PROJECT_Poder_Concedente')
            'TH' = Get-MappedValue -Project $project -BagValues $bagValues -Candidates @('TH', 'T H', 'Termo Homologacao', 'TermoHomologacao', 'PROJECT_TH')
        }

        if ($IncludeDiagnostics) {
            Add-Diagnostics -Row $row -Project $project
        }

        [pscustomobject]$row
    }

    $resolvedOutputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath)
    $outputDirectory = Split-Path -Path $resolvedOutputPath -Parent

    if (-not [string]::IsNullOrWhiteSpace($outputDirectory) -and -not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory | Out-Null
    }

    $rows | Export-Csv -Path $resolvedOutputPath -NoTypeInformation -Encoding UTF8 -Delimiter ';'

    Write-Host "Exportacao concluida: $resolvedOutputPath"
    Write-Host "Projetos exportados: $($rows.Count)"
}
finally {
    if ($loginWasCreated -and -not $KeepSessionOpen) {
        Undo-PWLogin
    }
}
