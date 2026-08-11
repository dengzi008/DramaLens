let mediaRecorder = null;
let mediaStream = null;
let audioContext = null;
let chunks = [];
let outputFilename = null;
let analyser = null;
let levelTimer = null;
let rmsTotal = 0;
let rmsSamples = 0;
let peakRms = 0;

async function reportError(error) {
  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_RECORDING_ERROR",
    error: error?.message || String(error) || "录音失败。"
  });
}

async function startRecording(streamId, filename) {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    throw new Error("离屏录音器已在运行。");
  }

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  // tabCapture 会让标签页本身静音；重新连接到扬声器，保持用户正常听剧。
  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(audioContext.destination);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  rmsTotal = 0;
  rmsSamples = 0;
  peakRms = 0;
  const levelData = new Float32Array(analyser.fftSize);
  levelTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(levelData);
    let sumSquares = 0;
    for (const sample of levelData) sumSquares += sample * sample;
    const rms = Math.sqrt(sumSquares / levelData.length);
    rmsTotal += rms;
    rmsSamples += 1;
    peakRms = Math.max(peakRms, rms);
  }, 250);

  const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "audio/webm";
  mediaRecorder = new MediaRecorder(mediaStream, { mimeType: preferredType, audioBitsPerSecond: 64000 });
  chunks = [];
  outputFilename = filename;
  mediaRecorder.addEventListener("dataavailable", event => {
    if (event.data?.size) chunks.push(event.data);
  });
  mediaRecorder.start(1000);
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") {
    throw new Error("离屏录音器没有正在进行的录音。");
  }

  const recorder = mediaRecorder;
  await new Promise((resolve, reject) => {
    recorder.addEventListener("stop", resolve, { once: true });
    recorder.addEventListener("error", event => reject(event.error || new Error("MediaRecorder error")), { once: true });
    recorder.stop();
  });

  const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
  if (blob.size === 0) throw new Error("录音文件为空，请确认视频正在播放。 ");
  const savedFilename = outputFilename;
  const audioStats = {
    averageRms: rmsSamples ? Math.round((rmsTotal / rmsSamples) * 100000) / 100000 : 0,
    peakRms: Math.round(peakRms * 100000) / 100000,
    samples: rmsSamples
  };
  const url = URL.createObjectURL(blob);

  try {
    const download = await chrome.runtime.sendMessage({
      type: "OFFSCREEN_DOWNLOAD_REQUEST",
      url,
      filename: savedFilename,
      size: blob.size
    });
    if (!download?.ok) throw new Error(download?.error || "后台下载失败。");

    await chrome.runtime.sendMessage({
      type: "OFFSCREEN_RECORDING_SAVED",
      filename: savedFilename,
      size: blob.size,
      downloadId: download.downloadId,
      audioUrl: url,
      audioStats
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    mediaStream?.getTracks().forEach(track => track.stop());
    clearInterval(levelTimer);
    await audioContext?.close();
    mediaRecorder = null;
    mediaStream = null;
    audioContext = null;
    analyser = null;
    levelTimer = null;
    chunks = [];
    outputFilename = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return;
  (async () => {
    try {
      if (message.type === "OFFSCREEN_RECORDING_START") await startRecording(message.streamId, message.filename);
      if (message.type === "OFFSCREEN_RECORDING_STOP") await stopRecording();
      sendResponse({ ok: true });
    } catch (error) {
      await reportError(error);
      sendResponse({ ok: false, error: error.message || "录音失败。" });
    }
  })();
  return true;
});
