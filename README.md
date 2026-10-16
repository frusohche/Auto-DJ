# 🎧 Auto-DJ

Turn a Spotify playlist into a live DJ set: songs ordered by key and tempo, mixed hook to hook with blends, drum bridges, cuts on the drop and sound effects. Lyrics scroll karaoke-style so you can sing along, and your phone can be the remote.

- **Spotify** provides the playlist and track info.
- **YouTube** (official IFrame player) provides the audio. Two decks play at once, so the songs genuinely overlap and crossfade.
- **LRCLIB** provides time-synced lyrics. They're used for the sing-along view and to choose mix points: leave after a chorus, and bring the next song in so its first vocal lands just as the fade finishes, so two vocals never clash.
- **GetSongBPM** (optional) provides tempo and key for the ✨ Auto-order button (Camelot wheel + BPM + energy curve).

## Setup

1. **Spotify app:** at <https://developer.spotify.com/dashboard>, create an app, tick *Web API*, and add the redirect URI `http://127.0.0.1:5173/callback`. Copy the Client ID.
2. **YouTube key:** in <https://console.cloud.google.com>, create a project, enable *YouTube Data API v3*, and create an API key.
3. **GetSongBPM key (optional):** <https://getsongbpm.com/api>. Without it everything works except BPM/key ordering. Its database is thin on Afrobeats; tap tempo fills the gaps.
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
| Mixtape (hook to hook) | 75–150s | 8 bars | blends, drum bridges, some drops, a few SFX |
| Amapiano long blend | 150–300s | 16 bars | blends and 8-bar log drum + piano bridges |
| Party (cuts + SFX) | 55–110s | 4 bars | blends, short bridges, drops, horns, risers, rewinds |

Click **Tweak** to adjust them. Sound effects are synthesised in the browser. To add your **own** DJ voice tag, save it as `web/public/sfx/tag.mp3`.

### Drum bridges
A bridge connects two songs with the app's own beat, the way a DJ rides a drum loop between tracks:

1. The outgoing song fades out under the drums (half a bar).
2. The drums play alone for the bridge length, with the tempo gliding from one song's BPM to the next. A snare roll in the last bar leads into the drop.
3. The next song fades in as the drums drop out, timed so its first vocal lands right after.

There are two sounds: **Afrobeats** (kick, clap, rim, shaker, congas and a bassline) and **Amapiano** (four-on-the-floor kick, log drum and jazzy piano chords in the next song's key, when it's known). **Auto** picks Amapiano for tempos of about 109 BPM and up. Everything is synthesised in the browser. Try **▶ afrobeats / ▶ amapiano** under **Tweak** to preview.

The app can't hear the YouTube audio, so it can't line its drums up with a song's beat. That's why the drums mostly play *between* the songs, not on top of them. For an accurate bridge tempo, tap **BPM · tap** on the playing deck (or in the phone remote) 4 or more times in time with the beat. Many Afrobeats songs have no BPM data, and those use **Tempo when a song has no BPM** (105 by default).

## Phone

### Phone as remote (recommended)
Click **📱 Phone remote** at the top, then scan the QR code with your phone (or open `/r/CODE`). The computer keeps playing the music. The phone gets:
- play/pause, **Mix now**, stop and volume
- the set list (tap ▶ to jump, ↑↓ to reorder, ✨ Auto-order)
- the karaoke lyrics, full screen, with the too early/late buttons
- mix style and tap tempo

The phone has to reach the computer's server, so this needs the **online version** (below). `127.0.0.1` only works on the computer itself.

### Playing on the phone (experimental)
Opening the app itself on a phone works too, with limits:
- **iPhone/iPad:** web pages can't change YouTube's volume, so there are no blends. Changes are cuts and drum bridges.
- **All phones:** a page can only control a video after you've tapped it once. The decks panel shows **Load decks**: tap ▶ inside Deck A and Deck B once, then start the mix.

## Put it online (free, on Render)
1. Push this repo to GitHub (already done if you're reading this there).
2. Sign up at <https://render.com> with your GitHub account. Choose **New → Blueprint**, pick the **Auto-DJ** repo, then **Apply**. `render.yaml` sets everything up.
3. When asked, fill in `VITE_SPOTIFY_CLIENT_ID`, `YOUTUBE_API_KEY`, `GETSONGBPM_API_KEY` (optional) and an **`APP_PASSWORD`** of your choice. Set the password: without it, anyone with the link could use up your YouTube quota.
4. Wait for the first deploy to finish. You'll get an address like `https://auto-dj-xxxx.onrender.com`.
5. In the Spotify dashboard, open your app and add the redirect URI **`https://auto-dj-xxxx.onrender.com/callback`** (your address + `/callback`). Save.
6. Open the address on your computer, enter the app password and log in. Then use **📱 Phone remote** to pair your phone.

Notes on the free plan: the server sleeps after about 15 minutes without visitors, so the first visit takes up to a minute to wake it. Its disk is wiped when it restarts, but each browser also remembers its song matches, so YouTube quota isn't spent twice.

## Limits
- YouTube search uses about 100 of the free 10,000 daily quota units per song, so roughly 100 new songs a day. Matches are cached in `server/cache.json`, so a song you've already loaded costs nothing.
- Audio stays inside YouTube's player, so there's no true beat-matching, EQ or filter effects. Changes are timed volume crossfades, drum bridges, cuts and overlaid SFX. Nothing is downloaded.
- Music videos with skits at the start may need a few presses of **Lyrics too early/late**, or a 🔗 link to an "official audio" upload.

## Scripts
`npm run dev` · `npm test` (Vitest) · `npm run typecheck` · `npm run build && npm start` (serves the build at http://127.0.0.1:5174)

For `npm start`, also add `http://127.0.0.1:5174/callback` as a redirect URI in the Spotify dashboard.
