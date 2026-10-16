# 🎧 Auto-DJ

Turn a Spotify playlist into a live DJ set: songs ordered by key and tempo, mixed hook to hook with blends, cuts on the drop and sound effects. Lyrics scroll karaoke-style so you can sing along.

- **Spotify** provides the playlist and track info.
- **YouTube** (official IFrame player) provides the audio. Two decks play at once, so the songs genuinely overlap and crossfade.
- **LRCLIB** provides time-synced lyrics. They're used for the sing-along view and to choose mix points: leave after a chorus, and bring the next song in so its first vocal lands just as the fade finishes, so two vocals never clash.
- **GetSongBPM** (optional) provides tempo and key for the ✨ Auto-order button (Camelot wheel + BPM + energy curve).

## Setup

1. **Spotify app:** at <https://developer.spotify.com/dashboard>, create an app, tick *Web API*, and add the redirect URI `http://127.0.0.1:5173/callback`. Copy the Client ID.
2. **YouTube key:** in <https://console.cloud.google.com>, create a project, enable *YouTube Data API v3*, and create an API key.
3. **GetSongBPM key (optional):** <https://getsongbpm.com/api>. Without it everything works except BPM/key ordering.
4. Then:
   ```sh
   npm install
   cp .env.example .env   # fill in the three values
   npm run dev
   ```
5. Open **http://127.0.0.1:5173** (use `127.0.0.1`, not `localhost`, because Spotify rejects localhost redirects).

## Using it

1. Log in, then pick a playlist (or paste a playlist link).
2. Wait for tracks to match on YouTube. Each row shows `▶ video`, `synced lyrics` and its BPM/key.
3. Optionally press **✨ Auto-order**, choose a **Mix style**, then **▶ Start the mix**.
4. During the set:
   - **⇄ Mix now** starts the planned transition early.
   - **▶** on a row blends straight to that track.
   - Rows can be dragged to reorder.
   - **⟳** tries the next YouTube result for a track. **🔗** lets you paste your own link.
   - **Lyrics too early / too late** adjusts that track's timing by 0.5s. It moves the lyrics and the mix points together, and is remembered.
   - **⛶ Full screen** turns the lyrics into a karaoke screen.

### Mix styles
The presets are modelled on the feel of Afrobeats/Amapiano mixtape channels (Culture FM, DJ Kiki, DJ Faaji, DJ Mixeado):

| Preset | Each song plays | Blend | Transitions |
|---|---|---|---|
| Mixtape (hook to hook) | 75–150s | 8 bars | mostly blends, some drops, a few SFX |
| Amapiano long blend | 150–300s | 16 bars | blends only |
| Party (cuts + SFX) | 55–110s | 4 bars | blends, drops, horns, risers, rewinds |

Click **Tweak** to adjust them. Sound effects are synthesised in the browser. To add your **own** DJ voice tag, save it as `web/public/sfx/tag.mp3`.

## Limits
- YouTube search uses about 100 of the free 10,000 daily quota units per song, so roughly 100 new songs a day. Matches are cached in `server/cache.json`, so a song you've already loaded costs nothing.
- Audio stays inside YouTube's player, so there's no true beat-matching, EQ or filter effects. Changes are timed volume crossfades, cuts and overlaid SFX. Nothing is downloaded.
- Music videos with skits at the start may need a few presses of **Lyrics too early/late**, or a 🔗 link to an "official audio" upload.

## Scripts
`npm run dev` · `npm test` (Vitest) · `npm run typecheck` · `npm run build && npm start` (serves the build at http://127.0.0.1:5174)

For `npm start`, also add `http://127.0.0.1:5174/callback` as a redirect URI in the Spotify dashboard.
