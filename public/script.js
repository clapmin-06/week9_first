/* ==========================================================
 * AI 캐리커처 스튜디오 - 프론트엔드
 *
 * [백엔드 연동 방법]
 * 1) CONFIG.USE_MOCK = false 로 바꾸고
 * 2) Node.js 서버에 POST /api/transform 엔드포인트를 만드세요.
 *
 *   요청  : multipart/form-data
 *           - image  : 업로드한 원본 파일
 *           - style  : 스타일 id (caricature | anime | ...)
 *           - prompt : 스타일 프롬프트 (OpenAI images.edit 의 prompt 로 사용)
 *           - extra  : 사용자 추가 요청 (선택)
 *   응답  : JSON  { "image": "data:image/png;base64,...." }
 *           (또는 { "url": "https://..." })
 *
 * 서버 예시(참고):
 *   const result = await openai.images.edit({
 *     model: "gpt-image-1", image: fileStream, prompt: `${prompt} ${extra}`
 *   });
 *   res.json({ image: "data:image/png;base64," + result.data[0].b64_json });
 * ========================================================== */

const CONFIG = {
  USE_MOCK: false,                // true: 서버 없이 브라우저 필터로 미리보기
  API_URL: "/api/transform",
  MAX_SIZE_MB: 4,                 // 서버(Vercel) 한도와 맞춤
};

// 스타일 정의: prompt 는 백엔드로 전달되고, mock 은 브라우저 필터 미리보기용
const STYLES = [
  { id: "caricature", emoji: "😝", name: "캐리커처", desc: "특징을 과장한 유머러스한 그림",
    prompt: "Turn this photo into a humorous caricature with exaggerated facial features, bold line art and vibrant colors.",
    mock: "contrast(1.4) saturate(1.6) url(#none)" },
  { id: "anime", emoji: "🌸", name: "애니메이션", desc: "일본 애니메이션 스타일",
    prompt: "Redraw this photo as a Japanese anime character, clean lineart, cel shading, large expressive eyes.",
    mock: "saturate(1.8) contrast(1.15) brightness(1.1) hue-rotate(-8deg)" },
  { id: "poster", emoji: "🎬", name: "영화 포스터", desc: "극적인 시네마틱 포스터",
    prompt: "Transform this photo into a dramatic cinematic movie poster with moody lighting and a bold teal-orange color grade.",
    mock: "contrast(1.3) saturate(1.3) sepia(.35) hue-rotate(160deg) brightness(.9)" },
  { id: "pixar", emoji: "🧸", name: "3D 애니메이션", desc: "픽사풍 3D 캐릭터",
    prompt: "Convert this photo into a Pixar-style 3D animated character with soft lighting and smooth textures.",
    mock: "saturate(1.4) brightness(1.15) contrast(.95) blur(.6px)" },
  { id: "watercolor", emoji: "🖌️", name: "수채화", desc: "부드러운 수채화 일러스트",
    prompt: "Paint this photo as a soft watercolor illustration with gentle washes and visible paper texture.",
    mock: "saturate(1.2) brightness(1.15) contrast(.8) blur(1px)" },
  { id: "pop", emoji: "🎨", name: "팝아트", desc: "강렬한 색의 앤디 워홀풍",
    prompt: "Make this photo a pop-art portrait in Andy Warhol style with flat bold colors and halftone dots.",
    mock: "contrast(1.8) saturate(2.5) hue-rotate(30deg)" },
];

const $ = (id) => document.getElementById(id);
const el = {
  dropzone: $("dropzone"), fileInput: $("fileInput"), dropHint: $("dropHint"),
  thumb: $("previewThumb"), resetBtn: $("resetBtn"),
  styleList: $("styleList"), extra: $("extraPrompt"),
  transformBtn: $("transformBtn"), downloadBtn: $("downloadBtn"),
  status: $("status"), loader: $("loader"), empty: $("empty"),
  compare: $("compare"), side: $("side"), tabs: $("viewTabs"),
  imgBefore: $("imgBefore"), imgAfter: $("imgAfter"),
  sideBefore: $("sideBefore"), sideAfter: $("sideAfter"),
  slider: $("slider"), beforeWrap: $("beforeWrap"), handle: $("handle"),
  modeLabel: $("modeLabel"),
};

const state = { file: null, originalUrl: null, resultUrl: null, styleId: STYLES[0].id, mode: "slider" };

/* ---------- 스타일 카드 ---------- */
function renderStyles() {
  el.styleList.innerHTML = "";
  STYLES.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "style-item" + (s.id === state.styleId ? " selected" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", s.id === state.styleId);
    b.innerHTML = `<span class="emoji">${s.emoji}</span><span class="name">${s.name}</span><span class="desc">${s.desc}</span>`;
    b.addEventListener("click", () => { state.styleId = s.id; renderStyles(); });
    el.styleList.appendChild(b);
  });
}

/* ---------- 업로드 ---------- */
function setStatus(msg, isError = false) {
  el.status.textContent = msg;
  el.status.classList.toggle("error", isError);
}

function handleFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setStatus("PNG, JPG, WEBP 이미지만 업로드할 수 있어요.", true);
  if (file.size > CONFIG.MAX_SIZE_MB * 1024 * 1024) return setStatus(`파일 크기는 ${CONFIG.MAX_SIZE_MB}MB 이하여야 해요.`, true);

  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  state.file = file;
  state.originalUrl = URL.createObjectURL(file);
  state.resultUrl = null;

  el.thumb.src = state.originalUrl;
  el.thumb.hidden = false;
  el.dropHint.hidden = true;
  el.resetBtn.hidden = false;
  el.transformBtn.disabled = false;
  el.downloadBtn.disabled = true;
  showResult(false);
  setStatus("스타일을 고르고 '이미지 변환하기'를 눌러주세요.");
}

function resetAll() {
  if (state.originalUrl) URL.revokeObjectURL(state.originalUrl);
  Object.assign(state, { file: null, originalUrl: null, resultUrl: null });
  el.fileInput.value = "";
  el.thumb.hidden = true;
  el.dropHint.hidden = false;
  el.resetBtn.hidden = true;
  el.transformBtn.disabled = true;
  el.downloadBtn.disabled = true;
  showResult(false);
  setStatus("");
}

el.fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
el.resetBtn.addEventListener("click", resetAll);
["dragenter", "dragover"].forEach((t) =>
  el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.add("drag"); }));
["dragleave", "drop"].forEach((t) =>
  el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.remove("drag"); }));
el.dropzone.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
el.dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.fileInput.click(); } });

/* ---------- 변환 ---------- */
async function transform() {
  if (!state.file) return;
  const style = STYLES.find((s) => s.id === state.styleId);
  el.loader.hidden = false;
  el.transformBtn.disabled = true;
  setStatus("");

  try {
    state.resultUrl = CONFIG.USE_MOCK ? await mockTransform(style) : await apiTransform(style);
    showResult(true);
    el.downloadBtn.disabled = false;
    setStatus(`✅ '${style.name}' 스타일로 변환했어요!`);
  } catch (err) {
    console.error(err);
    setStatus("변환 중 오류가 발생했어요: " + err.message, true);
  } finally {
    el.loader.hidden = true;
    el.transformBtn.disabled = false;
  }
}

// 실제 백엔드 호출 (Node.js + OpenAI 이미지 편집 API)
async function apiTransform(style) {
  const form = new FormData();
  form.append("image", state.file);
  form.append("style", style.id);
  form.append("prompt", style.prompt);
  form.append("extra", el.extra.value.trim());

  const res = await fetch(CONFIG.API_URL, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `서버 응답 오류 (${res.status})`);
  const src = data.image || data.url;
  if (!src) throw new Error("응답에 이미지가 없어요.");
  return src;
}

// 서버 없이 UI 확인용: canvas 필터로 비슷한 느낌만 흉내
async function mockTransform(style) {
  await new Promise((r) => setTimeout(r, 1200));
  const img = await loadImage(state.originalUrl);
  const max = 1024, scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext("2d");
  ctx.filter = style.mock.replace(" url(#none)", "");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    i.src = src;
  });
}

el.transformBtn.addEventListener("click", transform);

/* ---------- 결과 / 비교 ---------- */
function showResult(hasResult) {
  el.empty.hidden = hasResult || !!state.file;
  el.tabs.hidden = !hasResult;
  if (!hasResult) {
    el.compare.hidden = true;
    el.side.hidden = true;
    if (state.file) { el.empty.hidden = false; el.empty.textContent = "스타일을 선택하고 변환 버튼을 눌러보세요."; }
    else el.empty.textContent = "사진을 업로드하면 여기에 결과가 표시돼요.";
    return;
  }
  el.imgBefore.src = el.sideBefore.src = state.originalUrl;
  el.imgAfter.src = el.sideAfter.src = state.resultUrl;
  el.slider.value = 50;
  updateSlider();
  setMode(state.mode);
}

function setMode(mode) {
  state.mode = mode;
  el.compare.hidden = mode !== "slider";
  el.side.hidden = mode !== "side";
  el.tabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
}
el.tabs.addEventListener("click", (e) => { if (e.target.dataset.mode) setMode(e.target.dataset.mode); });

function updateSlider() {
  const v = el.slider.value;
  el.beforeWrap.style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  el.handle.style.left = v + "%";
}
el.slider.addEventListener("input", updateSlider);

/* ---------- 다운로드 ---------- */
el.downloadBtn.addEventListener("click", async () => {
  if (!state.resultUrl) return;
  let href = state.resultUrl;
  try {
    // 원격 URL 이면 blob 으로 받아 다운로드 속성이 동작하도록 처리
    if (!href.startsWith("data:") && !href.startsWith("blob:")) {
      href = URL.createObjectURL(await (await fetch(href)).blob());
    }
  } catch { /* CORS 등으로 실패하면 원본 URL 그대로 시도 */ }
  const a = document.createElement("a");
  a.href = href;
  a.download = `caricature-${state.styleId}-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/* ---------- 초기화 ---------- */
el.modeLabel.textContent = CONFIG.USE_MOCK ? "미리보기(Mock)" : "API 연결";
renderStyles();
