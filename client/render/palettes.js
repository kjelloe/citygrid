// Style palettes.
//
// A pure module with no three.js import, so tools and tests can read the real
// colours rather than a copy of them. The colour-vision test and the art
// direction page both depend on that.

export const PALETTES = {
  // Soft, desaturated, cosy. A toy left on a table by a window.
  plain: {
    sky: 0xbfe0f0,
    // Vivid, cheerful, high-contrast — the reference's grass is almost
    // luminous and its water is cyan rather than navy. A cosy toy world does
    // not use realistic colours.
    terrain: [0x62c144, 0xc0a274, 0x3f9b34, 0x39c5e8, 0xa8ecfa, 0xa8a49e, 0xf0dfae, 0x74a05c],
    tree: 0x2f8f3a,
    zone: [0x000000, 0xefc9a4, 0x8fd0f0, 0xd9a45c],
    road: 0x6f7278,
    roadMark: 0xf2f2f2,
    wire: 0x8a8377,
    lamp: 0xb8bcc0,
    lawn: 0x6fce4c,
    civic: 0xd8d2c6,
    // Roofs are their own hue, not a darker wall. Houses get tile and slate;
    // everything else gets the flat grey-black of felt and gravel, which is
    // also what separates a terrace from an office block at a glance.
    roof: {
      house: [0xd4623a, 0xe07a45, 0xb8422c, 0x94302a, 0x5d6d80, 0x404a5c, 0x334152, 0x3b7358],
      flat: [0x4e535b, 0x424750, 0x5c6169, 0x6b6459],
    },
    roofFactor: 1.0,
    bandFactor: 1.0,
  },
  // Fewer, harder, more saturated colours. Deliberately reads as a limited
  // palette rather than as a lit 3D scene.
  pixel: {
    sky: 0x58a8d8,
    terrain: [0x58b038, 0xa8804a, 0x2f8830, 0x2878b8, 0x8fd8f0, 0x8f8f98, 0xe8d078, 0x5a8848],
    tree: 0x1f7a2f,
    zone: [0x000000, 0xe8b888, 0x58a8e8, 0xd89838],
    road: 0x5f6068,
    roadMark: 0xe8e4d8,
    wire: 0x7a7468,
    lamp: 0xa8acb0,
    lawn: 0x68c040,
    civic: 0xa8a098,
    roof: {
      house: [0xe05828, 0xf07838, 0xb83820, 0x982818, 0x587898, 0x384858, 0x283848, 0x308068],
      flat: [0x484f58, 0x383f48, 0x585f68, 0x686050],
    },
    roofFactor: 0.72,
    bandFactor: 0.85,
  },
  // Illustrated: a toon ramp, a warm key and a cool fill (slice P1).
  //
  // The ground is DESATURATED and the built things are warm, which is the
  // opposite arrangement from `plain` and the reason the two do not look like
  // the same city with a filter on it (ruling 017). A quantising ramp makes
  // saturation read harder than it does under Lambert, so a vivid ground under
  // it becomes a poster; dropping it back lets the roofs and the walls carry
  // the colour, which is what the reference does.
  //
  // The old palette had grass and dirt collapsing for a deuteranope at 0.042 —
  // nothing tested a style palette until P1, and that is the first thing the
  // test found. They are separated here by luminance as well as by hue.
  painted: {
    sky: 0xd8e2ea,
    terrain: [0x86ad72, 0xcfae86, 0x4f7f52, 0x4f9ec4, 0xa9d6e4, 0x9d9aa4, 0xe8d8b0, 0x7c8f6a],
    tree: 0x477a48,
    zone: [0x000000, 0xe8c4a2, 0xa6c4dc, 0xd2ab72],
    road: 0x76727e,
    roadMark: 0xe6dcc4,
    wire: 0x8b8378,
    lamp: 0xbcbcc4,
    lawn: 0x93bd78,
    civic: 0xe0cdb2,
    roof: {
      house: [0xc85a38, 0xd87244, 0xa63e30, 0x8a2c26, 0x586680, 0x3c4757, 0x2f3b4a, 0x376c54],
      flat: [0x484d55, 0x3d424a, 0x565b63, 0x655f55],
    },
    roofFactor: 0.62,
    bandFactor: 0.74,
  },
};

