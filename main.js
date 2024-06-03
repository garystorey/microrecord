import "./style.css";
import { saveAs } from "file-saver";

const primaryServiceUUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const characteristicUUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let recordVideo,
  playVideo,
  toggleRecordingButton,
  downloadVideo,
  openOriginal,
  openFirmware,
  selectVideo,
  selectAudio,
  selectDevice,
  playButton,
  scanButton,
  toggleLogging,
  gameName,
  characterName,
  description,
  jsonData,
  server = null,
  characteristic = null,
  service = null,
  device = null,
  isRecording = false,
  videoIsRecording = false,
  buttonData = [],
  videoData = [],
  mediaRecorder,
  startTime = 0,
  endTime = 0;

async function populateDeviceLists() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    devices.forEach((device, i) => {
      if (device.kind === "videoinput") {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `camera ${i + 1}`;
        selectVideo.add(option);
      }
      if (device.kind === "audioinput") {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `camera ${i + 1}`;
        selectAudio.add(option);
      }
    });
    selectVideo.value = localStorage.getItem("sbmicro-video-src");
    selectAudio.value = localStorage.getItem("sbmicro-audio-src");
  } catch (error) {
    console.error("Error fetching video/audio devices:", error);
    alert(error.message);
  }
}

async function startRecording() {
  toggleRecordingButton.textContent = "Stop";
  localStorage.setItem("sbmicro-video-src", selectVideo.value);
  localStorage.setItem("sbmicro-audio-src", selectAudio.value);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: selectVideo.value },
      audio: { deviceId: selectAudio.value },
    });
    recordVideo.srcObject = stream;
    mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    mediaRecorder.start();
    mediaRecorder.addEventListener("dataavailable", handleDataAvailable);
    startTime = new Date().getTime();
    setTimeout(() => toggleLogging.click(), 250);
  } catch (error) {
    console.error("Error accessing video/audio:", error);
    alert(error.message);
  }
}

function replaceAll(from) {
  let updated = from;
  while (updated.indexOf(" ") > -1) {
    updated = updated.replace(" ", "_");
  }
  return updated;
}

function getBaseFileName() {
  return `${replaceAll(gameName.value) || "replay"}_${
    replaceAll(characterName.value) || "unknown"
  }_${replaceAll(description.value) || "?"}`;
}

async function stopRecording() {
  try {
    if (mediaRecorder) {
      await mediaRecorder.stop();
      endTime = new Date().getTime();
      recordVideo.src = null;
      recordVideo.srcObject = null;
      mediaRecorder = null;

      const lastInput = buttonData.reduce(
        (highest, val) => (val.time > highest ? val.time : highest),
        0
      );
      const firstInput = buttonData.reduce(
        (lowest, val) => (val.time < lowest ? val.time : lowest),
        999999999
      );

      setTimeout(() => {
        toggleLogging.click();
        jsonData = JSON.stringify({
          meta: {
            game: gameName.value || "",
            character: characterName.value || "",
            description: description.value || "",
            startTime,
            firstInput,
            lastInput,
            endTime: endTime - startTime,
          },
          video: getBaseFileName() + ".webm",
          data: buttonData || [],
        });
        toggleRecordingButton.textContent = "Record";
      }, 1);
    }
  } catch (error) {
    console.error("Error occurred while trying to stop media device", error);
    alert(error.message);
  }
}

function handleDownloadVideo(e) {
  try {
    e.preventDefault();
    const videoBlob = new Blob(videoData, { type: "video/webm" });
    saveAs(videoBlob, getBaseFileName() + ".webm");
    const blob = new Blob([jsonData], { type: "application/json" });
    saveAs(blob, getBaseFileName() + ".json");
    videoData = [];
    jsonData = "";
  } catch (error) {
    console.error(
      "Error occurred while trying to create download files",
      error
    );
    alert(error.message);
  }
}

function handlePlayButton(e) {
  e.preventDefault();

  if (videoData.length > 0) {
    const blob = new Blob(videoData, { type: "video/webm" });
    recordVideo.srcObject = null;
    recordVideo.src = "";
    recordVideo.src = window.URL.createObjectURL(blob);
    recordVideo.controls = false;
    recordVideo.play();
  } else {
    console.error("no video data");
    alert("No Video Data");
  }

  // Replay button actions
  for (let i = 0; i < buttonData.length; i++) {
    setTimeout(() => {
      for (var j = 0; j < 12; j++) {
        isButtonPressed(j + 1, buttonData[i].button & (1 << j), false);
      }
    }, buttonData[i].time);
  }
}

function isButtonPressed(button, isPressed, isReplay) {
  const path = `[data-frame="${isReplay ? "2" : "1"}"] [data-id="${button}"]`;
  const el = document.querySelector(path);
  if (el) {
    el.style.borderColor = isPressed ? "orange" : "#666";
    el.style.backgroundColor = isPressed ? "orange" : "transparent";
  }
}

function handleNotifications(event) {
  const value = event.target.value;
  const inputData = new Uint8Array(value.buffer);

  if (inputData[1] == 0x32 && isRecording == true && inputData[3] == 0x31) {
    let res =
      (inputData[8] << 24) |
      (inputData[7] << 16) |
      (inputData[6] << 8) |
      inputData[5];
    // Get the time difference of button press since the start of video recording
    let currentTime = new Date().getTime();
    let timeDiff = currentTime - startTime;
    buttonData.push({
      time: timeDiff,
      button: res,
    });

    for (var i = 0; i < 12; i++) {
      isButtonPressed(i + 1, res & (1 << i), false);
    }
  }
}

async function sendLoggingCommand() {
  try {
    isRecording = !isRecording;
    const command = Uint8Array.of(
      0x24,
      0x32,
      0x02,
      0x01,
      isRecording ? 0x01 : 0x00,
      0x23
    );
    return await characteristic.writeValue(command);
  } catch (error) {
    console.error(
      "Error occurred while trying to sstart/stop micro logging",
      error
    );
    alert(error.message);
  }
}

async function toggleMicroLogging(e) {
  e.preventDefault();
  try {
    await sendLoggingCommand();
  } catch (error) {
    console.error(
      "Error occurred while trying towrite to characteristic",
      error
    );
    alert(error.message);
  }
}
async function toggleRecording(e) {
  e.preventDefault();
  videoIsRecording = !videoIsRecording;
  if (videoIsRecording) {
    await startRecording();
  } else {
    await stopRecording();
  }
}

function handleDataAvailable(event) {
  videoData.push(event.data);
}

async function handleBluetooth() {
  device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [primaryServiceUUID] }],
  });
  const option = document.createElement("option");
  option.text = device.name;
  option.value = device.id;
  selectDevice.add(option);
  server = await device.gatt.connect();
  console.log("Connected to GATT server");
  service = await server.getPrimaryService(primaryServiceUUID);
  characteristic = await service.getCharacteristic(characteristicUUID);
  try {
    await characteristic.startNotifications();
    console.log("Notifications enabled for characteristic");
    characteristic.addEventListener(
      "characteristicvaluechanged",
      handleNotifications
    );
  } catch (err) {
    console.error("Failed to enable notifications for characteristic:", err);
  }
}

function handleOpenOriginal(e) {
  e.preventDefault();
  window.open("original.html");
}
function handleOpenFirmware(e) {
  e.preventDefault();
  window.open("firmware.html");
}

document.addEventListener("DOMContentLoaded", () => {
  recordVideo = document.querySelector("#recordVideo");
  playVideo = document.querySelector("#playVideo");
  toggleRecordingButton = document.querySelector("#toggleRecording");
  downloadVideo = document.querySelector("#downloadVideo");
  selectVideo = document.querySelector("#selectVideo");
  selectAudio = document.querySelector("#selectAudio");
  selectDevice = document.querySelector("#selectDevice");
  playButton = document.querySelector("#play");
  scanButton = document.querySelector("#scan");
  toggleLogging = document.querySelector("#toggleLogging");
  gameName = document.querySelector("#game");
  characterName = document.querySelector("#character");
  description = document.querySelector("#desc");
  openOriginal = document.querySelector("#openOriginal");
  openFirmware = document.querySelector("#openFirmware");

  scanButton.addEventListener("click", handleBluetooth);
  toggleLogging.addEventListener("click", toggleMicroLogging);
  playButton.addEventListener("click", handlePlayButton);
  toggleRecordingButton.addEventListener("click", toggleRecording);
  downloadVideo.addEventListener("click", handleDownloadVideo);
  openOriginal.addEventListener("click", handleOpenOriginal);
  openFirmware.addEventListener("click", handleOpenFirmware);
  populateDeviceLists();
});
