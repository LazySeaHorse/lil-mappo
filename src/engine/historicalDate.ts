/**
 * Dates as OpenHistoricalMap writes them: "1691", "1691-05", "1888-02-16", and
 * negative years for BC ("-0500"). The number is the astronomical year, so year
 * 0 is 1 BC and -499 is 500 BC. A missing start means "unknown start"; a missing
 * end means the place still exists.
 */
export interface HistoricalDate {
  year: number;
  /** 1-12, only when the source gave it. */
  month?: number;
  /** 1-31, only when the source gave a month and a day. */
  day?: number;
}

const DATE_PATTERN = /^([+-])?(\d{1,6})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Reads an OHM date. Anything it does not understand (or an impossible month or day) gives null. */
export function parseHistoricalDate(raw: string | null | undefined): HistoricalDate | null {
  if (typeof raw !== 'string') return null;
  const match = DATE_PATTERN.exec(raw.trim());
  if (!match) return null;
  const [, sign, yearDigits, monthDigits, dayDigits] = match;
  const year = (sign === '-' ? -1 : 1) * Number(yearDigits);
  if (monthDigits === undefined) return { year: year || 0 };
  const month = Number(monthDigits);
  if (month < 1 || month > 12) return null;
  if (dayDigits === undefined) return { year: year || 0, month };
  const day = Number(dayDigits);
  if (day < 1 || day > 31) return null;
  return { year: year || 0, month, day };
}

/** "1888", or "500 BC" for year <= 0 (astronomical year 0 is 1 BC). */
export function formatHistoricalYear(year: number): string {
  return year <= 0 ? `${1 - year} BC` : String(year);
}

/** Sorting number for a date: later dates are larger, a missing month or day counts as the first. Null when unparseable. */
export function historicalDateKey(raw: string | null | undefined): number | null {
  const date = parseHistoricalDate(raw);
  if (!date) return null;
  return date.year * 372 + ((date.month ?? 1) - 1) * 31 + ((date.day ?? 1) - 1);
}

/** Compact range for badges: "1867–1876", "1958–present", "?–1693", "500 BC–300 BC". Empty when neither end is known. */
export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  const from = parseHistoricalDate(start);
  const to = parseHistoricalDate(end);
  if (!from && !to) return '';
  if (from && to && from.year === to.year) return formatHistoricalYear(from.year);
  return `${from ? formatHistoricalYear(from.year) : '?'}–${to ? formatHistoricalYear(to.year) : 'present'}`;
}

function formatLongDate(date: HistoricalDate): string {
  const year = formatHistoricalYear(date.year);
  if (date.month === undefined) return year;
  const month = MONTH_NAMES[date.month - 1];
  return date.day === undefined ? `${month} ${year}` : `${date.day} ${month} ${year}`;
}

/** Range with the full dates we have, for tooltips and the version picker: "16 Feb 1888 – 3 Mar 1943", "1958 – present". */
export function formatDateRangeLong(start: string | null | undefined, end: string | null | undefined): string {
  const from = parseHistoricalDate(start);
  const to = parseHistoricalDate(end);
  if (!from && !to) return '';
  return `${from ? formatLongDate(from) : '?'} – ${to ? formatLongDate(to) : 'present'}`;
}

/**
 * Whether a place existed in `year`. Works in whole years: the start year is
 * inside, the end year is outside (a period that ends in 1876 hands over to
 * the one that starts in 1876), except a period that starts and ends in the
 * same year, which counts for that year. A missing start or end is unbounded.
 * A range with neither end parsed contains every year.
 */
export function rangeContainsYear(start: string | null | undefined, end: string | null | undefined, year: number): boolean {
  const from = parseHistoricalDate(start);
  const to = parseHistoricalDate(end);
  if (from && year < from.year) return false;
  if (to) {
    if (from && from.year === to.year) return year === to.year;
    if (year >= to.year) return false;
  }
  return true;
}
