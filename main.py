import io
from PyPDF2 import PdfReader
from gtts import gTTS
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.concurrency import run_in_threadpool

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    with open("./static/index.html") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content, status_code=200)

def generate_audio(text: str, language: str = "en") -> io.BytesIO:
    """Helper function to run synchronous gTTS in a separate thread."""
    tts = gTTS(text=text, lang=language)
    audio_bytes = io.BytesIO()
    tts.write_to_fp(audio_bytes)
    audio_bytes.seek(0)
    return audio_bytes

@app.post("/upload")
async def create_upload_file(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a PDF")

    try:
        contents = await file.read()
        pdf_reader = PdfReader(io.BytesIO(contents))

        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + " "

        if not text.strip():
            raise HTTPException(status_code=400, detail="No readable text found. The PDF might be scanned images.")

        # Run the synchronous gTTS generation in a threadpool to prevent blocking
        audio_bytes = await run_in_threadpool(generate_audio, text, "en")

        return StreamingResponse(audio_bytes, media_type="audio/mp3")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")