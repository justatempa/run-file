$ErrorActionPreference = 'Stop'

$root = Get-Location
$envPath = Join-Path $root '.env'
$examplePath = Join-Path $root '.env.example'

if (-not (Test-Path $envPath)) {
    if (Test-Path $examplePath) {
        Copy-Item $examplePath $envPath
        Write-Host '[OK] Created .env from .env.example'
    }
    else {
        throw '.env.example not found.'
    }
}

$content = Get-Content -Raw -Path $envPath

function Set-Or-Add {
    param(
        [string]$Key,
        [string]$Value
    )
    if ($content -match "(?m)^$Key=") {
        $content = [regex]::Replace($content, "(?m)^$Key=.*$", "$Key=$Value")
    }
    else {
        if ($content -and -not $content.EndsWith("`n")) {
            $content += "`n"
        }
        $content += "$Key=$Value"
    }
}

function Is-Missing-Or-Empty {
    param(
        [string]$Key
    )
    $match = [regex]::Match($content, "(?m)^$Key=(.*)$")
    if (-not $match.Success) { return $true }
    $value = $match.Groups[1].Value.Trim()
    if ($value -eq '') { return $true }
    if ($value -eq '""') { return $true }
    if ($value -eq "''") { return $true }
    return $false
}

if (Is-Missing-Or-Empty -Key 'AUTH_SECRET') {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    $secret = [Convert]::ToBase64String($bytes)
    Set-Or-Add -Key 'AUTH_SECRET' -Value ('"' + $secret + '"')
    Write-Host '[OK] AUTH_SECRET set.'
}

if (Is-Missing-Or-Empty -Key 'DATABASE_URL') {
    Set-Or-Add -Key 'DATABASE_URL' -Value '"file:./db.sqlite"'
    Write-Host '[OK] DATABASE_URL set.'
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($envPath, $content, $utf8NoBom)
