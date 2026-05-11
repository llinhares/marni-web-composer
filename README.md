# Marni Web Composer 🎵

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white) ![Tone.js](https://img.shields.io/badge/Tone.js-000000?style=for-the-badge&logo=javascript&logoColor=white) ![Zustand](https://img.shields.io/badge/Zustand-4A4A55?style=for-the-badge&logo=react&logoColor=white)

An advanced, open-source, and responsive web composer focused on creating, editing, and exporting musical scores for **Black Desert Online (BDO)**.

> ⚠️ **Work in Progress:**  
> Currently, the Piano instrument is the most complete and stable implementation.  
> Other instruments are still under active development and may have incomplete mappings, playback inconsistencies, or missing sample libraries.

---
<p align="center">
  <a href="https://lucaslinhares.dev.br/marni-web-composer" target="_blank">
    <img src="https://img.shields.io/badge/Live%20Demo-Open%20Project-8A2BE2?style=for-the-badge&logo=vercel&logoColor=white" />
  </a>
</p>

---

## ✨ Features

- **Professional Piano Roll**: Easily draw, drag, resize, and delete notes with Pencil and Selection tools.
- **Multiple Instruments**: Support for various instruments (Piano, Acoustic Guitar, Flute, Harp, Drum Kit, etc.) mapped directly to the native BDO engine.
- **Realistic Audio Engine**: Uses Tone.js combined with real audio samples (`.flac`, `.wav`, `.mp3`) for high-fidelity browser playback.
- **Smart MIDI Import**: Upload generic `.mid` files and the application will automatically map tracks to the corresponding instruments.
- **Direct BDO Export**: Native conversion algorithm that compiles browser tracks directly into the binary format read by the game, featuring Velocity Compression and Transpose options.
- **Global Effects (Effector)**: Fine-tune Reverb, Delay, and Chorus in real-time.

---

## 🚀 How to Run Locally

### Prerequisites

- Node.js (v18 or higher)
- npm, yarn, or pnpm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/llinhares/marni-web-composer.git
```

2. Navigate to the project folder:

```bash
cd marni-web-composer
```

3. Install the dependencies:

```bash
npm install

# or

yarn install
```

4. Start the development server:

```bash
npm run dev

# or

yarn dev
```

5. Open the following URL in your browser:

```txt
http://localhost:3000
```

> **Note:** For all instruments to sound correctly locally, make sure the audio samples are placed in the `/public/samples/` folder according to the directory structure defined in the code.

---

## 📂 Project Structure

```txt
src/
├── components/          # React Components (UI)
│   ├── controls/        # Modals (Effector, BDO Export, Instruments, Onboarding)
│   ├── layout/          # Main layout (Header, Sidebar)
│   └── piano-roll/      # The core editor (Grid, Notes built with Konva.js)
├── core/
│   └── audio/           # Audio engine (ToneEngine.js) integrating Tone.js and samples
├── store/               # Global state management using Zustand
├── types/               # TypeScript type definitions
└── utils/               # Utility functions (BDO Export, Constants, Conversions)
```

---

## 🤝 Contributing

Contributions are more than welcome!

Feel free to open Issues reporting bugs, suggesting improvements, or submit Pull Requests with new features (such as support for new instruments or visualizer optimizations).

---

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

---

Developed by **[Lucas Linhares](https://lucaslinhares.dev.br/)**