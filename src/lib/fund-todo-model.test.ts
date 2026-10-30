import { describe, expect, it } from "vitest";
import { fundTodoState, type FundTodo } from "./fund-todo-model";

const terms: FundTodo = { id: "terms", label: "Economic terms approved", section: "economics", status: "not_started", answer: "", description: null, dueDate: null };
describe("fund setup to-dos", () => {
  it("approved canonical terms need no duplicate check-off", () => {
    expect(fundTodoState(terms, true).complete).toBe(true);
  });
  it("a note or review label never approves fees and terms", () => {
    expect(fundTodoState({ ...terms, status: "review", answer: "Looks good", done: true }, false).complete).toBe(false);
  });
  it("a note never completes unfinished setup work", () => {
    expect(fundTodoState({ ...terms, section: "fund_information", answer: "Saved a note" }).complete).toBe(false);
  });
  it("a completed setup task stays complete", () => {
    expect(fundTodoState({ ...terms, section: "entity", status: "complete" }).complete).toBe(true);
  });
});