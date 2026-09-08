"""Focused tests for simulator transition deduplication."""

from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import sys
import unittest

LOG_PATH = Path(__file__).parents[1] / "custom_components" / "duhnergy" / "simulator.py"
SPEC = importlib.util.spec_from_file_location("duhnergy_simulator", LOG_PATH)
assert SPEC and SPEC.loader
SIMULATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SIMULATOR
SPEC.loader.exec_module(SIMULATOR)
SimulatorLogModel = SIMULATOR.SimulatorLogModel


class SimulatorTests(unittest.TestCase):
    """Verify meaningful transitions append while refreshes do not."""

    def test_deduplicates_identical_shadow_decisions(self):
        model = SimulatorLogModel()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        kwargs = {
            "action": "battery_grid_charge",
            "reason": "Predicted shortfall",
            "boundary": "2026-01-01T02:00:00+00:00",
            "operations": ["switch.turn_on charge"],
            "context": {"soc_pct": 20},
        }
        self.assertTrue(model.append_shadow(now=now, **kwargs))
        self.assertFalse(
            model.append_shadow(now=now + timedelta(minutes=1), **kwargs)
        )
        self.assertEqual(len(model.entries), 1)
        self.assertIn("If Auto were active", model.entries[0]["message"])

    def test_new_boundary_or_operation_appends(self):
        model = SimulatorLogModel()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        base = {
            "now": now,
            "action": "idle",
            "reason": "No action",
            "boundary": None,
            "operations": ["switch.turn_off charge"],
            "context": {},
        }
        model.append_shadow(**base)
        self.assertTrue(
            model.append_shadow(
                **{
                    **base,
                    "now": now + timedelta(minutes=1),
                    "boundary": "2026-01-01T03:00:00+00:00",
                }
            )
        )
        self.assertEqual(len(model.entries), 2)

    def test_clear_keeps_current_decision_deduplicated(self):
        model = SimulatorLogModel()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        kwargs = {
            "action": "idle",
            "reason": "No action",
            "boundary": None,
            "operations": ["switch.turn_off charge"],
            "context": {},
        }
        model.append_shadow(now=now, **kwargs)
        model.clear()
        self.assertFalse(
            model.append_shadow(now=now + timedelta(minutes=1), **kwargs)
        )
        self.assertFalse(model.entries)


if __name__ == "__main__":
    unittest.main()
