$ErrorActionPreference = "Stop"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "    ..  $msg" -ForegroundColor DarkGray }
function Stop-Run($msg)   { Write-Host "    FAIL: $msg" -ForegroundColor Red; exit 1 }

function Invoke-Native {
    param([string]$Label, [scriptblock]$Command)
    $global:LASTEXITCODE = 0
    try { & $Command }
    catch { Stop-Run "$Label threw: $($_.Exception.Message)" }
    if ($LASTEXITCODE -ne 0) { Stop-Run "$Label exited with code $LASTEXITCODE" }
}

function Test-DevPackage([string]$Name) {
    Test-Path (Join-Path "node_modules" (Join-Path $Name "package.json"))
}

function Ensure-DevPackage([string]$Name) {
    if (Test-DevPackage $Name) { Write-Ok "$Name installed"; return }
    Write-Info "$Name missing, installing as devDependency"
    Invoke-Native "npm i -D $Name" { npm i -D $Name }
    if (-not (Test-DevPackage $Name)) { Stop-Run "$Name still missing after install" }
    Write-Ok "$Name installed"
}

Write-Step "Project root"
if (-not (Test-Path ".\package.json")) { Stop-Run "package.json not found. Run from project root." }
Write-Ok "package.json found"

Write-Step "Node.js and npm"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-Run "Node.js not found. Install LTS: winget install OpenJS.NodeJS.LTS  (then reopen the terminal)"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Stop-Run "npm not found. Reinstall Node.js LTS." }
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 18) { Stop-Run "Node $nodeMajor detected. Need 18 or newer." }
Write-Ok "Node $(node -v), npm $(npm -v)"

Write-Step "Required npm scripts"
$pkg = Get-Content ".\package.json" -Raw | ConvertFrom-Json
$requiredScripts = @("build", "test", "test:e2e", "benchmark:storage", "benchmark:backup-memory")
$missingScripts = @($requiredScripts | Where-Object { -not $pkg.scripts.PSObject.Properties[$_] })
if ($missingScripts.Count -gt 0) {
    Stop-Run "package.json is missing scripts: $($missingScripts -join ', ')"
}
Write-Ok "All required scripts present"

Write-Step "Project dependencies"
if (-not (Test-Path ".\node_modules")) {
    Write-Info "node_modules missing, running npm ci"
    Invoke-Native "npm ci" { npm ci }
}
Write-Ok "node_modules present"

Write-Step "Dev tools"
Ensure-DevPackage "typescript"
Ensure-DevPackage "playwright"
Write-Step "Playwright Chromium"
Invoke-Native "playwright install chromium" { npx playwright install chromium }
Write-Ok "Chromium ready"
Write-Step "Unit tests";           Invoke-Native "unit tests"   { npm run test }
Write-Ok "Unit tests passed"
Write-Step "TypeScript check";     Invoke-Native "tsc"          { npx tsc --noEmit }
Write-Ok "TypeScript passed"
Write-Step "Production build";     Invoke-Native "build"        { npm run build }
Write-Ok "Build passed"
Write-Step "E2E tests";            Invoke-Native "e2e"          { npm run test:e2e }
Write-Ok "E2E passed"
Write-Step "Storage benchmark";    Invoke-Native "storage bench"{ npm run benchmark:storage }
Write-Ok "Storage benchmark passed"
Write-Step "Backup memory benchmark"; Invoke-Native "backup bench" { npm run benchmark:backup-memory }
Write-Ok "Backup memory benchmark passed"

Write-Host "ALL CHECKS PASSED" -ForegroundColor Green