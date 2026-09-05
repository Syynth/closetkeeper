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
	return (
		<div className={classes.marquee} data-direction={direction}>
			<div className={classes.track}>
				{doubled.map(({ s, copy }, i) => (
					<SizeTag
						key={`${copy}-${s}`}
						tone="tape"
						className={classes.blink}
						style={{
							animationDuration: `${7 + jitter(i, seed) * 9}s`,
							animationDelay: `-${(jitter(i, seed + 1) * 16).toFixed(2)}s`,
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
 * Two rows of kids' sizes sliding in opposite directions, each tag flipping
 * between tape and pine on its own slow cycle. The closet's own alphabet, as the sign-in
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
