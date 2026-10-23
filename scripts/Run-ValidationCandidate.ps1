# 검증 영수증의 앱만 실행하고 유지한 Process 참조로 정상 종료를 요청합니다. 강제 종료하지 않습니다.
param([Parameter(Mandatory = $true)][string]$ReceiptPath)
$ErrorActionPreference = 'Stop'
if ([Console]::IsInputRedirected) { throw '입력을 유지하는 PTY에서 실행하세요. 입력이 닫힌 상태로 앱을 시작하지 않습니다.' }
$validation = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../src-tauri/target/runtime-validation'))
$receiptFile = Get-Item -LiteralPath $ReceiptPath
if ($receiptFile.DirectoryName -ne $validation -or $receiptFile.Length -gt 131072 -or ($receiptFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '현재 작업의 검증 영수증만 허용합니다.' }
$receipt = Get-Content -LiteralPath $receiptFile.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
$name = if ($receipt.executable) { $receipt.executable } else { 'GuitarLab.exe' }
if ($receipt.schemaVersion -ne 1 -or $name -notin @('GuitarLab.exe', 'guitarlab-instance-proof.exe') -or $receipt.executableSha256 -cnotmatch '^[0-9a-f]{64}$' -or $receipt.executableBytes -gt 67108864 -or $receipt.executableBytes -lt 1 -or -not $receipt.title.StartsWith('GuitarLab') -or $receipt.title.Length -gt 100) { throw '검증 실행 계약이 다릅니다.' }
$category = if ($name -eq 'GuitarLab.exe') { 'portable' } else { 'instance-proofs' }
$allowed = Join-Path $validation $category
$destination = [IO.Path]::GetFullPath($receipt.destination)
if (-not $destination.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) { throw '검증 폴더를 벗어났습니다.' }
$directory = Get-Item -LiteralPath $destination
while ($null -ne $directory) {
    if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw '검증 경로의 링크는 허용하지 않습니다.' }
    if ($directory.FullName -eq $allowed) { break }
    $directory = $directory.Parent
}
if ($null -eq $directory) { throw '검증 상위 폴더가 다릅니다.' }
$exe = Get-Item -LiteralPath (Join-Path $destination $name)
if (($exe.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $exe.Length -ne $receipt.executableBytes -or (Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.executableSha256) { throw '검증 실행 파일 지문/크기가 다릅니다.' }
$process = Start-Process -FilePath $exe.FullName -WorkingDirectory $destination -WindowStyle Hidden -PassThru
if (-not $process.WaitForInputIdle(15000)) { throw '앱 입력 대기를 확인하지 못했습니다. 강제 종료하지 않습니다.' }
$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    $process.Refresh()
    if ($process.HasExited) { throw '앱이 준비 전에 종료됐습니다.' }
    if ($process.MainWindowTitle -eq $receipt.title -and $process.Responding) { $ready = $true; break }
    Start-Sleep -Milliseconds 250
}
if (-not $ready) { throw '정확한 앱 창을 확인하지 못했습니다. 강제 종료하지 않습니다.' }
[ordered]@{state='READY';processId=$process.Id;title=$process.MainWindowTitle;responding=$process.Responding;executableSha256=$receipt.executableSha256} | ConvertTo-Json -Compress
$commandBuffer = ''
while (-not $process.WaitForExit(250)) {
    if (-not [Console]::KeyAvailable) { continue }
    $key = [Console]::ReadKey($true)
    if ($key.Key -eq [ConsoleKey]::Backspace) {
        if ($commandBuffer.Length -gt 0) { $commandBuffer = $commandBuffer.Substring(0, $commandBuffer.Length - 1) }
        continue
    }
    if ($key.Key -ne [ConsoleKey]::Enter) {
        if (-not [char]::IsControl($key.KeyChar) -and $commandBuffer.Length -lt 16) { $commandBuffer += $key.KeyChar }
        continue
    }
    $command = $commandBuffer
    $commandBuffer = ''
    $process.Refresh()
    if ($process.HasExited) { break }
    switch ($command) {
        'status' {
            [ordered]@{state='STATUS';processId=$process.Id;running=(-not $process.HasExited);responding=$process.Responding;title=$process.MainWindowTitle} | ConvertTo-Json -Compress
        }
        'close' {
            $requested = if ($process.HasExited) { $false } else { $process.CloseMainWindow() }
            [ordered]@{state='CLOSE_REQUESTED';accepted=$requested;forced=$false} | ConvertTo-Json -Compress
        }
        default { Write-Output '{"state":"INVALID_CONTROL_COMMAND"}' }
    }
}
[ordered]@{state='EXITED';exitCode=$process.ExitCode;forced=$false} | ConvertTo-Json -Compress
exit $process.ExitCode
