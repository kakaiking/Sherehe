import { useMemo, useState, type ReactElement } from "react";
import { nairobiDateStr } from "../../datetime";
import { EVENT_STARTS_AT } from "../../eventFacts";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;

type Cell = {
  key: string;
  dateStr: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
};

function monthParts(view: Date): { year: number; month: number } {
  return { year: view.getFullYear(), month: view.getMonth() };
}

function ymKey(year: number, month: number): number {
  return year * 12 + month;
}

/** Today through event night (Nairobi). Yesterday and earlier, and days after 28 Nov, are out. */
export function isFlashDateSelectable(
  dateStr: string,
  today: string,
  maxDate: string,
): boolean {
  return dateStr >= today && dateStr <= maxDate;
}

function buildCells(
  year: number,
  month: number,
  selected: Set<string>,
  today: string,
  maxDate: string,
): Cell[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // Sunday = 0
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const y = cellDate.getFullYear();
    const m = cellDate.getMonth();
    const d = cellDate.getDate();
    const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const selectable = isFlashDateSelectable(dateStr, today, maxDate);
    cells.push({
      key: dateStr,
      dateStr,
      day: d,
      inMonth: m === month,
      isToday: dateStr === today,
      isSelected: selected.has(dateStr),
      isDisabled: !selectable,
    });
  }
  return cells;
}

/**
 * Multi-select month grid. Click toggles a day — no day-detail panel.
 * Selected days are flash-sale dates (00:00–23:59 Nairobi).
 * Only today through the event night (28 Nov 2026) can be newly selected.
 */
export function FlashDateCalendar({
  selectedDates,
  onChange,
}: {
  selectedDates: string[];
  onChange: (next: string[]) => void;
}): ReactElement {
  const today = nairobiDateStr();
  const maxDate = nairobiDateStr(new Date(EVENT_STARTS_AT));
  const [view, setView] = useState(() => {
    const seed = selectedDates[0] ?? today;
    const [y, m] = seed.split("-").map(Number);
    return new Date(y ?? 2026, (m ?? 1) - 1, 1);
  });
  const selected = useMemo(() => new Set(selectedDates), [selectedDates]);
  const { year, month } = monthParts(view);
  const cells = useMemo(
    () => buildCells(year, month, selected, today, maxDate),
    [year, month, selected, today, maxDate],
  );

  const [minY, minM] = today.split("-").map(Number);
  const [maxY, maxM] = maxDate.split("-").map(Number);
  const minYm = ymKey(minY ?? 2026, (minM ?? 1) - 1);
  const maxYm = ymKey(maxY ?? 2026, (maxM ?? 1) - 1);
  const viewYm = ymKey(year, month);
  const canPrev = viewYm > minYm;
  const canNext = viewYm < maxYm;

  function changeMonth(delta: number): void {
    const next = new Date(year, month + delta, 1);
    const nextYm = ymKey(next.getFullYear(), next.getMonth());
    if (nextYm < minYm || nextYm > maxYm) return;
    setView(next);
  }

  function toggle(dateStr: string): void {
    const next = new Set(selected);
    if (next.has(dateStr)) {
      next.delete(dateStr);
      onChange([...next].sort());
      return;
    }
    if (!isFlashDateSelectable(dateStr, today, maxDate)) return;
    next.add(dateStr);
    onChange([...next].sort());
  }

  return (
    <div className="flash-cal">
      <div className="flash-cal-nav">
        <button
          type="button"
          className="flash-cal-nav-btn"
          aria-label="Previous month"
          disabled={!canPrev}
          onClick={() => changeMonth(-1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="flash-cal-month"
          onClick={() => {
            const [y, m] = today.split("-").map(Number);
            setView(new Date(y ?? 2026, (m ?? 1) - 1, 1));
          }}
        >
          {MONTH_NAMES[month]} {year}
        </button>
        <button
          type="button"
          className="flash-cal-nav-btn"
          aria-label="Next month"
          disabled={!canNext}
          onClick={() => changeMonth(1)}
        >
          ›
        </button>
      </div>
      <div className="flash-cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="flash-cal-grid" role="grid" aria-label="Flash sale days">
        {cells.map((cell) => {
          const locked = cell.isDisabled && !cell.isSelected;
          return (
            <button
              key={cell.key}
              type="button"
              role="gridcell"
              aria-pressed={cell.isSelected}
              aria-label={`${cell.dateStr}${cell.isSelected ? ", selected" : ""}${cell.isDisabled ? ", unavailable" : ""}`}
              disabled={locked}
              className={[
                "flash-cal-day",
                cell.inMonth ? "" : "is-outside",
                cell.isToday ? "is-today" : "",
                cell.isSelected ? "is-selected" : "",
                cell.isDisabled ? "is-disabled" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => toggle(cell.dateStr)}
            >
              <span className="flash-cal-day-num">{cell.day}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
