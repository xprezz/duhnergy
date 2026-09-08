"""Focused tests for persistent Duhnergy stats accounting."""

from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys
import unittest

STATS_PATH = Path(__file__).parents[1] / "custom_components" / "duhnergy" / "stats.py"
SPEC = importlib.util.spec_from_file_location("duhnergy_stats", STATS_PATH)
assert SPEC and SPEC.loader
STATS = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = STATS
SPEC.loader.exec_module(STATS)
EnergyStatsModel = STATS.EnergyStatsModel


class StatsTests(unittest.TestCase):
    """Exercise delta, reset, integration, and local bucket behavior."""

    def setUp(self):
        self.now = datetime(2026, 9, 6, 23, 59, tzinfo=timezone(timedelta(hours=2)))
        self.sample = {
            "grid_import_energy_kwh": 100,
            "grid_export_energy_kwh": 20,
            "house_energy_kwh": 250,
            "solar_power_w": 3000,
            "house_power_w": 2000,
            "grid_power_w": 500,
            "battery_power_w": 1000,
            "ev_power_w": 0,
            "buy_price": 2,
            "sell_price": 1,
            "currency": "DKK",
            "battery_power_positive": "charge",
            "grid_power_positive": "import",
        }

    def test_cumulative_deltas_and_power_integration(self):
        model = EnergyStatsModel()
        model.update(self.now, self.sample)
        result = model.update(
            self.now + timedelta(minutes=1),
            {
                **self.sample,
                "grid_import_energy_kwh": 100.5,
                "grid_export_energy_kwh": 20.1,
                "house_energy_kwh": 250.4,
                "ev_power_w": 3600,
            },
        )
        totals = result["periods"]["lifetime"]
        self.assertAlmostEqual(totals["grid_import_kwh"], 0.5)
        self.assertAlmostEqual(totals["grid_export_kwh"], 0.1)
        self.assertAlmostEqual(totals["household_consumption_kwh"], 0.4)
        self.assertAlmostEqual(totals["solar_production_kwh"], 0.05)
        self.assertAlmostEqual(totals["battery_charged_kwh"], 1 / 60, places=3)
        self.assertAlmostEqual(totals["ev_charged_kwh"], 0.03)
        self.assertAlmostEqual(totals["import_cost"], 1.0)
        self.assertAlmostEqual(totals["export_revenue"], 0.1)
        self.assertAlmostEqual(totals["net_cost"], 0.9)

    def test_meter_reset_rebaselines_without_double_counting(self):
        model = EnergyStatsModel()
        model.update(self.now, self.sample)
        model.update(
            self.now + timedelta(minutes=1),
            {**self.sample, "grid_import_energy_kwh": 101},
        )
        result = model.update(
            self.now + timedelta(minutes=2),
            {**self.sample, "grid_import_energy_kwh": 2},
        )
        self.assertEqual(
            result["periods"]["lifetime"]["grid_import_kwh"], 1
        )

    def test_period_rollover_resets_current_buckets_only(self):
        model = EnergyStatsModel()
        model.update(self.now, self.sample)
        model.update(
            self.now + timedelta(seconds=30),
            {**self.sample, "grid_import_energy_kwh": 101},
        )
        result = model.update(
            self.now + timedelta(minutes=2),
            {**self.sample, "grid_import_energy_kwh": 102},
        )
        self.assertEqual(result["periods"]["today"]["grid_import_kwh"], 1)
        self.assertEqual(result["periods"]["week"]["grid_import_kwh"], 1)
        self.assertEqual(result["periods"]["lifetime"]["grid_import_kwh"], 2)

    def test_long_downtime_is_not_integrated(self):
        model = EnergyStatsModel()
        model.update(self.now, self.sample)
        result = model.update(
            self.now + timedelta(hours=1),
            {
                **self.sample,
                "grid_import_energy_kwh": None,
                "grid_export_energy_kwh": None,
                "house_energy_kwh": None,
            },
        )
        totals = result["periods"]["lifetime"]
        self.assertEqual(totals["solar_production_kwh"], 0)
        self.assertEqual(totals["household_consumption_kwh"], 0)
        self.assertEqual(totals["battery_charged_kwh"], 0)

    def test_temporary_meter_unavailability_does_not_double_count(self):
        model = EnergyStatsModel()
        model.update(self.now, self.sample)
        model.update(
            self.now + timedelta(minutes=1),
            {**self.sample, "grid_import_energy_kwh": None},
        )
        result = model.update(
            self.now + timedelta(minutes=2),
            {**self.sample, "grid_import_energy_kwh": 100.1},
        )
        self.assertEqual(
            result["periods"]["lifetime"]["grid_import_kwh"], 0.1
        )

    def test_serialized_reload_keeps_counter_baselines(self):
        model = EnergyStatsModel()
        model.update(self.now, self.sample)
        model.update(
            self.now + timedelta(minutes=1),
            {**self.sample, "grid_import_energy_kwh": 100.2},
        )
        reloaded = EnergyStatsModel(model.data)
        result = reloaded.update(
            self.now + timedelta(minutes=2),
            {**self.sample, "grid_import_energy_kwh": 100.2},
        )
        self.assertEqual(
            result["periods"]["lifetime"]["grid_import_kwh"], 0.2
        )


if __name__ == "__main__":
    unittest.main()
