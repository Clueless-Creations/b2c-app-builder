# Let your agents cook

_The station ethos of B2C App Builder. Written by a founder who came up in restaurants before building app businesses._

B2C App Builder is the full layout of a kitchen that turns out consumer-app businesses, and the way that kitchen runs. Contributors build it. You are the executive chef, your agents are the brigade, and how you run service is yours.

## The station is the unit

A restaurant runs on stations. Garde manger, sauté, grill, fry, pastry, the pass, and beyond the kitchen door the host stand, the bar, the office. The menu changes every season. The stations stay. A chef who opens a new concept in the same room keeps most of the stations and changes what comes off them.

Consumer-app businesses have the same shape. Every one of them has to research a market, decide what it is, make it feel like something, build it, get through App Store review, price it, get found, measure what happens, stay legal, and run day after day. That list does not change with the app. Those are the stations.

Most app tooling works one level down, on the recipe. It helps you build a feature faster, ship a screen, wire a paywall. A feature is one dish at one station. B2C App Builder works at the level above. It is the layout of the whole kitchen and the way service moves across it, so you can hand the layout to your agents and let them cook.

## The stations

There are six stations and fourteen responsibilities between them. The pass belongs to the chef. Upkeep belongs to the contributors who build the kitchen.

| Station            | In the catalog                | What it owns                                                                                                                               |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **The pass**       | Operating System              | Running the launch. Driving the work. Tickets in, plates out, nothing leaves unchecked.                                                    |
| **Prep & design**  | Product and Experience        | Market research. What you're building. How the app feels. Look and feel. Every word a user reads. From menu planning to the plate.         |
| **The hot line**   | Build and Release             | Building the app. App Store and Google Play. Build, prove, sign, package, submit.                                                          |
| **Front of house** | Growth and Revenue            | Pricing and getting paid. Marketing and growth. Analytics and tracking. The register, the door, the covers count.                          |
| **The office**     | Business Operations and Trust | Running the business. Privacy, security, and legal. Founder access, accounts, licenses, the health-code binder. Menu planning starts here. |
| **Upkeep**         | Skill Maintenance             | The skill's own upkeep. Sharpen the knives, calibrate the ovens, keep the sources honest.                                                  |

## What the layout fixes, and what it leaves to you

The layout fixes four things.

- Which stations exist.
- What each station has to be able to produce, with acceptance criteria. In the catalog that is a capability.
- What counts as proof that a plate is right. That is evidence, an observation tied to a claim, an artifact, and an environment.
- How tickets move from the pass to a station and back. Those are work orders and gates.

The layout never decides what the restaurant is. It does not choose the opportunity, the product, the price, the brand, the pace of service, or who works which station. A provider swap does not redefine what an entitlement means. A different analytics tool does not redefine activation. You can run the default service, swap the purveyor at one station, or write your own way of running every station, and the same pass and the same proof apply.

## The executive chef

An executive chef does not cook every plate. They design the stations, set the standard, taste, and run the pass. That is the founder's job here.

Choose the market and the product. Set the bar, and the bar is a plate a customer would pay for on the first service. A star kitchen does not send out a basic version and fix it at the table. Decide how the brigade is set up. Hold the pass, so nothing ships until its evidence is accepted.

Everything else, the agents cook. Each agent owns a station and works from mise en place, the sourced knowledge loaded for that ticket, in bounded amounts, before the work starts. A cook on fry does not get to redefine what fry is for. An agent at the register does not get to redefine what a subscription is. Station discipline is what lets a brigade of agents move fast and stay trustworthy.

## Bring your own way to run a station

This is open source because one kitchen layout, run by many chefs, produces better technique than any single chef could, and the chefs who run it are the ones who should shape it. Contributors build the kitchen and the way it operates: the stations, the equipment, the pass, and the bar a plate has to clear. Most contributions do not add a station, because the stations are the things that are always true. They add ways to run them: a different purveyor at the register, a different creation loop, sharper knowledge at Prep & design, a stricter check at the pass. Same stations, different service.

A contribution earns its place by making a station more useful for the job. It passes the same contracts and the same tests as the first-party version, and it carries its provenance, so the next chef knows where the technique came from.

## Experiment at the business layer

Stable stations are what let you change everything above them and still compare. Open one restaurant and get it right. Open a second concept on the same stations, with a different product approach and comparable evidence. Then run the market experiment, several independent businesses on the same stations with the same books, and learn which service wins.

That is the mindset from The Founder. The McDonald brothers chalked their kitchen onto a tennis court and rehearsed the flow with the crew before they served a burger. They obsessed over the stations before the food, and the stations are what scaled. We want that discipline behind the pass and a three-star ambition on the plate.

## Stars

The guide whose stars every chef wants began as a tire company's free handout in 1900, printed so drivers would go further and wear out tires. Restaurants got their stars in 1926, and the guide became an institution on its own. A supplier of stations rating the restaurants that run on them has the same shape, and the same test of honesty. The stars are only worth something if the inspection is independent of the sale.

The path to stars is already half built. Today, every required piece of work stays pending until its evidence is accepted, and reviewers with fresh context audit the result. Tomorrow that becomes inspection. Judge the business as a customer meets it and as the books show it, blind to whether it ran the default service or a contributor's. When there are enough restaurants to rank, the best ones get stars.

## The vocabulary

| In the restaurant                        | In the catalog                                                   |
| ---------------------------------------- | ---------------------------------------------------------------- |
| The kitchen layout, and how service runs | B2C App Builder                                                  |
| The people who build the kitchen         | Contributors                                                     |
| A station                                | An area. Six today.                                              |
| What a station owns                      | A domain. Fourteen today.                                        |
| Menu planning                            | Market research. Starts in the office, finishes in Prep & design. |
| The equipment at a station               | A capability, with operation semantics and acceptance criteria   |
| A purveyor                               | A provider: RevenueCat, PostHog, App Store Connect, Resend       |
| How you run service                      | A recipe: a configurable creation or operating loop              |
| Mise en place                            | Knowledge, sourced and loaded in bounded amounts                 |
| A ticket                                 | A work order                                                     |
| The pass                                 | The orchestrator role and the gates                              |
| Tasting the plate                        | Evidence tied to a claim, an artifact, and an environment        |
| The health inspector                     | Validation and verification checks                               |
| The brigade                              | The fourteen roles, from research strategist to customer success |
| The executive chef                       | The founder                                                      |
| The cooks                                | The agents                                                       |
| The restaurant                           | A business workspace                                             |
| A second concept on the same stations    | The sibling business                                             |
| The guide                                | Stars for businesses built here. Not yet.                        |

## Kitchen-language boundary

Kitchen language explains how the product is organized. It is not a second ontology, a command family, or a way to grant authority.

| Term | Approved use | Boundary |
| --- | --- | --- |
| Kitchen | The overall system and layout in explanatory copy | Not the name of the Product and Experience station |
| Prep & design | Display label for the existing Product and Experience station | Does not rename its catalog ID or shrink research, product, copy, or design responsibilities |
| Station | Human explanation of an existing stable area of responsibility | Not a newly modeled worker, workflow, or every individual feature |
| Recipe | Existing selected arrangement of creation and operating work | Not another name for product truth, provider binding, or arbitrary source code |
| Brigade | Coordinated agents in prose | Not a new runtime entity, role hierarchy, or shipped product name |
| The pass | Explanation of coordination and acceptance | Not a new command, permission, universal success state, or claim that the founder reviews every artifact |
| Mise en place / purveyor / ticket | Optional supporting illustration with the literal term nearby | Technical surfaces continue to say knowledge, provider, and work order |

Actions such as approve, verify, publish, deploy, submit, release, revoke, delete, and recover stay literal. Credentials, permission, provider, operation, and evidence stay literal on technical surfaces. A metaphor never grants authority, performs acceptance, or hides an uncertain effect.

Good: `Review at the pass — evidence and approvals`. Bad: `Send it out` as the sole label for production deployment.

Good: `Purchase succeeded; entitlement verification failed. Resume verification without repeating the purchase.` Bad: `The plate got stuck at the pass.`

Good: a labeled station illustrating its existing capability. Bad: a new ontology class added solely to support a label.

Historical ADRs, quoted upstream notices, and recorded evidence are not rewritten to erase older wording.
