# Usability telemetry

The homeowner tool can record anonymous usage with [PostHog](https://posthog.com) so the team can see how people move through it and where they get stuck. It is **off unless a PostHog key is configured** (see [Setup](#setup)).

Code: `src/telemetry.ts` (the only file that talks to PostHog). Pages call `track('event_name', { … })`.

## Privacy rules

| Rule | How it's enforced |
|---|---|
| No cookies | PostHog keeps its anonymous ID in `sessionStorage`: one browser tab, forgotten when it closes. Nothing goes in cookies or `localStorage`. |
| Never an address or lot ID | Events describe a lot only by broad traits (size, zoning, map category, supported or not). The `?p=<lot>` URL parameter is stripped from every URL PostHog records (`scrubUrl`). |
| Nothing typed is recorded | Search text is never sent, only its length when nothing matched. Automatic click capture records no element text (`mask_all_text`). |
| Session replay only with consent | Replays start only for visitors who open a **study link** (below). All inputs are masked, and every element showing an address has the `ph-private` class, so its text is blanked in the replay. |
| Not on test or dev machines | Off on `localhost` and in automated browsers. Respects the browser's Do Not Track setting. |
| Visitors are told | When telemetry is configured, the site footer says what is recorded. |

These rules are checked by `e2e/telemetry.spec.ts` (no address, lot ID or typed text in any event; every address on screen is masked) and `src/telemetry.test.ts` (URL scrubbing). Before this was first merged, the real PostHog library was also run against a simulated PostHog server, to confirm that neither events nor replays contain an address or lot ID, and that nothing is stored in cookies or `localStorage`.

## Study links (usability testing)

Give each participant a link with their participant code:

```
https://crowd-sourced-city.github.io/rehousing-mattapan/?study=P07
```

For the rest of that browser tab:
- every event carries `participant: "P07"` and `study: true`;
- the session is recorded as a replay (inputs and addresses masked).

Codes may contain letters, numbers, `-` and `_` (up to 24 characters). Don't use names or emails as codes.

Get participants' consent before sending the link. Recording people for a study may need review by COUHES, MIT's ethics board for research with people; check with your instructor. Class projects are often exempt, but that is their call.

## Events

| Event | When | Properties |
|---|---|---|
| `$pageview` | Every page (route) change | `route`, e.g. `/option/garage/questions` |
| `navigated_back` | The browser Back button returns to the previous page (a "stuck" signal) | `from`, `to` |
| `search_no_results` | An address search finds nothing (sent once typing pauses) | `query_length` |
| `lot_selected` | A lot is picked | `via` (search / map), `lot_size`, `zoning`, `category`, `supported` |
| `find_continued` | "Enter property info" / "Continue" on the Find page | `supported` |
| `details_completed` | "See my options" on the Details page | `answered`, `questions` |
| `options_viewed` | The options page shows its results | `lot_size`, `available`, `unavailable`, `possible` |
| `unavailable_options_toggled` | "Show/Hide N options not available here" | `open`, `count` |
| `explainer_toggled` | Any dropdown explanation is opened or closed | `title`, `open`, `route` |
| `option_questions_completed` | "See my result" after an option's questions | `option` |
| `option_result` | An option's result is shown | `option`, `status` |
| `result_explained` | "How we reached this result" is opened | `option`, `status` |
| `summary_printed` | "Print or save as PDF" on the summary | `option`, `status` |
| `error_shown` | The error screen appears | `message`, `load_error`, `stack` |
| `$autocapture`, `$rageclick`, `$dead_click`, `$pageleave` | PostHog's automatic events: clicks (no text), repeated angry clicks, clicks that do nothing, leaving | PostHog's own |

Every event also carries `environment` (`production` or `preview`) and `build` (commit).

### Useful views in PostHog
- **Funnel:** `$pageview` route `/find` → `lot_selected` → `details_completed` → `options_viewed` → `option_result`. This shows where people drop off.
- **Trends:** `search_no_results`, `navigated_back`, `$rageclick`, `$dead_click` and `error_shown` broken down by `route`. This shows where people get stuck.
- **Replays:** filter by the `participant` property to watch one usability session.
- Filter `environment = production` to leave out PR previews.

## Setup

1. Create a free PostHog Cloud account, US or EU region. Copy the project's **API key** (`phc_…`). It is public by design, like a site ID.
2. In the PostHog project settings:
   - turn **on** "Discard client IP data";
   - turn **on** session replay ("Record user sessions"; the app still only starts it for study links);
   - keep autocapture, heatmaps and dead clicks on.
3. Add two GitHub repository **variables** (not secrets): Settings → Secrets and variables → Actions → Variables.
   - `POSTHOG_KEY` = the `phc_…` key
   - `POSTHOG_HOST` = `https://us.i.posthog.com` or `https://eu.i.posthog.com`

   Or from a terminal: `gh variable set POSTHOG_KEY --body phc_…`
4. The next deploy (main or a PR preview) includes telemetry. To turn it off, delete the `POSTHOG_KEY` variable and redeploy.

## Checking events by hand

Open any page with `?telemetry=debug` (e.g. `…/#/find?telemetry=debug`). Events are then printed to the browser console as `[telemetry] …` and kept in `window.__aduEvents` for the rest of the tab, whether or not a key is configured.
