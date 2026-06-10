const GEMINI_UPLOAD_URL = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const GEMINI_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  return key;
}

export async function uploadVideo(
  videoBuffer: Buffer,
  mimeType: string
): Promise<{ uri: string; mimeType: string }> {
  const key = getApiKey();

  const response = await fetch(`${GEMINI_UPLOAD_URL}?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "start, upload, finalize",
      "X-Goog-Upload-Header-Content-Length": String(videoBuffer.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(videoBuffer),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini upload error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const fileName = data.file.name; // e.g. "files/abc123"
  const fileUri = data.file.uri;
  const fileMimeType = data.file.mimeType;

  // Poll until file is ACTIVE (Gemini needs to process the upload)
  await waitForFileActive(fileName);

  return { uri: fileUri, mimeType: fileMimeType };
}

async function waitForFileActive(fileName: string, maxWaitMs = 120000): Promise<void> {
  const key = getApiKey();
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${key}`
    );

    if (!response.ok) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    const data = await response.json();
    const state = data.state;

    if (state === "ACTIVE") return;
    if (state === "FAILED") throw new Error(`Gemini file processing failed for ${fileName}`);

    // Still PROCESSING — wait and retry
    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`Gemini file ${fileName} did not become ACTIVE within ${maxWaitMs / 1000}s`);
}

// Pull Google's suggested retry delay (e.g. "retryDelay": "13s") out of a 429
// body so we wait exactly as long as the server asks instead of guessing.
function parseRetryDelayMs(body: string): number | null {
  try {
    const json = JSON.parse(body);
    const details = json?.error?.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        if (typeof d?.retryDelay === "string") {
          const secs = parseFloat(d.retryDelay.replace("s", ""));
          if (!Number.isNaN(secs)) return Math.ceil(secs * 1000);
        }
      }
    }
  } catch {
    // fall through
  }
  // Also handle plain text "Please retry in 13.97s"
  const m = body.match(/retry in ([\d.]+)s/i);
  if (m) return Math.ceil(parseFloat(m[1]) * 1000);
  return null;
}

// A 429 caused by a hard zero limit (e.g. free-tier limit: 0) can never be
// satisfied by retrying — detect it so we fail fast with a clear message.
function isHardZeroLimit(body: string): boolean {
  return /limit:\s*0\b/.test(body);
}

export async function analyzeVideo(
  fileUri: string,
  mimeType: string,
  analysisPrompt: string,
  maxRetries = 5
): Promise<string> {
  const key = getApiKey();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${GEMINI_GENERATE_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { fileData: { fileUri, mimeType } },
                { text: analysisPrompt },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text();

        // No point retrying a structural zero-quota error — surface it clearly.
        if (response.status === 429 && isHardZeroLimit(text)) {
          throw new Error(
            "Gemini quota is 0 for this project — billing is NOT linked to the " +
              "project that owns your GEMINI_API_KEY. Link billing to that exact " +
              `project, then retry. Raw: ${text}`
          );
        }

        if (attempt < maxRetries - 1) {
          // Respect the server's requested delay; back off exponentially otherwise.
          const serverDelay = parseRetryDelayMs(text);
          const backoff = serverDelay ?? Math.min(2 ** attempt * 2000, 30000);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw new Error(`Gemini analysis error ${response.status}: ${text}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      // Strip everything before first # (same as n8n workflow)
      const hashIndex = text.indexOf("#");
      return hashIndex >= 0 ? text.substring(hashIndex) : text;
    } catch (error) {
      // Don't swallow the explicit zero-quota diagnostic.
      if (error instanceof Error && error.message.includes("billing is NOT linked")) {
        throw error;
      }
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 2000, 30000)));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Gemini analysis failed after retries");
}
