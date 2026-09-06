// The style table (slice E3; spec §7.1).
//
// Data only — no three, so it can be loaded in a node test rather than read as
// source text. That is not a nicety: P1's tests had to grep this table for
// `rig:` and `shading:` because `styles.js` imports three for `createPost`, and
// a test that greps is a test that passes on a comment.
//
// Each style declares what lights it asks for, what material its surfaces are
// made of, and what finish sits on top. Nothing else in the renderer knows
// which style it got — that is the seam (ruling 017).

export const STYLES = {
  plain: {
    name: "plain",
    label: "Clean low-poly diorama",
    freeRotation: true,
    continuousZoom: true,
    // Three fields per style (spec §7.1): which lights it asks for, what
    // material its surfaces are made of, and what finish sits on top. Nothing
    // else in the renderer knows which style it got — that is the seam, and it
    // is what lets a fourth style exist without touching `instances.js`.
    rig: "soft",
    shading: "lambert",
    post: false,
  },
  pixel: {
    name: "pixel",
    label: "Pixel-art post-process",
    rig: "none",
    shading: "unlit",
    freeRotation: true,
    continuousZoom: false, // integer zoom steps keep the pixel grid stable
    post: true,
    // The name the quality tier and the frame-time governor know it by
    // (ruling 040): a pass is fill rate, and fill rate is what a phone runs
    // out of first.
    postPass: "pixel",
    // Divisor 4 put whole buildings inside one pixel, so the edge test fired
    // on nearly every pixel and darkened the entire image. Divisor 2 keeps the
    // pixel texture while leaving features big enough to have edges.
    resolutionDivisor: 2,
    // Six levels and a full-amplitude dither checkerboarded even the flat sky
    // and turned the whole city to mud. Ordered dithering is meant to hide a
    // quantisation step, not to become the texture.
    palette: 12,
    outline: 0.3,
    dither: 0.35,
  },
  passthrough: {
    name: "passthrough",
    label: "Post-process with no effect — a colour-space control",
    rig: "soft",
    shading: "lambert",
    freeRotation: true,
    continuousZoom: true,
    post: true,
    postPass: "pixel",
    resolutionDivisor: 1,
    palette: 0,
    outline: 0,
    dither: 0,
  },
  painted: {
    name: "painted",
    label: "Illustrated — toon ramp, warm key, cool fill",
    freeRotation: true,
    continuousZoom: true,
    // A REAL style since P1, not a lighting treatment on the same material:
    // the surfaces are toon-shaded through a ramp and the rig is a temperature
    // split rather than a dimmer (ruling 033, ruling 017's standard).
    rig: "anime",
    shading: "toon",
    ramp: "soft3",
    // No post-process at all. A screen-space outline fights detailed geometry:
    // with windows, sills and roof clutter, EVERY edge fires the edge test and
    // the image turns to mud — it read as dusk rather than as illustration.
    // This style is a lighting and palette treatment instead, which is what
    // separates an illustration from a photograph anyway.
    post: false,
  },
};
