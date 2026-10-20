"""Solve the fleet-dispatch assignment with OR-Tools CP-SAT and cross-check the TypeScript Hungarian solver.

The TypeScript app expands each zone into capacity "slots" with diminishing marginal value and assigns
vehicles to slots at minimum cost (lib/solver.ts). `npm run export-instances` writes real instances of that
problem to python/data/instances.json. Here the same problems are modelled as a CP-SAT integer program:

    minimise    sum_{v,s} cost[v][s] * x[v,s]
    subject to  sum_s x[v,s] == 1      for every vehicle v     (each vehicle gets exactly one slot)
                sum_v x[v,s] <= 1      for every slot s        (slot capacity)
                x[v,s] in {0,1}

Costs are scaled to integers (CP-SAT is an integer solver). Pairings beyond the travel limit carry a large
penalty in the matrix, i.e. the limit is a soft wall, so a violation only happens when no feasible slot is free.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

from ortools.sat.python import cp_model

SCALE = 1000  # cost units -> integer milli-dollars
INSTANCES = Path(__file__).parent / "data" / "instances.json"


@dataclass
class Solution:
    status: str
    objective: float
    assignment: list[int]  # slot index per vehicle
    seconds: float
    limit_violations: int


def solve_instance(inst: dict, time_limit_s: float = 60.0, workers: int = 8) -> Solution:
    cost = inst["cost"]
    feasible = inst["feasible"]
    n_veh, n_slots = len(cost), len(cost[0])

    model = cp_model.CpModel()
    x = [[model.new_bool_var(f"x_{v}_{s}") for s in range(n_slots)] for v in range(n_veh)]
    for v in range(n_veh):
        model.add_exactly_one(x[v])
    for s in range(n_slots):
        model.add_at_most_one(x[v][s] for v in range(n_veh))
    model.minimize(sum(round(cost[v][s] * SCALE) * x[v][s] for v in range(n_veh) for s in range(n_slots)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_workers = workers
    t0 = time.perf_counter()
    status = solver.solve(model)
    seconds = time.perf_counter() - t0

    name = solver.status_name(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Solution(name, float("nan"), [], seconds, -1)
    assignment = [next(s for s in range(n_slots) if solver.value(x[v][s])) for v in range(n_veh)]
    violations = sum(1 for v, s in enumerate(assignment) if not feasible[v][s])
    return Solution(name, solver.objective_value / SCALE, assignment, seconds, violations)


def load_instances(path: Path = INSTANCES) -> list[dict]:
    return json.loads(path.read_text())


def main() -> None:
    print(f"{'scenario':<34}{'TS Hungarian':>14}{'CP-SAT':>14}{'diff':>10}  {'status':<9}{'sec':>6}  over-limit")
    for inst in load_instances():
        sol = solve_instance(inst)
        label = f"{inst['vehicles']}v, {inst['hour']:02d}:00, {inst['horizon']}h, {len(inst['slots'])} slots"
        diff = sol.objective - inst["hungarianCost"]
        print(
            f"{label:<34}{inst['hungarianCost']:>14.3f}{sol.objective:>14.3f}{diff:>10.4f}  "
            f"{sol.status:<9}{sol.seconds:>6.2f}  {sol.limit_violations}"
        )


if __name__ == "__main__":
    main()
