import { describe, expect, it } from "vitest";
import { averageInterviewScore, canMoveCandidate } from "./rules";
describe("recruitment governance", () => {
  it("allows only forward or terminal stage changes", () => {
    expect(canMoveCandidate("APPLIED", "SCREENING")).toBe(true);
    expect(canMoveCandidate("APPLIED", "HIRED")).toBe(false);
    expect(canMoveCandidate("HIRED", "SCREENING")).toBe(false);
  });
  it("averages interview scores", () => {
    expect(averageInterviewScore([4, 3, 5])).toBe(4);
    expect(averageInterviewScore([])).toBeNull();
  });
});
