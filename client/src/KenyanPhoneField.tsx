import {
  useId,
  useLayoutEffect,
  useRef,
  type ReactElement,
} from "react";
import {
  caretIndexForDigitCount,
  extractKenyanNationalDigits,
  formatKenyanNational,
} from "./phone";

export function KenyanPhoneField({
  value,
  onChange,
  required = true,
  label = "Kenyan mobile",
  disabled = false,
}: {
  value: string;
  onChange: (national: string) => void;
  required?: boolean;
  label?: string;
  disabled?: boolean;
}): ReactElement {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const caretDigitsRef = useRef<number | null>(null);
  const formatted = formatKenyanNational(value);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const digits = caretDigitsRef.current;
    if (!el || digits === null) return;
    const idx = caretIndexForDigitCount(formatted, digits);
    el.setSelectionRange(idx, idx);
    caretDigitsRef.current = null;
  }, [formatted]);

  return (
    <div className="phone-block">
      <label htmlFor={id}>{label}</label>
      <span className="phone-field">
        <span className="phone-prefix" aria-hidden="true">
          +254
        </span>
        <input
          id={id}
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          enterKeyHint="done"
          required={required}
          disabled={disabled}
          pattern="[17][0-9]{2} [0-9]{3} [0-9]{3}"
          title="Nine digits after +254, starting with 1 or 7"
          placeholder="712 345 678"
          value={formatted}
          onChange={(ev) => {
            const caret = ev.target.selectionStart ?? ev.target.value.length;
            caretDigitsRef.current = ev.target.value
              .slice(0, caret)
              .replace(/\D/g, "").length;
            onChange(extractKenyanNationalDigits(ev.target.value));
          }}
        />
      </span>
    </div>
  );
}
