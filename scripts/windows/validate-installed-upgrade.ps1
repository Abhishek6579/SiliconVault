[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string] $PreviousMsi,
    [Parameter(Mandatory = $true)][string] $CandidateMsi,
    [Parameter(Mandatory = $true)][string] $WebView2UserDataDirectory,
    [string] $EvidenceDirectory = (Join-Path $PWD "siliconvault-upgrade-evidence"),
    [string] $ApplicationExecutable
)
$ErrorActionPreference = "Stop"
$AppProcessName = "SiliconVault"

function Resolve-InputFile([string] $Path, [string] $Label) {
    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    if (-not (Test-Path -LiteralPath $resolved.Path -PathType Leaf)) { throw "$Label is not a file: $Path" }
    return $resolved.Path
}
function Get-SiliconVaultUninstallEntry {
    $roots = @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")
    $entries = foreach ($root in $roots) { Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "^SiliconVault($| )" } }
    $entry = $entries | Sort-Object @{ Expression = { if ($_.PSPath -like "*HKEY_CURRENT_USER*") { 0 } else { 1 } } } | Select-Object -First 1
    if (-not $entry) { return $null }
    $icon = [string]$entry.DisplayIcon
    if ($icon) { $icon = ($icon -replace ',\s*-?\d+$', '').Trim('"') }
    return [pscustomobject]@{ DisplayName = $entry.DisplayName; DisplayVersion = $entry.DisplayVersion; InstallLocation = $entry.InstallLocation; DisplayIcon = $icon; RegistryPath = $entry.PSPath }
}
function Resolve-AppExecutable($Entry) {
    if ($ApplicationExecutable) { return (Resolve-Path -LiteralPath $ApplicationExecutable).Path }
    if ($Entry.DisplayIcon -and (Test-Path -LiteralPath $Entry.DisplayIcon -PathType Leaf)) { return (Resolve-Path -LiteralPath $Entry.DisplayIcon).Path }
    if ($Entry.InstallLocation -and (Test-Path -LiteralPath $Entry.InstallLocation -PathType Container)) {
        $candidateExe = Get-ChildItem -LiteralPath $Entry.InstallLocation -Filter "SiliconVault.exe" -File -Recurse | Select-Object -First 1
        if ($candidateExe) { return $candidateExe.FullName }
    }
    throw "Could not resolve SiliconVault.exe. Re-run with -ApplicationExecutable."
}
function Invoke-MsiInstall([string] $MsiPath, [string] $LogPath) {
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $MsiPath, "/qn", "/norestart", "/l*v", $LogPath) -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) { throw "MSI installation failed with exit code $($process.ExitCode). See $LogPath" }
    return $process.ExitCode
}
function Stop-SiliconVault {
    $processes = Get-Process -Name $AppProcessName -ErrorAction SilentlyContinue
    if ($processes) { $processes | Stop-Process -Force; Start-Sleep -Seconds 2 }
    if (Get-Process -Name $AppProcessName -ErrorAction SilentlyContinue) { throw "SiliconVault is still running; refusing to inspect its live profile." }
}
function Get-IndexedDbSnapshot([string] $ProfileRoot) {
    if (-not (Test-Path -LiteralPath $ProfileRoot -PathType Container)) { throw "WebView2 user-data directory does not exist: $ProfileRoot" }
    $roots = @(Get-ChildItem -LiteralPath $ProfileRoot -Directory -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "IndexedDB" })
    $entries = foreach ($root in $roots) {
        Get-ChildItem -LiteralPath $root.FullName -File -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
            [pscustomobject]@{ RelativePath = $_.FullName.Substring($ProfileRoot.Length).TrimStart('\'); Length = $_.Length }
        }
    }
    $items = @($entries)
    $total = ($items | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $total) { $total = 0 }
    return [pscustomobject]@{ ProfileRoot = (Resolve-Path -LiteralPath $ProfileRoot).Path; IndexedDbRootCount = $roots.Count; FileCount = $items.Count; TotalBytes = $total; Files = $items }
}

$previous = Resolve-InputFile $PreviousMsi "Previous MSI"
$candidate = Resolve-InputFile $CandidateMsi "Candidate MSI"
$profile = [System.IO.Path]::GetFullPath($WebView2UserDataDirectory)
New-Item -ItemType Directory -Path $EvidenceDirectory -Force | Out-Null
$evidence = (Resolve-Path -LiteralPath $EvidenceDirectory).Path
$report = [ordered]@{
    StartedAt = (Get-Date).ToString("o")
    ComputerName = $env:COMPUTERNAME
    UserName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    PreviousMsi = $previous
    PreviousMsiSha256 = (Get-FileHash -LiteralPath $previous -Algorithm SHA256).Hash
    CandidateMsi = $candidate
    CandidateMsiSha256 = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
    ProfileDirectory = $profile
    PreviousInstallerExitCode = $null
    CandidateInstallerExitCode = $null
    BeforeUpgrade = $null
    AfterUpgrade = $null
    UserConfirmedDataIntegrity = $false
}
Write-Host "Installing the previous MSI..." -ForegroundColor Cyan
$report.PreviousInstallerExitCode = Invoke-MsiInstall $previous (Join-Path $evidence "previous-install.log")
$installed = Get-SiliconVaultUninstallEntry
if (-not $installed) { throw "Previous MSI completed but SiliconVault was not found in the uninstall registry." }
$oldExecutable = Resolve-AppExecutable $installed
Write-Host "Launching previous installation: $oldExecutable" -ForegroundColor Cyan
Start-Process -FilePath $oldExecutable
Read-Host "Create representative data (workspaces, folders, files, Trash, preferences, tabs, draft and PDF position). Close SiliconVault, then press Enter"
Stop-SiliconVault
$report.BeforeUpgrade = Get-IndexedDbSnapshot $profile
if ($report.BeforeUpgrade.IndexedDbRootCount -lt 1 -or $report.BeforeUpgrade.FileCount -lt 1) { throw "No IndexedDB files found in supplied WebView2 profile. Verify profile path and seed data." }
$report.PreviousVersion = $installed.DisplayVersion
$report.PreviousInstallLocation = $installed.InstallLocation
$report.PreviousExecutable = $oldExecutable

Write-Host "Installing candidate MSI over the existing installation (no uninstall)..." -ForegroundColor Cyan
$report.CandidateInstallerExitCode = Invoke-MsiInstall $candidate (Join-Path $evidence "candidate-install.log")
$upgraded = Get-SiliconVaultUninstallEntry
if (-not $upgraded) { throw "Candidate MSI completed but SiliconVault is missing from the uninstall registry." }
$newExecutable = Resolve-AppExecutable $upgraded
$report.CandidateVersion = $upgraded.DisplayVersion
$report.CandidateInstallLocation = $upgraded.InstallLocation
$report.CandidateExecutable = $newExecutable
if ($installed.InstallLocation -and $upgraded.InstallLocation -and $installed.InstallLocation.TrimEnd('\') -ne $upgraded.InstallLocation.TrimEnd('\')) {
    throw "Install location changed across upgrade. Previous='$($installed.InstallLocation)' Candidate='$($upgraded.InstallLocation)'"
}
Write-Host "Launching upgraded installation: $newExecutable" -ForegroundColor Cyan
Start-Process -FilePath $newExecutable
$answer = Read-Host "Verify seeded data/settings, edit and save a file, close and relaunch. Enter Y only if everything persisted"
Stop-SiliconVault
$report.AfterUpgrade = Get-IndexedDbSnapshot $profile
$report.UserConfirmedDataIntegrity = ($answer -match '^(Y|YES)$')
if ($report.AfterUpgrade.IndexedDbRootCount -lt 1 -or $report.AfterUpgrade.FileCount -lt 1) { throw "WebView2 IndexedDB profile is missing after upgrade." }
if (-not $report.UserConfirmedDataIntegrity) { throw "Data integrity was not confirmed. Treat this run as failed." }
$report.CompletedAt = (Get-Date).ToString("o")
$report.Result = "PASS - installer upgrade and user-verified data persistence"
$reportPath = Join-Path $evidence "upgrade-report.json"
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $reportPath -Encoding utf8
Write-Host "Upgrade validation passed. Evidence: $reportPath" -ForegroundColor Green
