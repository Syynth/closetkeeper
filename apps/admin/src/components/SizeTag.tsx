/**
 * The size tag: a masking-tape label, the way bins in the closet are
 * labelled. Used for roles, sizes, statuses, and the ambient strip on the
 * sign-in page. The one place the design spends its personality, so keep
 * it consistent: tape yellow, bark text, a hand-cut corner.
 */
import type { CSSProperties, ReactNode } from "react";
import classes from "./SizeTag.module.css";

export type SizeTagTone = "tape" | "pine" | "clay" | "muted";

export function SizeTag({
	children,
	tone = "tape",
	style,
	className,
	...rest
}: {
	children: ReactNode;
	tone?: SizeTagTone;
	style?: CSSProperties;
	className?: string;
	"aria-hidden"?: boolean;
	title?: string;
}) {
	return (
		<span
			className={className ? `${classes.tag} ${className}` : classes.tag}
			data-tone={tone}
			style={style}
			{...rest}
		>
			{children}
		</span>
	);
}

const SIZES_A = [
	"12m",
	"18m",
	"2T",
	"3T",
	"4T",
	"5",
	"6",
	"7",
	"8",
	"10",
	"12",
	"youth S",
	"youth M",
	"youth L",
];
const SIZES_B = [
	"youth L",
	"10",
	"4T",
	"18m",
	"youth M",
	"6",
	"2T",
	"12",
	"3T",
	"youth S",
	"8",
	"12m",
	"5",
	"7",
];

/** Deterministic pseudo-random per index, so the blink pattern never looks periodic. */
function jitter(i: number, seed: number) {
	const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
	return x - Math.floor(x);
}

/** The shared cycle every tag follows; each tag takes its green turn at a different offset. */
const CYCLE_SECONDS = 36;

function MarqueeRow({
	sizes,
	direction,
	seed,
}: {
	sizes: string[];
	direction: "left" | "right";
	seed: number;
}) {
	// The track holds the list twice so the loop is seamless; each copy is
	// named so keys stay stable without leaning on array position.
	const doubled = [
		...sizes.map((s) => ({ s, copy: "a" })),
		...sizes.map((s) => ({ s, copy: "b" })),
	];
	// Turns are spread evenly across the cycle but handed out in a scrambled
	// order, so a quarter of the tags are green at once (about three of the
	// visible ones) and neighbours rarely are. Both copies of a size share
	// one phase: when the track wraps, the tag that slides in is in the same
	// state as the one that slid out, so the loop point is invisible.
	const turns = sizes
		.map((_, i) => ({ i, r: jitter(i, seed) }))
		.sort((a, b) => a.r - b.r)
		.map((x) => x.i);
	const offsetOf = new Map(
		turns.map((i, rank) => [i, (rank / sizes.length) * CYCLE_SECONDS]),
	);
	return (
		<div className={classes.marquee} data-direction={direction}>
			<div className={classes.track}>
				{doubled.map(({ s, copy }, i) => (
					<SizeTag
						key={`${copy}-${s}`}
						tone="tape"
						className={classes.blink}
						style={{
							animationDuration: `${CYCLE_SECONDS}s`,
							animationDelay: `-${(offsetOf.get(i % sizes.length) ?? 0).toFixed(2)}s`,
						}}
					>
						{s}
					</SizeTag>
				))}
			</div>
		</div>
	);
}

/**
 * Two rows of kids' sizes sliding in opposite directions. Tags take turns
 * being pine, about three at a time, on one shared slow cycle. The closet's own alphabet, as the sign-in
 * page's only image. Decorative and hidden from readers; still under
 * prefers-reduced-motion.
 */
export function SizeMarquee() {
	return (
		<div className={classes.marqueeStack} aria-hidden="true">
			<MarqueeRow sizes={SIZES_A} direction="left" seed={1} />
			<MarqueeRow sizes={SIZES_B} direction="right" seed={2} />
		</div>
	);
}
