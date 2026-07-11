"""Tests for the machine-profile data model."""

from __future__ import annotations

import pytest

from aslicer import SliceParameters
from aslicer.profile import (
    FEATURE_TYPES,
    FeatureSettings,
    MachineProfile,
    default_profile,
)


def test_default_profile_is_valid_and_named() -> None:
    profile = default_profile()
    assert profile.name == "M600 Stainless Steel 316L"
    assert profile.material == "single"
    # It is the shipped read-only master.
    assert profile.factory is True
    # Every feature type has settings.
    assert set(profile.features) == set(FEATURE_TYPES)


def test_feature_settings_validation_rejects_bad_values() -> None:
    with pytest.raises(ValueError):
        FeatureSettings(feed_rate_mm_s=0.0).validate("infill")
    with pytest.raises(ValueError):
        FeatureSettings(bead_width_mm=-1.0).validate("infill")
    with pytest.raises(ValueError):
        FeatureSettings(feeder="T9").validate("infill")


def test_feed_rate_mm_min_property() -> None:
    feature = FeatureSettings(feed_rate_mm_s=10.0)
    assert feature.feed_rate_mm_min == pytest.approx(600.0)


def test_profile_roundtrip_through_dict() -> None:
    profile = default_profile()
    restored = MachineProfile.from_dict(profile.to_dict())
    assert restored.to_dict() == profile.to_dict()


def test_from_dict_fills_partial_payload() -> None:
    profile = MachineProfile.from_dict({"name": "Tiny", "material": "dual"})
    assert profile.name == "Tiny"
    assert profile.material == "dual"
    # Missing fields fall back to defaults.
    assert set(profile.features) == set(FEATURE_TYPES)


def test_from_dict_rejects_invalid_enum() -> None:
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"axes": "7-axis"})


def test_infill_pattern_and_seam_defaults_and_roundtrip() -> None:
    profile = default_profile()
    assert profile.infill_pattern == "alternating"
    assert profile.seam_alignment == "nearest"
    assert profile.max_travel_no_retract_mm == pytest.approx(2.0)
    restored = MachineProfile.from_dict(
        {
            "infill_pattern": "rotating",
            "seam_alignment": "rear",
            "max_travel_no_retract_mm": 3.5,
        }
    )
    assert restored.infill_pattern == "rotating"
    assert restored.seam_alignment == "rear"
    assert restored.max_travel_no_retract_mm == pytest.approx(3.5)
    data = restored.to_dict()
    assert data["infill_pattern"] == "rotating"
    assert data["seam_alignment"] == "rear"
    assert data["max_travel_no_retract_mm"] == pytest.approx(3.5)


def test_infill_pattern_and_seam_reject_invalid_values() -> None:
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"infill_pattern": "spiral"})
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"seam_alignment": "front"})
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"max_travel_no_retract_mm": -1.0})


def test_max_travel_no_retract_projects_into_slice_parameters() -> None:
    profile = MachineProfile.from_dict({"max_travel_no_retract_mm": 4.0})
    assert profile.to_slice_parameters().max_travel_no_retract_mm == pytest.approx(4.0)


def test_effective_orient_disabled_on_three_axis() -> None:
    profile = MachineProfile.from_dict(
        {"axes": "3-axis", "orient_perimeters": "all"}
    )
    assert profile.orient_perimeters == "all"
    assert profile.effective_orient_perimeters == "none"


def test_effective_orient_kept_on_five_axis() -> None:
    profile = MachineProfile.from_dict(
        {"axes": "5-axis", "orient_perimeters": "overhang"}
    )
    assert profile.effective_orient_perimeters == "overhang"


def test_feeder_for_single_vs_dual() -> None:
    data = default_profile().to_dict()
    data["features"]["infill"]["feeder"] = "T1"

    single = MachineProfile.from_dict({**data, "material": "single"})
    assert single.feeder_for("infill") == "T0"

    dual = MachineProfile.from_dict({**data, "material": "dual"})
    assert dual.feeder_for("infill") == "T1"


def test_to_slice_parameters_projection() -> None:
    data = default_profile().to_dict()
    data["features"]["outer_perimeter"]["bead_width_mm"] = 1.5
    data["features"]["outer_perimeter"]["feed_rate_mm_s"] = 8.0
    data["features"]["infill"]["infill_density"] = 0.5
    data["material_diameter_mm"] = 1.2
    profile = MachineProfile.from_dict(data)

    params = profile.to_slice_parameters()
    assert isinstance(params, SliceParameters)
    assert params.bead_width_mm == pytest.approx(1.5)
    assert params.speed_mm_s == pytest.approx(8.0)
    assert params.material_diameter_mm == pytest.approx(1.2)


def test_default_profile_workspace_defaults() -> None:
    profile = default_profile()
    assert profile.build_volume_x_mm == pytest.approx(300.0)
    assert profile.build_volume_y_mm == pytest.approx(400.0)
    assert profile.build_volume_z_mm == pytest.approx(600.0)
    assert profile.origin_corner == "top_right"
    # Centre unset -> geometric centre of the plate.
    assert profile.center_x_mm is None
    assert profile.center_y_mm is None
    assert profile.effective_center_x_mm == pytest.approx(150.0)
    assert profile.effective_center_y_mm == pytest.approx(200.0)


def test_effective_center_uses_explicit_values() -> None:
    profile = MachineProfile.from_dict(
        {"center_x_mm": 120.0, "center_y_mm": 90.0}
    )
    assert profile.effective_center_x_mm == pytest.approx(120.0)
    assert profile.effective_center_y_mm == pytest.approx(90.0)


def test_workspace_survives_dict_roundtrip() -> None:
    profile = MachineProfile.from_dict(
        {
            "build_volume_x_mm": 250.0,
            "build_volume_y_mm": 350.0,
            "build_volume_z_mm": 500.0,
            "origin_corner": "bottom_left",
            "center_x_mm": 100.0,
            "center_y_mm": 175.0,
        }
    )
    restored = MachineProfile.from_dict(profile.to_dict())
    assert restored.to_dict() == profile.to_dict()
    assert restored.origin_corner == "bottom_left"
    assert restored.center_x_mm == pytest.approx(100.0)


def test_partial_build_volume_keeps_geometric_center() -> None:
    # Only the build size is given; the centre stays unset and derives from it.
    profile = MachineProfile.from_dict({"build_volume_x_mm": 200.0})
    assert profile.center_x_mm is None
    assert profile.effective_center_x_mm == pytest.approx(100.0)


def test_workspace_validation_rejects_bad_values() -> None:
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"origin_corner": "middle"})
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"build_volume_x_mm": 0.0})
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"build_volume_z_mm": -1.0})
    # Centre point outside the build area is rejected.
    with pytest.raises(ValueError):
        MachineProfile.from_dict(
            {"build_volume_x_mm": 300.0, "center_x_mm": 400.0}
        )


def test_origin_corner_accepts_center() -> None:
    profile = MachineProfile.from_dict({"origin_corner": "center"})
    assert profile.origin_corner == "center"
    assert MachineProfile.from_dict(profile.to_dict()).origin_corner == "center"


def test_material_density_default_and_roundtrip() -> None:
    profile = default_profile()
    assert profile.material_density_g_cm3 == pytest.approx(7.8)
    restored = MachineProfile.from_dict({"material_density_g_cm3": 4.5})
    assert restored.material_density_g_cm3 == pytest.approx(4.5)
    assert restored.to_dict()["material_density_g_cm3"] == pytest.approx(4.5)


def test_material_density_must_be_positive() -> None:
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"material_density_g_cm3": 0.0})


def test_thermal_properties_default_roundtrip_and_diffusivity() -> None:
    profile = default_profile()
    # Default 316L values.
    assert profile.material_thermal_conductivity_w_mk == pytest.approx(15.0)
    assert profile.material_specific_heat_j_kgk == pytest.approx(500.0)
    # alpha = k / (rho_kg_m3 * cp) = 15 / (7800 * 500) m^2/s -> ~3.846 mm^2/s.
    assert profile.thermal_diffusivity_mm2_s == pytest.approx(3.846, abs=1e-2)
    restored = MachineProfile.from_dict(
        {
            "material_thermal_conductivity_w_mk": 22.0,
            "material_specific_heat_j_kgk": 470.0,
        }
    )
    assert restored.material_thermal_conductivity_w_mk == pytest.approx(22.0)
    assert restored.material_specific_heat_j_kgk == pytest.approx(470.0)
    data = restored.to_dict()
    assert data["material_thermal_conductivity_w_mk"] == pytest.approx(22.0)
    assert data["material_specific_heat_j_kgk"] == pytest.approx(470.0)


def test_thermal_properties_must_be_positive() -> None:
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"material_thermal_conductivity_w_mk": 0.0})
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"material_specific_heat_j_kgk": -1.0})


def test_estimated_mass_scales_with_density_and_diameter() -> None:
    # 1 mm wire, 1000 mm feedstock, 7.8 g/cm^3:
    # volume = 1000 * pi * 0.5^2 = 785.398 mm^3 = 0.785398 cm^3 -> ~6.126 g.
    profile = MachineProfile.from_dict(
        {"material_diameter_mm": 1.0, "material_density_g_cm3": 7.8}
    )
    assert profile.estimated_mass_g(1000.0) == pytest.approx(6.126, abs=1e-2)
    # Doubling the density doubles the mass.
    denser = MachineProfile.from_dict(
        {"material_diameter_mm": 1.0, "material_density_g_cm3": 15.6}
    )
    assert denser.estimated_mass_g(1000.0) == pytest.approx(
        2.0 * profile.estimated_mass_g(1000.0)
    )
    # No feedstock -> no mass.
    assert profile.estimated_mass_g(0.0) == pytest.approx(0.0)


def test_support_perimeter_count_default_and_validation() -> None:
    # Support has no perimeters by default (fill only).
    assert default_profile().support_perimeter_count == 0
    restored = MachineProfile.from_dict({"support_perimeter_count": 3})
    assert restored.support_perimeter_count == 3
    assert restored.to_dict()["support_perimeter_count"] == 3
    # Zero is valid; negative is not.
    assert MachineProfile.from_dict({"support_perimeter_count": 0}).support_perimeter_count == 0
    with pytest.raises(ValueError):
        MachineProfile.from_dict({"support_perimeter_count": -1})


def test_support_perimeter_feature_types_present() -> None:
    profile = default_profile()
    assert "support_outer_perimeter" in profile.features
    assert "support_inner_perimeter" in profile.features
    # The legacy single support_perimeter key is gone.
    assert "support_perimeter" not in profile.features


def test_legacy_support_perimeter_feature_migrates() -> None:
    # Old payloads carried a single "support_perimeter" feature; both new
    # support perimeter features should inherit its settings.
    legacy = {
        "features": {
            "support_perimeter": {
                "feeder": "T0",
                "feed_rate_mm_s": 7.5,
                "bead_width_mm": 1.7,
                "laser_power": 850.0,
            }
        }
    }
    profile = MachineProfile.from_dict(legacy)
    assert profile.features["support_outer_perimeter"].bead_width_mm == pytest.approx(
        1.7
    )
    assert profile.features["support_inner_perimeter"].feed_rate_mm_s == pytest.approx(
        7.5
    )
