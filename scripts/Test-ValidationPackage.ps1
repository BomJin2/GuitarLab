# 검증 패키지 안에서만 실행합니다. 모델 설치·사용자 데이터 변경·앱 실행은 하지 않습니다.
$ErrorActionPreference = 'Stop'
$packageRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$prefix = $packageRoot.TrimEnd('\') + '\'
$manifest = Get-Content -LiteralPath (Join-Path $packageRoot 'VALIDATION.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1 -or $manifest.state -ne 'VALIDATION_ONLY' -or $manifest.modelWeightsIncluded -ne $false -or $manifest.files.Count -gt 5000) {
    throw '지원하는 검증 패키지가 아닙니다.'
}
$expected = [System.Collections.Generic.Dictionary[string, object]]::new([System.StringComparer]::OrdinalIgnoreCase)
$total = [long]0
foreach ($item in $manifest.files) {
    if ([string]::IsNullOrWhiteSpace($item.path) -or $item.path.Length -gt 512 -or $item.path -match '(^/|[\\:]|(^|/)\.\.?(/|$))' -or $item.sha256 -cnotmatch '^[0-9a-f]{64}$' -or $item.bytes -lt 0 -or $item.bytes -gt 67108864 -or $expected.ContainsKey($item.path)) {
        throw '패키지 파일 목록이 손상됐습니다.'
    }
    $expected.Add($item.path, $item)
    $total += [long]$item.bytes
}
if ($total -gt 268435456 -or -not $expected.ContainsKey('GuitarLab.exe') -or -not $expected.ContainsKey('manage_ai_model.exe')) { throw '패키지 용량/필수 파일이 다릅니다.' }
$pending = [System.Collections.Generic.Stack[string]]::new()
$pending.Push($packageRoot)
$count = 0
while ($pending.Count -gt 0) {
    $folder = $pending.Pop()
    $info = Get-Item -LiteralPath $folder
    if (($info.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw '패키지 링크는 허용하지 않습니다.' }
    foreach ($entry in $info.GetFileSystemInfos()) {
        $count++
        if ($count -gt 10000 -or ($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw '패키지 경로/개수 한도 오류입니다.' }
        if (($entry.Attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
            $pending.Push($entry.FullName)
            continue
        }
        if (-not $entry.FullName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw '패키지 경로를 벗어났습니다.' }
        $name = $entry.FullName.Substring($prefix.Length).Replace('\', '/')
        if ($name -eq 'VALIDATION.json') { continue }
        if (-not $expected.ContainsKey($name) -or $entry.Length -ne $expected[$name].bytes) { throw '누락/추가되거나 크기가 다른 패키지 파일입니다.' }
        $digest = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($digest -ne $expected[$name].sha256) { throw '패키지 파일 지문이 다릅니다.' }
        $expected.Remove($name) | Out-Null
    }
}
if ($expected.Count -ne 0) { throw '필수 패키지 파일이 누락됐습니다.' }
$originalPath = $env:PATH
$originalPythonPath = $env:PYTHONPATH
$originalPythonHome = $env:PYTHONHOME
try {
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $env:PYTHONPATH = $null
    $env:PYTHONHOME = $null
    foreach ($attempt in 1..2) {
        $output = & (Join-Path $packageRoot 'manage_ai_model.exe') inspect $packageRoot
        if ($LASTEXITCODE -ne 0) { throw '독립 Python 실행에 실패했습니다.' }
        $result = $output | ConvertFrom-Json
        if ($result.schemaVersion -ne 1 -or $result.pythonVersion -ne '3.12.15' -or $result.models.Count -ne 2) { throw '지원 런타임 응답이 아닙니다.' }
        foreach ($model in $result.models) {
            if ($null -ne $model.packageVersion -or $model.state -ne 'PACKAGE_MISSING' -or $model.usable -ne $false) { throw '기본 모델 미설치 응답과 다릅니다.' }
        }
    }
    Write-Output '검증 패키지 전체 지문·독립 Python 3.12.15 점검 통과 · 새PC/배포 수용은 별도입니다.'
}
finally {
    $env:PATH = $originalPath
    $env:PYTHONPATH = $originalPythonPath
    $env:PYTHONHOME = $originalPythonHome
}
