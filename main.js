import "./style.css";
import { saveAs } from "file-saver";

const primaryServiceUUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const characteristicUUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let recordVideo,
  playVideo,
  toggleRecordingButton,
  downloadVideo,
  downloadJson,
  selectVideo,
  selectAudio,
  selectDevice,
  playButton,
  scanButton,
  toggleLogging,
  gameName,
  characterName,
  description,
  videoName,
  jsonData;

let server = null;
let characteristic = null;
let service = null;
let device = null;
let isRecording = false;
let videoIsRecording = false;
let buttonData = [];
let startTime = 0;
let mediaRecorder;
let videoData = [];

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
    setTimeout(() => {
      toggleLogging.click();
    }, 500);
  } catch (error) {
    console.error("Error accessing webcam:", error);
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

function updateVideoName(e) {
  videoName.value = getBaseFileName() + ".webm";
}

async function stopRecording() {
  if (mediaRecorder) {
    await mediaRecorder.stop();

    recordVideo.src = null;
    recordVideo.srcObject = null;

    jsonData = JSON.stringify({
      game: gameName.value || "",
      startTime,
      device: selectDevice.value,
      character: characterName.value || "",
      description: description.value || "",
      video: videoName.value || "",
      buttons: buttonData || [],
    });
    toggleRecordingButton.textContent = "Record";
    mediaRecorder = null;
  }
}

async function handleDownloadJson(e) {
  e.preventDefault();
  const blob = new Blob([jsonData], { type: "application/json" });
  saveAs(blob, getBaseFileName() + ".json");
  // const fileHandle = await window.showSaveFilePicker({
  //   suggestedName: filename + ".json",
  // });
  // const fileStream = await fileHandle.createWritable();
  // await fileStream.write(new Blob([jsonData], { type: "text/plain" }));
  // await fileStream.close();
  // fileHandle = null;
}

function handleDownloadVideo(e) {
  e.preventDefault();
  const videoBlob = new Blob(videoData, { type: "video/webm" });
  saveAs(videoBlob, getBaseFileName() + ".webm");
}

function handlePlayButton(e) {
  e.preventDefault();
  console.log(videoData);

  if (videoData.length > 0) {
    const blob = new Blob(videoData, { type: "video/webm" });
    playVideo.srcObject = null;
    playVideo.src = "";
    playVideo.src = window.URL.createObjectURL(blob);
    playVideo.controls = true;
    playVideo.play();
  } else {
    console.error("no video data");
  }

  // Replay button actions
  for (let i = 0; i < buttonData.length; i++) {
    setTimeout(() => {
      for (var j = 0; j < 12; j++) {
        isButtonPressed(j + 1, buttonData[i].button & (1 << j), true);
      }
    }, buttonData[i].time);
  }
}

async function isButtonPressed(btn_number, setColor, replay) {
  const path = `[data-frame="${replay ? "2" : "1"}"] [data-id="${btn_number}"]`;
  const el = document.querySelector(path);
  if (el) {
    el.style.borderColor = setColor ? "orange" : "white";
    el.style.backgroundColor = setColor ? "orange" : "transparent";
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
  } catch (err) {
    console.error("Failed to write value to characteristic:", err);
  }
}

async function toggleMicroLogging(e) {
  e.preventDefault();
  try {
    await sendLoggingCommand();
  } catch (err) {
    console.error("Failed to write value to characteristic:", err);
  }
}
async function toggleRecording(e) {
  e.preventDefault();
  videoIsRecording = !videoIsRecording;
  if (videoIsRecording) {
    startRecording();
  } else {
    stopRecording();
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
  videoName = document.querySelector("#video");
  downloadJson = document.querySelector("#downloadJson");

  scanButton.addEventListener("click", handleBluetooth);
  toggleLogging.addEventListener("click", toggleMicroLogging);
  playButton.addEventListener("click", handlePlayButton);
  toggleRecordingButton.addEventListener("click", toggleRecording);

  downloadVideo.addEventListener("click", handleDownloadVideo);

  downloadJson.addEventListener("click", handleDownloadJson);

  gameName.addEventListener("change", updateVideoName);
  characterName.addEventListener("change", updateVideoName);
  description.addEventListener("change", updateVideoName);

  populateDeviceLists();
});
