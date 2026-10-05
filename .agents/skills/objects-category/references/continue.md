# Add more to a category

“Another N” means N additional images, not N images in total. Reuse the category ID and preserve the existing style unless the user requests a change. Resuming failed/missing images is the ordinary `jobs` flow; extending a finished series requires new assignments.

Get a compact summary first:

```bash
npm run category:batch -- context shells
# If the previous batch has a different path:
npm run category:batch -- context shells media/batches/shells-031-060
```

The result includes the category, imported count, next unused number across catalogue and the specified manifest, and at most three examples with prompts when available. Read a few available example images to preserve style/composition. For a legacy category without generation metadata, use the catalogue examples and PNGs. Do not load the whole old category into the model context.

For 30 imported objects, create a fresh addition batch such as `media/batches/shells-031-060/collection.json`, containing only the 30 new records. Keep its `category.id`/`title` identical to the original. Start filenames at the returned `nextNumber`, zero-pad to at least three digits, and do not repeat old filenames. Prepare names/text/tags/prompts once, then follow the main skill's jobs/save flow. If this addition batch was interrupted, resume that same directory instead of recreating it.

If the previous completed series is still local and has not been imported, extend its manifest with new records in one programmatic JSON write, preserving all previous records and filenames. `jobs` skips its saved images; import the complete series without `--append`.

For an already imported category:

```bash
npm run category:batch -- import media/batches/shells-031-060 --append
```

The import merges new records at the end, keeps existing objects and category settings, and creates only new WebP previews. Repeating it is safe and adds no duplicates. It rejects changes to overlapping old IDs, so don't use it to replace an image or rewrite old public metadata.

Apply the main skill's checks and optional publication flow. Publication always uploads the full library, not just this addition batch. Report added count and new category total.
