import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { managerInvestorTodos } from "@/lib/manager-investor-todos.server";

/** One to-do list across a fund's investors, for the fund manager. */
export const managerInvestorTodosFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ fundId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => managerInvestorTodos(context.userId, data.fundId));
