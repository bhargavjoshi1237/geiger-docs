import "server-only";
import { NextResponse } from "next/server";

// Route-handler replies: success bodies are the camelCase payload itself; failures are { message, code? }.

export function ok(data, status = 200) {
  return NextResponse.json(data ?? {}, { status });
}

export function fail(status, message, code) {
  return NextResponse.json(code ? { message, code } : { message }, { status });
}

export const unauthorized = () => fail(401, "Sign in to continue.", "unauthorized");
export const forbidden = () => fail(403, "You don't have permission to do that.", "forbidden");
export const notFound = (message = "Not found.") => fail(404, message, "not_found");

// Streams the body with a hard byte cap so an oversized or chunked upload is never buffered whole.
async function readText(request, limitBytes) {
  if (Number(request.headers.get("content-length") || 0) > limitBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limitBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Parsed JSON object body ({} when empty), or null when it's too large, unreadable, not JSON or not an object.
export async function readJson(request, limitBytes = 64 * 1024) {
  try {
    const text = await readText(request, limitBytes);
    if (text === null) return null;
    if (!text.trim()) return {};
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
