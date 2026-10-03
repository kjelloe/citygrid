# Balance sweep — era 16

200 games per configuration, 25 years each.

Numbers below belong to **era 16**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1500 | 1788 | 2127 |
| treasury | 5299991 | 5755552 | 6100342 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5755552, p95 **6699156**
- industrial demand median -134, p95 **12**
- residential demand median -171
- pollution over developed land 1, over the whole region 4
- crime 3, congested tiles 9, stranded homes 9
- land value over developed land: p25 122, median **124**, p75 126
- power grid 1 components; dark buildings: power median 0 p95 3, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1456 | 1529 | 1963 |
| treasury | 3943504 | 4245981 | 4599803 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4245981, p95 **5093467**
- industrial demand median -58, p95 **5**
- residential demand median -60
- pollution over developed land 1, over the whole region 4
- crime 2, congested tiles 8, stranded homes 8
- land value over developed land: p25 122, median **124**, p75 127
- power grid 1 components; dark buildings: power median 0 p95 4, water median 0 p95 2 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1404 | 1514 | 1795 |
| treasury | 1775951 | 2086179 | 2301916 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **2**
- peak treasury median 2086179, p95 **2637084**
- industrial demand median -47, p95 **20**
- residential demand median -57
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 7, stranded homes 7
- land value over developed land: p25 118, median **122**, p75 124
- power grid 3 components; dark buildings: power median 1 p95 10, water median 0 p95 4 — in 2 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1472 | 1614 | 1991 |
| treasury | 4046209 | 4390592 | 4726788 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4390592, p95 **5208817**
- industrial demand median -56, p95 **26**
- residential demand median -58
- pollution over developed land 1, over the whole region 4
- crime 2, congested tiles 9, stranded homes 8
- land value over developed land: p25 123, median **126**, p75 128
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5093467** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **5** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
