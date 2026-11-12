$ErrorActionPreference = "Stop"

function Invoke-Check {
    param(
        [string]$Name,
        [scriptblock]$Command
    )

    Write-Host "`n========================================" -ForegroundColor DarkGray
    Write-Host "RUNNING: $Name" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor DarkGray

    $global:LASTEXITCODE = 0
    & $Command

    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-Host "`nFAILED: $Name (Exit code: $exitCode)" -ForegroundColor Red
        exit $exitCode
    }

    Write-Host "PASSED: $Name" -ForegroundColor Green
}

if (-not (Test-Path ".\package.json")) {
    Write-Host "ERROR: package.json not found. Run from project root." -ForegroundColor Red
    exit 1
}

Invoke-Check "npm ci" {
    npm ci
}

Invoke-Check "Unit tests" {
    npm run test
}

Invoke-Check "TypeScript check" {
    npx tsc --noEmit
}

Invoke-Check "Production build" {
    npm run build
}

Write-Host "`nChecking Playwright dependency..." -ForegroundColor Cyan

if (-not (Test-Path ".\node_modules\@playwright\test\package.json")) {
    Write-Host "ERROR: Playwright is missing." -ForegroundColor Red
    Write-Host "Run: npm install -D @playwright/test" -ForegroundColor Yellow
    exit 1
}

Write-Host "PASSED: Playwright dependency found" -ForegroundColor Green

# 6. Check Chromium cache
Write-Host "`nChecking Playwright Chromium..." -ForegroundColor Cyan

if ($env:PLAYWRIGHT_BROWSERS_PATH) {
    $browserPath = $env:PLAYWRIGHT_BROWSERS_PATH
}
else {
    $browserPath = Join-Path $env:LOCALAPPDATA "ms-playwright"
}

$chromiumDirs = @()

if (Test-Path -LiteralPath $browserPath -PathType Container) {
    $chromiumDirs = @(
        Get-ChildItem -LiteralPath $browserPath -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^chromium[-_]' }
    )
}

$chromiumInstalled = ($chromiumDirs.Count -gt 0)

if (-not $chromiumInstalled) {
    Invoke-Check "Install Playwright Chromium" {
        npx playwright install chromium
    }
}
else {
    Write-Host "PASSED: Chromium already installed. Skipping download." -ForegroundColor Green
    Write-Host "Browser cache: $browserPath" -ForegroundColor DarkGray
}

Invoke-Check "E2E tests" {
    npm run test:e2e
}

Invoke-Check "Storage benchmark" {
    npm run benchmark:storage
}

Invoke-Check "Backup memory benchmark" {
    npm run benchmark:backup-memory
}

Write-Host "`n========================================" -ForegroundColor DarkGray
Write-Host "ALL VALIDATION COMMANDS PASSED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor DarkGray
