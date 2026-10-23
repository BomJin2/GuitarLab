"""모델 로드 전에 기본 WAV 헤더와 실제 데이터 범위를 검증합니다."""
from dataclasses import dataclass
from pathlib import Path
import struct
from threading import Event

from ..model_integrity import ModelError
from ..runtime import Canceled


@dataclass(frozen=True)
class WavInput:
    raw: bytes
    pcm: bytes
    sample_rate: int
    channels: int
    frames: int
    floating: bool


def read_wav(path: Path, root: Path, cancel: Event) -> WavInput:
    if cancel.is_set():
        raise Canceled()
    source = path.resolve()
    if not source.is_relative_to(root.resolve()) or source.suffix.lower() != ".wav" or not source.is_file() or not 44 <= source.stat().st_size <= 64 * 1024 * 1024:
        raise ModelError("AI_INPUT_INVALID")
    with source.open("rb") as stream:
        raw = stream.read(64 * 1024 * 1024 + 1)
    if len(raw) > 64 * 1024 * 1024 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE" or struct.unpack_from("<I", raw, 4)[0] + 8 != len(raw):
        raise ModelError("AI_INPUT_INVALID")
    position, count = 12, 0
    fmt = pcm = None
    while position < len(raw):
        if cancel.is_set():
            raise Canceled()
        count += 1
        if count > 512 or position + 8 > len(raw):
            raise ModelError("AI_INPUT_INVALID")
        tag, size = struct.unpack_from("<4sI", raw, position)
        position += 8
        end = position + size
        if end + size % 2 > len(raw):
            raise ModelError("AI_INPUT_INVALID")
        if tag == b"fmt ":
            if fmt is not None or size not in (16, 18):
                raise ModelError("AI_INPUT_INVALID")
            fmt = struct.unpack_from("<HHIIHH", raw, position)
            if size == 18 and raw[position + 16:end] != b"\0\0":
                raise ModelError("AI_INPUT_INVALID")
        elif tag == b"data":
            if pcm is not None:
                raise ModelError("AI_INPUT_INVALID")
            pcm = raw[position:end]
        position = end + size % 2
    if fmt is None or pcm is None:
        raise ModelError("AI_INPUT_INVALID")
    codec, channels, rate, byte_rate, block_size, bits = fmt
    if (codec, bits) not in ((1, 16), (3, 32)) or channels not in (1, 2) or not 8000 <= rate <= 192000 or block_size != channels * bits // 8 or byte_rate != rate * block_size or not pcm or len(pcm) % block_size or len(pcm) > rate * 60 * block_size:
        raise ModelError("AI_INPUT_INVALID")
    return WavInput(raw, pcm, rate, channels, len(pcm) // block_size, codec == 3)


def float_header(frames: int, channels: int = 2, sample_rate: int = 44100) -> bytes:
    size = frames * channels * 4
    if frames <= 0 or frames > sample_rate * 60 or channels != 2 or sample_rate != 44100:
        raise ModelError("AI_OUTPUT_INVALID")
    return struct.pack("<4sI4s4sIHHIIHH4sI", b"RIFF", size + 36, b"WAVE", b"fmt ", 16,
                       3, channels, sample_rate, sample_rate * channels * 4, channels * 4, 32, b"data", size)
