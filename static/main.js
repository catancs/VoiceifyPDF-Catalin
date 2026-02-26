const dropArea = document.querySelector(".drop_box"),
  button_choose = dropArea.querySelector("#btn_choose"),
  input = dropArea.querySelector("input"),
  loading = dropArea.querySelector("#loading"),
  action_elements = dropArea.querySelector("#action"),
  download_btn = dropArea.querySelector("#download");

let fileName = null;
let currentAudioUrl = null;

// Drag & Drop functionality
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
  const existingPlayer = document.getElementById("audio-player");
  if (existingPlayer) existingPlayer.remove();

  fileName = file.name.split('.').slice(0, -1).join('.');

  const formData = new FormData();
  formData.append("file", file);

  // Use relative URL so it works on any domain/network
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