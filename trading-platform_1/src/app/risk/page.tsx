"use client";
import { useState, useMemo } from "react";

export default function RiskCalculator() {
  const [balance, setBalance] = useState(10000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(0);
  const [stop, setStop] = useState(0);
  const [target, setTarget] = useState(0);
  const [winRate, setWinRate] = useState(45);
  const [rMultiple, setRMultiple] = useState(2);

  const dollarRisk = (balance * riskPct) / 100;
  const stopDistance = Math.abs(entry - stop);
  const positionSize = stopDistance > 0 ? dollarRisk / stopDistance : 0;
  const rewardDistance = Math.abs(target - entry);
  const rr = stopDistance > 0 ? rewardDistance / stopDistance : 0;

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
        <Field label="Account balance ($)" value={balance} onChange={setBalance} />
        <Field label="Risk per trade (%)" value={riskPct} onChange={setRiskPct} step={0.1} />
        <Field label="Entry price" value={entry} onChange={setEntry} step={0.0001} />
        <Field label="Stop loss price" value={stop} onChange={setStop} step={0.0001} />
        <Field label="Target price" value={target} onChange={setTarget} step={0.0001} />
      </section>

      <section className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-2">
        <Stat label="Dollar risk" value={`$${dollarRisk.toFixed(2)}`} />
        <Stat
          label="Position size (units)"
          value={stopDistance > 0 ? positionSize.toFixed(4) : "—"}
        />
        <Stat label="Reward:Risk" value={stopDistance > 0 ? `${rr.toFixed(2)}R` : "—"} />
        <Stat label="Max loss if stopped" value={`$${dollarRisk.toFixed(2)}`} />
      </section>

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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-neutral-400">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100"
      />
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
