### Game Design: **Pocket Metropolis**  
*Working title — an original city-building game inspired by classic tile-based city simulators*

> **IP note:** Use original names, artwork, characters, sounds, building designs, and interface styling. The mechanics may evoke classic city builders, but the finished game should not use protected branding or recognizable assets.

> **Revision note (rev 2).** The title of record is now **City Grid**; "Pocket Metropolis" survives
> below only as the original working title. Sections 1–24 are the singleplayer design as first
> written and remain valid. Sections 25–33 add what was missing: multiplayer, ownership and
> requests, modes and lobby, session lifecycle, progression, difficulty, communication, audio,
> accessibility, onboarding and the content inventory. Where a later section amends an earlier
> one, **§33 lists the amendment explicitly**. Architecture and stack live in `plan.md`;
> execution order lives in `../plan-v1.md`.

### 1. High Concept

**Pocket Metropolis** is an approachable 3D city-building simulation for mobile devices and browsers. The player becomes mayor of a small undeveloped region and turns it into a functioning city by:

- Painting residential, commercial, and industrial zones.
- Building roads and utility networks.
- Supplying electricity and water.
- Providing police, fire, and healthcare services.
- Balancing taxes, expenses, growth, traffic, pollution, and public approval.
- Completing character-driven quests and scenario objectives.
- Responding to disasters and unexpected civic events.

The design combines:

- A readable, systemic foundation based on simple **Residential–Commercial–Industrial demand**.
- Smaller, flexible zoning tiles and explicit utility networks.
- A friendly guide character, milestone rewards, quests, and lighthearted civic stories.
- A rotatable and zoomable Three.js city presented as a colorful miniature world.

### 2. Design Pillars

#### 2.1 Easy to Start, Difficult to Master

A new player should be able to zone land and see the first homes appear within two minutes. Long-term success should require understanding utility capacity, transportation, land value, service coverage, pollution, and finances.

#### 2.2 Every Action Has Visible Consequences

Players should immediately see:

- Roads connecting to buildings.
- Power lines becoming energized.
- Water pipes filling with water.
- Buildings changing when abandoned or upgraded.
- Service vehicles responding to emergencies.
- Pollution, crime, and traffic appearing through overlays and visual effects.

#### 2.3 Small Tiles, Organic Cities

The player paints individual logical tiles rather than placing large, rigid zone blocks. The simulation may combine adjacent tiles into larger development lots.

This permits:

- Narrow neighborhoods.
- Mixed street layouts.
- Waterfront districts.
- Small industrial pockets.
- Dense urban centers.
- Natural growth around existing infrastructure.

#### 2.4 A City With Personality

Residents and civic characters should turn simulation events into stories. The player is not only optimizing numbers; they are helping named citizens, resolving local disputes, and shaping the identity of the city.

#### 2.5 Short Sessions With Long-Term Progress

A player should accomplish something useful in a three-to-five-minute mobile session, while a city can remain engaging for many hours.

### 3. Target Platforms and Presentation

#### Platforms

- Modern desktop browsers.
- Mobile browsers.
- Installable Progressive Web App.
- Optional later packaging for Android and iOS.

#### Rendering

- Three.js with WebGL.
- Orthographic or low-perspective isometric camera.
- Low-poly 3D buildings and terrain.
- Distinct silhouettes and strong colors.
- Day/night lighting can be added after the core simulation is stable.

#### Orientation

- Landscape is the primary orientation.
- Portrait may be supported with a compact bottom toolbar and collapsible information panels.

### 4. Game Modes

#### 4.1 Guided Campaign

A sequence of regions and scenarios introduces mechanics gradually. Each scenario contains:

- A starting map.
- Starting treasury.
- Existing infrastructure, where appropriate.
- Mandatory objectives.
- Optional objectives.
- Narrative events.
- Restrictions or special conditions.
- Bronze, silver, and gold completion targets.

#### 4.2 Free Build

The player selects:

- Map size.
- Terrain seed.
- Starting treasury.
- Disaster frequency.
- Difficulty.
- Whether quests are enabled.
- Whether utility networks are simplified or fully simulated.

#### 4.3 Challenge Scenarios

Examples:

- Revitalize an abandoned industrial town.
- Supply water to a desert settlement.
- Repair a city following a major fire.
- Grow without exceeding a pollution target.
- Build a profitable city with limited land.
- Reduce crime before a major festival.
- Recover from a failing power grid.

### 5. Initial Gameplay Setup

At the beginning of a normal city:

1. The player names the city and mayor.
2. A guide character welcomes the player.
3. The camera frames a small undeveloped region.
4. The game grants a starting treasury.
5. The guide asks the player to:
   - Build a road.
   - Place a power plant.
   - Connect a power line.
   - Place a water pump or treatment plant.
   - Build water pipes.
   - Zone residential land.
6. Houses begin appearing once road, power, water, and demand requirements are met.
7. Commercial and industrial zoning are introduced.
8. Service buildings become relevant as population and risk increase.
9. The first mayoral milestone unlocks a reward and opens the wider quest system.

The tutorial should teach by giving the player small objectives rather than presenting a long manual.

### 6. World and Tile Model

#### 6.1 Logical Grid

Recommended first implementation:

- Small map: `48 × 48` logical tiles.
- Standard map: `64 × 64`.
- Large map: `96 × 96`, enabled after performance testing.

Each tile stores:

- Terrain type.
- Elevation.
- Water status.
- Road status.
- Zone type.
- Utility connections.
- Building occupancy.
- Pollution.
- Land value.
- Crime.
- Fire risk.
- Health quality.
- Traffic intensity.
- Disaster state.

#### 6.2 Terrain Types

Core terrain:

- Grass.
- Forest.
- Fresh water.
- Coast or shallow water.
- Raised land or hills.
- Cleared land.

Later terrain:

- Sand.
- Marsh.
- Rock.
- Snow.
- Contaminated ground.

#### 6.3 Development Lots

Zoning is painted per tile, but the growth system may combine eligible adjacent tiles into lots:

- `1 × 1`: cottages, kiosks, workshops.
- `1 × 2`: shops, apartments, small factories.
- `2 × 2`: larger apartments, offices, factories.
- `3 × 3`: high-value or high-density structures.

The simulation selects a building footprint based on:

- Available contiguous zone tiles.
- Road access.
- Demand.
- Density setting.
- Land value.
- Utility availability.
- Local pollution.
- Service coverage.

### 7. Core Build Tools

#### 7.1 Inspect

Select a tile, road, utility, or building to display:

- Name and type.
- Occupancy.
- Tax contribution.
- Power and water status.
- Road access.
- Happiness.
- Health and safety conditions.
- Current problems.
- Upgrade requirements.

#### 7.2 Zone Paint Tools

Core zones:

- Residential.
- Commercial.
- Industrial.
- Dezone.

Each zoning tool supports:

- Single-tile marking.
- Brush painting.
- Rectangular drag.
- Line painting.
- Fill enclosed area, as a later feature.
- Undo of the most recent action.
- Cost preview before confirmation.

Density can be handled in one of two ways:

1. **Recommended MVP:** One zone type that upgrades naturally as land value and population rise.
2. **Expanded system:** Low-, medium-, and high-density versions of each zone.

The first approach is closer to the intended simple foundation and produces less menu clutter on mobile.

#### 7.3 Transportation Tools

MVP:

- Two-lane road.
- Demolish tool.

Later additions:

- Avenue.
- One-way road.
- Bridge.
- Pedestrian path.
- Bus stop.
- Rail.
- Metro.
- Road upgrade tool.

Every developed building requires access to a road tile within a defined distance, normally directly adjacent.

#### 7.4 Electricity Tools

- Power plant placement.
- Power line drawing.
- Power overlay.
- Demolish or reroute tool.

Initial power plants could include:

- Coal plant:
  - Low construction cost.
  - High pollution.
  - Reliable output.
- Gas plant:
  - Moderate pollution and cost.
  - Responsive output.
- Wind turbine:
  - Clean.
  - Low individual capacity.
  - Requires multiple placements.
- Solar plant:
  - Clean.
  - Higher initial cost.
  - Output may vary if weather is introduced.

Power travels through:

- Connected power lines.
- Conductive developed buildings.
- Optional road-integrated power infrastructure after an upgrade is unlocked.

The simulation should track:

- Maximum capacity.
- Current consumption.
- Reserve capacity.
- Disconnected networks.
- Outage tiles.

#### 7.5 Water Tools

- Water pump.
- Water treatment plant.
- Water tower or reservoir.
- Underground pipe drawing.
- Water overlay.

Rules:

- A basic pump must be near a valid water source or suitable groundwater.
- A treatment plant may provide larger capacity and reduce contamination.
- Pipes form underground networks.
- Buildings must be within a short connection distance of a supplied pipe.
- Industrial pollution can reduce nearby source-water quality.
- Poor water quality increases sickness and reduces desirability.

The water system tracks:

- Production capacity.
- Consumption.
- Storage, if reservoirs are implemented.
- Water quality.
- Connected and disconnected networks.
- Dry or contaminated tiles.

#### 7.6 Civic Buildings

Core civic buildings:

- Fire station.
- Police station.
- Hospital.

Each building has:

- Construction cost.
- Monthly maintenance.
- Staff or operating budget.
- Capacity.
- Coverage radius or travel-time coverage.
- Road access requirement.
- Utility requirements.

Optional later buildings:

- Clinic.
- Police headquarters.
- Fire headquarters.
- School.
- Park.
- Library.
- Waste facility.
- City hall.
- Emergency shelter.

### 8. Simulation Systems

#### 8.1 RCI Demand

The three primary demand categories are:

- **Residential:** Demand for places to live.
- **Commercial:** Demand for shops, services, and offices.
- **Industrial:** Demand for production and employment.

Demand should be shown as three vertical or horizontal bars.

Residential demand rises when:

- Jobs are available.
- Taxes are acceptable.
- Services are reliable.
- Pollution and crime are manageable.
- Housing supply is limited.

Commercial demand rises when:

- Population and purchasing power grow.
- Commercial space is limited.
- Traffic access is good.
- Taxes are acceptable.

Industrial demand rises when:

- Workers are available.
- Freight and road access are good.
- Industrial taxes are acceptable.
- Available industrial space is limited.

The demand formula should be transparent enough to explain through tooltips, but it does not need to expose every internal coefficient.

#### 8.2 Development Conditions

A zone tile becomes eligible for development when it has:

- Valid terrain.
- Road access.
- Electricity.
- Water.
- Positive demand.
- Sufficient desirability.
- No blocking structure.
- No unresolved disaster.

A development score can conceptually use:

$$
D = R + U + L + S - P - C - T
$$

Where:

- \(R\) is road accessibility.
- \(U\) is utility reliability.
- \(L\) is land value.
- \(S\) is service quality.
- \(P\) is pollution.
- \(C\) is crime.
- \(T\) is excessive traffic or travel time.

The score selects whether the lot remains empty, develops, upgrades, downgrades, or becomes abandoned.

#### 8.3 Population and Employment

Residential buildings contain households. Commercial and industrial buildings provide jobs.

Track:

- Total population.
- Available housing.
- Employed residents.
- Available jobs.
- Unemployment.
- Worker shortages.
- Daily commuters.

A simplified simulation may use aggregate commuters rather than representing every resident as an individual agent.

#### 8.4 Traffic

For the MVP, traffic can be estimated from:

- Number of residents.
- Number and type of jobs.
- Road hierarchy.
- Shortest available routes.
- Road capacity.
- Destination attractiveness.

Traffic affects:

- Pollution.
- Emergency response.
- Commercial performance.
- Citizen satisfaction.
- Land value.
- Quest outcomes.

Visible vehicles should be a sampled representation of traffic rather than one vehicle per simulated commuter.

#### 8.5 Land Value

Land value is influenced positively by:

- Reliable utilities.
- Parks and waterfronts.
- Low crime.
- Good fire and healthcare coverage.
- Successful commercial areas.
- Low traffic.
- Distance from pollution.
- Special landmarks.

It is reduced by:

- Industrial pollution.
- Abandoned buildings.
- Crime.
- Fires.
- Congestion.
- Utility outages.
- Contaminated water.
- Excessive taxes.

#### 8.6 Police and Crime

Crime grows with:

- Population density.
- Unemployment.
- Low land value.
- Poor police coverage.
- Abandoned buildings.

Police stations provide:

- Preventative coverage.
- Response to incidents.
- Reduced crime growth.
- Increased commercial and residential desirability.

Police funding affects effective coverage and response speed.

#### 8.7 Fire Protection

Buildings have fire-risk values based on:

- Building type.
- Density.
- Age.
- Industrial activity.
- Utility faults.
- Nearby fires.
- Fire-station coverage.

When a fire begins:

1. An alert appears.
2. The player can select the incident.
3. A fire vehicle attempts to travel from an available station.
4. Traffic affects response time.
5. The fire may spread to neighboring buildings.
6. Damage depends on response speed and building resistance.
7. The player may need to demolish ruins or rebuild utilities.

#### 8.8 Healthcare

Health is influenced by:

- Water quality.
- Pollution.
- Residential density.
- Traffic pollution.
- Hospital access.
- Disaster effects.

Hospitals provide:

- Treatment capacity.
- Health coverage.
- Reduced mortality or abandonment.
- Faster recovery from outbreaks.
- Improved citizen confidence.

If demand exceeds capacity, health quality falls even inside the nominal coverage area.

#### 8.9 Pollution

Core pollution types:

- Air pollution.
- Ground pollution.
- Water contamination.

Pollution sources include:

- Factories.
- Coal power plants.
- Traffic.
- Fires.
- Untreated waste, if added later.

Pollution should spread gradually and be clearly shown in an overlay.

### 9. Economy and Budget

#### 9.1 Income

Primary income:

- Residential tax.
- Commercial tax.
- Industrial tax.

Possible secondary income:

- Scenario grants.
- Quest rewards.
- Utility fees.
- Landmark tourism.
- Regional subsidies.

#### 9.2 Expenses

- Road maintenance.
- Power plant operation.
- Water production.
- Police budget.
- Fire department budget.
- Healthcare budget.
- Debt payments.
- Disaster repairs.

#### 9.3 Tax Controls

Provide separate tax sliders for:

- Residential.
- Commercial.
- Industrial.

Taxes affect both immediate revenue and long-term demand. Changes should not produce their full effect instantly; the response should occur over several simulation periods.

#### 9.4 Department Funding

Each service can use a funding slider, for example from `50%` to `150%`.

Lower funding:

- Reduces expenses.
- Shrinks coverage.
- Reduces capacity.
- Slows emergency response.

Higher funding:

- Increases capacity.
- Improves coverage or response.
- Raises monthly expenses.

#### 9.5 Debt

Optional loans allow recovery from financial trouble, but introduce recurring repayments. The player should receive warnings before bankruptcy rather than losing without notice.

### 10. Core Gameplay Loops

#### 10.1 Immediate Building Loop

1. Identify demand or a city problem.
2. Select a construction or zoning tool.
3. Preview cost and validity.
4. Paint or place the item.
5. Connect roads and utilities.
6. Resume time.
7. Watch the city react.
8. Inspect the result.

This loop should take seconds.

#### 10.2 Growth Loop

1. Zone land.
2. Provide infrastructure.
3. New buildings develop.
4. Population and jobs increase.
5. Tax revenue grows.
6. New service problems appear.
7. The player expands or improves infrastructure.
8. Buildings upgrade and the city becomes denser.

This loop should take several minutes.

#### 10.3 Problem-Solving Loop

1. The city reports a problem.
2. The player opens an alert or overlay.
3. The source is identified.
4. The player changes infrastructure, policy, or funding.
5. The simulation recalculates conditions.
6. The player observes whether the intervention worked.

Examples include:

- Power shortage.
- Water contamination.
- Traffic congestion.
- Industrial unemployment.
- Hospital overcrowding.
- High crime.
- Poor fire coverage.

#### 10.4 Financial Loop

1. Expansion creates new operating costs.
2. Growth produces new tax income.
3. The player adjusts taxes and funding.
4. Satisfaction and demand react.
5. The player invests the resulting surplus or manages a deficit.

#### 10.5 Quest Loop

1. A character presents a civic request.
2. The player accepts, postpones, or rejects it.
3. Objectives appear in the quest tracker.
4. The player changes the city to meet the objectives.
5. The conditions must remain satisfied for a defined period.
6. The character returns with a resolution.
7. The player receives money, reputation, an unlock, or a cosmetic reward.

#### 10.6 Long-Term Mastery Loop

1. Reach population milestones.
2. Earn a higher mayoral rank.
3. Unlock new buildings and policies.
4. Complete region scenarios.
5. Obtain decorative and functional rewards.
6. Start more difficult maps with new environmental constraints.

### 11. Story and Quest System

#### 11.1 Tone

The story should be optimistic, witty, and gently satirical. Citizens can complain dramatically, but the game should remain welcoming rather than cynical.

#### 11.2 Guide Character

Create an original city-planning advisor who:

- Introduces systems.
- Celebrates milestones.
- Warns about serious failures.
- Translates statistics into plain language.
- Occasionally makes humorous mistakes or personal observations.
- Appears in short dialogue panels rather than interrupting play with lengthy scenes.

The advisor should have several emotional poses or animated reactions.

#### 11.3 Supporting Characters

Suggested recurring characters:

- Fire chief.
- Police captain.
- Hospital director.
- Utility engineer.
- Environmental advocate.
- Business association representative.
- Neighborhood organizer.
- Industrial foreman.
- Local journalist.
- Student or young resident representing future generations.

Characters should have competing priorities. The player is not expected to satisfy everyone simultaneously.

#### 11.4 Quest Categories

**Tutorial quests**

- Build the first road.
- Power ten buildings.
- Supply clean water.
- Attract the first one hundred residents.
- Build the first fire station.

**Growth quests**

- Reach a population target.
- Maintain positive income.
- Develop a commercial center.
- Create an industrial district.
- Upgrade a number of buildings.

**Service quests**

- Reduce crime.
- Improve fire coverage.
- Add hospital capacity.
- Resolve a water shortage.
- Restore power after an outage.

**Environmental quests**

- Reduce pollution.
- Protect a forest.
- Clean contaminated water.
- Replace a dirty power source.
- Preserve waterfront land.

**Character quests**

- Help a shopkeeper attract customers.
- Protect an old neighborhood from fires.
- Resolve a dispute between residents and a factory.
- Prepare for a city festival.
- Improve access to a hospital.

**Crisis quests**

- Manage a major fire.
- Respond to an outbreak.
- Recover from a storm.
- Handle a power plant failure.
- Repair a broken water network.

#### 11.5 Quest Objective Types

The quest engine should support reusable conditions:

- Build a specific structure.
- Zone a number of tiles.
- Reach a population value.
- Reach or maintain a budget value.
- Keep pollution below a threshold.
- Keep crime below a threshold.
- Reach a service coverage percentage.
- Supply a number of buildings with power or water.
- Resolve an incident within a time limit.
- Maintain conditions for several months.
- Choose between two policy outcomes.

#### 11.6 Choices and Consequences

Some quests should offer choices rather than a single correct answer.

Example: a factory wants permission to expand.

- **Approve expansion**
  - More industrial jobs.
  - Higher pollution.
  - Business reputation increases.
- **Require pollution controls**
  - Expansion costs more.
  - Lower pollution.
  - Environmental reputation increases.
- **Reject expansion**
  - Residents nearby are pleased.
  - Industrial demand or employment may suffer.

Consequences should primarily affect simulation variables and later dialogue, avoiding an unmanageably branching narrative.

#### 11.7 Mayor Rank

Possible progression ranks:

1. Settlement Steward.
2. Town Mayor.
3. City Mayor.
4. Regional Leader.
5. Metropolitan Architect.

Ranks unlock:

- New civic buildings.
- New power and water technologies.
- Larger maps.
- Advanced overlays.
- New scenarios.
- Decorative rewards.
- Special landmarks.

### 12. Events and Disasters

#### Routine Events

- Minor house fire.
- Traffic collision.
- Water-main break.
- Local festival.
- Business opening.
- Factory closure.
- Seasonal illness.
- Small power outage.
- Neighborhood petition.

#### Major Disasters

- Wildfire.
- Earthquake.
- Flood.
- Tornado or severe storm.
- Industrial explosion.
- Large-scale blackout.
- Water contamination crisis.

Disasters should be:

- Optional in free-build mode.
- Telegraphable when possible.
- Recoverable.
- Connected to existing systems.
- A source of meaningful choices rather than random punishment.

### 13. User Interface

#### 13.1 Main HUD

The always-visible HUD should contain:

**Top bar**

- Treasury.
- Current income or deficit trend.
- Population.
- City date.
- Game speed.
- Pause button.

**Demand indicator**

- Residential demand.
- Commercial demand.
- Industrial demand.

**Alert area**

- Power failures.
- Water shortages.
- Fires.
- Crime events.
- Hospital overload.
- Quest updates.

**Build toolbar**

- Inspect.
- Zones.
- Roads.
- Electricity.
- Water.
- Services.
- Bulldoze.
- Overlays.

#### 13.2 Mobile Layout

Recommended mobile layout:

- Top: treasury, population, and date.
- Bottom: scrollable category toolbar.
- Bottom-left: contextual undo button.
- Bottom-right: confirmation button when using a drag tool.
- Side: collapsible demand bars and alerts.
- Full-screen modal sheets for budget, statistics, and quests.

Buttons should be large enough for touch use. Hover-only information must also be available through taps or long presses.

#### 13.3 Desktop Layout

- Bottom or left build toolbar.
- Right-side contextual inspector.
- Top status bar.
- Mouse hover for previews and tooltips.
- Keyboard shortcuts for frequent tools.
- Optional minimap.

#### 13.4 Camera Controls

Desktop:

- Left drag: pan or select, depending on mode.
- Right drag or middle drag: rotate.
- Mouse wheel: zoom.
- Keyboard: pan and rotate shortcuts.
- Double-click: focus selected object.

Mobile:

- One-finger drag: pan.
- Pinch: zoom.
- Two-finger twist: rotate.
- Tap: select.
- Long press: inspect or open contextual actions.

The camera should snap to comfortable angles and avoid disorienting free rotation.

### 14. Tool Interaction Design

Every placement tool follows the same state model:

1. Player chooses a tool.
2. Valid tiles are highlighted.
3. Player taps, drags, or paints.
4. A ghost preview appears.
5. Cost is calculated.
6. Invalid tiles are marked in red.
7. The player confirms or cancels.
8. The action is committed as one undoable transaction.

On desktop, confirmation may be optional for inexpensive actions. On mobile, confirmation is safer for long drags and costly buildings.

#### Paint Modes

- Pencil: one tile at a time.
- Brush: circular or square brush.
- Line: roads, pipes, and power lines.
- Rectangle: zoning blocks.
- Eyedropper: select the tool represented by an existing tile.
- Bulldozer: remove structures and infrastructure.

Underground pipe placement should automatically activate a semitransparent underground view.

### 15. Menus

#### 15.1 Build Menu

Categories:

- Zones.
- Roads.
- Power.
- Water.
- Public safety.
- Healthcare.
- Parks and decorations.
- Special buildings.

Each build card displays:

- Icon.
- Name.
- Construction cost.
- Maintenance cost.
- Capacity or coverage.
- Unlock requirement.
- Short description.

#### 15.2 Budget Menu

Show:

- Current treasury.
- Monthly revenue.
- Monthly expenses.
- Projected balance.
- Tax controls.
- Department funding.
- Loan controls.
- Historical income chart.

#### 15.3 City Statistics

Key statistics:

- Population.
- Population growth.
- Housing capacity.
- Employment and unemployment.
- Job capacity by sector.
- RCI demand.
- Tax revenue by sector.
- Total expenses.
- Power capacity and consumption.
- Water capacity and consumption.
- Hospital capacity and patients.
- Police coverage.
- Fire coverage.
- Average land value.
- Crime level.
- Pollution level.
- Average traffic.
- Citizen approval.

Statistics should always provide a plain-language interpretation, such as:

> Industrial demand is high because your city has available workers and too few industrial jobs.

#### 15.4 Quest Menu

Sections:

- Active.
- Available.
- Completed.
- Story history.

Each quest displays:

- Requesting character.
- Description.
- Objectives.
- Progress.
- Deadline, if any.
- Rewards.
- Consequences of major choices.

#### 15.5 City Information Menu

- City name.
- Mayor name.
- Difficulty.
- Current rank.
- Milestones.
- Awards.
- Policies.
- Save/export options.

### 16. Information Overlays

Required overlays:

- Zoning.
- Electricity.
- Water.
- Traffic.
- Land value.
- Pollution.
- Crime.
- Fire coverage.
- Healthcare coverage.
- Population density.
- Building desirability.

Overlay colors should remain consistent:

- Green: good or supplied.
- Yellow: strained or moderate.
- Red: failing or severe.
- Gray: unavailable or not applicable.

Do not rely only on color. Use icons, patterns, outlines, and labels for accessibility.

### 17. Notifications and Feedback

Notifications should have three levels:

#### Informational

- New building developed.
- Population milestone reached.
- Quest available.

#### Warning

- Power reserve is low.
- Hospital capacity is nearly full.
- Monthly budget is negative.

#### Critical

- Active fire.
- Water contamination.
- Major outage.
- Bankruptcy risk.

Selecting a notification should move the camera to the relevant location or open the relevant management panel.

### 18. Simulation Timing

Recommended speeds:

- Paused.
- Normal.
- Fast.
- Very fast.

Use separate timing layers:

- **Visual frame:** rendering and animation.
- **Fast simulation tick:** traffic samples, incidents, utility flow.
- **Monthly tick:** taxes, expenses, demand, development.
- **Annual tick:** milestones, awards, major evaluations.

Simulation calculations should not be tied directly to rendering frame rate.

A deterministic seeded simulation is preferable because it improves:

- Testing.
- Reproducible bug reports.
- Save compatibility.
- Scenario balancing.

### 19. Three.js Implementation Direction

#### 19.1 Architecture Separation

Keep simulation logic independent from Three.js.

Suggested modules:

- `GameState`
- `TileMap`
- `TerrainSystem`
- `ZoneSystem`
- `DevelopmentSystem`
- `RoadNetworkSystem`
- `PowerNetworkSystem`
- `WaterNetworkSystem`
- `DemandSystem`
- `EconomySystem`
- `TrafficSystem`
- `ServiceCoverageSystem`
- `CrimeSystem`
- `HealthSystem`
- `FireSystem`
- `PollutionSystem`
- `QuestSystem`
- `EventSystem`
- `SaveSystem`
- `ThreeRenderer`
- `InputController`
- `UIStore`

The simulation should be executable without rendering so automated tests can run cities for thousands of ticks.

#### 19.2 Rendering Strategy

For mobile performance:

- Use instanced meshes for repeated trees, roads, pipes, and small buildings.
- Merge static terrain geometry.
- Use low-poly assets.
- Limit transparent materials.
- Use texture atlases.
- Pool vehicles and effects.
- Update only changed tiles.
- Use level-of-detail models for larger maps.
- Avoid dynamic shadows on every object.
- Render utility overlays only when selected.

#### 19.3 Entity Representation

Do not make every tile a heavy JavaScript object if larger maps are planned. Consider typed arrays for frequently accessed tile properties:

- Terrain.
- Zone.
- Occupancy.
- Pollution.
- Crime.
- Land value.
- Utility flags.
- Road flags.

Buildings and special structures can remain full entities containing IDs, footprints, capacities, and state.

#### 19.4 Utility Networks

Represent roads, power lines, and pipes as graphs derived from tile connectivity.

Recalculate only affected network components after:

- Construction.
- Demolition.
- Disaster damage.
- Network restoration.

Do not perform a complete map-wide network search every frame.

### 20. Suggested Data Structures

A logical tile should conceptually contain:

```ts
interface TileState {
  terrainType: number;
  elevation: number;
  zoneType: number;
  buildingId: number | null;
  roadType: number;
  powerLine: boolean;
  waterPipe: boolean;
  powered: boolean;
  watered: boolean;
  pollution: number;
  crime: number;
  fireRisk: number;
  healthRisk: number;
  landValue: number;
  traffic: number;
}
```

A building definition should separate static configuration from runtime state:

```ts
interface BuildingDefinition {
  id: string;
  category: string;
  footprintWidth: number;
  footprintHeight: number;
  constructionCost: number;
  maintenanceCost: number;
  powerConsumption: number;
  waterConsumption: number;
  residentCapacity: number;
  jobCapacity: number;
  pollutionOutput: number;
  fireRisk: number;
}

interface BuildingState {
  instanceId: number;
  definitionId: string;
  originTile: number;
  developmentLevel: number;
  occupancy: number;
  condition: number;
  powered: boolean;
  watered: boolean;
  abandoned: boolean;
  onFire: boolean;
}
```

These are conceptual identifiers and should be adjusted before implementation to match the coding ally’s actual schema.

### 21. Save System

A save should contain:

- Format version.
- Map seed.
- Tile state.
- Building instances.
- Treasury and budget.
- Population and demand.
- Current date.
- Service funding.
- Active incidents.
- Quest state.
- Unlocks.
- Random-number-generator state.

Support:

- Automatic local saves.
- Multiple manual save slots.
- Export/import as a later feature.
- Save migrations when the schema changes.

For browsers, IndexedDB is preferable to relying only on local storage for larger saves.

### 22. MVP Scope

The first playable version should contain:

#### Map and Rendering

- One flat map with grass, trees, and water.
- Rotatable and zoomable Three.js view.
- Tile selection and placement preview.

#### Construction

- Residential, commercial, and industrial zoning.
- Road construction.
- One power plant and power lines.
- One water pump and water pipes.
- Fire station.
- Police station.
- Hospital.
- Bulldozer.

#### Simulation

- RCI demand.
- Zone development.
- Population and jobs.
- Electricity networks.
- Water networks.
- Basic tax economy.
- Simplified traffic.
- Pollution.
- Service coverage.
- Fires and emergency response.

#### Interface

- Main HUD.
- Build toolbar.
- Budget panel.
- Building inspector.
- RCI demand bars.
- Power, water, crime, fire, health, traffic, and pollution overlays.
- Alerts.
- Pause and speed controls.

#### Story

- One guide character.
- Ten tutorial quests.
- Five milestone quests.
- Three random civic events.
- One recoverable disaster scenario.

### 23. Recommended Development Order

#### Phase 1: City Canvas

- Grid and terrain.
- Camera controls.
- Tile selection.
- Placement preview.
- Save and load basic map state.

#### Phase 2: Roads and Zoning

- Road placement.
- RCI zoning.
- Road-access checks.
- Basic demand.
- Building development.

#### Phase 3: Utilities

- Power production and networks.
- Water production and pipe networks.
- Utility overlays.
- Building utility consumption.

#### Phase 4: Economy

- Construction costs.
- Taxes.
- Maintenance.
- Monthly budget.
- Failure and recovery warnings.

#### Phase 5: Civic Simulation

- Fire station and fire events.
- Police and crime.
- Hospital and health.
- Pollution and land value.

#### Phase 6: Traffic and Growth

- Route estimation.
- Congestion.
- Building upgrades.
- Abandonment.
- Larger development footprints.

#### Phase 7: Story Layer

- Dialogue system.
- Quest conditions.
- Character portraits.
- Choices and consequences.
- Scenario completion.

#### Phase 8: Mobile Optimization

- Touch controls.
- Responsive UI.
- Instancing and batching.
- Reduced-effects mode.
- Progressive Web App support.

### 24. MVP Success Criteria

The prototype is successful when a player can:

1. Start an empty map.
2. Build a road.
3. Place electricity and water infrastructure.
4. Paint all three zone types.
5. Watch buildings develop.
6. Grow a city with residents and jobs.
7. Collect taxes and pay maintenance.
8. Diagnose utility and service problems through overlays.
9. Build police, fire, and hospital services.
10. Respond to a fire or civic incident.
11. Complete guided quests.
12. Save, close, reload, and continue the same city.
13. Play comfortably using either mouse or touch controls.

The most important early milestone is not visual polish. It is creating a small city where zoning, roads, utilities, development, demand, and finances form a satisfying and understandable feedback loop.

### 25. Multiplayer

#### 25.1 Design goal

A player should be able to join a living region, understand one useful thing to do within a minute, contribute something, and leave without harming anyone.

Multiplayer must not make a city builder tense the way a competitive action game is tense. The friction between players should be **civic**: negotiation over land, pollution, water, power, commuters and tax rates. It should never be destruction.

Four rulings shape everything below:

1. Demand is **one regional pool** shared by all players, in every mode.
2. A room is a **persistent world**, not a match.
3. Unlocks are **room-level**, never per-player.
4. Singleplayer is the same game with one seat.

#### 25.2 Ownership

Every tile has an owner: unclaimed nature, a specific player, or the civic commons. What you build is yours. What you did not build is not yours to destroy.

| Action | Your land | Commons | Unclaimed | Another player's land |
|---|---|---|---|---|
| Build and zone | Yes | Mode-dependent | Claim first, mode-dependent | No |
| Demolish | Yes | Only what you built | Yes, it is nature | **No — request only** |
| Run a road, wire or pipe across | Yes | Yes | Yes | Only if that border is open |
| Inspect | Yes | Yes | Yes | Yes |

There is no fog of war. The whole map, and every statistic in it, is public to every player. Secrecy would only make coordination harder, and a city is a public thing.

Ownership must be readable at a glance: a colour, a pattern and a name, on the territory overlay and on the minimap. A newcomer should never be confused about whose street they are looking at.

#### 25.3 Demolition requests

When a player wants land or a building removed that belongs to someone else, they send a request. A request carries:

- A short title.
- The location, which the recipient can jump the camera to.
- An optional reason, in the requester's own words.
- An optional offer of compensation.

The owner sees it in an inbox and may approve, deny, or ignore it until it expires. Approval executes the demolition in one transaction, paid for by the requester, and transfers the compensation. The requester may withdraw. If the target burns down, is rebuilt beyond recognition, or is already gone, the request quietly becomes moot; if the land changes hands, the request follows the new owner with its clock reset.

Requests are part of the game record, not chat. They are limited in number per pair of players so that the inbox cannot itself be used as a weapon.

Each player sets a standing policy that applies when they are absent or simply prefer not to be asked:

- Decide each one myself.
- Automatically approve anything outside my core district.
- Automatically approve if the compensation is at least a set amount.
- Deny everything.

#### 25.4 Nuisance reports and derelict property

A **nuisance report** uses the same channel for pollution, noise and congestion crossing a border. It cannot force a change; it makes a complaint visible and attributable, and gives the tension a civil outlet.

A **derelict property rule** prevents the one grief move that ownership would otherwise make unanswerable — leaving a ruin to rot against a neighbour's park forever. A building abandoned for longer than a set number of years may have its demolition approved on a neighbour's request even against the owner's wishes. Derelict buildings are visibly marked.

#### 25.5 Cooperation

The design should make neighbours worth having:

- **Gifts and loans** of money between players.
- **Supply contracts**: sell power, water or waste capacity across a border at an agreed price per unit, billed monthly.
- **Open borders**: allow a neighbour to run roads, wires or pipes through your land.
- **Mutual aid**: emergency services cover across borders by default, revocable per neighbour as a visible political act.
- **Shared civic projects**: a hospital, transit line or landmark funded by several players, owned by the commons.
- **Joint quests**: objectives that only a group can complete.

#### 25.6 Shared consequences

This is what makes a shared map a shared *city*:

- **Demand is regional.** Residents and businesses belong to the region and settle where they are best served. Your tax cut pulls growth across the border; the hospital your neighbour did not build costs them population. In co-operative modes this simply means the city grows where it is best served.
- **Employment crosses borders.** Your residents may work in my district, and we both feel the commute.
- **Services cross borders.** My fire station protects your street if it is in range.
- **Pollution, noise and traffic cross borders**, regardless of ownership.
- **Disasters cross borders.** Fire and flood spread; response comes from whoever has coverage and has funded it; repairs are paid by the owner of the damaged property unless regional disaster aid is enabled. An underfunded neighbour is a risk to everyone.
- **Both regional and personal statistics are shown.** The mode decides which one the game celebrates.

#### 25.7 Drop-in, absence and departure

- A player may join at any time. The world never pauses for them.
- When a player leaves — deliberately or by disconnection — their city continues under a **deputy mayor** running a doctrine they chose, answering demolition requests by their standing policy. Nothing they own is destroyed by their absence.
- Reconnecting resumes the same seat, the same land and the same inbox.
- Only after a long configured absence may their land be released back to unclaimed.

#### 25.8 Time

One clock governs the room. Speed is chosen by majority vote, and the host may force it. No player can pause the world for everyone; pausing is a personal view state only. Building is allowed at every speed, exactly as in singleplayer.

### 26. Modes, lobby and options

#### 26.1 Modes

| Mode | Players | Land | Money | What it is about |
|---|---|---|---|---|
| **Shared City** | 1–16 | One city; build anywhere unclaimed. Ownership is recorded so that nobody can demolish your work | Shared treasury, or separate by option | Building one good city together |
| **Districts** | 2–16 | The map is divided into one exclusive district per seat | Separate treasuries and tax rates | Your district, your rules — borders, utilities and commuters force negotiation |
| **Region Rivals** | 2–12 | Separate city sites with neutral land between them | Separate | Competing for the same regional population, trading across neutral ground |
| **Scenario Co-op** | 2–8 | Defined by the scenario | Defined by the scenario | A shared crisis: flood recovery, cleanup, a festival to prepare |

Singleplayer is Shared City with one seat.

#### 26.2 Player capacity

| Map | Logical tiles | Maximum players |
|---|---|---|
| Small | 48 × 48 | 4 |
| Standard | 64 × 64 | 8 |
| Large | 96 × 96 | 12 |
| Region | 128 × 128 | 16 |

#### 26.3 Lobby

The host creates a room and receives a join code. The lobby offers:

- Map size, which sets the player capacity.
- Terrain style: flat, rolling or hilly.
- Water: none, lakes, river, coastal or archipelago.
- Tree density.
- Seed, with a preview of the generated region, a regenerate button, and the region's name.
- Difficulty, starting treasury, disasters on or off, quests on or off.
- Mode and its options: district assignment, claim rules, treasury sharing, default border policy, request expiry, whether free-text reasons are allowed, mutual aid, disaster aid, derelict threshold, absence policy.
- Seats: join, ready, spectate, choose colour and city name; the host may remove a player.
- Whether late joining stays open.

Late joining is open by default. A room that nobody can join is a room that dies.

#### 26.4 District generation

In Districts mode the map is divided at generation time, before anyone plays:

- Borders follow terrain — rivers, ridges and coastlines — so a district looks like a place rather than a rectangle.
- Every district must have comparable buildable land, access to at least one water source, and at least two connections to its neighbours. A region that fails is regenerated.
- A band of **commons** tiles runs along each border, where anyone may build roads and only the builder may remove them.
- Unclaimed districts stay ready for players who arrive later.

### 27. Session lifecycle, progression and difficulty

#### 27.1 A room is a world

Rooms are persistent. There is no victory condition and no forced ending in any mode. The clock runs while players are connected and sleeps when the room is empty. A city may be built over days or weeks.

Region Rivals marks a **season** every twenty-five city years: a ranking, a recap and an entry in the room's history — without ending the world, resetting the map, or evicting anyone from a city they have spent a week building.

Scenario Co-op ends when its objective is met or its timer runs out, with bronze, silver and gold results.

A room has a lifetime policy so that dead worlds are eventually reclaimed, the host may pin a room as permanent, and any player may export the region and continue it alone in singleplayer.

#### 27.2 Progression

Unlocks belong to the room, not the player. They are earned by the room's own milestones, and a player joining a mature region immediately has the full build menu that region has earned. The alternative — a personal unlock ladder — would punish exactly the drop-in player this design is built around.

Mayor rank persists in a player's local profile as recognition, awards and decoration. It never gates a building.

In competitive modes, quest rewards are capped in money so that quest luck cannot decide a season.

#### 27.3 Difficulty

Difficulty is one room-wide setting. It scales starting treasury, tax yield, construction and maintenance costs, how sharply demand reacts, disaster frequency, how much service each funded unit buys, and how quickly land value recovers from damage.

There are no per-player handicaps. A shared region with different rules for different players would be unreadable.

### 28. Communication, safety and moderation

- **Location pings are the primary channel**: a small fixed set of translated phrases — *help here*, *building soon*, *fire*, *look at this*, *thank you* — attached to a place on the map. They need no translation, no moderation, and they work on a phone.
- **Chat is optional per room**, held to the same limits as request text, and is never part of the game record.
- **Player and city names** are player-authored text and are treated with the same care as request text: length-limited, sanitised, and always displayed as plain text.
- **Players can** mute another player, block requests from them, and report them.
- **Hosts can** remove a player, close late joining, and decide what happens to a removed player's land — held under regency, or released after a grace period.
- Free-text reasons can be switched off entirely for a room, leaving a fixed list of reasons. A public room for strangers and a private room for friends need different settings, and the lobby should say so.

### 29. Audio design

Half of "every action has visible consequences" is audible. Sound carries information for a player who is not looking at the right part of the map.

- **Feedback**: tool selection, valid and invalid placement, construction, demolition, a committed transaction. Short, dry, immediate.
- **Notification**: three distinct timbres for informational, warning and critical, so that severity is recognisable without reading.
- **Ambience**: a bed that follows the camera — quiet residential streets, commercial bustle, industrial hum, traffic, water, wind over empty land — driven by the same data as the overlays.
- **Events**: sirens for live incidents, construction, disasters, and a short musical sting for each recurring character.
- **Multiplayer courtesy**: a soft cue for an incoming request or ping, rate-limited and mutable. Nothing another player does may make a loud noise on your machine.
- **Mixer**: master, effects, ambience and music, with a one-tap mute. Audio stays silent until the player's first interaction.

### 30. Accessibility

- **Never colour alone.** Overlays combine colour with pattern, icon and label.
- **Player identity is the hard case.** Sixteen colours cannot be told apart reliably, least of all with colour-vision deficiency. A player is therefore a colour *and* a pattern *and* a name wherever identity matters, and the palette is verified against simulated colour-vision deficiency rather than by eye.
- Text scales to twice its size without breaking the layout.
- Touch targets are large; every hover-only affordance also works by tap or long press.
- A reduced-motion setting disables camera easing, time-lapse and heavy particle effects.
- A high-contrast interface theme is available.
- The game is fully operable from the keyboard on desktop, including the build toolbar and the request inbox.
- Statistics are always accompanied by a plain-language interpretation. This is an accessibility feature as much as a usability one.

### 31. Onboarding

**In singleplayer**, the tutorial teaches through small objectives from the guide character, never through a manual, as described in §5.

**Joining an existing region is a separate problem.** A player arriving in a three-hour-old city needs to be useful within a minute. On joining, they are shown a short situation card:

- What this region is and how it is doing.
- Whose land is whose.
- What the region needs most right now.
- Two or three concrete openings: an unclaimed district, a public request for help, a joint project short of funds, a neighbourhood with no fire cover.

A player may also spectate before taking a seat, which is the gentlest tutorial available.

### 32. Content inventory

| Asset class | First release target |
|---|---|
| Building models | About sixty — three zone categories across four development levels and two value tiers, plus civic and utility buildings |
| Terrain and props | About twenty-five — trees, rocks, shoreline, rubble, fountains, poles, pipes |
| Vehicles | Eight pooled types |
| Character art | The advisor with about six expressions; ten supporting characters with about three each |
| Interface icons | About eighty |
| Audio | About forty effects, six ambience beds, three music tracks |
| Writing | Ten tutorial quests, twenty-five further quests, about forty advisory messages, character dialogue — in English and Norwegian |

Art direction is settled once, before the first model: silhouette first, flat colour with baked shading, a single texture atlas, and a palette in which the sixteen player colours stay legible against every building colour.

### 33. Amendments to sections 1–24

| Section | Amendment |
|---|---|
| Title | The game is **City Grid**. "Pocket Metropolis" was the working title. |
| §3 Rendering | Confirmed: three.js with WebGL2, low-poly meshes, orthographic low-isometric camera. One art style ships, chosen by a probe that compares a clean low-poly diorama, a pixel-art post-process over the same meshes, and a hand-painted atlas. A drawn-sprite pipeline is post-v1 only. |
| §4 Game modes | Adds the four multiplayer modes in §26.1. Guided Campaign and Free Build remain singleplayer. |
| §6.1 Logical grid | Each tile also stores **owner** and **district**. |
| §7.2–7.6 Build tools | Every placement tool is checked against ownership. Bulldoze applies only to your own property, nature, and what you built on the commons. A **request** tool is added for everything else. |
| §8.1 RCI demand | In a shared region, demand is a single regional pool allocated between players by relative attractiveness (§25.6). |
| §8.7 Fire protection | Fire crosses borders; response comes from whoever has coverage; liability is defined in §25.6. |
| §11.7 Mayor rank | Rank no longer unlocks buildings in a shared region; unlocks belong to the room (§27.2). Rank remains personal recognition. |
| §12 Events and disasters | Disasters spread across borders and carry liability and optional regional aid. |
| §13 User interface | The HUD adds a player roster, a request inbox, a territory overlay toggle, a speed-vote indicator, an activity feed and a minimap. |
| §13.4 Camera | Four-angle snapped rotation is a **hard requirement**, not an optional affordance. It is the constraint that decides the art pipeline. |
| §14 Tool interaction | The request flow is a first-class tool interaction: select foreign property, describe, optionally offer compensation, send. |
| §16 Overlays | Adds **territory** and **contracts** overlays. |
| §17 Notifications | Adds request, ping, contract and player-presence notifications, all mutable. |
| §18 Simulation timing | In a shared region the clock is owned by the room: speed by vote, no global pause (§25.8). |
| §21 Save system | Adds room persistence with periodic checkpoints, and a build identifier in every save so that an outdated client cannot silently corrupt a region. |
| §22 MVP scope | The first playable version is **singleplayer**, as scoped in §22. The first multiplayer release adds Shared City, drop-in and demolition requests. Guided Campaign scenarios (§4.1) are post-v1, but their six engine hooks are built with the slices that own them (ruling 012). |

### 33.1 Further rulings (P8)

| Topic | Ruling |
|---|---|
| **Advisor tone** (§11.2) | Default persona **cheerful, optimistic to a fault** — relentlessly positive about a city that is on fire. Alternate personas planned: British sarcastic, German strict. Dialogue is keyed by persona from the first line, and persona is a client display preference that never reaches game state (ruling 010). |
| **Music** (§29) | Three ambience tracks. Sound on/off and volume adjustable, as separate master, effects, ambience and music controls. |
| **Localisation** (§30) | English and Norwegian from the first string. No user-facing text is ever written inline; key parity between catalogues is enforced by test (ruling 008). |
| **Room privacy** (§26.3) | A room is **private** — join code, with a QR representation for sharing to a phone — **or public**, open to anyone with the address. Public does not mean listed: there is no global directory at v1 (ruling 009). |
| **Communication** (§28) | Location pings, a set of standard commands (*remove*, *I'm working here*), and an **AFK status**. AFK is a player-state field shown in the roster, not a chat message, so it can gate request auto-policies. |
| **Derelict and absence** (§25.4, §25.7) | Both thresholds start at **5 city years**, era 0, for the sweep to challenge. |
| **Hosting** (§26) | Self-hosted and LAN only. Reachable by join code, direct address, or LAN discovery. A master index is a documented later addition with inert hooks in place (ruling 009). |
| **Map size on mobile** (§26.2) | The lobby **advises** a smaller region on a phone and warns above it, but never forbids — a phone must be able to join a large region someone else made, degrading rather than breaking (ruling 011). |
| **Shared City money** (§26.1) | Game option: one shared treasury, **or a fixed split of income** between seats. The split rule lives in `data/modes.json`. |
| **Art** (§3) | User-selectable style is a goal, so the render-style seam is a v1 requirement. Until the real art exists, every asset is a deliberately unfinished placeholder, and `specs/asset-list.md` is the generated brief for what needs drawing (ruling 013). |
