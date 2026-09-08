"""Guarded Duhnergy command buttons."""

from homeassistant.components.button import ButtonEntity

from .const import DOMAIN, MANUAL_COMMANDS
from .entity import DuhnergyEntity

NAMES = {
    "charge_battery_now": "Charge battery now",
    "export_now": "Export now",
    "hold_battery": "Hold battery",
    "ev_solar": "EV Solar",
    "ev_battery": "EV Battery",
    "ev_grid": "EV Grid",
    "pause_ev": "Pause EV",
    "resume_auto": "Resume Auto",
}


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    """Set up command buttons."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        DuhnergyCommandButton(coordinator, command)
        for command in [*MANUAL_COMMANDS, "resume_auto"]
    )


class DuhnergyCommandButton(DuhnergyEntity, ButtonEntity):
    """Run an expiring manual command."""

    def __init__(self, coordinator, command: str) -> None:
        super().__init__(coordinator, command)
        self.command = command
        self._attr_name = NAMES[command]
        self._attr_icon = (
            "mdi:play-circle-outline"
            if command == "resume_auto"
            else "mdi:gesture-tap-button"
        )

    async def async_press(self) -> None:
        """Activate the command."""
        await self.coordinator.async_manual_command(self.command)
