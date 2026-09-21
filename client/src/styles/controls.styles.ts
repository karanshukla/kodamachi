import { borderColor, selectedBg, selectedBorder } from "./tokens";

/** A picked option: the 1.5px ink border on tint. Unpicked is a hairline. */
export const selectedChrome = (selected: boolean) => ({
  background: selected ? selectedBg : "transparent",
  border: selected ? `1.5px solid ${selectedBorder}` : `1px solid ${borderColor}`,
});

/** A disclosure chevron: down when closed, up when open. */
export const disclosureChevron = (open: boolean) =>
  ({
    flex: "none",
    transition: "transform var(--ds-dur-base) var(--ds-ease)",
    transform: open ? "rotate(180deg)" : "rotate(0deg)",
  }) as const;
