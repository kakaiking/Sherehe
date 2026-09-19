import type { ReactElement, ReactNode } from "react";
import { HistoryBackButton } from "./HistoryBackButton";

export type FlowStep = {
  id: string;
  title: string;
};

export function StepForm({
  steps,
  step,
  onBack,
  children,
  footer,
  meta,
}: {
  steps: readonly FlowStep[];
  step: number;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  meta?: ReactNode;
}): ReactElement {
  const current = steps[step];
  const title = current?.title ?? "";
  const flowBack = onBack && step > 0 ? onBack : undefined;

  return (
    <div className="step-form">
      <header className="page-head step-head">
        <div className="step-progress-row">
          <HistoryBackButton {...(flowBack ? { onClick: flowBack } : {})} />
          <div
            className="step-progress"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label={`Progress, step ${step + 1} of ${steps.length}`}
          >
            {steps.map((s, i) => (
              <span
                key={s.id}
                className="step-progress-seg"
                data-filled={i <= step ? "true" : "false"}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
        <h1 id="step-title">{title}</h1>
        {meta}
      </header>
      <div className="step-body">{children}</div>
      {footer ? <div className="step-footer">{footer}</div> : null}
    </div>
  );
}

export function ChoiceList({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <ul className="choice-list">{children}</ul>;
}
