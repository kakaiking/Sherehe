import { useId, type ReactElement } from "react";

function clampQty(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export function QuantityField({
  value,
  onChange,
  min = 1,
  max = 20,
  label = "Quantity",
}: {
  value: number;
  onChange: (qty: number) => void;
  min?: number;
  max?: number;
  label?: string;
}): ReactElement {
  const id = useId();
  const qty = clampQty(value, min, max);

  function set(next: number): void {
    onChange(clampQty(next, min, max));
  }

  return (
    <div className="qty-block">
      <label htmlFor={id}>{label}</label>
      <div className="qty-stepper">
        <button
          type="button"
          className="qty-bump qty-less"
          aria-label="Remove one"
          disabled={qty <= min}
          onClick={() => set(qty - 1)}
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="done"
          pattern="[0-9]*"
          value={String(qty)}
          onChange={(ev) => {
            const digits = ev.target.value.replace(/\D/g, "");
            if (digits === "") return;
            set(Number(digits));
          }}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowUp") {
              ev.preventDefault();
              set(qty + 1);
            } else if (ev.key === "ArrowDown") {
              ev.preventDefault();
              set(qty - 1);
            } else if (ev.key === "Home") {
              ev.preventDefault();
              set(min);
            } else if (ev.key === "End") {
              ev.preventDefault();
              set(max);
            }
          }}
        />
        <button
          type="button"
          className="qty-bump qty-more"
          aria-label="Add one"
          disabled={qty >= max}
          onClick={() => set(qty + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
