# Balance sweep — era 15

200 games per configuration, 25 years each.

Numbers below belong to **era 15**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1467 | 1769 | 2122 |
| treasury | 5149522 | 5655621 | 6014770 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5655621, p95 **6527767**
- industrial demand median -149, p95 **30**
- residential demand median -120
- pollution over developed land 1, over the whole region 4
- crime 3, congested tiles 8, stranded homes 9
- power grid 1 components; dark buildings: power median 0 p95 3, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1466 | 1660 | 1997 |
| treasury | 3973816 | 4351850 | 4689638 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4351850, p95 **5180244**
- industrial demand median -88, p95 **32**
- residential demand median -76
- pollution over developed land 1, over the whole region 4
- crime 2, congested tiles 8, stranded homes 6
- power grid 1 components; dark buildings: power median 0 p95 4, water median 0 p95 2 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1416 | 1515 | 1764 |
| treasury | 1766041 | 2027014 | 2278848 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **2**
- peak treasury median 2027014, p95 **2572787**
- industrial demand median -49, p95 **26**
- residential demand median -52
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 9, stranded homes 6
- power grid 2 components; dark buildings: power median 0 p95 12, water median 0 p95 5 — in 3 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1458 | 1534 | 1961 |
| treasury | 3904754 | 4267498 | 4629346 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4267498, p95 **5197704**
- industrial demand median -52, p95 **10**
- residential demand median -60
- pollution over developed land 1, over the whole region 4
- crime 2, congested tiles 9, stranded homes 7
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5180244** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **32** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
