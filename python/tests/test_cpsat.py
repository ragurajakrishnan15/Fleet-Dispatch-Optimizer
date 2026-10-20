"""CP-SAT must reproduce the optimum of the TypeScript Hungarian solver on real exported instances."""
import pytest

from cpsat_dispatch import load_instances, solve_instance

INSTANCES = load_instances()


@pytest.mark.parametrize("inst", INSTANCES, ids=lambda i: f"{i['vehicles']}v-{i['hour']:02d}h-{i['horizon']}h")
def test_cpsat_matches_hungarian(inst):
    sol = solve_instance(inst, time_limit_s=120)
    assert sol.status == "OPTIMAL"
    # costs are rounded to 1e-3 inside CP-SAT, so allow rounding slack per vehicle
    assert abs(sol.objective - inst["hungarianCost"]) <= len(inst["cost"]) * 5e-4 + 1e-6


def test_cpsat_assignment_is_valid():
    inst = INSTANCES[0]
    sol = solve_instance(inst)
    assert len(sol.assignment) == inst["vehicles"]
    assert len(set(sol.assignment)) == inst["vehicles"], "each slot used at most once"
