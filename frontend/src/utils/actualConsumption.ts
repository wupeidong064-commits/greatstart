export interface ActualConsumption {
  actualConsumptionAmount?: number | null;
  knownConsumptionAmount?: number;
  unpricedConsumptionLessons?: number;
  monetaryHistoryComplete?: boolean;
}

export function actualAmount(report?: ActualConsumption | null) {
  return typeof report?.actualConsumptionAmount === 'number' &&
    Number.isFinite(report.actualConsumptionAmount)
    ? report.actualConsumptionAmount
    : null;
}

