# VoiceifyPDF

**Turn PDFs and text into natural-sounding audio—in your browser.**

VoiceifyPDF is a lightweight web app that converts PDF documents and plain text into high-quality speech using **Microsoft Azure Neural Voices** (via edge-tts). Choose from US and UK voices, stream audio as it’s generated, and download MP3s with one click.

---

## Features

- **PDF to Audio** — Upload a PDF; extract text and hear it read aloud with a neural voice.
- **Text to Audio** — Paste or type text and convert it to speech on the fly.
- **Voice selection** — US Female (Aria), US Male (Guy), UK Female (Sonia), UK Male (Ryan).
- **Streaming** — Audio streams as it’s generated for a responsive experience.
- **Download** — Save the result as an MP3 file.
- **Simple UI** — Dark-themed, minimal interface with drag-and-drop support for PDFs.

---

## Prerequisites

- **Python 3.8+**
- A terminal and a modern web browser

---

## Quick start

### 1. Clone the repository

```bash
git clone https://github.com/your-username/VoiceifyPDF-Catalin.git
cd VoiceifyPDF-Catalin
```

*(Replace the URL with your actual repository address.)*

### 2. Create a virtual environment (recommended)

```bash
python3 -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Run the app

```bash
uvicorn main:app --reload
```

Then open **http://127.0.0.1:8000** in your browser.

To use a different port (e.g. if 8000 is in use):

```bash
uvicorn main:app --reload --port 8001
```

Then visit **http://127.0.0.1:8001**.

---

## Using the app

1. **PDF to Audio**
   - Pick a voice from the dropdown (US/UK, male or female).
   - Click **Choose Your PDF File** or drag and drop a PDF onto the drop zone.
   - Wait for processing; the audio player and **Download Audio** button appear when ready.
   - Play in the browser or download the MP3.

2. **Text to Audio**
   - Switch to the **Text to Audio** tab.
   - Type or paste your text into the textarea.
   - Click **Convert to Audio**.
   - Play or download the generated MP3.

---

## Tech stack

| Layer   | Technology |
|--------|------------|
| Backend | FastAPI, Uvicorn |
| TTS     | edge-tts (Microsoft Azure Neural Voices) |
| PDF     | PyPDF2 |

---

## License

This project is available under the MIT License. You may use, modify, and distribute it freely.
