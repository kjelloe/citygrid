// A lot divided into units, in world metres (S10's mapping, shared at S16a).
//
// `homes.js` worked out where a house on a lot actually is: `u` along the
// frontage, `v` back from the street, mapped to x and z through the lot's
// `frontage` side. S16a needs the identical arithmetic for a parade of shops
// and a row of sheds, and this project has a standing receipt for what copying
// it would cost — a second reader of one idea is a second chance to get the
// order backwards, and backwards here puts the delivery yard on the pavement
// and the shopfronts in the back alley.
//
// Pure, no three, no DOM, no clock (ruling 032).

/** The lot's size as the form sees it: along the street, and back from it. */
export function lotSpan(lot) {
  const alongX = lot.frontage === 0 || lot.frontage === 2;
  return {
    alongX,
    widthM: alongX ? lot.x1 - lot.x0 : lot.z1 - lot.z0,
    depthM: alongX ? lot.z1 - lot.z0 : lot.x1 - lot.x0,
  };
}

/**
 * Units in lot-local fractions → sub-lots in world metres.
 *
 * A sub-lot IS a lot: same `building`, same `frontage`, same `seat`, a smaller
 * box. Everything downstream — the facade grammar, S9's furniture, the props —
 * works on it unchanged, which is what makes both ladders renderer-only.
 *
 * `index` is kept as `houseIndex` because that is the name `facade-spec.js`
 * salts its hash with (`building.id * 8 + houseIndex`); a shop with no index is
 * a parade of identical shops with the same name over every door.
 */
export function placeUnits(lot, units) {
  const { alongX } = lotSpan(lot);
  return units.map((unit, index) => {
    const span = (a, b, lo, hi) => [lo + (hi - lo) * a, lo + (hi - lo) * b];
    let x0; let x1; let z0; let z1;
    if (lot.frontage === 0) {
      [x0, x1] = span(unit.u0, unit.u1, lot.x0, lot.x1);
      [z0, z1] = span(unit.v0, unit.v1, lot.z0, lot.z1);
    } else if (lot.frontage === 2) {
      [x0, x1] = span(1 - unit.u1, 1 - unit.u0, lot.x0, lot.x1);
      [z0, z1] = span(1 - unit.v1, 1 - unit.v0, lot.z0, lot.z1);
    } else if (lot.frontage === 1) {
      [z0, z1] = span(unit.u0, unit.u1, lot.z0, lot.z1);
      [x0, x1] = span(1 - unit.v1, 1 - unit.v0, lot.x0, lot.x1);
    } else {
      [z0, z1] = span(1 - unit.u1, 1 - unit.u0, lot.z0, lot.z1);
      [x0, x1] = span(unit.v0, unit.v1, lot.x0, lot.x1);
    }
    return {
      ...lot,
      x0, z0, x1, z1,
      cx: (x0 + x1) / 2,
      cz: (z0 + z1) / 2,
      frontageLen: alongX ? x1 - x0 : z1 - z0,
      storeys: unit.storeys,
      roofKind: unit.roof,
      party: unit.party === true,
      houseIndex: index,
    };
  });
}
