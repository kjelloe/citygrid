# Balance sweep — era 8

200 games per configuration, 25 years each.

Numbers below belong to **era 8**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1825 | 2275 | 2799 |
| treasury | 4811885 | 5579001 | 6196726 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5579001, p95 **6879679**
- industrial demand median -420, p95 **290**
- residential demand median -305
- pollution over developed land 2, over the whole region 6
- crime 11, congested tiles 9, stranded homes 2

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1689 | 2290 | 2955 |
| treasury | 3530582 | 4431112 | 4879204 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4431112, p95 **5771990**
- industrial demand median -405, p95 **162**
- residential demand median -177
- pollution over developed land 2, over the whole region 7
- crime 12, congested tiles 10, stranded homes 3

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1402 | 1999 | 2541 |
| treasury | 1343486 | 1895509 | 2485322 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 1895509, p95 **2893524**
- industrial demand median -243, p95 **188**
- residential demand median -66
- pollution over developed land 1, over the whole region 6
- crime 12, congested tiles 6, stranded homes 2

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1858 | 2384 | 2818 |
| treasury | 3818576 | 4448131 | 4971126 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4448131, p95 **5523566**
- industrial demand median -415, p95 **205**
- residential demand median -227
- pollution over developed land 2, over the whole region 6
- crime 11, congested tiles 8, stranded homes 2

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5771990** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **162** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 7.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
