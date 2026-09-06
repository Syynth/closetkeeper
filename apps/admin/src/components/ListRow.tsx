/**
 * A tappable row: title, optional detail, something on the right, and a
 * chevron when it leads somewhere. Thumb-height. Used for every list in
 * the admin screens so they all feel like one app.
 */
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronRight } from "./icons";
import classes from "./ListRow.module.css";

export function ListRow({
	title,
	detail,
	right,
	to,
	params,
	onClick,
}: {
	title: ReactNode;
	detail?: ReactNode;
	right?: ReactNode;
	to?: LinkProps["to"];
	params?: LinkProps["params"];
	onClick?: () => void;
}) {
	const inner = (
		<>
			<span className={classes.text}>
				<span className={classes.title}>{title}</span>
				{detail ? <span className={classes.detail}>{detail}</span> : null}
			</span>
			<span className={classes.right}>
				{right}
				{to || onClick ? <ChevronRight className={classes.chevron} /> : null}
			</span>
		</>
	);
	if (to) {
		return (
			<Link to={to} params={params} className={classes.row}>
				{inner}
			</Link>
		);
	}
	if (onClick) {
		return (
			<button type="button" onClick={onClick} className={classes.row}>
				{inner}
			</button>
		);
	}
	return <div className={classes.row}>{inner}</div>;
}

export function ListGroup({
	label,
	children,
}: {
	label?: string;
	children: ReactNode;
}) {
	return (
		<section className={classes.group}>
			{label ? <h2 className={classes.groupLabel}>{label}</h2> : null}
			<div className={classes.groupBody}>{children}</div>
		</section>
	);
}
