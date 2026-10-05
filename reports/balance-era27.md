# Balance sweep — era 27

200 games per configuration, 25 years each.

Numbers below belong to **era 27**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1487 | 1688 | 2039 |
| treasury | 4910674 | 5514982 | 5936740 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5514982, p95 **6383686**
- industrial demand median -108, p95 **25**
- residential demand median -114
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 11, stranded homes 4
- land value over developed land: p25 135, median **137**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1487 | 1602 | 1981 |
| treasury | 3632191 | 3925393 | 4325184 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3925393, p95 **4900667**
- industrial demand median -62, p95 **15**
- residential demand median -69
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 12, stranded homes 4
- land value over developed land: p25 134, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1394 | 1551 | 1702 |
| treasury | 1731203 | 2065207 | 2387689 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 2065207, p95 **2732808**
- industrial demand median -52, p95 **14**
- residential demand median -54
- pollution over developed land 2, over the whole region 5
- crime 1, congested tiles 8, stranded homes 4
- land value over developed land: p25 131, median **135**, p75 140
- power grid 1 components; dark buildings: power median 0 p95 3, water median 0 p95 2 — in 2 of 200 cities the demand genuinely exceeded the capacity

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

Peak treasury p95 is **4900667** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **15** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
