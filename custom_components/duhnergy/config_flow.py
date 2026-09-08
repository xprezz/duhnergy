"""Config and options flows for Duhnergy."""

from __future__ import annotations

from homeassistant import config_entries
from homeassistant.helpers.selector import EntitySelector, EntitySelectorConfig
import voluptuous as vol

from .const import (
    DOMAIN,
    ENTITY_DEFAULTS,
    MODES,
    SETTING_DEFAULTS,
    SETTING_RANGES,
    effective_config,
)


def _schema(current: dict) -> vol.Schema:
    fields: dict = {}
    for key, default in ENTITY_DEFAULTS.items():
        fields[
            vol.Optional(
                key,
                default=current.get(key, default),
                description={"suggested_value": current.get(key, default)},
            )
        ] = EntitySelector(EntitySelectorConfig())
    fields[vol.Optional("mode", default=current.get("mode", "shadow"))] = vol.In(MODES)
    for key, default in SETTING_DEFAULTS.items():
        if key == "mode":
            continue
        minimum, maximum, _step, _unit = SETTING_RANGES[key]
        fields[vol.Optional(key, default=current.get(key, default))] = vol.All(
            vol.Coerce(float), vol.Range(min=minimum, max=maximum)
        )
    return vol.Schema(fields)


class DuhnergyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a Duhnergy config flow."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Create the single Duhnergy instance."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Duhnergy!", data=user_input)
        return self.async_show_form(
            step_id="user", data_schema=_schema(effective_config({}, {}))
        )

    @staticmethod
    def async_get_options_flow(config_entry):
        """Return the options flow."""
        return DuhnergyOptionsFlow(config_entry)


class DuhnergyOptionsFlow(config_entries.OptionsFlow):
    """Allow every entity mapping and setting to be changed."""

    def __init__(self, config_entry) -> None:
        self._entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage Duhnergy options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        current = effective_config(self._entry.data, self._entry.options)
        return self.async_show_form(step_id="init", data_schema=_schema(current))
