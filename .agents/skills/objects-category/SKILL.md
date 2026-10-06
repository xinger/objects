---
name: objects-category
description: Create, resume or extend a category of transparent PNG objects for this Objects repository, prepare titles/descriptions/tags in batches, and import WebP previews into its static catalogue. Use for generating a collection or adding more images to an existing one.
---

# Objects category

Work from the repository root. The main agent designs the series and imports it; image workers only generate and save assigned PNGs. Keep images and generation metadata under ignored `media/`, website metadata under `data/`.

## Prepare once

- Resolve category, style, quantity and output requirements from the request. Ask only for missing essentials. Default: one isolated object per PNG, genuine transparent background, complete subject with margins, no text or watermark. Respect requested exceptions; this workflow's save command requires transparency.
- Default to **3 workers; allow only 1, 2 or 3** as requested. Fewer pending images need fewer workers. Keep the main chat's model; workers use `gpt-6-luna`, reasoning `low`.
- Create `media/batches/<category-id>/collection.json` with this shape:

```json
{
  "category": { "id": "shells", "title": "Shells" },
  "objects": [{
    "filename": "001-nautilus.png",
    "title": "Nautilus shell",
    "description": "A spiral nautilus shell painted in watercolor.",
    "tags": ["shell", "nautilus", "watercolor"],
    "prompt": "Exactly one nautilus shell, watercolor illustration, complete shell centered with clear margins, genuine transparent background, no shadow, text or watermark."
  }]
}
```

Names: lowercase category slug; PNG filenames use at least three digits and a descriptive lowercase slug. Use English for all website metadata and prompts unless requested otherwise. Keep category titles short, preferably one word (for example Shells, Gems, Artifacts); the site displays labels in lowercase. Descriptions describe the object, not generator instructions. Choose distinct subjects; keep one shared style and composition in every self-contained prompt. Never infer scientific or historical certainty from generated imagery.

Write all metadata for a small series at once. For long/ongoing series prepare manageable chunks (about 20 objects), extending the manifest between worker runs; import once the requested series is complete. Never edit assignments while workers are active. An existing batch is resumed, not overwritten; inspect its manifest and status first.

For “add another N” to a finished category, read [continue.md](references/continue.md). It distinguishes additions from retrying missing images and provides the next filename number and style examples without loading the whole old manifest.

## Generate

```bash
npm run category:batch -- jobs media/batches/shells 3
```

This returns **only the current wave of job paths**: up to the requested number of workers, at most **10 images per job** (30 per wave with three workers), excluding saved PNGs. It also exports human-readable `prompts.txt`. Use those returned paths, not a directory glob of old jobs.

Read [worker.md](references/worker.md) only when dispatching generation. Start a **fresh agent for every job** with a unique task name, `fork_turns="none"`, `model="gpt-6-luna"`, `reasoning_effort="low"`. Give it only the repository path, its returned job path and the worker instructions. Never reuse a finished worker or send it another job: every worker stops after its one job, including failed attempts, so generation history cannot grow beyond ten image calls. Never run more than the requested number of workers or more than three simultaneously. With one worker, still use one Luna executor. If delegation is unavailable, execute the same jobs sequentially in the main agent and report that context isolation is unavailable.

Wait for all workers in the wave to finish before rewriting job files. If the wave succeeded, rerun `jobs` and dispatch the returned paths to new agents; repeat until no jobs remain. On failures, preserve successes and resolve or retry missing assignments in fresh agents before continuing; stop and report repeated failures instead of looping indefinitely. Keep only compact worker summaries in the main chat; do not carry previous generation outputs into new workers.

Workers use the built-in image generation tool, one call per object. Do not switch to a paid API/CLI path. Concurrent image-tool support and speed are unverified; on explicit concurrency/rate-limit failures finish active work, then retry missing jobs sequentially. Do not promise linear speedup or repeat successful images.

The per-image operation is one `save` command, not a metadata edit. Original generated output is retained. Check progress with:

```bash
npm run category:batch -- status media/batches/shells
```

Do not count failed/aborted generation as saved. After a stop, finish saving completed outputs and stop launching new images. On resumption `jobs` skips completed PNGs. Review results visually; correct only mismatched object metadata after workers finish. Avoid dumping whole manifests, base64, or repeated full logs into the main chat.

## Import and optional publication

```bash
npm run category:batch -- import media/batches/shells
npm test
npm run check
npm run build
```

Import validates completeness/transparency, preserves original bytes and explicit text, makes WebP previews and appends the category. For an already imported category use `import <batch> --append`: it adds only new objects, preserves old records/URLs and refuses replacement of an existing PNG or metadata. Only new previews are generated. Both modes check the complete local `media/library` against the catalogue and asset quotas. Do not use the older all-category `images:import` command for this workflow.

When publication is requested, upload the **entire library** first:

```bash
npm run images:deploy -- media/library/originals media/library/previews
```

Only after both uploads succeed, commit intended code/metadata changes and push `main` using the established Git deployment. Verify the resulting category, preview and original download on `objects.xinger.net`. Never deploy just the new category: asset deployment replaces the full snapshot. Missing old local files must be restored before deployment. No R2 or paid plan changes.

Otherwise finish with local output paths and saved count. Briefly report failures, whether imported/published, and a few representative images; don't claim indexing or successful deployment without checking.
