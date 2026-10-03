# Balance sweep — era 21

200 games per configuration, 25 years each.

Numbers below belong to **era 21**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1496 | 1755 | 2130 |
| treasury | 5597457 | 5955132 | 6325273 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5955132, p95 **6847140**
- industrial demand median -124, p95 **14**
- residential demand median -123
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 9, stranded homes 10
- land value over developed land: p25 134, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1496 | 1634 | 2032 |
| treasury | 3994332 | 4302889 | 4633927 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4302889, p95 **5266677**
- industrial demand median -84, p95 **-5**
- residential demand median -76
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 8, stranded homes 9
- land value over developed land: p25 134, median **137**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1444 | 1529 | 1690 |
| treasury | 1695823 | 1961318 | 2152759 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 1961318, p95 **2555678**
- industrial demand median -53, p95 **12**
- residential demand median -56
- pollution over developed land 2, over the whole region 5
- crime 1, congested tiles 8, stranded homes 8
- land value over developed land: p25 132, median **136**, p75 139
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 3 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1485 | 1557 | 1959 |
| treasury | 4112532 | 4438978 | 4801529 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4438978, p95 **5257741**
- industrial demand median -61, p95 **17**
- residential demand median -68
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 10, stranded homes 9
- land value over developed land: p25 135, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5266677** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **-5** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
