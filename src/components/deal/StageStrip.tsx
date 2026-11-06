import type { Deal } from "@/deals/state-machine";
import { STAGES, stageOf } from "./stages";

/** Where the Deal is, shown by position and weight — no numbering. */
export function StageStrip({ deal }: { deal: Deal }) {
  const current = STAGES.findIndex((stage) => stage.key === stageOf(deal).key);
  return (
    <ol aria-label="Deal progress" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      {STAGES.map((stage, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li
            key={stage.key}
            aria-current={state === "current" ? "step" : undefined}
            className={state === "current" ? "font-medium text-ink" : state === "done" ? "text-ink" : "text-muted"}
          >
            <span
              aria-hidden="true"
              className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${
                state === "todo" ? "bg-control" : "bg-accent"
              }`}
            />
            {stage.label}
          </li>
        );
      })}
    </ol>
  );
}
