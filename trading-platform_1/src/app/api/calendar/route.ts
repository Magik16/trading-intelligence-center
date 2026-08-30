import { NextResponse } from "next/server";

// Pulls the economic calendar from ForexFactory's public weekly export.
// Free, no API key required. Rate-limited to 2 requests / 5 min per IP by
// the provider, which our 15-minute cache comfortably respects.
export async function GET() {
  const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

  try {
    const res = await fetch(url, {
      next: { revalidate: 900 }, // cache 15 min
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Data provider returned ${res.status}` },
        { status: 502 }
      );
    }
    const text = await res.text();
    // The feed occasionally returns an HTML "request denied" page instead of
    // JSON if the shared rate limit is hit — detect that rather than crash.
    if (text.trim().startsWith("<")) {
      return NextResponse.json(
        { error: "Calendar provider rate-limited this request — try again shortly" },
        { status: 429 }
      );
    }
    const data = JSON.parse(text);
    return NextResponse.json({ events: data });
  } catch {
    return NextResponse.json({ error: "Failed to reach data provider" }, { status: 502 });
  }
}
