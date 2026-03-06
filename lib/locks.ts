import type { NormalizedParameter, LockViolation } from "./types";

/**
 * Validate that a child version doesn't violate locked parameter constraints
 * from the parent version it was cloned from.
 *
 * Rules:
 *  - Locked param values must remain unchanged (value, unit, min, max)
 *  - If parent has numeric min/max, child must stay within that range
 */
export function validateLockConstraints(
  childParams: NormalizedParameter[],
  parentParams: NormalizedParameter[]
): LockViolation[] {
  const violations: LockViolation[] = [];

  for (const parentParam of parentParams) {
    if (!parentParam.isLocked) continue;

    const childParam = childParams.find(
      (p) => p.name === parentParam.name && p.sectionId === parentParam.sectionId
    );

    if (!childParam) {
      violations.push({
        paramName: parentParam.name,
        field: "existence",
        parentValue: parentParam.name,
        childValue: "(missing)",
        message: `Locked parameter "${parentParam.name}" was removed from child.`,
      });
      continue;
    }

    // Value must match exactly for locked params
    if (childParam.value !== parentParam.value) {
      violations.push({
        paramName: parentParam.name,
        field: "value",
        parentValue: parentParam.value,
        childValue: childParam.value,
        message: `Locked parameter "${parentParam.name}": value must be "${parentParam.value}" (got "${childParam.value}").`,
      });
    }

    // Unit must match
    if (childParam.unit !== parentParam.unit) {
      violations.push({
        paramName: parentParam.name,
        field: "unit",
        parentValue: parentParam.unit,
        childValue: childParam.unit,
        message: `Locked parameter "${parentParam.name}": unit must be "${parentParam.unit}" (got "${childParam.unit}").`,
      });
    }

    // Min/max must be within parent bounds (numeric check)
    const pMin = parseFloat(parentParam.min);
    const pMax = parseFloat(parentParam.max);
    const cMin = parseFloat(childParam.min);
    const cMax = parseFloat(childParam.max);

    if (!isNaN(pMin) && !isNaN(cMin) && cMin < pMin) {
      violations.push({
        paramName: parentParam.name,
        field: "min",
        parentValue: parentParam.min,
        childValue: childParam.min,
        message: `Locked parameter "${parentParam.name}": min (${childParam.min}) cannot be less than parent min (${parentParam.min}).`,
      });
    }

    if (!isNaN(pMax) && !isNaN(cMax) && cMax > pMax) {
      violations.push({
        paramName: parentParam.name,
        field: "max",
        parentValue: parentParam.max,
        childValue: childParam.max,
        message: `Locked parameter "${parentParam.name}": max (${childParam.max}) cannot exceed parent max (${parentParam.max}).`,
      });
    }
  }

  return violations;
}
