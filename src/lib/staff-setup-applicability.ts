import { structureForFundType } from "@/lib/fund-setup-canonical";

/**
 * Which staff-only setup cards apply to a fund. Pure; presentation only — the
 * server still authorizes every action. Banking and launch are shown elsewhere
 * on the Setup page, so the "Harmonious only" box never repeats them.
 */
export function staffSetupApplies(input: { fundType: string | null | undefined; hasMultipleClasses?: boolean | null }) {
  const spv = structureForFundType(input.fundType) === "spv";
  return {
    banking: false,
    launch: false,
    classAssignment: !spv || !!input.hasMultipleClasses,
  };
}
