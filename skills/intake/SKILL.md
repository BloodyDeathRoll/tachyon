---
name: intake
description: Station 0 of Tachyon. One Claude Code session per client that turns a product (repo, live app, footage, operator answers) into clients/<name>/ — product.md, brand.md, audience.md, strategy.md, funnel.md, competitors.yaml, profile.md, grants.yaml, assets/provenance.yaml — every number measured and dated. Use when onboarding a new client to Tachyon or re-running intake after a big product change.
---

# intake

Propose, do not interrogate. Read everything you can first, write complete drafts with
your assumptions marked `[assumed]`, and ask the operator one batched set of questions
at the end. The output is read at CP1 by the operator; nothing downstream runs before
they approve `strategy.md`, `funnel.md` and `profile.md`.

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
| `brand.md` | voice (the `data/voice.template.md` sections: how they talk on camera, words never said, positions, off-limits, proof it may use, keyword CTA), visual identity (colours, fonts, logo paths), banned words | copy the voice section to `~/.claude/instagram/voice.md` so the `ig-*` skills read it |
| `audience.md` | 2–3 personas, trigger states, verbatim pains from reviews / comments / support, the language pack (their words, not ours) | quote sources |
| `strategy.md` | the tension, the play, positioning, 4–6 pillars, cadence (3–5 reels/week), KPIs with targets, kill criteria, red lines from the client's own docs | one page |
| `funnel.md` | conversion events (which count as lead / sale), UTM scheme, link in bio, landing pages, analytics source | events must already fire or be flagged as a product ask |
| `competitors.yaml` | 6–12 professional Instagram accounts within ~10× our size: handle, why, size if known | `discovery.py` later reads their medians into `swipe.md` |
| `profile.md` | name field, bio, link, pinned three, highlights, grid: scored with `ig-profile` rubric, rewritten | operator applies by hand |
| `grants.yaml` | page_id, ig_user_id, token_env, ga4_property, blob_bucket; all autonomy flags false; `emergency_stop: false` | never a secret in the file |
| `assets/provenance.yaml` | one entry per file: source, licence, allowed use, date, `generative: false` | QA fails any asset without an entry |

## Batched questions (ask once, at the end)

1. Which numbers may we show, and which are private?
2. Who is the on-camera voice: founder, brand, nobody (text only)?
3. Red lines: competitors we never name, data we never show, claims legal forbids.
4. The keyword CTA you are willing to fulfil by DM (what do they get, how fast)?
5. Ten accounts you would like to be visible to.
6. Posting window: the audience's timezone and the hours they are not at work.

## Done when

`clients/<name>/` has all nine files, `product.md` has zero unsourced numbers,
`profile.md` has a score and a rewrite, and the operator has a list of `[assumed]`
items to confirm at CP1.
