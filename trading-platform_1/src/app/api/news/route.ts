import { NextResponse } from "next/server";
import { requireUser } from "@/lib/anthropic";
import { getNews } from "@/lib/news";

export const maxDuration = 30;

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let instrument = "";
  try {
    instrument = String((await req.json()).instrument ?? "").slice(0, 20);
  } catch {
    /* fall through */
  }
  if (!instrument) return NextResponse.json({ error: "Missing instrument." }, { status: 400 });
  return NextResponse.json({ text: await getNews(instrument) });
}
