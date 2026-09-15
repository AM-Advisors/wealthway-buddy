/**
 * Vesting maths, shared by the employee portal and the company equity desk.
 * Everything is derived from the schedule on the grant — nothing is stored.
 */

export type VestingSchedule = {
  name: string;
  startDate: string | null;
  cliffMonths: number;
  durationMonths: number;
  frequency: string;
};

function monthsBetween(from: Date, to: Date) {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return to.getDate() >= from.getDate() ? months : months - 1;
}

function periodMonths(frequency: string) {
  switch (frequency) {
    case "annual":
    case "annually":
    case "yearly":
      return 12;
    case "quarterly":
      return 3;
    case "daily":
      return 0; // handled separately
    default:
      return 1; // monthly
  }
}

export type VestingResult = {
  vested: number;
  unvested: number;
  percent: number;
  elapsedMonths: number;
  cliffPassed: boolean;
  cliffDate: string | null;
  fullyVestedDate: string | null;
  nextVestDate: string | null;
  nextVestQuantity: number;
  complete: boolean;
};

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function computeVesting(
  quantity: number,
  schedule: VestingSchedule | null | undefined,
  asOf: Date = new Date(),
): VestingResult {
  if (!schedule || !schedule.startDate || !schedule.durationMonths) {
    return {
      vested: quantity,
      unvested: 0,
      percent: 100,
      elapsedMonths: 0,
      cliffPassed: true,
      cliffDate: null,
      fullyVestedDate: null,
      nextVestDate: null,
      nextVestQuantity: 0,
      complete: true,
    };
  }

  const start = new Date(schedule.startDate);
  const elapsed = Math.max(monthsBetween(start, asOf), 0);
  const duration = schedule.durationMonths;
  const cliff = schedule.cliffMonths ?? 0;
  const cliffDate = cliff > 0 ? addMonths(start, cliff) : start;
  const fullDate = addMonths(start, duration);
  const step = periodMonths(schedule.frequency) || 1;

  if (elapsed < cliff) {
    const atCliff = Math.floor((quantity * Math.min(cliff, duration)) / duration);
    return {
      vested: 0,
      unvested: quantity,
      percent: 0,
      elapsedMonths: elapsed,
      cliffPassed: false,
      cliffDate: cliffDate.toISOString().slice(0, 10),
      fullyVestedDate: fullDate.toISOString().slice(0, 10),
      nextVestDate: cliffDate.toISOString().slice(0, 10),
      nextVestQuantity: atCliff,
      complete: false,
    };
  }

  const vestedMonths = Math.min(Math.floor(elapsed / step) * step, duration);
  const vested = Math.min(Math.floor((quantity * vestedMonths) / duration), quantity);
  const complete = vestedMonths >= duration;
  const nextMonths = Math.min(vestedMonths + step, duration);
  const nextVested = Math.min(Math.floor((quantity * nextMonths) / duration), quantity);

  return {
    vested,
    unvested: Math.max(quantity - vested, 0),
    percent: quantity ? (vested / quantity) * 100 : 0,
    elapsedMonths: elapsed,
    cliffPassed: true,
    cliffDate: cliff > 0 ? cliffDate.toISOString().slice(0, 10) : null,
    fullyVestedDate: fullDate.toISOString().slice(0, 10),
    nextVestDate: complete ? null : addMonths(start, nextMonths).toISOString().slice(0, 10),
    nextVestQuantity: complete ? 0 : Math.max(nextVested - vested, 0),
    complete,
  };
}
