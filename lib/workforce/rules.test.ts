import { describe, expect, it } from "vitest";
import { attendanceAction, businessDaysBetween, isLate } from "./rules";

describe("businessDaysBetween", () => {
  it("counts weekdays inclusively", () =>
    expect(businessDaysBetween("2026-10-12", "2026-10-16")).toBe(5));
  it("excludes weekends and holidays", () =>
    expect(
      businessDaysBetween("2026-10-09", "2026-10-13", ["2026-10-12"]),
    ).toBe(2));
  it("rejects reversed ranges", () =>
    expect(businessDaysBetween("2026-10-13", "2026-10-12")).toBe(0));
});

describe("attendance rules", () => {
  it("chooses the next clock action", () => {
    expect(attendanceAction(null, null)).toBe("CLOCK_IN");
    expect(attendanceAction("2026-10-11T07:00:00Z", null)).toBe("CLOCK_OUT");
    expect(
      attendanceAction("2026-10-11T07:00:00Z", "2026-10-11T15:00:00Z"),
    ).toBe("COMPLETE");
  });
  it("applies grace minutes", () => {
    const start = new Date("2026-10-11T07:00:00Z");
    expect(isLate(new Date("2026-10-11T07:10:00Z"), start, 10)).toBe(false);
    expect(isLate(new Date("2026-10-11T07:10:01Z"), start, 10)).toBe(true);
  });
});
