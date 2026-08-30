import { NextResponse } from "next/server";

// Pulls the economic calendar from Financial Modeling Prep's free-tier endpoint.
// Get a free API key at https://site.financialmodelingprep.com/developer/docs
export async function GET() {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "FMP_API_KEY is not set. Add it to your .env.local / hosting env vars." },
      { status: 500 }
    );
  }

  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { next: { revalidate: 900 } }); // cache 15 min
    if (!res.ok) {
      return NextResponse.json(
        { error: `Data provider returned ${res.status}` },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json({ events: data });
  } catch {
    return NextResponse.json({ error: "Failed to reach data provider" }, { status: 502 });
  }
}
