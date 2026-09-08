"""Persistent, deduplicated simulator activity log."""

from __future__ import annotations

from collections import deque
from datetime import datetime
import json
from typing import Any

MAX_ENTRIES = 150


class SimulatorLogModel:
    """Bounded decision-transition log independent of Home Assistant."""

    def __init__(self, data: dict[str, Any] | None = None) -> None:
        raw_entries = data.get("entries", []) if isinstance(data, dict) else []
        self.entries = deque(
            (item for item in raw_entries if isinstance(item, dict)),
            maxlen=MAX_ENTRIES,
        )
        self.last_signature = (
            data.get("last_signature") if isinstance(data, dict) else None
        )

    def append_shadow(
        self,
        *,
        now: datetime,
        action: str,
        reason: str,
        boundary: str | None,
        operations: list[str],
        context: dict[str, Any],
    ) -> bool:
        """Append only when the proposed action, boundary, or operations change."""
        signature = json.dumps(
            [action, boundary, operations], sort_keys=True, separators=(",", ":")
        )
        if signature == self.last_signature:
            return False
        self.last_signature = signature
        readable_action = action.replace("_", " ")
        entry = {
            "timestamp": now.isoformat(),
            "mode": "shadow",
            "planned_action": action,
            "reason": reason,
            "message": (
                f"If Auto were active, Duhnergy would have applied "
                f"{readable_action}."
            ),
            "context": context,
            "operations": operations,
            "outcome": "counterfactual",
        }
        self.entries.appendleft(entry)
        return True

    def clear(self) -> None:
        """Clear entries while retaining the current decision dedupe signature."""
        self.entries.clear()

    def as_dict(self) -> dict[str, Any]:
        """Return Store-safe state."""
        return {
            "entries": list(self.entries),
            "last_signature": self.last_signature,
        }


class DuhnergySimulatorLog:
    """Persist simulator transitions with Home Assistant Store."""

    def __init__(self, hass, entry_id: str) -> None:
        from homeassistant.helpers.storage import Store

        self._store = Store(hass, 1, f"duhnergy.simulator.{entry_id}")
        self.model = SimulatorLogModel()

    async def async_load(self) -> None:
        """Load the persisted activity stream."""
        self.model = SimulatorLogModel(await self._store.async_load())

    async def async_append_shadow(self, **kwargs) -> bool:
        """Append a transition and persist it."""
        changed = self.model.append_shadow(**kwargs)
        if changed:
            await self._store.async_save(self.model.as_dict())
        return changed

    async def async_clear(self) -> None:
        """Clear and persist the activity stream."""
        self.model.clear()
        await self._store.async_save(self.model.as_dict())

    @property
    def entries(self) -> list[dict[str, Any]]:
        """Return newest-first entries."""
        return list(self.model.entries)
