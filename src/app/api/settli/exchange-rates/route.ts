import { NextRequest, NextResponse } from 'next/server';

interface ExchangeRateAPIResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc: string;
}

let cachedRates: { rates: Record<string, number>; fetchedAt: number } | null = null;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

// GET /api/settli/exchange-rates?base=USD
export async function GET(request: NextRequest) {
  const base = request.nextUrl.searchParams.get('base') || 'USD';

  try {
    if (cachedRates && Date.now() - cachedRates.fetchedAt < CACHE_DURATION_MS) {
      const converted = convertToBase(cachedRates.rates, base);
      return NextResponse.json({ base, rates: converted });
    }

    const res = await fetch(
      `https://open.er-api.com/v6/latest/USD`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      throw new Error(`Exchange rate API returned ${res.status}`);
    }

    const data: ExchangeRateAPIResponse = await res.json();

    if (data.result !== 'success') {
      throw new Error('Exchange rate API returned non-success result');
    }

    cachedRates = { rates: data.rates, fetchedAt: Date.now() };

    const converted = convertToBase(data.rates, base);
    return NextResponse.json({ base, rates: converted });
  } catch (error) {
    console.error('Error fetching exchange rates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange rates' },
      { status: 500 }
    );
  }
}

/**
 * Convert USD-based rates to rates relative to a different base currency.
 * E.g., if USD rates: JPY=150, EUR=0.92
 * For base=JPY: USD=1/150, EUR=0.92/150
 */
function convertToBase(
  usdRates: Record<string, number>,
  base: string
): Record<string, number> {
  if (base === 'USD') return usdRates;

  const baseInUsd = usdRates[base];
  if (!baseInUsd) return usdRates;

  const converted: Record<string, number> = {};
  for (const [currency, rate] of Object.entries(usdRates)) {
    converted[currency] = rate / baseInUsd;
  }
  return converted;
}
