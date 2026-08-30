export type JournalEntry = {
  id?: string;
  instrument: string;
  direction: "long" | "short";
  entry: number | null;
  stop: number | null;
  target: number | null;
  exit: number | null;
  size: number | null;
  risk_pct: number | null;
  result_usd: number | null;
  result_r: number | null;
  setup_tag: string | null;
  session: string | null;
  fundamental_bias: string | null;
  reason_entry: string | null;
  followed_plan: boolean;
  news_nearby: boolean;
  traded_at: string;
};

export type TradingPlan = {
  id?: string;
  name: string;
  style: string;
  markets: string[];
  sessions: string[];
  timeframes: string;
  rules: Record<string, string>;
};

export const WATCHLIST = [
  "EUR/USD",
  "GBP/USD",
  "DXY",
  "GOLD",
  "USOIL",
  "NASDAQ",
  "S&P 500",
  "US30",
  "BTC",
];
