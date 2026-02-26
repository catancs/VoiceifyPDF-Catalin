// Tab elements
const tabPdf = document.getElementById('tab_pdf');
const tabText = document.getElementById('tab_text');
const sectionPdf = document.getElementById('section_pdf');
const sectionText = document.getElementById('section_text');

// PDF elements
const dropArea = sectionPdf.querySelector(".drop_box"),
  voiceSelect = dropArea.querySelector("#voice_select"),
  button_choose = dropArea.querySelector("#btn_choose"),
  input = dropArea.querySelector("input"),
  loading = dropArea.querySelector("#loading"),
  action_elements = dropArea.querySelector("#action"),
  download_btn = dropArea.querySelector("#download");

// Text elements
const textDropBox = sectionText.querySelector(".text_drop_box"),
  textInput = document.getElementById("text_input"),
  btnSubmitText = document.getElementById("btn_submit_text"),
  loadingText = document.getElementById("loading_text"),
  actionText = document.getElementById("action_text"),
  downloadBtnText = document.getElementById("download_text"),
  textActions = sectionText.querySelector(".text_actions");

let fileName = null;
let currentAudioUrl = null;

// Tab logic
tabPdf.addEventListener('click', () => {
  tabPdf.classList.add('active');
  tabText.classList.remove('active');
  sectionPdf.classList.remove('hidden');
  sectionText.classList.add('hidden');
});

tabText.addEventListener('click', () => {
  tabText.classList.add('active');
  tabPdf.classList.remove('active');
  sectionText.classList.remove('hidden');
  sectionPdf.classList.add('hidden');
});

// Drag & Drop functionality for PDF
dropArea.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropArea.classList.add("dragover");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover");
});

dropArea.addEventListener("drop", (event) => {
  event.preventDefault();
  dropArea.classList.remove("dragover");
  if (event.dataTransfer.files.length > 0) {
    processFile(event.dataTransfer.files[0]);
  }
});

button_choose.onclick = () => {
  input.click();
};

input.addEventListener("change", function (e) {
  if (e.target.files.length > 0) {
    processFile(e.target.files[0]);
  }
});

function processFile(file) {
  if (file.type !== "application/pdf") {
    alert("Please upload a valid PDF file.");
    return;
  }

  button_choose.classList.add("hidden");
  action_elements.classList.add("hidden");
  loading.classList.remove("hidden");

  // Remove existing audio player if user uploads a second file
  const existingPlayer = sectionPdf.querySelector("#audio-player");
  if (existingPlayer) existingPlayer.remove();

  fileName = file.name.split('.').slice(0, -1).join('.');

  const formData = new FormData();
  formData.append("file", file);
  formData.append("voice", voiceSelect.value);

  fetch(`/upload`, {
    method: "POST",
    body: formData,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Server error occurred");
      }
      return response.blob();
    })
    .then((blob) => {
      loading.classList.add("hidden");
      action_elements.classList.remove("hidden");

      if (currentAudioUrl) {
        window.URL.revokeObjectURL(currentAudioUrl);
      }
      currentAudioUrl = window.URL.createObjectURL(blob);

      // Setup Download
      download_btn.onclick = () => {
        const link = document.createElement("a");
        link.href = currentAudioUrl;
        link.download = `${fileName}.mp3`;
        link.click();
      };

      // Create a native HTML5 audio player
      const audioElement = document.createElement("audio");
      audioElement.id = "audio-player";
      audioElement.controls = true;
      audioElement.src = currentAudioUrl;
      dropArea.appendChild(audioElement);

    })
    .catch((error) => {
      loading.classList.add("hidden");
      button_choose.classList.remove("hidden");
      alert(`Error: ${error.message}`);
      console.error(error);
    });
}

// Text to Audio Logic
btnSubmitText.onclick = () => {
  const text = textInput.value.trim();
  if (!text) {
    alert("Please enter some text to convert.");
    return;
  }

  textActions.classList.add("hidden");
  actionText.classList.add("hidden");
  loadingText.classList.remove("hidden");

  // Remove existing audio player
  const existingPlayer = sectionText.querySelector("#audio-player-text");
  if (existingPlayer) existingPlayer.remove();

  const formData = new FormData();
  formData.append("text", text);

  fetch(`/upload-text`, {
    method: "POST",
    body: formData,
  })
    .then(async (response) => {
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Server error occurred");
      }
      return response.blob();
    })
    .then((blob) => {
      loadingText.classList.add("hidden");
      actionText.classList.remove("hidden");
      textActions.classList.remove("hidden");

      let audioUrl = window.URL.createObjectURL(blob);

      // Setup Download
      downloadBtnText.onclick = () => {
        const link = document.createElement("a");
        link.href = audioUrl;
        link.download = `voiceify-audio.mp3`;
        link.click();
      };

      // Create a native HTML5 audio player
      const audioElement = document.createElement("audio");
      audioElement.id = "audio-player-text";
      audioElement.controls = true;
      audioElement.src = audioUrl;
      textDropBox.appendChild(audioElement);

    })
    .catch((error) => {
      loadingText.classList.add("hidden");
      textActions.classList.remove("hidden");
      alert(`Error: ${error.message}`);
      console.error(error);
    });
};