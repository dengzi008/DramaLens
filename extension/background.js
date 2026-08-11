const OFFSCREEN_URL = "offscreen.html";
const ANALYSIS_SCHEMA_VERSION = "0.7.2-speaker-v1";

const defaultRecordingState = {
  status: "idle",
  startedAt: null,
  tabId: null,
  title: null,
  lastFile: null,
  lastAudioStats: null,
  error: null
};

const defaultTranscriptionState = {
  status: "idle",
  filename: null,
  text: "",
  segments: [],
  error: null
};

const defaultAnalysisJobState = {
  status: "idle",
  report: null,
  fingerprint: null,
  error: null
};

const defaultProjectState = {
  title: "",
  episodes: [],
  seriesReports: {},
  updatedAt: null
};

const defaultSeriesJobState = {
  status: "idle",
  scope: null,
  report: null,
  error: null
};

async function readState() {
  const data = await chrome.storage.session.get("recordingState");
  return { ...defaultRecordingState, ...(data.recordingState || {}) };
}

async function writeState(patch) {
  const state = { ...(await readState()), ...patch };
  await chrome.storage.session.set({ recordingState: state });
  return state;
}

async function readTranscriptionState() {
  const data = await chrome.storage.local.get("transcriptionState");
  return { ...defaultTranscriptionState, ...(data.transcriptionState || {}) };
}

async function writeTranscriptionState(patch) {
  const state = { ...(await readTranscriptionState()), ...patch };
  await chrome.storage.local.set({ transcriptionState: state });
  return state;
}

async function readAnalysisJobState() {
  const data = await chrome.storage.local.get("analysisJobState");
  return { ...defaultAnalysisJobState, ...(data.analysisJobState || {}) };
}

async function writeAnalysisJobState(patch) {
  const state = { ...(await readAnalysisJobState()), ...patch };
  await chrome.storage.local.set({ analysisJobState: state });
  return state;
}

async function readProjectState() {
  const data = await chrome.storage.local.get("projectState");
  return { ...defaultProjectState, ...(data.projectState || {}) };
}

async function writeProjectState(project) {
  const state = { ...defaultProjectState, ...project, updatedAt: Date.now() };
  await chrome.storage.local.set({ projectState: state });
  return state;
}

async function readSeriesJobState() {
  const data = await chrome.storage.local.get("seriesJobState");
  return { ...defaultSeriesJobState, ...(data.seriesJobState || {}) };
}

async function writeSeriesJobState(patch) {
  const state = { ...(await readSeriesJobState()), ...patch };
  await chrome.storage.local.set({ seriesJobState: state });
  return state;
}

function episodeNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

async function saveEpisodeToProject(payload) {
  const project = await readProjectState();
  const episode = {
    episode: payload.episode,
    filename: payload.filename || "",
    segments: payload.segments || [],
    analysis: payload.analysis || null,
    updatedAt: Date.now()
  };
  const episodes = [...project.episodes];
  const index = episodes.findIndex(item => String(item.episode) === String(episode.episode));
  if (index >= 0) episodes[index] = episode;
  else episodes.push(episode);
  episodes.sort((a, b) => episodeNumber(a.episode) - episodeNumber(b.episode));
  return writeProjectState({
    ...project,
    title: payload.title || project.title,
    episodes,
    seriesReports: {}
  });
}

async function runSeriesAnalysis(scope) {
  const project = await readProjectState();
  const limit = scope === "前10集" ? 10 : scope === "前30集" ? 30 : project.episodes.length;
  const episodes = project.episodes.slice(0, limit);
  if (!episodes.length) throw new Error("项目中还没有保存任何集数。")
  await writeSeriesJobState({ status: "processing", scope, report: null, error: null });
  try {
    const response = await fetch("http://127.0.0.1:3211/api/analyze-series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: project.title, scope, episodes })
    });
    const report = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(report.error || `整体分析服务返回 ${response.status}`);
    const latest = await readProjectState();
    latest.seriesReports = { ...(latest.seriesReports || {}), [scope]: report };
    await writeProjectState(latest);
    return writeSeriesJobState({ status: "complete", scope, report, error: null });
  } catch (error) {
    return writeSeriesJobState({ status: "error", scope, error: error.message || "整体分析失败。" });
  }
}

async function clearAnalysisState() {
  await chrome.storage.local.remove("analysisState");
  await chrome.storage.local.set({ analysisJobState: defaultAnalysisJobState });
}

async function fingerprint(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToArrayBuffer(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function transcribeAudio(audio, filename) {
  const response = await fetch("http://127.0.0.1:3211/api/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "audio/webm",
      "X-Audio-Filename": encodeURIComponent(filename)
    },
    body: audio
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `ASR服务返回 ${response.status}`);
  if (!Array.isArray(result.segments) || result.segments.length === 0) throw new Error("没有识别出有效台词。");
  return writeTranscriptionState({
    status: "complete",
    filename,
    text: result.text || "",
    segments: result.segments,
    error: null
  });
}

async function transcribeRecording(audioUrl, filename) {
  await clearAnalysisState();
  await writeTranscriptionState({
    status: "processing",
    filename,
    text: "",
    segments: [],
    error: null
  });

  try {
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) throw new Error("无法读取刚刚录制的音频。");
    const audio = await audioResponse.arrayBuffer();
    return transcribeAudio(audio, filename);
  } catch (error) {
    const message = error instanceof TypeError
      ? "无法连接本地ASR服务，请先运行 start-asr.cmd。"
      : (error.message || "语音识别失败。");
    return writeTranscriptionState({ status: "error", filename, error: message });
  }
}

async function importRecording(message) {
  await clearAnalysisState();
  await writeTranscriptionState({ status: "processing", filename: message.filename, text: "", segments: [], error: null });
  try {
    return await transcribeAudio(base64ToArrayBuffer(message.audioBase64), message.filename);
  } catch (error) {
    return writeTranscriptionState({ status: "error", filename: message.filename, error: error.message || "已有录音识别失败。" });
  }
}

async function runAnalysis(payload, payloadFingerprint) {
  try {
    const response = await fetch("http://127.0.0.1:3211/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const report = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(report.error || `AI服务返回 ${response.status}`);
    const transcription = await readTranscriptionState();
    const correctedById = new Map((report.corrected_segments || []).map(item => [String(item.id), item]));
    const segmentsWithSpeakers = (transcription.segments || []).map((segment, index) => {
      const correction = correctedById.get(String(segment.id))
        || ((report.corrected_segments || []).length === (transcription.segments || []).length
          ? report.corrected_segments[index]
          : null);
      return {
        ...segment,
        speaker: correction?.speaker?.trim() || segment.speaker || "待确认"
      };
    });
    if (segmentsWithSpeakers.length) {
      await writeTranscriptionState({ ...transcription, segments: segmentsWithSpeakers });
    }
    await chrome.storage.local.set({
      analysisState: report,
      projectMeta: { title: payload.title, episode: payload.episode }
    });
    return writeAnalysisJobState({ status: "complete", report, fingerprint: payloadFingerprint, error: null });
  } catch (error) {
    return writeAnalysisJobState({ status: "error", error: error.message || "AI拆解失败。" });
  }
}

async function startAnalysis(payload, force = false) {
  const current = await readAnalysisJobState();
  if (current.status === "processing") return { accepted: false, reason: "processing", state: current };
  const payloadFingerprint = await fingerprint({ schema: ANALYSIS_SCHEMA_VERSION, payload });
  if (!force && current.status === "complete" && current.fingerprint === payloadFingerprint && current.report) {
    return { accepted: false, reason: "cached", state: current };
  }
  const state = await writeAnalysisJobState({ status: "processing", report: force ? current.report : null, fingerprint: payloadFingerprint, error: null });
  const completedState = await runAnalysis(payload, payloadFingerprint);
  return { accepted: true, state: completedState || state };
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)]
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA"],
    justification: "Record audio from the user-selected active tab"
  });
}

function safeFileStem(value) {
  return String(value || "short-drama")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "short-drama";
}

async function startRecording(message) {
  const existing = await readState();
  if (["starting", "recording", "stopping"].includes(existing.status)) {
    throw new Error("已有录音任务正在进行。");
  }

  const startedAt = Date.now();
  await writeState({
    status: "starting",
    startedAt,
    tabId: message.tabId,
    title: message.title,
    error: null
  });

  await ensureOffscreen();
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: message.tabId });
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "OFFSCREEN_RECORDING_START",
    streamId,
    filename: `${safeFileStem(message.title)}-${new Date(startedAt).toISOString().replace(/[:.]/g, "-")}.webm`
  });
  if (!response?.ok) throw new Error(response?.error || "离屏录音启动失败。");
  return writeState({ status: "recording" });
}

async function stopRecording() {
  const existing = await readState();
  if (existing.status !== "recording") throw new Error("当前没有正在进行的录音。");
  await writeState({ status: "stopping" });
  const response = await chrome.runtime.sendMessage({ target: "offscreen", type: "OFFSCREEN_RECORDING_STOP" });
  if (!response?.ok) throw new Error(response?.error || "停止录音失败。");
  return readState();
}

async function fetchDesktopRecordingState() {
  const response = await fetch("http://127.0.0.1:3211/api/desktop-recording/status");
  const state = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(state.error || `桌面录音服务返回 ${response.status}`);
  return state;
}

async function startDesktopRecording(message) {
  const tabState = await readState();
  if (["starting", "recording", "stopping"].includes(tabState.status)) {
    throw new Error("标签页录音正在进行，请先停止。")
  }
  await clearAnalysisState();
  await writeTranscriptionState({ status: "idle", filename: null, text: "", segments: [], error: null });
  const response = await fetch("http://127.0.0.1:3211/api/desktop-recording/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: message.title || "桌面短剧" })
  });
  const state = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(state.error || `桌面录音服务返回 ${response.status}`);
  return state;
}

async function stopDesktopRecording() {
  await writeTranscriptionState({ status: "processing", filename: null, text: "", segments: [], error: null });
  try {
    const response = await fetch("http://127.0.0.1:3211/api/desktop-recording/stop", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `桌面录音服务返回 ${response.status}`);
    const transcriptionState = await writeTranscriptionState({
      status: "complete",
      filename: result.filename || "desktop-recording.wav",
      text: result.text || "",
      segments: result.segments || [],
      error: null
    });
    return { state: await fetchDesktopRecordingState(), transcriptionState };
  } catch (error) {
    await writeTranscriptionState({ status: "error", error: error.message || "桌面录音识别失败。" });
    throw error;
  }
}

async function cancelDesktopRecording() {
  const response = await fetch("http://127.0.0.1:3211/api/desktop-recording/cancel", { method: "POST" });
  const state = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(state.error || `桌面录音服务返回 ${response.status}`);
  return state;
}

chrome.runtime.onInstalled.addListener(async () => {
  const session = await chrome.storage.session.get("recordingState");
  const local = await chrome.storage.local.get("transcriptionState");
  if (!session.recordingState) await chrome.storage.session.set({ recordingState: defaultRecordingState });
  if (!local.transcriptionState) await chrome.storage.local.set({ transcriptionState: defaultTranscriptionState });
  const analysis = await chrome.storage.local.get("analysisJobState");
  if (!analysis.analysisJobState) await chrome.storage.local.set({ analysisJobState: defaultAnalysisJobState });
  const project = await chrome.storage.local.get(["projectState", "seriesJobState"]);
  if (!project.projectState) await chrome.storage.local.set({ projectState: defaultProjectState });
  if (!project.seriesJobState) await chrome.storage.local.set({ seriesJobState: defaultSeriesJobState });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === "offscreen") return;

  (async () => {
    try {
      if (message.type === "RECORDING_GET_STATE") {
        sendResponse({ ok: true, state: await readState() });
        return;
      }
      if (message.type === "DESKTOP_RECORDING_GET_STATE") {
        sendResponse({ ok: true, state: await fetchDesktopRecordingState() });
        return;
      }
      if (message.type === "DESKTOP_RECORDING_START") {
        sendResponse({ ok: true, state: await startDesktopRecording(message) });
        return;
      }
      if (message.type === "DESKTOP_RECORDING_STOP") {
        const result = await stopDesktopRecording();
        sendResponse({ ok: true, ...result });
        return;
      }
      if (message.type === "DESKTOP_RECORDING_CANCEL") {
        sendResponse({ ok: true, state: await cancelDesktopRecording() });
        return;
      }
      if (message.type === "TRANSCRIPTION_GET_STATE") {
        sendResponse({ ok: true, state: await readTranscriptionState() });
        return;
      }
      if (message.type === "ANALYSIS_GET_STATE") {
        sendResponse({ ok: true, state: await readAnalysisJobState() });
        return;
      }
      if (message.type === "PROJECT_GET_STATE") {
        sendResponse({ ok: true, state: await readProjectState(), seriesJob: await readSeriesJobState() });
        return;
      }
      if (message.type === "PROJECT_SAVE_EPISODE") {
        sendResponse({ ok: true, state: await saveEpisodeToProject(message.payload) });
        return;
      }
      if (message.type === "PROJECT_DELETE_EPISODE") {
        const project = await readProjectState();
        project.episodes = project.episodes.filter(item => String(item.episode) !== String(message.episode));
        project.seriesReports = {};
        sendResponse({ ok: true, state: await writeProjectState(project) });
        return;
      }
      if (message.type === "SERIES_ANALYSIS_START") {
        const current = await readSeriesJobState();
        if (current.status === "processing") {
          sendResponse({ ok: true, accepted: false, state: current });
          return;
        }
        const project = await readProjectState();
        const cachedReport = project.seriesReports?.[message.scope || "全部"];
        if (cachedReport) {
          sendResponse({ ok: true, accepted: false, cached: true, state: { status: "complete", scope: message.scope || "全部", report: cachedReport, error: null } });
          return;
        }
        const state = await runSeriesAnalysis(message.scope || "全部");
        sendResponse({ ok: true, accepted: true, state });
        return;
      }
      if (message.type === "TRANSCRIPTION_IMPORT_START") {
        const existing = await readTranscriptionState();
        if (existing.status === "processing") throw new Error("已有识别任务正在进行。请等待完成。");
        const state = await importRecording(message);
        sendResponse({ ok: true, accepted: true, state });
        return;
      }
      if (message.type === "ANALYSIS_START") {
        const result = await startAnalysis(message.payload, Boolean(message.force));
        sendResponse({ ok: true, ...result });
        return;
      }
      if (message.type === "RECORDING_START") {
        sendResponse({ ok: true, state: await startRecording(message) });
        return;
      }
      if (message.type === "RECORDING_STOP") {
        sendResponse({ ok: true, state: await stopRecording() });
        return;
      }
      if (message.type === "OFFSCREEN_DOWNLOAD_REQUEST") {
        const downloadId = await chrome.downloads.download({
          url: message.url,
          filename: message.filename,
          saveAs: false
        });
        sendResponse({ ok: true, downloadId });
        return;
      }
      if (message.type === "OFFSCREEN_RECORDING_SAVED") {
        const recordingState = await writeState({
          status: "idle",
          startedAt: null,
          tabId: null,
          title: null,
          lastFile: message.filename,
          lastAudioStats: message.audioStats || null,
          error: null
        });
        const transcriptionState = await transcribeRecording(message.audioUrl, message.filename);
        sendResponse({ ok: true, state: recordingState, transcriptionState });
        return;
      }
      if (message.type === "OFFSCREEN_RECORDING_ERROR") {
        sendResponse({ ok: true, state: await writeState({
          status: "error",
          startedAt: null,
          tabId: null,
          error: message.error || "录音失败。"
        }) });
        return;
      }
    } catch (error) {
      const messageText = error.message || "操作失败。";
      if (["RECORDING_START", "RECORDING_STOP"].includes(message.type)) {
        const state = await writeState({ status: "error", error: messageText });
        sendResponse({ ok: false, error: state.error, state });
      } else {
        sendResponse({ ok: false, error: messageText });
      }
    }
  })();
  return true;
});
