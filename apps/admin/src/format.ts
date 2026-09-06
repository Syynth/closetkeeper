import type { Timestamp } from "spacetimedb";

/** "Today 2:41 pm", "Yesterday 9:10 am", "Mon 4:48 pm", "Aug 12", or "never" for epoch 0. */
export function whenLabel(ts: Timestamp, now: Date = new Date()): string {
	if (ts.microsSinceUnixEpoch === 0n) return "never";
	const d = ts.toDate();
	const time = d
		.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
		.toLowerCase();
	const dayMs = 86_400_000;
	const startOfToday = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
	).getTime();
	const diffDays = Math.floor(
		(startOfToday -
			new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
			dayMs,
	);
	if (diffDays === 0) return `Today ${time}`;
	if (diffDays === 1) return `Yesterday ${time}`;
	if (diffDays < 7)
		return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
	return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Access-log outcomes in the words a person would use. */
export const OUTCOME_LABEL: Record<
	string,
	{ text: string; tone: "pine" | "tape" | "clay" | "muted" }
> = {
	staff: { text: "signed in", tone: "pine" },
	linked: { text: "first sign-in", tone: "pine" },
	invited_no_match: { text: "not on the list", tone: "clay" },
	untrusted_token: { text: "not ours", tone: "muted" },
	anonymous: { text: "no token", tone: "muted" },
};
