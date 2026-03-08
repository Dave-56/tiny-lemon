# Plan: Outfits as Single “Result” Experience + Regenerate with Custom Instructions

**Purpose:** Align Dress Model and Outfits so there’s one clear place to view, download, and refine generations. Get feedback before implementation.

**Status:** Revised draft (v2) — incorporates UX feedback on failed/in-progress states, custom direction guidance, regenerate failure handling, accessibility, and usage.

---

## 1. Goals

- **Single source of truth for results:** Outfits is the only place for “full view,” download, and any refinement (regenerate).
- **Clear roles:** Dress Model = create + quick check; Outfits = view, download, regenerate, custom instructions.
- **Better refinement:** Let users regenerate an outfit they don’t like and optionally add a note so we can improve the next run via the prompt.

---

## 2. Current vs Desired

| Area | Current | Desired |
|------|---------|---------|
| **Dress Model – output** | Small preview grid + full-screen lightbox (click to expand). “View in Outfits” link when done. | **Remove lightbox.** Keep only the small preview grid. Keep “View in Outfits” and copy that says full view/download/refine live there. |
| **Outfits – full view** | Full-screen lightbox for outfit images. | **No change.** Outfits lightbox remains the **only** full-screen view in the app. This reinforces the single source of truth. |
| **Outfits – actions** | Full view, download. No regenerate. | **Add Regenerate.** Optional **custom direction** in the Regenerate flow; we pass it into the generation prompt. |
| **Mental model** | Two places to “see full view” (Dress Model lightbox + Outfits). | One place: Outfits for full view, download, and regenerate. |

---

## 3. Scope

### 3.1 Dress Model (simplify)

- Remove the output image lightbox (click-to-full-screen).
- Output images stay as non-clickable preview cards (flat lay, front, three-quarter, back).
- Keep:
  - “View in Outfits →” (and “— full view and download”) for completed items.
  - “Generation in progress — view result in Outfits” for in-progress.
  - Empty state: “Output from this page is only shown until you leave or reload. Your previous generations are saved in Outfits” + “View Outfits →”.
- Optional copy tweak once Regenerate exists: e.g. “View in Outfits → — full view, download & regenerate.”

### 3.2 Outfits (add Regenerate + optional note)

**Who can Regenerate**

- **Completed** outfits: User didn’t like the result → Regenerate (with or without a note).
- **Failed** outfits: Same flow. User can Regenerate to retry (e.g. after a transient error). Same modal and backend behavior; copy can say “Try again” or “Regenerate” so it’s clear. Regenerate is available for both `completed` and `failed`; no separate “retry failed” flow.

**When Regenerate is not available**

- **In-progress** outfits: Disable or hide Regenerate until status is `completed` or `failed`. The outfit card should show a clear “Generating…” / “Processing…” state (skeleton, spinner, or disabled lightbox) so the list doesn’t look “done” until it is.

**Regenerate flow (modal)**

- User clicks Regenerate → modal/sheet with:
  - Short explanation: “Run generation again for this outfit.”
  - **Optional** field: “Add instructions for this run” with:
    - Placeholder: e.g. “e.g. Warmer lighting, less shadow”
    - One-line hint under the field: “Focus on lighting, background, or pose style for best results.”
    - **Soft length limit:** e.g. 200–300 characters; show character count so users know.
  - **Usage (if you have credits/limits):** One line in the modal: “This uses 1 generation from your plan” (or “Uses 1 credit”) so heavy refiners aren’t surprised. That’s enough for v1. A “View usage / limits” link in the modal is a nice future addition; no need to commit to it in this plan. Optional later: “First retry free” or similar.
  - Buttons: **Cancel** (secondary) and **Regenerate** (primary). Regenerate is the main action so keyboard and screen-reader users get the right hierarchy.
  - **Accessibility:** Focus trap inside the modal; Escape to close.

**During Regenerate**

- Keep the outfit card in place but show a clear “Regenerating…” state (same treatment as in-progress: skeleton/spinner, disabled lightbox, download, and Regenerate disabled) until the new run completes or fails.

**After Regenerate – success**

- Replace the outfit in place (same outfit record, new images). List stays manageable. For v1, replace-in-place is **all-or-nothing**: either the new run completes and you replace all images, or it fails and you keep the previous set. Partial success (e.g. only some angles updated) is out of scope; if the backend ever supports partial updates, that can be a separate product decision later.

**After Regenerate – failure**

- **Keep the images that were there before this Regenerate run.** Do not replace with a “failed” asset. Show an error (e.g. toast) and keep “Regenerate” / “Try again” available on the card so the user can retry. The card either shows the new result (on success) or the previous images + error + retry (on failure).

**Backend**

- Re-run the same generation inputs (from the outfit record: flat lay, back if any, model, style). If the user provided a note, merge it into the prompt (e.g. “User direction: {note}”). Regenerate should re-use the same inputs; the backend should support a “regenerate from outfit” path (e.g. task accepts `outfitId` + optional `userDirection`, loads outfit’s cleaned flat lays and stored params, runs generation). This avoids the client resending all inputs and keeps one source of truth.

### 3.3 Out of scope for this plan

- Changing how generation works under the hood (except adding the optional “user direction” to the prompt).
- Dress Model: no new features; only removal of lightbox and copy alignment.
- “Regenerate as new” or history of attempts (can add later if needed).

---

## 4. Product decisions (for consistency)

These are the chosen behaviors so implementation and feedback are aligned.

| Decision | Choice | Note |
|----------|--------|------|
| Regenerate on failed outfits | Yes, same flow as completed | One mental model: “run again (with or without a note).” |
| Replace in place vs new outfit | Replace in place | List stays manageable; optional “Regenerate as new” later. For v1, all-or-nothing: full replace on success, keep previous set on failure; no partial success. |
| On regenerate failure | Keep the images that were there before this Regenerate run; show error + retry | Card shows previous images, not a generic “failed” asset. No version history implied. |
| Custom direction – length | Soft limit (e.g. 200–300 chars) + counter | Keeps prompts manageable; show count in UI. |
| Custom direction – guidance | Placeholder + one-line hint | “Focus on lighting, background, or pose style for best results.” |
| Empty custom direction (no note) | Document in UI | If backend is deterministic: add one line in modal or help text, e.g. “Regenerating with no changes may produce a very similar result.” If backend injects a small variation, say so in the UI. Decide per product preference. |
| Full-screen view | Only in Outfits | Outfits lightbox remains the only full-screen view; Dress Model has no lightbox. |

---

## 5. UX checklist (for implementation and QA)

Use this to validate the revised plan once built.

**Dress Model**

- [ ] Output lightbox removed; only small preview grid remains.
- [ ] Preview cards are not clickable (no full-screen).
- [ ] “View in Outfits →” (and full view/download/regenerate copy) present for completed items.
- [ ] Empty state and in-progress copy unchanged.

**Outfits – list and card states**

- [ ] In-progress outfits: card shows “Generating…” / “Processing…” (skeleton or spinner); lightbox/actions disabled or clearly “waiting.”
- [ ] Regenerate visible and enabled only when status is `completed` or `failed`.
- [ ] During Regenerate: card shows “Regenerating…” and blocks lightbox, download, Regenerate until done.
- [ ] On regenerate failure: images that were there before this Regenerate run are kept; error shown (toast or inline); Regenerate / Try again available.

**Outfits – Regenerate modal**

- [ ] Trigger: “Regenerate” (or “Try again” for failed) opens modal.
- [ ] Failed outfits: primary action label is “Try again” or “Regenerate” — pick one and use it consistently in modal and on card.
- [ ] Optional “Add instructions” field with placeholder, hint, soft character limit, and count.
- [ ] Usage line present if app has credits/limits (“This uses 1 generation from your plan”).
- [ ] Buttons: Cancel (secondary), Regenerate (primary).
- [ ] Focus trap and Escape to close.
- [ ] One-line copy for “no note” behavior (deterministic vs variation) if decided.

**Outfits – full view**

- [ ] Existing lightbox remains the only full-screen view in the app.

---

## 6. UX Flows (for feedback)

**Flow A – Happy with preview (Dress Model)**  
1. User generates on Dress Model.  
2. Sees small preview.  
3. Clicks “View in Outfits →”.  
4. In Outfits: full view (lightbox), download as needed.

**Flow B – Not happy, want to refine (Outfits)**  
1. User is in Outfits, sees an outfit (completed).  
2. Clicks “Regenerate”.  
3. Optionally types a note (e.g. “More neutral background”).  
4. Clicks Regenerate in modal.  
5. Card shows “Regenerating…” then updates in place with new images (prompt included their note).

**Flow C – Not happy, no note**  
1. User clicks Regenerate.  
2. Leaves “Add instructions” empty.  
3. Clicks Regenerate.  
4. Same prompt as original run; new images (if backend allows variation). Modal or hint can set expectation: “May look very similar if nothing changes.”

**Flow D – Failed outfit, retry**  
1. User sees a failed outfit in Outfits.  
2. Clicks “Regenerate” or “Try again”.  
3. Same modal as B/C; optional note.  
4. Backend re-triggers with same (or updated) inputs; replace in place on success; on failure, keep the images that were there before this Regenerate run and show error + retry.

---

## 7. Phasing (optional)

- **Phase 1:** Remove lightbox from Dress Model + tighten copy (no backend changes).  
- **Phase 2:** Add Regenerate in Outfits (same inputs, no note).  
- **Phase 3:** Add optional “custom direction” field and wire it into the prompt.

Alternatively: Phase 1 + Phase 2 & 3 together if the team prefers shipping “Regenerate with optional note” in one go.

---

## 8. What We Want Feedback On (revised)

1. **Dress Model:** Confirmed to remove full-screen view and rely on small preview + “View in Outfits”? Any pushback?
2. **Regenerate on failed:** Is “same flow as completed” the right call, or do you want different copy/placement for failed?
3. **Custom direction:** Is 200–300 chars + the suggested hint enough, or do you want stricter limits or different guidance?
4. **Regenerate failure:** Keep previous images + error + retry — any edge case we’re missing (e.g. partial success)?
5. **Usage in modal:** Is “This uses 1 generation from your plan” sufficient, or do you want a link to billing/limits?
6. **Phasing:** Still prefer Phase 1 first, then 2+3, or ship remove-lightbox + Regenerate + note together?

---

## 9. Success (for later)

- Users naturally go to Outfits for full view and refinement (no confusion about “where do I regenerate?”).
- Regenerate + optional note is used and improves satisfaction when the first run isn’t perfect.
- Dress Model feels focused on “create + quick check”; Outfits feels like the place for “use and refine.”
- In-progress and failed states are clear; no card stuck in “Regenerating…” without a path to retry.

---

## 10. Implementation note (for when you build it)

Regenerate needs the same inputs the task uses. The **Outfit** record has fields such as `modelId`, `stylingDirectionId`, `cleanFlatLayUrl`, `cleanBackFlatLayUrl`; the task may currently be triggered with raw flat lay URLs, `modelImageUrl`, `modelHeight`, `modelGender`, `styleId`, etc. So either:

- **Option A:** Persist the extra inputs needed for a full re-run (e.g. `styleId`, `modelImageUrl`, or a snapshot of trigger payload) when you first create the outfit, and have Regenerate re-trigger the same task with those + optional user direction, or  
- **Option B:** Add a “regenerate” entry point to the task that takes `outfitId` and optional `userDirection`, loads the outfit’s cleaned flat lays and stored params, and runs the generation step (no re-clean). Option B avoids storing raw URLs and keeps one source of truth (cleaned flat lays) for regenerate.

The plan does not mandate A or B; the product requirement is: “Replace in place with same inputs + optional note.” The backend should support a regenerate-from-outfit path so the client does not have to resend all original inputs.

---

*Revised plan for feedback. Update after decisions and before implementation.*
