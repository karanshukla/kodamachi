// Command indigo-fetch resolves a Bluesky handle to a DID and fetches the
// profile via indigo, printing the banner/avatar URLs.
//
// Usage:
//
//	indigo-fetch <handle>                 # uses the AppView (api.bsky.app), matching TS
//	indigo-fetch -host https://bsky.social <handle>   # override host (e.g. PDS)
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/bluesky-social/indigo/api/atproto"
	"github.com/bluesky-social/indigo/api/bsky"
	"github.com/bluesky-social/indigo/xrpc"
)

// appViewHost is the AppView the TS ProfileService also targets.
const appViewHost = "https://api.bsky.app"

func main() {
	host := flag.String("host", appViewHost, "xrpc host (AppView by default)")
	flag.Parse()

	if flag.NArg() < 1 {
		fmt.Fprintln(os.Stderr, "usage: indigo-fetch [-host URL] <handle>")
		os.Exit(2)
	}
	handle := flag.Arg(0)

	if err := run(handle, *host); err != nil {
		fmt.Fprintf(os.Stderr, "indigo-fetch: %v\n", err)
		os.Exit(1)
	}
}

func run(handle, host string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	client := &xrpc.Client{Host: host}

	resolved, err := atproto.IdentityResolveHandle(ctx, client, handle)
	if err != nil {
		return fmt.Errorf("resolve handle %q (host %s): %w", handle, host, err)
	}
	did := resolved.Did
	fmt.Printf("host=%s\n", host)
	fmt.Printf("handle=%s\n", handle)
	fmt.Printf("did=%s\n", did)

	profile, err := bsky.ActorGetProfile(ctx, client, did)
	if err != nil {
		return fmt.Errorf("get profile for %s: %w", did, err)
	}

	banner := strOrEmpty(profile.Banner)
	avatar := strOrEmpty(profile.Avatar)
	displayName := strOrEmpty(profile.DisplayName)

	fmt.Printf("displayName=%s\n", displayName)
	fmt.Printf("banner=%s\n", banner)
	fmt.Printf("avatar=%s\n", avatar)
	if banner == "" {
		fmt.Println("note: banner is EMPTY (fallback bg required)")
	}
	if avatar == "" {
		fmt.Println("note: avatar is EMPTY (fallback glyph required)")
	}

	raw, _ := json.MarshalIndent(profile, "", "  ")
	fmt.Println("--- profile json ---")
	fmt.Println(string(raw))
	return nil
}

func strOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
