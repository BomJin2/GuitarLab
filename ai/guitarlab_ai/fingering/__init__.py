"""음높이를 바꾸지 않는 기타 운지 후보 계산입니다."""
from math import inf
from threading import Event
from ..runtime import Canceled


def candidates(pitch: int, tuning: tuple[int, ...], max_fret: int) -> list[dict]:
    if type(pitch) is not int or not 0 <= pitch <= 127 or len(tuning) != 6 or any(type(p) is not int or not 0 <= p <= 127 for p in tuning) or type(max_fret) is not int or not 0 <= max_fret <= 36:
        raise ValueError("음정/튜닝/프렛 범위 오류")
    return sorted(( {"stringIndex": i + 1, "fret": pitch - p} for i, p in enumerate(tuning) if 0 <= pitch - p <= max_fret), key=lambda c: (c["fret"], c["stringIndex"]))


def choose_sequence(options: list[list[dict]], cancel: Event) -> list[dict]:
    if len(options) > 2000 or any(not row or len(row) > 6 for row in options):
        raise ValueError("단성 운지 후보 범위 오류")
    if not options:
        return []
    costs = [c["fret"] * 0.05 for c in options[0]]
    parents = []
    for index in range(1, len(options)):
        if cancel.is_set():
            raise Canceled()
        row_costs, row_parents = [], []
        for current in options[index]:
            best, parent = inf, 0
            for previous_index, previous in enumerate(options[index - 1]):
                cost = costs[previous_index] + abs(current["fret"] - previous["fret"]) + abs(current["stringIndex"] - previous["stringIndex"]) * 0.5 + current["fret"] * 0.05
                if cost < best:
                    best, parent = cost, previous_index
            row_costs.append(best)
            row_parents.append(parent)
        costs = row_costs
        parents.append(row_parents)
    if cancel.is_set():
        raise Canceled()
    selected = min(range(len(costs)), key=costs.__getitem__)
    result = [options[-1][selected]]
    for index in range(len(parents) - 1, -1, -1):
        selected = parents[index][selected]
        result.append(options[index][selected])
    return list(reversed(result))
