/* =========================================================
   GET /api/github-contributions
   Vercel serverless function (Node 18+, no dependencies).

   Reads the last 365 days of the GitHub contribution calendar
   for GITHUB_USERNAME through the official GraphQL API and
   returns a compact, verified JSON payload for the
   "Neural Orbit" visualization (assets/js/neural-orbit.js).

   Environment variables (Vercel → Project → Settings → Env):
     GITHUB_TOKEN     required  fine-grained or classic token.
                                No scopes are needed for public
                                activity; the token never leaves
                                this function.
     GITHUB_USERNAME  optional  defaults to YOOSUF-HUB

   Caching
     • warm-instance memory cache: 30 minutes
     • Vercel CDN: s-maxage 30 min + stale-while-revalidate 30 min
       (+ stale-if-error 24 h)
     • on an upstream failure the last good payload is served
       with "stale": true. Nothing is ever invented: with no good
       payload the endpoint answers 502 / 503 without data.
   ========================================================= */

"use strict";

const USERNAME = process.env.GITHUB_USERNAME || "YOOSUF-HUB";
const TTL_MS = 30 * 60 * 1000;
const DAY_MS = 86400000;
const PERIOD_DAYS = 365;

const CACHE_FRESH = "public, max-age=0, s-maxage=1800, stale-while-revalidate=1800, stale-if-error=86400";
const CACHE_STALE = "public, max-age=0, s-maxage=120, stale-while-revalidate=600";
const CACHE_ERROR = "public, max-age=0, s-maxage=60";

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const QUERY = `query ($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    contributionsCollection(from: $from, to: $to) {
      startedAt
      endedAt
      totalCommitContributions
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date weekday contributionCount contributionLevel } }
      }
    }
  }
}`;

let memo = null;      // { payload, at }
let inflight = null;  // shared promise while a request to GitHub is running

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/* The calendar period: today (UTC) and the 364 days before it. */
function period(now) {
    const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const start = today - (PERIOD_DAYS - 1) * DAY_MS;
    return {
        fromMs: start,
        toMs: today,
        fromISO: new Date(start).toISOString(),
        toISO: new Date(today + DAY_MS - 1000).toISOString(),
    };
}

async function loadFromGitHub(token) {
    const p = period(Date.now());
    const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            Authorization: "bearer " + token,
            "Content-Type": "application/json",
            "User-Agent": "portfolio-neural-orbit",
        },
        body: JSON.stringify({ query: QUERY, variables: { login: USERNAME, from: p.fromISO, to: p.toISO } }),
        signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) throw new Error("GitHub responded " + r.status);
    const json = await r.json();
    if (json.errors && json.errors.length) throw new Error("GitHub GraphQL error: " + json.errors.map((e) => e.type || e.message).join(", "));
    const user = json.data && json.data.user;
    if (!user) throw new Error("GitHub user not found");

    const col = user.contributionsCollection;
    const cal = col.contributionCalendar;

    /* Keep exactly the requested dates, in order, and verify that the
       calendar is contiguous — every particle must be a real date. */
    const fromDay = isoDay(p.fromMs), toDay = isoDay(p.toMs);
    const days = [];
    for (const w of cal.weeks) for (const d of w.contributionDays) {
        if (d.date < fromDay || d.date > toDay) continue;
        days.push({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] || 0 });
    }
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!days.length) throw new Error("Empty contribution calendar");
    for (let i = 1; i < days.length; i++) {
        if (Date.parse(days[i].date) - Date.parse(days[i - 1].date) !== DAY_MS) throw new Error("Calendar is not contiguous at " + days[i].date);
    }

    const sum = days.reduce((a, d) => a + d.count, 0);
    return {
        username: user.login,
        profileUrl: "https://github.com/" + user.login,
        period: { from: days[0].date, to: days[days.length - 1].date, days: days.length, timezone: "UTC" },
        totals: {
            /* All contribution types GitHub counts on the calendar. */
            contributions: cal.totalContributions,
            /* Commit contributions only — reported separately on purpose. */
            commitContributions: col.totalCommitContributions,
            activeDays: days.filter((d) => d.count > 0).length,
            calendarSum: sum,
        },
        days,
        fetchedAt: new Date().toISOString(),
        stale: false,
    };
}

function send(res, status, body, cacheControl) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        return send(res, 405, { error: "method_not_allowed" }, "no-store");
    }

    if (memo && Date.now() - memo.at < TTL_MS) return send(res, 200, memo.payload, CACHE_FRESH);

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        if (memo) return send(res, 200, Object.assign({}, memo.payload, { stale: true }), CACHE_STALE);
        return send(res, 503, { error: "not_configured", message: "GitHub data is not configured on the server." }, "no-store");
    }

    try {
        if (!inflight) inflight = loadFromGitHub(token).finally(() => { inflight = null; });
        const payload = await inflight;
        memo = { payload, at: Date.now() };
        return send(res, 200, payload, CACHE_FRESH);
    } catch (err) {
        console.error("[github-contributions]", err && err.message);
        if (memo) return send(res, 200, Object.assign({}, memo.payload, { stale: true }), CACHE_STALE);
        return send(res, 502, { error: "upstream_unavailable", message: "GitHub data is temporarily unavailable." }, CACHE_ERROR);
    }
};
