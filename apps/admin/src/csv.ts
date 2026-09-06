/**
 * CSV, built in the browser from what the client already has subscribed.
 *
 * A reducer cannot return data, so an export reducer would have to write
 * rows into a table and have the client read them back. At this scale the
 * client is already holding every row it would export, so the honest
 * version is this: format what is on screen and hand it over.
 */

/** RFC 4180 quoting: quotes doubled, and anything risky wrapped. */
function cell(value: unknown): string {
	if (value === null || value === undefined) return "";
	const s = String(value);
	return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export interface Column<Row> {
	header: string;
	value: (row: Row) => unknown;
}

export function toCsv<Row>(
	rows: readonly Row[],
	columns: ReadonlyArray<Column<Row>>,
): string {
	const lines = [columns.map((c) => cell(c.header)).join(",")];
	for (const row of rows) {
		lines.push(columns.map((c) => cell(c.value(row))).join(","));
	}
	// Excel on Windows wants CRLF, and everything else tolerates it.
	return `${lines.join("\r\n")}\r\n`;
}

/** An ISO date, which is what a spreadsheet and an accountant both want. */
export function isoDate(ts: { toDate: () => Date }): string {
	return ts.toDate().toISOString();
}

/** Hand the file to the browser. Revoked on the next tick; nothing persists. */
export function download(filename: string, text: string): void {
	const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `closetkeeper-inventory-2026-09-06.csv` */
export function exportName(what: string, now: Date = new Date()): string {
	const d = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("-");
	return `closetkeeper-${what}-${d}.csv`;
}
