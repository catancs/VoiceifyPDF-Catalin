const tabPdf = document.getElementById("tab_pdf");
const tabText = document.getElementById("tab_text");
const sectionPdf = document.getElementById("section_pdf");
const sectionText = document.getElementById("section_text");
const voiceSelect = document.getElementById("voice_select");

const dropArea = sectionPdf.querySelector(".drop_box");
const buttonChoose = sectionPdf.querySelector("#btn_choose");
const input = sectionPdf.querySelector("input");
const progressWrapperPdf = sectionPdf.querySelector("#progress_wrapper_pdf");
const statusLabelPdf = sectionPdf.querySelector("#status_label_pdf");
const progressBarPdf = sectionPdf.querySelector("#progress_bar_pdf");
const actionElements = sectionPdf.querySelector("#action");
const downloadBtn = sectionPdf.querySelector("#download");

const textDropBox = sectionText.querySelector(".text_drop_box");
const textInput = document.getElementById("text_input");
const btnSubmitText = document.getElementById("btn_submit_text");
const progressWrapperText = sectionText.querySelector("#progress_wrapper_text");
const statusLabelText = sectionText.querySelector("#status_label_text");
const progressBarText = sectionText.querySelector("#progress_bar_text");
const actionText = sectionText.querySelector("#action_text");
const downloadBtnText = sectionText.querySelector("#download_text");
const textActions = sectionText.querySelector(".text_actions");

let fileName = null;
let currentAudioUrl = null;
let currentJobId = null;

function showError(message) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 5000);
}

function setProgressPdf(visible, percent, message) {
  if (visible) {
    progressWrapperPdf.classList.remove("hidden");
    progressBarPdf.style.width = `${percent}%`;
    statusLabelPdf.textContent = message || "Processing...";
  } else {
    progressWrapperPdf.classList.add("hidden");
  }
}

function setProgressText(visible, percent, message) {
  if (visible) {
    progressWrapperText.classList.remove("hidden");
    progressBarText.style.width = `${percent}%`;
    statusLabelText.textContent = message || "Processing...";
  } else {
    progressWrapperText.classList.add("hidden");
  }
}

function subscribeStatus(jobId, onUpdate, onError) {
  let sseCount = 0;
  console.log("[SSE] Opening EventSource for job", jobId);
  let lastStatus = null;
  const es = new EventSource(`/status/${jobId}`);
  es.onmessage = (e) => {
    sseCount += 1;
    const data = JSON.parse(e.data);
    lastStatus = data.status;
    console.log("[SSE] #" + sseCount + " status=" + data.status + " progress=" + data.progress + " message=" + (data.message || ""));
    if (data.status === "error") {
      console.error("[SSE] Error from server:", data.message);
      es.close();
      onError(data.message || "Unknown error", lastStatus);
      return;
    }
    onUpdate(data);
    if (data.status === "done") {
      console.log("[SSE] Got done, closing EventSource");
      es.close();
    }
  };
  es.onerror = (err) => {
    console.error("[SSE] Connection error, lastStatus=" + lastStatus, err);
    es.close();
    onError("Connection lost", lastStatus);
  };
  return () => es.close();
}

function pollJobUntilDone(jobId, onUpdate, onDone, onError, intervalMs) {
  intervalMs = intervalMs || 1000;
  let pollCount = 0;
  const t = setInterval(async () => {
    pollCount += 1;
    try {
      const res = await fetch(`/job/${jobId}`);
      if (!res.ok) {
        console.warn("[poll] #" + pollCount + " GET /job/" + jobId + " not ok:", res.status);
        return;
      }
      const data = await res.json();
      if (pollCount <= 2 || pollCount % 5 === 0 || data.status === "done" || data.status === "error") {
        console.log("[poll] #" + pollCount + " status=" + data.status + " progress=" + data.progress);
      }
      if (data.status === "error") {
        clearInterval(t);
        onError(data.error || data.message || "Job failed");
        return;
      }
      onUpdate(data);
      if (data.status === "done") {
        console.log("[poll] Got done after " + pollCount + " polls");
        clearInterval(t);
        onDone();
      }
    } catch (e) {
      console.warn("[poll] #" + pollCount + " fetch error", e);
    }
  }, intervalMs);
  return () => clearInterval(t);
}

tabPdf.addEventListener("click", () => {
  tabPdf.classList.add("active");
  tabText.classList.remove("active");
  sectionPdf.classList.remove("hidden");
  sectionText.classList.add("hidden");
});

tabText.addEventListener("click", () => {
  tabText.classList.add("active");
  tabPdf.classList.remove("active");
  sectionText.classList.remove("hidden");
  sectionPdf.classList.add("hidden");
});

dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropArea.classList.add("dragover");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover");
});

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  dropArea.classList.remove("dragover");
  if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
});

buttonChoose.onclick = () => input.click();

input.addEventListener("change", (e) => {
  if (e.target.files.length > 0) processFile(e.target.files[0]);
});

function processFile(file) {
  if (file.type !== "application/pdf") {
    showError("Please upload a valid PDF file.");
    return;
  }

  buttonChoose.classList.add("hidden");
  actionElements.classList.add("hidden");
  setProgressPdf(true, 0, "Reading PDF...");

  const existingPlayer = sectionPdf.querySelector("#audio-player");
  if (existingPlayer) existingPlayer.remove();
  if (currentAudioUrl) {
    window.URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  fileName = file.name.replace(/\.pdf$/i, "");

  const formData = new FormData();
  formData.append("file", file);
  formData.append("voice", voiceSelect.value);

  console.log("[PDF] Uploading file:", file.name);
  fetch("/upload", { method: "POST", body: formData })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Server error");
      }
      return res.json();
    })
    .then(({ job_id }) => {
      console.log("[PDF] Got job_id:", job_id);
      currentJobId = job_id;
      const audioEl = document.createElement("audio");
      audioEl.id = "audio-player";
      audioEl.controls = true;
      dropArea.appendChild(audioEl);
      audioEl.addEventListener("error", (e) => console.error("[PDF] Audio element error", audioEl.error?.code, audioEl.error?.message || e));
      audioEl.addEventListener("loadstart", () => console.log("[PDF] Audio loadstart"));
      audioEl.addEventListener("loadedmetadata", () => console.log("[PDF] Audio loadedmetadata"));
      audioEl.addEventListener("loadeddata", () => console.log("[PDF] Audio loadeddata"));
      audioEl.addEventListener("canplay", () => console.log("[PDF] Audio canplay"));
      audioEl.addEventListener("canplaythrough", () => console.log("[PDF] Audio canplaythrough"));
      audioEl.addEventListener("playing", () => console.log("[PDF] Audio playing"));
      audioEl.addEventListener("waiting", () => console.log("[PDF] Audio waiting (buffering)"));
      audioEl.addEventListener("stalled", () => console.warn("[PDF] Audio stalled"));
      audioEl.addEventListener("ended", () => console.log("[PDF] Audio ended"));

      const unsubscribe = subscribeStatus(
        job_id,
        (data) => {
          setProgressPdf(true, data.progress, data.message);
          if (data.status === "ready") {
            const url = `/stream-audio/${job_id}`;
            console.log("[PDF] Status ready, setting audio.src to", url);
            audioEl.src = url;
          }
          if (data.status === "done") {
            console.log("[PDF] Status done");
            setProgressPdf(false);
            actionElements.classList.remove("hidden");
            buttonChoose.classList.remove("hidden");
            fetch(`/stream-audio/${job_id}`)
              .then((r) => r.blob())
              .then((blob) => {
                console.log("[PDF] Blob for download received, size:", blob.size);
                currentAudioUrl = window.URL.createObjectURL(blob);
                downloadBtn.onclick = () => {
                  const a = document.createElement("a");
                  a.href = currentAudioUrl;
                  a.download = `${fileName}.mp3`;
                  a.click();
                };
                audioEl.src = currentAudioUrl;
                fetch(`/job/${job_id}`).then((r) => r.json()).then((d) => { if (d.truncated) showError("PDF was very long; only the first part was converted to audio."); });
              })
              .catch((e) => {
                console.error("[PDF] Fetch blob for download failed", e);
              });
            unsubscribe();
          }
        },
        (msg, lastStatus) => {
          if (lastStatus === "generating" || lastStatus === "ready") {
            console.log("[PDF] SSE dropped while streaming, polling for done");
            pollJobUntilDone(
              job_id,
              (data) => setProgressPdf(true, data.progress, data.message),
              () => {
                setProgressPdf(false);
                actionElements.classList.remove("hidden");
                buttonChoose.classList.remove("hidden");
                fetch(`/stream-audio/${job_id}`)
                  .then((r) => r.blob())
                  .then((blob) => {
                    currentAudioUrl = window.URL.createObjectURL(blob);
                    downloadBtn.onclick = () => {
                      const a = document.createElement("a");
                      a.href = currentAudioUrl;
                      a.download = `${fileName}.mp3`;
                      a.click();
                    };
                    audioEl.src = currentAudioUrl;
                    fetch(`/job/${job_id}`).then((r) => r.json()).then((d) => { if (d.truncated) showError("PDF was very long; only the first part was converted to audio."); });
                  })
                  .catch((e) => console.error("[PDF] Fetch blob failed", e));
              },
              (errMsg) => {
                setProgressPdf(false);
                buttonChoose.classList.remove("hidden");
                showError(errMsg);
                const p = sectionPdf.querySelector("#audio-player");
                if (p) p.remove();
              }
            );
            return;
          }
          console.error("[PDF] SSE/flow error:", msg);
          setProgressPdf(false);
          buttonChoose.classList.remove("hidden");
          showError(msg);
          const p = sectionPdf.querySelector("#audio-player");
          if (p) p.remove();
        }
      );
    })
    .catch((err) => {
      console.error("[PDF] Upload or parse failed", err);
      setProgressPdf(false);
      buttonChoose.classList.remove("hidden");
      showError(err.message);
    });
}

btnSubmitText.onclick = () => {
  const text = textInput.value.trim();
  if (!text) {
    showError("Please enter some text to convert.");
    return;
  }

  textActions.classList.add("hidden");
  actionText.classList.add("hidden");
  setProgressText(true, 50, "Preparing...");

  const existingPlayer = sectionText.querySelector("#audio-player-text");
  if (existingPlayer) existingPlayer.remove();

  const formData = new FormData();
  formData.append("text", text);
  formData.append("voice", voiceSelect.value);

  fetch("/upload-text", { method: "POST", body: formData })
    .then(async (res) => {
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Server error");
      }
      return res.json();
    })
    .then(({ job_id }) => {
      console.log("[Text] Got job_id:", job_id);
      const audioEl = document.createElement("audio");
      audioEl.id = "audio-player-text";
      audioEl.controls = true;
      textDropBox.appendChild(audioEl);
      audioEl.addEventListener("error", (e) => console.error("[Text] Audio element error", audioEl.error?.code, audioEl.error?.message || e));
      audioEl.addEventListener("loadstart", () => console.log("[Text] Audio loadstart"));
      audioEl.addEventListener("canplay", () => console.log("[Text] Audio canplay"));
      audioEl.addEventListener("playing", () => console.log("[Text] Audio playing"));
      audioEl.addEventListener("waiting", () => console.log("[Text] Audio waiting"));
      audioEl.addEventListener("ended", () => console.log("[Text] Audio ended"));

      const unsubscribe = subscribeStatus(
        job_id,
        (data) => {
          setProgressText(true, data.progress, data.message);
          if (data.status === "ready") {
            console.log("[Text] Status ready, setting audio.src to /stream-audio/" + job_id);
            audioEl.src = `/stream-audio/${job_id}`;
          }
          if (data.status === "done") {
            setProgressText(false);
            actionText.classList.remove("hidden");
            textActions.classList.remove("hidden");
            fetch(`/stream-audio/${job_id}`)
              .then((r) => r.blob())
              .then((blob) => {
                const url = window.URL.createObjectURL(blob);
                downloadBtnText.onclick = () => {
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "voiceify-audio.mp3";
                  a.click();
                };
                audioEl.src = url;
              })
              .catch(() => {});
            unsubscribe();
          }
        },
        (msg, lastStatus) => {
          if (lastStatus === "generating" || lastStatus === "ready") {
            pollJobUntilDone(
              job_id,
              (data) => setProgressText(true, data.progress, data.message),
              () => {
                setProgressText(false);
                actionText.classList.remove("hidden");
                textActions.classList.remove("hidden");
                fetch(`/stream-audio/${job_id}`)
                  .then((r) => r.blob())
                  .then((blob) => {
                    const url = window.URL.createObjectURL(blob);
                    downloadBtnText.onclick = () => {
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "voiceify-audio.mp3";
                      a.click();
                    };
                    audioEl.src = url;
                  })
                  .catch(() => {});
              },
              (errMsg) => {
                setProgressText(false);
                textActions.classList.remove("hidden");
                showError(errMsg);
                const p = sectionText.querySelector("#audio-player-text");
                if (p) p.remove();
              }
            );
            return;
          }
          setProgressText(false);
          textActions.classList.remove("hidden");
          showError(msg);
          const p = sectionText.querySelector("#audio-player-text");
          if (p) p.remove();
        }
      );
    })
    .catch((err) => {
      setProgressText(false);
      textActions.classList.remove("hidden");
      showError(err.message);
      console.error(err);
    });
};
