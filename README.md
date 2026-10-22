# Marni Web Composer 🎵

![React](https://img.shields.io/badge/React-19.0.1-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.0-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Web Audio API](https://img.shields.io/badge/Web%20Audio%20API-FFA500?style=for-the-badge&logo=soundcharts&logoColor=white)
![HTML5 Canvas](https://img.shields.io/badge/HTML5%20Canvas-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.3.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-148%20Passed-brightgreen?style=for-the-badge&logo=node.js&logoColor=white)

An open-source, high-performance Digital Audio Workstation (DAW) that runs natively in the browser. Compose, transcribe, record, mix, and export multi-track music with a custom 60fps HTML5 Canvas piano roll, Web Audio API synthesis, General MIDI sampled instruments, hardware Web MIDI recording, AI-powered sheet music & video transcription, and deep native integration with **Black Desert Online (BDO)**.

---
<p align="center">
  <a href="https://lucaslinhares.dev.br/marni-web-composer" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-Open%20Project-8A2BE2?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" />
  </a>
</p>

---

## ✨ Features

### 🎹 High-Performance HTML5 Canvas Piano Roll
- **Custom 60fps Canvas Engine**: Hardware-accelerated rendering with zero heavy canvas library dependencies; automatic Retina / High-DPI scaling.
- **Precision Editing**: Marquee multi-selection, note drawing, note dragging, proportional stretching (0.5x, 2x), pitch transposition, and ghost notes from other tracks.
- **Velocity Lane**: Per-note and multi-selection velocity intensity editing with dynamic presets (`ppp` through `fff`) and linear ramp curves.
- **Canvas Ergonomics**: Dedicated pan tool, middle-click canvas dragging, horizontal mini-scrollbar, and playhead auto-scroll. Full pitch range bounded from **C0 to B8** (108 notes).

### 🎼 AI Sheet Music Scanner (Gemini Vision OMR)
- **Optical Music Recognition (OMR)**: Convert physical sheet music images (PNG, JPEG) or multi-page PDF documents into editable notes using Google Gemini Vision (`gemini-3.8-flash` with dynamic discovery and fallback).
- **Deterministic Music Theory Engine**: Faithful music transcription handling key signatures, unprinted accidentals, ties across barlines, tuplets, rests, dynamics, tempo markings, and repeat structures (1st/2nd volta endings, D.C. al Fine, D.S. al Coda).
- **Grand Staff Separation**: Automatically splits piano scores into separate Right Hand (Treble) and Left Hand (Bass) tracks.

### 🎥 Hybrid Video & Audio Transcription
- **Synthesia Video Line-Scanner**: Real-time tape model scanner with automatic 88-key piano keyboard layout recognition, timeline range cropper, rapid-repeat note separation, particle flame/glow suppression, and color-based hand separation.
- **Audio-to-MIDI (Spotify Basic Pitch)**: In-browser neural ML audio transcription powered by `@spotify/basic-pitch`, with a spectral onset fallback heuristic.
- **Fusion Engine**: Hybrid audio-visual matching aligning video onsets with audio frequency peaks for near-100% transcription accuracy.

### 🔊 Sampled Instruments & Web Audio Synthesis
- **General MIDI SoundFonts**: Real sampled audio for Grand Piano, Flute, Violin, Acoustic Guitar, Electric Bass, Harp, Trumpet, and Cello (FluidR3_GM), downloaded on-demand and cached in IndexedDB for instant offline playback.
- **Built-in Synthesizer**: Polyphonic subtractive synthesizer fallback for instantaneous auditioning while samples load.
- **Authentic BDO Percussion**: Dedicated drum pads and piano roll watermark rows mapped to Black Desert Online pieces (Kick, Snare, Rimshot, Flam, Closed/Open Hi-Hats, Pedal, Toms 1–5, Crash, Ride).
- **Jitter-Free Worker Timer**: Background Web Worker clock via inline Blob URL paired with 150ms lookahead scheduling to completely eliminate browser tab throttling and audio drift.

### 🎛️ Multi-Track Mixer & Master DSP Rack
- **Per-Track Channel Strips (<kbd>X</kbd>)**: Semi-parametric 3-band EQ (Low, Mid, High), dynamic compressor (Threshold, Ratio), volume faders, stereo pan, track mute/solo, and ballistic peak level meters.
- **Master Effector Rack**: Real-time Convolver Reverb (impulse response), Stereo Feedback Delay, and LFO Chorus.

### 🎮 Native Black Desert Online (BDO) Integration
- **Direct Binary BMS Export (`.bms`)**: Pure TypeScript implementation of the game's proprietary ICE encryption cipher. Supports character name persistence, velocity compression, and multi-chunk note partitioning.
- **Native Binary Score Import**: Reads and decrypts native BDO binary files, preserving sustain pedal articulation, effector DSP settings, and C0–B8 note ranges.
- **Pre-Export Validation Inspector**: Instant pre-flight check analyzing note rank limits (Rank F to S), multi-chunk limits, octave registers, and duplicate note collisions, with 1-click automatic fixes.
- **Anti-Plagiarism Protection Lock**: Protects imported BDO scores against unauthorized re-authorship, preserving original composer and arranger credits.

### 📥 Universal Import & Export Ecosystem
- **Import Formats**: Standard MIDI Files (SMF Format 0 & 1), MusicXML (`.musicxml`, `.xml`), BDO Binary (`.bms`), Marni Project (`.marni`), and legacy JSON. Import as a clean project replacement or append as new tracks.
- **Export Formats**:
  - **BDO Binary**: Direct encrypted `.bms` file ready for the game folder.
  - **Standard MIDI**: Multi-track SMF Format 1 with tempo maps and drum channel 10 mapping.
  - **Lossless Master Audio (WAV)**: Multi-track offline rendering via `OfflineAudioContext` directly to 24-bit (48kHz) Studio Master and 16-bit (44.1kHz) CD-quality Lossless PCM WAV through the live engine and mixer chain.

### 🎹 Hardware Web MIDI Recording
- **Plug-and-Play Web MIDI**: Hot-pluggable USB MIDI keyboard support (<kbd>M</kbd>).
- **Real-Time Recording (<kbd>R</kbd>)**: Metronome (<kbd>K</kbd>), 1-bar count-in, velocity sensitivity, true note-off duration tracking, and sustain pedal capture.

### 💾 Projects, Autosave & Crash Recovery
- **Native `.marni` Projects**: Complete session serialization with File System Access API integration for direct save-in-place (<kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>O</kbd>).
- **Continuous IndexedDB Autosave**: Background persistence protecting against accidental tab closure.
- **Crash Recovery**: Automatic session restoration prompt when re-opening after a crash.

### ⚡ Ergonomics & User Experience
- **200-Step Linear Undo/Redo**: Deep history tracking note edits, track operations, mixer settings, tempo, meter, and master effects, with intelligent slider-drag collapsing.
- **Editing Tools**: Clipboard operations (Copy, Cut, Paste across tracks), arrow-key nudging/transposition, quantize (strength & swing), humanize, loop regions (<kbd>L</kbd>), and song markers (<kbd>Shift</kbd>+<kbd>M</kbd>).
- **Interactive Guided Tour & Help Center**: Step-by-step onboarding walkthrough and searchable keyboard shortcuts cheatsheet (<kbd>?</kbd>).
- **Progressive Web App (PWA)**: Installable desktop/mobile experience with offline service worker caching.

---

## 📂 Project Structure

```txt
marni-web-composer/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI workflow (lint, test, e2e, build)
├── e2e/
│   └── smoke.spec.ts            # Playwright end-to-end integration and smoke tests
├── public/
│   ├── manifest.webmanifest     # PWA manifest
│   ├── models/basic-pitch/      # Spotify Basic Pitch neural model weights & shards
│   └── sw.js                    # Service worker offline caching
├── src/
│   ├── audio/                   # Web Audio API engine, DSP fx, soundfonts & scheduler
│   │   ├── AudioEngine.ts       # Central audio context, master bus, synth voices & sample player
│   │   ├── mixer.ts             # Channel strip DSP nodes (3-band EQ, compressor, meters)
│   │   ├── playheadStore.ts     # High-performance playhead state outside React render tree
│   │   ├── sampleLibrary.ts     # FluidR3_GM soundfont loader, pitch shifting & cache
│   │   ├── scheduling.ts        # Lookahead window event scheduler & note indexer
│   │   └── workerTimer.ts       # Jitter-free inline Web Worker timer
│   ├── bdo/                     # Black Desert Online integration & binary engine
│   │   ├── bdoConverter.ts      # MML conversion, note count thresholds & XML generation
│   │   ├── bdoDecoder.ts        # Native binary score parser & multi-chunk track unification
│   │   ├── bdoExportV2.ts       # Pure TypeScript ICE cipher encryption & BMS binary packer
│   │   └── bdoValidation.ts     # Pre-export validation rules, rank limits & 1-click fixes
│   ├── components/              # React UI components & modal dialogs
│   │   ├── AddInstrumentModal   # Add new track dialog with instrument selection
│   │   ├── AiSheetScannerModal  # Gemini Vision OMR sheet music scanner & PDF parser
│   │   ├── BdoExportModal       # BDO export pre-flight check, rank picker & metadata
│   │   ├── BottomBar            # Transport bar, timecode, bar.beat counter, loop & record
│   │   ├── EffectorModal        # Master FX rack (Reverb, Delay, Chorus)
│   │   ├── GuidedTour           # Interactive onboarding walkthrough
│   │   ├── Header               # Top menu, project title, tempo/meter, zoom & actions
│   │   ├── HelpCenter           # Keyboard shortcuts cheatsheet and documentation
│   │   ├── MixerPanel           # Dockable multi-track mixer with EQ, compressor & meters
│   │   ├── PianoRoll            # 60fps HTML5 Canvas piano roll & velocity lane editor
│   │   ├── RecoveryBanner       # Crash recovery & autosave prompt banner
│   │   ├── TrackList            # Multi-track sidebar with solo, mute, instrument & color
│   │   └── VideoAudioTranscriberModal # Synthesia video scanner & Basic Pitch audio-to-MIDI
│   ├── editing/                 # Note manipulation algorithms & history stack
│   │   ├── noteOps.ts           # Clipboard ops, arrow moves, quantize, swing & humanize
│   │   ├── sessionSnapshot.ts   # Session serialization for undo/redo
│   │   └── undoHistory.ts       # 200-step history stack with gesture collapsing
│   ├── export/                  # Audio renderers
│   │   └── audioExporter.ts     # OfflineAudioContext multitrack renderer & WAV PCM encoder
│   ├── import/                  # Universal file import pipeline
│   │   └── fileImport.ts        # Format detector (MIDI, MusicXML, BDO, .marni, JSON)
│   ├── midi/                    # Standard MIDI file & Web MIDI hardware subsystem
│   │   ├── midiDecoder.ts       # Pure TypeScript SMF (Format 0 & 1) decoder
│   │   ├── midiEncoder.ts       # Pure TypeScript SMF Format 1 encoder
│   │   ├── midiRecorder.ts      # Real-time MIDI recording buffer & sustain pedal logic
│   │   └── webMidi.ts           # Web MIDI API device discovery & event listener
│   ├── musicxml/                # Native MusicXML engine
│   │   └── musicXmlDecoder.ts   # Score-partwise XML decoder with Grand Staff separation
│   ├── project/                 # Project file management & persistence
│   │   ├── autosave.ts          # Continuous IndexedDB autosave engine
│   │   ├── projectFile.ts       # Project schema v2, validation & migration
│   │   └── projectIO.ts         # File System Access API save/open with fallback
│   ├── types/                   # TypeScript definitions
│   │   └── music.ts             # Music domain models (Song, Track, Note, Mixer, BDO, etc.)
│   ├── ui/                      # UI notification & layout state
│   │   ├── notify.ts            # Global toast notifications dispatcher
│   │   ├── shortcuts.ts         # Global keyboard shortcut registry & keymaps
│   │   └── tourLayout.ts        # Guided tour step definitions & coordinates
│   ├── user/                    # User preferences & persistent settings
│   │   └── userProfile.ts       # Character name, composer author & Gemini API key storage
│   ├── utils/                   # Mathematics, vision processing & algorithms
│   │   ├── aiSheetScanner.ts    # Gemini Vision prompt orchestration & response parsing
│   │   ├── audioToMidi.ts       # Spotify Basic Pitch inference & spectral fallback
│   │   ├── ids.ts               # Collision-free nanoid generator
│   │   ├── instrumentDetection.ts # Instrument heuristic identification from GM programs/names
│   │   ├── musicMath.ts         # Ticks/seconds conversion, scale snapping & Hz calculations
│   │   ├── scoreTranscription.ts # Deterministic music theory parser for OMR
│   │   ├── trackImport.ts       # Track append vs replace merge strategies
│   │   └── videoScanner.ts      # Synthesia video line-scanner, tape model & keyboard detection
│   ├── App.tsx                  # Main application orchestrator
│   ├── index.css                # Tailwind CSS v4 styling & dark theme variables
│   ├── main.tsx                 # Application bootstrap & PWA registration
│   └── version.ts               # Single source of truth for application version
├── eslint.config.js             # ESLint configuration
├── package.json                 # Project dependencies & scripts
├── playwright.config.ts         # Playwright E2E configuration
├── tsconfig.json                # TypeScript compiler configuration
└── vite.config.ts               # Vite bundler configuration & PWA setup
```

---

## 🧪 Quality & Testing

Marni Web Composer enforces strict type safety, code styling, unit testing, and end-to-end testing:

| Command | Tool | Purpose |
| :--- | :--- | :--- |
| `npm run lint` | TypeScript (`tsc`) | Type checking with zero emit |
| `npm run lint:eslint` | ESLint | Code style and React Hooks verification |
| `npm run format:check` | Prettier | Code formatting validation |
| `npm test` | Node.js Test Runner | 148 unit tests covering MIDI, BDO ICE cipher, OMR, video, and math |
| `npm run test:e2e` | Playwright | End-to-end browser smoke tests in Chromium |

> CI runs all of the above on every push and pull request via GitHub Actions.

---

## 🚀 How to Run Locally

### Prerequisites

- **Node.js** (v18 or higher recommended, tested on Node v20/v22)
- **npm**, **pnpm**, or **yarn**

### 1. Clone the repository

```bash
git clone https://github.com/llinhares/marni-web-composer.git
cd marni-web-composer
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Configuration (Optional for AI OMR)

To use the AI Sheet Music Scanner locally without entering your API key manually in the UI every time, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Set your Google Gemini API key:
```env
GEMINI_API_KEY="your-gemini-api-key"
```

*(Note: You can also enter or update your Gemini API key at any time directly inside the application via the AI Sheet Scanner modal).*

### 4. Start the development server

```bash
npm run dev
```

Open the local address in your browser:
```txt
http://localhost:3000
```

### 5. Running Tests

Execute the native test suite (148 tests):
```bash
npm test
```

Execute Playwright E2E tests:
```bash
# First time setup (installs browser binary):
npx playwright install chromium

# Run tests:
npm run test:e2e
```

### 6. Building for Production

Compile and bundle the production assets:
```bash
npm run build
```

Preview the production build locally:
```bash
npm run preview
```

---

## 🎹 Keyboard Shortcuts Reference

Press <kbd>?</kbd> anywhere in the editor to open the full Help Center. Key shortcuts include:

| Key | Action |
| :--- | :--- |
| <kbd>Space</kbd> | Play / Pause |
| <kbd>Enter</kbd> / <kbd>Backspace</kbd> (stopped) | Rewind to start |
| <kbd>R</kbd> | Toggle MIDI Recording (with 1-bar count-in) |
| <kbd>K</kbd> | Toggle Metronome |
| <kbd>L</kbd> | Toggle Loop Playback |
| <kbd>X</kbd> | Toggle Mixer Panel |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save Project (`.marni`) |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Open Project (`.marni`) |
| <kbd>Ctrl</kbd> + <kbd>A</kbd> | Select All Notes on Active Track |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> / <kbd>Ctrl</kbd> + <kbd>V</kbd> | Copy / Paste Notes |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | Duplicate Selection |
| <kbd>Delete</kbd> | Delete Selected Notes |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Transpose selected notes by semitone (<kbd>Shift</kbd> for octave) |
| <kbd>←</kbd> / <kbd>→</kbd> | Nudge selected notes by grid step (<kbd>Shift</kbd> for whole bar) |
| <kbd>Shift</kbd> + <kbd>M</kbd> | Add Marker at playhead position |
| <kbd>[</kbd> / <kbd>]</kbd> | Jump to previous / next marker |
| <kbd>1</kbd> – <kbd>5</kbd> | Tool selection (Select, Pencil, Eraser, Velocity, Pan) |
| <kbd>?</kbd> | Open Help Center & Shortcuts Reference |

---

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Open an Issue reporting bugs, suggesting feature enhancements, or discussing improvements.
- Submit a Pull Request with new features, test coverage, or musical tools.

Please ensure that `npm test` and `npm run lint` pass before submitting pull requests.

---

## 🎼 Credits & Attributions

- **SoundFont Samples**: General MIDI instruments rendered from the FluidR3_GM soundfont via [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
- **Audio-to-MIDI Model**: Neural pitch detection using [Spotify Basic Pitch](https://github.com/spotify/basic-pitch-ts), licensed under Apache-2.0.
- **Icons**: [Lucide Icons](https://lucide.dev/).
- **Game Lore & Theming**: Inspired by Black Desert Online's music composition system (Pearl Abyss).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

Developed with ❤️ by **[Lucas Linhares](https://lucaslinhares.dev.br/)**
