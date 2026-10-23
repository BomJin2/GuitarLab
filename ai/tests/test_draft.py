from threading import Event
from copy import deepcopy
import pytest
from guitarlab_ai.transcription.draft import DetectedNote, build_draft
from guitarlab_ai.fingering import candidates
from guitarlab_ai.runtime import Canceled

TUNING = (64, 59, 55, 50, 45, 40)
ANCHORS = [(0, 0.0), (7680, 4000.0)]


def test_four_second_notes_preserve_pitch_confidence_candidates_and_input():
    notes = [DetectedNote(i * 500, (i + 1) * 500, 64 + i, 0.9) for i in range(8)]
    original = deepcopy(notes)
    draft = build_draft(notes, ANCHORS, TUNING)
    assert notes == original
    assert [n["startTick"] for n in draft] == list(range(0, 7680, 960))
    assert all(n["durationTicks"] == 960 for n in draft)
    for source, note in zip(notes, draft):
        assert note["pitchMidi"] == source.pitch_midi
        assert note["confidence"] == source.confidence
        assert note["onsetMs"] == source.onset_ms and note["offsetMs"] == source.offset_ms
        assert note["fingering"] in note["candidates"]
        assert "FINGERING_AMBIGUOUS" in note["reviewReasons"]
        for candidate in note["candidates"]:
            assert TUNING[candidate["stringIndex"] - 1] + candidate["fret"] == source.pitch_midi
    assert build_draft(notes, ANCHORS, TUNING) == draft


def test_tempo_change_and_intro_anchors_use_piecewise_time_not_fixed_bpm():
    anchors = [(0, 500.0), (1920, 1500.0), (3840, 3500.0)]
    notes = [DetectedNote(1000, 1500, 64, 0.9), DetectedNote(2500, 3500, 65, 0.9)]
    draft = build_draft(notes, anchors, TUNING)
    assert [(n["startTick"], n["durationTicks"]) for n in draft] == [(960, 960), (2880, 960)]
    with pytest.raises(ValueError):
        build_draft([DetectedNote(0, 100, 64, 0.9)], anchors, TUNING)


def test_overlap_low_confidence_and_out_of_range_are_retained_for_review():
    notes = [DetectedNote(0, 1000, 64, 0.2), DetectedNote(500, 1500, 67, 0.95), DetectedNote(2000, 2500, 1, 0.8)]
    draft = build_draft(notes, ANCHORS, TUNING)
    assert len(draft) == 3 and all(n["fingering"] is None for n in draft)
    assert "LOW_CONFIDENCE" in draft[0]["reviewReasons"]
    assert all("POLYPHONY" in n["reviewReasons"] for n in draft[:2])
    assert draft[2]["pitchMidi"] == 1 and draft[2]["candidates"] == []
    assert "OUT_OF_RANGE" in draft[2]["reviewReasons"]
    # 정량화로 새로 생긴 중첩도 검토 대상으로 남깁니다.
    quantized = build_draft([DetectedNote(0, 50, 64, .9), DetectedNote(60, 100, 65, .9)], ANCHORS, TUNING)
    assert all("POLYPHONY" in n["reviewReasons"] for n in quantized)
    assert "QUANTIZATION_SHIFT" in quantized[0]["reviewReasons"]


@pytest.mark.parametrize("note", [DetectedNote(-1, 500, 64, .9), DetectedNote(100, 100, 64, .9), DetectedNote(0, 500, 128, .9), DetectedNote(0, 500, True, .9), DetectedNote(0, 500, 64, float('nan')), DetectedNote(0, float('inf'), 64, .9), DetectedNote(0, 600001, 64, .9)])
def test_invalid_notes_do_not_modify_input(note):
    notes = [note]
    with pytest.raises(ValueError):
        build_draft(notes, ANCHORS, TUNING)
    assert notes[0] is note


def test_invalid_anchors_grid_tuning_empty_and_cancel():
    notes = [DetectedNote(0, 500, 64, .9)]
    for anchors in [[], [(0, 0), (0, 1000)], [(0, 1000), (960, 500)], [(0, 0), (960, float('nan'))]]:
        with pytest.raises(ValueError):
            build_draft(notes, anchors, TUNING)
    with pytest.raises(ValueError):
        build_draft(notes, ANCHORS, TUNING, grid=13)
    with pytest.raises(ValueError):
        candidates(64, (64,), 24)
    with pytest.raises(ValueError):
        build_draft(notes * 2001, ANCHORS, TUNING)
    assert build_draft([], ANCHORS, TUNING) == []
    cancel = Event(); cancel.set()
    with pytest.raises(Canceled):
        build_draft(notes, ANCHORS, TUNING, cancel=cancel)


def test_drop_tuning_and_reassigned_candidate_preserve_actual_pitch():
    tuning = (64, 59, 55, 50, 45, 38)
    assert candidates(38, tuning, 24) == [{"stringIndex": 6, "fret": 0}]
    draft = build_draft([DetectedNote(0, 500, 67, .9)], ANCHORS, tuning)
    assert {"stringIndex": 1, "fret": 3} in draft[0]["candidates"]
    assert {"stringIndex": 2, "fret": 8} in draft[0]["candidates"]
    for candidate in draft[0]["candidates"]:
        assert tuning[candidate["stringIndex"] - 1] + candidate["fret"] == 67
