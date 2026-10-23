"""설치 검증 설정이 제품·프로세스·사용자 데이터를 대상으로 바뀌지 않게 검사합니다."""

import copy
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
import subprocess
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import prepare_validation_installer
from prepare_validation_installer import validate_template


class InstallerTests(unittest.TestCase):
    def test_installer_isolated_name_identifier_process_and_fixed_resources(self):
        root = Path(__file__).resolve().parents[1] / "src-tauri"
        template = json.loads((root / "tauri.validation.conf.json").read_bytes())
        product = json.loads((root / "tauri.conf.json").read_bytes())
        validate_template(template, product)
        for key, value in [("identifier", product["identifier"]), ("productName", product["productName"]),
                           ("mainBinaryName", "guitarlab")]:
            bad = copy.deepcopy(template)
            bad[key] = value
            with self.assertRaises(ValueError): validate_template(bad, product)
        for change in ("admin", "media"):
            bad = copy.deepcopy(template)
            if change == "admin": bad["bundle"]["windows"]["nsis"]["installMode"] = "perMachine"
            else: bad["bundle"]["resources"]["../public/"] = "personal-files/"
            with self.assertRaises(ValueError): validate_template(bad, product)

    def test_repeated_preparation_preserves_previous_config_and_uses_new_app_data(self):
        project = Path(__file__).resolve().parents[1]
        template = (project / "src-tauri/tauri.validation.conf.json").read_bytes()
        product = (project / "src-tauri/tauri.conf.json").read_bytes()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder).resolve(strict=True)
            files = {
                "src-tauri/tauri.validation.conf.json": template,
                "src-tauri/tauri.conf.json": product,
                "LICENSE": b"fixture",
                "docs/release/README.md": b"fixture",
                "docs/19-BACKUP-AND-RECOVERY.md": b"fixture",
                "dist/index.html": b"fixture",
                "src-tauri/target/ai-runtime-resources/fixture/python.txt": b"fixture",
            }
            for name, raw in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
            validation = root / "src-tauri/target/runtime-validation"
            validation.mkdir()
            (validation / "portable-candidate.json").write_text(json.dumps({
                "resourcePath": str(root / "src-tauri/target/ai-runtime-resources/fixture")
            }), encoding="utf-8")
            lock = root / "ai/models/runtime-bundle-lock.json"
            lock.parent.mkdir(parents=True)
            lock.write_text(json.dumps({"files": [{"path": "python.txt", "bytes": 7,
                "sha256": hashlib.sha256(b"fixture").hexdigest()}]}), encoding="utf-8")
            plans = []
            with patch.object(prepare_validation_installer, "PROJECT", root), redirect_stdout(io.StringIO()):
                for profile in ("debug", "release"):
                    prepare_validation_installer.prepare(profile)
                    plans.append(json.loads((validation / "validation-installer-plan.json").read_bytes()))
            self.assertNotEqual(plans[0]["identifier"], plans[1]["identifier"])
            self.assertNotEqual(plans[0]["configPath"], plans[1]["configPath"])
            self.assertEqual([plan["buildProfile"] for plan in plans], ["debug", "release"])
            for plan in plans:
                self.assertRegex(plan["identifier"], r"^com\.guitarlab\.validation\.run[0-9a-f]{32}$")
                run_id = plan["identifier"].removeprefix("com.guitarlab.validation.run")
                self.assertEqual(plan["productName"], "GuitarLab Validation " + run_id)
                self.assertEqual(plan["mainBinaryName"], "guitarlab-validation-" + run_id)
                self.assertEqual(json.loads(Path(plan["configPath"]).read_bytes())["identifier"], plan["identifier"])
                self.assertFalse(plan["cleanWindowsValidated"])
            for name, raw in files.items():
                self.assertEqual((root / name).read_bytes(), raw)

    def test_unknown_build_profile_is_rejected_before_accessing_any_files(self):
        with patch.object(prepare_validation_installer, "PROJECT", Path("not-an-installer-fixture")):
            for profile in ("../release", "Release", "", None):
                with self.assertRaises(ValueError):
                    prepare_validation_installer.prepare(profile)

    @unittest.skipUnless(os.name == "nt", "Windows PowerShell 인자 검증 경계입니다.")
    def test_powershell_rejects_unknown_profile_before_installation(self):
        project = Path(__file__).resolve().parents[1]
        powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        result = subprocess.run([str(powershell), "-NoProfile", "-NonInteractive", "-File",
                                 str(project / "scripts/Test-ValidationInstaller.ps1"), "-BuildProfile", "../release"],
                                cwd=project, capture_output=True, timeout=15,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"ParameterArgumentValidationError", result.stderr)

    @unittest.skipUnless(os.name == "nt", "Windows PowerShell 제거 검사 경계입니다.")
    def test_uninstall_probe_retries_only_disappearing_directories_and_keeps_other_errors(self):
        powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        script = r"""
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$source = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PWD 'scripts/Test-ValidationInstaller.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'PowerShell syntax' }
$functions = @($source.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-ValidationRemovalComplete'}, $false))
if ($functions.Count -ne 1) { throw 'Expected one probe function' }
. ([scriptblock]::Create($functions[0].Extent.Text))
$script:race = $true; $script:registered = $false
$script:remainingName = 'validation-preserve.txt'
function Get-ChildItem {
    if ($script:race) { $script:race = $false; throw [System.IO.DirectoryNotFoundException]::new('Removed during enumeration') }
    [pscustomobject]@{Name = $script:remainingName}
}
function Test-Path { return $script:registered }
if (Test-ValidationRemovalComplete 'unused' 'unused') { throw 'Race reported complete' }
if (-not (Test-ValidationRemovalComplete 'unused' 'unused')) { throw 'Clean next scan failed' }
$script:registered = $true
if (Test-ValidationRemovalComplete 'unused' 'unused') { throw 'Remaining registration ignored' }
$script:registered = $false; $script:remainingName = 'other.dll'
if (Test-ValidationRemovalComplete 'unused' 'unused') { throw 'Remaining payload ignored' }
function Get-ChildItem { throw [System.UnauthorizedAccessException]::new('Denied') }
$denied = $false
try { $null = Test-ValidationRemovalComplete 'unused' 'unused' } catch [System.UnauthorizedAccessException] { $denied = $true }
if (-not $denied) { throw 'Access denial hidden' }
Write-Output 'UNINSTALL_PROBE_BOUNDARIES_PASSED'
"""
        result = subprocess.run([str(powershell), "-NoProfile", "-NonInteractive", "-Command", script],
                                cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True, timeout=15,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("UNINSTALL_PROBE_BOUNDARIES_PASSED", result.stdout)


    @unittest.skipUnless(os.name == "nt", "Windows 기본 PowerShell의 종료 경계를 검사합니다.")
    def test_application_close_refusal_timeout_missing_or_nonzero_exit_never_passes(self):
        powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        script = r"""
$ErrorActionPreference = 'Stop'
$tokens = $null; $parseErrors = $null
$source = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PWD 'scripts/Test-ValidationInstaller.ps1'), [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'PowerShell syntax' }
$functions = @($source.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Close-ValidationApplication'}, $false))
if ($functions.Count -ne 1) { throw 'Expected one close function' }
. ([scriptblock]::Create($functions[0].Extent.Text))
foreach ($case in @(
    @{Close=$true; Wait=$true; Code=0; Pass=$true},
    @{Close=$false; Wait=$true; Code=0; Pass=$false},
    @{Close=$true; Wait=$false; Code=0; Pass=$false},
    @{Close=$true; Wait=$true; Code=$null; Pass=$false},
    @{Close=$true; Wait=$true; Code='0'; Pass=$false},
    @{Close=$true; Wait=$true; Code=1; Pass=$false},
    @{Close=$true; Wait=$true; Code=-1073741819; Pass=$false}
)) {
    $process = [pscustomobject]@{CloseAccepted=$case.Close; WaitAccepted=$case.Wait; ExitCode=$case.Code; WaitCalls=0}
    $process | Add-Member ScriptMethod CloseMainWindow { return $this.CloseAccepted }
    $process | Add-Member ScriptMethod WaitForExit { param($milliseconds) if ($milliseconds -ne 5000) { throw 'Unexpected timeout' }; $this.WaitCalls++; return $this.WaitAccepted }
    $passed = $false; $code = $null
    try { $code = Close-ValidationApplication -Process $process; $passed = $true } catch { $passed = $false }
    if ($passed -ne $case.Pass) { throw 'Invalid exit accepted or zero rejected' }
    if ($passed -and ($null -eq $code -or $code -cne 0)) { throw 'Exit evidence lost' }
    if (-not $case.Close -and $process.WaitCalls -ne 0) { throw 'Wait after close refusal' }
}
Write-Output 'APPLICATION_EXIT_BOUNDARIES_PASSED'
"""
        result = subprocess.run([str(powershell), "-NoProfile", "-NonInteractive", "-Command", script],
                                cwd=Path(__file__).resolve().parents[1], capture_output=True, timeout=15,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(result.returncode, 0, repr(result.stdout + result.stderr))
        self.assertIn(b"APPLICATION_EXIT_BOUNDARIES_PASSED", result.stdout)


if __name__ == "__main__":
    unittest.main()
