import json
from types import SimpleNamespace
import pytest
from pathlib import Path
from solver.adapter import PandapowerAdapter
from solver.contracts import AnalysisInput
from tests.fakes.fake_pandapower import FakePandapower

FIXTURE = Path(__file__).parent / "fixtures" / "input_valid.json"


def test_adapter_maps_phase_one_model():
    analysis_input = AnalysisInput.parse(json.loads(FIXTURE.read_text(encoding="utf-8")))
    fake = FakePandapower()
    context = PandapowerAdapter(fake).build(analysis_input)
    assert len(context.net.bus) == 3
    assert len(context.net.ext_grid) == 1
    assert len(context.net.load) == 1
    assert len(context.net.line) == 1
    assert len(context.net.trafo) == 1
    line = context.net.line.iloc[0]
    assert line["parallel"] == 1
    assert line["c_nf_per_km"] > 0
    assert context.component_to_element["line-main"]["elementType"] == "line"


def test_rejects_unsupported_in_service_component():
    valid_analysis_input = AnalysisInput.parse(json.loads(FIXTURE.read_text(encoding="utf-8")))
    from solver.adapter import PandapowerAdapter
    from solver.exceptions import ModelAdapterError
    from tests.fakes.fake_pandapower import FakePandapower

    valid_analysis_input.electrical_model["components"].append({
        "id": "trafo-3w-1",
        "kind": "TRANSFORMER_3W",
        "name": "Transformador 3W pendiente",
        "parameters": {},
        "operatingState": {"inService": True},
    })
    valid_analysis_input.electrical_model["terminals"].extend([
        {"id": "t3w-hv", "componentId": "trafo-3w-1", "role": "HV", "connectionNodeId": "cn-term-220"},
        {"id": "t3w-mv", "componentId": "trafo-3w-1", "role": "MV", "connectionNodeId": "cn-term-66"},
        {"id": "t3w-lv", "componentId": "trafo-3w-1", "role": "LV", "connectionNodeId": "cn-term-remote"},
    ])

    with pytest.raises(ModelAdapterError, match="tipo no soportado"):
        PandapowerAdapter(FakePandapower()).build(valid_analysis_input)


def test_transformer_clock_shift_is_derived_from_vector_group():
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    transformer = next(item for item in payload["electricalModel"]["components"] if item["id"] == "tr2-main")
    transformer.setdefault("parameters", {})["vectorGroup"] = {"value": "YNd11", "source": "USER", "status": "CONFIRMED"}
    analysis_input = AnalysisInput.parse(payload)
    context = PandapowerAdapter(FakePandapower()).build(analysis_input)
    assert context.net.trafo.iloc[0]["shift_degree"] == 330.0
    assert any(item["code"] == "TRANSFORMER_PHASE_SHIFT_DERIVED_FROM_VECTOR_GROUP" for item in context.warnings)


def test_shunt_total_power_is_split_across_steps():
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payload["electricalModel"]["components"].append({
        "id": "shunt-1",
        "kind": "SHUNT",
        "name": "Banco 12 MVAr",
        "parameters": {
            "reactivePowerKvar": {"value": 12000, "source": "USER", "status": "CONFIRMED"},
            "steps": {"value": 3, "source": "USER", "status": "CONFIRMED"},
            "controlMode": {"value": "Fijo", "source": "USER", "status": "CONFIRMED"},
        },
        "operatingState": {"inService": True},
    })
    payload["electricalModel"]["terminals"].append({
        "id": "shunt-1:terminal:1",
        "componentId": "shunt-1",
        "role": "CONNECTION",
        "connectionNodeId": "cn-term-66",
    })
    analysis_input = AnalysisInput.parse(payload)
    context = PandapowerAdapter(FakePandapower()).build(analysis_input)
    shunt = context.net.shunt.iloc[0]
    assert shunt["q_mvar"] == -4.0
    assert shunt["step"] == 3
    assert shunt["max_step"] == 3



def test_adapter_excludes_open_switch_island_before_building_network():
    analysis_input = AnalysisInput.parse(json.loads(FIXTURE.read_text(encoding="utf-8")))
    model = analysis_input.electrical_model
    branch = next(item for item in model["components"] if item["id"] == "line-main")
    branch["kind"] = "SWITCH"
    branch["operatingState"] = {"inService": True, "switchClosed": False}
    load_terminal = next(item for item in model["terminals"] if item["componentId"] == "load-1")
    load_terminal["connectionNodeId"] = "cn-term-remote"

    context = PandapowerAdapter(FakePandapower()).build(analysis_input)

    assert len(context.net.bus) == 2
    assert len(context.net.ext_grid) == 1
    assert len(context.net.trafo) == 1
    assert len(context.net.line) == 0
    assert len(context.net.switch) == 0
    assert len(context.net.load) == 0
    assert any(item["code"] == "ISLAND_EXCLUDED_FROM_ANALYSIS" for item in context.warnings)
    assert any(item["componentId"] == "line-main" for item in context.ignored_components)


class _ConnectivityGuardFake(FakePandapower):
    def __init__(self):
        self.deactivated = False
        self.topology = SimpleNamespace(
            unsupplied_buses=lambda net, **kwargs: {int(net.bus.index[-1])},
        )
        self.toolbox = SimpleNamespace(
            set_isolated_areas_out_of_service=self._deactivate,
        )

    def _deactivate(self, net, **kwargs):
        self.deactivated = True
        net.bus.loc[net.bus.index[-1], "in_service"] = False


def test_adapter_deactivates_any_residual_unsupplied_area_as_final_guard():
    analysis_input = AnalysisInput.parse(json.loads(FIXTURE.read_text(encoding="utf-8")))
    fake = _ConnectivityGuardFake()

    context = PandapowerAdapter(fake).build(analysis_input)

    assert fake.deactivated is True
    assert context.net.bus.iloc[-1]["in_service"] == False
    warning = next(item for item in context.warnings if item["code"] == "RESIDUAL_ISLAND_DEACTIVATED")
    assert warning["connectionNodeIds"]
