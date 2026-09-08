"""Coordinator and safe immediate-action executor for Duhnergy."""

from __future__ import annotations

from datetime import timedelta
import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    MODE_AUTO,
    MODE_OFF,
    MODE_SHADOW,
    UPDATE_INTERVAL_SECONDS,
    effective_config,
)
from .planner import build_plan

_LOGGER = logging.getLogger(__name__)


class DuhnergyCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Collect inputs, calculate a plan, and execute only in Auto mode."""

    config_entry: ConfigEntry

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=UPDATE_INTERVAL_SECONDS),
        )
        self.config_entry = entry
        self.manual_command: str | None = None
        self.manual_expires_at = None
        self._last_reserve_signature: tuple | None = None
        self._last_battery_signature: tuple | None = None
        self._last_ev_signature: tuple | None = None
        self._last_ev_sent_at = None

    @property
    def config(self) -> dict[str, Any]:
        """Return effective config."""
        return effective_config(self.config_entry.data, self.config_entry.options)

    async def _async_update_data(self) -> dict[str, Any]:
        """Read HA state, plan, and apply the current policy."""
        now = dt_util.utcnow()
        config = self.config
        try:
            inputs = self._read_inputs(config)
            plan = build_plan(
                now=now,
                soc=inputs["battery_soc"],
                settings=config,
                import_forecast=inputs["import_forecast"],
                sale_forecast=inputs["sale_forecast"],
                solar_forecast=inputs["solar_forecast"],
            )
        except (TypeError, ValueError, KeyError) as err:
            raise UpdateFailed(f"Unable to calculate energy plan: {err}") from err

        if self.manual_expires_at is not None and now >= self.manual_expires_at:
            self.manual_command = None
            self.manual_expires_at = None

        mode = config["mode"]
        status = mode
        reason = plan["reason"]
        if mode == MODE_OFF:
            status = "off"
            reason = "Duhnergy is off; equipment is not being changed"
        elif mode == MODE_SHADOW:
            status = f"shadow: {plan['current_action']}"
            reason = f"Shadow calculation only: {plan['reason']}"
        elif self.manual_command:
            status = f"manual: {self.manual_command}"
            reason = "Guarded manual command active until the next planned transition"
            await self._async_execute_manual(self.manual_command, plan, inputs, config)
        elif mode == MODE_AUTO:
            status = f"auto: {plan['current_action']}"
            await self._async_execute_auto(plan, inputs, config)

        return {
            **inputs,
            "mode": mode,
            "status": status,
            "reason": reason,
            "manual_command": self.manual_command,
            "manual_expires_at": (
                self.manual_expires_at.isoformat() if self.manual_expires_at else None
            ),
            "plan": plan,
        }

    def _read_inputs(self, config: dict[str, Any]) -> dict[str, Any]:
        def numeric(
            key: str, default: float = 0.0, *, required: bool = False
        ) -> float:
            state = self.hass.states.get(config[key])
            if state is None or state.state in {"unknown", "unavailable", ""}:
                if required:
                    raise ValueError(
                        f"Required entity {config[key]} is unavailable"
                    )
                return default
            return float(state.state)

        def attributes(key: str) -> dict[str, Any]:
            state = self.hass.states.get(config[key])
            return dict(state.attributes) if state is not None else {}

        charger = self.hass.states.get(config["charger_status"])
        import_attrs = attributes("import_forecast")
        sale_attrs = attributes("sale_price")
        solar_attrs = attributes("solar_hourly")
        return {
            "battery_soc": numeric("battery_soc", required=True),
            "battery_power_w": numeric("battery_power"),
            "solar_power_w": numeric("solar_power", required=True),
            "house_power_w": numeric("house_power", required=True),
            "grid_power_w": numeric("grid_power", required=True),
            "ev_power_w": numeric("charger_power"),
            "charger_status": charger.state if charger else "unavailable",
            "import_price": numeric("import_price"),
            "sale_price": numeric("sale_price"),
            "import_forecast": import_attrs.get("prices", []),
            "sale_forecast": sale_attrs.get("forecast", []),
            "solar_forecast": {
                "time": solar_attrs.get("time", []),
                "pred_kw": solar_attrs.get("pred_kw", []),
                "today_kwh": numeric("solar_today"),
                "tomorrow_kwh": numeric("solar_tomorrow"),
            },
        }

    async def async_manual_command(self, command: str) -> None:
        """Activate a guarded command or immediately resume Auto."""
        if command == "resume_auto":
            self.manual_command = None
            self.manual_expires_at = None
        else:
            self.manual_command = command
            self.manual_expires_at = self._next_transition()
        await self.async_request_refresh()

    async def async_set_setting(self, key: str, value: Any) -> None:
        """Persist a setting through config-entry options."""
        options = {**self.config_entry.options, key: value}
        self.hass.config_entries.async_update_entry(self.config_entry, options=options)

    def _next_transition(self):
        now = dt_util.utcnow()
        if self.data:
            moments = []
            for item in self.data["plan"]["timeline"]:
                for key in ("start", "end"):
                    parsed = dt_util.parse_datetime(item[key])
                    if parsed is not None and parsed > now:
                        moments.append(parsed)
            if moments:
                return min(moments)
        return now + timedelta(hours=1)

    async def _async_execute_auto(
        self, plan: dict[str, Any], inputs: dict[str, Any], config: dict[str, Any]
    ) -> None:
        action = plan["current_action"]
        active = next(
            (
                item
                for item in plan["timeline"]
                if item["action"] == action
                and item["start"] <= plan["generated_at"] < item["end"]
            ),
            None,
        )
        await self._async_set_backup_reserve(config)
        if action == "battery_grid_charge" and active:
            await self._async_set_battery_action(
                "charge", active["start"], active["end"], config
            )
        elif (
            action == "battery_export"
            and active
            and inputs["battery_soc"] > config["export_stop_soc"]
        ):
            await self._async_set_battery_action(
                "export", active["start"], active["end"], config
            )
        else:
            await self._async_set_battery_action("idle", None, None, config)
        await self._async_apply_ev_policy(plan, inputs, config)

    async def _async_execute_manual(
        self,
        command: str,
        plan: dict[str, Any],
        inputs: dict[str, Any],
        config: dict[str, Any],
    ) -> None:
        end = (self.manual_expires_at or (dt_util.utcnow() + timedelta(hours=1))).isoformat()
        start = dt_util.utcnow().isoformat()
        await self._async_set_backup_reserve(config)
        if command == "charge_battery_now":
            await self._async_set_battery_action("charge", start, end, config)
            await self._async_set_ev(None, config)
        elif command == "export_now":
            if inputs["battery_soc"] > config["export_stop_soc"]:
                await self._async_set_battery_action("export", start, end, config)
            else:
                await self._async_set_battery_action("idle", None, None, config)
            await self._async_set_ev(None, config)
        elif command == "hold_battery":
            await self._async_set_battery_action("hold", None, None, config)
            await self._async_set_ev(None, config)
        elif command == "pause_ev":
            await self._async_set_ev(None, config)
        elif command in {"ev_solar", "ev_battery", "ev_grid"}:
            available = self._available_ev_current(inputs, config)
            if command == "ev_solar":
                excess_w = max(0.0, inputs["solar_power_w"] - inputs["house_power_w"])
                available = min(available, int(excess_w / 230))
            elif (
                command == "ev_battery"
                and inputs["battery_soc"] <= config["ev_battery_stop_soc"]
            ):
                available = 0
            elif command == "ev_battery":
                available = min(available, 6)
            await self._async_set_ev(available if available >= 6 else None, config)

    async def _async_set_backup_reserve(self, config: dict[str, Any]) -> None:
        signature = ("reserve", float(config["hard_backup_reserve"]))
        if signature == self._last_reserve_signature:
            return
        await self._async_number(config["backup_soc_control"], config["hard_backup_reserve"])
        await self._async_switch(config["reserve_mode"], True)
        self._last_reserve_signature = signature

    async def _async_set_battery_action(
        self, action: str, start: str | None, end: str | None, config: dict[str, Any]
    ) -> None:
        start_value = self._time_value(start) if start else None
        end_value = self._time_value(end) if end else None
        signature = (action, start_value, end_value, float(config["hard_backup_reserve"]))
        if signature == self._last_battery_signature:
            return
        if action == "charge":
            await self._async_time(config["charge_start"], start_value)
            await self._async_time(config["charge_end"], end_value)
            await self._async_switch(config["discharge_slot_enabled"], False)
            await self._async_switch(config["allow_grid_charge"], True)
            await self._async_switch(config["charge_slot_enabled"], True)
        elif action == "export":
            await self._async_time(config["discharge_start"], start_value)
            await self._async_time(config["discharge_end"], end_value)
            await self._async_switch(config["charge_slot_enabled"], False)
            await self._async_switch(config["allow_grid_charge"], False)
            await self._async_switch(config["discharge_slot_enabled"], True)
        elif action == "hold":
            await self._async_switch(config["charge_slot_enabled"], False)
            await self._async_switch(config["discharge_slot_enabled"], False)
            await self._async_switch(config["allow_grid_charge"], False)
            await self._async_switch(config["reserve_mode"], True)
        else:
            await self._async_switch(config["charge_slot_enabled"], False)
            await self._async_switch(config["discharge_slot_enabled"], False)
            await self._async_switch(config["allow_grid_charge"], False)
        self._last_battery_signature = signature

    async def _async_apply_ev_policy(
        self, plan: dict[str, Any], inputs: dict[str, Any], config: dict[str, Any]
    ) -> None:
        if plan["current_action"] in {"battery_grid_charge", "battery_export"}:
            await self._async_set_ev(None, config)
            return
        excess_w = max(0.0, inputs["solar_power_w"] - inputs["house_power_w"])
        if excess_w >= 1380:
            current = min(self._available_ev_current(inputs, config), int(excess_w / 230))
            await self._async_set_ev(current if current >= 6 else None, config)
        elif (
            plan["surplus_kwh"] > 0
            and inputs["battery_soc"] > config["ev_battery_stop_soc"]
        ):
            await self._async_set_ev(min(6, self._available_ev_current(inputs, config)), config)
        elif plan["current_action"] == "ev_grid_charge":
            current = self._available_ev_current(inputs, config)
            await self._async_set_ev(current if current >= 6 else None, config)
        else:
            await self._async_set_ev(None, config)

    def _available_ev_current(
        self, inputs: dict[str, Any], config: dict[str, Any]
    ) -> int:
        non_ev_import_w = max(
            0.0, inputs["grid_power_w"] - max(0.0, inputs["ev_power_w"])
        )
        non_ev_amps = non_ev_import_w / 230
        return min(32, max(0, int(float(config["grid_current_limit"]) - non_ev_amps)))

    async def _async_set_ev(self, current: int | None, config: dict[str, Any]) -> None:
        device_id = self._easee_device_id(config)
        signature = (device_id, current)
        now = dt_util.utcnow()
        active_limit_is_fresh = (
            current is not None
            and self._last_ev_sent_at is not None
            and now - self._last_ev_sent_at < timedelta(minutes=5)
        )
        if signature == self._last_ev_signature and (
            current is None or active_limit_is_fresh
        ):
            return
        if not device_id:
            _LOGGER.warning(
                "No Easee device is linked to %s; EV action skipped",
                config["charger_status"],
            )
            return
        if current is None or current < 6:
            await self.hass.services.async_call(
                "easee",
                "action_command",
                {"device_id": device_id, "action_command": "pause"},
                blocking=True,
            )
        else:
            await self.hass.services.async_call(
                "easee",
                "set_charger_dynamic_limit",
                {"device_id": device_id, "current": current, "time_to_live": 10},
                blocking=True,
            )
            await self.hass.services.async_call(
                "easee",
                "action_command",
                {"device_id": device_id, "action_command": "resume"},
                blocking=True,
            )
        self._last_ev_signature = signature
        self._last_ev_sent_at = now

    def _easee_device_id(self, config: dict[str, Any]) -> str | None:
        registry = er.async_get(self.hass)
        entry = registry.async_get(config["charger_status"])
        return entry.device_id if entry else None

    async def _async_switch(self, entity_id: str, enabled: bool) -> None:
        await self.hass.services.async_call(
            "homeassistant",
            "turn_on" if enabled else "turn_off",
            {"entity_id": entity_id},
            blocking=True,
        )

    async def _async_number(self, entity_id: str, value: float) -> None:
        await self.hass.services.async_call(
            "number", "set_value", {"entity_id": entity_id, "value": value}, blocking=True
        )

    async def _async_time(self, entity_id: str, value: str | None) -> None:
        if value is not None:
            await self.hass.services.async_call(
                "time", "set_value", {"entity_id": entity_id, "time": value}, blocking=True
            )

    @staticmethod
    def _time_value(value: str) -> str:
        parsed = dt_util.parse_datetime(value)
        if parsed is None:
            raise ValueError(f"Invalid schedule time: {value}")
        return dt_util.as_local(parsed).strftime("%H:%M:%S")
