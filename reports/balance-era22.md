# Balance sweep — era 22

200 games per configuration, 25 years each.

Numbers below belong to **era 22**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1512 | 1821 | 2051 |
| treasury | 5435364 | 5885646 | 6277672 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5885646, p95 **6842398**
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
| treasury | 4049916 | 4417256 | 4712869 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4417256, p95 **5385414**
- industrial demand median -69, p95 **29**
- residential demand median -70
- pollution over developed land 2, over the whole region 4
- crime 1, congested tiles 12, stranded homes 6
- land value over developed land: p25 134, median **138**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1382 | 1544 | 1703 |
| treasury | 1611597 | 1909021 | 2124667 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 1909021, p95 **2442715**
- industrial demand median -49, p95 **17**
- residential demand median -54
- pollution over developed land 2, over the whole region 5
- crime 0, congested tiles 10, stranded homes 5
- land value over developed land: p25 132, median **136**, p75 139
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 2 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1501 | 1569 | 1957 |
| treasury | 4056850 | 4383761 | 4697271 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4383761, p95 **5194923**
- industrial demand median -52, p95 **25**
- residential demand median -63
- pollution over developed land 1, over the whole region 4
- crime 0, congested tiles 11, stranded homes 6
- land value over developed land: p25 136, median **139**, p75 142
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 1 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5385414** on steady-64.

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
