# 새 검증 앱만 설치·실행·정상 종료·제거합니다. 제품 앱 데이터와 개인 녹음은 교체하지 않습니다.
param([ValidateSet('debug', 'release')][string]$BuildProfile = 'debug')
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $OutputEncoding
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$validationRoot = Join-Path $projectRoot 'src-tauri/target/runtime-validation'
$plan = Get-Content -LiteralPath (Join-Path $validationRoot 'validation-installer-plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$config = Get-Content -LiteralPath $plan.configPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($plan.schemaVersion -ne 1 -or $plan.state -ne 'VALIDATION_INSTALLER_PREPARED' -or
    $config.identifier -cnotmatch '^com\.guitarlab\.validation\.run[0-9a-f]{32}$' -or $plan.identifier -cne $config.identifier -or $config.bundle.windows.nsis.installMode -ne 'currentUser') {
    throw '제품과 분리된 설치 검증 설정이 아닙니다.'
}
$runId = $config.identifier.Substring('com.guitarlab.validation.run'.Length)
if ($config.productName -cne ('GuitarLab Validation ' + $runId) -or $config.mainBinaryName -cne ('guitarlab-validation-' + $runId) -or
    $plan.productName -cne $config.productName -or $plan.mainBinaryName -cne $config.mainBinaryName) { throw '설치 검증 이름/프로세스 분리가 다릅니다.' }
$plannedProfile = if ($plan.buildProfile) { $plan.buildProfile } else { 'debug' }
if ($plannedProfile -cne $BuildProfile) { throw '계획과 검사 빌드 프로필이 다릅니다.' }
$buildRoot = Join-Path $projectRoot ('src-tauri/target/' + $BuildProfile)
$installer = Join-Path $buildRoot ('bundle/nsis/' + $config.productName + '_0.0.0_x64-setup.exe')
$originalBinary = Join-Path $buildRoot ($config.mainBinaryName + '.exe')
$dataRoot = Join-Path $env:APPDATA $config.identifier
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $config.productName
$preferencesKey = 'HKCU:\Software\guitarlab\' + $config.productName
if ((Test-Path -LiteralPath $dataRoot) -or (Test-Path -LiteralPath $uninstallKey) -or (Test-Path -LiteralPath $preferencesKey)) {
    throw '기존 검증 앱의 데이터/설치가 있습니다. 기존 상태를 보존하고 검사를 중단합니다.'
}
$nsis = Get-Content -LiteralPath (Join-Path $buildRoot 'nsis/x64/installer.nsi') -Raw -Encoding UTF8
foreach ($definition in @(('!define PRODUCTNAME "' + $config.productName + '"'), ('!define MAINBINARYNAME "' + $config.mainBinaryName + '"'), ('!define BUNDLEID "' + $config.identifier + '"'), '!define INSTALLMODE "currentUser"')) {
    if (-not $nsis.Contains($definition)) { throw '생성 설치기의 분리 설정이 다릅니다.' }
}
$caseRoot = Join-Path (Join-Path $validationRoot 'installer-tests') ([guid]::NewGuid().ToString())
$installRoot = [System.IO.Path]::GetFullPath((Join-Path $caseRoot 'app'))
$allowedPrefix = [System.IO.Path]::GetFullPath((Join-Path $validationRoot 'installer-tests')).TrimEnd('\') + '\'
foreach ($relative in @('', 'src-tauri', 'src-tauri/target', 'src-tauri/target/runtime-validation', 'src-tauri/target/runtime-validation/installer-tests')) {
    $parent = if ($relative) { Join-Path $projectRoot $relative } else { $projectRoot }
    if ((Test-Path -LiteralPath $parent) -and ((Get-Item -LiteralPath $parent).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw '설치 검증 상위 경로의 링크는 허용하지 않습니다.' }
}
if (-not $installRoot.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $installRoot)) {
    throw '새 설치/제거 대상 경로가 아닙니다.'
}
New-Item -ItemType Directory -Path $caseRoot -ErrorAction Stop | Out-Null
$receiptPath = Join-Path $caseRoot 'receipt.json'
$receipt = [ordered]@{
    schemaVersion = 1; state = 'INSTALLATION_STARTED'; installRoot = $installRoot; buildProfile = $BuildProfile
    identifier = $config.identifier; modelWeightsIncluded = $false; cleanWindowsValidated = $false
    administratorToken = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
$setup = Start-Process -FilePath $installer -ArgumentList @('/S', '/NS', "/D=$installRoot") -WindowStyle Hidden -PassThru
if (-not $setup.WaitForExit(30000) -or $setup.ExitCode -ne 0) { throw '설치 완료를 확인하지 못했습니다. 강제 종료하지 않습니다.' }
$installedBinary = Join-Path $installRoot ($config.mainBinaryName + '.exe')
$python = Join-Path $projectRoot 'ai/.venv/Scripts/python.exe'
& $python -B -X utf8 (Join-Path $projectRoot 'scripts/verify_installer_binary.py') $originalBinary $installedBinary
if ($LASTEXITCODE -ne 0) { throw 'NSIS 표식 외의 설치 실행 파일 지문이 다릅니다.' }
$registration = Get-ItemProperty -LiteralPath $uninstallKey
if ($registration.MainBinaryName -cne ($config.mainBinaryName + '.exe') -or $registration.InstallLocation.Trim('"') -ne $installRoot) { throw '검증 앱 설치 등록이 다릅니다.' }
$expected = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$lock = Get-Content -LiteralPath (Join-Path $projectRoot 'ai/models/runtime-bundle-lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $lock.files) {
    $relative = 'ai-runtime/' + $entry.path
    $file = Join-Path $installRoot $relative
    if ((Get-Item -LiteralPath $file).Length -ne $entry.bytes -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw '설치 runtime 지문 오류입니다.' }
    $null = $expected.Add($relative)
}
$legalRoot = Join-Path $projectRoot 'docs/release'
foreach ($entry in Get-ChildItem -LiteralPath $legalRoot -File -Recurse) {
    $relative = 'third-party/' + $entry.FullName.Substring($legalRoot.Length + 1).Replace('\', '/')
    if ((Get-FileHash -LiteralPath (Join-Path $installRoot $relative) -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash) { throw '설치 고지 지문 오류입니다.' }
    $null = $expected.Add($relative)
}
foreach ($name in @(($config.mainBinaryName + '.exe'), 'uninstall.exe', 'LICENSE', 'BACKUP-README.ko.md')) { $null = $expected.Add($name) }
foreach ($entry in Get-ChildItem -LiteralPath $installRoot -Recurse) {
    if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw '설치 리소스 링크는 허용하지 않습니다.' }
    if (-not $entry.PSIsContainer -and -not $expected.Remove($entry.FullName.Substring($installRoot.Length + 1).Replace('\', '/'))) { throw '예상하지 않은 설치 파일입니다.' }
}
if ($expected.Count -ne 0) { throw '설치 리소스가 누락됐습니다.' }
if ((Get-FileHash -LiteralPath (Join-Path $installRoot 'LICENSE') -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $projectRoot 'LICENSE') -Algorithm SHA256).Hash) { throw 'MIT 원문이 다릅니다.' }
if ((Get-FileHash -LiteralPath (Join-Path $installRoot 'BACKUP-README.ko.md') -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath (Join-Path $projectRoot 'docs/19-BACKUP-AND-RECOVERY.md') -Algorithm SHA256).Hash) { throw '백업 안내 원문이 다릅니다.' }
Write-Output '실제 사용자 설치·원본 실행 파일·runtime·고지 전체 지문 확인'
$app = Start-Process -FilePath $installedBinary -WindowStyle Hidden -PassThru
$null = $app.WaitForInputIdle(15000)
if ($app.WaitForExit(3000)) { throw "설치 앱이 종료됐습니다: $($app.ExitCode)" }
$app.Refresh()
if (-not $app.Responding -or $app.MainWindowTitle -ne 'GuitarLab · 설치 검증') { throw '설치 앱 창 상태를 확인하지 못했습니다.' }
$journalPath = Join-Path $dataRoot 'diagnostics/native-v1.json'
$journal = Get-Content -LiteralPath $journalPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($journal.events[-1].code -ne 'APP_STARTED') { throw '설치 앱 초기화 기록이 없습니다.' }
$python = Join-Path $projectRoot 'ai/.venv/Scripts/python.exe'
@'
import sqlite3,sys
from pathlib import Path
with sqlite3.connect((Path(sys.argv[1])/'guitarlab.sqlite').as_uri()+'?mode=ro',uri=True) as db:
 assert db.execute('PRAGMA user_version').fetchone()[0]==9
 assert db.execute('PRAGMA quick_check').fetchall()==[('ok',)]
 assert db.execute('SELECT COUNT(*) FROM projects').fetchone()[0]==0
 assert db.execute('SELECT COUNT(*) FROM project_trash').fetchone()[0]==0
 assert db.execute("SELECT COUNT(*) FROM recorded_takes WHERE state IN ('ARMING','RECORDING','FINALIZING')").fetchone()[0]==0
print('별도 앱 데이터의 새 v9 DB·빈 보관 목록·녹음 없음 확인')
'@ | & $python -B -X utf8 - $dataRoot
if ($LASTEXITCODE -ne 0) { throw '설치 앱 데이터 확인 실패: 앱을 임의 종료하지 않습니다.' }
function Close-ValidationApplication {
    param($Process)
    if (-not $Process.CloseMainWindow() -or -not $Process.WaitForExit(5000)) { throw '설치 앱 정상 종료 확인 실패: 제거를 진행하지 않습니다.' }
    $exitCode = $Process.ExitCode
    if ($null -eq $exitCode -or $exitCode -isnot [int] -or $exitCode -ne 0) { throw '설치 앱 종료 코드가 0이 아닙니다. 제거를 진행하지 않습니다.' }
    return $exitCode
}
$applicationExitCode = Close-ValidationApplication -Process $app
$journal = Get-Content -LiteralPath $journalPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($journal.events[-1].code -ne 'APP_EXITED') { throw '설치 앱의 정상 종료 기록이 없습니다.' }
$dbPath = Join-Path $dataRoot 'guitarlab.sqlite'
$dbDigest = (Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash
$previousPath = $env:PATH; $previousPythonPath = $env:PYTHONPATH; $previousPythonHome = $env:PYTHONHOME
try {
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"; $env:PYTHONPATH = $null; $env:PYTHONHOME = $null
    $manager = Join-Path $buildRoot 'examples/manage_ai_model.exe'
    foreach ($attempt in 1..2) {
        $result = (& $manager inspect $installRoot) | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $result.pythonVersion -ne '3.12.15' -or $result.models.Count -ne 2) { throw '설치된 독립 runtime 확인 실패' }
        foreach ($model in $result.models) { if ($model.state -ne 'PACKAGE_MISSING' -or $model.usable -ne $false) { throw '기본 모델 미설치 응답이 다릅니다.' } }
    }
} finally { $env:PATH = $previousPath; $env:PYTHONPATH = $previousPythonPath; $env:PYTHONHOME = $previousPythonHome }
$preserved = Join-Path $installRoot 'validation-preserve.txt'
'GuitarLab 자체 제거 검사: 알 수 없는 파일 보존' | Set-Content -LiteralPath $preserved -Encoding UTF8
$preservedDigest = (Get-FileHash -LiteralPath $preserved -Algorithm SHA256).Hash
# 생성한 새 작업 폴더 안의 검증 앱만 제거합니다. 데이터 삭제 옵션은 사용하지 않습니다.
if (-not ([System.IO.Path]::GetFullPath($installRoot)).StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or -not $app.HasExited) { throw '제거 대상 재확인 실패' }
foreach ($target in @($caseRoot, $installRoot)) {
    if (((Get-Item -LiteralPath $target).Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw '제거 대상의 링크는 허용하지 않습니다.' }
}
$uninstaller = Start-Process -FilePath (Join-Path $installRoot 'uninstall.exe') -ArgumentList '/S' -WindowStyle Hidden -PassThru
if (-not $uninstaller.WaitForExit(30000) -or $uninstaller.ExitCode -ne 0) { throw '제거 실행이 완료되지 않았습니다.' }
function Test-ValidationRemovalComplete {
    param([string]$InstallRoot, [string]$UninstallKey)
    try {
        $remaining = @(Get-ChildItem -LiteralPath $InstallRoot -File -Recurse -ErrorAction Stop)
    } catch [System.IO.DirectoryNotFoundException] {
        # 제거기 자식 프로세스와 열거가 겹치면 다음 점검에서 다시 확인합니다.
        return $false
    }
    return -not (Test-Path -LiteralPath $UninstallKey) -and $remaining.Count -eq 1 -and $remaining[0].Name -eq 'validation-preserve.txt'
}
$timer = [System.Diagnostics.Stopwatch]::StartNew()
do {
    $complete = Test-ValidationRemovalComplete -InstallRoot $installRoot -UninstallKey $uninstallKey
    if ($complete) { break }
    [System.Threading.Thread]::Sleep(200)
} while ($timer.ElapsedMilliseconds -lt 30000)
if (-not $complete -or (Get-FileHash -LiteralPath $preserved -Algorithm SHA256).Hash -ne $preservedDigest) { throw '제거 후 원본/알 수 없는 파일 보존 확인 실패' }
if ((Get-FileHash -LiteralPath $dbPath -Algorithm SHA256).Hash -ne $dbDigest) { throw '기본 제거가 앱 데이터를 변경했습니다.' }
$receipt.state = 'CURRENT_PC_INSTALL_RUN_UNINSTALL_VERIFIED'
$receipt.normalExitVerified = $true; $receipt.runtimeFilesVerified = $lock.files.Count
$receipt.applicationExitCode = $applicationExitCode
$receipt.uninstallRegistrationRemoved = $true; $receipt.appDataPreserved = $true; $receipt.unknownFilePreserved = $true
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
Write-Output ($receipt | ConvertTo-Json -Depth 8)
