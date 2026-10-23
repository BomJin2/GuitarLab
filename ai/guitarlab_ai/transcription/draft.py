from bisect import bisect_right
from dataclasses import dataclass
from math import floor, isfinite
from threading import Event
from ..fingering import candidates, choose_sequence
from ..runtime import Canceled


@dataclass(frozen=True)
class DetectedNote:
    onset_ms: float
    offset_ms: float
    pitch_midi: int
    confidence: float


def build_draft(notes: list[DetectedNote], anchors: list[tuple[int, float]], tuning: tuple[int, ...],
                max_fret: int = 24, grid: int = 240, cancel: Event | None = None) -> list[dict]:
    cancel = cancel if cancel is not None else Event()
    candidates(64, tuning, max_fret)
    if type(grid) is not int or grid not in (60, 120, 240, 480, 960) or not 2 <= len(anchors) <= 256 or len(notes) > 2000:
        raise ValueError("초안 입력 범위 오류")
    for index, (tick, milliseconds) in enumerate(anchors):
        if type(tick) is not int or tick < 0 or not isinstance(milliseconds, (int, float)) or isinstance(milliseconds, bool) or not isfinite(milliseconds) or milliseconds < 0 or (index > 0 and (tick <= anchors[index - 1][0] or milliseconds <= anchors[index - 1][1])):
            raise ValueError("시간 앵커는 유한한 단조 증가 값이어야 합니다.")
    for note in notes:
        if not isinstance(note, DetectedNote) or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v) for v in (note.onset_ms, note.offset_ms, note.confidence)) or not 0 <= note.onset_ms < note.offset_ms <= 600000 or type(note.pitch_midi) is not int or not 0 <= note.pitch_midi <= 127 or not 0 <= note.confidence <= 1:
            raise ValueError("분석 음표 범위 오류")
    times = [a[1] for a in anchors]
    def to_tick(milliseconds):
        index = max(0, min(len(anchors) - 2, bisect_right(times, milliseconds) - 1))
        left, right = anchors[index:index + 2]
        tick = left[0] + (milliseconds - left[1]) * (right[0] - left[0]) / (right[1] - left[1])
        if not isfinite(tick) or tick < 0 or tick > 100000000:
            raise ValueError("음표가 앵커 지원 범위를 벗어났습니다.")
        return tick
    ordered = sorted(notes, key=lambda n: (n.onset_ms, n.pitch_midi, n.offset_ms))
    result = []
    for note in ordered:
        if cancel.is_set():
            raise Canceled()
        raw_start, raw_end = to_tick(note.onset_ms), to_tick(note.offset_ms)
        start = floor(raw_start / grid + 0.5) * grid
        end = max(start + grid, floor(raw_end / grid + 0.5) * grid)
        options = candidates(note.pitch_midi, tuning, max_fret)
        reasons = []
        if note.confidence < 0.7:
            reasons.append("LOW_CONFIDENCE")
        if not options:
            reasons.append("OUT_OF_RANGE")
        elif len(options) > 1:
            reasons.append("FINGERING_AMBIGUOUS")
        if abs(start - raw_start) > grid / 4 or abs(end - raw_end) > grid / 4:
            reasons.append("QUANTIZATION_SHIFT")
        result.append({"onsetMs": note.onset_ms, "offsetMs": note.offset_ms, "pitchMidi": note.pitch_midi,
            "confidence": note.confidence, "startTick": start, "durationTicks": end - start,
            "candidates": options, "fingering": None, "reviewReasons": reasons, "source": "ai"})
    # 원래 시각 또는 정량화 후 겹친 음은 단성 운지 알고리즘으로 확정하지 않습니다.
    active = []
    for note in result:
        if cancel.is_set():
            raise Canceled()
        active = [previous for previous in active if previous["offsetMs"] > note["onsetMs"] or previous["startTick"] + previous["durationTicks"] > note["startTick"]]
        for previous in active:
            for current in (previous, note):
                if "POLYPHONY" not in current["reviewReasons"]:
                    current["reviewReasons"].append("POLYPHONY")
        active.append(note)
    segment = []
    def flush():
        if segment:
            selected = choose_sequence([r["candidates"] for r in segment], cancel)
            for current, fingering in zip(segment, selected):
                current["fingering"] = dict(fingering)
            segment.clear()
    for note in result:
        if "POLYPHONY" in note["reviewReasons"] or not note["candidates"]:
            flush()
        else:
            segment.append(note)
    flush()
    if cancel.is_set():
        raise Canceled()
    return result
