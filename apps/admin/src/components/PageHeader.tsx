import { Title } from "@mantine/core";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronLeft } from "./icons";
import classes from "./PageHeader.module.css";

/** Title row with an optional back link and something on the right. */
export function PageHeader({
	title,
	back,
	backParams,
	right,
}: {
	title: ReactNode;
	back?: LinkProps["to"];
	backParams?: LinkProps["params"];
	right?: ReactNode;
}) {
	return (
		<div className={classes.header}>
			{back ? (
				<Link
					to={back}
					params={backParams}
					className={classes.back}
					aria-label="Back"
				>
					<ChevronLeft />
				</Link>
			) : null}
			<Title order={1} className={classes.title}>
				{title}
			</Title>
			{right ? <div className={classes.right}>{right}</div> : null}
		</div>
	);
}
