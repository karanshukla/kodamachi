import { useTranslations } from "../../lib/i18n";
import { DEFAULT_PROFILE_CARD_THEME, profileCardThemes } from "../../lib/themes";
import { BrandMark } from "../BrandMark";
import { SwatchButton } from "../SwatchButton";

import * as styles from "./ProfileThemeSwatches.styles";

const SWATCH_ASPECT = "4/3";
const PAPER_MARK = 20;

/**
 * Ask-card colour picker. Same swatch chrome as the image-theme picker; the
 * preview is a solid band rather than a card mockup, because the choice only
 * affects the card's fill. The paper preset shows the mark on it so a white
 * swatch on a white card is not read as "nothing".
 *
 * @see [ProfileThemeSwatches.test.tsx](../../tests/components/ProfileThemeSwatches.test.tsx)
 * — pins the band.
 */
export function ProfileThemeSwatches({ value, disabled, onPick }: ProfileThemeSwatchesProps) {
  const messages = useTranslations();
  return (
    <div style={styles.grid}>
      {Object.entries(profileCardThemes(messages)).map(([themeValue, theme]) => (
        <SwatchButton
          key={themeValue}
          label={theme.label}
          selected={(value ?? DEFAULT_PROFILE_CARD_THEME) === themeValue}
          disabled={disabled}
          onClick={() => onPick(themeValue)}
          previewAspect={SWATCH_ASPECT}
        >
          <div style={styles.fill(theme)}>
            {theme.paper && <BrandMark size={PAPER_MARK} aria-hidden />}
          </div>
        </SwatchButton>
      ))}
    </div>
  );
}

interface ProfileThemeSwatchesProps {
  value: string | null;
  disabled: boolean;
  onPick: (value: string) => void;
}
