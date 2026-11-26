---
name: intake
description: Station 0 of Tachyon. One Claude Code session per client that turns a product (repo, live app, footage, operator answers) into clients/<name>/ — product.md, brand.md, audience.md, industry.md, strategy.md, funnel.md, competitors.yaml, profile.md, grants.yaml, assets/provenance.yaml — every number measured and dated. Use when onboarding a new client to Tachyon or re-running intake after a big product change.
---

# intake

Propose, do not interrogate. Read everything you can first, write complete drafts with
your assumptions marked `[assumed]`, and ask the operator one batched set of questions
at the end. The output is read at CP1 by the operator; nothing downstream runs before
they approve `industry.md`, `strategy.md`, `funnel.md` and `profile.md`.

## Inputs

1. The product: repo path, live URL, docs, analytics access. Read `CLAUDE.md`,
   `README`, progress or handoff notes, pricing/config files, data files, the public
   pages. Measure with commands (`wc`, `jq`, `curl`), not from prose.
2. Footage and brand assets the client already has, into `clients/<name>/assets/`.
3. The operator's answers to the batched questions below.
4. Vendored skills to run inside this session: `skills/vendor/ig-profile` (score the
   profile out of 100), the `marketing` plugin's `competitive-brief`, marketingskills
   `content-strategy` and `marketing-psychology` when installed.

## Outputs, in `clients/<name>/`

| File | Contents | Rule |
|---|---|---|
| `product.md` | the facts sheet: what it is, who for, price, the features that exist today, the numbers (counts, cadence, speed), the proof it may use | every number has a source and a date; this is the only thing the Factory may put on screen |
| `brand.md` | voice (the `data/voice.template.md` sections: how they talk on camera, words never said, positions, off-limits, proof it may use, allowed CTA forms), visual identity (colours, fonts, logo paths), banned words | copy the voice section to `~/.claude/instagram/voice.md` so the `ig-*` skills read it |
| `audience.md` | 2–3 personas, trigger states, verbatim pains from reviews / comments / support, the language pack (their words, not ours) | quote sources |
| `industry.md` | the industry study below | every line has a URL and a date; written before `strategy.md`, which must follow from it |
| `strategy.md` | the tension, the play, positioning, 4–6 pillars, cadence (3–5 reels/week), KPIs with targets, kill criteria, red lines from the client's own docs | one page |
| `funnel.md` | conversion events (which count as lead / sale), UTM scheme, link in bio, landing pages, analytics source | events must already fire or be flagged as a product ask |
| `competitors.yaml` | 6–12 professional Instagram accounts within ~10× our size: handle, why, size if known | `discovery.py` later reads their medians into `swipe.md` |
| `profile.md` | name field, bio, link, pinned three, highlights, grid: scored with `ig-profile` rubric, rewritten | operator applies by hand |
| `grants.yaml` | page_id, ig_user_id, token_env, ga4_property, blob_bucket; all autonomy flags false; `emergency_stop: false` | never a secret in the file |
| `assets/provenance.yaml` | one entry per file: source, licence, allowed use, date, `generative: true\|false` | QA fails any asset without an entry |

## Industry study (before `strategy.md`)

Research on the web and on Instagram; never from model memory. Each line cites a URL and
the date read; anything else is marked `[assumed]`. Write `industry.md` with these
sections, one page in total:

1. **Ecosystem.** How this kind of business makes money; who the customer buys from
   today; the players around the client (suppliers, marketplaces, review sites,
   associations, regulators, the creators and media the audience follows).
2. **Buying cycle and calendar.** What triggers a purchase, how long the decision takes,
   the seasons, events and dates the industry runs on.
3. **Rules.** Claims the law or the trade forbids (health, finance, before/after,
   prices, guarantees), licences that must be shown, Instagram's own policy for this
   category. These become red lines in `strategy.md`.
4. **Vocabulary.** The trade's terms, the customer's terms for the same things, and the
   words that mark an outsider.
5. **Video practice.** From the 20 best-performing reels of the `competitors.yaml`
   accounts (`/ig-viral`, ranked by how far each beat its own account): the formats that
   win (per format: hook type, length, who or what is on screen, audio, CTA, one
   permalink), the formats that are worn out, and what the audience attacks in comments.
6. **What we can make.** Per winning format: the raw material it needs (client footage,
   product or place shots, screen captures, code animation, generated clips), whether the
   client has it in `assets/`, and what the operator must ask the client to film. A
   format with no raw material is not planned.
7. **Open questions** for the operator's batched set.

`strategy.md` pillars each name the `industry.md` format they use. `swipe.md` keeps the
per-reel breakdowns; `industry.md` keeps only the patterns.

## Batched questions (ask once, at the end)

1. Which numbers may we show, and which are private?
2. Who is the on-camera voice: founder, brand, nobody (text only)?
3. Red lines: competitors we never name, data we never show, claims legal forbids.
4. Which CTA forms you want: link in bio, URL on screen, spot share link in a DM reply. (No links in comments: not clickable.) ("Comment for the link" is never offered.)
5. Ten accounts you would like to be visible to.
6. Posting window: the audience's timezone and the hours they are not at work.
7. What you can film or hand over: people, place, product, screens, and how often.

## Done when

`clients/<name>/` has all ten files, every line of `industry.md` has a source, `product.md` has zero unsourced numbers,
`profile.md` has a score and a rewrite, and the operator has a list of `[assumed]`
items to confirm at CP1.
