# Balance sweep — era 19

200 games per configuration, 25 years each.

Numbers below belong to **era 19**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1504 | 1787 | 2115 |
| treasury | 5956073 | 6211682 | 6559674 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 6211682, p95 **7259176**
- industrial demand median -118, p95 **23**
- residential demand median -133
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 11, stranded homes 9
- land value over developed land: p25 134, median **136**, p75 139
- power grid 1 components; dark buildings: power median 0 p95 1, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1491 | 1598 | 1989 |
| treasury | 4368211 | 4686210 | 4994118 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4686210, p95 **5559510**
- industrial demand median -77, p95 **11**
- residential demand median -85
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 8, stranded homes 10
- land value over developed land: p25 133, median **137**, p75 141
- power grid 1 components; dark buildings: power median 0 p95 2, water median 0 p95 1 — in 0 of 200 cities the demand genuinely exceeded the capacity

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1441 | 1537 | 1775 |
| treasury | 2047234 | 2319469 | 2615611 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 2319469, p95 **2961267**
- industrial demand median -48, p95 **16**
- residential demand median -59
- pollution over developed land 1, over the whole region 5
- crime 1, congested tiles 8, stranded homes 7
- land value over developed land: p25 132, median **135**, p75 139
- power grid 2 components; dark buildings: power median 0 p95 3, water median 0 p95 2 — in 0 of 200 cities the demand genuinely exceeded the capacity

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1485 | 1559 | 1921 |
| treasury | 4502599 | 4777787 | 5184548 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4777787, p95 **5739087**
- industrial demand median -63, p95 **9**
- residential demand median -69
- pollution over developed land 1, over the whole region 4
- crime 1, congested tiles 10, stranded homes 8
- land value over developed land: p25 136, median **138**, p75 142
- power grid 1 components; dark buildings: power median 0 p95 0, water median 0 p95 0 — in 0 of 200 cities the demand genuinely exceeded the capacity

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5559510** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **11** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 4.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
