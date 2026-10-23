"""공개 자료 수신 주소·허용 조건과 MIDI만 선택하는 경계를 확인합니다."""

from copy import deepcopy
import unittest
from fetch_guitar_techs_sample import ARCHIVES, RECORD, validate_metadata, midi_members


class GuitarTechsTests(unittest.TestCase):
    def test_metadata_cannot_change_license_origin_or_expected_bytes(self):
        metadata = {"id": 14963133, "metadata": {"license": {"id": "cc-by-4.0"}}, "files": [
            {"key": name, "size": size, "checksum": "md5:" + checksum, "links": {"self": RECORD + "/files/" + name + "/content"}}
            for name, (size, checksum) in ARCHIVES.items()]}
        self.assertEqual(len(validate_metadata(metadata)), 6)
        changed = deepcopy(metadata)
        changed["metadata"]["license"]["id"] = "unknown"
        with self.assertRaises(ValueError):
            validate_metadata(changed)
        for key, value in [("size", 1), ("checksum", "md5:unknown"), ("links", {"self": "https://example.com/data"})]:
            changed = deepcopy(metadata)
            changed["files"][0][key] = value
            with self.assertRaises(ValueError):
                validate_metadata(changed)

    def test_only_eight_fixed_midi_members_are_selected(self):
        members = [value for archive in ARCHIVES for value in midi_members(archive)]
        self.assertEqual(len(members), 8)
        self.assertTrue(all(value.endswith(".mid") and "/midi/" in value for value in members))
        with self.assertRaises(ValueError):
            midi_members("../foreign.zip")


if __name__ == "__main__":
    unittest.main()
