"""고정 표본 이외 파일·가중치·주소·허용 조건 변경을 거부합니다."""

from copy import deepcopy
import unittest
from fetch_egset12_sample import FILES, RECORD, validate_metadata


class EGSetTests(unittest.TestCase):
    def test_fixed_public_metadata_accepts_only_expected_source_and_fingerprints(self):
        metadata = {"id": 11406378, "metadata": {"license": {"id": "cc-by-4.0"}}, "files": [
            {"key": name, "size": size, "checksum": "md5:" + checksum, "links": {"self": RECORD + "/files/" + name + "/content"}}
            for name, (size, checksum) in FILES.items()]}
        self.assertEqual(set(validate_metadata(metadata)), set(FILES))
        self.assertEqual(sum(size for size, _ in FILES.values()), 15442646)
        changed = deepcopy(metadata)
        changed["metadata"]["license"]["id"] = "unknown"
        with self.assertRaises(ValueError):
            validate_metadata(changed)
        for key, value in [("size", 1), ("checksum", "unknown"), ("links", {"self": "https://example.com/audio"})]:
            changed = deepcopy(metadata)
            changed["files"][0][key] = value
            with self.assertRaises(ValueError):
                validate_metadata(changed)


if __name__ == "__main__":
    unittest.main()
