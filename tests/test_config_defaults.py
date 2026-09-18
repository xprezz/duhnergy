"""Tests for the dependency-free Duhnergy source defaults."""

import importlib.util
from pathlib import Path
import sys
import unittest

CONST_PATH = Path(__file__).parents[1] / "custom_components" / "duhnergy" / "const.py"
SPEC = importlib.util.spec_from_file_location("duhnergy_const", CONST_PATH)
assert SPEC and SPEC.loader
CONST = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = CONST
SPEC.loader.exec_module(CONST)


class ConfigDefaultTests(unittest.TestCase):
    """Verify known weather and scalable surface mappings."""

    def test_known_weather_and_production_sources(self):
        self.assertEqual(CONST.ENTITY_DEFAULTS["weather"], "weather.forecast_home")
        self.assertEqual(
            CONST.ENTITY_DEFAULTS["solar_today_energy"],
            "sensor.solis_pv_today_energy_generation",
        )

    def test_four_surface_defaults_can_be_reduced_by_count(self):
        self.assertEqual(CONST.OPTION_DEFAULTS["solar_surface_count"], 4)
        self.assertEqual(
            [
                CONST.ENTITY_DEFAULTS[f"solar_surface_{index}"]
                for index in range(1, 5)
            ],
            [f"sensor.solis_pv_power_{index}" for index in range(1, 5)],
        )


if __name__ == "__main__":
    unittest.main()
