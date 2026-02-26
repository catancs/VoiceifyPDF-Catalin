import asyncio
import io
import json
import re
import uuid
import fitz
import edge_tts
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, StreamingResponse

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

JOBS = {}
JOB_LOCK = asyncio.Lock()

CHUNK_MAX_CHARS = 4000
MAX_CHUNKS = 80


def clean_text(raw_text: str) -> str:
    text = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", raw_text)
    text = re.sub(r"[\n\r\t]+", " ", text)
    text = re.sub(r" +", " ", text)
    return text.strip()


def chunk_text(text: str, max_chars: int = CHUNK_MAX_CHARS) -> list[str]:
    if not text.strip():
        return []
    paragraphs = re.split(r"\n\s*\n", text)
    chunks = []
    current = []
    current_len = 0
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if current_len + len(para) + 1 <= max_chars:
            current.append(para)
            current_len += len(para) + 1
        else:
            if current:
                chunks.append(" ".join(current))
            if len(para) > max_chars:
                for i in range(0, len(para), max_chars):
                    chunks.append(para[i : i + max_chars])
                current = []
                current_len = 0
            else:
                current = [para]
                current_len = len(para) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks


def extract_pdf_text_fitz(contents: bytes) -> str:
    doc = fitz.open(stream=contents, filetype="pdf")
    parts = []
    try:
        for page in doc:
            parts.append(page.get_text(sort=True))
    finally:
        doc.close()
    return clean_text(" ".join(parts))


@app.get("/")
async def read_index():
    with open("./static/index.html") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content, status_code=200)


@app.post("/upload")
async def create_upload_file(
    file: UploadFile = File(...),
    voice: str = Form("en-US-AriaNeural"),
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a PDF")

    contents = await file.read()
    print(f"[upload] PDF received: {file.filename} size={len(contents)} bytes")

    job_id = str(uuid.uuid4())
    async with JOB_LOCK:
        JOBS[job_id] = {
            "status": "extracting",
            "progress": 0,
            "message": "Reading PDF...",
            "chunks": None,
            "voice": voice,
            "error": None,
            "truncated": False,
        }

    async def run_extract():
        try:
            text = await run_in_threadpool(extract_pdf_text_fitz, contents)
            if not text:
                async with JOB_LOCK:
                    JOBS[job_id]["status"] = "error"
                    JOBS[job_id]["error"] = "No readable text found. The PDF might be scanned images."
                print(f"[job {job_id}] Extract: no text")
                return
            chunks = chunk_text(text)
            truncated = False
            if len(chunks) > MAX_CHUNKS:
                chunks = chunks[:MAX_CHUNKS]
                truncated = True
            async with JOB_LOCK:
                JOBS[job_id]["chunks"] = chunks
                JOBS[job_id]["truncated"] = truncated
                JOBS[job_id]["status"] = "ready"
                JOBS[job_id]["progress"] = 50
                JOBS[job_id]["message"] = "Ready to generate audio"
            print(f"[job {job_id}] Extract ok: {len(chunks)} chunks")
        except Exception as e:
            print(f"[job {job_id}] Extract error: {e}")
            async with JOB_LOCK:
                JOBS[job_id]["status"] = "error"
                JOBS[job_id]["error"] = str(e)

    asyncio.create_task(run_extract())
    print(f"[upload] job_id={job_id} created, extraction task started")
    return {"job_id": job_id}


@app.post("/upload-text")
async def create_upload_text(
    text: str = Form(...),
    voice: str = Form("en-US-AriaNeural"),
):
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    cleaned = clean_text(text.strip())
    chunks = chunk_text(cleaned)
    if not chunks:
        raise HTTPException(status_code=400, detail="No text content after cleaning.")

    job_id = str(uuid.uuid4())
    async with JOB_LOCK:
        JOBS[job_id] = {
            "status": "ready",
            "progress": 50,
            "message": "Ready to generate audio",
            "chunks": chunks,
            "voice": voice,
            "error": None,
        }
    print(f"[upload-text] job_id={job_id} created, chunks={len(chunks)}")
    return {"job_id": job_id}


@app.get("/job/{job_id}")
async def get_job_status(job_id: str):
    async with JOB_LOCK:
        job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status": job["status"],
        "progress": job["progress"],
        "message": job["message"],
        "error": job.get("error"),
        "truncated": job.get("truncated", False),
    }


@app.get("/status/{job_id}")
async def job_status(job_id: str):
    async def event_generator():
        last_sent = None
        while True:
            async with JOB_LOCK:
                job = JOBS.get(job_id)
            if not job:
                yield f"data: {json.dumps({'status': 'error', 'message': 'Job not found'})}\n\n"
                return
            if job["status"] == "error":
                yield f"data: {json.dumps({'status': 'error', 'message': job.get('error', 'Unknown error')})}\n\n"
                return
            payload = {
                "status": job["status"],
                "progress": job["progress"],
                "message": job["message"],
            }
            key = (payload["status"], payload["progress"], payload["message"])
            if key != last_sent:
                last_sent = key
                yield f"data: {json.dumps(payload)}\n\n"
            if job["status"] == "done":
                return
            await asyncio.sleep(0.25)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def generate_audio_stream_chunked(chunks: list[str], voice: str, job_id: str):
    import time
    num = len(chunks)
    print(f"[stream-audio] job_id={job_id} starting generator, total chunks={num}")
    for i, block in enumerate(chunks):
        t0 = time.perf_counter()
        print(f"[stream-audio] job_id={job_id} chunk {i + 1}/{num} starting TTS (len={len(block)} chars)")
        communicate = edge_tts.Communicate(block, voice)
        chunk_bytes = 0
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                chunk_bytes += len(chunk["data"])
                yield chunk["data"]
        elapsed = time.perf_counter() - t0
        print(f"[stream-audio] job_id={job_id} chunk {i + 1}/{num} done in {elapsed:.2f}s, yielded {chunk_bytes} bytes")
        progress = 50 + int(50 * (i + 1) / num) if num else 100
        async with JOB_LOCK:
            job = JOBS.get(job_id)
            if job:
                job["progress"] = min(progress, 100)
                job["message"] = f"Synthesizing audio ({progress}%)..."
    print(f"[stream-audio] job_id={job_id} all chunks done, marking job complete")
    async with JOB_LOCK:
        job = JOBS.get(job_id)
        if job:
            job["status"] = "done"
            job["progress"] = 100
            job["message"] = "Complete"


@app.get("/stream-audio/{job_id}")
async def stream_audio(job_id: str):
    print(f"[stream-audio] GET job_id={job_id}")
    async with JOB_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job["status"] == "error":
            raise HTTPException(status_code=400, detail=job.get("error", "Job failed"))
        chunks = job.get("chunks")
        voice = job.get("voice", "en-US-AriaNeural")
        if not chunks:
            raise HTTPException(status_code=400, detail="Job not ready yet")
        job["status"] = "generating"
        job["progress"] = 50
        job["message"] = "Synthesizing audio (50%)..."
    print(f"[stream-audio] job_id={job_id} returning StreamingResponse, chunks={len(chunks)}")
    return StreamingResponse(
        generate_audio_stream_chunked(chunks, voice, job_id),
        media_type="audio/mpeg",
        headers={"Accept-Ranges": "bytes"},
    )
