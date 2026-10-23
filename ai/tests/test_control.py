import os
import sys
from threading import Event, Thread
import pytest
from guitarlab_ai.ipc.control import control_reader


@pytest.mark.skipif(sys.platform != "win32", reason="Windows 파이프 API 검사")
def test_windows_control_waits_for_complete_line_and_stops_without_blocking():
    read_fd, write_fd = os.pipe()
    done = Event()
    with os.fdopen(read_fd, "rb", buffering=0) as stream:
        read = control_reader(stream, done, 65537)
        result = []
        thread = Thread(target=lambda: result.append(read()), daemon=True)
        try:
            thread.start()
            os.write(write_fd, b'{"partial":')
            thread.join(0.1)
            assert thread.is_alive() and not result
            os.write(write_fd, b'1}\n')
            thread.join(2)
            assert not thread.is_alive() and result == [b'{"partial":1}\n']
            done.set()
            assert read() == b""
        finally:
            done.set()
            os.close(write_fd)
            thread.join(2)
