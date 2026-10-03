# Balance sweep — era 14

200 games per configuration, 25 years each.

Numbers below belong to **era 14**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1702 | 2323 | 2828 |
| treasury | 5981508 | 6538278 | 6989240 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 6538278, p95 **7727099**
- industrial demand median -254, p95 **20**
- residential demand median -253
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 14, stranded homes 10
- power grid 1 components; dark buildings: power median 0 p95 3, water median 0 p95 2 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1516 | 2132 | 2821 |
| treasury | 4486996 | 4969968 | 5340404 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4969968, p95 **5960790**
- industrial demand median -172, p95 **7**
- residential demand median -152
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 11, stranded homes 11
- power grid 1 components; dark buildings: power median 0 p95 5, water median 0 p95 3 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1468 | 1629 | 2312 |
| treasury | 1977812 | 2291919 | 2539549 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2291919, p95 **2998025**
- industrial demand median -88, p95 **31**
- residential demand median -102
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 10, stranded homes 9
- power grid 4 components; dark buildings: power median 1 p95 14, water median 0 p95 7 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1462 | 1891 | 2718 |
| treasury | 4276709 | 4875503 | 5293759 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4875503, p95 **6103295**
- industrial demand median -99, p95 **21**
- residential demand median -117
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 10, stranded homes 11
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5960790** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **7** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 5.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
