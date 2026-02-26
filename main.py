import io
from PyPDF2 import PdfReader
import edge_tts
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    with open("./static/index.html") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content, status_code=200)

async def generate_audio_stream(text: str, voice: str):
    """Streams audio chunks directly from Microsoft Edge Neural TTS."""
    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]

@app.post("/upload")
async def create_upload_file(
    file: UploadFile = File(...),
    voice: str = Form("en-US-AriaNeural")
):
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

        # Stream the audio directly back to the client as it generates
        return StreamingResponse(generate_audio_stream(text, voice), media_type="audio/mp3")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@app.post("/upload-text")
async def create_upload_text(
    text: str = Form(...),
    voice: str = Form("en-US-AriaNeural")
):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        return StreamingResponse(
            generate_audio_stream(text.strip(), voice),
            media_type="audio/mp3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing text: {str(e)}")
