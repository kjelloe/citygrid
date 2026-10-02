# Balance sweep — era 13

200 games per configuration, 25 years each.

Numbers below belong to **era 13**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1477 | 1961 | 2482 |
| treasury | 4691130 | 5605661 | 6214235 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5605661, p95 **7118102**
- industrial demand median -220, p95 **85**
- residential demand median -237
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 8, stranded homes 6

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1463 | 1894 | 2507 |
| treasury | 3158385 | 4088180 | 4665386 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4088180, p95 **5295222**
- industrial demand median -173, p95 **67**
- residential demand median -91
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 6, stranded homes 5

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1091 | 1469 | 1850 |
| treasury | 876234 | 1507860 | 2051042 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 1507860, p95 **2550305**
- industrial demand median -51, p95 **183**
- residential demand median -45
- pollution over developed land 1, over the whole region 5
- crime 4, congested tiles 5, stranded homes 3

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1449 | 1903 | 2477 |
| treasury | 3390252 | 4232587 | 4736783 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4232587, p95 **5559682**
- industrial demand median -197, p95 **61**
- residential demand median -139
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 8, stranded homes 5

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5295222** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **67** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 5.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
