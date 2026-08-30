// Interface skins (P29).
//
// **Chrome only.** Kjell's call: the world keeps `plain` and ruling 022 stands,
// so a skin is a set of CSS custom properties and nothing else. That is why
// this file has no colours in it — they live in `style.css` under
// `:root[data-skin="..."]`, where the stylesheet can use `color-mix` and the
// cascade rather than having JavaScript compute them.
//
// The skin is a preference, like contrast and language: it lives in
// `localStorage`, never in state, because two players with different skins must
// still agree about the world.

export const SKINS = [
  // Named in the catalogue like everything else. `clean` is the default and is
  // what every screenshot in `specs/art-direction.md` shows.
  { value: "clean", labelKey: "skin.clean" },
  { value: "retro", labelKey: "skin.retro" },
  { value: "dark", labelKey: "skin.dark" },
];

export const DEFAULT_SKIN = "clean";

export function isSkin(value) {
  return SKINS.some((skin) => skin.value === value);
}

/** The attribute the stylesheet reads. `clean` returns "" so the default skin
 * is the bare `:root` rules rather than a third copy of them. */
export function skinAttribute(skin) {
  return skin === DEFAULT_SKIN || !isSkin(skin) ? "" : skin;
}
