# Installs the built .exe silently into a temp folder, starts it with a throwaway data folder, checks every
# service answered, lets it quit itself, verifies nothing is left running, then uninstalls.
$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem release -Filter 'SA Copilot Setup *.exe' | Sort-Object LastWriteTime | Select-Object -Last 1
if (-not $installer) { throw 'Run npm run dist:win first' }
$root = Join-Path $env:TEMP ("sa-smoke-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$installDir = Join-Path $root 'app'
$dataDir = Join-Path $root 'data'

Write-Host "Installing $($installer.Name) ($([math]::Round($installer.Length / 1MB)) MB) into $installDir"
Start-Process $installer.FullName -ArgumentList '/S', "/D=$installDir" -Wait
$installedMb = [math]::Round((Get-ChildItem $installDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "Installed size: $installedMb MB"

# Editors may export ELECTRON_RUN_AS_NODE; a real user's shortcut never has it.
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:SA_COPILOT_DATA_DIR = $dataDir
$env:SA_COPILOT_SMOKE = '1'
$app = Start-Process (Join-Path $installDir 'SA Copilot.exe') -PassThru
$ready = Join-Path $dataDir 'logs\ready.json'
$deadline = (Get-Date).AddMinutes(3)
while (-not (Test-Path $ready) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }
if (-not (Test-Path $ready)) { throw "App did not become ready; see $dataDir\logs" }
$ports = Get-Content $ready | ConvertFrom-Json
$projects = Invoke-RestMethod "http://127.0.0.1:$($ports.server)/api/projects"
Write-Host "Server on $($ports.server) answered /api/projects ($(@($projects).Count) projects); postgres $($ports.postgres), 9router $($ports.router)"
Invoke-WebRequest "http://127.0.0.1:$($ports.server)/" -UseBasicParsing | Out-Null
Write-Host 'UI served'

$app.WaitForExit(60000) | Out-Null
Start-Sleep -Seconds 3
$left = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$installDir*" -or $_.CommandLine -like "*$installDir*" -or $_.CommandLine -like "*$dataDir*" }
if ($left) { $left | Select-Object ProcessId, Name, CommandLine | Format-List; throw 'Processes left running after quit' }
Write-Host 'No processes left running'

Start-Process (Join-Path $installDir 'Uninstall SA Copilot.exe') -ArgumentList '/S' -Wait
Start-Sleep -Seconds 3
Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
Write-Host 'SMOKE TEST PASSED'
