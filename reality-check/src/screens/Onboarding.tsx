import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock } from "lucide-react";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { cn } from "../lib/utils";

const PRESETS = [10, 15, 20, 30];

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [intervalMin, setIntervalMin] = useState(15);
  const [align, setAlign] = useState(true);
  const [autostart, setAutostart] = useState(true);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      await api.setInterval(intervalMin);
      await api.updateSetting("align_to_clock", align ? "1" : "0");
      await api.setAutostart(autostart);
      await api.updateSetting("onboarded", "1");
    } catch (e) {
      console.error("onboarding save failed", e);
    }
    onDone();
  };

  return (
    <div className="grid h-full w-full place-items-center bg-bg p-8 text-fg">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {step === 0 && <Welcome onNext={() => setStep(1)} />}
            {step === 1 && (
              <Rhythm
                intervalMin={intervalMin}
                setIntervalMin={setIntervalMin}
                align={align}
                setAlign={setAlign}
                onBack={() => setStep(0)}
                onNext={() => setStep(2)}
              />
            )}
            {step === 2 && (
              <Launch
                autostart={autostart}
                setAutostart={setAutostart}
                onBack={() => setStep(1)}
                onFinish={finish}
                saving={saving}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-accent" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-6 grid size-16 place-items-center rounded-3xl bg-accent shadow-float">
        <span className="size-6 rounded-full bg-accent-fg" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome to Hima</h1>
      <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-muted">
        Every little while, Hima quietly asks what you just did. In a week you'll see where
        your time actually goes — and it's rarely what you'd guess.
      </p>
      <div className="mx-auto mt-6 flex max-w-sm items-start gap-2.5 rounded-xl bg-surface-2/60 px-4 py-3 text-left text-[13px] text-muted">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <p>Everything stays on this device, encrypted. No account, no network, no analytics.</p>
      </div>
      <Button variant="primary" size="lg" className="mt-8 w-full" onClick={onNext}>
        Get started
      </Button>
    </div>
  );
}

function Rhythm({
  intervalMin,
  setIntervalMin,
  align,
  setAlign,
  onBack,
  onNext,
}: {
  intervalMin: number;
  setIntervalMin: (n: number) => void;
  align: boolean;
  setAlign: (b: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Find your rhythm</h1>
      <p className="mt-2 text-[15px] text-muted">How often should Hima check in?</p>

      <div className="mt-6 flex gap-2">
        {PRESETS.map((p) => (
          <Chip key={p} active={intervalMin === p} onClick={() => setIntervalMin(p)}>
            {p} min
          </Chip>
        ))}
      </div>

      <button
        onClick={() => setAlign(!align)}
        className="mt-6 flex w-full items-center justify-between rounded-xl bg-surface-2/60 px-4 py-3 text-left"
      >
        <span>
          <span className="text-[15px] font-medium">Snap to the quarter hour</span>
          <span className="mt-0.5 block text-[13px] text-muted">Prompt at :00, :15, :30, :45.</span>
        </span>
        <Switch checked={align} />
      </button>

      <div className="mt-8 flex gap-3">
        <Button className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" className="flex-1" onClick={onNext}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function Launch({
  autostart,
  setAutostart,
  onBack,
  onFinish,
  saving,
}: {
  autostart: boolean;
  setAutostart: (b: boolean) => void;
  onBack: () => void;
  onFinish: () => void;
  saving: boolean;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Always quietly on</h1>
      <p className="mt-2 text-[15px] text-muted">
        Hima lives in your menu bar and tracks all day. Closing the window just tucks it away.
      </p>

      <button
        onClick={() => setAutostart(!autostart)}
        className="mt-6 flex w-full items-center justify-between rounded-xl bg-surface-2/60 px-4 py-3 text-left"
      >
        <span>
          <span className="text-[15px] font-medium">Launch at login</span>
          <span className="mt-0.5 block text-[13px] text-muted">Start tracking automatically.</span>
        </span>
        <Switch checked={autostart} />
      </button>

      <div className="mt-8 flex gap-3">
        <Button className="flex-1" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button variant="primary" className="flex-1" onClick={onFinish} disabled={saving}>
          {saving ? "Starting…" : "Start tracking"}
        </Button>
      </div>
    </div>
  );
}

function Switch({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-accent" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </span>
  );
}
