import { AppShell, Button, Container, Group, Paper, Text, Title } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import React, { useEffect, useRef } from "react";
import { Link, Route, Routes } from "react-router";

import { useSession, useSwitchAccount } from "./api/authService";
import { AppHeader } from "./components/AppHeader";
import { BouncingLogos } from "./components/BouncingLogos";
import { buildAccountSwitchUrl, consumeAccountSwitchToast } from "./lib/accountSwitchToast";
import { useTranslations } from "./lib/i18n";
import { consumeNotificationSwitchRequest } from "./lib/notificationSwitch";
import { Navigation } from "./Navigation";
import Customise from "./pages/Customise";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Messages from "./pages/Messages";
import OAuthCallback from "./pages/OAuthCallback";
import PublicProfile from "./pages/PublicProfile";
import Settings from "./pages/Settings";

import * as styles from "./AppLayout.styles";

export function AppLayout() {
  const [navOpen, setNavOpen] = React.useState(false);

  const navbarRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const { mutate: switchAccount } = useSwitchAccount();
  const t = useTranslations();

  useEffect(() => {
    const notifyRequest = consumeNotificationSwitchRequest();
    if (notifyRequest) {
      switchAccount(
        { did: notifyRequest.did },
        {
          onSuccess: () => {
            window.location.href = notifyRequest.handle
              ? buildAccountSwitchUrl(notifyRequest.handle)
              : window.location.href;
          },
        }
      );
      return;
    }

    consumeAccountSwitchToast((handle) => {
      showNotification({ message: t.common.switchedToAccount(handle), color: "green" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        navOpen &&
        navbarRef.current &&
        !navbarRef.current.contains(event.target as Node) &&
        burgerRef.current &&
        !burgerRef.current.contains(event.target as Node)
      ) {
        setNavOpen(false);
      }
    };

    if (navOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [navOpen]);

  return (
    <>
      <BouncingLogos />
      <div className="app-shell-boundary">
        <AppShell
          header={{ height: 60 }}
          navbar={{
            width: 250,
            breakpoint: "sm",
            collapsed: { mobile: !navOpen, desktop: false },
          }}
          padding="md"
        >
          <AppShell.Header>
            <AppHeader
              opened={navOpen}
              onBurgerToggle={() => setNavOpen((o) => !o)}
              burgerRef={burgerRef as React.RefObject<HTMLButtonElement>}
              onNavClose={() => setNavOpen(false)}
            />
          </AppShell.Header>

          <AppShell.Navbar ref={navbarRef} p="md" style={{ overflow: "hidden" }}>
            <Navigation onLinkClick={() => setNavOpen(false)} />
          </AppShell.Navbar>

          <AppShell.Main pt={70}>
            <Container pt="md">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/customise" element={<Customise />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/profile" element={<PublicProfile />} />
                <Route path="/profile/:handle" element={<PublicProfile />} />
                <Route path="/oauth_callback" element={<OAuthCallback />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Container>
          </AppShell.Main>
        </AppShell>
      </div>
    </>
  );
}

function NotFoundPage() {
  const messages = useTranslations();
  const { data: session } = useSession();
  return (
    <Container>
      <Paper p={40} radius="xl" withBorder ta="center" style={styles.notFoundCard}>
        <Title order={1} fz={26} style={styles.notFoundTitle}>
          {messages.notFoundPage.title}
        </Title>
        <Text c="dimmed" mt={8} maw={300} mx="auto">
          {messages.notFoundPage.message}
        </Text>
        <Group justify="center" gap={8} mt={24}>
          <Button component={Link} to="/" variant="filled">
            {messages.notFoundPage.goHome}
          </Button>
          {session?.isLoggedIn && (
            <Button component={Link} to="/messages" variant="outline">
              {messages.notFoundPage.yourMessages}
            </Button>
          )}
        </Group>
      </Paper>
    </Container>
  );
}
