import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHolidays } from '../../src/lib/holidays/fetch';
import { generateFederalHolidays } from '../../src/lib/holidays/generator';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('fetchHolidays', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to generated holidays on a non-OK response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, false, 500));
    const result = await fetchHolidays(2025);
    expect(result).toEqual(generateFederalHolidays(2025));
    expect(result).toHaveLength(11);
  });

  it('falls back to generated holidays on network rejection / timeout', async () => {
    fetchMock.mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const result = await fetchHolidays(2025);
    expect(result).toEqual(generateFederalHolidays(2025));
    expect(result).toHaveLength(11);
  });

  it('falls back to generated holidays on an empty array', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const result = await fetchHolidays(2025);
    expect(result).toEqual(generateFederalHolidays(2025));
    expect(result).toHaveLength(11);
  });

  it('filters out non-global holidays', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        { date: '2025-07-04', global: true },
        { date: '2025-03-31', global: false },
      ]),
    );
    expect(await fetchHolidays(2025)).toEqual(['2025-07-04']);
  });

  it('observes a Sunday holiday on Monday', async () => {
    // 2023-01-01 is a Sunday
    fetchMock.mockResolvedValue(
      jsonResponse([{ date: '2023-01-01', global: true }]),
    );
    expect(await fetchHolidays(2023)).toEqual(['2023-01-02']);
  });

  it('requests with next.revalidate of 604800', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([{ date: '2025-07-04', global: true }]),
    );
    await fetchHolidays(2025);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/2025/US');
    expect(options.next.revalidate).toBe(604800);
  });
});
