# Warkworth FC — Oysters · Season Tracker

A static website for the **Oysters** in **NRF Men Div. 8 Harbour**.

It shows fixtures, results, weekly squads, goal scorers, the ref for each game, our season record by opponent, top scorers and appearances. All data lives in a single file: **`data/season.json`**. Edit that file each week and the site updates.

## Live site

Once deployed: `https://<your-username>.github.io/<repo-name>/`

## Files

```
index.html          # page
styles.css          # styling
app.js              # loads season.json and renders each tab
data/season.json    # ALL the data — squad, 18 fixtures, results, scorers, refs
```

## Deploying to GitHub Pages

1. Create a new public repository on GitHub (e.g. `oysters-2026`).
2. Upload all the files in this folder to the root of the repo (drag & drop on github.com works, or use git).
3. Go to **Settings → Pages**.
4. Under **Source**, choose **Deploy from a branch**. Pick branch `main`, folder `/ (root)`. Save.
5. Wait ~1 minute. Your site will be live at `https://<your-username>.github.io/<repo-name>/`.

That's it. No build step, no dependencies.

## Updating data each week

Open `data/season.json` on GitHub (the pencil icon edits it in the browser). Find the fixture you want to update and fill in the `result` block:

```json
{
  "id": 4,
  "date": "2026-05-09",
  "...": "...",
  "result": {
    "status": "confirmed",
    "ourScore": 3,
    "theirScore": 1,
    "scorers": [
      { "player": "Jake White", "goals": 2 },
      { "player": "Treye Liu", "goals": 1, "minutes": [67] }
    ],
    "selectedSquad": [
      "Caleb Paxton-Penman",
      "Simon Hartley",
      "..."
    ],
    "referee": "Nigel Parker",
    "notes": ""
  }
}
```

### Field reference

| Field | What it is |
|---|---|
| `status` | `"scheduled"`, `"confirmed"`, or `"disputed"` (when both teams entered different scores). Disputed scores are shown in orange with an asterisk. |
| `ourScore` / `theirScore` | Always Oysters first / opponent second, regardless of home or away. |
| `scorers` | Array of `{ player, goals, minutes }`. `goals` defaults to 1 if omitted. `minutes` is optional. Use the player's exact name from the squad list so totals roll up correctly. |
| `selectedSquad` | Array of player names that played that week. Counts toward appearances. |
| `referee` | Whoever ref'd. Free text — usually a player's name. |
| `notes` | Any context (e.g. "Score disputed", "Played short"). |

Commit the change. The site refreshes itself the next time anyone loads it.

### Adding a new player

Add an entry to the `squad` array in `season.json`:

```json
{ "number": 18, "name": "New Player Name", "facebook": "https://..." }
```

`facebook` can be `null` if you don't have a link.

## Local preview (optional)

If you want to preview before pushing, from this folder run any static server. The simplest:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

You can't just double-click `index.html` because browsers block `fetch()` of local files.

## Current status (as of season start)

- **3 games played** (W 5–2 vs Craigs Ski Troopers, W 2–1 away to Coast Thunder, W 5–1 vs Birkenheadaches *disputed*)
- Squad list captured for game 3 vs Birkenheadaches
- Goal scorers and refs are blank — fill them in as you go

## Where the data comes from

- Fixtures: [NRF Senior Men competitions page](https://www.nrf.org.nz/Competitions-1/Senior-Competitions/nrf-community-senior-men)
- Squad: [Warkworth AFC — Oysters Facebook group](https://www.facebook.com/groups/1495935420450971)
