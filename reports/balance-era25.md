# Balance sweep — era 25

200 games per configuration, 25 years each.

Numbers below belong to **era 25**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1495 | 1764 | 2048 |
| treasury | 4872245 | 5454800 | 5890039 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5454800, p95 **6559978**
- industrial demand median -103, p95 **21**
- residential demand median -122
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 11, stranded homes 5
- land value over developed land: p25 134, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 1 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1500 | 1604 | 1877 |
| treasury | 3636875 | 3935390 | 4312425 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3935390, p95 **4922676**
- industrial demand median -49, p95 **34**
- residential demand median -78
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 12, stranded homes 4
- land value over developed land: p25 135, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 2, water median 0 p95 1 — in 1 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1343 | 1520 | 1660 |
| treasury | 1604630 | 1991057 | 2293503 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 1991057, p95 **2676523**
- industrial demand median -53, p95 **11**
- residential demand median -58
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 9, stranded homes 3
- land value over developed land: p25 131, median **135**, p75 139
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 1 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1491 | 1580 | 1979 |
| treasury | 3632567 | 3969072 | 4305268 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3969072, p95 **4894736**
- industrial demand median -62, p95 **32**
- residential demand median -65
- pollution over developed land 2, over the whole region 4
- crime 0, congested tiles 12, stranded homes 4
- land value over developed land: p25 135, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **4922676** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **34** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
