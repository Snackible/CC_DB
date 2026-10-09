export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyEo76blPXUgGCH_kZ_qbPB5GPN0PBhMcp-_D9TG4R9zn_ICY9TtAExkI62R5a7Qwggyw/exec';

export const DELHIVERY_URL =
  'https://script.google.com/macros/s/AKfycbxSuMjhYk1GxoCtkvrttG_VBoaSTHne61kHiO49jYCiz4c43zSdJGsVO8SFEpyL1FPl/exec';

let jsonpCounter = 0;

// Apps Script Web Apps 404 when hit with fetch()/XHR (even same-origin) but
// work fine via a <script> tag load — so this loads data via JSONP. Requires
// doGet to support a `callback` query param and wrap its JSON response as
// `callback(...)`. Google's /exec redirect chain is also just flaky in
// practice — response times swing 3–15s and it occasionally fails outright,
// but a retry almost always succeeds. So the public fetchSheet wraps this
// with a few retries before giving up.
function fetchSheetOnce(sheet, baseUrl) {
  return new Promise((resolve, reject) => {
    const url = baseUrl || APPS_SCRIPT_URL;
    const callbackName = `__jsonp_cb_${jsonpCounter++}_${Date.now()}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      clearTimeout(timer);
    };

    window[callbackName] = (data) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Failed to load sheet "${sheet}"`));
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out loading sheet "${sheet}"`));
    }, 30000);

    script.src = `${url}?sheet=${encodeURIComponent(sheet)}&callback=${callbackName}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

export async function fetchSheet(sheet, baseUrl) {
  const attempts = 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchSheetOnce(sheet, baseUrl);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}
