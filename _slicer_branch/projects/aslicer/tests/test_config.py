"""Tests for process parameters and feed math."""

from __future__ import annotations

import math

import pytest

from aslicer import SliceParameters


def test_defaults_match_discovery_target() -> None:
    params = SliceParameters()
    assert params.layer_height_mm == 1.0
    assert params.bead_width_mm == 1.2
    assert params.speed_mm_s == 10.0
    assert params.material_diameter_mm == 1.0


def test_first_layer_offset_defaults_to_layer_height() -> None:
    assert SliceParameters().first_layer_z_offset == 1.0
    assert SliceParameters(first_layer_offset_mm=0.5).first_layer_z_offset == 0.5


def test_speed_conversion_to_mm_per_min() -> None:
    assert SliceParameters(speed_mm_s=10.0).speed_mm_min == 600.0


def test_feed_length_conserves_volume() -> None:
    params = SliceParameters()
    length = 100.0
    bead_volume = params.bead_cross_section_mm2 * length
    wire_area = math.pi * (params.material_diameter_mm / 2.0) ** 2
    assert params.feed_length_for_path(length) == pytest.approx(bead_volume / wire_area)


def test_invalid_parameters_rejected() -> None:
    with pytest.raises(ValueError):
        SliceParameters(layer_height_mm=0.0)
    with pytest.raises(ValueError):
        SliceParameters(material_diameter_mm=-1.0)
