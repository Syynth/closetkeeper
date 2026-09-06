/**
 * Nothing is emailed by this app yet. The invitation is a message the
 * inviter pastes wherever they already talk to the person. It says where
 * the app is, which email to use, and that there is no password.
 */
import { Button, Card, Stack, Text } from "@mantine/core";
import { useState } from "react";

export function invitationText({
	email,
	roleLabel,
}: {
	email: string;
	roleLabel: string;
}): string {
	const url = window.location.origin;
	return [
		`You've been added to Closetkeeper as ${roleLabel.toLowerCase()}.`,
		`Open ${url} and tap Log in, then enter ${email}.`,
		"There's no password. A sign-in link arrives by email; tap it and you're in.",
	].join("\n");
}

export function InviteMessage({
	email,
	roleLabel,
}: {
	email: string;
	roleLabel: string;
}) {
	const [copied, setCopied] = useState(false);
	const [fallback, setFallback] = useState(false);
	const text = invitationText({ email, roleLabel });

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setFallback(false);
		} catch {
			setFallback(true);
		}
	}

	return (
		<Card>
			<Stack gap="sm">
				<Text fw={700}>Invitation</Text>
				<Text size="sm" c="dimmed">
					Nothing is sent from here. Copy this and send it however you reach
					them.
				</Text>
				<Text style={{ whiteSpace: "pre-line" }} size="sm">
					{text}
				</Text>
				<Button size="md" variant="light" onClick={() => void copy()}>
					{copied ? "Copied" : "Copy invitation"}
				</Button>
				{fallback ? (
					<Text size="sm" c="clay">
						Couldn't reach the clipboard. Select the text above and copy it.
					</Text>
				) : null}
			</Stack>
		</Card>
	);
}
