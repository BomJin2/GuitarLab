# 검증 ZIP을 완전히 푼 폴더에서 실행합니다. 설치·다운로드·사용자 데이터 변경은 없습니다.
$ErrorActionPreference = 'Stop'
$packageRoot = $PSScriptRoot
$manifestFile = Join-Path $packageRoot 'VALIDATION.json'
if (-not (Test-Path -LiteralPath $manifestFile -PathType Leaf)) {
    throw '검증용 ZIP을 완전히 푼 폴더에서 실행해주세요.'
}
$manifest = Get-Content -LiteralPath $manifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.schemaVersion -ne 1) { throw '지원하지 않는 검증 문서입니다.' }
foreach ($name in @('GuitarLab.exe', 'manage_ai_model.exe')) {
    $file = Join-Path $packageRoot $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw '검증 실행 파일이 누락됐습니다.' }
    $stream = [System.IO.File]::OpenRead($file)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        $digest = [System.BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $hasher.Dispose()
        $stream.Dispose()
    }
    if ($digest -ne $manifest.files.$name) { throw '검증 실행 파일 지문이 다릅니다.' }
}
$originalPath = $env:PATH
$originalPythonPath = $env:PYTHONPATH
$originalPythonHome = $env:PYTHONHOME
try {
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $env:PYTHONPATH = $null
    $env:PYTHONHOME = $null
    # 두 번째 실행도 전체 SHA를 검사하므로 첫 실행의 리소스 불변을 재확인합니다.
    foreach ($attempt in 1..2) {
        $output = & (Join-Path $packageRoot 'manage_ai_model.exe') inspect $packageRoot
        if ($LASTEXITCODE -ne 0) { throw '독립 런타임 실행에 실패했습니다.' }
        $result = $output | ConvertFrom-Json
        if ($result.schemaVersion -ne 1 -or $result.pythonVersion -ne '3.12.15' -or $result.models.Count -ne 2) {
            throw '지원 런타임 응답이 아닙니다.'
        }
        foreach ($model in $result.models) {
            if ($null -ne $model.packageVersion -or $model.state -ne 'PACKAGE_MISSING' -or $model.usable -ne $false) {
                throw '모델 없는 기본 런타임 응답과 다릅니다.'
            }
        }
    }
    Write-Output '독립 런타임 자동 점검 통과 · Python 3.12.15 · 기본 모델 미설치 정상 · 리소스 불변 확인'
}
finally {
    $env:PATH = $originalPath
    $env:PYTHONPATH = $originalPythonPath
    $env:PYTHONHOME = $originalPythonHome
}
