# Balance sweep — era 7

200 games per configuration, 25 years each.

Numbers below belong to **era 7**. Numbers from a previous era are void,
not roughly comparable (CLAUDE.md).

## relaxed-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1796 | 2316 | 2932 |
| treasury | 4886672 | 5531086 | 6061329 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 5531086, p95 **6905014**
- industrial demand median -526, p95 **178**
- residential demand median -272
- pollution over developed land 2, over the whole region 6
- crime 11, congested tiles 8, stranded homes 2

## steady-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1666 | 2314 | 2824 |
| treasury | 3569672 | 4380134 | 4835300 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 4380134, p95 **5588073**
- industrial demand median -360, p95 **290**
- residential demand median -189
- pollution over developed land 2, over the whole region 6
- crime 12, congested tiles 7, stranded homes 2

## demanding-64

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1431 | 2007 | 2515 |
| treasury | 1522851 | 2117304 | 2468808 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **1**
- peak treasury median 2117304, p95 **3049394**
- industrial demand median -331, p95 **157**
- residential demand median -55
- pollution over developed land 2, over the whole region 7
- crime 12, congested tiles 7, stranded homes 2

## steady-64-nodisasters

| measure | p25 | median | p75 |
| --- | --- | --- | --- |
| population | 1603 | 2255 | 2827 |
| treasury | 3328842 | 4381999 | 4902875 |

- living cities: 200 of 200
- cities that reached 100+ residents and ended empty: **0**
- peak treasury median 4381999, p95 **5790420**
- industrial demand median -317, p95 **216**
- residential demand median -209
- pollution over developed land 2, over the whole region 7
- crime 12, congested tiles 9, stranded homes 2

## The three logged debts

### 1. Runaway treasuries

Peak treasury p95 is **5588073** on steady-64.

**Still open.** Above the 1000000 line where money stops being a constraint.

### 2. Runaway industrial demand

Industrial demand p95 is **290** against a cap of 1500.

**Settled.** Below the cap, so the demand model is what is deciding.

### 3. Pollution averaged over the region

Over developed land: **2**. Over the whole region: 6.

**Settled.** The regional average carries signal.

## Verdict

1 debt(s) still open after this sweep: runaway treasuries.
Each is recorded above with the number that says so, which is the point of the sweep.
