/**
 * The design system, as a Mantine theme.
 *
 * The subject is a garage closet of kids' clothes in Klamath County, used on
 * a phone by someone holding a bag. Everything here follows from that:
 *
 * - Colors come from the closet and the county: ponderosa pine green as the
 *   working color, masking-tape yellow for labels (bins are labelled with
 *   tape), bark brown for text, washed cotton for the page.
 * - Type is Atkinson Hyperlegible Next for everything read on a phone in a
 *   garage, and Bricolage Grotesque only for the wordmark and headings.
 * - Every control defaults to a 48px+ tap target. Three taps to log a bag.
 *
 * The one signature element is the size tag (see components/SizeTag.tsx):
 * a tape-yellow label used for roles, sizes, and statuses.
 */
import {
	type CSSVariablesResolver,
	createTheme,
	type MantineColorsTuple,
} from "@mantine/core";

const pine: MantineColorsTuple = [
	"#eef5ef",
	"#d8e8dc",
	"#b4d1bb",
	"#8db898",
	"#6ba27a",
	"#4f8d60",
	"#3f7a50",
	"#2f5d3a",
	"#244a2e",
	"#193422",
];

const tape: MantineColorsTuple = [
	"#fdf8e6",
	"#f9edc0",
	"#f4e096",
	"#eed36c",
	"#e9c46a",
	"#dcb24a",
	"#c99e34",
	"#a98226",
	"#87681c",
	"#664e13",
];

const clay: MantineColorsTuple = [
	"#fbeeeb",
	"#f3d3cc",
	"#e9b2a6",
	"#dc8c7c",
	"#cf6b58",
	"#c05543",
	"#b5533c",
	"#933f2d",
	"#752f21",
	"#582216",
];

const sky: MantineColorsTuple = [
	"#eef4fb",
	"#d6e4f4",
	"#b4cdea",
	"#8fb4de",
	"#6c9bc9",
	"#5384b3",
	"#3f6c98",
	"#2f557a",
	"#213e5b",
	"#15293d",
];

/** Warm greys mixed toward bark, for borders and muted text. */
const bark: MantineColorsTuple = [
	"#f3f4f1",
	"#e6e5e0",
	"#cfccc4",
	"#b3aea4",
	"#948d81",
	"#766e62",
	"#5d564b",
	"#463f36",
	"#332c25",
	"#2b221b",
];

export const BODY_FONT =
	"'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
export const DISPLAY_FONT =
	"'Bricolage Grotesque Variable', 'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";

export const theme = createTheme({
	primaryColor: "pine",
	primaryShade: 7,
	colors: { pine, tape, clay, sky, bark },
	black: "#2b221b",
	white: "#fffdf8",
	fontFamily: BODY_FONT,
	fontFamilyMonospace: "ui-monospace, 'SF Mono', Menlo, monospace",
	headings: {
		fontFamily: DISPLAY_FONT,
		fontWeight: "700",
		sizes: {
			h1: { fontSize: "2.25rem", lineHeight: "1.05" },
			h2: { fontSize: "1.5rem", lineHeight: "1.15" },
			h3: { fontSize: "1.2rem", lineHeight: "1.2" },
		},
	},
	fontSizes: {
		xs: "0.85rem",
		sm: "0.95rem",
		md: "1.0625rem",
		lg: "1.2rem",
		xl: "1.4rem",
	},
	defaultRadius: "md",
	radius: { sm: "6px", md: "10px", lg: "14px", xl: "20px" },
	cursorType: "pointer",
	focusRing: "always",
	components: {
		// Garage rules: nothing smaller than a thumb.
		Button: { defaultProps: { size: "lg", radius: "md" } },
		TextInput: { defaultProps: { size: "lg" } },
		Select: { defaultProps: { size: "lg" } },
		NativeSelect: { defaultProps: { size: "lg" } },
		Switch: { defaultProps: { size: "lg" } },
		Card: { defaultProps: { radius: "lg", padding: "lg", withBorder: true } },
		Badge: { defaultProps: { radius: "sm" } },
	},
});

/** Page ground and text are set here so Mantine's own components inherit them. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
	variables: {},
	light: {
		"--mantine-color-body": "#f3f4f1",
		"--mantine-color-text": "#2b221b",
		"--mantine-color-default-border": "#cfccc4",
		"--mantine-color-dimmed": "#5d564b",
		"--mantine-color-anchor": "#2f5d3a",
	},
	dark: {},
});
