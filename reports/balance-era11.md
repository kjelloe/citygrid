# Balance sweep — era 11

200 games per configuration, 25 years each.

Numbers below belong to **era 11**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1824 | 2410 | 3040 |
| treasury | 4566721 | 5853327 | 6466710 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5853327, p95 **7317819**
- industrial demand median -538, p95 **306**
- residential demand median -269
- pollution over developed land 2, over the whole region 5
- crime 4, congested tiles 13, stranded homes 5

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1772 | 2253 | 2818 |
| treasury | 3640342 | 4371940 | 4914294 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 4371940, p95 **5620637**
- industrial demand median -414, p95 **218**
- residential demand median -189
- pollution over developed land 1, over the whole region 5
- crime 4, congested tiles 12, stranded homes 5

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1368 | 2038 | 2599 |
| treasury | 1090499 | 1877509 | 2341169 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **2**
- peak treasury median 1877509, p95 **2811224**
- industrial demand median -215, p95 **262**
- residential demand median -62
- pollution over developed land 1, over the whole region 5
- crime 4, congested tiles 7, stranded homes 5

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1770 | 2312 | 2904 |
| treasury | 3380791 | 4582936 | 5086712 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4582936, p95 **5837036**
- industrial demand median -358, p95 **224**
- residential demand median -157
- pollution over developed land 2, over the whole region 5
- crime 4, congested tiles 14, stranded homes 5

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5620637** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **218** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 5.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
