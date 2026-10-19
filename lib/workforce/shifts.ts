export type ShiftOption = {
  id: string;
  name: string;
};

export function getWeekdayShiftOptions(shifts: ShiftOption[]) {
  return [...shifts];
}
