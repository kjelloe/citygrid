# Balance sweep — era 12

200 games per configuration, 25 years each.

Numbers below belong to **era 12**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1421 | 1711 | 2403 |
| treasury | 3999869 | 5349962 | 6165191 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 5349962, p95 **7306748**
- industrial demand median -159, p95 **143**
- residential demand median -112
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 8, stranded homes 5

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1451 | 1758 | 2234 |
| treasury | 3047154 | 3978820 | 4507795 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 3978820, p95 **5520523**
- industrial demand median -106, p95 **62**
- residential demand median -81
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 6, stranded homes 5

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 776 | 1490 | 1900 |
| treasury | 788269 | 1653181 | 2206999 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **3**
- peak treasury median 1653181, p95 **2760904**
- industrial demand median -47, p95 **168**
- residential demand median -48
- pollution over developed land 1, over the whole region 5
- crime 4, congested tiles 4, stranded homes 3

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1472 | 1790 | 2460 |
| treasury | 3285367 | 4031022 | 4775110 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4031022, p95 **5710215**
- industrial demand median -166, p95 **127**
- residential demand median -118
- pollution over developed land 1, over the whole region 5
- crime 3, congested tiles 7, stranded homes 5

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5520523** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **62** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **1**. Over the whole region: 5.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
