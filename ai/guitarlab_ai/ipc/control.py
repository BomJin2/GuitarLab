"""Windows 수치 DLL 초기화와 충돌하지 않는 취소 파이프 읽기입니다."""
import ctypes
import io
import os
import sys
from threading import Event


def control_reader(stream, done: Event, limit: int):
    if sys.platform != "win32" or isinstance(stream, io.BytesIO):
        return lambda: stream.readline(limit)
    import msvcrt
    from ctypes import wintypes
    descriptor = stream.fileno()
    handle = wintypes.HANDLE(msvcrt.get_osfhandle(descriptor))
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    peek = kernel.PeekNamedPipe
    peek.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD,
                     ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD)]
    peek.restype = wintypes.BOOL

    def read():
        # 비어 있는 파이프의 blocking read는 OpenBLAS DLL 로더와 교착할 수 있습니다.
        pending = bytearray()
        while not done.is_set():
            available = wintypes.DWORD()
            if not peek(handle, None, 0, None, ctypes.byref(available), None):
                if ctypes.get_last_error() == 109:
                    return bytes(pending)
                raise OSError("취소 파이프 확인 실패")
            if available.value:
                pending.extend(os.read(descriptor, min(available.value, limit - len(pending))))
                if b"\n" in pending or len(pending) >= limit:
                    return bytes(pending)
            else:
                done.wait(0.05)
        return b""
    return read
