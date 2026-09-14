import {
  Button,
  CopyButton,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Center,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconBrandGithub, IconButterfly, IconClipboard, IconShare } from "@tabler/icons-react";
import React from "react";
import { Link } from "react-router";

import { useSession } from "../api/authService";
import { useSyncMessages } from "../api/messageService";
import { ShortcutList, type Shortcut } from "../components/ShortcutList";
import { APP_DOMAIN, APP_NAME } from "../lib/brand";
import { useTranslations } from "../lib/i18n";
import type { Messages } from "../lib/i18n/types";
import { onFillButton, onFillOutlineButton } from "../styles/tokens";

import * as styles from "./Home.styles";

const shortlinkurl = import.meta.env.VITE_SHORTLINK_URL || "localhost:5173/profile";

function signedOutShortcuts(messages: Messages): Shortcut[] {
  return [
    { label: messages.common.shortcuts.home, hint: "Alt+H" /* i18n-allow */ },
    { label: messages.common.shortcuts.login, hint: "Alt+L" /* i18n-allow */ },
  ];
}

function signedInShortcuts(messages: Messages): Shortcut[] {
  return [
    { label: messages.common.shortcuts.home, hint: "Alt+H" /* i18n-allow */ },
    { label: messages.common.shortcuts.messages, hint: "Alt+M" /* i18n-allow */ },
    { label: messages.common.shortcuts.settings, hint: "Alt+S" /* i18n-allow */ },
    { label: messages.common.shortcuts.focusCycleCards, hint: "Alt+R" /* i18n-allow */ },
    { label: messages.common.shortcuts.navigateCards, hint: "↑ / ↓" /* i18n-allow */ },
  ];
}

function sellingPoints(messages: Messages) {
  return [
    messages.home.sellingPoints.fastAndFree,
    messages.home.sellingPoints.spamProtection,
    messages.home.sellingPoints.openSource,
  ];
}

export default function Home() {
  const messages = useTranslations();
  const { data: sessionData, isLoading } = useSession();
  const syncMessagesMutation = useSyncMessages();
  const isLoggedIn = !!sessionData?.isLoggedIn;

  React.useEffect(() => {
    if (sessionData?.did) {
      syncMessagesMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionData?.did]);

  return (
    <>
      <Title order={1} mb={8} style={styles.title}>
        {messages.home.title}
      </Title>
      <Text mb="xl" fz={15} c="dimmed" style={styles.subtitle}>
        {messages.home.subtitle}
      </Text>

      {isLoading ? (
        <HeroSkeleton />
      ) : sessionData?.profile ? (
        <WelcomeBack profile={sessionData.profile} />
      ) : (
        <SignedOutHero />
      )}

      <SimpleGrid cols={{ base: 1, sm: 2 }} mt="md">
        <Paper p={22} radius="lg" withBorder style={styles.infoCard}>
          <ShortcutList
            title={messages.common.shortcuts.title}
            shortcuts={isLoggedIn ? signedInShortcuts(messages) : signedOutShortcuts(messages)}
          />
        </Paper>

        <Paper p={22} radius="lg" withBorder style={styles.infoCard}>
          <Title order={2} tt="uppercase" style={styles.infoHeading}>
            {messages.home.questionsFeedback}
          </Title>
          <Stack gap="sm">
            <ContactLink
              caption={messages.home.reachOutOnBluesky}
              href={`https://bsky.app/profile/${APP_DOMAIN}`}
              icon={<IconButterfly size={18} />}
            >
              @{APP_DOMAIN}
            </ContactLink>
            <ContactLink
              caption={messages.home.submitAnIssueOnGitHub}
              href="https://github.com/karanshukla/navyfragen-app"
              icon={<IconBrandGithub size={18} />}
            >
              {messages.home.githubContactLabel}
              {APP_NAME}
            </ContactLink>
            <Divider />
            <Text fz={12} c="dimmed" style={styles.disclaimer}>
              {messages.home.disclaimer}
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>
    </>
  );
}

function HeroSkeleton() {
  return (
    <Paper p="xl" radius="lg" withBorder style={styles.infoCard}>
      <Stack gap="lg">
        <Skeleton height={30} width="60%" />
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Center mt="md">
          <Skeleton height={42} width={180} radius="md" />
        </Center>
      </Stack>
    </Paper>
  );
}

interface SessionProfile {
  displayName?: string | null;
  handle?: string;
}

function WelcomeBack({ profile }: { profile: SessionProfile }) {
  const messages = useTranslations();
  const name = profile.displayName || profile.handle;
  const url = `https://${shortlinkurl}/${profile.handle}`;

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: messages.home.shareTitle(APP_NAME), url });
      } catch {
        // share sheet dismissed or unavailable
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
  };

  return (
    <Paper radius="lg" style={styles.hero}>
      <Text fw={600} fz={24} style={styles.greeting}>
        {messages.home.welcomeBackGreetingPrefix} {name}
      </Text>
      <Center mt={26}>
        <Group gap={10} align="center" wrap="wrap" justify="center">
          <Button
            component={Link}
            to="/messages"
            size="md"
            radius="md"
            variant="default"
            style={onFillButton}
          >
            {messages.home.viewYourMessages}
          </Button>
          <CopyButton value={url}>
            {({ copied, copy }) => (
              <Tooltip
                label={copied ? messages.common.copied : messages.home.copyProfileLink}
                withArrow
              >
                <Button
                  onClick={copy}
                  size="md"
                  radius="md"
                  variant="default"
                  style={onFillOutlineButton}
                  leftSection={<IconClipboard size={16} />}
                >
                  {copied ? messages.common.copied : messages.home.copyLinkButton}
                </Button>
              </Tooltip>
            )}
          </CopyButton>
          <Button
            size="md"
            radius="md"
            variant="default"
            style={onFillOutlineButton}
            leftSection={<IconShare size={16} />}
            onClick={share}
          >
            {messages.common.share}
          </Button>
        </Group>
      </Center>
    </Paper>
  );
}

function SignedOutHero() {
  const messages = useTranslations();
  return (
    <Paper p={32} radius="lg" withBorder style={styles.infoCard}>
      <Stack gap={22}>
        {sellingPoints(messages).map(({ title, body }) => (
          <div key={title} style={styles.sellingPoint}>
            <span style={styles.bullet} aria-hidden />
            <div>
              <Text fw={600} fz={16}>
                {title}
              </Text>
              <Text c="dimmed" fz={14} style={styles.sellingPointBody}>
                {body}
              </Text>
            </div>
          </div>
        ))}
      </Stack>
      <Center mt={32}>
        <Button component={Link} to="/login" size="md" radius="md" variant="filled">
          {messages.home.getStarted}
        </Button>
      </Center>
    </Paper>
  );
}

function ContactLink({
  caption,
  href,
  icon,
  children,
}: {
  caption: string;
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Text fz={13} c="dimmed" mb={3}>
        {caption}
      </Text>
      <a href={href} target="_blank" rel="noopener noreferrer" style={styles.contactLink}>
        {icon} {children}
      </a>
    </div>
  );
}
