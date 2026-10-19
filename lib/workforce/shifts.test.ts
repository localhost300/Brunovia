import { describe, expect, it } from "vitest";
import { getWeekdayShiftOptions } from "./shifts";

describe("weekday shift options", () => {
  it("includes Full Day for the weekday assignment selector", () => {
    const shifts = [
      { id: "morning", name: "Morning" },
      { id: "full-day", name: "Full Day" },
      { id: "evening", name: "Evening" },
    ];

    expect(getWeekdayShiftOptions(shifts).map((shift) => shift.name)).toEqual([
      "Morning",
      "Full Day",
      "Evening",
    ]);
  });
});
