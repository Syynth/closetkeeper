import { tables } from "@closetkeeper/bindings";
import { Button, Card, Stack, Text, Title } from "@mantine/core";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useTable } from "spacetimedb/react";
import { PageHeader } from "../components/PageHeader";
import { AuthedPage, useCan } from "../components/Shell";
import { type Column, download, exportName, isoDate, toCsv } from "../csv";

export const Route = createFileRoute("/export")({
	component: () => (
		<AuthedPage>
			<ExportPage />
		</AuthedPage>
	),
});

/**
 * CSV for the books. Four files, each one thing: what is on the shelves,
 * where it physically is, every movement, and what came in. The ledger is
 * the one an accountant or a grant application actually wants, because
 * every row carries its kind, its date and who did it.
 */
function ExportPage() {
	const can = useCan();
	const [shelves] = useTable(tables.shelves);
	const [bins] = useTable(tables.binLevels);
	const [ledger] = useTable(tables.stockLedger);
	const [bags] = useTable(tables.bagList);
	const [lines] = useTable(tables.bagLines);
	const [done, setDone] = useState<string | null>(null);

	if (!can("inventory.read")) {
		return (
			<>
				<PageHeader title="Export" back="/more" />
				<Card>
					<Text>Your role can't export the closet.</Text>
				</Card>
			</>
		);
	}

	const save = (what: string, text: string) => {
		download(exportName(what), text);
		setDone(what);
	};

	const onHand = shelves.filter((s) => s.onHand !== 0);

	const files: Array<{
		what: string;
		title: string;
		description: string;
		rows: number;
		build: () => string;
	}> = [
		{
			what: "inventory",
			title: "What is on the shelves",
			description:
				"One row per category, size, who it is for, and condition, with the count.",
			rows: onHand.length,
			build: () =>
				toCsv(onHand, [
					{ header: "category", value: (r) => r.categoryLabel },
					{ header: "size", value: (r) => r.sizeLabel },
					{ header: "for", value: (r) => r.genderLabel },
					{ header: "condition", value: (r) => r.conditionLabel },
					{ header: "on_hand", value: (r) => r.onHand },
					{ header: "on_shelves", value: (r) => (r.shelved ? "yes" : "no") },
					{ header: "bins", value: (r) => r.binCount },
				] satisfies Column<(typeof onHand)[number]>[]),
		},
		{
			what: "inventory-by-bin",
			title: "Where it is",
			description: "The same counts, broken down by bin.",
			rows: bins.length,
			build: () =>
				toCsv(bins, [
					{ header: "bin", value: (r) => r.locationLabel },
					{ header: "category", value: (r) => r.categoryLabel },
					{ header: "size", value: (r) => r.sizeLabel },
					{ header: "for", value: (r) => r.genderLabel },
					{ header: "condition", value: (r) => r.conditionLabel },
					{ header: "on_hand", value: (r) => r.onHand },
				] satisfies Column<(typeof bins)[number]>[]),
		},
		{
			what: "ledger",
			title: "Every movement",
			description:
				"The whole history: what changed, by how much, why, where, when and who. This is the one for the books and for grant reporting.",
			rows: ledger.length,
			build: () =>
				toCsv(
					[...ledger].sort((a, b) =>
						Number(a.at.microsSinceUnixEpoch - b.at.microsSinceUnixEpoch),
					),
					[
						{ header: "when", value: (r) => isoDate(r.at) },
						{ header: "kind", value: (r) => r.kind },
						{ header: "change", value: (r) => r.delta },
						{ header: "category", value: (r) => r.categoryLabel },
						{ header: "size", value: (r) => r.sizeLabel },
						{ header: "for", value: (r) => r.genderLabel },
						{ header: "condition", value: (r) => r.conditionLabel },
						{ header: "bin", value: (r) => r.locationLabel },
						{ header: "by", value: (r) => r.staffName },
						{ header: "note", value: (r) => r.note },
					] satisfies Column<(typeof ledger)[number]>[],
				),
		},
		{
			what: "bags",
			title: "What came in",
			description:
				"Every intake line with its bag, donated or purchased. The basis for a donor receipt once donors are recorded.",
			rows: lines.length,
			build: () => {
				const bagOf = new Map(bags.map((b) => [String(b.bagId), b]));
				return toCsv(lines, [
					{
						header: "opened",
						value: (r) => {
							const b = bagOf.get(String(r.bagId));
							return b ? isoDate(b.openedAt) : "";
						},
					},
					{
						header: "kind",
						value: (r) => bagOf.get(String(r.bagId))?.kind ?? "",
					},
					{
						header: "status",
						value: (r) => bagOf.get(String(r.bagId))?.status ?? "",
					},
					{ header: "bag", value: (r) => r.bagId },
					{ header: "category", value: (r) => r.categoryLabel },
					{ header: "size", value: (r) => r.sizeLabel },
					{ header: "for", value: (r) => r.genderLabel },
					{ header: "condition", value: (r) => r.conditionLabel },
					{ header: "bin", value: (r) => r.locationLabel },
					{ header: "count", value: (r) => r.count },
					{
						header: "logged_by",
						value: (r) => bagOf.get(String(r.bagId))?.openedByName ?? "",
					},
				] satisfies Column<(typeof lines)[number]>[]);
			},
		},
	];

	return (
		<>
			<PageHeader title="Export" back="/more" />
			<Stack gap="md">
				{files.map((f) => (
					<Card key={f.what}>
						<Stack gap="sm">
							<Title order={2} size="h4">
								{f.title}
							</Title>
							<Text size="sm" c="dimmed">
								{f.description}
							</Text>
							<Button
								variant="outline"
								disabled={f.rows === 0}
								onClick={() => save(f.what, f.build())}
							>
								{f.rows === 0
									? "Nothing to export yet"
									: `Download ${f.rows} ${f.rows === 1 ? "row" : "rows"}`}
							</Button>
						</Stack>
					</Card>
				))}
				{done ? (
					<Text size="sm" c="pine.7" fw={700} aria-live="polite">
						Saved to your downloads.
					</Text>
				) : null}
				<Text size="sm" c="dimmed">
					Files are built here on your device from what the app already has, so
					nothing new leaves the database. Dates are ISO so a spreadsheet reads
					them without arguing.
				</Text>
			</Stack>
		</>
	);
}
