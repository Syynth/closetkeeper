/** The few icons the app uses. Stroke-based, 24px grid, one style. */
import type { SVGProps } from "react";

function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
	return (
		<svg
			width="22"
			height="22"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...rest}
		>
			{children}
		</svg>
	);
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
		</Icon>
	);
}

export function MoreIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props} fill="currentColor" stroke="none">
			<circle cx="5" cy="12" r="2" />
			<circle cx="12" cy="12" r="2" />
			<circle cx="19" cy="12" r="2" />
		</Icon>
	);
}

export function ChevronRight(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon width="20" height="20" {...props}>
			<path d="M9 6l6 6-6 6" />
		</Icon>
	);
}

export function ChevronLeft(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon {...props}>
			<path d="M15 6l-6 6 6 6" />
		</Icon>
	);
}

export function LockIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<Icon width="14" height="14" strokeWidth="2.2" {...props}>
			<rect x="5" y="11" width="14" height="10" rx="2" />
			<path d="M8 11V7a4 4 0 0 1 8 0v4" />
		</Icon>
	);
}
