import { describe, expect, it } from "vitest";
import { getEasternSlot, randomDailySlot } from "./schedule";

describe("Eastern daily scheduling", () => {
  it("calculates slots across the spring daylight-saving jump", () => {
    expect(getEasternSlot(new Date("2026-03-08T06:45:00Z"))).toEqual({
      localDate: "2026-03-08",
      slot: 7,
    });
    expect(getEasternSlot(new Date("2026-03-08T07:00:00Z"))).toEqual({
      localDate: "2026-03-08",
      slot: 12,
    });
  });

  it("maps both instances of the repeated fall hour to the same daily slot", () => {
    expect(getEasternSlot(new Date("2026-11-01T05:30:00Z"))).toEqual(
      getEasternSlot(new Date("2026-11-01T06:30:00Z")),
    );
  });

  it("always chooses one of the 96 quarter-hour slots", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(randomDailySlot()).toBeGreaterThanOrEqual(0);
      expect(randomDailySlot()).toBeLessThan(96);
    }
  });
});
