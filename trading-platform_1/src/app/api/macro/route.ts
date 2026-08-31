import { NextResponse } from "next/server";

// Pulls key macro indicators from FRED (Federal Reserve Economic Data) —
// free, official, no rate-limit issues for this volume of calls.
// Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html

const SERIES: { id: string; label: string; category: string; unit: string }[] = [
  { id: "CPIAUCSL", label: "CPI (headline)", category: "Inflation", unit: "index" },
  { id: "CPILFESL", label: "Core CPI", category: "Inflation", unit: "index" },
  { id: "UNRATE", label: "Unemployment rate", category: "Employment", unit: "%" },
  { id: "PAYEMS", label: "Nonfarm payrolls", category: "Employment", unit: "thousands" },
  { id: "A191RL1Q225SBEA", label: "Real GDP growth", category: "Growth", unit: "%" },
  { id: "INDPRO", label: "Industrial production", category: "Growth", unit: "index" },
  { id: "FEDFUNDS", label: "Fed funds rate", category: "Monetary Policy", unit: "%" },
  { id: "DGS10", label: "10-year Treasury yield", category: "Monetary Policy", unit: "%" },
  { id: "UMCSENT", label: "Consumer sentiment", category: "Other", unit: "index" },
  { id: "RSAFS", label: "Retail sales", category: "Other", unit: "$M" },
  { id: "HOUST", label: "Housing starts", category: "Other", unit: "thousands" },
  { id: "DGORDER", label: "Durable goods orders", category: "Other", unit: "$M" },
];

async function fetchSeries(seriesId: string, apiKey: string) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=12`;
  const res = await fetch(url, { next: { revalidate: 86400 } }); // cache 24h
  if (!res.ok) throw new Error(`FRED returned ${res.status} for ${seriesId}`);
  const data = await res.json();
  const obs = (data.observations ?? []).filter((o: { value: string }) => o.value !== ".");
  return obs.reverse(); // oldest -> newest for sparkline
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FRED_API_KEY is not set. Add it to your hosting environment." },
      { status: 500 }
    );
  }

  try {
    const results = await Promise.all(
      SERIES.map(async (s) => {
        const obs = await fetchSeries(s.id, apiKey);
        const values = obs.map((o: { value: string }) => parseFloat(o.value));
        const latest = values[values.length - 1] ?? null;
        const previous = values[values.length - 2] ?? null;
        const pctChange =
          latest !== null && previous !== null && previous !== 0
            ? ((latest - previous) / Math.abs(previous)) * 100
            : null;
        return {
          ...s,
          latest,
          previous,
          pctChange,
          sparkline: values,
          lastDate: obs[obs.length - 1]?.date ?? null,
        };
      })
    );
    return NextResponse.json({ indicators: results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to reach FRED" },
      { status: 502 }
    );
  }
}
