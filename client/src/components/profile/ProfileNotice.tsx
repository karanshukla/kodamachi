import { Alert, Container } from "@mantine/core";

import { Mascot } from "../Mascot";

interface ProfileNoticeProps {
  tone: "yellow" | "red";
  title: string;
  children: React.ReactNode;
}

/**
 * Terminal state for a profile that cannot be shown — bad handle, no Bluesky
 * account, no kodamachi inbox, load failure. One shape for all four, and an
 * `Alert` rather than a bare `Paper` so the title picks up the tone colours the
 * theme already tunes for contrast.
 */
export function ProfileNotice({ tone, title, children }: ProfileNoticeProps) {
  return (
    <Container>
      <Mascot mood={tone === "red" ? "error" : "neutral"} size={132} style={{ marginBottom: 16 }} />
      <Alert color={tone} title={title} withCloseButton={false}>
        {children}
      </Alert>
    </Container>
  );
}
