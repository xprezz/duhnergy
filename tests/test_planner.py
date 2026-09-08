"""Focused tests for the dependency-free Duhnergy planner."""

from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys
import unittest

PLANNER_PATH = Path(__file__).parents[1] / "custom_components" / "duhnergy" / "planner.py"
SPEC = importlib.util.spec_from_file_location("duhnergy_planner", PLANNER_PATH)
assert SPEC and SPEC.loader
PLANNER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PLANNER
SPEC.loader.exec_module(PLANNER)
build_plan = PLANNER.build_plan


class PlannerTests(unittest.TestCase):
    """Exercise core budget and scheduling rules."""

    def setUp(self):
        self.now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.settings = {
            "battery_capacity": 10,
            "hard_backup_reserve": 20,
            "export_stop_soc": 40,
            "solar_forecast_margin": 80,
            "household_daily_demand": 12,
            "grid_current_limit": 25,
        }
        self.import_prices = [
            {
                "start": (self.now + timedelta(hours=index)).isoformat(),
                "end": (self.now + timedelta(hours=index + 1)).isoformat(),
                "price": price,
            }
            for index, price in enumerate([2, 1, 1.1, 3, 4, 2, 1.5])
        ]

    def test_shortfall_uses_cheapest_contiguous_window(self):
        plan = build_plan(
            now=self.now,
            soc=20,
            settings=self.settings,
            import_forecast=self.import_prices,
            sale_forecast=[],
            solar_forecast={"time": [], "pred_kw": []},
        )
        charge = next(
            item for item in plan["timeline"] if item["action"] == "battery_grid_charge"
        )
        self.assertEqual(charge["start"], (self.now + timedelta(hours=1)).isoformat())
        self.assertGreater(plan["deficit_kwh"], 0)

    def test_forecast_margin_and_reserve_feed_budget(self):
        solar = {
            "time": [(self.now + timedelta(hours=index)).isoformat() for index in range(3)],
            "pred_kw": [5, 5, 5],
        }
        plan = build_plan(
            now=self.now,
            soc=50,
            settings=self.settings,
            import_forecast=self.import_prices,
            sale_forecast=[],
            solar_forecast=solar,
        )
        self.assertEqual(plan["battery_above_reserve_kwh"], 3)
        self.assertEqual(plan["usable_solar_forecast_kwh"], 12)
        self.assertEqual(plan["net_budget_kwh"], 3)

    def test_current_solar_interval_is_partially_counted(self):
        now = self.now + timedelta(minutes=30)
        plan = build_plan(
            now=now,
            soc=20,
            settings={**self.settings, "household_daily_demand": 0},
            import_forecast=[],
            sale_forecast=[],
            solar_forecast={
                "time": [
                    self.now.isoformat(),
                    (self.now + timedelta(hours=1)).isoformat(),
                ],
                "pred_kw": [4, 0],
            },
        )
        self.assertEqual(plan["usable_solar_forecast_kwh"], 1.6)

    def test_price_windows_are_clipped_to_plan_horizon(self):
        prices = [
            {
                "start": (self.now + timedelta(hours=30)).isoformat(),
                "end": (self.now + timedelta(hours=31)).isoformat(),
                "price": -10,
            }
        ]
        plan = build_plan(
            now=self.now,
            soc=20,
            settings=self.settings,
            import_forecast=prices,
            sale_forecast=[],
            solar_forecast={"time": [], "pred_kw": []},
        )
        self.assertFalse(plan["timeline"])


if __name__ == "__main__":
    unittest.main()
