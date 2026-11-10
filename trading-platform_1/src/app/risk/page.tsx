"use client";
import { useState, useMemo, useEffect } from "react";
import { WATCHLIST } from "@/lib/types";

// How each instrument's position size is expressed. Forex pairs convert
// raw units into standard lots (100,000 units = 1 lot); everything else is
// shown in its natural unit. These are simplifications for planning purposes
// — always confirm exact contract specs (tick value, lot size) with your
// broker before sizing a real position.
const INSTRUMENT_META: Record<string, { unit: string; isForex: boolean }> = {
  "EUR/USD": { unit: "units", isForex: true },
  "GBP/USD": { unit: "units", isForex: true },
  DXY: { unit: "contracts", isForex: false },
  GOLD: { unit: "oz", isForex: false },
  USOIL: { unit: "barrels", isForex: false },
  NASDAQ: { unit: "contracts", isForex: false },
  "S&P 500": { unit: "contracts", isForex: false },
  US30: { unit: "contracts", isForex: false },
  BTC: { unit: "BTC", isForex: false },
};

// What 1 standard lot means at most brokers (units of the instrument per 1.00 lot).
// It differs between brokers, so it can be edited on the page.
const DEFAULT_LOT_UNITS: Record<string, number> = {
  "EUR/USD": 100000, // currency units
  "GBP/USD": 100000,
  DXY: 1,
  GOLD: 100, // ounces
  USOIL: 1000, // barrels
  NASDAQ: 1, // index CFD: $1 per point per lot at many brokers
  "S&P 500": 1,
  US30: 1,
  BTC: 1,
};

export default function RiskCalculator() {
  const [instrument, setInstrument] = useState(WATCHLIST[0]);
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(0);
  const [stop, setStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [manualLots, setManualLots] = useState<number | null>(null); // null = the box shows the auto-calculated size
  const [lotUnits, setLotUnits] = useState(DEFAULT_LOT_UNITS[WATCHLIST[0]] ?? 1);
  const [winRate, setWinRate] = useState(45);
  const [rMultiple, setRMultiple] = useState(2);

  const meta = INSTRUMENT_META[instrument] ?? { unit: "units", isForex: false };

  // Switching instrument loads that instrument's usual lot size and clears the typed size.
  useEffect(() => {
    setLotUnits(DEFAULT_LOT_UNITS[instrument] ?? 1);
    setManualLots(null);
    // Prices from the previous instrument would be wrong for this one, so start clean.
    setEntry(0);
    setStop(0);
    setTarget(0);
  }, [instrument]);

  const dollarRisk = (balance * riskPct) / 100;
  const stopDistance = Math.abs(entry - stop);
  const positionSizeUnits = stopDistance > 0 ? dollarRisk / stopDistance : 0;
  // An empty or 0 lot size falls back to the usual one for this instrument.
  const defaultLot = DEFAULT_LOT_UNITS[instrument] ?? 1;
  const lotSize = lotUnits > 0 ? lotUnits : defaultLot;
  const positionSizeLots = positionSizeUnits / lotSize;
  const rewardDistance = Math.abs(target - entry);
  const rr = stopDistance > 0 ? rewardDistance / stopDistance : 0;

  // Suggested size in standard lots: the biggest size (rounded DOWN to 0.01 lot) that keeps the loss at your risk %.
  const suggestedLots = stopDistance > 0 ? Math.floor(positionSizeLots * 100 + 1e-9) / 100 : 0;
  const minLotRisk = 0.01 * lotSize * stopDistance; // what the smallest size (0.01 lot) would risk

  // Changing balance, risk %, entry, stop or lot size recalculates the box automatically.
  useEffect(() => {
    setManualLots(null);
  }, [balance, riskPct, entry, stop, lotUnits]);

  // The box shows the calculated size, unless you typed your own.
  const usingMine = manualLots !== null;
  const lotsUsed = manualLots ?? suggestedLots;
  const usedUnits = lotsUsed * lotSize;
  const lossIfStopped = usedUnits * stopDistance;
  const profitAtTarget = usedUnits * rewardDistance;
  const lossPctOfAccount = balance > 0 ? (lossIfStopped / balance) * 100 : 0;
  const overRisk = usingMine && lossPctOfAccount > riskPct + 1e-9;

  // Simple risk-of-ruin style simulation: expected value per trade and
  // probability of a 5-loss streak given the win rate.
  const expectancy = useMemo(() => {
    const winP = winRate / 100;
    return winP * rMultiple - (1 - winP) * 1;
  }, [winRate, rMultiple]);

  const fiveLossStreakProb = useMemo(() => {
    const lossP = 1 - winRate / 100;
    return Math.pow(lossP, 5) * 100;
  }, [winRate]);

  const drawdownAfterFiveLosses = dollarRisk * 5;

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-medium">Risk calculator</h1>

      <section className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-neutral-400">Instrument</span>
          <select
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
          >
            {WATCHLIST.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        <Field label="Account balance ($)" value={balance} onChange={setBalance} />
        <Field label="Risk per trade (%)" value={riskPct} onChange={setRiskPct} step={0.1} />
        <Field label="Entry price" value={entry} onChange={setEntry} step={0.0001} />
        <Field label="Stop loss price" value={stop} onChange={setStop} step={0.0001} />
        <Field label="Target price" value={target} onChange={setTarget} step={0.0001} />
        <Field
          label="Position size (standard lots)"
          value={lotsUsed}
          onChange={setManualLots}
          step={0.01}
          hint={
            stopDistance === 0 ? (
              "Enter your entry and stop loss price and the size fills in automatically."
            ) : suggestedLots === 0 && !usingMine ? (
              <span className="text-amber-300">
                With these prices, even the smallest size (0.01 lot) would lose ${minLotRisk.toFixed(2)} if stopped, more than the ${dollarRisk.toFixed(2)} you want to risk. Check the entry and stop prices belong to {instrument}, or widen your risk %, or tighten the stop.
              </span>
            ) : usingMine ? (
              <span>
                You typed your own size.
                <button
                  type="button"
                  onClick={() => setManualLots(null)}
                  className="ml-2 rounded-full border border-white/20 px-2 py-0.5 text-xs text-neutral-200 hover:bg-white/10"
                >
                  Back to auto ({suggestedLots} lots)
                </button>
              </span>
            ) : (
              `Calculated for you from your ${riskPct}% risk ($${dollarRisk.toFixed(2)}). Type a number to use your own.`
            )
          }
        />
        <Field
          label={`1 standard lot equals (${meta.unit})`}
          value={lotUnits}
          placeholder={String(defaultLot)}
          onChange={setLotUnits}
          step={1}
          hint="Typical for most brokers. It differs between brokers, so check your broker's contract spec and change it here if needed."
        />
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="text-sm font-medium">
          If you take this position{" "}
          <span className="font-normal text-neutral-500">
            ({usingMine ? "using the size you typed" : "using the size calculated from your risk %"})
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="Loss if stopped out"
            value={stopDistance > 0 && usedUnits > 0 ? `-$${lossIfStopped.toFixed(2)} (${lossPctOfAccount.toFixed(2)}% of account)` : "—"}
            warn={overRisk}
          />
          <Stat
            label="Balance after a loss"
            value={stopDistance > 0 && usedUnits > 0 ? `$${(balance - lossIfStopped).toFixed(2)}` : "—"}
          />
          <Stat
            label="Profit if target hit"
            value={rewardDistance > 0 && usedUnits > 0 ? `+$${profitAtTarget.toFixed(2)}` : "—"}
          />
          <Stat
            label="Balance after a win"
            value={rewardDistance > 0 && usedUnits > 0 ? `$${(balance + profitAtTarget).toFixed(2)}` : "—"}
          />
        </div>
        {overRisk && (
          <p className="text-sm text-red-400">
            This size risks {lossPctOfAccount.toFixed(2)}% of your account, above your {riskPct}% limit.
          </p>
        )}
        {stopDistance === 0 && (
          <p className="text-xs text-neutral-500">Enter your entry and stop loss price to see the amounts.</p>
        )}
      </section>

      <section className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-2">
        <Stat label="Dollar risk" value={`$${dollarRisk.toFixed(2)}`} />
        <Stat
          label="Position size (standard lots)"
          value={stopDistance > 0 ? positionSizeLots.toFixed(3) : "—"}
        />
        <Stat
          label={`Position size (${meta.unit})`}
          value={stopDistance > 0 ? positionSizeUnits.toFixed(4) : "—"}
        />
        <Stat label="Reward:Risk" value={stopDistance > 0 ? `${rr.toFixed(2)}R` : "—"} />
        <Stat label="Max loss if stopped" value={`$${dollarRisk.toFixed(2)}`} />
      </section>

      <p className="text-xs text-neutral-600">
        Position sizing here uses a simplified units-per-dollar-of-risk
        formula. Contract multipliers vary by broker for indices, oil, and
        DXY — confirm your broker's exact contract spec before sizing a real
        position.
      </p>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Drawdown / risk-of-ruin simulator</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assumed win rate (%)" value={winRate} onChange={setWinRate} />
          <Field label="Average winner (R multiple)" value={rMultiple} onChange={setRMultiple} step={0.1} />
        </div>
        <div className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-3">
          <Stat
            label="Expectancy per trade"
            value={`${expectancy.toFixed(2)}R`}
            warn={expectancy < 0}
          />
          <Stat
            label="Chance of 5 losses in a row"
            value={`${fiveLossStreakProb.toFixed(1)}%`}
          />
          <Stat
            label="Drawdown after 5 straight losses"
            value={`$${drawdownAfterFiveLosses.toFixed(2)} (${(
              (drawdownAfterFiveLosses / balance) *
              100
            ).toFixed(1)}% of account)`}
          />
        </div>
        {expectancy < 0 && (
          <p className="text-sm text-red-400">
            Negative expectancy at this win rate / R multiple — this combination loses
            money over a large sample size regardless of position sizing.
          </p>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  step = 1,
  placeholder = "0",
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  placeholder?: string;
  hint?: React.ReactNode;
}) {
  // Keep what you type as text so there is never a stuck "0" in front, and "0.5" or "1." can be typed freely.
  const [text, setText] = useState(value === 0 ? "" : String(value));
  useEffect(() => {
    if ((parseFloat(text) || 0) !== value) setText(value === 0 ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={text}
        placeholder={placeholder}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseFloat(e.target.value) || 0);
        }}
        className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-lg font-medium ${warn ? "text-red-400" : ""}`}>{value}</div>
    </div>
  );
}
