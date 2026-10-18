/** Client-side media optimization before R2 upload. */

const MAX_IMAGE_EDGE = 1920;
const IMAGE_QUALITY = 0.82;
const VIDEO_MAX_EDGE = 1080;
const VIDEO_BITRATE = 3_200_000; // ~3.2 Mbps
const VIDEO_COMPRESS_MIN_BYTES = 6 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 120;
const MAX_VIDEO_UPLOAD_BYTES = 150 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('לא ניתן לקרוא את התמונה'));
    };
    img.src = url;
  });
}

function canvasToJpegFile(canvas, nameBase) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('דחיסת תמונה נכשלה'));
          return;
        }
        const safe = String(nameBase || 'image').replace(/\.[^.]+$/, '') || 'image';
        resolve(new File([blob], `${safe}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      IMAGE_QUALITY
    );
  });
}

export async function optimizeImageFile(file, onStatus) {
  if (!file?.type?.startsWith('image/')) return file;
  onStatus?.('דוחס תמונה…');
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const out = await canvasToJpegFile(canvas, file.name);
  if (out.size >= file.size && scale === 1 && file.type === 'image/jpeg') return file;
  return out;
}

function loadVideoMeta(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const meta = {
        url,
        video,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        duration: video.duration || 0,
      };
      resolve(meta);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('לא ניתן לקרוא את הסרטון'));
    };
    video.src = url;
  });
}

function pickRecorderMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

/**
 * Re-encode oversized / high-res videos in-browser via MediaRecorder.
 * Falls back to original file if unsupported or compression fails.
 */
export async function optimizeVideoFile(file, onStatus) {
  if (!file?.type?.startsWith('video/')) return file;

  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    throw new Error('הסרטון גדול מדי (מקסימום 150MB). העלי סרטון קצר יותר או דחוס מראש.');
  }

  let meta;
  try {
    meta = await loadVideoMeta(file);
  } catch {
    throw new Error('לא ניתן לקרוא את הסרטון. נסי פורמט MP4 או WebM.');
  }

  const { video, url, width, height, duration } = meta;
  if (Number.isFinite(duration) && duration > MAX_VIDEO_DURATION_SEC) {
    URL.revokeObjectURL(url);
    throw new Error(`הסרטון ארוך מדי (עד ${MAX_VIDEO_DURATION_SEC} שניות).`);
  }

  const needsScale = Math.max(width, height) > VIDEO_MAX_EDGE;
  const needsSize = file.size >= VIDEO_COMPRESS_MIN_BYTES;
  if (!needsScale && !needsSize) {
    URL.revokeObjectURL(url);
    return file;
  }

  const mime = pickRecorderMime();
  if (!mime || typeof video.captureStream !== 'function') {
    URL.revokeObjectURL(url);
    throw new Error(
      'הדפדפן לא תומך בדחיסת וידאו. העלי סרטון קטן יותר (עד 6MB / עד 1080p) או השתמשי בכרום/ספארי עדכני.'
    );
  }

  onStatus?.('דוחס סרטון… זה עשוי לקחת רגע');

  const scale = needsScale ? VIDEO_MAX_EDGE / Math.max(width, height) : 1;
  const outW = Math.max(2, Math.round((width * scale) / 2) * 2);
  const outH = Math.max(2, Math.round((height * scale) / 2) * 2);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const canvasStream = canvas.captureStream(30);
  const audioTracks = (video.captureStream?.() || new MediaStream()).getAudioTracks();
  for (const track of audioTracks) canvasStream.addTrack(track);

  const recorder = new MediaRecorder(canvasStream, {
    mimeType: mime,
    videoBitsPerSecond: VIDEO_BITRATE,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('דחיסת סרטון נכשלה'));
  });

  try {
    video.currentTime = 0;
    await video.play();
  } catch {
    URL.revokeObjectURL(url);
    return file;
  }

  recorder.start(250);
  let raf = 0;
  const draw = () => {
    if (video.ended || video.paused) return;
    ctx.drawImage(video, 0, 0, outW, outH);
    raf = requestAnimationFrame(draw);
  };
  draw();

  await new Promise((resolve) => {
    video.onended = resolve;
  });
  cancelAnimationFrame(raf);
  if (recorder.state !== 'inactive') recorder.stop();
  await done;
  video.pause();
  URL.revokeObjectURL(url);

  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  if (!blob.size || blob.size >= file.size * 0.98) {
    onStatus?.('הדחיסה לא הקטינה - מעלה מקור');
    return file;
  }
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const safe = String(file.name || 'video').replace(/\.[^.]+$/, '') || 'video';
  return new File([blob], `${safe}.${ext}`, { type: blob.type });
}

export async function optimizeMediaFile(file, kind = 'auto', onStatus) {
  const isVideo = kind === 'video' || file.type.startsWith('video/');
  if (isVideo) return optimizeVideoFile(file, onStatus);
  if (kind === 'image' || file.type.startsWith('image/')) return optimizeImageFile(file, onStatus);
  return file;
}

/**
 * Grab a still frame from a video file for use as cover/poster.
 * Seeks past the start to avoid black frames.
 */
export async function extractVideoCover(file, onStatus) {
  if (!file?.type?.startsWith('video/')) {
    throw new Error('קובץ אינו סרטון');
  }
  onStatus?.('מחלץ קאבר מהסרטון…');

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('לא ניתן לקרוא את הסרטון לקאבר'));
      video.src = url;
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekTo = duration > 2 ? Math.min(1, duration * 0.1) : duration > 0.2 ? 0.15 : 0;

    if (seekTo > 0) {
      await new Promise((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.onerror = () => reject(new Error('דילוג בסרטון לקאבר נכשל'));
        video.currentTime = seekTo;
      });
    }

    const w = video.videoWidth || 0;
    const h = video.videoHeight || 0;
    if (!w || !h) throw new Error('לא התקבל פריים מהסרטון');

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const safe = String(file.name || 'video').replace(/\.[^.]+$/, '') || 'video';
    return canvasToJpegFile(canvas, `${safe}-cover`);
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
