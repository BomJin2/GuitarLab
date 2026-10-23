"""Windows DLL 로더의 경로 길이 제한과 NT 경로 별칭을 처리합니다."""
import os
from pathlib import Path
import sys


def extended_path(path: Path) -> Path:
    resolved = path.resolve()
    if os.name != 'nt':
        return resolved
    value = str(resolved)
    if value.startswith('\\\\?\\'):
        return resolved
    return Path('\\\\?\\UNC\\'+value[2:] if value.startswith('\\\\') else '\\\\?\\'+value)


def configure_windows_paths():
    if os.name == 'nt':
        sys.path[:] = [str(extended_path(Path(path))) for path in sys.path]
