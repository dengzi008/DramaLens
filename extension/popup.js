const elements = {
  batchBadge: document.querySelector("#batchBadge")
  ,batchTitle: document.querySelector("#batchTitle")
  ,batchStartEpisode: document.querySelector("#batchStartEpisode")
  ,batchEndEpisode: document.querySelector("#batchEndEpisode")
  ,batchHint: document.querySelector("#batchHint")
  ,batchProgress: document.querySelector("#batchProgress")
  ,batchStartBtn: document.querySelector("#batchStartBtn")
  ,batchNextBtn: document.querySelector("#batchNextBtn")
  ,batchFinishBtn: document.querySelector("#batchFinishBtn")
  ,batchControllerBtn: document.querySelector("#batchControllerBtn")
  ,batchCancelBtn: document.querySelector("#batchCancelBtn")
  ,batchDeleteBtn: document.querySelector("#batchDeleteBtn")
  ,batchAiBtn: document.querySelector("#batchAiBtn")
  ,batchImportBtn: document.querySelector("#batchImportBtn")
  ,batchEpisodeList: document.querySelector("#batchEpisodeList")
  ,recordBadge: document.querySelector("#recordBadge")
  ,recordHint: document.querySelector("#recordHint")
  ,recordStartBtn: document.querySelector("#recordStartBtn")
  ,recordStopBtn: document.querySelector("#recordStopBtn")
  ,desktopRecordBadge: document.querySelector("#desktopRecordBadge")
  ,desktopRecordHint: document.querySelector("#desktopRecordHint")
  ,desktopRecordStartBtn: document.querySelector("#desktopRecordStartBtn")
  ,desktopRecordStopBtn: document.querySelector("#desktopRecordStopBtn")
  ,desktopRecordCancelBtn: document.querySelector("#desktopRecordCancelBtn")
  ,desktopRetranscribeBtn: document.querySelector("#desktopRetranscribeBtn")
  ,transcriptBadge: document.querySelector("#transcriptBadge")
  ,transcriptHint: document.querySelector("#transcriptHint")
  ,transcriptEmpty: document.querySelector("#transcriptEmpty")
  ,transcriptList: document.querySelector("#transcriptList")
  ,transcriptExportBtn: document.querySelector("#transcriptExportBtn")
  ,transcriptSaveBtn: document.querySelector("#transcriptSaveBtn")
  ,audioImportBtn: document.querySelector("#audioImportBtn")
  ,audioImportInput: document.querySelector("#audioImportInput")
  ,projectTitle: document.querySelector("#projectTitle")
  ,projectEpisode: document.querySelector("#projectEpisode")
  ,analysisBadge: document.querySelector("#analysisBadge")
  ,analysisHint: document.querySelector("#analysisHint")
  ,analysisBtn: document.querySelector("#analysisBtn")
  ,analysisRegenerateBtn: document.querySelector("#analysisRegenerateBtn")
  ,applyCorrectionsBtn: document.querySelector("#applyCorrectionsBtn")
  ,docxExportBtn: document.querySelector("#docxExportBtn")
  ,analysisEmpty: document.querySelector("#analysisEmpty")
  ,analysisResult: document.querySelector("#analysisResult")
  ,seriesTitle: document.querySelector("#seriesTitle")
  ,seriesEpisode: document.querySelector("#seriesEpisode")
  ,projectCount: document.querySelector("#projectCount")
  ,projectHint: document.querySelector("#projectHint")
  ,projectEmpty: document.querySelector("#projectEmpty")
  ,projectEpisodeList: document.querySelector("#projectEpisodeList")
  ,projectSaveBtn: document.querySelector("#projectSaveBtn")
  ,seriesScope: document.querySelector("#seriesScope")
  ,seriesAnalysisBtn: document.querySelector("#seriesAnalysisBtn")
  ,seriesExportBtn: document.querySelector("#seriesExportBtn")
  ,seriesReport: document.querySelector("#seriesReport")
  ,advancedTools: document.querySelector(".advanced-tools")
  ,projectPanel: document.querySelector(".project-panel")
};

let latestRecordingState = null;
let latestBatchState = null;
let latestDesktopRecordingState = null;
let latestTranscriptState = null;
let latestAnalysis = null;
let lastAnalysisSignature = "";
let transcriptEditing = false;
let lastTranscriptSignature = "";
let latestProjectState = null;
let latestSeriesReport = null;
let lastProjectSignature = "";

function transcriptSignature(state) {
  return JSON.stringify({
    status: state?.status,
    filename: state?.filename,
    segments: state?.segments || []
  });
}

const batchStatusText = {
  queued: "等待识别",
  transcribing: "识别中",
  transcribed: "已识别",
  error: "识别失败",
  "ai-processing": "AI处理中",
  complete: "AI完成",
  "ai-error": "AI失败"
  ,canceled: "已取消"
};

function renderBatch(state) {
  latestBatchState = state;
  const episodes = state?.episodes || [];
  const recording = state?.status === "recording";
  const busy = ["recording", "pausing", "stopping", "processing"].includes(state?.status);
  const atLastEpisode = recording && state?.endEpisode != null && Number(state.currentEpisode) >= Number(state.endEpisode);
  const expected = state?.endEpisode
    ? Math.max(1, Number(state.endEpisode) - Number(state.startEpisode) + 1)
    : null;
  const recognized = episodes.filter(item => ["transcribed", "ai-processing", "complete", "ai-error"].includes(item.status)).length;
  const aiCompleted = episodes.filter(item => item.status === "complete").length;
  elements.batchStartBtn.disabled = busy;
  elements.batchNextBtn.disabled = !recording || atLastEpisode;
  elements.batchFinishBtn.disabled = !recording;
  elements.batchCancelBtn.disabled = !state?.sessionId || ["idle", "canceled"].includes(state?.status);
  elements.batchDeleteBtn.disabled = !state?.sessionId;
  elements.batchAiBtn.disabled = state?.aiStatus === "processing" || !episodes.some(item => ["transcribed", "ai-error"].includes(item.status));
  elements.batchImportBtn.disabled = busy || state?.aiStatus === "processing" || !episodes.some(item => item.segmentCount);
  elements.batchAiBtn.textContent = state?.aiStatus === "processing" ? "AI处理中…" : aiCompleted === episodes.length && episodes.length ? "AI处理已完成" : "AI校对并生成报告";
  const projectEpisodeNumbers = new Set((latestProjectState?.episodes || []).map(item => episodeNumber(item.episode)));
  const importableEpisodeNumbers = episodes.filter(item => item.segmentCount).map(item => Number(item.episode));
  const allImported = importableEpisodeNumbers.length > 0 && importableEpisodeNumbers.every(number => projectEpisodeNumbers.has(number));
  elements.batchImportBtn.textContent = allImported ? "查看项目与导出" : "保存到项目";
  elements.batchProgress.replaceChildren(...[
    `已采集 ${episodes.length}${expected ? `/${expected}` : ""}集`,
    `识别完成 ${recognized}集`,
    `AI完成 ${aiCompleted}集`
  ].map(text => {
    const item = document.createElement("span");
    item.textContent = text;
    return item;
  }));
  if (recording) {
    elements.batchBadge.textContent = `第${state.currentEpisode}集录制中`;
    elements.batchHint.textContent = atLastEpisode
      ? `当前 ${formatTime(state.currentDuration || 0)}；这是最后一集，完成后点击“完成全部采集”或按F10。`
      : `当前 ${formatTime(state.currentDuration || 0)}；按F8完成本集并立即开始第${Number(state.currentEpisode) + 1}集。`;
  } else if (state?.status === "processing") {
    elements.batchBadge.textContent = "后台识别中";
    elements.batchHint.textContent = "采集已结束，正在按顺序完整识别各集，可以关闭插件。";
  } else if (state?.status === "ready") {
    elements.batchBadge.textContent = aiCompleted && aiCompleted === episodes.length ? "AI处理完成" : "识别完成";
    elements.batchHint.textContent = aiCompleted && aiCompleted === episodes.length
      ? "AI报告已生成，下一步保存到项目。"
      : "下一步可以AI校对并生成报告，也可以跳过AI直接保存到项目。";
  } else if (state?.status === "interrupted" || state?.status === "error") {
    elements.batchBadge.textContent = "任务异常";
    elements.batchHint.textContent = state.error || "请检查失败集并重试。";
  } else if (state?.status === "canceled" || state?.status === "canceling") {
    elements.batchBadge.textContent = state.status === "canceling" ? "正在取消" : "任务已取消";
    elements.batchHint.textContent = "本次任务已停止；可删除记录，或直接开始新的采集任务。";
  } else {
    elements.batchBadge.textContent = "未启动";
  }
  if (state?.title && !elements.batchTitle.value) elements.batchTitle.value = state.title;
  elements.batchEpisodeList.replaceChildren(...(state?.episodes || []).map(item => {
    const row = document.createElement("li");
    const label = document.createElement("strong");
    const status = document.createElement("span");
    const action = document.createElement("button");
    label.textContent = item.label || `第${item.episode}集`;
    status.textContent = `${batchStatusText[item.status] || item.status}${item.segmentCount ? ` · ${item.segmentCount}段` : ""}${item.deduplicated ? ` · 去重${item.deduplicated}` : ""}`;
    action.textContent = "重试";
    action.hidden = !["error", "ai-error"].includes(item.status);
    action.addEventListener("click", () => batchCommand("BATCH_RETRY", { episode: item.episode }));
    row.append(label, status, action);
    return row;
  }));
}

async function batchCommand(type, extra = {}) {
  try {
    if (type === "BATCH_CANCEL" && !confirm("确定取消本次任务吗？等待识别和AI结果将被丢弃，已保存到项目报告的内容不受影响。")) return;
    if (type === "BATCH_DELETE" && !confirm("确定删除本次任务吗？本批采集状态、识别结果和本地音频将被清除，已保存到项目报告的内容不受影响。")) return;
    if (type === "BATCH_IMPORT_PROJECT" && elements.batchImportBtn.textContent === "查看项目与导出") {
      elements.projectPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      elements.projectHint.textContent = "项目已保存，可生成整体分析或导出报告。";
      return;
    }
    let message = { type, ...extra };
    if (type === "BATCH_START") {
      const startEpisode = Number(elements.batchStartEpisode.value || 1);
      const endEpisode = elements.batchEndEpisode.value ? Number(elements.batchEndEpisode.value) : null;
      if (!elements.batchTitle.value.trim()) throw new Error("请先填写剧名。")
      message.payload = { title: elements.batchTitle.value.trim(), startEpisode, endEpisode };
    }
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "批量操作失败。")
    if (type === "BATCH_IMPORT_PROJECT") {
      latestProjectState = response.state;
      renderProject(response.state);
      elements.batchImportBtn.textContent = "查看项目与导出";
      elements.batchHint.textContent = `已保存${response.state.episodes?.length || 0}集到项目，可在下方生成整体分析或导出。`;
      return;
    }
    if (response.state?.episodes) renderBatch(response.state);
  } catch (error) {
    elements.batchHint.textContent = error.message || "批量操作失败。";
  }
}

async function refreshBatch() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "BATCH_GET_STATE" });
    if (response?.ok) renderBatch(response.state);
  } catch (error) {
    elements.batchHint.textContent = "无法连接批量服务，请确认本地服务正在运行。";
  }
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function resolvedSpeaker(manualValue, aiValue) {
  const manual = String(manualValue || "").trim();
  if (manual && manual !== "待确认") return manual;
  return String(aiValue || "").trim() || manual || "待确认";
}

function renderRecording(state) {
  latestRecordingState = state;
  const active = state.status === "recording" || state.status === "starting" || state.status === "stopping";
  elements.recordBadge.classList.toggle("active", active);
  elements.recordStartBtn.disabled = active;
  elements.recordStopBtn.disabled = state.status !== "recording";

  if (state.status === "recording") {
    const elapsed = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
    elements.recordBadge.textContent = `录音中 ${formatTime(elapsed)}`;
    elements.recordHint.textContent = "正在采集当前标签页音频。关闭弹窗不会中断录音。";
  } else if (state.status === "starting") {
    elements.recordBadge.textContent = "正在启动";
    elements.recordHint.textContent = "正在请求当前标签页音频流。";
  } else if (state.status === "stopping") {
    elements.recordBadge.textContent = "正在保存";
    elements.recordHint.textContent = "正在生成并保存 WebM 音频文件。";
  } else if (state.status === "error") {
    elements.recordBadge.textContent = "录音失败";
    elements.recordHint.textContent = state.error || "无法捕获当前标签页音频。";
  } else if (state.lastFile) {
    elements.recordBadge.textContent = "已保存";
    const peak = state.lastAudioStats?.peakRms;
    const level = Number.isFinite(peak) ? `；音量峰值 ${peak}` : "";
    elements.recordHint.textContent = `最近文件：${state.lastFile}${level}`;
  } else {
    elements.recordBadge.textContent = "未录制";
    elements.recordHint.textContent = "录制当前标签页声音，停止后自动保存 WebM 音频。";
  }
}

async function recordingCommand(type) {
  try {
    const tab = await currentTab();
    if (!tab?.id || !tab.url?.startsWith("https://hongguoduanju.com/player/")) {
      throw new Error("请先打开红果正片播放器页面。");
    }
    const response = await chrome.runtime.sendMessage({ type, tabId: tab.id, title: tab.title || "short-drama" });
    if (!response?.ok) throw new Error(response?.error || "录音操作失败。");
    renderRecording(response.state);
  } catch (error) {
    renderRecording({ status: "error", error: error.message || "录音操作失败。" });
  }
}

async function refreshRecording() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "RECORDING_GET_STATE" });
    if (response?.ok) renderRecording(response.state);
  } catch (_error) {
    renderRecording(latestRecordingState || { status: "idle" });
  }
}

function renderDesktopRecording(state) {
  latestDesktopRecordingState = state;
  const active = ["starting", "recording", "stopping", "processing"].includes(state?.status);
  elements.desktopRecordBadge.classList.toggle("active", active);
  elements.desktopRecordStartBtn.disabled = active;
  elements.desktopRecordStopBtn.disabled = !["starting", "recording"].includes(state?.status);
  elements.desktopRecordCancelBtn.disabled = !["starting", "recording", "stopping"].includes(state?.status);
  elements.desktopRetranscribeBtn.disabled = active || !state?.canRetranscribe;
  if (state?.status === "starting") {
    elements.desktopRecordBadge.textContent = "正在启动";
    elements.desktopRecordHint.textContent = "正在连接 Windows 默认扬声器。";
  } else if (state?.status === "recording") {
    elements.desktopRecordBadge.textContent = `录音中 ${formatTime(state.duration || 0)}`;
    elements.desktopRecordHint.textContent = "正在录制系统播放声音，可以关闭插件弹窗。";
  } else if (state?.status === "stopping" || state?.status === "processing") {
    elements.desktopRecordBadge.textContent = "识别中";
    elements.desktopRecordHint.textContent = "录音已停止，正在使用本地模型生成时间轴。";
  } else if (state?.status === "error") {
    elements.desktopRecordBadge.textContent = "录音失败";
    elements.desktopRecordHint.textContent = state.error || "桌面音频录制失败。";
  } else if (state?.status === "complete") {
    elements.desktopRecordBadge.textContent = "已完成";
    elements.desktopRecordHint.textContent = "桌面录音已完成；默认使用完整识别，如有漏句可重新完整识别。";
  } else {
    elements.desktopRecordBadge.textContent = "未录制";
    elements.desktopRecordHint.textContent = "录制 Windows 正在播放的声音，适用于红果短剧 App。";
  }
}

async function desktopRecordingCommand(type) {
  try {
    const response = await chrome.runtime.sendMessage({
      type,
      title: elements.projectTitle.value.trim() || elements.seriesTitle.value.trim() || "桌面短剧"
    });
    if (!response?.ok) throw new Error(response?.error || "桌面录音操作失败。");
    renderDesktopRecording(response.state);
    if (response.transcriptionState) renderTranscript(response.transcriptionState);
  } catch (error) {
    renderDesktopRecording({ status: "error", error: error.message || "桌面录音操作失败。" });
  }
}

async function refreshDesktopRecording() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "DESKTOP_RECORDING_GET_STATE" });
    if (response?.ok) renderDesktopRecording(response.state);
  } catch (_error) {
    renderDesktopRecording(latestDesktopRecordingState || { status: "idle" });
  }
}

function renderTranscript(state) {
  latestTranscriptState = state;
  lastTranscriptSignature = transcriptSignature(state);
  const segments = state.segments || [];
  elements.transcriptExportBtn.disabled = segments.length === 0;
  elements.transcriptEmpty.hidden = segments.length > 0;
  elements.transcriptList.replaceChildren(...segments.slice(0, 100).map((segment, index) => {
    const item = document.createElement("li");
    const time = document.createElement("span");
    const speaker = document.createElement("input");
    const text = document.createElement("textarea");
    const actions = document.createElement("span");
    const merge = document.createElement("button");
    const remove = document.createElement("button");
    time.className = "cue-time";
    time.textContent = formatTime(segment.start);
    speaker.className = "speaker-input";
    speaker.value = segment.speaker || "";
    speaker.placeholder = "角色";
    speaker.title = "AI推断仅供参考，请人工核对角色";
    speaker.addEventListener("input", () => {
      transcriptEditing = true;
      segment.speaker = speaker.value;
    });
    text.value = segment.text;
    text.dataset.id = String(segment.id);
    text.addEventListener("input", () => {
      transcriptEditing = true;
      segment.text = text.value;
    });
    actions.className = "segment-actions";
    merge.className = "icon-button merge-button";
    merge.textContent = "并";
    merge.title = "与上一段合并";
    merge.disabled = index === 0;
    merge.addEventListener("click", () => {
      if (index === 0) return;
      const previous = latestTranscriptState.segments[index - 1];
      previous.end = segment.end;
      previous.text = `${previous.text}${segment.text}`;
      latestTranscriptState.segments.splice(index, 1);
      transcriptEditing = true;
      renderTranscript(latestTranscriptState);
      transcriptEditing = true;
    });
    remove.className = "icon-button";
    remove.textContent = "×";
    remove.title = "删除这一段";
    remove.addEventListener("click", () => {
      transcriptEditing = true;
      latestTranscriptState.segments = latestTranscriptState.segments.filter(item => item !== segment);
      renderTranscript(latestTranscriptState);
      transcriptEditing = true;
    });
    actions.append(merge, remove);
    item.append(time, speaker, text, actions);
    return item;
  }));

  if (state.status === "processing") {
    elements.transcriptBadge.textContent = "识别中";
    elements.transcriptHint.textContent = "正在上传音频并生成时间轴，请保持本地ASR服务运行。";
  } else if (state.status === "complete") {
    elements.transcriptBadge.textContent = `${segments.length} 段`;
    elements.transcriptHint.textContent = state.filename ? `已完成：${state.filename}` : "语音识别已完成。";
  } else if (state.status === "error") {
    elements.transcriptBadge.textContent = "识别失败";
    elements.transcriptHint.textContent = state.error || "请检查本地ASR服务和API配置。";
  } else {
    elements.transcriptBadge.textContent = "等待录音";
    elements.transcriptHint.textContent = "停止录音后会自动发送给本地ASR服务。";
  }
}

async function refreshTranscript() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "TRANSCRIPTION_GET_STATE" });
    if (response?.ok && !transcriptEditing && transcriptSignature(response.state) !== lastTranscriptSignature) {
      renderTranscript(response.state);
    }
  } catch (_error) {
    renderTranscript(latestTranscriptState || { status: "idle", segments: [] });
  }
}

async function saveTranscript() {
  if (!latestTranscriptState) return;
  latestTranscriptState.text = (latestTranscriptState.segments || []).map(item => item.text.trim()).filter(Boolean).join("");
  await chrome.storage.local.set({ transcriptionState: latestTranscriptState });
  lastTranscriptSignature = transcriptSignature(latestTranscriptState);
  transcriptEditing = false;
  elements.transcriptHint.textContent = "人工修改已保存。";
}

function analysisSection(title, content) {
  const wrapper = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  wrapper.append(heading);
  if (Array.isArray(content)) {
    const list = document.createElement("ul");
    content.forEach(value => {
      const item = document.createElement("li");
      item.textContent = typeof value === "string" ? value : JSON.stringify(value);
      list.append(item);
    });
    wrapper.append(list);
  } else {
    const paragraph = document.createElement("p");
    paragraph.textContent = content || "暂无";
    wrapper.append(paragraph);
  }
  return wrapper;
}

function renderAnalysis(analysis) {
  latestAnalysis = analysis;
  lastAnalysisSignature = JSON.stringify(analysis || null);
  const available = Boolean(analysis);
  elements.analysisEmpty.hidden = available;
  elements.applyCorrectionsBtn.disabled = !analysis?.corrected_segments?.length;
  elements.docxExportBtn.disabled = !available;
  elements.analysisRegenerateBtn.disabled = !available;
  elements.analysisResult.replaceChildren();
  if (!available) {
    elements.analysisBadge.textContent = "未生成";
    return;
  }
  elements.analysisBadge.textContent = "已生成";
  const sections = [
    ["单集剧情梗概", analysis.summary],
    ["本集作用", analysis.episode_function],
    ["人物与关系", analysis.characters],
    ["开场钩子", analysis.opening_hook],
    ["冲突升级节点", analysis.conflict_nodes],
    ["情绪曲线", analysis.emotion_curve || analysis.emotion_beats],
    ["反转点", analysis.reversals],
    ["结尾悬念", analysis.ending_hook],
    ["可借鉴的创作方法", analysis.creative_methods],
    ["原创改编建议", analysis.original_ideas]
  ];
  elements.analysisResult.append(...sections.map(([title, content]) => analysisSection(title, content)));
}

async function generateAnalysis() {
  return requestAnalysis(false);
}

async function requestAnalysis(force) {
  if (!latestTranscriptState?.segments?.length) return;
  await saveTranscript();
  elements.analysisBtn.disabled = true;
  elements.analysisBadge.textContent = "生成中";
  elements.analysisHint.textContent = "正在调用文本模型校对并生成创作拆解……";
  try {
    const payload = {
      title: elements.projectTitle.value.trim(),
      episode: elements.projectEpisode.value.trim(),
      segments: latestTranscriptState.segments
    };
    const response = await chrome.runtime.sendMessage({ type: "ANALYSIS_START", payload, force });
    if (!response?.ok) throw new Error(response?.error || "无法启动AI拆解任务。");
    if (response.reason === "processing") {
      elements.analysisHint.textContent = "AI拆解任务已在后台运行，请稍后再打开插件查看。";
      return;
    }
    if (response.reason === "cached") {
      renderAnalysis(response.state.report);
      elements.analysisHint.textContent = "文案没有变化，已保留上次结果，没有重复调用AI。";
      return;
    }
    if (response.state?.status === "error") throw new Error(response.state.error || "AI拆解失败。");
    renderAnalysis(response.state?.report || null);
    elements.analysisHint.textContent = "拆解已生成，AI推断角色已自动填入时间轴；请人工核对。";
  } catch (error) {
    elements.analysisBadge.textContent = "生成失败";
    elements.analysisHint.textContent = error.message || "AI拆解失败。";
  } finally {
    elements.analysisBtn.disabled = false;
  }
}

async function regenerateAnalysis() {
  if (!confirm("重新生成会再次调用AI并产生费用，确定继续吗？")) return;
  await requestAnalysis(true);
}

async function refreshAnalysis() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "ANALYSIS_GET_STATE" });
    if (!response?.ok) return;
    const state = response.state;
    if (state.status === "processing") {
      elements.analysisBadge.textContent = "后台生成中";
      elements.analysisHint.textContent = "可以关闭插件窗口，任务会在后台继续。";
      elements.analysisBtn.disabled = true;
      elements.analysisRegenerateBtn.disabled = true;
    } else if (state.status === "complete" && state.report) {
      if (JSON.stringify(state.report) !== lastAnalysisSignature) renderAnalysis(state.report);
      elements.analysisBtn.disabled = false;
      elements.analysisRegenerateBtn.disabled = false;
    } else if (state.status === "error") {
      elements.analysisBadge.textContent = "生成失败";
      elements.analysisHint.textContent = state.error || "AI拆解失败。";
      elements.analysisBtn.disabled = false;
      elements.analysisRegenerateBtn.disabled = false;
    }
  } catch (_error) {}
}

async function applyCorrections() {
  if (!latestAnalysis?.corrected_segments?.length || !latestTranscriptState) return;
  const originals = latestTranscriptState.segments || [];
  const correctedById = new Map(latestAnalysis.corrected_segments.map(item => [String(item.id), item]));
  latestTranscriptState.segments = originals.map((original, index) => {
    const correction = correctedById.get(String(original.id))
      || (latestAnalysis.corrected_segments.length === originals.length ? latestAnalysis.corrected_segments[index] : null);
    return {
      ...original,
      speaker: resolvedSpeaker(original.speaker, correction?.speaker),
      text: correction?.text?.trim() || original.text
    };
  });
  transcriptEditing = true;
  renderTranscript(latestTranscriptState);
  transcriptEditing = true;
  await saveTranscript();
  elements.analysisHint.textContent = "AI校对结果已应用，请继续人工复核。";
}

async function importAudio(file) {
  if (!file) return;
  transcriptEditing = true;
  elements.audioImportBtn.disabled = true;
  elements.transcriptBadge.textContent = "重新识别中";
  elements.transcriptHint.textContent = "正在使用本地medium模型重新识别已有录音……";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    const response = await chrome.runtime.sendMessage({
      type: "TRANSCRIPTION_IMPORT_START",
      filename: file.name,
      audioBase64: btoa(binary)
    });
    if (!response?.ok) throw new Error(response?.error || "无法启动后台识别任务。");
    latestTranscriptState = response.state || latestTranscriptState;
    if (latestTranscriptState.status === "error") throw new Error(latestTranscriptState.error || "已有录音识别失败。");
    transcriptEditing = false;
    renderTranscript(latestTranscriptState);
    renderAnalysis(null);
    elements.transcriptHint.textContent = `已从已有录音恢复：${file.name}`;
  } catch (error) {
    elements.transcriptBadge.textContent = "识别失败";
    elements.transcriptHint.textContent = error.message || "已有录音识别失败。";
  } finally {
    transcriptEditing = false;
    lastTranscriptSignature = transcriptSignature(latestTranscriptState);
    elements.audioImportBtn.disabled = false;
    elements.audioImportInput.value = "";
  }
}

async function exportDocx() {
  if (!latestAnalysis || !latestTranscriptState?.segments?.length) return;
  elements.docxExportBtn.disabled = true;
  try {
    const response = await fetch("http://127.0.0.1:3211/api/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: elements.projectTitle.value.trim(),
        episode: elements.projectEpisode.value.trim(),
        segments: latestTranscriptState.segments,
        analysis: latestAnalysis
      })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Word导出失败。");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = (elements.projectTitle.value || "短剧拆解").replace(/[\\/:*?"<>|]/g, "-");
    link.href = url;
    link.download = `${safeTitle}-${elements.projectEpisode.value || "第1集"}-创作拆解.docx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.analysisHint.textContent = "Word文档已导出。";
  } catch (error) {
    elements.analysisHint.textContent = error.message || "Word导出失败。";
  } finally {
    elements.docxExportBtn.disabled = false;
  }
}

async function loadProjectState() {
  const data = await chrome.storage.local.get(["analysisState", "analysisJobState", "projectMeta"]);
  if (data.projectMeta) {
    elements.projectTitle.value = data.projectMeta.title || "";
    elements.projectEpisode.value = data.projectMeta.episode || "第1集";
  } else {
    const tab = await currentTab();
    elements.projectTitle.value = (tab?.title || "").replace(/\s*[-|].*$/, "");
  }
  renderAnalysis(data.analysisJobState?.report || data.analysisState || null);
}

function projectSignature(project, job) {
  return JSON.stringify({ project, job });
}

async function loadEpisodeFromProject(episode) {
  latestTranscriptState = {
    status: "complete",
    filename: episode.filename || "",
    text: (episode.segments || []).map(item => item.text).join(""),
    segments: episode.segments || [],
    error: null
  };
  latestAnalysis = episode.analysis || null;
  transcriptEditing = false;
  await chrome.storage.local.set({
    transcriptionState: latestTranscriptState,
    analysisState: latestAnalysis,
    analysisJobState: latestAnalysis
      ? { status: "complete", report: latestAnalysis, fingerprint: null, error: null }
      : { status: "idle", report: null, fingerprint: null, error: null }
  });
  elements.projectTitle.value = latestProjectState.title || "";
  elements.projectEpisode.value = episode.episode || "第1集";
  elements.seriesEpisode.value = episode.episode || "第1集";
  renderTranscript(latestTranscriptState);
  renderAnalysis(latestAnalysis);
  elements.advancedTools.open = true;
  elements.projectHint.textContent = `已载入${episode.episode}，可继续修改或重新分析。`;
}

function renderSeriesReport(report) {
  latestSeriesReport = report;
  elements.seriesReport.replaceChildren();
  elements.seriesExportBtn.disabled = !report;
  if (!report) return;
  const sections = [
    ["整体故事概述", report.overall_summary],
    ["阶段结构", report.structure_stages],
    ["人物成长弧线", report.character_arcs],
    ["核心冲突", report.core_conflicts],
    ["钩子模式", report.hook_patterns],
    ["付费卡点", report.payment_beats],
    ["情绪曲线", report.emotion_curve],
    ["节奏分析", report.pacing_analysis],
    ["爆款元素", report.hit_elements],
    ["可迁移创作公式", report.creative_formulas],
    ["原创方向建议", report.original_directions]
  ];
  elements.seriesReport.append(...sections.map(([title, content]) => analysisSection(title, content)));
}

function renderProject(project, seriesJob) {
  latestProjectState = project;
  const episodes = project.episodes || [];
  elements.projectCount.textContent = `${episodes.length} 集`;
  const batchEpisodeNumbers = new Set((latestBatchState?.episodes || []).filter(item => item.segmentCount).map(item => Number(item.episode)));
  const projectEpisodeNumbers = new Set(episodes.map(item => episodeNumber(item.episode)));
  if (batchEpisodeNumbers.size && [...batchEpisodeNumbers].every(number => projectEpisodeNumbers.has(number))) {
    elements.batchImportBtn.textContent = "查看项目与导出";
  }
  elements.projectEmpty.hidden = episodes.length > 0;
  if (!elements.seriesTitle.matches(":focus")) elements.seriesTitle.value = project.title || elements.seriesTitle.value;
  elements.projectEpisodeList.replaceChildren(...episodes.map(episode => {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    const status = document.createElement("span");
    const actions = document.createElement("span");
    const load = document.createElement("button");
    const remove = document.createElement("button");
    label.textContent = episode.episode;
    status.className = "episode-status";
    status.textContent = episode.analysis ? "已拆解" : "仅时间轴";
    actions.className = "episode-row-actions";
    load.textContent = "载入";
    load.addEventListener("click", () => loadEpisodeFromProject(episode));
    remove.textContent = "删";
    remove.addEventListener("click", async () => {
      if (!confirm(`确定从项目中删除${episode.episode}吗？`)) return;
      await chrome.runtime.sendMessage({ type: "PROJECT_DELETE_EPISODE", episode: episode.episode });
      refreshProject();
    });
    actions.append(load, remove);
    item.append(label, status, actions);
    return item;
  }));

  if (seriesJob?.status === "processing") {
    elements.projectHint.textContent = `${seriesJob.scope}整体分析正在后台生成，可以关闭插件。`;
    elements.seriesAnalysisBtn.disabled = true;
  } else {
    elements.seriesAnalysisBtn.disabled = episodes.length === 0;
    if (seriesJob?.status === "error") elements.projectHint.textContent = seriesJob.error || "整体分析失败。";
  }
  const scope = elements.seriesScope.value;
  renderSeriesReport(project.seriesReports?.[scope] || (seriesJob?.scope === scope ? seriesJob.report : null));
}

async function refreshProject() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "PROJECT_GET_STATE" });
    if (!response?.ok) return;
    const signature = projectSignature(response.state, response.seriesJob);
    if (signature !== lastProjectSignature) {
      lastProjectSignature = signature;
      renderProject(response.state, response.seriesJob);
    }
  } catch (_error) {}
}

async function saveCurrentEpisode() {
  if (!latestTranscriptState?.segments?.length) {
    elements.projectHint.textContent = "当前没有可保存的时间轴。";
    return;
  }
  await saveTranscript();
  const payload = {
    title: elements.seriesTitle.value.trim() || elements.projectTitle.value.trim(),
    episode: elements.seriesEpisode.value.trim() || elements.projectEpisode.value.trim(),
    filename: latestTranscriptState.filename,
    segments: latestTranscriptState.segments,
    analysis: latestAnalysis
  };
  const response = await chrome.runtime.sendMessage({ type: "PROJECT_SAVE_EPISODE", payload });
  if (!response?.ok) {
    elements.projectHint.textContent = response?.error || "保存项目失败。";
    return;
  }
  elements.projectTitle.value = payload.title;
  elements.projectEpisode.value = payload.episode;
  elements.projectHint.textContent = `${payload.episode}已保存到项目。`;
  renderProject(response.state, null);
}

async function generateSeriesAnalysis() {
  const count = latestProjectState?.episodes?.length || 0;
  const scope = elements.seriesScope.value;
  const usedCount = scope === "前10集" ? Math.min(10, count) : scope === "前30集" ? Math.min(30, count) : count;
  const calls = Math.ceil(usedCount / 10) + 1;
  if (!confirm(`${scope}整体分析预计调用AI约${calls}次，确定继续吗？`)) return;
  elements.seriesAnalysisBtn.disabled = true;
  elements.projectHint.textContent = "正在后台生成多集整体分析……";
  try {
    const response = await chrome.runtime.sendMessage({ type: "SERIES_ANALYSIS_START", scope: elements.seriesScope.value });
    if (!response?.ok) throw new Error(response?.error || "无法启动整体分析。")
    if (response.state?.status === "error") throw new Error(response.state.error || "整体分析失败。")
    renderSeriesReport(response.state?.report || null);
    elements.projectHint.textContent = `${elements.seriesScope.value}整体分析已完成。`;
    await refreshProject();
  } catch (error) {
    elements.projectHint.textContent = error.message || "整体分析失败。";
  } finally {
    elements.seriesAnalysisBtn.disabled = false;
  }
}

async function exportSeriesDocx() {
  if (!latestProjectState || !latestSeriesReport) return;
  const scope = elements.seriesScope.value;
  const limit = scope === "前10集" ? 10 : scope === "前30集" ? 30 : latestProjectState.episodes.length;
  elements.seriesExportBtn.disabled = true;
  try {
    const response = await fetch("http://127.0.0.1:3211/api/export-series-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: latestProjectState.title, scope, episodes: latestProjectState.episodes.slice(0, limit), report: latestSeriesReport })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "整体Word导出失败。")
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const title = (latestProjectState.title || "短剧").replace(/[\\/:*?"<>|]/g, "-");
    link.href = url;
    link.download = `${title}-${scope}-整体创作分析.docx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    elements.projectHint.textContent = "整体Word已导出。";
  } catch (error) {
    elements.projectHint.textContent = error.message || "整体Word导出失败。";
  } finally {
    elements.seriesExportBtn.disabled = false;
  }
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

elements.recordStartBtn.addEventListener("click", () => recordingCommand("RECORDING_START"));
elements.batchStartBtn.addEventListener("click", () => batchCommand("BATCH_START"));
elements.batchNextBtn.addEventListener("click", () => batchCommand("BATCH_NEXT"));
elements.batchFinishBtn.addEventListener("click", () => batchCommand("BATCH_FINISH"));
elements.batchControllerBtn.addEventListener("click", () => batchCommand("BATCH_CONTROLLER_OPEN"));
elements.batchCancelBtn.addEventListener("click", () => batchCommand("BATCH_CANCEL"));
elements.batchDeleteBtn.addEventListener("click", () => batchCommand("BATCH_DELETE"));
elements.batchAiBtn.addEventListener("click", () => batchCommand("BATCH_AI_START"));
elements.batchImportBtn.addEventListener("click", () => batchCommand("BATCH_IMPORT_PROJECT"));
elements.recordStopBtn.addEventListener("click", () => recordingCommand("RECORDING_STOP"));
elements.desktopRecordStartBtn.addEventListener("click", () => desktopRecordingCommand("DESKTOP_RECORDING_START"));
elements.desktopRecordStopBtn.addEventListener("click", () => desktopRecordingCommand("DESKTOP_RECORDING_STOP"));
elements.desktopRecordCancelBtn.addEventListener("click", () => desktopRecordingCommand("DESKTOP_RECORDING_CANCEL"));
elements.desktopRetranscribeBtn.addEventListener("click", () => desktopRecordingCommand("DESKTOP_RECORDING_RETRANSCRIBE"));
elements.transcriptExportBtn.addEventListener("click", () => {
  if (!latestTranscriptState?.segments?.length) return;
  downloadJson(`transcript-${Date.now()}.json`, {
    filename: latestTranscriptState.filename,
    text: latestTranscriptState.text,
    segments: latestTranscriptState.segments
  });
});
elements.transcriptSaveBtn.addEventListener("click", saveTranscript);
elements.audioImportBtn.addEventListener("click", () => elements.audioImportInput.click());
elements.audioImportInput.addEventListener("change", () => importAudio(elements.audioImportInput.files?.[0]));
elements.analysisBtn.addEventListener("click", generateAnalysis);
elements.analysisRegenerateBtn.addEventListener("click", regenerateAnalysis);
elements.applyCorrectionsBtn.addEventListener("click", applyCorrections);
elements.docxExportBtn.addEventListener("click", exportDocx);
elements.projectSaveBtn.addEventListener("click", saveCurrentEpisode);
elements.seriesAnalysisBtn.addEventListener("click", generateSeriesAnalysis);
elements.seriesExportBtn.addEventListener("click", exportSeriesDocx);
elements.seriesScope.addEventListener("change", () => {
  const report = latestProjectState?.seriesReports?.[elements.seriesScope.value] || null;
  renderSeriesReport(report);
});
elements.projectTitle.addEventListener("input", () => {
  if (!elements.seriesTitle.value.trim()) elements.seriesTitle.value = elements.projectTitle.value;
});
elements.projectEpisode.addEventListener("input", () => {
  elements.seriesEpisode.value = elements.projectEpisode.value;
});

refreshRecording();
refreshBatch();
refreshDesktopRecording();
refreshTranscript();
loadProjectState();
refreshAnalysis();
refreshProject();
setInterval(refreshRecording, 1000);
setInterval(refreshBatch, 1000);
setInterval(refreshDesktopRecording, 1000);
setInterval(refreshTranscript, 1000);
setInterval(refreshAnalysis, 1000);
setInterval(refreshProject, 2000);
