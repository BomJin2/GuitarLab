param([ValidateRange(1, 300)][int]$Seconds = 300)

# 이 스크립트가 만든 자식 프로세스만 관측하며 사용자 앱/장치에는 접근하지 않습니다.
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskSource = Join-Path $taskRoot 'scripts/probes/synthetic_detector.rs'
$taskDsp = Join-Path $taskRoot 'src-tauri/src/audio/dsp.rs'
$taskFolder = Join-Path $taskRoot ('src-tauri/target/runtime-validation/synthetic-detector-' + [guid]::NewGuid().ToString())
$null = New-Item -ItemType Directory -Path $taskFolder
$taskExe = Join-Path $taskFolder 'synthetic-detector.exe'
$taskStdout = Join-Path $taskFolder 'probe.stdout.json'
$taskStderr = Join-Path $taskFolder 'probe.stderr.log'
$taskDspSha = (Get-FileHash -LiteralPath $taskDsp -Algorithm SHA256).Hash.ToLowerInvariant()
$taskSourceSha = (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant()
$taskCommit = (& git -C $taskRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw '검증 소스 커밋을 확인하지 못했습니다.' }
$taskChanges = @(& git -C $taskRoot status --porcelain)
if ($LASTEXITCODE -ne 0) { throw '검증 소스 상태를 확인하지 못했습니다.' }
& rustc --edition=2021 -O --crate-name synthetic_detector_observation $taskSource -o $taskExe
if ($LASTEXITCODE -ne 0) { throw '합성 DSP 관측 도구를 빌드하지 못했습니다.' }
$taskSamples = [Collections.Generic.List[object]]::new()
$taskProcess = $null
$taskWatch = [Diagnostics.Stopwatch]::StartNew()
$taskReport = [ordered]@{
    schemaVersion = 1
    state = 'FAILED'
    sourceCommit = $taskCommit
    sourceWorkingTree = ($taskChanges.Count -gt 0)
    probeSourceSha256 = $taskSourceSha
    dspSourceSha256 = $taskDspSha
    optimizedStandalone = $true
    realDeviceValidated = $false
    tauriGuiValidated = $false
    audioRecorded = $false
    seconds = $Seconds
}
try {
    $taskProcess = Start-Process -FilePath $taskExe -ArgumentList @($Seconds.ToString()) -PassThru -WindowStyle Hidden -RedirectStandardOutput $taskStdout -RedirectStandardError $taskStderr
    $null = $taskProcess.Handle
    while (-not $taskProcess.HasExited) {
        if ($taskWatch.Elapsed.TotalSeconds -gt $Seconds + 60) { throw '합성 DSP 관측 제한 시간을 넘었습니다.' }
        $taskProcess.Refresh()
        if ($taskProcess.HasExited) { break }
        try {
            $taskSamples.Add([pscustomobject]@{
                elapsedSeconds = $taskWatch.Elapsed.TotalSeconds
                workingSetBytes = $taskProcess.WorkingSet64
                privateBytes = $taskProcess.PrivateMemorySize64
                cpuSeconds = $taskProcess.TotalProcessorTime.TotalSeconds
            })
        }
        catch [InvalidOperationException] {
            if (-not $taskProcess.HasExited) { throw }
        }
        Start-Sleep -Milliseconds 1000
    }
    $taskProcess.WaitForExit()
    if ($taskProcess.ExitCode -ne 0) { throw '합성 DSP 관측 프로세스가 실패했습니다.' }
    $taskResult = Get-Content -LiteralPath $taskStdout -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($taskResult.state -ne 'SYNTHETIC_DETECTOR_OBSERVED' -or $taskResult.seconds -ne $Seconds -or $taskResult.frames -ne $Seconds * 48000 -or $taskResult.discontinuities -ne 0 -or $taskSamples.Count -lt 1) { throw '합성 DSP 관측 결과가 요청과 다릅니다.' }
    if ((Get-FileHash -LiteralPath $taskDsp -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskDspSha -or (Get-FileHash -LiteralPath $taskSource -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskSourceSha) { throw '관측 중 소스가 바뀌었습니다.' }
    $taskReport.state = 'SYNTHETIC_DETECTOR_OBSERVED'
    $taskReport.detector = $taskResult
    $taskReport.maxObservedWorkingSetBytes = ($taskSamples | Measure-Object -Property workingSetBytes -Maximum).Maximum
    $taskReport.maxObservedPrivateBytes = ($taskSamples | Measure-Object -Property privateBytes -Maximum).Maximum
    $taskReport.samples = $taskSamples.ToArray()
}
finally {
    if ($null -ne $taskProcess) {
        if (-not $taskProcess.HasExited) { $taskProcess.Kill(); $taskProcess.WaitForExit() }
        $taskProcess.Dispose()
    }
    $taskWatch.Stop()
    $taskOutput = Join-Path $taskFolder 'observation.json'
    [IO.File]::WriteAllText($taskOutput, ($taskReport | ConvertTo-Json -Depth 7), [Text.UTF8Encoding]::new($false))
}
[pscustomobject]@{ path = $taskOutput; state = $taskReport.state; sampleCount = $taskSamples.Count; maxObservedWorkingSetBytes = $taskReport.maxObservedWorkingSetBytes; maxObservedPrivateBytes = $taskReport.maxObservedPrivateBytes; detector = $taskResult } | ConvertTo-Json -Depth 4
