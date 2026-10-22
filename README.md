# Marni Web Composer 🎵

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-FFA500?style=for-the-badge&logo=soundcharts&logoColor=white) ![HTML5 Canvas](https://img.shields.io/badge/HTML5%20Canvas-E34F26?style=for-the-badge&logo=html5&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

An advanced, open-source, and responsive web-based digital audio workstation (DAW) and music composer specifically tailored for creating, editing, and exporting musical scores for **Black Desert Online (BDO)**.

---
<p align="center">
  <a href="https://lucaslinhares.dev.br/marni-web-composer" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-Open%20Project-8A2BE2?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" />
  </a>
</p>

---

## ✨ Features

- **High-Performance HTML5 Canvas Piano Roll**: Ultra-smooth rendering with automatic device pixel ratio (Retina/High-DPI) scaling, marquee selection, note dragging, proportional stretching (0.5x, 2x), transposition, and ghost notes.
- **Projects, Autosave & Crash Recovery**: `.marni` project files (<kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>O</kbd>, saved in place where the browser supports it), continuous IndexedDB autosave and a recovery prompt after a crash or closed tab.
- **Undo / Redo**: 200-step history covering notes, tracks, mixer, tempo, meter and effects; slider drags and typing collapse into single steps.
- **Editing Tools**: copy/cut/paste across tracks, duplicate, arrow-key nudging and transposition, quantize (strength/swing), humanize, loop region (<kbd>L</kbd> or Shift+drag on the ruler) and song markers (<kbd>Shift</kbd>+<kbd>M</kbd>, <kbd>[</kbd> / <kbd>]</kbd>). Press <kbd>?</kbd> for every shortcut.
- **MIDI Recording**: record from a USB MIDI keyboard (<kbd>R</kbd>) with metronome (<kbd>K</kbd>), one-bar count-in, real note-off and sustain pedal (stored as the BDO per-note sustain flag).
- **Mixer**: per-track channel strips with 3-band EQ, compressor, FX send and peak meters (<kbd>X</kbd>); used by playback and WAV export alike.
- **Sampled Instruments**: Piano, Flute, Violin, Guitar, Bass, Harp, Trumpet and Cello play recorded General MIDI samples (one per semitone), downloaded on demand and cached for offline use; Percussion and Marnisynth use the built-in Web Audio synthesizer, which is also the fallback while samples load. WAV export renders through the same engine, so files sound exactly like the editor.
- **Jitter-Free Worker Timer**: Dedicated background Web Worker timer via inline Blob URL combined with lookahead scheduling (150ms) to eliminate browser tab throttling and audio drift.
- **Native BDO Percussion Mapping**: Dedicated drum row watermarks, color coding, and quick audition pads mapped to authentic Black Desert drum pieces (Kick, Snare, Rimshot, Flam, Closed/Open Hi-Hats, Pedal, Toms 1–5, Crash, and Ride).
- **Direct BDO Binary Export (`.bms`)**: Pure TypeScript implementation of the game's proprietary ICE encryption cipher. Supports automatic extraction of Owner ID and Character Name from existing game files, note rank limits (Rank F to S), velocity compression modes, and chunk note partitioning. A pre-export check reports everything the game would change (range, drums, duplicates, rank limits) with one-click fixes.
- **Smart Standard MIDI Import & Export**: Pure TypeScript SMF (Format 0 and Format 1) decoder and encoder. Automatically detects tempo (BPM), time signatures, General MIDI instruments, and ensures the drum track is mapped to MIDI Channel 10 (channel 9).
- **Web MIDI Hardware Support**: Plug-and-play (including hot-plugged) USB MIDI keyboards for playing and recording.
- **Installable & Offline**: PWA with a service worker; after the first visit the editor and cached instruments work without internet.
- **Lossless Master Audio Exporter**: Fast multitrack rendering using `OfflineAudioContext` directly to 24-bit (48kHz) Studio Master and 16-bit (44.1kHz) CD-quality Lossless PCM WAV audio.
- **Master Effector Rack**: Real-time Reverb (convolver impulse), Stereo Feedback Delay, and LFO Chorus DSP rack.

---

## 🧪 Quality

```bash
npm run lint          # TypeScript typecheck
npm run lint:eslint   # ESLint
npm test              # unit tests (node:test)
npm run test:e2e      # Playwright end-to-end tests (first run: npx playwright install chromium)
```

CI (GitHub Actions) runs all of the above on every push and pull request.

---

## 🚀 How to Run Locally

### Prerequisites

- Node.js (v18 or higher)
- npm, pnpm, or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/llinhares/marni-web-composer.git
```

2. Navigate to the project folder:

```bash
cd marni-web-composer
```

3. Install dependencies:

```bash
npm install
```

4. Start the development server:

```bash
npm run dev
```

5. Open the local address in your browser:

```txt
http://localhost:3000
```

### Running Tests

Execute the native test suite covering MIDI encoding/decoding, BDO conversion, and music mathematics:

```bash
npm test
```

### Building for Production

Compile and bundle the production assets:

```bash
npm run build
```

---

## 📂 Project Structure

```txt
src/
├── audio/               # Web Audio API engine, DSP fx & WorkerTimer scheduler
├── bdo/                 # BDO ICE cipher, BMS binary exporter & XML/MML converter
├── components/          # React components (PianoRoll, Header, TrackList, BottomBar, Modals)
├── export/              # OfflineAudioContext multitrack renderer & WAV PCM encoder
├── midi/                # Pure TypeScript Standard MIDI File decoder, encoder & Web MIDI manager
├── types/               # Music domain, track, and score TypeScript definitions
└── utils/               # Music theory math, scale calculations, drum mapping & timecodes
```

---

## 🤝 Contributing

Contributions are more than welcome!

Feel free to open Issues reporting bugs or feature requests, or submit Pull Requests with improvements (such as new visualizers, workflow tools, or musical enhancements).

---

## 🎹 Credits

- Instrument samples: **FluidR3_GM** SoundFont by Frank Wen, pre-rendered by [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
- Audio-to-MIDI model: [Spotify basic-pitch](https://github.com/spotify/basic-pitch-ts) (Apache-2.0).

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

---

Developed by **[Lucas Linhares](https://lucaslinhares.dev.br/)**
