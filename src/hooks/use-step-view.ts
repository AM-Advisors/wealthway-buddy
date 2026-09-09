import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";

import { recordStepView, type StepKey } from "@/lib/step-tracking.functions";

/** Records once per mount that the investor opened this onboarding step. */
export function useStepView(step: StepKey) {
  const record = useServerFn(recordStepView);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void record({ data: { step } }).catch(() => {});
  }, [record, step]);
}
