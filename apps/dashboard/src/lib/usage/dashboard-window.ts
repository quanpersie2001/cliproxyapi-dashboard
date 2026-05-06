export function getUtcDayRange(days: number): {
  fromDate: Date;
  toDate: Date;
  fromParam: string;
  toParam: string;
} {
  const now = new Date();
  const toDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23,
    59,
    59,
    999
  ));
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  fromDate.setUTCHours(0, 0, 0, 0);

  return {
    fromDate,
    toParam: toDate.toISOString().slice(0, 10),
    toDate,
    fromParam: fromDate.toISOString().slice(0, 10),
  };
}
