import { Group } from "@mantine/core";

import { useTranslations } from "../../lib/i18n";
import { imageThemeLabels } from "../../lib/themes";
import { SwatchButton } from "../SwatchButton";

import { ImageThemePreview } from "./ImageThemePreview";

interface ImageThemeSwatchesProps {
  selected: string;
  disabled: boolean;
  onSelect: (theme: string) => void;
}

/** The three image-export themes as picker swatches. */
export function ImageThemeSwatches({ selected, disabled, onSelect }: ImageThemeSwatchesProps) {
  const themes = imageThemeLabels(useTranslations());

  return (
    <Group grow gap="sm">
      {Object.entries(themes).map(([value, label]) => (
        <SwatchButton
          key={value}
          label={label}
          selected={selected === value}
          disabled={disabled}
          onClick={() => onSelect(value)}
        >
          <ImageThemePreview theme={value} />
        </SwatchButton>
      ))}
    </Group>
  );
}
