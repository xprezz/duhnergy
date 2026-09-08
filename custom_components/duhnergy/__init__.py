"""Duhnergy Home Assistant integration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
import voluptuous as vol

from .const import CARD_URL, DOMAIN, MANUAL_COMMANDS, PLATFORMS
from .coordinator import DuhnergyCoordinator

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

SERVICE_COMMAND_SCHEMA = vol.Schema(
    {vol.Required("command"): vol.In(MANUAL_COMMANDS + ["resume_auto"])}
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up static assets and integration-wide services."""
    static_path = Path(__file__).parent / "static"
    hass.http.register_static_path(
        CARD_URL.rsplit("/", 1)[0], str(static_path), cache_headers=False
    )
    add_extra_js_url(hass, f"{CARD_URL}?v=0.1.0")

    async def async_command(call: ServiceCall) -> None:
        entries = hass.config_entries.async_entries(DOMAIN)
        if not entries:
            raise HomeAssistantError("Duhnergy is not configured")
        coordinator: DuhnergyCoordinator = hass.data[DOMAIN][entries[0].entry_id]
        await coordinator.async_manual_command(call.data["command"])

    hass.services.async_register(
        DOMAIN, "command", async_command, schema=SERVICE_COMMAND_SCHEMA
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry) -> bool:
    """Set up Duhnergy from a config entry."""
    coordinator = DuhnergyCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry) -> bool:
    """Unload a config entry."""
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded


async def _async_reload_entry(hass: HomeAssistant, entry) -> None:
    """Reload after options change."""
    await hass.config_entries.async_reload(entry.entry_id)
