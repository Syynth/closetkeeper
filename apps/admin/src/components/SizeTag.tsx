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
	...rest
}: {
	children: ReactNode;
	tone?: SizeTagTone;
	style?: CSSProperties;
	"aria-hidden"?: boolean;
	title?: string;
}) {
	return (
		<span className={classes.tag} data-tone={tone} style={style} {...rest}>
			{children}
		</span>
	);
}

const SIZES = [
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

/** A row of kids' sizes, the closet's own alphabet. Decorative; hidden from readers. */
export function SizeStrip() {
	return (
		<div className={classes.strip} aria-hidden="true">
			{SIZES.map((s, i) => (
				<SizeTag
					key={s}
					tone={i % 5 === 3 ? "pine" : "tape"}
					style={{ rotate: `${((i % 3) - 1) * 1.5}deg` }}
				>
					{s}
				</SizeTag>
			))}
		</div>
	);
}
