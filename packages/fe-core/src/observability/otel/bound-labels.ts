import { UNKNOWN_LABEL } from "../contracts/conts";
import { METRIC_OUTCOMES } from "./conts";
import type { MetricAttributes, MetricCatalog } from "./types";

/** Ограничивает operation/code каталогом и outcome известным набором; неизвестные значения заменяет общим label для ограничения кардинальности. */
export const boundLabels = ({
  attributes,
  catalog,
}: Readonly<{
  attributes: MetricAttributes;
  catalog: MetricCatalog;
}>): MetricAttributes => ({
  operation: catalog.operations.includes(attributes.operation ?? "")
    ? (attributes.operation ?? UNKNOWN_LABEL)
    : UNKNOWN_LABEL,
  code: catalog.codes.includes(attributes.code ?? "")
    ? (attributes.code ?? UNKNOWN_LABEL)
    : UNKNOWN_LABEL,
  outcome: METRIC_OUTCOMES.includes(attributes.outcome ?? "")
    ? (attributes.outcome ?? UNKNOWN_LABEL)
    : UNKNOWN_LABEL,
});
