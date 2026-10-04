# Balance sweep — era 24

200 games per configuration, 25 years each.

Numbers below belong to **era 24**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1509 | 1800 | 2049 |
| treasury | 4904135 | 5454066 | 5873453 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5454066, p95 **6613557**
- industrial demand median -104, p95 **92**
- residential demand median -106
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 9, stranded homes 4
- land value over developed land: p25 135, median **137**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1487 | 1585 | 1923 |
| treasury | 3539739 | 3908693 | 4286666 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3908693, p95 **4908616**
- industrial demand median -53, p95 **27**
- residential demand median -68
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 12, stranded homes 4
- land value over developed land: p25 135, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 2, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1410 | 1541 | 1709 |
| treasury | 1759544 | 2073086 | 2298360 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2073086, p95 **2689190**
- industrial demand median -57, p95 **10**
- residential demand median -58
- pollution over developed land 2, over the whole region 5
- crime 1, congested tiles 9, stranded homes 4
- land value over developed land: p25 131, median **135**, p75 139
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 2 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1494 | 1568 | 1964 |
| treasury | 3634398 | 3977202 | 4227357 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3977202, p95 **4917436**
- industrial demand median -58, p95 **6**
- residential demand median -60
- pollution over developed land 1, over the whole region 4
- crime 0, congested tiles 12, stranded homes 5
- land value over developed land: p25 135, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 1 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **4908616** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **27** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
