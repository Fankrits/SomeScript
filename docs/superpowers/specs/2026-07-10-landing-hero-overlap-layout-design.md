# Landing Hero Overlap Layout Design

## Goal

Recompose the landing hero so the headline and actions sit in the center of two deliberately overlapping product previews: the code editor is anchored at the lower left and the PDF preview is anchored at the upper right.

## Layout

On desktop, the hero keeps the existing ShaderGradient background. The headline, supporting copy, and CTA are centered above the preview composition. The preview canvas becomes wider and taller, with the editor scaled larger and offset down-left and the PDF preview scaled larger and offset up-right. Their overlap frames the centered message rather than competing with it.

On small screens, the headline and CTA remain first. The PDF preview and editor switch to a vertical stack with no overlap so their labels, code, and document content remain readable.

## Components

- `HeroMockup` owns the responsive positioning and sizing of the editor and PDF preview cards.
- `page.tsx` supplies the centered hero copy and reserves sufficient vertical room for the larger desktop composition.
- `HeroBackground` remains unchanged and continues to provide the dark ShaderGradient backdrop.

## Responsive behavior

- Desktop (`lg` and wider): large overlapping editor/PDF composition.
- Tablet: reduced overlap and smaller card dimensions.
- Mobile: normal-flow PDF then editor stack.

## Verification

- Add a source-level regression check for desktop anchors and mobile stack classes.
- Run targeted lint, TypeScript, and production build.
- Capture a production browser screenshot at desktop and mobile widths to verify hierarchy and readability.
