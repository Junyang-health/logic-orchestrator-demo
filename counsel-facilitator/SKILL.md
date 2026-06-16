---
name: counsel-facilitator
description: Run a structured multi-person counsel session for hard decisions, strategy, product framing, investor narratives, risk reviews, or mindmap/plan improvement. Use when the user wants a council/boardroom of 4-8 personas, neutral facilitation, fact-finding, blind opinions, disagreement mapping, debate, ranked voting, final recommendations, meeting minutes, or optional edits to a plan/mindmap.
---

# Counsel Facilitator

Use this skill to execute a structured "Counsel" session: a neutral Host plus 4-8 personas work through a problem, ask factual questions, form independent views, surface disagreements, debate, vote, and produce a final recommendation.

The process is designed to avoid premature consensus. Preserve separation between phases, especially the blind-opinion phase.

## Inputs To Collect

- Problem draft: the user's initial question, goal, decision, or plan.
- Context: relevant notes, source excerpts, project material, current plan, or selected mindmap branch.
- Personas: 4-8 counsel members, each with `name` and `instruction`.
- Optional edit target: a plan, outline, mindmap, JSON graph, document section, or other artifact to revise after the session.
- Optional constraints: deadline, success criteria, risks, audience, budget, non-goals, evidence standard.

If the user has not provided personas, propose a balanced roster and ask for approval only when persona choice materially affects the result. Otherwise proceed with a sensible default mix: investor/economics, customer/product, technical/execution, skeptic/risk, operator/team, evidence/science. Add more only when useful.

## Workflow

### 1. Problem Clarification

Act as `Host`, a neutral facilitator.

Output either:

```json
{ "kind": "question", "message": "one focused follow-up question" }
```

or:

```json
{ "kind": "summary_ready", "message": "concise structured problem brief" }
```

Rules:

- Ask one focused follow-up at a time if goal, scope, constraints, or decision criteria are unclear.
- Once clear enough, produce a 3-8 point problem summary the user can edit.
- Stay neutral. Do not recommend a solution yet.
- The accepted summary becomes the shared brief for all later phases.

### 2. Fact-Finding By Persona

Each persona may ask up to 3 factual or clarifying questions.

For each persona, generate at most one question per turn:

```json
{ "question": "single concrete question" }
```

or:

```json
{ "question": null }
```

Rules:

- Ask from that persona's assigned lens and worldview.
- Do not repeat questions already asked by other personas.
- Questions should name a missing fact, tradeoff, constraint, metric, timeline, stakeholder, or decision criterion.
- No lecturing. Questions only.
- The user may skip remaining questions; carry existing answers forward.

Useful inquiry angles:

- Economics/investor: incentives, downside exposure, capital/time cost, thresholds.
- Product/design/customer: adoption friction, user experience, positioning, simplicity.
- Technical/AI/systems: architecture, bottlenecks, scale, assumptions, speed.
- Startup/growth: customer pain, wedge, distribution, traction, smallest test.
- Risk/skeptic: failure modes, contrary evidence, irreversibility, ruin risk.
- Evidence/science: definitions, causal mechanism, metrics, proof quality.
- Operator/team: ownership, process, stakeholder readiness, behavior change.
- Audience/content: attention, packaging, narrative, retention, measurable response.

### 3. Blind Opinions

Run a Nominal Group Technique style round. Each persona forms an independent opinion before seeing the others.

For each persona, output:

```json
{ "opinion": "3-8 sentence independent opinion in character" }
```

Rules:

- Include the accepted problem summary and fact-finding digest.
- Do not refer to other personas' likely views.
- Be substantive and in character.
- Keep each opinion self-contained.

### 4. Collision Mapping

As Host, compare the blind opinions and identify genuine tension areas.

Output:

```json
{
  "areas": [
    {
      "id": "area_1",
      "title": "short label",
      "positions": [
        {
          "persona_id": "exact persona id or name",
          "persona_label": "display name",
          "stance": "one sentence"
        }
      ]
    }
  ]
}
```

Rules:

- Produce at most 5 collision areas.
- Each area must reflect opposing or meaningfully divergent stakes.
- Fewer is better when disagreements are limited.
- Cite which personas align with which stance.

### 5. Open Debate

Debate one selected collision area at a time.

Each step should output:

```json
{
  "next_speaker": "exact persona name or Host",
  "utterance": "max 3 sentences; empty if passed",
  "passed": false,
  "off_track": false
}
```

Rules:

- The public transcript is visible to all.
- Host chooses the next speaker strategically.
- Host may intervene briefly, max 2 sentences.
- A persona may pass with `passed: true` and empty utterance.
- If the debate drifts, set `next_speaker` to `Host`, `off_track: true`, and correct course.
- Stop when positions are clear, not when everyone has repeated themselves.

### 6. Voting Options

After debate, Host turns each selected collision area into 1-2 actionable options.

Output:

```json
{
  "areas": [
    {
      "area_id": "area_1",
      "options": [
        { "id": "opt_area_1_1", "label": "short option text" }
      ]
    }
  ]
}
```

Rules:

- Every debated area gets 1-2 options.
- Options must be distinct and actionable.
- Use unique option ids.
- Do not create more than 2 options per area.

### 7. Ranked Voting

Simulate each persona ranking all options within each area.

Output:

```json
{
  "votes": [
    {
      "persona_id": "persona id or name",
      "rankings": [
        {
          "area_id": "area_1",
          "ranked_option_ids": ["best_option", "second_option"],
          "rationale": "one concise sentence"
        }
      ]
    }
  ]
}
```

Rules:

- Every persona votes exactly once.
- For each area, include every option id exactly once.
- No ties.
- Rationale must be one short sentence, tied to the persona's lens.
- Summarize winners by area after collecting votes.

### 8. Final Recommendation

Produce:

```json
{
  "recommendation": "executive summary",
  "discussion_summary": "what was debated and decided",
  "recommended_changes": "numbered list of edits/actions",
  "patch": {
    "update_nodes": [],
    "add_nodes": [],
    "add_edges": [],
    "remove_node_ids": []
  }
}
```

Rules:

- Ground the recommendation in the votes, but allow Host synthesis when votes split.
- Name the tradeoff being resolved.
- Include concrete next actions.
- If there is no artifact to edit, return an empty `patch` and make `recommended_changes` action-oriented.
- If editing a mindmap or graph, restrict patch operations to the selected branch/root unless the user explicitly allows wider changes.
- Do not remove nodes unless they are duplicates, obsolete, or directly contradicted by the conclusion.

## Optional Public-Figure Personas

If the user asks to create a persona from a real public figure:

- Use public, attributable sources when available.
- The persona instruction must be an approximate simulation for brainstorming, not a claim to be the real person.
- Ground voice, argument style, expertise themes, and recurring values only in public evidence.
- Be conservative where evidence is thin.
- Do not fabricate private facts.
- Do not imply medical, legal, financial, or other authority from the real person.

Persona instruction shape:

```text
You are an approximate brainstorming simulation inspired by public material about [Name], not the actual person. You prioritize...
```

Include voice, argument pattern, expertise themes, values, and limitations.

## Minutes Format

When the user wants a saved or sendable record, produce:

```markdown
# Counsel minutes: [keywords]

## Agreed problem
[accepted summary]

## Discussion summary
[debate and vote synthesis]

## Voting
[area winners, rankings, rationales]

## Recommendation
[final recommendation]

## Recommended changes
[numbered list]
```

## Quality Bar

- Preserve phase boundaries: clarify first, then facts, then blind opinions, then collisions, then debate, then vote, then synthesize.
- Avoid generic "pros and cons"; make each persona's lens do real work.
- Make disagreement legible before resolving it.
- Favor concrete metrics, thresholds, examples, and decision criteria over slogans.
- Keep the Host neutral until the final synthesis.
- Be concise enough that the user can act on the result.
