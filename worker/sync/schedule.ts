export interface EasternSlot {
  localDate: string;
  slot: number;
}

export function getEasternSlot(date: Date): EasternSlot {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  return {
    localDate: `${value("year")}-${value("month")}-${value("day")}`,
    slot: hour * 4 + Math.floor(minute / 15),
  };
}

export function randomDailySlot(): number {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return Math.floor(((random[0] ?? 0) / 0x1_0000_0000) * 96);
}
