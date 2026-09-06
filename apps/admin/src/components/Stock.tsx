/**
 * The small pieces the stock screens share: the count stepper you can work
 * with a thumb, the faint histogram behind a category row, and a size cell
 * filled in proportion to what it holds.
 */
import { Text } from "@mantine/core";
import classes from "./Stock.module.css";

export function Stepper({
	value,
	onChange,
	max,
	label,
}: {
	value: number;
	onChange: (n: number) => void;
	max?: number;
	label: string;
}) {
	const ceiling = max ?? Number.MAX_SAFE_INTEGER;
	return (
		<div className={classes.stepper}>
			<button
				type="button"
				className={classes.step}
				onClick={() => onChange(Math.max(1, value - 1))}
				disabled={value <= 1}
				aria-label={`One fewer ${label}`}
			>
				−
			</button>
			<span className={classes.stepValue} aria-live="polite">
				{value}
			</span>
			<button
				type="button"
				className={classes.step}
				onClick={() => onChange(Math.min(ceiling, value + 1))}
				disabled={value >= ceiling}
				aria-label={`One more ${label}`}
			>
				+
			</button>
		</div>
	);
}

/** What a category holds across its sizes. Decorative: the numbers are elsewhere. */
export function Histogram({ counts }: { counts: readonly number[] }) {
	if (counts.length === 0) return null;
	const top = Math.max(...counts, 1);
	return (
		<div className={classes.histogram} aria-hidden="true">
			{counts.map((n, i) => (
				<i
					// biome-ignore lint/suspicious/noArrayIndexKey: bars are positions, not identities
					key={i}
					data-empty={n === 0 ? "true" : undefined}
					style={{ height: `${Math.max(6, Math.round((n / top) * 100))}%` }}
				/>
			))}
		</div>
	);
}

export function SizeCell({
	label,
	count,
	max,
	onClick,
}: {
	label: string;
	count: number;
	max: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={classes.cell}
			data-empty={count === 0 ? "true" : undefined}
			onClick={onClick}
		>
			{count > 0 ? (
				<span
					className={classes.fill}
					style={{ height: `${Math.round((count / Math.max(max, 1)) * 100)}%` }}
					aria-hidden="true"
				/>
			) : null}
			<span className={classes.cellSize}>{label}</span>
			<span className={classes.cellCount}>{count}</span>
		</button>
	);
}

export function Empty({ children }: { children: React.ReactNode }) {
	return (
		<Text c="dimmed" ta="center" py="xl">
			{children}
		</Text>
	);
}
