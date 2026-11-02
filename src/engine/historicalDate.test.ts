import { describe, it, expect } from 'vitest';
import {
  parseHistoricalDate, formatHistoricalYear, historicalDateKey,
  formatDateRange, formatDateRangeLong, rangeContainsYear,
} from './historicalDate';

describe('parseHistoricalDate', () => {
  it('reads full, month-only and year-only dates', () => {
    expect(parseHistoricalDate('1888-02-16')).toEqual({ year: 1888, month: 2, day: 16 });
    expect(parseHistoricalDate('1691-05')).toEqual({ year: 1691, month: 5 });
    expect(parseHistoricalDate('1691')).toEqual({ year: 1691 });
    expect(parseHistoricalDate(' 800 ')).toEqual({ year: 800 });
  });

  it('reads negative (BC) years, with or without a month and day', () => {
    expect(parseHistoricalDate('-0500')).toEqual({ year: -500 });
    expect(parseHistoricalDate('-0044-03-15')).toEqual({ year: -44, month: 3, day: 15 });
    expect(parseHistoricalDate('-0000')).toEqual({ year: 0 });
  });

  it('gives null for missing or unreadable values', () => {
    for (const bad of [null, undefined, '', 'abc', '1888-13', '1888-02-40', '1888-00', 'c. 1900', '1888/02/16', '12345678']) {
      expect(parseHistoricalDate(bad)).toBeNull();
    }
  });
});

describe('formatHistoricalYear', () => {
  it('shows BC for year 0 and below', () => {
    expect(formatHistoricalYear(1707)).toBe('1707');
    expect(formatHistoricalYear(0)).toBe('1 BC');
    expect(formatHistoricalYear(-499)).toBe('500 BC');
  });
});

describe('historicalDateKey', () => {
  it('orders dates, including BC and partial ones', () => {
    const keys = ['-0500', '0001', '1691', '1691-05', '1691-05-20', '1692'].map(historicalDateKey) as number[];
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    expect(historicalDateKey('nope')).toBeNull();
  });
});

describe('formatDateRange', () => {
  it('shows years only', () => {
    expect(formatDateRange('1867-02-01', '1876-06-30')).toBe('1867–1876');
  });
  it('shows open ends', () => {
    expect(formatDateRange('1958', null)).toBe('1958–present');
    expect(formatDateRange(null, '1693')).toBe('?–1693');
    expect(formatDateRange(undefined, 'garbage')).toBe('');
  });
  it('collapses a range inside one year', () => {
    expect(formatDateRange('1888-02-16', '1888-10-01')).toBe('1888');
  });
  it('writes BC years', () => {
    expect(formatDateRange('-0499', '-0299')).toBe('500 BC–300 BC');
    expect(formatDateRange('-0499', '0014')).toBe('500 BC–14');
  });
  it('is empty when neither end is known', () => {
    expect(formatDateRange(null, null)).toBe('');
  });
});

describe('formatDateRangeLong', () => {
  it('shows the dates it has', () => {
    expect(formatDateRangeLong('1888-02-16', '1943-03')).toBe('16 Feb 1888 – Mar 1943');
    expect(formatDateRangeLong('1958', null)).toBe('1958 – present');
    expect(formatDateRangeLong(null, '1693-05-04')).toBe('? – 4 May 1693');
    expect(formatDateRangeLong('-0499', '-0299-01-02')).toBe('500 BC – 2 Jan 300 BC');
    expect(formatDateRangeLong(null, null)).toBe('');
  });
});

describe('rangeContainsYear', () => {
  it('includes the start year and excludes the end year', () => {
    expect(rangeContainsYear('1867', '1876', 1867)).toBe(true);
    expect(rangeContainsYear('1867', '1876', 1875)).toBe(true);
    expect(rangeContainsYear('1867', '1876', 1876)).toBe(false);
    expect(rangeContainsYear('1867', '1876', 1866)).toBe(false);
  });
  it('treats open ends as unbounded', () => {
    expect(rangeContainsYear('1958', null, 2100)).toBe(true);
    expect(rangeContainsYear('1958', null, 1957)).toBe(false);
    expect(rangeContainsYear(null, '1693', -3000)).toBe(true);
    expect(rangeContainsYear(null, '1693', 1693)).toBe(false);
    expect(rangeContainsYear(null, null, 5)).toBe(true);
  });
  it('counts a period inside one year for that year', () => {
    expect(rangeContainsYear('1888-02-16', '1888-10-01', 1888)).toBe(true);
    expect(rangeContainsYear('1888-02-16', '1888-10-01', 1889)).toBe(false);
  });
  it('works for BC', () => {
    expect(rangeContainsYear('-0499', '-0299', -400)).toBe(true);
    expect(rangeContainsYear('-0499', '-0299', 100)).toBe(false);
  });
});
