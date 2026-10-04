# Balance sweep — era 26

200 games per configuration, 25 years each.

Numbers below belong to **era 26**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1495 | 1749 | 2027 |
| treasury | 4891238 | 5470276 | 5925420 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5470276, p95 **6632300**
- industrial demand median -101, p95 **35**
- residential demand median -117
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 10, stranded homes 5
- land value over developed land: p25 134, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1491 | 1600 | 1955 |
| treasury | 3634219 | 3958856 | 4298906 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3958856, p95 **4922666**
- industrial demand median -49, p95 **14**
- residential demand median -81
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 11, stranded homes 4
- land value over developed land: p25 134, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 2, water median 0 p95 1 — in 1 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1252 | 1511 | 1644 |
| treasury | 1572890 | 1982663 | 2313417 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 1982663, p95 **2676523**
- industrial demand median -52, p95 **11**
- residential demand median -60
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 9, stranded homes 3
- land value over developed land: p25 131, median **135**, p75 139
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 2 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1487 | 1565 | 1979 |
| treasury | 3683809 | 3954755 | 4305268 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3954755, p95 **4858971**
- industrial demand median -58, p95 **39**
- residential demand median -60
- pollution over developed land 2, over the whole region 4
- crime 0, congested tiles 10, stranded homes 4
- land value over developed land: p25 135, median **138**, p75 142
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **4922666** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **14** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
