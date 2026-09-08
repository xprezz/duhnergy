"""Constants for Duhnergy."""

from __future__ import annotations

DOMAIN = "duhnergy"
PLATFORMS = ["sensor", "number", "select", "button"]

MODE_SHADOW = "shadow"
MODE_AUTO = "auto"
MODE_OFF = "off"
MODES = [MODE_SHADOW, MODE_AUTO, MODE_OFF]

MANUAL_COMMANDS = [
    "charge_battery_now",
    "export_now",
    "hold_battery",
    "ev_solar",
    "ev_battery",
    "ev_grid",
    "pause_ev",
]

ENTITY_DEFAULTS = {
    "battery_soc": "sensor.solis_battery_soc",
    "battery_power": "sensor.solis_battery_power",
    "solar_power": "sensor.solis_total_pv_power",
    "house_power": "sensor.solis_household_load_power",
    "grid_power": "sensor.solis_grid_power_net",
    "house_energy": "sensor.solis_household_load_total_energy",
    "grid_import_energy": "sensor.solis_total_energy_imported_from_grid",
    "grid_export_energy": "sensor.solis_total_energy_fed_into_grid",
    "import_price": "sensor.stromligning_current_price_vat",
    "import_forecast": "sensor.stromligning_forecasts_vat",
    "sale_price": "sensor.solar_real_sales_price",
    "solar_hourly": "sensor.garage_my_solar_forecast_hourly_forecast",
    "solar_today": "sensor.garage_my_solar_forecast_today",
    "solar_tomorrow": "sensor.garage_my_solar_forecast_tomorrow",
    "charger_status": "sensor.toadhall_charger_status",
    "charger_power": "sensor.toadhall_charger_power",
    "allow_grid_charge": "switch.allow_grid_to_charge_the_battery",
    "charge_slot_enabled": "switch.grid_time_of_use_charging_period_1",
    "discharge_slot_enabled": "switch.grid_time_of_use_discharge_period_1",
    "reserve_mode": "switch.reserve_battery_mode",
    "backup_soc_control": "number.solis_backup_soc",
    "max_charge_current": "number.solis_battery_max_charge_current",
    "charge_start": "time.solis_grid_time_of_use_charge_start_slot_1",
    "charge_end": "time.solis_grid_time_of_use_charge_end_slot_1",
    "discharge_start": "time.solis_grid_time_of_use_discharge_start_slot_1",
    "discharge_end": "time.solis_grid_time_of_use_discharge_end_slot_1",
}

ENTITY_LABELS = {
    "battery_soc": "Battery SOC",
    "battery_power": "Battery power",
    "solar_power": "Solar power",
    "house_power": "House power",
    "grid_power": "Grid net power",
    "house_energy": "House cumulative energy",
    "grid_import_energy": "Grid import cumulative energy",
    "grid_export_energy": "Grid export cumulative energy",
    "import_price": "Current import price",
    "import_forecast": "Import price forecast",
    "sale_price": "Sale price and forecast",
    "solar_hourly": "Hourly solar forecast",
    "solar_today": "Today's solar forecast",
    "solar_tomorrow": "Tomorrow's solar forecast",
    "charger_status": "Easee charger status",
    "charger_power": "Easee charger power",
    "allow_grid_charge": "Allow grid charge switch",
    "charge_slot_enabled": "Charge slot 1 switch",
    "discharge_slot_enabled": "Discharge slot 1 switch",
    "reserve_mode": "Reserve battery mode switch",
    "backup_soc_control": "Solis backup SOC control",
    "max_charge_current": "Solis maximum charge current",
    "charge_start": "Charge slot 1 start",
    "charge_end": "Charge slot 1 end",
    "discharge_start": "Discharge slot 1 start",
    "discharge_end": "Discharge slot 1 end",
}

SETTING_DEFAULTS = {
    "mode": MODE_SHADOW,
    "hard_backup_reserve": 20.0,
    "export_stop_soc": 35.0,
    "ev_battery_stop_soc": 45.0,
    "battery_capacity": 10.0,
    "solar_forecast_margin": 80.0,
    "household_daily_demand": 12.0,
    "grid_current_limit": 25.0,
}

OPTION_DEFAULTS = {
    "currency": "DKK",
    "battery_power_positive": "charge",
    "grid_power_positive": "import",
}

SETTING_RANGES = {
    "hard_backup_reserve": (5.0, 95.0, 1.0, "%"),
    "export_stop_soc": (5.0, 100.0, 1.0, "%"),
    "ev_battery_stop_soc": (5.0, 100.0, 1.0, "%"),
    "battery_capacity": (1.0, 100.0, 0.5, "kWh"),
    "solar_forecast_margin": (10.0, 120.0, 5.0, "%"),
    "household_daily_demand": (0.0, 100.0, 0.5, "kWh"),
    "grid_current_limit": (6.0, 63.0, 1.0, "A"),
}

UPDATE_INTERVAL_SECONDS = 60
CARD_URL = "/duhnergy/duhnergy-card.js"
VERSION = "0.2.0"


def effective_config(data: dict, options: dict) -> dict:
    """Return defaults overlaid with config-entry data and options."""
    return {
        **ENTITY_DEFAULTS,
        **SETTING_DEFAULTS,
        **OPTION_DEFAULTS,
        **data,
        **options,
    }
