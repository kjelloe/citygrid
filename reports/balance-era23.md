# Balance sweep — era 23

200 games per configuration, 25 years each.

Numbers below belong to **era 23**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1512 | 1821 | 2051 |
| treasury | 5137885 | 5569886 | 5937391 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5569886, p95 **6498412**
- industrial demand median -136, p95 **38**
- residential demand median -125
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 10, stranded homes 5
- land value over developed land: p25 134, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 1 — in 1 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1495 | 1615 | 1953 |
| treasury | 3698410 | 4041198 | 4337637 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4041198, p95 **4959171**
- industrial demand median -69, p95 **29**
- residential demand median -70
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 12, stranded homes 6
- land value over developed land: p25 134, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1466 | 1566 | 1767 |
| treasury | 1817481 | 2091379 | 2312116 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2091379, p95 **2693812**
- industrial demand median -53, p95 **17**
- residential demand median -62
- pollution over developed land 2, over the whole region 5
- crime 1, congested tiles 10, stranded homes 5
- land value over developed land: p25 132, median **136**, p75 139
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 3 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1501 | 1569 | 1957 |
| treasury | 3677803 | 4037923 | 4306014 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4037923, p95 **4806066**
- industrial demand median -52, p95 **25**
- residential demand median -63
- pollution over developed land 1, over the whole region 4
- crime 0, congested tiles 11, stranded homes 6
- land value over developed land: p25 136, median **139**, p75 142
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 1 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **4959171** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **29** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
