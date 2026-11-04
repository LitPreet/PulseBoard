/** Deliberately small user-agent parser — good enough for browser/OS/device breakdowns. */
export interface ParsedUA {
  browser: string | null;
  os: string | null;
  deviceType: "Desktop" | "Mobile" | "Tablet" | "Bot" | null;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
];

const OSES: [RegExp, string][] = [
  [/Windows NT/, "Windows"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/CrOS/, "Chrome OS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export function parseUserAgent(ua: string | undefined | null): ParsedUA {
  if (!ua) return { browser: null, os: null, deviceType: null };
  if (/bot|crawler|spider|crawling|headless/i.test(ua)) return { browser: "Bot", os: null, deviceType: "Bot" };
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = OSES.find(([re]) => re.test(ua))?.[1] ?? null;
  const deviceType = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)
    ? "Tablet"
    : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)
      ? "Mobile"
      : "Desktop";
  return { browser, os, deviceType };
}
