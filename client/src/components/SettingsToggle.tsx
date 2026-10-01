import { Loader, Switch } from "@mantine/core";

interface SettingsToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  saving?: boolean;
}

const SPINNER = <Loader size={12} color="var(--mantine-color-body)" />;

export function SettingsToggle({
  label,
  checked,
  onChange,
  disabled,
  saving,
}: SettingsToggleProps) {
  return (
    <Switch
      aria-label={label}
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      disabled={disabled || saving}
      thumbIcon={saving ? SPINNER : undefined}
      size="md"
    />
  );
}
